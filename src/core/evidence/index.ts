import {
  CSV_DIALECT_VERSION,
  EVIDENCE_SCHEMA_VERSION,
  NORMALIZED_ROWS_VERSION,
  SNAPSHOT_SCHEMA_VERSION,
  type AuditSummary,
  type Claim,
  type ClaimSpec,
  type ClaimStatus,
  type DatasetVersion,
  type DecisionSpec,
  type EvidenceCompleteness,
  type ExternalSourceProvenance,
  type ReviewRecord,
  type Rule,
  type SnapshotSide,
  type SourceReference,
  type UpstreamLineage,
} from "../types";
import { isThresholdConfirmed, stabilityReversalIsGoverned, thresholdSpecForRule } from "../claim-spec";
import { alignParsedCsvColumns, base64ToBuffer, buildSnapshotManifest, bytesToBase64, canonicalizeRows, decodeBuffer, isSnapshotVerified, parseCSV, sha256Hex, sha256Text, validatePrimaryKey, valueToNumber } from "../snapshot";
import { compareRows, diffRowsByKey } from "../statistics";
import { completeEvidence, recomputeClaim } from "../validation";
import { evaluateDecision } from "../decision";
import { applyReviewToClaim, applyReviewToDecision, enforceDecisionReleaseDependencies, verifyReviewChain } from "../governance";
import { canonicalJson, jsonClone, sha256Canonical } from "../integrity";
import { externalCleaningBindingError, rebuildExternalSnapshot } from "../external-source";

const MAX_EXPORTED_DIFFS = 500;
export const MAX_RAW_BYTES_PER_SNAPSHOT = 500_000;
const PREVIEW_ROWS = 20;

function snapshotMeta(dataset: DatasetVersion, side: SnapshotSide) {
  return side === "baseline" ? dataset.baselineMeta : dataset.currentMeta;
}

function snapshotRows(dataset: DatasetVersion, side: SnapshotSide) {
  return side === "baseline" ? dataset.baselineRows : dataset.currentRows ?? [];
}

function snapshotLines(dataset: DatasetVersion, side: SnapshotSide) {
  return side === "baseline" ? dataset.baselineLineNumbers : dataset.currentLineNumbers ?? [];
}

function thresholdProvenancePasses(rule: Rule | undefined, claim: Claim) {
  if (!rule || rule.type === "rank") return Boolean(rule);
  const spec = thresholdSpecForRule(rule);
  const expected = rule.type === "threshold" ? rule.threshold : rule.supportTolerance;
  const supportConfirmed = isThresholdConfirmed(spec) && Math.abs((spec?.value ?? Number.NaN) - expected) < 1e-9;
  if (!supportConfirmed) return false;
  if (rule.type === "stability" && ["WEAKENED", "REVERSED"].includes(claim.status)) return stabilityReversalIsGoverned(rule);
  if (rule.type === "stability" && claim.status === "REVIEW_REQUIRED" && claim.reason.includes("reversal threshold is not independently confirmed")) return false;
  return true;
}

export function computeEvidenceCompleteness(claim: Claim, dataset: DatasetVersion): EvidenceCompleteness {
  const evidence = completeEvidence(claim, dataset);
  const fields = claim.rule ? [claim.rule.field, ...(claim.rule.type === "rank" ? [claim.rule.groupField] : [])] : [];
  const expectedSides: SnapshotSide[] = dataset.currentRows ? ["baseline", "current"] : ["baseline"];
  const referenceMatchesRow = (ref: SourceReference) => {
    const rows = snapshotRows(dataset, ref.snapshot);
    const lines = snapshotLines(dataset, ref.snapshot);
    const rowIndex = lines.indexOf(ref.lineNumber);
    return rowIndex >= 0 && String(rows[rowIndex]?.[dataset.primaryKey] ?? "") === ref.keyValue && ref.keyField === dataset.primaryKey;
  };
  const referenceMatchesSnapshot = (ref: SourceReference) => {
    const meta = snapshotMeta(dataset, ref.snapshot);
    return Boolean(meta) && ref.fileName === meta?.fileName && ref.sha256 === meta?.sha256;
  };
  const sideReferenceCounts = Object.fromEntries(expectedSides.map((side) => [side, claim.sourceRefs.filter((ref) => ref.snapshot === side).length])) as Record<SnapshotSide, number>;
  const scopeSidesMatch = Boolean(claim.evidenceScope)
    && expectedSides.every((side) => claim.evidenceScope?.sides[side]?.exportedReferences === sideReferenceCounts[side])
    && expectedSides.every((side) => {
      const scope = claim.evidenceScope?.sides[side];
      return Boolean(scope)
        && (scope?.pairedChangedReferences ?? 0) <= (scope?.exportedReferences ?? 0)
        && (scope?.unpairedChangedReferences ?? 0) <= (scope?.exportedReferences ?? 0)
        && (scope?.boundaryReferences ?? 0) <= (scope?.exportedReferences ?? 0)
        && (scope?.sampledReferences ?? 0) <= (scope?.exportedReferences ?? 0)
        && (!dataset.currentRows || (scope?.pairedChangedReferences ?? 0) === (claim.evidenceScope?.pairedChangedKeys ?? 0));
    });
  const pairedKeys = claim.evidenceScope?.pairedChangedKeys ?? 0;
  const baselineKeys = new Set(claim.sourceRefs.filter((ref) => ref.snapshot === "baseline").map((ref) => ref.keyValue));
  const currentKeys = new Set(claim.sourceRefs.filter((ref) => ref.snapshot === "current").map((ref) => ref.keyValue));
  const exportedPairs = [...baselineKeys].filter((key) => currentKeys.has(key)).length;
  const checks: Array<[string, boolean]> = [
    ["Claim text", Boolean(claim.title.trim())],
    ["Stable result binding", Boolean(claim.resultId) && evidence.some((node) => node.kind === "Comparison result" && node.id === claim.resultId && node.bound)],
    ["Executable rule", Boolean(claim.rule)],
    ["Threshold provenance and confirmation", thresholdProvenancePasses(claim.rule, claim)],
    ["Rule version", claim.audit.ruleVersion === dataset.ruleVersion],
    ["Fields present", fields.length > 0 && fields.every((field) => dataset.columns.includes(field))],
    ["Valid primary key", expectedSides.every((side) => validatePrimaryKey(snapshotRows(dataset, side), snapshotLines(dataset, side), dataset.primaryKey).valid)],
    ["Evidence extraction scope", Boolean(claim.evidenceScope) && claim.evidenceScope?.exportedReferences === claim.sourceRefs.length && (claim.evidenceScope?.matchingRows ?? 0) >= claim.sourceRefs.length && scopeSidesMatch],
    ["Both versions referenced", expectedSides.every((side) => sideReferenceCounts[side] > 0)],
    ["Changed records paired", !dataset.currentRows || pairedKeys === 0 || exportedPairs >= pairedKeys],
    ["Source records", claim.sourceRefs.length > 0 && claim.sourceRefs.every(referenceMatchesRow)],
    ["Exact line numbers", claim.sourceRefs.length > 0 && claim.sourceRefs.every((ref) => ref.lineNumber >= 2 && snapshotLines(dataset, ref.snapshot).includes(ref.lineNumber))],
    ["Primary-key references", claim.sourceRefs.length > 0 && claim.sourceRefs.every((ref) => ref.keyField === dataset.primaryKey && Boolean(ref.keyValue))],
    ["File hashes reverified", expectedSides.every((side) => isSnapshotVerified(dataset, side)) && claim.sourceRefs.every((ref) => /^[a-f0-9]{64}$/i.test(ref.sha256) && referenceMatchesSnapshot(ref))],
    ["Generation timestamps", expectedSides.every((side) => Number.isFinite(Date.parse(snapshotMeta(dataset, side)?.generatedAt ?? "")))],
    ["Calculation expression", Boolean(claim.formula.trim())],
  ];
  const missing = checks.filter(([, passed]) => !passed).map(([label]) => label);
  const passed = checks.length - missing.length;
  return { score: Math.round((passed / checks.length) * 100), passed, total: checks.length, missing };
}

export function auditSummary(claims: Claim[], dataset: DatasetVersion): AuditSummary {
  const counts = claims.reduce(
    (result, claim) => ({ ...result, [claim.status]: result[claim.status] + 1 }),
    { SUPPORTED: 0, WEAKENED: 0, REVERSED: 0, UNTESTABLE: 0, REVIEW_REQUIRED: 0 } as Record<ClaimStatus, number>,
  );
  const completeness = claims.map((claim) => computeEvidenceCompleteness(claim, dataset));
  const completenessChecksPassed = completeness.reduce((total, result) => total + result.passed, 0);
  const completenessChecksTotal = completeness.reduce((total, result) => total + result.total, 0);
  const coverage = completenessChecksTotal
    ? Math.round((completenessChecksPassed / completenessChecksTotal) * 100)
    : 0;
  return {
    total: claims.length,
    supported: counts.SUPPORTED,
    weakened: counts.WEAKENED,
    reversed: counts.REVERSED,
    untestable: counts.UNTESTABLE,
    reviewRequired: counts.REVIEW_REQUIRED,
    completenessChecksPassed,
    completenessChecksTotal,
    evidenceCoverage: coverage,
    changedRecords: compareRows(dataset),
  };
}

export function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (char) => {
    const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" };
    return map[char];
  });
}

function rawPayload(dataset: DatasetVersion, side: SnapshotSide) {
  const rawText = side === "baseline" ? dataset.baselineRawText : dataset.currentRawText;
  const rawBytesBase64 = side === "baseline" ? dataset.baselineRawBytesBase64 : dataset.currentRawBytesBase64;
  const meta = snapshotMeta(dataset, side);
  if ((!rawText && !rawBytesBase64) || !meta || meta.byteSize > MAX_RAW_BYTES_PER_SNAPSHOT) return null;
  return { fileName: meta.fileName, sha256: meta.sha256, normalizedSha256: meta.normalizedSha256, text: rawText, rawBytesBase64 };
}

function claimSpecFromClaim(claim: Claim): ClaimSpec {
  return {
    id: claim.id,
    code: claim.code,
    title: claim.title,
    section: claim.section,
    owner: claim.owner,
    category: claim.category,
    formula: claim.formula,
    rule: claim.rule,
    decisionIds: claim.decisionIds,
  };
}

function claimSeed(spec: ClaimSpec, dataset: DatasetVersion, generatedAt: string): Claim {
  return {
    ...spec,
    kind: spec.rule?.type === "stability" ? "VERSION_COMPARISON" : "SNAPSHOT",
    status: "REVIEW_REQUIRED",
    baselineStatus: "UNTESTABLE",
    baselineValue: "Computing",
    currentValue: "Computing",
    reason: "",
    action: "",
    sourceRefs: [],
    evidence: [],
    governance: { engineStatus: "REVIEW_REQUIRED", reviewDisposition: "PENDING", releaseStatus: "BLOCKED" },
    audit: {
      ruleVersion: dataset.ruleVersion,
      lastRunAt: generatedAt,
      baselineSha256: dataset.baselineMeta.sha256,
      currentSha256: dataset.currentMeta?.sha256,
      preliminary: false,
    },
  };
}

async function recomputeGovernedState(
  dataset: DatasetVersion,
  claimSpecs: ClaimSpec[],
  decisionSpecs: DecisionSpec[],
  reviews: ReviewRecord[],
  generatedAt: string,
) {
  const reviewChain = await verifyReviewChain(reviews);
  if (!reviewChain.valid) throw new Error(`Invalid review chain: ${reviewChain.errors.join("; ")}`);
  const claims = claimSpecs.map((spec) => recomputeClaim(claimSeed(spec, dataset, generatedAt), dataset, generatedAt));
  const decisions = decisionSpecs.map((spec) => evaluateDecision(spec, claims));
  for (const review of reviews) {
    if (review.claimId) {
      const index = claims.findIndex((claim) => claim.id === review.claimId);
      if (index < 0) throw new Error(`${review.id}: bound claim does not exist`);
      claims[index] = await applyReviewToClaim(claims[index], review);
    } else if (review.decisionId) {
      const index = decisions.findIndex((decision) => decision.decisionId === review.decisionId);
      if (index < 0) throw new Error(`${review.id}: bound decision does not exist`);
      decisions[index] = await applyReviewToDecision(decisions[index], review, claims);
    } else {
      throw new Error(`${review.id}: no claim or decision is bound`);
    }
  }
  return { claims, decisions: decisions.map((decision) => enforceDecisionReleaseDependencies(decision, claims)), reviewChain };
}

function evidenceSections(dataset: DatasetVersion, claims: Claim[]) {
  const allDiffs = diffRowsByKey(dataset).filter((diff) => diff.kind !== "unchanged");
  return {
    snapshots: { baseline: buildSnapshotManifest(dataset, "baseline"), current: buildSnapshotManifest(dataset, "current") },
    snapshotPayloads: { baseline: rawPayload(dataset, "baseline"), current: rawPayload(dataset, "current") },
    summary: auditSummary(claims, dataset),
    diffSummary: {
      totalChanged: allDiffs.length,
      exported: Math.min(allDiffs.length, MAX_EXPORTED_DIFFS),
      truncated: allDiffs.length > MAX_EXPORTED_DIFFS,
      limit: MAX_EXPORTED_DIFFS,
    },
    diffs: allDiffs.slice(0, MAX_EXPORTED_DIFFS),
    queryTrace: claims.map((claim) => ({
      claimId: claim.id,
      filters: claim.rule?.filters ?? [],
      excludes: claim.rule?.excludes ?? [],
      aggregation: claim.rule?.aggregation ?? null,
      field: claim.rule?.field ?? null,
      sampleProfiles: claim.sampleProfiles ?? null,
      evidenceScope: claim.evidenceScope ?? null,
    })),
    dataPreview: {
      columns: dataset.columns,
      baselineRows: dataset.baselineRows.slice(0, PREVIEW_ROWS),
      currentRows: dataset.currentRows?.slice(0, PREVIEW_ROWS) ?? null,
      previewLimit: PREVIEW_ROWS,
    },
    scaleBoundary: {
      maxExportedDiffs: MAX_EXPORTED_DIFFS,
      maxRawBytesPerSnapshot: MAX_RAW_BYTES_PER_SNAPSHOT,
      maxReferencesPerClaim: 200,
      note: "Above the size limits, preserve hashes, manifests, changed records, and required samples instead of copying full tables.",
    },
  };
}

async function buildAuditBundlePayload(
  dataset: DatasetVersion,
  claimSpecs: ClaimSpec[],
  decisionSpecs: DecisionSpec[],
  reviews: ReviewRecord[],
  generatedAt: string,
  previousBundleHash: string | null,
) {
  const state = await recomputeGovernedState(dataset, claimSpecs, decisionSpecs, reviews, generatedAt);
  const evidence = evidenceSections(dataset, state.claims);
  return jsonClone({
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    bundleType: "AuditBundle" as const,
    generatedAt,
    previousBundleHash,
    project: dataset.projectName,
    primaryKey: dataset.primaryKey,
    ruleVersion: dataset.ruleVersion,
    isDemo: dataset.isDemo,
    dataOrigin: dataset.dataOrigin ?? (dataset.isDemo ? "SYNTHETIC" : "USER"),
    ...evidence,
    claimSpecs,
    claimResults: state.claims.map((claim) => ({ ...claim, evidenceCompleteness: computeEvidenceCompleteness(claim, dataset) })),
    decisionSpecs,
    decisionResults: state.decisions,
    reviews,
    reviewChain: {
      count: reviews.length,
      headRecordId: state.reviewChain.headRecordId,
      headRecordHash: state.reviewChain.headRecordHash,
    },
    externalSource: dataset.externalSource ?? null,
    upstreamLineage: dataset.upstreamLineage ?? null,
  });
}

export async function createAuditBundle(
  dataset: DatasetVersion,
  claims: Claim[],
  generatedAt: string,
  options: { decisionSpecs?: DecisionSpec[]; reviews?: ReviewRecord[]; previousBundleHash?: string | null } = {},
) {
  const claimSpecs = claims.map(claimSpecFromClaim);
  const previousBundleHash = options.previousBundleHash ?? null;
  if (previousBundleHash !== null && !/^[a-f0-9]{64}$/i.test(previousBundleHash)) throw new Error("The previous AuditBundle root hash must be a SHA-256 value");
  const payload = await buildAuditBundlePayload(dataset, claimSpecs, options.decisionSpecs ?? [], options.reviews ?? [], generatedAt, previousBundleHash);
  const sectionHashes = {
    chain: await sha256Canonical({ previousBundleHash: payload.previousBundleHash }),
    snapshots: await sha256Canonical({ snapshots: payload.snapshots, snapshotPayloads: payload.snapshotPayloads }),
    claims: await sha256Canonical({ claimSpecs: payload.claimSpecs, claimResults: payload.claimResults }),
    decisions: await sha256Canonical({ decisionSpecs: payload.decisionSpecs, decisionResults: payload.decisionResults }),
    reviews: await sha256Canonical({ reviews: payload.reviews, reviewChain: payload.reviewChain }),
    provenance: await sha256Canonical(payload.externalSource),
    upstream: await sha256Canonical(payload.upstreamLineage),
  };
  return {
    ...payload,
    integrity: {
      algorithm: "SHA-256" as const,
      canonicalization: "claimtrace-json-c14n/1.0.0" as const,
      payloadHash: await sha256Canonical(payload),
      sectionHashes,
    },
  };
}

export function createEvidencePackage(
  dataset: DatasetVersion,
  claims: Claim[],
  generatedAt: string,
  options: { decisionSpecs?: DecisionSpec[]; reviews?: ReviewRecord[]; previousBundleHash?: string | null } = {},
) {
  return createAuditBundle(dataset, claims, generatedAt, options);
}

export type AuditBundle = Awaited<ReturnType<typeof createAuditBundle>>;

async function datasetFromBundle(pkg: AuditBundle) {
  const errors: string[] = [];
  const parseSide = async (side: SnapshotSide) => {
    const manifest = pkg.snapshots[side];
    const payload = pkg.snapshotPayloads[side];
    if (!manifest) {
      if (payload) errors.push(`${side}: snapshot payload exists but its manifest is missing`);
      return null;
    }
    if (!payload) {
      errors.push(`${side}: raw snapshot was omitted because of the size limit and cannot be independently recomputed`);
      return null;
    }
    try {
      if (manifest.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) errors.push(`${side}: snapshot schema version is invalid`);
      if (manifest.csvDialectVersion !== CSV_DIALECT_VERSION) errors.push(`${side}: CSV dialect version is invalid`);
      if (manifest.normalizationVersion !== NORMALIZED_ROWS_VERSION) errors.push(`${side}: normalized-row version is invalid`);
      if (side === "current" && pkg.snapshots.baseline && canonicalJson(manifest.columns) !== canonicalJson(pkg.snapshots.baseline.columns)) {
        errors.push("current: canonical column order does not match the baseline manifest");
      }
      const rawBuffer = payload.rawBytesBase64 ? base64ToBuffer(payload.rawBytesBase64) : new TextEncoder().encode(payload.text ?? "").buffer as ArrayBuffer;
      const decodedText = payload.rawBytesBase64 ? decodeBuffer(rawBuffer) : payload.text ?? "";
      const rawHash = await sha256Hex(rawBuffer);
      if (rawHash !== manifest.sha256 || payload.sha256 !== manifest.sha256) errors.push(`${side}: raw-file SHA-256 mismatch`);
      if (rawBuffer.byteLength !== manifest.byteSize) errors.push(`${side}: raw byte count mismatch`);
      if (payload.fileName !== manifest.fileName) errors.push(`${side}: file name mismatch`);
      if (payload.rawBytesBase64 && payload.text !== undefined && payload.text !== decodedText) errors.push(`${side}: raw bytes and decoded text do not match`);
      const parsed = alignParsedCsvColumns(parseCSV(decodedText), manifest.columns);
      const normalizedHash = await sha256Text(canonicalizeRows(manifest.columns, parsed.rows));
      if (manifest.normalizedSha256 && normalizedHash !== manifest.normalizedSha256) errors.push(`${side}: normalized-record SHA-256 mismatch`);
      if (parsed.rows.length !== manifest.rowCount) errors.push(`${side}: row count mismatch`);
      if (manifest.primaryKey !== pkg.primaryKey || !validatePrimaryKey(parsed.rows, parsed.lineNumbers, pkg.primaryKey).valid) errors.push(`${side}: unique primary-key validation failed`);
      return { manifest, payload, parsed, decodedText, rawBytesBase64: payload.rawBytesBase64 ?? bytesToBase64(rawBuffer), normalizedHash };
    } catch (error) {
      errors.push(`${side}: ${error instanceof Error ? error.message : "CSV could not be parsed"}`);
      return null;
    }
  };
  const baseline = await parseSide("baseline");
  const current = await parseSide("current");
  if (!baseline) return { dataset: null, errors };
  if (pkg.snapshots.current && !current) return { dataset: null, errors };
  const meta = (item: NonNullable<typeof baseline>) => ({
    fileName: item.manifest.fileName,
    sha256: item.manifest.sha256,
    normalizedSha256: item.manifest.normalizedSha256,
    hashVerified: true,
    verification: {
      status: "verified" as const,
      method: "raw-bytes+normalized-rows" as const,
      verifiedAt: item.manifest.verifiedAt ?? pkg.generatedAt,
      recomputedSha256: item.manifest.sha256,
      recomputedNormalizedSha256: item.normalizedHash,
    },
    generatedAt: item.manifest.generatedAt,
    rowCount: item.manifest.rowCount,
    byteSize: item.manifest.byteSize,
    encoding: "utf-8" as const,
    mediaType: "text/csv" as const,
  });
  const dataset: DatasetVersion = {
    projectName: pkg.project,
    baselineName: `Baseline · ${baseline.manifest.fileName}`,
    currentName: current ? `Current · ${current.manifest.fileName}` : undefined,
    baselineRows: baseline.parsed.rows,
    currentRows: current?.parsed.rows,
    baselineLineNumbers: baseline.parsed.lineNumbers,
    currentLineNumbers: current?.parsed.lineNumbers,
    baselineMeta: meta(baseline),
    currentMeta: current ? meta(current) : undefined,
    baselineRawText: baseline.decodedText,
    currentRawText: current?.decodedText,
    baselineRawBytesBase64: baseline.rawBytesBase64,
    currentRawBytesBase64: current?.rawBytesBase64,
    columns: baseline.parsed.columns,
    primaryKey: pkg.primaryKey,
    ruleVersion: pkg.ruleVersion,
    isDemo: pkg.isDemo,
    dataOrigin: pkg.dataOrigin,
    externalSource: pkg.externalSource ?? undefined,
    upstreamLineage: pkg.upstreamLineage ?? undefined,
  };
  return { dataset, errors };
}

function measure(rows: Array<Record<string, string | number>>, spec: { operation: "sum" | "count"; field?: string }) {
  if (spec.operation === "count") return rows.length;
  const field = spec.field;
  if (!field) return null;
  const values = rows.map((row) => valueToNumber(row[field]));
  if (values.some((value) => value === null)) return null;
  return values.reduce<number>((total, value) => total + (value ?? 0), 0);
}

async function verifyUpstreamLineage(dataset: DatasetVersion, lineage: UpstreamLineage | null, claims: Claim[]) {
  if (!lineage) return { applicable: false, valid: true, errors: [] as string[] };
  const errors: string[] = [];
  const sources = new Map<string, { source: UpstreamLineage["sources"][number]; rows: Array<Record<string, string | number>> }>();
  for (const source of lineage.sources) {
    try {
      const rawBuffer = source.rawBytesBase64 ? base64ToBuffer(source.rawBytesBase64) : new TextEncoder().encode(source.rawText).buffer as ArrayBuffer;
      const decoded = source.rawBytesBase64 ? decodeBuffer(rawBuffer) : source.rawText;
      if (decoded !== source.rawText) errors.push(`${source.id}: raw bytes and text do not match`);
      if (await sha256Hex(rawBuffer) !== source.sha256) errors.push(`${source.id}: upstream SHA-256 mismatch`);
      if (rawBuffer.byteLength !== source.byteSize) errors.push(`${source.id}: upstream byte count mismatch`);
      const parsed = parseCSV(decoded);
      if (parsed.rows.length !== source.rowCount) errors.push(`${source.id}: upstream row count mismatch`);
      if (!validatePrimaryKey(parsed.rows, parsed.lineNumbers, source.primaryKey).valid) errors.push(`${source.id}: upstream primary key is invalid`);
      sources.set(source.id, { source, rows: parsed.rows });
    } catch (error) {
      errors.push(`${source.id}: ${error instanceof Error ? error.message : "upstream snapshot could not be parsed"}`);
    }
  }
  const derivedKeys = new Set<string>();
  for (const aggregation of lineage.aggregations) {
    const source = sources.get(aggregation.sourceId);
    if (!source) {
      errors.push(`${aggregation.id}: upstream source does not exist`);
      continue;
    }
    const filtered = source.rows.filter((row) => aggregation.filters.every((filter) => String(row[filter.field] ?? "") === String(filter.equals)));
    const numerator = measure(filtered, aggregation.numerator);
    const denominator = measure(filtered, aggregation.denominator);
    const rows = aggregation.side === "baseline" ? dataset.baselineRows : dataset.currentRows ?? [];
    const summary = rows.find((row) => String(row[dataset.primaryKey]) === aggregation.summaryKey);
    const expected = numerator === null || denominator === null || denominator === 0
      ? null
      : Number(((numerator / denominator) * aggregation.multiplier).toFixed(aggregation.roundDigits));
    if (!summary || expected === null || Math.abs((valueToNumber(summary.value) ?? Number.NaN) - expected) > 1e-9) errors.push(`${aggregation.id}: upstream aggregation could not reproduce the summary value`);
    if (filtered.length !== aggregation.sourceRowCount) errors.push(`${aggregation.id}: upstream denominator row count mismatch`);
    const keys = filtered.map((row) => String(row[source.source.primaryKey] ?? "")).sort();
    if (await sha256Canonical(keys) !== aggregation.sourceKeysHash) errors.push(`${aggregation.id}: upstream record-set hash mismatch`);
    if (!aggregation.formulaVersion.trim()) errors.push(`${aggregation.id}: aggregation rule version is missing`);
    derivedKeys.add(`${aggregation.side}:${aggregation.summaryKey}`);
  }
  for (const reference of claims.flatMap((claim) => claim.sourceRefs)) {
    if (!derivedKeys.has(`${reference.snapshot}:${reference.keyValue}`)) errors.push(`${reference.snapshot}:${reference.keyValue}: upstream aggregation chain from raw records to the summary row is missing`);
  }
  return { applicable: true, valid: errors.length === 0, errors };
}

async function verifyExternalSourceLineage(dataset: DatasetVersion, provenance: ExternalSourceProvenance | null) {
  const errors: string[] = [];
  const required = dataset.dataOrigin === "PUBLIC";
  if (!provenance) return { applicable: required, valid: !required, errors: required ? ["Public-data case is missing external-source and cleaning lineage"] : errors };
  if (provenance.schemaVersion !== "claimtrace-external-source/2.0.0") errors.push("External-source schema is invalid");
  if (!Number.isFinite(Date.parse(provenance.retrievedAt))) errors.push("External-data retrieval time is invalid");
  if (!provenance.license.trim() || !/^https:\/\//.test(provenance.licenseUrl)) errors.push("External-data license statement is incomplete");
  if (!provenance.attribution.trim() || !provenance.publisher.trim() || !provenance.dataset.trim() || !provenance.measure.id.trim() || !provenance.measure.name.trim()) errors.push("External-data attribution, dataset, or measure information is missing");
  if (!/^https:\/\//.test(provenance.sourceUrls.baseline) || !/^https:\/\//.test(provenance.sourceUrls.current)) errors.push("External source URLs must use HTTPS");
  if (!provenance.limitations.length || provenance.limitations.some((item) => !item.trim())) errors.push("External-data limitations must be declared");
  if (provenance.cleaning.scriptPath !== "tools/generate-public-data-cases.ts") errors.push("External-data cleaning is not bound to the controlled generator");
  if (provenance.rawArtifacts.length !== 2 || new Set(provenance.rawArtifacts.map((artifact) => artifact.side)).size !== 2) errors.push("External raw responses must cover exactly two snapshots");
  for (const artifact of provenance.rawArtifacts) {
    if (!artifact.fileName.trim()) errors.push(`${artifact.side}: external raw-response file name is missing`);
    if (await sha256Text(artifact.text) !== artifact.sha256) errors.push(`${artifact.side}: external raw-response SHA-256 mismatch`);
  }
  const cleaningBindingError = externalCleaningBindingError(provenance);
  if (cleaningBindingError) {
    errors.push(cleaningBindingError);
    return { applicable: true, valid: false, errors };
  }
  const baseline = rebuildExternalSnapshot(provenance, "baseline");
  const current = rebuildExternalSnapshot(provenance, "current");
  errors.push(...baseline.errors, ...current.errors);
  if (baseline.text !== dataset.baselineRawText) errors.push("Baseline CSV cannot be rebuilt from the embedded raw response using the declared rules");
  if (current.text !== dataset.currentRawText) errors.push("Current CSV cannot be rebuilt from the embedded raw response using the declared rules");
  return { applicable: true, valid: errors.length === 0, errors };
}

export async function verifyAuditBundle(pkg: AuditBundle) {
  const checks: Array<{ name: string; passed: boolean; errors: string[] }> = [];
  const add = (name: string, passed: boolean, errors: string[] = []) => checks.push({
    name,
    passed,
    errors: passed ? [] : errors.length ? errors : [`${name} check failed`],
  });
  try {
    const { integrity, ...payload } = pkg;
    const schemaErrors = [
      ...(pkg.schemaVersion === EVIDENCE_SCHEMA_VERSION ? [] : ["AuditBundle version mismatch"]),
      ...(pkg.bundleType === "AuditBundle" ? [] : ["AuditBundle type mismatch"]),
    ];
    add("schema", schemaErrors.length === 0, schemaErrors);
    const previousLinkValid = pkg.previousBundleHash === null || /^[a-f0-9]{64}$/i.test(pkg.previousBundleHash);
    add("previous-bundle-link", previousLinkValid && pkg.previousBundleHash !== integrity?.payloadHash, previousLinkValid ? (pkg.previousBundleHash === integrity?.payloadHash ? ["Previous root hash cannot point to the current bundle"] : []) : ["Previous root-hash format is invalid"]);
    const payloadHash = await sha256Canonical(payload);
    add("bundle-root", integrity?.algorithm === "SHA-256" && integrity?.canonicalization === "claimtrace-json-c14n/1.0.0" && integrity?.payloadHash === payloadHash, ["Canonical bundle root hash mismatch"]);
    const sectionHashes = {
      chain: await sha256Canonical({ previousBundleHash: pkg.previousBundleHash }),
      snapshots: await sha256Canonical({ snapshots: pkg.snapshots, snapshotPayloads: pkg.snapshotPayloads }),
      claims: await sha256Canonical({ claimSpecs: pkg.claimSpecs, claimResults: pkg.claimResults }),
      decisions: await sha256Canonical({ decisionSpecs: pkg.decisionSpecs, decisionResults: pkg.decisionResults }),
      reviews: await sha256Canonical({ reviews: pkg.reviews, reviewChain: pkg.reviewChain }),
      provenance: await sha256Canonical(pkg.externalSource),
      upstream: await sha256Canonical(pkg.upstreamLineage),
    };
    add("section-hashes", canonicalJson(sectionHashes) === canonicalJson(integrity?.sectionHashes), ["One or more section hashes do not match"]);

    const reconstructed = await datasetFromBundle(pkg);
    add("snapshots", Boolean(reconstructed.dataset) && reconstructed.errors.length === 0, reconstructed.errors);
    if (reconstructed.dataset) {
      let expected: Awaited<ReturnType<typeof buildAuditBundlePayload>> | undefined;
      try {
        const recomputed = await buildAuditBundlePayload(reconstructed.dataset, pkg.claimSpecs, pkg.decisionSpecs, pkg.reviews, pkg.generatedAt, pkg.previousBundleHash);
        expected = recomputed;
        const derivedFields = ["summary", "diffSummary", "diffs", "claimResults", "queryTrace", "dataPreview", "decisionResults", "reviewChain"] as const;
        const mismatched = derivedFields.filter((field) => canonicalJson(pkg[field]) !== canonicalJson(recomputed[field]));
        add("derived-recomputation", mismatched.length === 0, mismatched.map((field) => `${field} does not match the recomputed result`));
      } catch (error) {
        add("derived-recomputation", false, [error instanceof Error ? error.message : "Derived results could not be recomputed"]);
      }
      if (expected) {
        try {
          const upstream = await verifyUpstreamLineage(reconstructed.dataset, pkg.upstreamLineage, expected.claimResults);
          add("upstream-lineage", upstream.valid, upstream.errors);
        } catch (error) {
          add("upstream-lineage", false, [`Upstream-lineage structure is invalid: ${error instanceof Error ? error.message : "unknown structural error"}`]);
        }
      } else {
        add("upstream-lineage", false, ["Derived-result recomputation failed, so upstream lineage cannot be verified"]);
      }
      try {
        const externalSource = await verifyExternalSourceLineage(reconstructed.dataset, pkg.externalSource);
        add("external-source-lineage", externalSource.valid, externalSource.errors);
      } catch (error) {
        add("external-source-lineage", false, [`External-source structure is invalid: ${error instanceof Error ? error.message : "unknown structural error"}`]);
      }
    } else {
      add("derived-recomputation", false, ["Snapshots are invalid, so claims and decisions cannot be recomputed"]);
      add("upstream-lineage", false, ["Snapshots are invalid, so upstream lineage cannot be verified"]);
      add("external-source-lineage", false, ["Snapshots are invalid, so external-source lineage cannot be verified"]);
    }
  } catch (error) {
    add("bundle-structure", false, [error instanceof Error ? error.message : "AuditBundle structure is invalid"]);
  }
  return { valid: checks.length > 0 && checks.every((check) => check.passed), checks };
}

export async function verifyAuditBundleChain(bundles: AuditBundle[]) {
  const errors: string[] = [];
  if (!Array.isArray(bundles)) return { valid: false, errors: ["AuditBundle chain must be an array"], bundleChecks: [], links: [] };
  const record = (value: unknown) => value && typeof value === "object" ? value as Record<string, unknown> : null;
  const stringField = (value: unknown, field: string) => {
    const candidate = record(value)?.[field];
    return typeof candidate === "string" ? candidate : null;
  };
  const rootHash = (value: unknown) => {
    const integrity = record(record(value)?.integrity);
    const candidate = integrity?.payloadHash;
    return typeof candidate === "string" && /^[a-f0-9]{64}$/i.test(candidate) ? candidate : null;
  };
  const bundleChecks = await Promise.all(bundles.map(async (bundle, index) => ({ index, hash: rootHash(bundle), verification: await verifyAuditBundle(bundle) })));
  if (!bundles.length) errors.push("Bundle chain cannot be empty");
  if (bundles.length && record(bundles[0])?.previousBundleHash !== null) errors.push("The bundle chain must begin with a genesis bundle that has no previous root hash");
  const seen = new Set<string>();
  const links = bundles.slice(1).map((bundle, offset) => {
    const index = offset + 1;
    const previous = bundles[index - 1];
    const expected = rootHash(previous);
    const actual = stringField(bundle, "previousBundleHash");
    const passed = expected !== null && actual === expected;
    if (!passed) errors.push(`Bundle ${index + 1} is not linked to the root hash of bundle ${index}`);
    const project = stringField(bundle, "project");
    const previousProject = stringField(previous, "project");
    const primaryKey = stringField(bundle, "primaryKey");
    const previousPrimaryKey = stringField(previous, "primaryKey");
    if (project === null || previousProject === null || primaryKey === null || previousPrimaryKey === null || project !== previousProject || primaryKey !== previousPrimaryKey) errors.push(`Bundle ${index + 1} does not share the same project and primary key as the preceding bundle`);
    return { fromIndex: index - 1, toIndex: index, expected, actual, passed };
  });
  for (const check of bundleChecks) {
    if (!check.verification.valid) errors.push(`Bundle ${check.index + 1} failed independent verification`);
    if (check.hash === null) errors.push(`Bundle ${check.index + 1} has no valid root hash`);
    else if (seen.has(check.hash)) errors.push(`Bundle ${check.index + 1} has a duplicate root hash`);
    else seen.add(check.hash);
  }
  return { valid: errors.length === 0, errors, bundleChecks, links };
}

export function verifyEvidencePackage(pkg: AuditBundle) {
  return verifyAuditBundle(pkg);
}

export type AuditBundleVerification = Awaited<ReturnType<typeof verifyAuditBundle>>;

export function buildHtmlReport(bundle: AuditBundle, verification: AuditBundleVerification) {
  const h = (value: unknown) => escapeHtml(String(value ?? ""));
  const claimRows = bundle.claimResults.map((claim) => {
    const completeness = claim.evidenceCompleteness;
    return `<tr><td>${h(claim.code)}</td><td><b>${h(claim.title)}</b><br><small>${h(claim.resultId)}</small></td><td>${h(claim.status)}</td><td>${h(claim.baselineValue)}</td><td>${h(claim.currentValue)}</td><td>${completeness.passed}/${completeness.total}</td><td>${h(claim.governance.releaseStatus)}</td><td>${h(claim.action)}</td></tr>`;
  }).join("");
  const decisionRows = bundle.decisionResults.map((decision) => {
    const options = decision.analysis?.options ?? [];
    const recommended = options.find((option) => option.optionId === decision.binding.recommendedOptionId);
    return `<tr><td><b>${h(decision.decisionId)}</b><br><small>${h(decision.resultId)}</small></td><td>${h(decision.previousOutcome ?? "No history")} → ${h(decision.currentOutcome)}</td><td>${h(decision.status)}<br><small>${h(decision.changeReasons.join(" / ") || "No material change")}</small></td><td>${h(decision.binding.activeActionId)}</td><td>${h(recommended?.label ?? decision.binding.recommendedOptionId ?? "No recommendation")}</td><td>${h(decision.binding.feasibleOptionIds.join(", ") || "None")}</td><td>${h(decision.governance.releaseStatus)}</td><td>${h(decision.reason)}</td></tr>`;
  }).join("");
  const provenanceRows = bundle.decisionSpecs.map((spec) => {
    const provenance = spec.inputProvenance;
    return `<tr><td>${h(spec.id)}</td><td>${h(provenance?.kind ?? "Missing")}</td><td>${h(provenance?.source ?? "Not declared")}</td><td>${h(provenance?.version ?? "Not declared")}</td><td>${h(provenance?.rationale ?? "Not declared")}</td><td>${provenance ? `Benefit: ${h(provenance.units.benefit)}; cost: ${h(provenance.units.cost)}; risk: ${h(provenance.units.risk)}; capacity: ${h(provenance.units.capacity)}` : "Not declared"}</td></tr>`;
  }).join("");
  const reviewRows = bundle.reviews.map((review) => `<tr><td>${h(review.createdAt)}<br><small>${h(review.assurance.timestamp)}</small></td><td>${h(review.reviewer)}<br><small>${h(review.assurance.identity)} · ${h(review.assurance.authorization)} · signature ${h(review.assurance.cryptographicSignature)}</small></td><td>${h(review.claimId ?? review.decisionId)}</td><td>${h(review.disposition)}</td><td>${h(review.note)}</td><td><small>Record ${h(review.id)}<br>Target ${h(review.targetResultHash)}<br>Previous ${h(review.previousRecordHash ?? "GENESIS")}<br>Current ${h(review.recordHash)}</small></td></tr>`).join("");
  const verificationRows = verification.checks.map((check) => `<li class="${check.passed ? "pass" : "fail"}"><b>${check.passed ? "PASS" : "FAIL"} · ${h(check.name)}</b>${!check.passed && check.errors.length ? `<span>${h(check.errors.join("; "))}</span>` : ""}</li>`).join("");
  const sensitivityRows = bundle.decisionResults.flatMap((decision) => (decision.analysis?.sensitivity ?? []).map((scenario) => `<tr><td>${h(decision.decisionId)}</td><td>${h(scenario.label)}</td><td>${h(scenario.recommendedOptionId ?? "No feasible option")}</td></tr>`)).join("");
  const optionAnalysisRows = bundle.decisionResults.flatMap((decision) => (decision.analysis?.options ?? []).map((option) => `<tr><td>${h(decision.decisionId)}</td><td>${h(option.label)}<br><small>${h(option.optionId)}</small></td><td>${option.feasible ? "Feasible" : `Eliminated: ${h(option.failedConstraints.join(", "))}`}</td><td>${h(option.score)}</td><td>${h(option.scoreInterval?.min ?? "—")} to ${h(option.scoreInterval?.max ?? "—")}</td><td>${h(option.breakEvenBenefit ?? "—")}</td><td>${option.paretoEfficient ? "Yes" : "No"}</td></tr>`)).join("");
  const uncertaintyRows = bundle.decisionResults.map((decision) => {
    const analysis = decision.analysis;
    if (!analysis) return "";
    const stability = analysis.recommendationStability;
    const shares = analysis.monteCarlo?.recommendationShares.map((item) => `${item.optionId} ${(item.share * 100).toFixed(1)}%`).join("; ") ?? "Not configured";
    return `<tr><td>${h(decision.decisionId)}</td><td>${h(analysis.paretoFrontierOptionIds.join(", ") || "None")}</td><td>Benefit multiplier ${h(stability.min)}–${h(stability.max)} preserves ${h(stability.recommendedOptionId ?? "no recommendation")} (step ${h(stability.step)})</td><td>${analysis.monteCarlo ? `${analysis.monteCarlo.trials} trials · fixed seed ${h(analysis.monteCarlo.seed)}<br>${h(shares)}` : "Not configured"}</td></tr>`;
  }).join("");
  const externalSourceSection = bundle.externalSource ? `<section><h2>External Public-Data Provenance and Cleaning Chain</h2><div class="card"><p><b>Publisher / dataset:</b> ${h(bundle.externalSource.publisher)} / ${h(bundle.externalSource.dataset)}</p><p><b>Measure:</b> ${h(bundle.externalSource.measure.id)} · ${h(bundle.externalSource.measure.name)}</p><p><b>Retrieved / source updated:</b> ${h(bundle.externalSource.retrievedAt)} / ${h(bundle.externalSource.sourceLastUpdated ?? "Not separately reported")}</p><p><b>License:</b> <a href="${h(bundle.externalSource.licenseUrl)}">${h(bundle.externalSource.license)}</a></p><p><b>Attribution:</b> ${h(bundle.externalSource.attribution)}</p><p><b>Cleaning:</b> ${h(bundle.externalSource.cleaning.implementation)} · ${h(bundle.externalSource.cleaning.scriptPath)}</p>${bundle.externalSource.rawArtifacts.map((artifact) => `<p><b>${h(artifact.side)} raw response:</b> <code>${h(artifact.sha256)}</code></p>`).join("")}<p><b>Declared limitations:</b> ${h(bundle.externalSource.limitations.join(" "))}</p><p class="muted">The AuditBundle embeds both pinned official-source responses. The verifier rechecks their SHA-256 values and regenerates both CSV snapshots from the declared source-specific transformation parameters.</p></div></section>` : "";
  const summary = bundle.summary;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ClaimTrace Complete Audit Report</title><style>
  :root{color-scheme:light}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#183128;background:#f5f7f5;max-width:1240px;margin:0 auto;padding:40px 28px;font-size:14px;line-height:1.55}main{background:#fff;border:1px solid #dbe2de;border-radius:18px;padding:36px}h1{font-size:32px;margin:4px 0 8px}h2{font-size:21px;margin:0 0 14px}p{margin:7px 0}.muted,small{color:#63736d;font-size:12px}.meta{display:flex;flex-wrap:wrap;gap:8px 20px}.hero{display:grid;grid-template-columns:minmax(220px,1fr) 3fr;gap:24px;margin:28px 0}.score{font-size:32px;font-weight:700;color:#147a55}.card{border:1px solid #dbe2de;border-radius:12px;padding:18px}.notice{padding:14px 16px;background:#fff5df;border-left:4px solid #d58c20;border-radius:6px}.danger{background:#fff0ee;border-left-color:#bb4037}section{margin:34px 0;break-inside:avoid}table{border-collapse:collapse;width:100%;font-size:13px}th,td{border:1px solid #dbe2de;padding:9px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#f1f5f2}code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;overflow-wrap:anywhere}.checks{list-style:none;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px}.checks li{border:1px solid #dbe2de;border-radius:8px;padding:10px;display:flex;flex-direction:column}.checks .pass{border-left:4px solid #147a55}.checks .fail{border-left:4px solid #bb4037}.checks span{font-size:12px;color:#7d332d}footer{margin-top:40px;padding-top:18px;border-top:1px solid #dbe2de;color:#63736d;font-size:12px}@media(max-width:760px){body{padding:12px}main{padding:18px}.hero{grid-template-columns:1fr}.table-wrap{overflow:auto}}@media print{body{background:#fff;padding:0}main{border:0;padding:0}.table-wrap{overflow:visible}}
  </style></head><body><main><p class="muted">CLAIMTRACE / VERSIONED EVIDENCE &amp; DECISION AUDIT</p><h1>${h(bundle.project)}</h1><div class="meta"><span>Primary key: ${h(bundle.primaryKey)}</span><span>Rule: ${h(bundle.ruleVersion)}</span><span>Generated: ${h(bundle.generatedAt)}</span><span>Data origin: ${h(bundle.dataOrigin)}</span><span>Mode: ${bundle.isDemo ? "Reproducible demonstration case" : "Local project"}</span></div>
  <div class="hero"><div class="card"><div class="score">${summary.completenessChecksPassed}/${summary.completenessChecksTotal}</div><b>Completeness checks passed</b><p class="muted">Calculated from 16 deterministic completeness rules per claim; this is not model accuracy or business impact.</p></div><div class="card"><h2>Executive Summary</h2><p>Audited <b>${summary.total}</b> claims: ${summary.supported} supported, ${summary.weakened} weakened, ${summary.reversed} reversed, ${summary.untestable} untestable, and ${summary.reviewRequired} requiring review. Detected ${summary.changedRecords} primary-key-level changes.</p><p>Generated <b>${bundle.decisionResults.length}</b> decision results and <b>${bundle.reviews.length}</b> locally recorded, unauthenticated sign-off records. Data-origin type: <b>${h(bundle.dataOrigin)}</b>.</p></div></div>
  <div class="notice">SHA-256 and recomputation verify internal bundle consistency. They do not prove source authenticity, human identity, trusted time, or external endorsement. Unconfirmed thresholds remain preliminary diagnostics.</div>
  ${externalSourceSection}
  <section><h2>1. Claim-by-Claim Audit</h2><div class="table-wrap"><table><thead><tr><th>Code</th><th>Claim / result identity</th><th>Engine status</th><th>Baseline</th><th>Current</th><th>Completeness</th><th>Release status</th><th>Recommended action</th></tr></thead><tbody>${claimRows || `<tr><td colspan="8">No claims</td></tr>`}</tbody></table></div></section>
  <section><h2>2. Decision Results and Action Identity</h2><div class="table-wrap"><table><thead><tr><th>Decision / result identity</th><th>Outcome change</th><th>Decision status / reason category</th><th>Active action ID</th><th>Recommended option</th><th>Feasible option set</th><th>Release status</th><th>Rationale</th></tr></thead><tbody>${decisionRows || `<tr><td colspan="8">No decisions configured</td></tr>`}</tbody></table></div></section>
  <section><h2>3. Decision-Input Provenance and Units</h2><div class="table-wrap"><table><thead><tr><th>Decision</th><th>Input type</th><th>Source</th><th>Version</th><th>Rationale</th><th>Units</th></tr></thead><tbody>${provenanceRows || `<tr><td colspan="6">No quantified decisions configured</td></tr>`}</tbody></table></div></section>
  <section><h2>4. Multi-Option and Uncertainty Analysis</h2><p class="muted">Score intervals, break-even benefits, the Pareto frontier, recommendation stability, and fixed-seed Monte Carlo results are calculated from declared assumption ranges and scoring rules. They are not confidence intervals, predictive probabilities, model accuracy, or real-world effects.</p><div class="table-wrap"><table><thead><tr><th>Decision</th><th>Option</th><th>Feasibility</th><th>Base score</th><th>Score interval</th><th>Break-even benefit</th><th>Pareto</th></tr></thead><tbody>${optionAnalysisRows || `<tr><td colspan="7">No quantified options</td></tr>`}</tbody></table></div><div class="table-wrap"><table><thead><tr><th>Decision</th><th>Pareto frontier</th><th>Recommendation stability</th><th>Fixed-seed Monte Carlo recommendation shares</th></tr></thead><tbody>${uncertaintyRows || `<tr><td colspan="4">No uncertainty analysis configured</td></tr>`}</tbody></table></div><h3>Preset Scenarios</h3><div class="table-wrap"><table><thead><tr><th>Decision</th><th>Scenario</th><th>Recommended option</th></tr></thead><tbody>${sensitivityRows || `<tr><td colspan="3">No sensitivity scenarios</td></tr>`}</tbody></table></div></section>
  <section><h2>5. Locally Recorded, Unauthenticated Sign-Offs</h2><p class="muted">Display names are stored only as local audit records; ClaimTrace does not verify human identity. Records form an append-only chain through previous-record hashes.</p><div class="table-wrap"><table><thead><tr><th>Local time</th><th>Display name</th><th>Target</th><th>Disposition</th><th>Note</th><th>Hash chain</th></tr></thead><tbody>${reviewRows || `<tr><td colspan="6">No local sign-off records</td></tr>`}</tbody></table></div></section>
  <section><h2>6. AuditBundle Integrity</h2><div class="card"><p><b>Independent recomputation:</b> ${verification.valid ? "PASS" : "FAIL"}</p><p><b>Canonical root hash:</b> <code>${h(bundle.integrity.payloadHash)}</code></p><p><b>Previous bundle root hash:</b> <code>${h(bundle.previousBundleHash ?? "None (chain start or not declared)")}</code></p><p><b>Review-chain head:</b> <code>${h(bundle.reviewChain.headRecordHash ?? "None")}</code></p><p class="muted">A previous hash proves continuity only when the preceding AuditBundle is also supplied and the cross-bundle chain passes verification. A standalone bundle can verify only that the stored field was not altered.</p></div><ul class="checks">${verificationRows}</ul></section>
  ${verification.valid ? "" : `<div class="notice danger"><b>Warning:</b> The AuditBundle associated with this report failed one or more independent checks and should not be signed off or used for decision-making.</div>`}
  <footer><p>The report and JSON AuditBundle come from the same recomputation. The AuditBundle is authoritative for complete evidence, snapshot payloads, diffs, rules, decisions, and review records.</p><p>Generated by ClaimTrace · ${h(bundle.generatedAt)} · Schema ${h(bundle.schemaVersion)}</p></footer></main></body></html>`;
}
