import {
  RULE_ENGINE_VERSION,
  bytesToBase64,
  canonicalizeRows,
  createEvidencePackage,
  evaluateDecision,
  parseCSV,
  recomputeClaim,
  sha256Text,
  verifyDataset,
  type Claim,
  type DatasetVersion,
  type ExternalSourceProvenance,
  type UpstreamLineage,
} from "../core";
import type { CaseClaimDefinition, ExecutableCaseDefinition } from "./types";

function claimSeed(definition: CaseClaimDefinition, dataset: DatasetVersion, runAt: string): Claim {
  return {
    ...definition,
    kind: definition.rule.type === "stability" ? "VERSION_COMPARISON" : "SNAPSHOT",
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
      ruleVersion: RULE_ENGINE_VERSION,
      lastRunAt: runAt,
      baselineSha256: dataset.baselineMeta.sha256,
      currentSha256: dataset.currentMeta?.sha256,
      preliminary: false,
    },
  };
}

export async function datasetFromCaseCsv(definition: ExecutableCaseDefinition, baselineText: string, currentText: string, generatedAt = definition.expectedGeneratedAt, upstreamLineage?: UpstreamLineage, externalSource?: ExternalSourceProvenance) {
  const baseline = parseCSV(baselineText);
  const current = parseCSV(currentText);
  const baselineSha256 = await sha256Text(baselineText);
  const currentSha256 = await sha256Text(currentText);
  const baselineNormalized = await sha256Text(canonicalizeRows(baseline.columns, baseline.rows));
  const currentNormalized = await sha256Text(canonicalizeRows(current.columns, current.rows));
  const makeMeta = (fileName: string, text: string, rows: number, sha256: string, normalizedSha256: string) => ({
    fileName,
    sha256,
    normalizedSha256,
    hashVerified: true,
    verification: { status: "verified" as const, method: "raw-bytes+normalized-rows" as const, verifiedAt: generatedAt, recomputedSha256: sha256, recomputedNormalizedSha256: normalizedSha256 },
    generatedAt,
    rowCount: rows,
    byteSize: new TextEncoder().encode(text).byteLength,
    encoding: "utf-8" as const,
    mediaType: "text/csv" as const,
  });
  return verifyDataset({
    projectName: definition.projectName,
    baselineName: `Baseline · ${definition.id}`,
    currentName: `Current · ${definition.id}`,
    baselineRows: baseline.rows,
    currentRows: current.rows,
    baselineLineNumbers: baseline.lineNumbers,
    currentLineNumbers: current.lineNumbers,
    baselineMeta: makeMeta("baseline.csv", baselineText, baseline.rows.length, baselineSha256, baselineNormalized),
    currentMeta: makeMeta("current.csv", currentText, current.rows.length, currentSha256, currentNormalized),
    baselineRawText: baselineText,
    currentRawText: currentText,
    baselineRawBytesBase64: bytesToBase64(new TextEncoder().encode(baselineText).buffer as ArrayBuffer),
    currentRawBytesBase64: bytesToBase64(new TextEncoder().encode(currentText).buffer as ArrayBuffer),
    columns: baseline.columns,
    primaryKey: definition.primaryKey,
    ruleVersion: RULE_ENGINE_VERSION,
    isDemo: true,
    dataOrigin: definition.dataOrigin ?? "SYNTHETIC",
    externalSource,
    upstreamLineage,
  }, generatedAt);
}

export async function runExecutableCase(definition: ExecutableCaseDefinition, baselineText: string, currentText: string, upstreamLineage?: UpstreamLineage, externalSource?: ExternalSourceProvenance) {
  const dataset = await datasetFromCaseCsv(definition, baselineText, currentText, definition.expectedGeneratedAt, upstreamLineage, externalSource);
  const claims = definition.claims.map((claim) => recomputeClaim(claimSeed(claim, dataset, definition.expectedGeneratedAt), dataset, definition.expectedGeneratedAt));
  const decisions = definition.decisions.map((decision) => evaluateDecision(decision, claims));
  const evidencePackage = await createEvidencePackage(dataset, claims, definition.expectedGeneratedAt, { decisionSpecs: definition.decisions });
  return { dataset, claims, decisionSpecs: definition.decisions, decisions, evidencePackage };
}
