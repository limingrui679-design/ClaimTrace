import {
  RULE_ENGINE_VERSION,
  type Claim,
  type ClaimStatus,
  type DatasetVersion,
  type EvidenceNode,
  type EvidenceScope,
  type Rule,
  type SnapshotSide,
  type SourceReference,
} from "../types";
import { absoluteThresholdSpecForRule, isThresholdConfirmed, ruleIsPreliminary, stabilityReversalIsGoverned, thresholdSpecForRule } from "../claim-spec";
import { valueToNumber } from "../snapshot";
import { sha256CanonicalSync } from "../integrity";
import { aggregate, diffRowsByKey, evaluate, rankGroups, rowsForRule, sampleProfile, sampleProfileChanged } from "../statistics";

const MAX_SOURCE_REFERENCES = 200;

export function formatNumber(value: number) {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value);
}

function snapshotMeta(dataset: DatasetVersion, side: SnapshotSide) {
  return side === "baseline" ? dataset.baselineMeta : dataset.currentMeta;
}

function snapshotRows(dataset: DatasetVersion, side: SnapshotSide) {
  return side === "baseline" ? dataset.baselineRows : dataset.currentRows ?? [];
}

function snapshotLines(dataset: DatasetVersion, side: SnapshotSide) {
  return side === "baseline" ? dataset.baselineLineNumbers : dataset.currentLineNumbers ?? [];
}

function stableScore(value: string) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function boundaryScorer(dataset: DatasetVersion, side: SnapshotSide, rule: Rule) {
  if (rule.type === "stability") {
    const baselineMetric = aggregate(rowsForRule(dataset.baselineRows, rule), rule.field, rule.aggregation);
    if (baselineMetric === null) return () => Number.POSITIVE_INFINITY;
    if (side === "baseline" || baselineMetric === 0) return (row: Record<string, string | number>) => {
      const value = valueToNumber(row[rule.field]);
      return value === null ? Number.POSITIVE_INFINITY : Math.abs(value - baselineMetric);
    };
    const scale = rule.supportTolerance / 100;
    const lower = baselineMetric * (1 - scale);
    const upper = baselineMetric * (1 + scale);
    return (row: Record<string, string | number>) => {
      const value = valueToNumber(row[rule.field]);
      return value === null ? Number.POSITIVE_INFINITY : Math.min(Math.abs(value - lower), Math.abs(value - upper));
    };
  }
  if (rule.type === "rank") {
    const groups = new Map((rankGroups(snapshotRows(dataset, side), rule)?.groups ?? []).map((item, index) => [item.group, { index, value: item.value }]));
    return (row: Record<string, string | number>) => {
      const value = valueToNumber(row[rule.field]);
      const group = groups.get(String(row[rule.groupField] ?? ""));
      if (value === null || !group) return Number.POSITIVE_INFINITY;
      return group.index * 1_000_000_000 + Math.abs(value - group.value);
    };
  }
  return (row: Record<string, string | number>) => {
    const value = valueToNumber(row[rule.field]);
    return value === null ? Number.POSITIVE_INFINITY : Math.abs(value - rule.threshold);
  };
}

function candidateReferences(dataset: DatasetVersion, side: SnapshotSide, rule: Rule) {
  const meta = snapshotMeta(dataset, side);
  if (!meta) return [];
  const rows = snapshotRows(dataset, side);
  const lineNumbers = snapshotLines(dataset, side);
  const fields = [dataset.primaryKey, rule.field, ...(rule.filters ?? []).map((filter) => filter.field), ...(rule.excludes ?? []).map((filter) => filter.field)];
  if (rule.type === "rank") fields.push(rule.groupField);
  const uniqueFields = [...new Set(fields)];
  const changedKeys = new Set(diffRowsByKey(dataset).filter((diff) => diff.kind !== "unchanged").map((diff) => diff.key));
  const scoreBoundary = boundaryScorer(dataset, side, rule);
  return rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => rowsForRule([row], rule).length > 0)
    .map(({ row, index }) => ({
      snapshot: side,
      fileName: meta.fileName,
      sha256: meta.sha256,
      keyField: dataset.primaryKey,
      keyValue: String(row[dataset.primaryKey]),
      lineNumber: lineNumbers[index] ?? index + 2,
      fields: uniqueFields,
      changed: changedKeys.has(String(row[dataset.primaryKey])),
      boundaryScore: scoreBoundary(row),
    }))
    .sort((left, right) => left.lineNumber - right.lineNumber);
}

function sideQuotas(baselineCount: number, currentCount: number) {
  if (!currentCount) return { baseline: Math.min(MAX_SOURCE_REFERENCES, baselineCount), current: 0 };
  let baseline = Math.min(Math.floor(MAX_SOURCE_REFERENCES / 2), baselineCount);
  let current = Math.min(Math.ceil(MAX_SOURCE_REFERENCES / 2), currentCount);
  let remaining = MAX_SOURCE_REFERENCES - baseline - current;
  while (remaining > 0 && (baseline < baselineCount || current < currentCount)) {
    if (baseline < baselineCount) {
      baseline += 1;
      remaining -= 1;
    }
    if (remaining > 0 && current < currentCount) {
      current += 1;
      remaining -= 1;
    }
  }
  return { baseline, current };
}

type ReferenceCandidate = ReturnType<typeof candidateReferences>[number];

function toSourceReference(item: ReferenceCandidate): SourceReference {
  return {
    snapshot: item.snapshot,
    fileName: item.fileName,
    sha256: item.sha256,
    keyField: item.keyField,
    keyValue: item.keyValue,
    lineNumber: item.lineNumber,
    fields: item.fields,
  };
}

function selectSideReferences(
  candidates: ReferenceCandidate[],
  quota: number,
  pairedKeys: Set<string>,
  pairableKeys: Set<string>,
  boundaryPairedKeys: Set<string>,
  changedKeys: Set<string>,
  seed: string,
) {
  if (candidates.length <= quota) {
    const paired = candidates.filter((item) => pairedKeys.has(item.keyValue)).length;
    const unpaired = candidates.filter((item) => changedKeys.has(item.keyValue) && !pairableKeys.has(item.keyValue)).length;
    const boundary = candidates.filter((item) => boundaryPairedKeys.has(item.keyValue)).length;
    return {
      selected: candidates,
      paired,
      unpaired,
      boundary,
      sampled: candidates.length - paired - unpaired,
    };
  }

  const selected: ReferenceCandidate[] = [];
  const selectedKeys = new Set<string>();
  const add = (items: ReferenceCandidate[], limit: number) => {
    let added = 0;
    for (const item of items) {
      if (selected.length >= quota || added >= limit || selectedKeys.has(item.keyValue)) continue;
      selected.push(item);
      selectedKeys.add(item.keyValue);
      added += 1;
    }
    return added;
  };

  const paired = add(candidates.filter((item) => pairedKeys.has(item.keyValue)), pairedKeys.size);
  const pairedBoundary = selected.filter((item) => boundaryPairedKeys.has(item.keyValue)).length;
  const boundaryReserve = Math.max(0, Math.min(20, Math.floor(quota * 0.2), Math.max(0, candidates.length - selected.length)) - pairedBoundary);
  const changedCapacity = Math.max(0, quota - selected.length - boundaryReserve);
  const unpaired = add(
    candidates
      .filter((item) => changedKeys.has(item.keyValue) && !pairableKeys.has(item.keyValue))
      .sort((left, right) => stableScore(`${seed}|changed|${left.keyValue}`) - stableScore(`${seed}|changed|${right.keyValue}`)),
    changedCapacity,
  );
  const boundary = add(
    candidates
      .filter((item) => !selectedKeys.has(item.keyValue) && !pairableKeys.has(item.keyValue))
      .sort((left, right) => left.boundaryScore - right.boundaryScore || stableScore(`${seed}|boundary|${left.keyValue}`) - stableScore(`${seed}|boundary|${right.keyValue}`)),
    boundaryReserve,
  );
  const sampled = add(
    candidates
      .filter((item) => !selectedKeys.has(item.keyValue) && !pairableKeys.has(item.keyValue))
      .sort((left, right) => stableScore(`${seed}|sample|${left.keyValue}`) - stableScore(`${seed}|sample|${right.keyValue}`)),
    quota - selected.length,
  );
  return { selected, paired, unpaired, boundary: pairedBoundary + boundary, sampled };
}

function sourceReferences(dataset: DatasetVersion, rule: Rule, claimId: string): { refs: SourceReference[]; scope: EvidenceScope } {
  const baseline = candidateReferences(dataset, "baseline", rule);
  const current = dataset.currentRows ? candidateReferences(dataset, "current", rule) : [];
  const seed = `${claimId}|${dataset.ruleVersion}`;
  const changedKeys = new Set(diffRowsByKey(dataset).filter((diff) => diff.kind !== "unchanged").map((diff) => diff.key));
  const baselineKeys = new Set(baseline.map((item) => item.keyValue));
  const currentKeys = new Set(current.map((item) => item.keyValue));
  const pairCandidates = [...changedKeys].filter((key) => baselineKeys.has(key) && currentKeys.has(key));
  const pairableKeys = new Set(pairCandidates);
  const quotas = sideQuotas(baseline.length, current.length);
  const pairLimit = Math.max(0, Math.min(quotas.baseline, quotas.current, pairCandidates.length));
  const boundaryPairLimit = Math.min(20, Math.floor(Math.min(quotas.baseline, quotas.current) * 0.2), pairLimit);
  const baselineBoundaryScores = new Map(baseline.map((item) => [item.keyValue, item.boundaryScore]));
  const currentBoundaryScores = new Map(current.map((item) => [item.keyValue, item.boundaryScore]));
  const pairBoundaryScore = (key: string) => {
    const baselineScore = baselineBoundaryScores.get(key) ?? Number.POSITIVE_INFINITY;
    const currentScore = currentBoundaryScores.get(key) ?? Number.POSITIVE_INFINITY;
    return Math.min(baselineScore, currentScore);
  };
  const boundaryPairs = [...pairCandidates]
    .sort((left, right) => pairBoundaryScore(left) - pairBoundaryScore(right) || stableScore(`${seed}|pair-boundary|${left}`) - stableScore(`${seed}|pair-boundary|${right}`))
    .slice(0, boundaryPairLimit);
  const remainingPairs = pairCandidates
    .filter((key) => !boundaryPairs.includes(key))
    .sort((left, right) => stableScore(`${seed}|pair|${left}`) - stableScore(`${seed}|pair|${right}`));
  const pairedKeys = new Set([...boundaryPairs, ...remainingPairs].slice(0, pairLimit));
  const boundaryPairedKeys = new Set(boundaryPairs.filter((key) => pairedKeys.has(key)));
  const baselineSelection = selectSideReferences(baseline, quotas.baseline, pairedKeys, pairableKeys, boundaryPairedKeys, changedKeys, `${seed}|baseline`);
  const currentSelection = selectSideReferences(current, quotas.current, pairedKeys, pairableKeys, boundaryPairedKeys, changedKeys, `${seed}|current`);
  const refs = [...baselineSelection.selected, ...currentSelection.selected].map(toSourceReference);
  const matchingRows = baseline.length + current.length;
  const sideScope = (matching: ReferenceCandidate[], selection: ReturnType<typeof selectSideReferences>) => ({
    matchingRows: matching.length,
    exportedReferences: selection.selected.length,
    changedCandidates: matching.filter((item) => changedKeys.has(item.keyValue)).length,
    pairedChangedReferences: selection.paired,
    unpairedChangedReferences: selection.unpaired,
    boundaryReferences: selection.boundary,
    sampledReferences: selection.sampled,
  });
  return {
    refs,
    scope: {
      matchingRows,
      exportedReferences: refs.length,
      truncated: refs.length < matchingRows,
      strategy: refs.length < matchingRows ? "changed+boundary+sample" : "all-matching",
      maxReferences: MAX_SOURCE_REFERENCES,
      seed,
      pairedChangedKeys: pairedKeys.size,
      sides: {
        baseline: sideScope(baseline, baselineSelection),
        current: dataset.currentRows ? sideScope(current, currentSelection) : undefined,
      },
    },
  };
}

export function makeEvidence(title: string, rule: Rule, dataset: DatasetVersion, resultId: string): EvidenceNode[] {
  const upstream = dataset.upstreamLineage;
  const upstreamNode: EvidenceNode[] = upstream ? [{
    id: `upstream:${upstream.schemaVersion}`,
    kind: "Upstream aggregation",
    title: "Raw detail → reproducible summary",
    detail: `${upstream.sources.filter((source) => source.side === "baseline").reduce((total, source) => total + source.rowCount, 0)} baseline and ${upstream.sources.filter((source) => source.side === "current").reduce((total, source) => total + source.rowCount, 0)} current raw records; all ${upstream.aggregations.length} aggregation derivations bind the formula, filters, and source-key-set hash`,
    bound: upstream.sources.length > 0 && upstream.aggregations.length > 0,
  }] : [];
  return [
    { id: `claim:${title}`, kind: "Claim", title, detail: "Testable natural-language statement", bound: Boolean(title.trim()) },
    { id: resultId, kind: "Comparison result", title: `${rule.field} version comparison`, detail: "Bound to this rule execution result, not a UI label", bound: true },
    { id: `metric:${rule.field}`, kind: "Metric", title: rule.field, detail: `Aggregation: ${rule.aggregation}`, bound: dataset.columns.includes(rule.field) },
    { id: `rule:${dataset.ruleVersion}`, kind: "Rule", title: dataset.ruleVersion, detail: "Deterministic rule-engine version", bound: true },
    { id: `field:${rule.field}`, kind: "Field", title: rule.field, detail: `Primary key: ${dataset.primaryKey}`, bound: dataset.columns.includes(rule.field) },
    { id: `records:${dataset.primaryKey}`, kind: "Source records", title: "Primary key + exact physical line", detail: "Large samples export only changes, boundary records, and the required sample", bound: true },
    ...upstreamNode,
    { id: `snapshot:${dataset.baselineMeta.sha256}`, kind: "Version", title: "SHA-256 snapshot", detail: "Raw bytes and normalized records are verified separately", bound: true },
  ];
}

export function completeEvidence(claim: Claim, dataset: DatasetVersion) {
  void dataset;
  return [...claim.evidence];
}

function thresholdStatus(value: number | null, rule: Extract<Rule, { type: "threshold" }>): ClaimStatus {
  if (value === null) return "UNTESTABLE";
  return evaluate(value, rule.operator, rule.threshold) ? "SUPPORTED" : "REVERSED";
}

function expectedThresholdMatchesRule(rule: Rule) {
  const spec = thresholdSpecForRule(rule);
  if (!spec) return false;
  if (rule.type === "threshold") return Math.abs(spec.value - rule.threshold) < 1e-9;
  if (rule.type === "stability") return Math.abs(spec.value - rule.supportTolerance) < 1e-9;
  return true;
}

function applyPreliminaryRule(status: ClaimStatus, reason: string, rule: Rule) {
  if (!ruleIsPreliminary(rule) && expectedThresholdMatchesRule(rule)) return { status, reason, preliminary: false };
  if (rule.type === "rank") return { status, reason, preliminary: false };
  return {
    status: "REVIEW_REQUIRED" as ClaimStatus,
    reason: `Preliminary diagnosis: ${reason} The threshold lacks a complete source, business rationale, and confirmer, so it cannot serve as a formal claim.`,
    preliminary: true,
  };
}

function rankStatus(result: ReturnType<typeof rankGroups>, rule: Extract<Rule, { type: "rank" }>) {
  if (!result) return { status: "UNTESTABLE" as ClaimStatus, reason: "No non-empty group can be computed." };
  const expected = String(rule.expectedGroup);
  if (!result.groups.some((item) => item.group === expected)) {
    return { status: "UNTESTABLE" as ClaimStatus, reason: `Expected group ${expected} is absent from the current effective sample.` };
  }
  const winnerNames = result.winners.map((item) => item.group);
  if (result.missingGroupRows > 0) {
    return { status: "REVIEW_REQUIRED" as ClaimStatus, reason: `${result.missingGroupRows} records have a missing group value, so the ranking requires review.` };
  }
  if (result.tied && (rule.tiePolicy ?? "require_unique") === "require_unique") {
    return { status: "REVIEW_REQUIRED" as ClaimStatus, reason: `${winnerNames.join(", ")} are tied for ${rule.rank === "max" ? "first" : "last"}, but the rule requires a unique rank.` };
  }
  return winnerNames.includes(expected)
    ? { status: "SUPPORTED" as ClaimStatus, reason: `${expected} ${result.tied ? "is among the tied extreme groups" : "is the unique extreme group"}.` }
    : { status: "REVERSED" as ClaimStatus, reason: `The ${rule.rank === "max" ? "highest" : "lowest"} group is ${winnerNames.join(", ")}, not expected group ${expected}.` };
}

function rankValue(result: ReturnType<typeof rankGroups>) {
  if (!result) return "Not computable";
  return result.winners.map((winner) => `${winner.group} ${formatNumber(winner.value)}`).join(" / ");
}

export function recomputeClaim(claim: Claim, dataset: DatasetVersion, runAt = new Date().toISOString()): Claim {
  const rule = claim.rule;
  if (!rule) {
    const status: ClaimStatus = "UNTESTABLE";
    return {
      ...claim,
      kind: claim.kind ?? "SNAPSHOT",
      status,
      baselineStatus: "UNTESTABLE",
      reason: "This claim is not bound to an executable rule and cannot be classified automatically.",
      action: "Bind the claim to a field, aggregation, and decision rule.",
      governance: { engineStatus: status, reviewDisposition: "PENDING", releaseStatus: "BLOCKED" },
      audit: { ruleVersion: dataset.ruleVersion, lastRunAt: runAt, baselineSha256: dataset.baselineMeta.sha256, currentSha256: dataset.currentMeta?.sha256, preliminary: false },
    };
  }

  const baselineProfile = sampleProfile(dataset.baselineRows, rule, dataset.primaryKey);
  const currentProfile = dataset.currentRows ? sampleProfile(dataset.currentRows, rule, dataset.primaryKey) : undefined;
  const profilesChanged = Boolean(currentProfile && sampleProfileChanged(baselineProfile, currentProfile));
  let baselineValue = "Not computable";
  let currentValue = dataset.currentRows ? "Not computable" : "No current version imported";
  let baselineStatus: ClaimStatus = "UNTESTABLE";
  let status: ClaimStatus = "UNTESTABLE";
  let reason = "";
  let action = "Complete the data and rerun the audit.";

  if (rule.type === "rank") {
    const baselineRank = rankGroups(dataset.baselineRows, rule);
    const currentRank = dataset.currentRows ? rankGroups(dataset.currentRows, rule) : null;
    const baselineResult = rankStatus(baselineRank, rule);
    const currentResult = dataset.currentRows ? rankStatus(currentRank, rule) : baselineResult;
    baselineValue = rankValue(baselineRank);
    currentValue = dataset.currentRows ? rankValue(currentRank) : "No current version imported";
    baselineStatus = baselineResult.status;
    status = currentResult.status;
    reason = currentResult.reason;
    if (dataset.currentRows && baselineStatus === "REVERSED" && status === "SUPPORTED") {
      status = "REVIEW_REQUIRED";
      reason = `The prior ranking claim changed from false to true. ${reason}`;
    }
    if (profilesChanged && status === "SUPPORTED") {
      status = "REVIEW_REQUIRED";
      reason += " The effective sample or group composition changed.";
    }
    action = status === "REVERSED" ? "Stop citing the prior ranking claim and inspect linked decisions." : status === "SUPPORTED" ? "The claim may continue to be cited." : "Review ties, missing groups, and sample composition before sign-off.";
  } else {
    const baselineFiltered = rowsForRule(dataset.baselineRows, rule);
    const currentFiltered = dataset.currentRows ? rowsForRule(dataset.currentRows, rule) : undefined;
    const baselineMetric = aggregate(baselineFiltered, rule.field, rule.aggregation);
    const currentMetric = currentFiltered ? aggregate(currentFiltered, rule.field, rule.aggregation) : null;
    baselineValue = baselineMetric === null ? "Not computable" : formatNumber(baselineMetric);
    currentValue = dataset.currentRows ? (currentMetric === null ? "Not computable" : formatNumber(currentMetric)) : "No current version imported";

    if (rule.type === "stability") {
      baselineStatus = "UNTESTABLE";
      if (!dataset.currentRows || currentMetric === null || baselineMetric === null) {
        status = "UNTESTABLE";
        reason = dataset.currentRows ? "At least one version has no valid values, so stability is untestable." : "A stability claim requires current-version data.";
      } else if (baselineMetric === 0) {
        const absoluteChange = Math.abs(currentMetric);
        if (currentMetric === 0) {
          status = "SUPPORTED";
          reason = "Both baseline and current values are 0, so the absolute change is 0.";
        } else if (rule.absoluteTolerance !== undefined && isThresholdConfirmed(absoluteThresholdSpecForRule(rule)) && Math.abs((absoluteThresholdSpecForRule(rule)?.value ?? Number.NaN) - rule.absoluteTolerance) < 1e-9) {
          status = absoluteChange <= rule.absoluteTolerance ? "SUPPORTED" : "REVIEW_REQUIRED";
          reason = absoluteChange <= rule.absoluteTolerance
            ? `The baseline is 0, so percentage change is undefined; absolute change ${formatNumber(absoluteChange)} does not exceed the confirmed support tolerance ${formatNumber(rule.absoluteTolerance)}.`
            : `The baseline is 0 and absolute change ${formatNumber(absoluteChange)} exceeds the support tolerance ${formatNumber(rule.absoluteTolerance)}; no independent absolute reversal threshold exists, so reversal cannot be assigned automatically.`;
        } else {
          status = "REVIEW_REQUIRED";
          reason = `The baseline is 0 and the current value is ${formatNumber(currentMetric)}; percentage change is undefined and no confirmed absolute-change tolerance exists.`;
        }
      } else {
        const delta = Math.abs((currentMetric - baselineMetric) / baselineMetric) * 100;
        if (delta <= rule.supportTolerance) {
          status = "SUPPORTED";
          reason = `${rule.aggregation} of ${rule.field} changed ${formatNumber(delta)}%, within the confirmed support tolerance of ${rule.supportTolerance}%.`;
        } else if (!stabilityReversalIsGoverned(rule)) {
          status = "REVIEW_REQUIRED";
          reason = `${rule.aggregation} of ${rule.field} changed ${formatNumber(delta)}%, exceeding the ${rule.supportTolerance}% support tolerance; the reversal threshold is not independently confirmed, so the engine cannot assign weakened or reversed automatically.`;
        } else if (delta < (rule.reversalThreshold ?? Number.POSITIVE_INFINITY)) {
          status = "WEAKENED";
          reason = `${rule.aggregation} of ${rule.field} changed ${formatNumber(delta)}%, between the ${rule.supportTolerance}% support tolerance and the confirmed ${rule.reversalThreshold}% reversal threshold.`;
        } else {
          status = "REVERSED";
          reason = `${rule.aggregation} of ${rule.field} changed ${formatNumber(delta)}%, reaching the confirmed reversal threshold of ${rule.reversalThreshold}%.`;
        }
      }
      const provenance = applyPreliminaryRule(status, reason, rule);
      status = provenance.status;
      reason = provenance.reason;
      if (profilesChanged && (status === "SUPPORTED" || status === "WEAKENED")) {
        status = "REVIEW_REQUIRED";
        reason += ` The metric is numerically stable, but the effective sample changed from ${baselineProfile.effectiveRows} to ${currentProfile?.effectiveRows ?? 0}, and missing rows changed from ${baselineProfile.missingRows} to ${currentProfile?.missingRows ?? 0}.`;
      }
      action = status === "SUPPORTED" ? "The claim may continue to be cited." : status === "WEAKENED" ? "Retain the direction but update the value and wording." : status === "REVERSED" ? "Update the claim and inspect linked decisions." : "Confirm threshold provenance and sample denominators before re-signing.";
    } else {
      baselineStatus = thresholdStatus(baselineMetric, rule);
      status = dataset.currentRows ? thresholdStatus(currentMetric, rule) : baselineStatus;
      reason = dataset.currentRows
        ? currentMetric === null
          ? "The current version has insufficient valid data to execute the threshold rule."
          : `Current ${rule.aggregation} is ${formatNumber(currentMetric)} and ${evaluate(currentMetric, rule.operator, rule.threshold) ? "satisfies" : "does not satisfy"} rule ${rule.operator} ${formatNumber(rule.threshold)}.`
        : `Baseline ${rule.aggregation} is ${baselineMetric === null ? "not computable" : formatNumber(baselineMetric)}.`;
      if (dataset.currentRows && baselineStatus === "REVERSED" && status === "SUPPORTED") {
        status = "REVIEW_REQUIRED";
        reason = `The claim changed from false to true. ${reason}`;
      }
      const provenance = applyPreliminaryRule(status, reason, rule);
      status = provenance.status;
      reason = provenance.reason;
      if (profilesChanged && status === "SUPPORTED") {
        status = "REVIEW_REQUIRED";
        reason += ` The metric still clears the threshold, but the effective sample changed from ${baselineProfile.effectiveRows} to ${currentProfile?.effectiveRows ?? 0}, and missing rows changed from ${baselineProfile.missingRows} to ${currentProfile?.missingRows ?? 0}.`;
      }
      action = status === "SUPPORTED" ? "The claim may continue to be cited." : status === "REVERSED" ? "Stop citing this claim and inspect linked decisions." : "Review threshold provenance, denominator, and sample composition before sign-off.";
    }
  }

  const { refs, scope } = sourceReferences(dataset, rule, claim.id);
  const kind = rule.type === "stability" ? "VERSION_COMPARISON" as const : "SNAPSHOT" as const;
  const sampleProfiles = { baseline: baselineProfile, current: currentProfile };
  const stableAudit = {
    ruleVersion: dataset.ruleVersion,
    baselineSha256: dataset.baselineMeta.sha256,
    currentSha256: dataset.currentMeta?.sha256,
    preliminary: ruleIsPreliminary(rule),
  };
  const resultIdentity = {
    claimId: claim.id,
    kind,
    code: claim.code,
    title: claim.title,
    section: claim.section,
    owner: claim.owner,
    category: claim.category,
    formula: claim.formula,
    decisionIds: claim.decisionIds ?? [],
    rule,
    status,
    baselineStatus,
    baselineValue,
    currentValue,
    reason,
    action,
    sourceRefs: refs,
    evidenceScope: scope,
    sampleProfiles,
    audit: stableAudit,
  };
  const resultId = `claim-result:${claim.id}:${sha256CanonicalSync(resultIdentity).slice(0, 24)}`;
  const sameSignedVersion = claim.governance
    && claim.resultId === resultId
    && claim.governance.engineStatus === status
    && claim.audit.ruleVersion === dataset.ruleVersion
    && claim.audit.baselineSha256 === dataset.baselineMeta.sha256
    && claim.audit.currentSha256 === dataset.currentMeta?.sha256;
  return {
    ...claim,
    kind,
    status,
    baselineStatus,
    baselineValue,
    currentValue,
    reason,
    action,
    sourceRefs: refs,
    evidenceScope: scope,
    sampleProfiles,
    resultId,
    evidence: makeEvidence(claim.title, rule, dataset, resultId),
    governance: sameSignedVersion
      ? claim.governance
      : { engineStatus: status, reviewDisposition: "PENDING", releaseStatus: "BLOCKED" },
    audit: {
      ruleVersion: dataset.ruleVersion,
      lastRunAt: runAt,
      baselineSha256: dataset.baselineMeta.sha256,
      currentSha256: dataset.currentMeta?.sha256,
      preliminary: stableAudit.preliminary,
    },
  };
}

export function numericColumns(dataset: DatasetVersion) {
  return dataset.columns.filter((column) => {
    if (column === dataset.primaryKey || /^(id|row_id|index|number|sequence)$/i.test(column) || /_id$/i.test(column)) return false;
    const values = dataset.baselineRows.map((row) => {
      const value = row[column];
      if (typeof value === "number") return Number.isFinite(value) ? value : null;
      const parsed = Number(String(value ?? "").replace(/[%,$¥，]/g, ""));
      return String(value ?? "").trim() && Number.isFinite(parsed) ? parsed : null;
    });
    return values.filter((value) => value !== null).length >= Math.max(1, Math.ceil(values.length * 0.65));
  });
}

export function makeImportedClaims(dataset: DatasetVersion, runAt = new Date().toISOString()): Claim[] {
  return numericColumns(dataset).slice(0, 6).map((field, index) => {
    const rule: Rule = {
      type: "stability",
      field,
      aggregation: "average",
      supportTolerance: 5,
      supportToleranceSpec: {
        value: 5,
        unit: "percent",
        source: "ClaimTrace automatic diagnostic default",
        rationale: "Used to surface potential changes; it does not represent a business-approved stability range",
      },
    };
    const claim: Claim = {
      id: `auto-${field}-${index}`,
      kind: "VERSION_COMPARISON",
      code: `CT-${String(index + 1).padStart(3, "0")}`,
      title: `The average ${field} remains stable after the data revision (change no greater than 5%)`,
      section: "Automatic data check",
      owner: "Unassigned",
      category: "Version stability",
      status: "REVIEW_REQUIRED",
      baselineStatus: "UNTESTABLE",
      baselineValue: "Computing",
      currentValue: "Computing",
      formula: `|mean(${field}_v2) − mean(${field}_v1)| ÷ |mean(${field}_v1)| ≤ 5%`,
      reason: "",
      action: "",
      sourceRefs: [],
      evidence: [],
      governance: { engineStatus: "REVIEW_REQUIRED", reviewDisposition: "PENDING", releaseStatus: "BLOCKED" },
      audit: { ruleVersion: dataset.ruleVersion || RULE_ENGINE_VERSION, lastRunAt: runAt, baselineSha256: dataset.baselineMeta.sha256, currentSha256: dataset.currentMeta?.sha256, preliminary: true },
      rule,
    };
    return recomputeClaim(claim, dataset, runAt);
  });
}
