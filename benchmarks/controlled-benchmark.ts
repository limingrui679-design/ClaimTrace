import { readFileSync } from "node:fs";
import {
  RULE_ENGINE_VERSION,
  type Claim,
  type ClaimStatus,
  type CsvRow,
  type DatasetVersion,
  type DecisionSpec,
  type DecisionStatus,
  type Rule,
  type SignedDecisionResult,
  compareRows,
  evaluateDecision,
  hashDecisionActionIdentitySync,
  hashDecisionInputProvenanceSync,
  hashDecisionPolicySync,
  recomputeClaim,
} from "../app/claimtrace-core";

const RUN_AT = "2026-08-08T00:00:00.000Z";
const BASE_HASH = "a".repeat(64);
const CURRENT_HASH = "b".repeat(64);

type ScenarioCategory =
  | "row_reorder"
  | "field_edit"
  | "add_remove"
  | "zero_baseline"
  | "missing_pattern"
  | "threshold_boundary"
  | "rank_edge"
  | "decision_identity";
type ScenarioOutput = number | ClaimStatus | DecisionStatus | "NO_CLAIM_STATUS";

interface Scenario {
  id: string;
  category: ScenarioCategory;
  claimtrace: () => ScenarioOutput;
  naive: () => ScenarioOutput;
}

const LABEL_FILE = JSON.parse(readFileSync(new URL("./labels.json", import.meta.url), "utf8")) as {
  labels: Record<string, number | ClaimStatus | DecisionStatus>;
};

function dataset(baselineRows: CsvRow[], currentRows: CsvRow[]): DatasetVersion {
  const columns = [...new Set([...baselineRows, ...currentRows].flatMap((row) => Object.keys(row)))];
  return {
    projectName: "Controlled benchmark",
    baselineName: "baseline",
    currentName: "current",
    baselineRows,
    currentRows,
    baselineLineNumbers: baselineRows.map((_, index) => index + 2),
    currentLineNumbers: currentRows.map((_, index) => index + 2),
    baselineMeta: { fileName: "baseline.csv", sha256: BASE_HASH, hashVerified: true, verification: { status: "verified", recomputedSha256: BASE_HASH }, generatedAt: RUN_AT, rowCount: baselineRows.length, byteSize: 100 },
    currentMeta: { fileName: "current.csv", sha256: CURRENT_HASH, hashVerified: true, verification: { status: "verified", recomputedSha256: CURRENT_HASH }, generatedAt: RUN_AT, rowCount: currentRows.length, byteSize: 100 },
    columns,
    primaryKey: "id",
    ruleVersion: RULE_ENGINE_VERSION,
    isDemo: false,
  };
}

function governedRule(rule: Rule): Rule {
  if (rule.type === "threshold") {
    return { ...rule, thresholdSpec: rule.thresholdSpec ?? { value: rule.threshold, unit: "score", source: "benchmark policy", rationale: "controlled label", confirmedBy: "benchmark owner", confirmedAt: RUN_AT } };
  }
  if (rule.type === "stability") {
    return { ...rule, supportToleranceSpec: rule.supportToleranceSpec ?? { value: rule.supportTolerance, unit: "percent", source: "benchmark SLA", rationale: "controlled label", confirmedBy: "benchmark owner", confirmedAt: RUN_AT } };
  }
  return rule;
}

function claim(rule: Rule, data: DatasetVersion) {
  const governed = governedRule(rule);
  const seed: Claim = {
    id: "benchmark-claim",
    kind: rule.type === "stability" ? "VERSION_COMPARISON" : "SNAPSHOT",
    code: "BM-001",
    title: "Controlled claim",
    section: "benchmark",
    owner: "benchmark",
    category: "benchmark",
    status: "REVIEW_REQUIRED",
    baselineStatus: "UNTESTABLE",
    baselineValue: "",
    currentValue: "",
    formula: "controlled formula",
    reason: "",
    action: "",
    sourceRefs: [],
    evidence: [],
    governance: { engineStatus: "REVIEW_REQUIRED", reviewDisposition: "PENDING", releaseStatus: "BLOCKED" },
    audit: { ruleVersion: RULE_ENGINE_VERSION, lastRunAt: RUN_AT, baselineSha256: BASE_HASH, currentSha256: CURRENT_HASH, preliminary: false },
    rule: governed,
  };
  return recomputeClaim(seed, data, RUN_AT);
}

function lineNumberDiff(baseline: CsvRow[], current: CsvRow[]) {
  const length = Math.max(baseline.length, current.length);
  let changed = 0;
  for (let index = 0; index < length; index += 1) {
    if (JSON.stringify(baseline[index] ?? null) !== JSON.stringify(current[index] ?? null)) changed += 1;
  }
  return changed;
}

function mean(rows: CsvRow[], field: string) {
  const values = rows.map((row) => String(row[field] ?? "").trim()).filter(Boolean).map(Number).filter(Number.isFinite);
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : Number.NaN;
}

function naiveStability(baseline: CsvRow[], current: CsvRow[]) {
  const before = mean(baseline, "value");
  const after = mean(current, "value");
  if (!Number.isFinite(before) || !Number.isFinite(after)) return "REVERSED" as ClaimStatus;
  return Math.abs((after - before) / (before || 100)) * 100 <= 5 ? "SUPPORTED" as ClaimStatus : "REVERSED" as ClaimStatus;
}

function addDiffScenario(result: Scenario[], id: string, category: Extract<ScenarioCategory, "row_reorder" | "field_edit" | "add_remove">, baseline: CsvRow[], current: CsvRow[]) {
  const data = dataset(baseline, current);
  result.push({ id, category, claimtrace: () => compareRows(data), naive: () => lineNumberDiff(baseline, current) });
}

function addClaimScenario(result: Scenario[], id: string, category: Extract<ScenarioCategory, "zero_baseline" | "missing_pattern" | "threshold_boundary" | "rank_edge">, baseline: CsvRow[], current: CsvRow[], rule: Rule, naive: () => ClaimStatus) {
  const data = dataset(baseline, current);
  result.push({ id, category, claimtrace: () => claim(rule, data).status, naive });
}

function decisionScenario(history: "none" | "same" | "outcome" | "recommendation" | "feasible" | "spec" | "snapshot" | "incomplete") {
  const data = dataset([{ id: "A", value: 12 }], [{ id: "A", value: 12 }]);
  const boundClaim = claim({ type: "threshold", field: "value", aggregation: "average", operator: ">=", threshold: 10 }, data);
  const baseDecision: DecisionSpec = {
    id: "benchmark-decision",
    title: "Choose an action",
    owner: "benchmark",
    passActionId: "benchmark:proceed",
    holdActionId: "benchmark:hold",
    actionIfPass: "Proceed",
    actionIfFail: "Hold",
    conditions: [{ claimId: boundClaim.id, allowedStatuses: ["SUPPORTED"] }],
    options: [
      { id: "A", label: "Option A", benefit: 12, cost: 2, risk: 1, capacity: 1 },
      { id: "B", label: "Option B", benefit: 8, cost: 2, risk: 1, capacity: 1 },
    ],
    inputProvenance: {
      kind: "MANUAL_ASSUMPTION",
      source: "controlled benchmark fixture",
      version: "1.0.0",
      rationale: "deterministic decision-identity regression inputs",
      units: { benefit: "points", cost: "points", risk: "points", capacity: "points" },
    },
  };
  const completeHistory: SignedDecisionResult = {
    versionId: "signed-v1",
    outcome: "PASS",
    activeActionId: baseDecision.passActionId,
    actionIdentityHash: hashDecisionActionIdentitySync(baseDecision, "PASS"),
    recommendedOptionId: "A",
    feasibleOptionIds: ["A", "B"],
    decisionPolicyHash: hashDecisionPolicySync(baseDecision),
    decisionInputProvenanceHash: hashDecisionInputProvenanceSync(baseDecision),
    baselineSha256: BASE_HASH,
    currentSha256: CURRENT_HASH,
    ruleVersion: RULE_ENGINE_VERSION,
    claimResultIds: [boundClaim.resultId ?? "missing-result"],
    historyBasis: "RECORDED_IDENTITY",
    reviewRecordId: "review-signed-v1",
    reviewRecordHash: "c".repeat(64),
    signedAt: RUN_AT,
    signedBy: "benchmark owner",
  };
  let priorSignedResult: SignedDecisionResult | undefined;
  if (history !== "none") priorSignedResult = { ...completeHistory };
  if (history === "outcome" && priorSignedResult) priorSignedResult.outcome = "HOLD";
  if (history === "recommendation" && priorSignedResult) priorSignedResult.recommendedOptionId = "B";
  if (history === "feasible" && priorSignedResult) priorSignedResult.feasibleOptionIds = ["A"];
  if (history === "spec" && priorSignedResult) priorSignedResult.decisionPolicyHash = "d".repeat(64);
  if (history === "snapshot" && priorSignedResult) priorSignedResult.currentSha256 = "e".repeat(64);
  if (history === "incomplete" && priorSignedResult) priorSignedResult.reviewRecordHash = "not-a-sha256";
  const decision = { ...baseDecision, priorSignedResult };
  const evaluated = evaluateDecision(decision, [boundClaim]);
  const naive: DecisionStatus = priorSignedResult && priorSignedResult.outcome !== evaluated.currentOutcome
    ? "DECISION_CHANGED"
    : "SUPPORTED";
  return { evaluated, naive };
}

function scenarios(): Scenario[] {
  const result: Scenario[] = [];

  addDiffScenario(result, "reorder-reverse", "row_reorder", [{ id: "A", value: 1 }, { id: "B", value: 2 }, { id: "C", value: 3 }], [{ id: "C", value: 3 }, { id: "B", value: 2 }, { id: "A", value: 1 }]);
  addDiffScenario(result, "reorder-rotate", "row_reorder", [{ id: "A", value: 1 }, { id: "B", value: 2 }, { id: "C", value: 3 }, { id: "D", value: 4 }], [{ id: "C", value: 3 }, { id: "D", value: 4 }, { id: "A", value: 1 }, { id: "B", value: 2 }]);
  addDiffScenario(result, "reorder-adjacent", "row_reorder", [{ id: "A", value: 1 }, { id: "B", value: 2 }, { id: "C", value: 3 }], [{ id: "B", value: 2 }, { id: "A", value: 1 }, { id: "C", value: 3 }]);
  addDiffScenario(result, "reorder-unicode", "row_reorder", [{ id: "Å-1", value: "high" }, { id: "É-2", value: "low" }], [{ id: "É-2", value: "low" }, { id: "Å-1", value: "high" }]);
  addDiffScenario(result, "reorder-natural-ids", "row_reorder", [{ id: "R-2", value: 2 }, { id: "R-10", value: 10 }, { id: "R-1", value: 1 }], [{ id: "R-1", value: 1 }, { id: "R-2", value: 2 }, { id: "R-10", value: 10 }]);
  addDiffScenario(result, "reorder-with-missing", "row_reorder", [{ id: "A", value: "" }, { id: "B", value: 2 }], [{ id: "B", value: 2 }, { id: "A", value: "" }]);
  addDiffScenario(result, "reorder-wide-rows", "row_reorder", [{ id: "A", value: 1, note: "x", flag: 0 }, { id: "B", value: 2, note: "y", flag: 1 }], [{ id: "B", value: 2, note: "y", flag: 1 }, { id: "A", value: 1, note: "x", flag: 0 }]);
  addDiffScenario(result, "reorder-five-cycle", "row_reorder", Array.from({ length: 5 }, (_, index) => ({ id: `K-${index}`, value: index })), [{ id: "K-4", value: 4 }, { id: "K-0", value: 0 }, { id: "K-1", value: 1 }, { id: "K-2", value: 2 }, { id: "K-3", value: 3 }]);

  addDiffScenario(result, "edit-numeric", "field_edit", [{ id: "A", value: 10 }], [{ id: "A", value: 11 }]);
  addDiffScenario(result, "edit-string", "field_edit", [{ id: "A", value: 10, note: "old" }], [{ id: "A", value: 10, note: "new" }]);
  addDiffScenario(result, "edit-two-fields-one-row", "field_edit", [{ id: "A", value: 10, note: "old" }], [{ id: "A", value: 11, note: "new" }]);
  addDiffScenario(result, "edit-two-rows", "field_edit", [{ id: "A", value: 10 }, { id: "B", value: 20 }], [{ id: "A", value: 11 }, { id: "B", value: 21 }]);
  addDiffScenario(result, "edit-missing-to-value", "field_edit", [{ id: "A", value: "" }], [{ id: "A", value: 4 }]);
  addDiffScenario(result, "edit-value-to-missing", "field_edit", [{ id: "A", value: 4 }], [{ id: "A", value: "" }]);
  addDiffScenario(result, "edit-equivalent-representation", "field_edit", [{ id: "A", value: 10 }], [{ id: "A", value: "10" }]);
  addDiffScenario(result, "edit-new-field", "field_edit", [{ id: "A", value: 10 }], [{ id: "A", value: 10, note: "added" }]);

  addDiffScenario(result, "membership-add-one", "add_remove", [{ id: "A", value: 1 }], [{ id: "A", value: 1 }, { id: "B", value: 2 }]);
  addDiffScenario(result, "membership-remove-one", "add_remove", [{ id: "A", value: 1 }, { id: "B", value: 2 }], [{ id: "A", value: 1 }]);
  addDiffScenario(result, "membership-replace-one", "add_remove", [{ id: "A", value: 1 }, { id: "B", value: 2 }], [{ id: "B", value: 2 }, { id: "C", value: 3 }]);
  addDiffScenario(result, "membership-add-two", "add_remove", [{ id: "A", value: 1 }], [{ id: "A", value: 1 }, { id: "B", value: 2 }, { id: "C", value: 3 }]);
  addDiffScenario(result, "membership-remove-two", "add_remove", [{ id: "A", value: 1 }, { id: "B", value: 2 }, { id: "C", value: 3 }], [{ id: "A", value: 1 }]);
  addDiffScenario(result, "membership-replace-and-reorder", "add_remove", [{ id: "A", value: 1 }, { id: "B", value: 2 }, { id: "C", value: 3 }], [{ id: "C", value: 3 }, { id: "D", value: 4 }, { id: "B", value: 2 }]);
  addDiffScenario(result, "membership-from-empty", "add_remove", [], [{ id: "A", value: 1 }, { id: "B", value: 2 }]);
  addDiffScenario(result, "membership-to-empty", "add_remove", [{ id: "A", value: 1 }, { id: "B", value: 2 }], []);

  const support5: Rule = { type: "stability", field: "value", aggregation: "average", supportTolerance: 5 };
  const absolute5: Rule = { ...support5, absoluteTolerance: 5, absoluteToleranceSpec: { value: 5, unit: "absolute", source: "benchmark zero-baseline policy", rationale: "absolute change is used when percentage is undefined", confirmedBy: "benchmark owner", confirmedAt: RUN_AT } };
  addClaimScenario(result, "zero-both-zero", "zero_baseline", [{ id: "A", value: 0 }], [{ id: "A", value: 0 }], support5, () => "SUPPORTED");
  addClaimScenario(result, "zero-positive-no-policy", "zero_baseline", [{ id: "A", value: 0 }], [{ id: "A", value: 4 }], support5, () => "SUPPORTED");
  addClaimScenario(result, "zero-negative-no-policy", "zero_baseline", [{ id: "A", value: 0 }], [{ id: "A", value: -4 }], support5, () => "SUPPORTED");
  addClaimScenario(result, "zero-absolute-within", "zero_baseline", [{ id: "A", value: 0 }], [{ id: "A", value: 4 }], absolute5, () => "SUPPORTED");
  addClaimScenario(result, "zero-absolute-boundary", "zero_baseline", [{ id: "A", value: 0 }], [{ id: "A", value: 5 }], absolute5, () => "SUPPORTED");
  addClaimScenario(result, "zero-absolute-over", "zero_baseline", [{ id: "A", value: 0 }], [{ id: "A", value: 5.01 }], absolute5, () => "REVERSED");
  addClaimScenario(result, "zero-unconfirmed-absolute", "zero_baseline", [{ id: "A", value: 0 }], [{ id: "A", value: 4 }], { ...support5, absoluteTolerance: 5 }, () => "SUPPORTED");
  addClaimScenario(result, "zero-from-balanced-values", "zero_baseline", [{ id: "A", value: -1 }, { id: "B", value: 1 }], [{ id: "A", value: -1 }, { id: "B", value: 2 }], { ...absolute5, absoluteTolerance: 1, absoluteToleranceSpec: { value: 1, unit: "absolute", source: "benchmark zero-baseline policy", rationale: "balanced baseline uses a one-point absolute band", confirmedBy: "benchmark owner", confirmedAt: RUN_AT } }, () => "SUPPORTED");

  addClaimScenario(result, "missing-current-one", "missing_pattern", [{ id: "A", value: 100 }, { id: "B", value: 100 }], [{ id: "A", value: 100 }, { id: "B", value: "" }], support5, () => naiveStability([{ id: "A", value: 100 }, { id: "B", value: 100 }], [{ id: "A", value: 100 }, { id: "B", value: "" }]));
  addClaimScenario(result, "missing-baseline-one", "missing_pattern", [{ id: "A", value: 100 }, { id: "B", value: "" }], [{ id: "A", value: 100 }, { id: "B", value: 100 }], support5, () => "SUPPORTED");
  addClaimScenario(result, "missing-same-both", "missing_pattern", [{ id: "A", value: 100 }, { id: "B", value: "" }], [{ id: "A", value: 100 }, { id: "B", value: "" }], support5, () => "SUPPORTED");
  addClaimScenario(result, "missing-all-current", "missing_pattern", [{ id: "A", value: 100 }], [{ id: "A", value: "" }], support5, () => "REVERSED");
  addClaimScenario(result, "missing-all-baseline", "missing_pattern", [{ id: "A", value: "" }], [{ id: "A", value: 100 }], support5, () => "REVERSED");
  addClaimScenario(result, "missing-row-removed", "missing_pattern", [{ id: "A", value: 100 }, { id: "B", value: 100 }], [{ id: "A", value: 100 }], support5, () => "SUPPORTED");
  addClaimScenario(result, "missing-row-added-empty", "missing_pattern", [{ id: "A", value: 100 }], [{ id: "A", value: 100 }, { id: "B", value: "" }], support5, () => "SUPPORTED");
  addClaimScenario(result, "missing-filter-membership", "missing_pattern", [{ id: "A", cohort: "in", value: 100 }, { id: "B", cohort: "out", value: 100 }], [{ id: "A", cohort: "in", value: 100 }, { id: "B", cohort: "in", value: 100 }], { ...support5, filters: [{ field: "cohort", equals: "in" }] }, () => "SUPPORTED");

  const addThreshold = (id: string, baselineValue: number, currentValue: number, operator: ">" | ">=" | "<" | "<=" | "=", threshold: number) => {
    addClaimScenario(result, id, "threshold_boundary", [{ id: "A", value: baselineValue }], [{ id: "A", value: currentValue }], { type: "threshold", field: "value", aggregation: "average", operator, threshold }, () => currentValue >= threshold ? "SUPPORTED" : "REVERSED");
  };
  addThreshold("threshold-gte-exact", 10, 10, ">=", 10);
  addThreshold("threshold-gt-exact", 10, 10, ">", 10);
  addThreshold("threshold-lte-exact", 10, 10, "<=", 10);
  addThreshold("threshold-lt-exact", 10, 10, "<", 10);
  addThreshold("threshold-equal-inside-epsilon", 10, 10 + 0.0000000005, "=", 10);
  addThreshold("threshold-equal-outside-epsilon", 10, 10 + 0.000000002, "=", 10);
  addThreshold("threshold-newly-supported", 9, 11, ">=", 10);
  addThreshold("threshold-newly-reversed", 11, 9, ">=", 10);

  const addRank = (id: string, rows: CsvRow[], expectedGroup: string, tiePolicy: "allow_tied" | "require_unique" = "require_unique") => {
    addClaimScenario(result, id, "rank_edge", rows, rows.map((row) => ({ ...row })), { type: "rank", field: "value", aggregation: "average", groupField: "group", expectedGroup, rank: "max", tiePolicy }, () => "REVERSED");
  };
  addRank("rank-two-way-tie", [{ id: "A", group: "Alpha", value: 10 }, { id: "B", group: "Beta", value: 10 }], "Beta");
  addRank("rank-three-way-tie", [{ id: "A", group: "Alpha", value: 10 }, { id: "B", group: "Beta", value: 10 }, { id: "C", group: "Gamma", value: 10 }], "Beta");
  addRank("rank-tie-allowed", [{ id: "A", group: "Alpha", value: 10 }, { id: "B", group: "Beta", value: 10 }], "Beta", "allow_tied");
  addRank("rank-near-tie-distinct", [{ id: "A", group: "Alpha", value: 10 }, { id: "B", group: "Beta", value: 10.000000002 }], "Beta");
  addRank("rank-near-tie-within-epsilon", [{ id: "A", group: "Alpha", value: 10 }, { id: "B", group: "Beta", value: 10.0000000005 }], "Beta");
  addRank("rank-expected-group-absent", [{ id: "A", group: "Alpha", value: 10 }, { id: "C", group: "Gamma", value: 8 }], "Beta");
  addRank("rank-missing-group-row", [{ id: "A", group: "Beta", value: 10 }, { id: "B", group: "", value: 2 }], "Beta");
  addRank("rank-unique-wrong-group", [{ id: "A", group: "Alpha", value: 12 }, { id: "B", group: "Beta", value: 10 }], "Beta");

  for (const variant of ["none", "same", "outcome", "recommendation", "feasible", "spec", "snapshot", "incomplete"] as const) {
    const decision = decisionScenario(variant);
    result.push({ id: `decision-${variant}`, category: "decision_identity", claimtrace: () => decision.evaluated.status, naive: () => decision.naive });
  }
  return result;
}

export function runControlledBenchmark() {
  const catalog = scenarios();
  const scenarioIds = new Set(catalog.map((scenario) => scenario.id));
  const labelIds = Object.keys(LABEL_FILE.labels);
  if (labelIds.length !== catalog.length || labelIds.some((id) => !scenarioIds.has(id))) throw new Error("Independent benchmark labels do not match the scenario catalog");
  const outcomes = catalog.map((scenario) => {
    const expected = LABEL_FILE.labels[scenario.id];
    const claimtraceOutput = scenario.claimtrace();
    const naiveOutput = scenario.naive();
    const metricOnlyOutput = scenario.category === "row_reorder" ? 0 : naiveOutput;
    const diffOnlyOutput = ["row_reorder", "field_edit", "add_remove"].includes(scenario.category) ? claimtraceOutput : "NO_CLAIM_STATUS";
    const withoutDenominatorOutput = scenario.category === "missing_pattern" ? naiveOutput : claimtraceOutput;
    const withoutThresholdGovernanceOutput = scenario.category === "zero_baseline" ? naiveOutput : claimtraceOutput;
    const withoutDecisionIdentityOutput = scenario.category === "decision_identity" ? naiveOutput : claimtraceOutput;
    return {
      id: scenario.id,
      category: scenario.category,
      expected,
      claimtraceOutput,
      naiveOutput,
      metricOnlyOutput,
      diffOnlyOutput,
      withoutDenominatorOutput,
      withoutThresholdGovernanceOutput,
      withoutDecisionIdentityOutput,
      claimtraceCorrect: claimtraceOutput === expected,
      naiveCorrect: naiveOutput === expected,
      metricOnlyCorrect: metricOnlyOutput === expected,
      diffOnlyCorrect: diffOnlyOutput === expected,
    };
  });
  const byCategory = Object.fromEntries([...new Set(outcomes.map((item) => item.category))].map((category) => {
    const items = outcomes.filter((item) => item.category === category);
    return [category, { scenarios: items.length, claimtraceCorrect: items.filter((item) => item.claimtraceCorrect).length, naiveCorrect: items.filter((item) => item.naiveCorrect).length }];
  }));
  const claimtraceCorrect = outcomes.filter((item) => item.claimtraceCorrect).length;
  const naiveCorrect = outcomes.filter((item) => item.naiveCorrect).length;
  const modelMetrics = (field: "claimtraceOutput" | "naiveOutput" | "metricOnlyOutput" | "diffOnlyOutput") => {
    const relevant = outcomes.filter((item) => typeof item.expected === "string");
    const truePositive = relevant.filter((item) => item.expected === "REVIEW_REQUIRED" && item[field] === "REVIEW_REQUIRED").length;
    const falsePositive = relevant.filter((item) => item.expected !== "REVIEW_REQUIRED" && item[field] === "REVIEW_REQUIRED").length;
    const falseNegative = relevant.filter((item) => item.expected === "REVIEW_REQUIRED" && item[field] !== "REVIEW_REQUIRED").length;
    const falseReassurance = relevant.filter((item) => item.expected === "REVIEW_REQUIRED" && item[field] === "SUPPORTED").length;
    return {
      reviewPrecision: truePositive + falsePositive ? truePositive / (truePositive + falsePositive) : 0,
      reviewRecall: truePositive + falseNegative ? truePositive / (truePositive + falseNegative) : 0,
      falseReassuranceRate: relevant.length ? falseReassurance / relevant.length : 0,
      classificationErrors: relevant.filter((item) => item[field] !== item.expected).length,
    };
  };
  return {
    benchmarkVersion: "claimtrace-controlled/3.0.0",
    labelSource: "benchmarks/labels.json",
    design: "64 distinct controlled scenarios across 8 edge-case families; plus deterministic property tests",
    generatedAt: RUN_AT,
    scenarioCount: outcomes.length,
    metrics: {
      claimtraceCorrect,
      claimtraceAccuracy: claimtraceCorrect / outcomes.length,
      naiveCorrect,
      naiveAccuracy: naiveCorrect / outcomes.length,
      metricOnlyCorrect: outcomes.filter((item) => item.metricOnlyCorrect).length,
      metricOnlyAccuracy: outcomes.filter((item) => item.metricOnlyCorrect).length / outcomes.length,
      diffOnlyCorrect: outcomes.filter((item) => item.diffOnlyCorrect).length,
      diffOnlyAccuracy: outcomes.filter((item) => item.diffOnlyCorrect).length / outcomes.length,
    },
    classification: {
      claimtrace: modelMetrics("claimtraceOutput"),
      lineOrScalarBaseline: modelMetrics("naiveOutput"),
      metricOnlyBaseline: modelMetrics("metricOnlyOutput"),
      keyedDiffOnlyBaseline: modelMetrics("diffOnlyOutput"),
    },
    ablations: {
      withoutDenominatorAwarenessCorrect: outcomes.filter((item) => item.withoutDenominatorOutput === item.expected).length,
      withoutThresholdGovernanceCorrect: outcomes.filter((item) => item.withoutThresholdGovernanceOutput === item.expected).length,
      withoutDecisionIdentityCorrect: outcomes.filter((item) => item.withoutDecisionIdentityOutput === item.expected).length,
    },
    byCategory,
    outcomes,
    disclosure: "Controlled synthetic scenarios and deterministic properties test known edge cases. These results do not estimate production impact or external validity.",
  };
}
