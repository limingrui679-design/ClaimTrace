import assert from "node:assert/strict";
import test from "node:test";
import {
  RULE_ENGINE_VERSION,
  type Claim,
  type CsvRow,
  type DecisionSpec,
  type DatasetVersion,
  type Rule,
  type SignedDecisionResult,
  appendReviewRecord,
  applyReviewToClaim,
  applyReviewToDecision,
  aggregate,
  auditSummary,
  buildHtmlReport,
  bytesToBase64,
  compareRows,
  computeEvidenceCompleteness,
  createEvidencePackage,
  createReviewRecord,
  decodeBuffer,
  diffRowsByKey,
  enforceDecisionReleaseDependencies,
  evaluateDecision,
  hashDecisionActionIdentitySync,
  hashClaimResult,
  hashDecisionResult,
  escapeHtml,
  evaluate,
  makeImportedClaims,
  numericColumns,
  parseCSV,
  recomputeClaim,
  sha256Hex,
  sha256Canonical,
  sha256CanonicalSync,
  sha256Text,
  uniqueKeyCandidates,
  validatePrimaryKey,
  verifyEvidencePackage,
  verifyAuditBundleChain,
  verifyReviewChain,
  verifySnapshot,
} from "../app/claimtrace-core";

const BASE_HASH = "a".repeat(64);
const CURRENT_HASH = "b".repeat(64);
const RUN_AT = "2026-08-07T09:00:00.000Z";
const TEST_ACTIONS = { passActionId: "test:pass", holdActionId: "test:hold" } as const;
const TEST_DECISION_INPUTS = {
  inputProvenance: {
    kind: "MANUAL_ASSUMPTION" as const,
    source: "deterministic test fixture",
    version: "1.0.0",
    rationale: "controlled option-scoring inputs",
    units: { benefit: "points", cost: "points", risk: "points", capacity: "slots" },
  },
  uncertainty: {
    method: "BOUNDED_UNIFORM" as const,
    benefitMultiplier: [0.8, 1.2] as [number, number],
    costMultiplier: [0.85, 1.2] as [number, number],
    riskMultiplier: [0.8, 1.25] as [number, number],
    capacityMultiplier: [0.9, 1.15] as [number, number],
    trials: 512,
    seed: "deterministic-test-v1",
    stabilitySweep: { parameter: "benefitMultiplier" as const, min: 0.5, max: 1.5, step: 0.05 },
  },
};

function makeDataset(baselineRows: CsvRow[], currentRows?: CsvRow[], options: Partial<DatasetVersion> = {}): DatasetVersion {
  const columns = options.columns ?? [...new Set([...baselineRows, ...(currentRows ?? [])].flatMap((row) => Object.keys(row)))];
  return {
    projectName: "Test project",
    baselineName: "v1",
    currentName: currentRows ? "v2" : undefined,
    baselineRows,
    currentRows,
    baselineLineNumbers: options.baselineLineNumbers ?? baselineRows.map((_, index) => index + 2),
    currentLineNumbers: currentRows ? (options.currentLineNumbers ?? currentRows.map((_, index) => index + 2)) : undefined,
    baselineMeta: options.baselineMeta ?? { fileName: "baseline.csv", sha256: BASE_HASH, hashVerified: true, verification: { status: "verified", method: "raw-bytes+normalized-rows", verifiedAt: RUN_AT, recomputedSha256: BASE_HASH }, generatedAt: RUN_AT, rowCount: baselineRows.length, byteSize: 100 },
    currentMeta: currentRows ? (options.currentMeta ?? { fileName: "current.csv", sha256: CURRENT_HASH, hashVerified: true, verification: { status: "verified", method: "raw-bytes+normalized-rows", verifiedAt: RUN_AT, recomputedSha256: CURRENT_HASH }, generatedAt: RUN_AT, rowCount: currentRows.length, byteSize: 110 }) : undefined,
    baselineRawText: options.baselineRawText,
    currentRawText: options.currentRawText,
    baselineRawBytesBase64: options.baselineRawBytesBase64,
    currentRawBytesBase64: options.currentRawBytesBase64,
    columns,
    primaryKey: options.primaryKey ?? "id",
    ruleVersion: options.ruleVersion ?? RULE_ENGINE_VERSION,
    isDemo: false,
  };
}

function makeClaim(rule?: Rule, title = "Test claim"): Claim {
  const governedRule: Rule | undefined = rule?.type === "threshold" ? {
    ...rule,
    thresholdSpec: { value: rule.threshold, unit: "score", source: "test policy", rationale: "test threshold", confirmedBy: "tester", confirmedAt: RUN_AT },
  } : rule?.type === "stability" ? {
    ...rule,
    supportToleranceSpec: { value: rule.supportTolerance, unit: "percent", source: "test SLA", rationale: "test tolerance", confirmedBy: "tester", confirmedAt: RUN_AT },
    reversalThresholdSpec: rule.reversalThreshold === undefined ? undefined : { value: rule.reversalThreshold, unit: "percent", source: "test risk policy", rationale: "material reversal boundary", confirmedBy: "tester", confirmedAt: RUN_AT },
    absoluteToleranceSpec: rule.absoluteTolerance === undefined ? undefined : { value: rule.absoluteTolerance, unit: "absolute", source: "test SLA", rationale: "zero baseline fallback", confirmedBy: "tester", confirmedAt: RUN_AT },
  } : rule;
  return {
    id: "claim-1",
    kind: rule?.type === "stability" ? "VERSION_COMPARISON" : "SNAPSHOT",
    code: "CT-001",
    title,
    section: "Test section",
    owner: "tester",
    category: "Test category",
    status: "REVIEW_REQUIRED",
    baselineStatus: "UNTESTABLE",
    baselineValue: "",
    currentValue: "",
    formula: rule ? "executable formula" : "",
    reason: "",
    action: "",
    sourceRefs: [],
    evidence: [],
    governance: { engineStatus: "REVIEW_REQUIRED", reviewDisposition: "PENDING", releaseStatus: "BLOCKED" },
    audit: { ruleVersion: RULE_ENGINE_VERSION, lastRunAt: RUN_AT, baselineSha256: BASE_HASH, currentSha256: CURRENT_HASH, preliminary: false },
    rule: governedRule,
  };
}

function signedHistoryFor(
  decision: DecisionSpec,
  claims: Claim[],
  overrides: Partial<Pick<SignedDecisionResult, "outcome" | "activeActionId" | "actionIdentityHash" | "recommendedOptionId" | "feasibleOptionIds" | "decisionPolicyHash" | "decisionInputProvenanceHash" | "baselineSha256" | "currentSha256" | "ruleVersion" | "claimResultIds">> = {},
): SignedDecisionResult {
  const current = evaluateDecision({ ...decision, priorSignedResult: undefined }, claims);
  const outcome = overrides.outcome ?? current.currentOutcome;
  return {
    versionId: "signed-v1",
    outcome,
    activeActionId: overrides.activeActionId ?? (outcome === "PASS" ? decision.passActionId : outcome === "HOLD" ? decision.holdActionId : `review-required:${decision.id}`),
    actionIdentityHash: overrides.actionIdentityHash ?? hashDecisionActionIdentitySync(decision, outcome),
    recommendedOptionId: overrides.recommendedOptionId === undefined ? current.binding.recommendedOptionId : overrides.recommendedOptionId,
    feasibleOptionIds: overrides.feasibleOptionIds ?? current.binding.feasibleOptionIds,
    decisionPolicyHash: overrides.decisionPolicyHash ?? current.binding.decisionPolicyHash,
    decisionInputProvenanceHash: overrides.decisionInputProvenanceHash ?? current.binding.decisionInputProvenanceHash,
    baselineSha256: overrides.baselineSha256 ?? current.binding.baselineSha256,
    currentSha256: overrides.currentSha256 === undefined ? current.binding.currentSha256 : overrides.currentSha256,
    ruleVersion: overrides.ruleVersion ?? current.binding.ruleVersion,
    claimResultIds: overrides.claimResultIds ?? current.binding.claimResultIds,
    historyBasis: "RECORDED_IDENTITY",
    reviewRecordId: "review-signed-v1",
    reviewRecordHash: "c".repeat(64),
    signedAt: RUN_AT,
    signedBy: "owner",
  };
}

async function makeVerifiableDataset(baselineRaw: string, currentRaw?: string) {
  const baseline = parseCSV(baselineRaw);
  const current = currentRaw ? parseCSV(currentRaw) : undefined;
  const baselineHash = await sha256Text(baselineRaw);
  const currentHash = currentRaw ? await sha256Text(currentRaw) : undefined;
  const baselineNormalized = await sha256Text(JSON.stringify(baseline.rows.map((row) => baseline.columns.map((column) => String(row[column] ?? "")))));
  const currentNormalized = current ? await sha256Text(JSON.stringify(current.rows.map((row) => current.columns.map((column) => String(row[column] ?? ""))))) : undefined;
  return makeDataset(baseline.rows, current?.rows, {
    columns: baseline.columns,
    baselineLineNumbers: baseline.lineNumbers,
    currentLineNumbers: current?.lineNumbers,
    baselineRawText: baselineRaw,
    currentRawText: currentRaw,
    baselineRawBytesBase64: bytesToBase64(new TextEncoder().encode(baselineRaw).buffer as ArrayBuffer),
    currentRawBytesBase64: currentRaw ? bytesToBase64(new TextEncoder().encode(currentRaw).buffer as ArrayBuffer) : undefined,
    baselineMeta: { fileName: "baseline.csv", sha256: baselineHash, normalizedSha256: baselineNormalized, hashVerified: true, verification: { status: "verified", method: "raw-bytes+normalized-rows", verifiedAt: RUN_AT, recomputedSha256: baselineHash, recomputedNormalizedSha256: baselineNormalized }, generatedAt: RUN_AT, rowCount: baseline.rows.length, byteSize: new TextEncoder().encode(baselineRaw).byteLength },
    currentMeta: current && currentRaw && currentHash && currentNormalized ? { fileName: "current.csv", sha256: currentHash, normalizedSha256: currentNormalized, hashVerified: true, verification: { status: "verified", method: "raw-bytes+normalized-rows", verifiedAt: RUN_AT, recomputedSha256: currentHash, recomputedNormalizedSha256: currentNormalized }, generatedAt: RUN_AT, rowCount: current.rows.length, byteSize: new TextEncoder().encode(currentRaw).byteLength } : undefined,
  });
}

test("01 parses quoted CSV cells and numeric values", () => {
  const parsed = parseCSV('id,score,note\n001,10,"alpha, beta"\n002,12,gamma\n');
  assert.deepEqual(parsed.columns, ["id", "score", "note"]);
  assert.equal(parsed.rows[0].id, "001");
  assert.equal(parsed.rows[0].score, "10");
  assert.equal(parsed.rows[0].note, "alpha, beta");
});

test("02 records exact physical line numbers", () => {
  assert.deepEqual(parseCSV("id,value\nA,1\nB,2\n").lineNumbers, [2, 3]);
});

test("03 tracks a multiline quoted record by its starting line", () => {
  const parsed = parseCSV('id,note\nA,"line one\nline two"\nB,end\n');
  assert.deepEqual(parsed.lineNumbers, [2, 4]);
  assert.match(String(parsed.rows[0].note), /line two/);
});

test("04 parses CRLF files without shifting lines", () => {
  assert.deepEqual(parseCSV("id,value\r\nA,1\r\nB,2\r\n").lineNumbers, [2, 3]);
});

test("05 rejects duplicate headers", () => {
  assert.throws(() => parseCSV("id,value,value\nA,1,2\n"), /duplicate field names/);
});

test("06 rejects blank headers", () => {
  assert.throws(() => parseCSV("id,,value\nA,x,1\n"), /blank field names/);
});

test("07 rejects rows with extra cells", () => {
  assert.throws(() => parseCSV("id,value\nA,1,extra\n"), /1 more fields/);
});

test("08 rejects an unclosed quote", () => {
  assert.throws(() => parseCSV('id,note\nA,"broken\n'), /unclosed quote/);
});

test("09 decodes an UTF-8 BOM", () => {
  const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("id,value\nA,1\n")]);
  assert.match(decodeBuffer(bytes.buffer), /^id,value/);
});

test("10 decodes UTF-16LE with BOM", () => {
  const text = "id,value\nA,1\n";
  const bytes = new Uint8Array(2 + text.length * 2);
  bytes.set([0xff, 0xfe]);
  [...text].forEach((character, index) => { const code = character.charCodeAt(0); bytes[2 + index * 2] = code & 0xff; bytes[3 + index * 2] = code >> 8; });
  assert.equal(decodeBuffer(bytes.buffer), text);
});

test("11 rejects unsupported invalid encoding", () => {
  assert.throws(() => decodeBuffer(new Uint8Array([0xc3, 0x28]).buffer), /not valid UTF/);
});

test("12 detects duplicate primary keys", () => {
  const result = validatePrimaryKey([{ id: "A" }, { id: "A" }], [2, 3], "id");
  assert.equal(result.valid, false);
  assert.deepEqual(result.duplicates, ["A"]);
});

test("13 reports exact lines for missing primary keys", () => {
  assert.deepEqual(validatePrimaryKey([{ id: "" }, { id: "B" }, {}], [7, 8, 12], "id").missingLines, [7, 12]);
});

test("14 offers only unique non-empty key candidates", () => {
  const rows = [{ id: "A", group: "x" }, { id: "B", group: "x" }];
  assert.deepEqual(uniqueKeyCandidates(["id", "group"], rows, [2, 3]), ["id"]);
});

test("15 ignores pure row reordering", () => {
  const dataset = makeDataset([{ id: "A", value: 1 }, { id: "B", value: 2 }], [{ id: "B", value: 2 }, { id: "A", value: 1 }]);
  assert.equal(compareRows(dataset), 0);
  assert.ok(diffRowsByKey(dataset).every((diff) => diff.kind === "unchanged"));
});

test("16 identifies a field modification by key", () => {
  const [diff] = diffRowsByKey(makeDataset([{ id: "A", value: 1 }], [{ id: "A", value: 2 }]));
  assert.equal(diff.kind, "changed");
  assert.deepEqual(diff.changedFields, ["value"]);
});

test("17 identifies an added record", () => {
  const diffs = diffRowsByKey(makeDataset([{ id: "A", value: 1 }], [{ id: "A", value: 1 }, { id: "B", value: 2 }]));
  assert.equal(diffs.find((diff) => diff.key === "B")?.kind, "added");
});

test("18 identifies a removed record", () => {
  const diffs = diffRowsByKey(makeDataset([{ id: "A", value: 1 }, { id: "B", value: 2 }], [{ id: "A", value: 1 }]));
  assert.equal(diffs.find((diff) => diff.key === "B")?.kind, "removed");
});

test("19 preserves exact baseline and current line numbers in diffs", () => {
  const [diff] = diffRowsByKey(makeDataset([{ id: "A", value: 1 }], [{ id: "A", value: 2 }], { baselineLineNumbers: [9], currentLineNumbers: [17] }));
  assert.equal(diff.baselineLine, 9);
  assert.equal(diff.currentLine, 17);
});

test("20 refuses to diff duplicate keys", () => {
  const dataset = makeDataset([{ id: "A", value: 1 }, { id: "A", value: 2 }], [{ id: "A", value: 3 }]);
  assert.throws(() => diffRowsByKey(dataset), /Primary-key validation failed/);
});

test("21 computes all supported aggregations", () => {
  const rows = [{ score: 10 }, { score: 20 }, { score: 30 }];
  assert.deepEqual([aggregate(rows, "score", "average"), aggregate(rows, "score", "sum"), aggregate(rows, "score", "min"), aggregate(rows, "score", "max"), aggregate(rows, "score", "count")], [20, 60, 10, 30, 3]);
});

test("22 ignores missing numeric cells and returns null when none exist", () => {
  assert.equal(aggregate([{ value: 10 }, { value: "" }, { value: "NA" }], "value", "average"), 10);
  assert.equal(aggregate([{ value: "" }, { value: "NA" }], "value", "average"), null);
});

test("23 evaluates every threshold operator", () => {
  assert.deepEqual([evaluate(2, ">", 1), evaluate(2, ">=", 2), evaluate(1, "<", 2), evaluate(2, "<=", 2), evaluate(2, "=", 2)], [true, true, true, true, true]);
});

test("24 marks a stability claim valid within percentage tolerance", () => {
  const claim = recomputeClaim(makeClaim({ type: "stability", field: "value", aggregation: "average", supportTolerance: 5 }), makeDataset([{ id: "A", value: 100 }], [{ id: "A", value: 104 }]));
  assert.equal(claim.status, "SUPPORTED");
  assert.match(claim.reason, /4%/);
});

test("25 uses a separately governed reversal threshold for weakened status", () => {
  const claim = recomputeClaim(makeClaim({ type: "stability", field: "value", aggregation: "average", supportTolerance: 5, reversalThreshold: 10 }), makeDataset([{ id: "A", value: 100 }], [{ id: "A", value: 108 }]));
  assert.equal(claim.status, "WEAKENED");
});

test("26 marks a material change reversed only at a governed reversal threshold", () => {
  const claim = recomputeClaim(makeClaim({ type: "stability", field: "value", aggregation: "average", supportTolerance: 5, reversalThreshold: 10 }), makeDataset([{ id: "A", value: 100 }], [{ id: "A", value: 111 }]));
  assert.equal(claim.status, "REVERSED");
});

test("27 sends zero baseline to review when no absolute tolerance exists", () => {
  const claim = recomputeClaim(makeClaim({ type: "stability", field: "value", aggregation: "average", supportTolerance: 5 }), makeDataset([{ id: "A", value: 0 }], [{ id: "A", value: 4 }]));
  assert.equal(claim.status, "REVIEW_REQUIRED");
  assert.match(claim.reason, /percentage change is undefined/);
  assert.doesNotMatch(claim.reason, /4%/);
});

test("28 uses an explicit absolute tolerance for zero baseline", () => {
  const claim = recomputeClaim(makeClaim({ type: "stability", field: "value", aggregation: "average", supportTolerance: 5, absoluteTolerance: 5 }), makeDataset([{ id: "A", value: 0 }], [{ id: "A", value: 4 }]));
  assert.equal(claim.status, "SUPPORTED");
  assert.match(claim.reason, /absolute change 4/);
});

test("29 requires review beyond an absolute support threshold without a reversal rule", () => {
  const claim = recomputeClaim(makeClaim({ type: "stability", field: "value", aggregation: "average", supportTolerance: 5, absoluteTolerance: 3 }), makeDataset([{ id: "A", value: 0 }], [{ id: "A", value: 4 }]));
  assert.equal(claim.status, "REVIEW_REQUIRED");
});

test("30 keeps zero-to-zero stable", () => {
  const claim = recomputeClaim(makeClaim({ type: "stability", field: "value", aggregation: "average", supportTolerance: 5 }), makeDataset([{ id: "A", value: 0 }], [{ id: "A", value: 0 }]));
  assert.equal(claim.status, "SUPPORTED");
});

test("31 invalidates a threshold claim after crossing its gate", () => {
  const rule: Rule = { type: "threshold", field: "recall", aggregation: "average", operator: ">=", threshold: 80 };
  const claim = recomputeClaim(makeClaim(rule), makeDataset([{ id: "A", recall: 84 }], [{ id: "A", recall: 78 }]));
  assert.equal(claim.baselineStatus, "SUPPORTED");
  assert.equal(claim.status, "REVERSED");
});

test("32 requires review when a previously false threshold becomes true", () => {
  const rule: Rule = { type: "threshold", field: "value", aggregation: "average", operator: ">=", threshold: 80 };
  assert.equal(recomputeClaim(makeClaim(rule), makeDataset([{ id: "A", value: 70 }], [{ id: "A", value: 90 }])).status, "REVIEW_REQUIRED");
});

test("33 catches a rank reversal", () => {
  const rule: Rule = { type: "rank", field: "value", aggregation: "average", groupField: "region", expectedGroup: "North", rank: "max" };
  const claim = recomputeClaim(makeClaim(rule), makeDataset([{ id: "A", region: "North", value: 10 }, { id: "B", region: "East", value: 8 }], [{ id: "B", region: "East", value: 12 }, { id: "A", region: "North", value: 9 }]));
  assert.equal(claim.baselineStatus, "SUPPORTED");
  assert.equal(claim.status, "REVERSED");
});

test("34 keeps a stable ranking valid", () => {
  const rule: Rule = { type: "rank", field: "value", aggregation: "average", groupField: "region", expectedGroup: "North", rank: "max" };
  assert.equal(recomputeClaim(makeClaim(rule), makeDataset([{ id: "A", region: "North", value: 10 }, { id: "B", region: "East", value: 8 }], [{ id: "B", region: "East", value: 9 }, { id: "A", region: "North", value: 11 }])).status, "SUPPORTED");
});

test("35 writes exact row, key, field, hash, rule and time lineage", () => {
  const dataset = makeDataset([{ id: "A", score: 84 }], [{ id: "A", score: 78 }], { baselineLineNumbers: [12], currentLineNumbers: [19] });
  const claim = recomputeClaim(makeClaim({ type: "threshold", field: "score", aggregation: "average", operator: ">=", threshold: 80 }), dataset, RUN_AT);
  assert.deepEqual(claim.sourceRefs.map((ref) => [ref.snapshot, ref.keyValue, ref.lineNumber, ref.fields.includes("score"), ref.sha256]), [["baseline", "A", 12, true, BASE_HASH], ["current", "A", 19, true, CURRENT_HASH]]);
  assert.equal(claim.audit.ruleVersion, RULE_ENGINE_VERSION);
  assert.equal(claim.audit.lastRunAt, RUN_AT);
});

test("36 computes 100 only when all sixteen completeness checks pass", () => {
  const dataset = makeDataset([{ id: "A", score: 84 }], [{ id: "A", score: 78 }]);
  const claim = recomputeClaim(makeClaim({ type: "threshold", field: "score", aggregation: "average", operator: ">=", threshold: 80 }), dataset, RUN_AT);
  assert.deepEqual(computeEvidenceCompleteness(claim, dataset), { score: 100, passed: 16, total: 16, missing: [] });
});

test("37 lowers completeness when a snapshot hash is not verified", () => {
  const dataset = makeDataset([{ id: "A", score: 84 }], [{ id: "A", score: 78 }], { currentMeta: { fileName: "current.csv", sha256: CURRENT_HASH, hashVerified: false, generatedAt: RUN_AT, rowCount: 1, byteSize: 10 } });
  const claim = recomputeClaim(makeClaim({ type: "threshold", field: "score", aggregation: "average", operator: ">=", threshold: 80 }), dataset, RUN_AT);
  const completeness = computeEvidenceCompleteness(claim, dataset);
  assert.ok(completeness.score < 100);
  assert.ok(completeness.missing.includes("File hashes reverified"));
});

test("38 keeps AuditBundle summary and diffs consistent", async () => {
  const dataset = makeDataset([{ id: "A", score: 84 }], [{ id: "A", score: 78 }, { id: "B", score: 90 }]);
  const claim = recomputeClaim(makeClaim({ type: "threshold", field: "score", aggregation: "average", operator: ">=", threshold: 80 }), dataset, RUN_AT);
  const artifact = await createEvidencePackage(dataset, [claim], RUN_AT);
  assert.deepEqual(artifact.summary, auditSummary([claim], dataset));
  assert.equal(artifact.summary.changedRecords, 2);
  assert.equal(artifact.diffs.filter((diff) => diff.kind !== "unchanged").length, 2);
  assert.equal(artifact.claimResults[0].status, claim.status);
});

test("39 exports an escaped conclusion-decision-review-integrity HTML report", async () => {
  assert.equal(escapeHtml('<script>alert("x")</script>'), "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
  const dataset = await makeVerifiableDataset("id,score\nA,90\n", "id,score\nA,91\n");
  const claim = recomputeClaim(makeClaim({ type: "threshold", field: "score", aggregation: "average", operator: ">", threshold: 0 }, '<img src=x onerror="bad">'), dataset, RUN_AT);
  const decisionSpec: DecisionSpec = {
    id: "report-decision",
    title: "Report decision",
    owner: "owner",
    ...TEST_ACTIONS,
    actionIfPass: "go",
    actionIfFail: "hold",
    conditions: [{ claimId: claim.id, allowedStatuses: ["SUPPORTED"] }],
    objective: { benefitWeight: 1, costWeight: 0.2, riskWeight: 1 },
    options: [{ id: "A", label: "Recommended A", benefit: 80, cost: 20, risk: 10, capacity: 5 }],
    ...TEST_DECISION_INPUTS,
  };
  const decision = evaluateDecision(decisionSpec, [claim]);
  const claimReview = await createReviewRecord({ claimId: claim.id, reviewer: "<Reviewer>", disposition: "APPROVED", note: "checked <script>bad()</script>", createdAt: RUN_AT, targetResultId: claim.resultId ?? "", targetResultHash: await hashClaimResult(claim) });
  const decisionReview = await createReviewRecord({ decisionId: decision.decisionId, reviewer: "<Owner>", disposition: "APPROVED", note: "reviewed recommendation and provenance", createdAt: "2026-08-07T09:01:00.000Z", targetResultId: decision.resultId, targetResultHash: await hashDecisionResult(decision) }, claimReview);
  const bundle = await createEvidencePackage(dataset, [claim], RUN_AT, { decisionSpecs: [decisionSpec], reviews: [claimReview, decisionReview] });
  const verification = await verifyEvidencePackage(bundle);
  assert.equal(verification.valid, true);
  const report = buildHtmlReport(bundle, verification);
  assert.doesNotMatch(report, /<img src=x/);
  assert.doesNotMatch(report, /<Reviewer>/);
  assert.doesNotMatch(report, /<script>bad/);
  assert.match(report, /&lt;img/);
  assert.match(report, /Completeness checks passed/);
  assert.match(report, /not model accuracy or business impact/i);
  assert.match(report, /report-decision/);
  assert.match(report, /Recommended A/);
  assert.match(report, /deterministic test fixture/);
  assert.match(report, /Pareto frontier/);
  assert.match(report, /break-even benefit/);
  assert.match(report, /fixed-seed Monte Carlo/i);
  assert.match(report, /Locally Recorded, Unauthenticated Sign-Offs/);
  assert.match(report, new RegExp(bundle.integrity.payloadHash));
  assert.match(report, /Independent recomputation:<\/b> PASS/);
});

test("40 excludes identifier columns from automatic numeric claims", () => {
  const dataset = makeDataset([{ id: 1, customer_id: 10, score: 7 }, { id: 2, customer_id: 20, score: 9 }], undefined, { columns: ["id", "customer_id", "score"] });
  assert.deepEqual(numericColumns(dataset), ["score"]);
});

test("41 auto-generated claims preserve source references", () => {
  const dataset = makeDataset([{ id: "A", score: 10 }, { id: "B", score: 12 }], [{ id: "B", score: 13 }, { id: "A", score: 10 }]);
  const [claim] = makeImportedClaims(dataset, RUN_AT);
  assert.equal(claim.sourceRefs.length, 4);
  assert.equal(claim.audit.currentSha256, CURRENT_HASH);
});

test("42 handles a large reordered file without false positives", () => {
  const baseline = Array.from({ length: 10000 }, (_, index) => ({ id: `R-${index}`, value: index }));
  const current = [...baseline].reverse();
  assert.equal(compareRows(makeDataset(baseline, current)), 0);
});

test("43 sends an unbound conclusion to review", () => {
  const dataset = makeDataset([{ id: "A", score: 1 }], [{ id: "A", score: 2 }]);
  const claim = recomputeClaim(makeClaim(undefined), dataset, RUN_AT);
  assert.equal(claim.status, "UNTESTABLE");
  assert.match(claim.reason, /not bound to an executable rule/);
});

test("44 requires review for a tied maximum when uniqueness is required", () => {
  const rule: Rule = { type: "rank", field: "value", aggregation: "average", groupField: "region", expectedGroup: "North", rank: "max" };
  const claim = recomputeClaim(makeClaim(rule), makeDataset([{ id: "A", region: "North", value: 10 }, { id: "B", region: "East", value: 10 }], [{ id: "A", region: "North", value: 11 }, { id: "B", region: "East", value: 11 }]));
  assert.equal(claim.status, "REVIEW_REQUIRED");
  assert.match(claim.reason, /tied for first/);
});

test("45 supports an explicitly allowed tied maximum", () => {
  const rule: Rule = { type: "rank", field: "value", aggregation: "average", groupField: "region", expectedGroup: "North", rank: "max", tiePolicy: "allow_tied" };
  const claim = recomputeClaim(makeClaim(rule), makeDataset([{ id: "A", region: "North", value: 10 }, { id: "B", region: "East", value: 10 }], [{ id: "A", region: "North", value: 11 }, { id: "B", region: "East", value: 11 }]));
  assert.equal(claim.status, "SUPPORTED");
});

test("46 makes a rank claim untestable when the expected group is absent", () => {
  const rule: Rule = { type: "rank", field: "value", aggregation: "average", groupField: "region", expectedGroup: "North", rank: "min" };
  const claim = recomputeClaim(makeClaim(rule), makeDataset([{ id: "A", region: "East", value: 10 }], [{ id: "A", region: "East", value: 9 }]));
  assert.equal(claim.status, "UNTESTABLE");
  assert.match(claim.reason, /absent/);
});

test("47 requires review when records contain an empty grouping value", () => {
  const rule: Rule = { type: "rank", field: "value", aggregation: "average", groupField: "region", expectedGroup: "North", rank: "max" };
  const claim = recomputeClaim(makeClaim(rule), makeDataset([{ id: "A", region: "North", value: 10 }, { id: "B", region: "", value: 8 }], [{ id: "A", region: "North", value: 11 }, { id: "B", region: "", value: 9 }]));
  assert.equal(claim.status, "REVIEW_REQUIRED");
  assert.match(claim.reason, /missing group value/);
});

test("48 warns when the mean is stable but the effective denominator changes", () => {
  const rule: Rule = { type: "stability", field: "value", aggregation: "average", supportTolerance: 5 };
  const claim = recomputeClaim(makeClaim(rule), makeDataset([{ id: "A", value: 100 }, { id: "B", value: 100 }], [{ id: "A", value: 100 }, { id: "B", value: "" }]));
  assert.equal(claim.status, "REVIEW_REQUIRED");
  assert.equal(claim.sampleProfiles?.baseline.effectiveRows, 2);
  assert.equal(claim.sampleProfiles?.current?.effectiveRows, 1);
  assert.match(claim.reason, /effective sample/);
});

test("49 treats an unconfirmed automatic tolerance as preliminary only", () => {
  const dataset = makeDataset([{ id: "A", score: 100 }], [{ id: "A", score: 101 }]);
  const [claim] = makeImportedClaims(dataset, RUN_AT);
  assert.equal(claim.status, "REVIEW_REQUIRED");
  assert.equal(claim.audit.preliminary, true);
  assert.match(claim.reason, /Preliminary diagnosis/);
});

test("50 recomputes the file hash from raw CSV text", async () => {
  const raw = "id,score\nA,10\n";
  const hash = await sha256Text(raw);
  const dataset = makeDataset([{ id: "A", score: "10" }], undefined, {
    baselineRawText: raw,
    baselineMeta: { fileName: "baseline.csv", sha256: hash, hashVerified: false, generatedAt: RUN_AT, rowCount: 1, byteSize: raw.length },
  });
  const verification = await verifySnapshot(dataset, "baseline", RUN_AT);
  assert.equal(verification.status, "verified");
  assert.equal(verification.recomputedSha256, hash);
});

test("51 fails evidence-package verification after raw snapshot tampering", async () => {
  const baselineRaw = "id,score\nA,84\n";
  const currentRaw = "id,score\nA,78\n";
  const baselineHash = await sha256Text(baselineRaw);
  const currentHash = await sha256Text(currentRaw);
  const dataset = makeDataset([{ id: "A", score: "84" }], [{ id: "A", score: "78" }], {
    baselineRawText: baselineRaw,
    currentRawText: currentRaw,
    baselineRawBytesBase64: bytesToBase64(new TextEncoder().encode(baselineRaw).buffer as ArrayBuffer),
    currentRawBytesBase64: bytesToBase64(new TextEncoder().encode(currentRaw).buffer as ArrayBuffer),
    baselineMeta: { fileName: "baseline.csv", sha256: baselineHash, hashVerified: true, verification: { status: "verified", method: "raw-bytes+normalized-rows", verifiedAt: RUN_AT, recomputedSha256: baselineHash }, generatedAt: RUN_AT, rowCount: 1, byteSize: baselineRaw.length },
    currentMeta: { fileName: "current.csv", sha256: currentHash, hashVerified: true, verification: { status: "verified", method: "raw-bytes+normalized-rows", verifiedAt: RUN_AT, recomputedSha256: currentHash }, generatedAt: RUN_AT, rowCount: 1, byteSize: currentRaw.length },
  });
  const claim = recomputeClaim(makeClaim({ type: "threshold", field: "score", aggregation: "average", operator: ">=", threshold: 80 }), dataset, RUN_AT);
  const pkg = await createEvidencePackage(dataset, [claim], RUN_AT);
  assert.ok(pkg.snapshotPayloads.baseline);
  if (pkg.snapshotPayloads.baseline) pkg.snapshotPayloads.baseline.text = `${pkg.snapshotPayloads.baseline.text ?? ""}B,90\n`;
  assert.equal((await verifyEvidencePackage(pkg)).valid, false);
});

test("52 bounds large evidence exports instead of copying every record", async () => {
  const baseline = Array.from({ length: 700 }, (_, index) => ({ id: `R-${index}`, score: index }));
  const current = baseline.map((row) => ({ ...row, score: Number(row.score) + 1 }));
  const dataset = makeDataset(baseline, current);
  const claim = recomputeClaim(makeClaim({ type: "threshold", field: "score", aggregation: "average", operator: ">=", threshold: 1 }), dataset, RUN_AT);
  const pkg = await createEvidencePackage(dataset, [claim], RUN_AT);
  assert.equal(pkg.diffs.length, 500);
  assert.equal(pkg.diffSummary.truncated, true);
  assert.equal(claim.sourceRefs.length, 200);
  assert.equal(claim.evidenceScope?.truncated, true);
  assert.equal(claim.evidenceScope?.sides.baseline.exportedReferences, 100);
  assert.equal(claim.evidenceScope?.sides.current?.exportedReferences, 100);
  assert.equal(computeEvidenceCompleteness(claim, dataset).score, 100);
  assert.equal(pkg.dataPreview.baselineRows.length, 20);
});

test("53 compares the current decision only with a stored signed decision", () => {
  const rule: Rule = { type: "threshold", field: "score", aggregation: "average", operator: ">=", threshold: 80 };
  const claim = recomputeClaim(makeClaim(rule), makeDataset([{ id: "A", score: 84 }], [{ id: "A", score: 78 }]));
  const spec: DecisionSpec = { id: "go", title: "Go live", owner: "owner", ...TEST_ACTIONS, actionIfPass: "go", actionIfFail: "hold", conditions: [{ claimId: claim.id, allowedStatuses: ["SUPPORTED"] }] };
  const result = evaluateDecision({ ...spec, priorSignedResult: signedHistoryFor(spec, [claim], { outcome: "PASS" }) }, [claim]);
  assert.equal(result.previousOutcome, "PASS");
  assert.equal(result.currentOutcome, "HOLD");
  assert.equal(result.status, "DECISION_CHANGED");
  assert.doesNotMatch(result.reason, /status is unchanged/);
  assert.match(result.reason, /PASS.*HOLD/);
});

test("54 validates review records as UUID and hash-chained governance objects", async () => {
  const target = { targetResultId: "result:claim-1", targetResultHash: "d".repeat(64) };
  const record = await createReviewRecord({ claimId: "claim-1", reviewer: "Analyst", disposition: "APPROVED", note: "Checked denominator and policy source", createdAt: RUN_AT, ...target });
  assert.equal(record.claimId, "claim-1");
  assert.match(record.id, /^[0-9a-f-]{36}$/i);
  assert.match(record.recordHash, /^[a-f0-9]{64}$/);
  assert.deepEqual(record.assurance, { identity: "LOCAL_UNVERIFIED", timestamp: "LOCAL_CLOCK_UNVERIFIED", authorization: "SELF_ASSERTED", cryptographicSignature: "NONE" });
  const next = await createReviewRecord({ claimId: "claim-1", reviewer: "Analyst", disposition: "CHANGES_REQUESTED", note: "Please document the changed denominator", createdAt: "2026-08-07T09:01:00.000Z", ...target }, record);
  assert.equal(next.previousRecordHash, record.recordHash);
  assert.equal(appendReviewRecord([record], next).length, 2);
  assert.equal((await verifyReviewChain([record, next])).valid, true);
  assert.equal((await verifyReviewChain([{ ...record, note: "tampered" }, next])).valid, false);
  await assert.rejects(createReviewRecord({ reviewer: "Analyst", disposition: "APPROVED", note: "missing target", createdAt: RUN_AT, ...target }), /bind either a claim or a decision/);
  await assert.rejects(createReviewRecord({ claimId: "claim-1", reviewer: "Analyst", disposition: "APPROVED", note: "", createdAt: RUN_AT, ...target }), /Review note is required/);
});

test("55 handles a tied minimum without alphabetical tie-breaking", () => {
  const rule: Rule = { type: "rank", field: "score", aggregation: "average", groupField: "region", expectedGroup: "West", rank: "min" };
  const claim = recomputeClaim(makeClaim(rule), makeDataset([{ id: "A", region: "East", score: 4 }, { id: "B", region: "West", score: 4 }], [{ id: "A", region: "East", score: 3 }, { id: "B", region: "West", score: 3 }]));
  assert.equal(claim.status, "REVIEW_REQUIRED");
  assert.match(claim.currentValue, /East/);
  assert.match(claim.currentValue, /West/);
});

test("56 keeps the sample composition stable across pure row reordering", () => {
  const rule: Rule = { type: "stability", field: "score", aggregation: "average", supportTolerance: 5 };
  const claim = recomputeClaim(makeClaim(rule), makeDataset([{ id: "A", score: 10 }, { id: "B", score: 12 }], [{ id: "B", score: 12 }, { id: "A", score: 10 }]));
  assert.equal(claim.status, "SUPPORTED");
  assert.equal(claim.sampleProfiles?.baseline.includedKeysHash, claim.sampleProfiles?.current?.includedKeysHash);
});

test("57 makes a numeric claim untestable when every value is missing", () => {
  const claim = recomputeClaim(makeClaim({ type: "threshold", field: "score", aggregation: "average", operator: ">=", threshold: 80 }), makeDataset([{ id: "A", score: "" }], [{ id: "A", score: "NA" }]));
  assert.equal(claim.status, "UNTESTABLE");
});

test("58 detects a normalized-record hash mismatch", async () => {
  const raw = "id,score\nA,10\n";
  const hash = await sha256Text(raw);
  const dataset = makeDataset([{ id: "A", score: "10" }], undefined, {
    baselineRawText: raw,
    baselineMeta: { fileName: "baseline.csv", sha256: hash, normalizedSha256: "0".repeat(64), hashVerified: false, generatedAt: RUN_AT, rowCount: 1, byteSize: raw.length },
  });
  const verification = await verifySnapshot(dataset, "baseline", RUN_AT);
  assert.equal(verification.status, "failed");
  assert.match(verification.errors?.join(" ") ?? "", /normalized-record/i);
});

test("59 marks a package unverifiable when scale policy omits raw snapshots", async () => {
  const raw = `id,score\n${"A,1\n".repeat(150000)}`;
  const rows = [{ id: "A", score: 1 }];
  const hash = await sha256Text(raw);
  const dataset = makeDataset(rows, undefined, { baselineRawText: raw, baselineMeta: { fileName: "large.csv", sha256: hash, hashVerified: true, verification: { status: "verified", method: "raw-bytes+normalized-rows", verifiedAt: RUN_AT, recomputedSha256: hash }, generatedAt: RUN_AT, rowCount: 1, byteSize: raw.length } });
  const claim = recomputeClaim(makeClaim({ type: "threshold", field: "score", aggregation: "average", operator: ">=", threshold: 1 }), dataset, RUN_AT);
  const pkg = await createEvidencePackage(dataset, [claim], RUN_AT);
  assert.equal(pkg.snapshotPayloads.baseline, null);
  assert.equal((await verifyEvidencePackage(pkg)).valid, false);
});

test("60 preserves the exact UTF-16 file bytes during hash re-verification", async () => {
  const text = "id,score\nA,10\n";
  const bytes = new Uint8Array(2 + text.length * 2);
  bytes.set([0xff, 0xfe]);
  [...text].forEach((character, index) => {
    const code = character.charCodeAt(0);
    bytes[2 + index * 2] = code & 0xff;
    bytes[3 + index * 2] = code >> 8;
  });
  const hash = await sha256Hex(bytes.buffer);
  const dataset = makeDataset([{ id: "A", score: "10" }], undefined, {
    baselineRawText: text,
    baselineRawBytesBase64: bytesToBase64(bytes.buffer),
    baselineMeta: { fileName: "utf16.csv", sha256: hash, hashVerified: false, generatedAt: RUN_AT, rowCount: 1, byteSize: bytes.byteLength, encoding: "utf-16le", mediaType: "text/csv" },
  });
  const verification = await verifySnapshot(dataset, "baseline", RUN_AT);
  assert.equal(verification.status, "verified");
  assert.equal(verification.recomputedSha256, hash);
});

test("61 never reports 100 completeness when one version has no valid source reference", () => {
  const dataset = makeDataset(
    [{ id: "A", cohort: "eligible", score: 82 }],
    [{ id: "A", cohort: "ineligible", score: 82 }],
  );
  const claim = recomputeClaim(makeClaim({ type: "threshold", field: "score", aggregation: "average", operator: ">=", threshold: 80, filters: [{ field: "cohort", equals: "eligible" }] }), dataset, RUN_AT);
  const completeness = computeEvidenceCompleteness(claim, dataset);
  assert.equal(claim.evidenceScope?.sides.baseline.exportedReferences, 1);
  assert.equal(claim.evidenceScope?.sides.current?.exportedReferences, 0);
  assert.ok(completeness.score < 100);
  assert.ok(completeness.missing.includes("Both versions referenced"));
});

test("62 exports paired changes, real boundary rows, and deterministic samples from both versions", () => {
  const baseline = Array.from({ length: 300 }, (_, index) => ({ id: `R-${index}`, score: index }));
  const current = baseline.map((row) => ({ ...row, score: Number(row.score) + 1 }));
  const dataset = makeDataset(baseline, current);
  const seed = makeClaim({ type: "threshold", field: "score", aggregation: "average", operator: ">=", threshold: 150 });
  const first = recomputeClaim(seed, dataset, RUN_AT);
  const second = recomputeClaim(seed, dataset, RUN_AT);
  assert.equal(first.sourceRefs.length, 200);
  assert.equal(first.evidenceScope?.sides.baseline.exportedReferences, 100);
  assert.equal(first.evidenceScope?.sides.current?.exportedReferences, 100);
  assert.ok((first.evidenceScope?.pairedChangedKeys ?? 0) > 0);
  assert.ok((first.evidenceScope?.sides.baseline.boundaryReferences ?? 0) > 0);
  assert.ok((first.evidenceScope?.sides.current?.boundaryReferences ?? 0) > 0);
  assert.ok(first.sourceRefs.some((ref) => ["R-149", "R-150"].includes(ref.keyValue)));
  assert.deepEqual(
    first.sourceRefs.filter((ref) => ref.snapshot === "baseline").map((ref) => ref.keyValue).sort(),
    first.sourceRefs.filter((ref) => ref.snapshot === "current").map((ref) => ref.keyValue).sort(),
  );
  assert.deepEqual(first.sourceRefs, second.sourceRefs);
});

test("63 does not invent DECISION_CHANGED for a version-comparison claim without signed history", () => {
  const claim = recomputeClaim(
    makeClaim({ type: "stability", field: "score", aggregation: "average", supportTolerance: 5 }),
    makeDataset([{ id: "A", score: 100 }], [{ id: "A", score: 101 }]),
    RUN_AT,
  );
  assert.equal(claim.kind, "VERSION_COMPARISON");
  assert.equal(claim.status, "SUPPORTED");
  const result = evaluateDecision({ id: "stable", title: "Continue", owner: "owner", ...TEST_ACTIONS, actionIfPass: "continue", actionIfFail: "hold", conditions: [{ claimId: claim.id, allowedStatuses: ["SUPPORTED"] }] }, [claim]);
  assert.equal(result.previousOutcome, null);
  assert.equal(result.currentOutcome, "PASS");
  assert.equal(result.status, "SUPPORTED");
  assert.equal(result.comparisonBasis, "NO_HISTORY");
});

test("64 requires review beyond support tolerance when reversal threshold is absent", () => {
  const claim = recomputeClaim(
    makeClaim({ type: "stability", field: "score", aggregation: "average", supportTolerance: 5 }),
    makeDataset([{ id: "A", score: 100 }], [{ id: "A", score: 108 }]),
    RUN_AT,
  );
  assert.equal(claim.status, "REVIEW_REQUIRED");
  assert.match(claim.reason, /reversal threshold is not independently confirmed/);
  assert.ok(computeEvidenceCompleteness(claim, makeDataset([{ id: "A", score: 100 }], [{ id: "A", score: 108 }])).missing.includes("Threshold provenance and confirmation"));
});

test("65 prevents ordinary approval of a reversed claim and supports explicit risk acceptance", async () => {
  const claim = recomputeClaim(makeClaim({ type: "threshold", field: "score", aggregation: "average", operator: ">=", threshold: 80 }), makeDataset([{ id: "A", score: 84 }], [{ id: "A", score: 70 }]), RUN_AT);
  const target = { targetResultId: claim.resultId ?? "", targetResultHash: await hashClaimResult(claim) };
  const approval = await createReviewRecord({ claimId: claim.id, reviewer: "Owner", disposition: "APPROVED", note: "Checked all evidence and would like to approve", createdAt: RUN_AT, ...target });
  await assert.rejects(applyReviewToClaim(claim, approval), /cannot receive ordinary approval/);
  const override = await createReviewRecord({ claimId: claim.id, reviewer: "Owner", disposition: "RISK_ACCEPTED", note: "Accept temporary operational risk with weekly monitoring", createdAt: RUN_AT, ...target });
  const reviewed = await applyReviewToClaim(claim, override);
  assert.equal(reviewed.governance.reviewDisposition, "RISK_ACCEPTED");
  assert.equal(reviewed.governance.releaseStatus, "APPROVED_WITH_RISK");
});

test("66 scores options deterministically, removes constrained choices, and reports sensitivity", () => {
  const claim = recomputeClaim(makeClaim({ type: "threshold", field: "score", aggregation: "average", operator: ">=", threshold: 80 }), makeDataset([{ id: "A", score: 90 }], [{ id: "A", score: 90 }]), RUN_AT);
  const result = evaluateDecision({
    id: "allocate",
    title: "Allocate capacity",
    owner: "owner",
    ...TEST_ACTIONS,
    actionIfPass: "allocate",
    actionIfFail: "hold",
    conditions: [{ claimId: claim.id, allowedStatuses: ["SUPPORTED"] }],
    objective: { benefitWeight: 1, costWeight: 0.2, riskWeight: 1 },
    options: [
      { id: "small", label: "Small", benefit: 80, cost: 30, risk: 10, capacity: 20 },
      { id: "large", label: "Large", benefit: 120, cost: 90, risk: 30, capacity: 60 },
    ],
    constraints: [{ id: "budget", label: "Budget", metric: "cost", operator: "<=", value: 50 }],
    riskTolerance: 20,
    ...TEST_DECISION_INPUTS,
  }, [claim]);
  assert.equal(result.analysis?.recommendedOptionId, "small");
  assert.equal(result.analysis?.options.find((option) => option.optionId === "large")?.feasible, false);
  assert.equal(result.analysis?.sensitivity.length, 3);
  assert.ok((result.analysis?.options.find((option) => option.optionId === "small")?.breakEvenBenefit ?? 0) > 0);
  assert.ok((result.analysis?.options.find((option) => option.optionId === "small")?.scoreInterval?.min ?? 0) < (result.analysis?.options.find((option) => option.optionId === "small")?.scoreInterval?.max ?? 0));
  assert.deepEqual(result.analysis?.paretoFrontierOptionIds, ["small"]);
  assert.equal(result.analysis?.recommendationStability.recommendedOptionId, "small");
  assert.equal(result.analysis?.monteCarlo?.trials, 512);
  assert.equal(result.analysis?.monteCarlo?.recommendationShares.reduce((total, item) => total + item.count, 0), 512);
  assert.equal(result.analysis?.monteCarlo?.seed, "deterministic-test-v1");
});

test("67 keeps decision engine, review disposition, and release status separate", async () => {
  const claim = recomputeClaim(makeClaim({ type: "threshold", field: "score", aggregation: "average", operator: ">=", threshold: 80 }), makeDataset([{ id: "A", score: 84 }], [{ id: "A", score: 70 }]), RUN_AT);
  const spec: DecisionSpec = { id: "governed-decision", title: "Governed decision", owner: "owner", ...TEST_ACTIONS, actionIfPass: "go", actionIfFail: "hold", conditions: [{ claimId: claim.id, allowedStatuses: ["SUPPORTED"] }] };
  const result = evaluateDecision({ ...spec, priorSignedResult: signedHistoryFor(spec, [claim], { outcome: "PASS" }) }, [claim]);
  const target = { targetResultId: result.resultId, targetResultHash: await hashDecisionResult(result) };
  const ordinary = await createReviewRecord({ decisionId: result.decisionId, reviewer: "Owner", disposition: "APPROVED", note: "Approve changed decision without override", createdAt: RUN_AT, ...target });
  await assert.rejects(applyReviewToDecision(result, ordinary, [claim]), /cannot receive ordinary approval/);
  const override = await createReviewRecord({ decisionId: result.decisionId, reviewer: "Owner", disposition: "RISK_ACCEPTED", note: "Accept changed action temporarily with weekly monitoring", createdAt: RUN_AT, ...target });
  const claimTarget = { targetResultId: claim.resultId ?? "", targetResultHash: await hashClaimResult(claim) };
  const claimOverride = await createReviewRecord({ claimId: claim.id, reviewer: "Owner", disposition: "RISK_ACCEPTED", note: "Accept reversed upstream claim with weekly monitoring", createdAt: RUN_AT, ...claimTarget });
  const releasedClaim = await applyReviewToClaim(claim, claimOverride);
  const reviewed = await applyReviewToDecision(result, override, [releasedClaim]);
  assert.equal(reviewed.governance.engineStatus, "DECISION_CHANGED");
  assert.equal(reviewed.governance.reviewDisposition, "RISK_ACCEPTED");
  assert.equal(reviewed.governance.releaseStatus, "APPROVED_WITH_RISK");
});

test("68 fills remaining evidence capacity with a fixed-seed deterministic sample", () => {
  const baseline = Array.from({ length: 300 }, (_, index) => ({ id: `S-${index}`, score: index }));
  const current = [...baseline].reverse();
  const dataset = makeDataset(baseline, current);
  const seed = makeClaim({ type: "threshold", field: "score", aggregation: "average", operator: ">=", threshold: 150 });
  const first = recomputeClaim(seed, dataset, RUN_AT);
  const second = recomputeClaim(seed, dataset, RUN_AT);
  assert.ok((first.evidenceScope?.sides.baseline.boundaryReferences ?? 0) > 0);
  assert.ok((first.evidenceScope?.sides.baseline.sampledReferences ?? 0) > 0);
  assert.ok((first.evidenceScope?.sides.current?.sampledReferences ?? 0) > 0);
  assert.deepEqual(first.sourceRefs, second.sourceRefs);
});

test("69 synchronous canonical SHA-256 matches Web Crypto and ignores object key order", async () => {
  const left = { z: "Unicode café", a: { second: 2, first: 1 }, list: [3, 2, 1] };
  const right = { list: [3, 2, 1], a: { first: 1, second: 2 }, z: "Unicode café" };
  assert.equal(sha256CanonicalSync(left), await sha256Canonical(left));
  assert.equal(sha256CanonicalSync(left), sha256CanonicalSync(right));
});

test("70 requires re-signing when PASS is unchanged but recommendation or feasible set changes", () => {
  const claim = recomputeClaim(makeClaim({ type: "threshold", field: "score", aggregation: "average", operator: ">=", threshold: 80 }), makeDataset([{ id: "A", score: 90 }], [{ id: "A", score: 90 }]), RUN_AT);
  const spec: DecisionSpec = {
    id: "recommendation-identity",
    title: "Choose option",
    owner: "owner",
    ...TEST_ACTIONS,
    actionIfPass: "choose",
    actionIfFail: "hold",
    conditions: [{ claimId: claim.id, allowedStatuses: ["SUPPORTED"] }],
    objective: { benefitWeight: 1, costWeight: 1, riskWeight: 1 },
    options: [
      { id: "A", label: "A", benefit: 60, cost: 20, risk: 10, capacity: 10 },
      { id: "B", label: "B", benefit: 90, cost: 20, risk: 10, capacity: 10 },
    ],
    ...TEST_DECISION_INPUTS,
  };
  const recommendationChanged = evaluateDecision({ ...spec, priorSignedResult: signedHistoryFor(spec, [claim], { outcome: "PASS", recommendedOptionId: "A" }) }, [claim]);
  assert.equal(recommendationChanged.previousOutcome, "PASS");
  assert.equal(recommendationChanged.currentOutcome, "PASS");
  assert.equal(recommendationChanged.binding.recommendedOptionId, "B");
  assert.equal(recommendationChanged.status, "DECISION_CHANGED");
  assert.ok(recommendationChanged.changeReasons.includes("RECOMMENDED_OPTION"));

  const feasibleSetChanged = evaluateDecision({ ...spec, priorSignedResult: signedHistoryFor(spec, [claim], { outcome: "PASS", recommendedOptionId: "B", feasibleOptionIds: ["B"] }) }, [claim]);
  assert.equal(feasibleSetChanged.status, "DECISION_CHANGED");
  assert.ok(feasibleSetChanged.changeReasons.includes("FEASIBLE_OPTIONS"));
});

test("71 AuditBundle rejects tampered claims, summaries, diffs, decisions, reviews, and record order", async () => {
  const dataset = await makeVerifiableDataset("id,score\nA,90\n", "id,score\nA,91\n");
  const claim = recomputeClaim(makeClaim({ type: "threshold", field: "score", aggregation: "average", operator: ">=", threshold: 80 }), dataset, RUN_AT);
  const decisionSpec: DecisionSpec = {
    id: "bundle-decision",
    title: "Bundle decision",
    owner: "owner",
    ...TEST_ACTIONS,
    actionIfPass: "go",
    actionIfFail: "hold",
    conditions: [{ claimId: claim.id, allowedStatuses: ["SUPPORTED"] }],
    objective: { benefitWeight: 1, costWeight: 1, riskWeight: 1 },
    options: [
      { id: "A", label: "A", benefit: 50, cost: 20, risk: 10, capacity: 10 },
      { id: "B", label: "B", benefit: 80, cost: 20, risk: 10, capacity: 10 },
    ],
    ...TEST_DECISION_INPUTS,
  };
  const decision = evaluateDecision(decisionSpec, [claim]);
  const claimReview = await createReviewRecord({ claimId: claim.id, reviewer: "Reviewer", disposition: "APPROVED", note: "Verified the governed threshold and source rows", createdAt: RUN_AT, targetResultId: claim.resultId ?? "", targetResultHash: await hashClaimResult(claim) });
  const decisionReview = await createReviewRecord({ decisionId: decision.decisionId, reviewer: "Reviewer", disposition: "APPROVED", note: "Verified the recommendation and feasible options", createdAt: "2026-08-07T09:01:00.000Z", targetResultId: decision.resultId, targetResultHash: await hashDecisionResult(decision) }, claimReview);
  const bundle = await createEvidencePackage(dataset, [claim], RUN_AT, { decisionSpecs: [decisionSpec], reviews: [claimReview, decisionReview] });
  assert.equal((await verifyEvidencePackage(bundle)).valid, true);
  assert.equal(bundle.claimResults[0].governance.releaseStatus, "APPROVED_FOR_USE");
  assert.equal(bundle.decisionResults[0].governance.releaseStatus, "APPROVED_FOR_USE");

  const mutations: Array<(copy: typeof bundle) => void> = [
    (copy) => { copy.claimResults[0].status = "REVERSED"; },
    (copy) => { copy.claimResults[0].reason = "tampered reason"; },
    (copy) => { copy.summary.supported += 1; },
    (copy) => { copy.diffs[0].key = "tampered-key"; },
    (copy) => { copy.decisionResults[0].binding.recommendedOptionId = "A"; },
    (copy) => { copy.reviews[0].note = "tampered review note"; },
    (copy) => { copy.reviews = [copy.reviews[1], copy.reviews[0]]; },
  ];
  for (const mutate of mutations) {
    const copy = structuredClone(bundle);
    mutate(copy);
    assert.equal((await verifyEvidencePackage(copy)).valid, false);
  }

  const rehashedTamper = structuredClone(bundle);
  rehashedTamper.claimResults[0].status = "REVERSED";
  rehashedTamper.integrity.sectionHashes.claims = await sha256Canonical({ claimSpecs: rehashedTamper.claimSpecs, claimResults: rehashedTamper.claimResults });
  const payload = Object.fromEntries(Object.entries(rehashedTamper).filter(([key]) => key !== "integrity"));
  rehashedTamper.integrity.payloadHash = await sha256Canonical(payload);
  const verification = await verifyEvidencePackage(rehashedTamper);
  assert.equal(verification.valid, false);
  assert.equal(verification.checks.find((check) => check.name === "derived-recomputation")?.passed, false);
});

test("72 incomplete signed decision history is review-required instead of treated as a change", () => {
  const claim = recomputeClaim(makeClaim({ type: "threshold", field: "score", aggregation: "average", operator: ">=", threshold: 80 }), makeDataset([{ id: "A", score: 90 }], [{ id: "A", score: 90 }]), RUN_AT);
  const spec: DecisionSpec = { id: "incomplete-history", title: "History", owner: "owner", ...TEST_ACTIONS, actionIfPass: "go", actionIfFail: "hold", conditions: [{ claimId: claim.id, allowedStatuses: ["SUPPORTED"] }] };
  const incomplete = { ...signedHistoryFor(spec, [claim]), reviewRecordHash: "not-a-hash" };
  const result = evaluateDecision({ ...spec, priorSignedResult: incomplete }, [claim]);
  assert.equal(result.status, "REVIEW_REQUIRED");
  assert.deepEqual(result.changeReasons, []);
  assert.match(result.reason, /prior sign-off identity lacks/);

  const missingActionIdentity = { ...signedHistoryFor(spec, [claim]) } as Partial<SignedDecisionResult>;
  Reflect.deleteProperty(missingActionIdentity, "activeActionId");
  const missingActionResult = evaluateDecision({ ...spec, priorSignedResult: missingActionIdentity as SignedDecisionResult }, [claim]);
  assert.equal(missingActionResult.status, "REVIEW_REQUIRED");
  assert.match(missingActionResult.reason, /action identity/);
});

test("73 keeps a claim review binding stable when signing at t1 and exporting at t2", async () => {
  const dataset = await makeVerifiableDataset("id,score\nA,90\n", "id,score\nA,91\n");
  const signedAt = "2026-08-07T09:00:00.000Z";
  const exportedAt = "2026-08-07T09:02:00.000Z";
  const claim = recomputeClaim(makeClaim({ type: "threshold", field: "score", aggregation: "average", operator: ">=", threshold: 80 }), dataset, signedAt);
  const review = await createReviewRecord({
    claimId: claim.id,
    reviewer: "Reviewer",
    disposition: "APPROVED",
    note: "Checked the source rows and governed threshold before signing",
    createdAt: signedAt,
    targetResultId: claim.resultId ?? "",
    targetResultHash: await hashClaimResult(claim),
  });
  assert.equal(await hashClaimResult({ ...claim, audit: { ...claim.audit, lastRunAt: exportedAt } }), review.targetResultHash);
  assert.notEqual(await hashClaimResult({ ...claim, audit: { ...claim.audit, currentSha256: "f".repeat(64) } }), review.targetResultHash);
  const bundle = await createEvidencePackage(dataset, [claim], exportedAt, { reviews: [review] });
  assert.equal(bundle.claimResults[0].audit.lastRunAt, exportedAt);
  assert.equal(bundle.claimResults[0].governance.releaseStatus, "APPROVED_FOR_USE");
  assert.equal((await verifyEvidencePackage(bundle)).valid, true);
});

test("74 classifies snapshot-only identity changes as RESIGN_REQUIRED, not DECISION_CHANGED", () => {
  const claim = recomputeClaim(makeClaim({ type: "threshold", field: "score", aggregation: "average", operator: ">=", threshold: 80 }), makeDataset([{ id: "A", score: 90 }], [{ id: "A", score: 90 }]), RUN_AT);
  const spec: DecisionSpec = { id: "same-action-new-snapshot", title: "Same action", owner: "owner", ...TEST_ACTIONS, actionIfPass: "go", actionIfFail: "hold", conditions: [{ claimId: claim.id, allowedStatuses: ["SUPPORTED"] }] };
  const result = evaluateDecision({ ...spec, priorSignedResult: signedHistoryFor(spec, [claim], { currentSha256: "d".repeat(64) }) }, [claim]);
  assert.equal(result.previousOutcome, "PASS");
  assert.equal(result.currentOutcome, "PASS");
  assert.equal(result.status, "RESIGN_REQUIRED");
  assert.ok(result.changeReasons.includes("CURRENT_SNAPSHOT"));
  assert.match(result.reason, /does not mean the action changed/);
});

test("75 ignores display metadata but treats the active action ID and instruction as semantic", () => {
  const claim = recomputeClaim(makeClaim({ type: "threshold", field: "score", aggregation: "average", operator: ">=", threshold: 80 }), makeDataset([{ id: "A", score: 90 }], [{ id: "A", score: 90 }]), RUN_AT);
  const original: DecisionSpec = {
    id: "display-only",
    title: "Original title",
    owner: "Original owner",
    ...TEST_ACTIONS,
    actionIfPass: "Original pass copy",
    actionIfFail: "Original hold copy",
    stakeholders: ["Original stakeholder"],
    conditions: [{ claimId: claim.id, allowedStatuses: ["SUPPORTED"] }],
    options: [{ id: "A", label: "Original option label", benefit: 10, cost: 2, risk: 1, capacity: 1 }],
    constraints: [{ id: "budget", label: "Original constraint label", metric: "cost", operator: "<=", value: 3 }],
    ...TEST_DECISION_INPUTS,
  };
  const history = signedHistoryFor(original, [claim]);
  const result = evaluateDecision({
    ...original,
    title: "Rewritten title",
    owner: "New owner",
    stakeholders: ["New stakeholder"],
    options: [{ ...original.options![0], label: "Rewritten option label" }],
    constraints: [{ ...original.constraints![0], label: "Rewritten constraint label" }],
    priorSignedResult: history,
  }, [claim]);
  assert.equal(result.status, "SUPPORTED");
  assert.deepEqual(result.changeReasons, []);

  const instructionChanged = evaluateDecision({ ...original, actionIfPass: "Stop deployment immediately", priorSignedResult: history }, [claim]);
  assert.equal(instructionChanged.status, "DECISION_CHANGED");
  assert.ok(instructionChanged.changeReasons.includes("ACTION_IDENTITY"));

  const actionIdChanged = evaluateDecision({ ...original, passActionId: "test:stop-deployment", priorSignedResult: history }, [claim]);
  assert.equal(actionIdChanged.status, "DECISION_CHANGED");
  assert.ok(actionIdChanged.changeReasons.includes("ACTION_IDENTITY"));
});

test("76 blocks downstream decision approval until every bound claim is released", async () => {
  const claim = recomputeClaim(makeClaim({ type: "threshold", field: "score", aggregation: "average", operator: ">=", threshold: 80 }), makeDataset([{ id: "A", score: 90 }], [{ id: "A", score: 90 }]), RUN_AT);
  const result = evaluateDecision({ id: "release-gate", title: "Release gate", owner: "owner", ...TEST_ACTIONS, actionIfPass: "go", actionIfFail: "hold", conditions: [{ claimId: claim.id, allowedStatuses: ["SUPPORTED"] }] }, [claim]);
  const decisionReview = await createReviewRecord({ decisionId: result.decisionId, reviewer: "Owner", disposition: "APPROVED", note: "Approve only after the upstream claim is signed", createdAt: RUN_AT, targetResultId: result.resultId, targetResultHash: await hashDecisionResult(result) });
  await assert.rejects(applyReviewToDecision(result, decisionReview, [claim]), /upstream claims are unsigned/);

  const claimReview = await createReviewRecord({ claimId: claim.id, reviewer: "Owner", disposition: "APPROVED", note: "Verified source rows and threshold provenance", createdAt: RUN_AT, targetResultId: claim.resultId ?? "", targetResultHash: await hashClaimResult(claim) });
  const releasedClaim = await applyReviewToClaim(claim, claimReview);
  const releasedDecision = await applyReviewToDecision(result, decisionReview, [releasedClaim]);
  assert.equal(releasedDecision.governance.releaseStatus, "APPROVED_FOR_USE");

  const returnReview = await createReviewRecord({ claimId: claim.id, reviewer: "Owner", disposition: "CHANGES_REQUESTED", note: "Return the upstream claim after a later governance concern", createdAt: "2026-08-07T09:05:00.000Z", targetResultId: claim.resultId ?? "", targetResultHash: await hashClaimResult(claim) });
  const returnedClaim = await applyReviewToClaim(releasedClaim, returnReview);
  assert.equal(enforceDecisionReleaseDependencies(releasedDecision, [returnedClaim]).governance.releaseStatus, "BLOCKED");
});

test("77 treats decision-input provenance updates as evidence re-signing only", () => {
  const claim = recomputeClaim(makeClaim({ type: "threshold", field: "score", aggregation: "average", operator: ">=", threshold: 80 }), makeDataset([{ id: "A", score: 90 }], [{ id: "A", score: 90 }]), RUN_AT);
  const provenance = {
    kind: "MANUAL_ASSUMPTION" as const,
    source: "planning worksheet",
    version: "v1",
    rationale: "controlled test inputs",
    units: { benefit: "points", cost: "points", risk: "points", capacity: "slots" },
  };
  const spec: DecisionSpec = { id: "input-provenance", title: "Input provenance", owner: "owner", ...TEST_ACTIONS, actionIfPass: "go", actionIfFail: "hold", conditions: [{ claimId: claim.id, allowedStatuses: ["SUPPORTED"] }], options: [{ id: "A", label: "A", benefit: 10, cost: 2, risk: 1, capacity: 1 }], inputProvenance: provenance };
  const result = evaluateDecision({ ...spec, inputProvenance: { ...provenance, version: "v2" }, priorSignedResult: signedHistoryFor(spec, [claim]) }, [claim]);
  assert.equal(result.status, "RESIGN_REQUIRED");
  assert.ok(result.changeReasons.includes("INPUT_PROVENANCE"));
});

test("78 derives claim result identity from stable rule content and revokes stale sign-off", async () => {
  const dataset = makeDataset([{ id: "A", score: 90 }], [{ id: "A", score: 90 }]);
  const claim80 = recomputeClaim(makeClaim({ type: "threshold", field: "score", aggregation: "average", operator: ">=", threshold: 80 }), dataset, RUN_AT);
  const claim85 = recomputeClaim(makeClaim({ type: "threshold", field: "score", aggregation: "average", operator: ">=", threshold: 85 }), dataset, RUN_AT);
  assert.equal(claim80.status, "SUPPORTED");
  assert.equal(claim85.status, "SUPPORTED");
  assert.notEqual(claim80.resultId, claim85.resultId);

  const review = await createReviewRecord({ claimId: claim80.id, reviewer: "Owner", disposition: "APPROVED", note: "Signed the original threshold and rule source", createdAt: RUN_AT, targetResultId: claim80.resultId ?? "", targetResultHash: await hashClaimResult(claim80) });
  const released = await applyReviewToClaim(claim80, review);
  const recomputed85 = recomputeClaim({ ...makeClaim({ type: "threshold", field: "score", aggregation: "average", operator: ">=", threshold: 85 }), resultId: released.resultId, governance: released.governance }, dataset, RUN_AT);
  assert.equal(recomputed85.governance.releaseStatus, "BLOCKED");
  assert.equal(recomputed85.governance.reviewDisposition, "PENDING");

  const spec: DecisionSpec = { id: "rule-bound-decision", title: "Rule-bound decision", owner: "owner", ...TEST_ACTIONS, actionIfPass: "go", actionIfFail: "hold", conditions: [{ claimId: claim80.id, allowedStatuses: ["SUPPORTED"] }] };
  const downstream = evaluateDecision({ ...spec, priorSignedResult: signedHistoryFor(spec, [claim80]) }, [claim85]);
  assert.equal(downstream.status, "RESIGN_REQUIRED");
  assert.ok(downstream.changeReasons.includes("CLAIM_RESULTS"));
});

test("79 blocks signing numeric decision options without complete input provenance", async () => {
  const claim = recomputeClaim(makeClaim({ type: "threshold", field: "score", aggregation: "average", operator: ">=", threshold: 80 }), makeDataset([{ id: "A", score: 90 }], [{ id: "A", score: 90 }]), RUN_AT);
  const missingProvenance: DecisionSpec = {
    id: "missing-input-provenance",
    title: "Missing input provenance",
    owner: "owner",
    ...TEST_ACTIONS,
    actionIfPass: "go",
    actionIfFail: "hold",
    conditions: [{ claimId: claim.id, allowedStatuses: ["SUPPORTED"] }],
    options: [{ id: "A", label: "A", benefit: 10, cost: 2, risk: 1, capacity: 1 }],
  };
  const result = evaluateDecision(missingProvenance, [claim]);
  assert.equal(result.status, "REVIEW_REQUIRED");
  assert.ok(result.analysis?.recommendedOptionId);
  assert.match(result.reason, /source, version, rationale.*units/);

  const claimReview = await createReviewRecord({ claimId: claim.id, reviewer: "Owner", disposition: "APPROVED", note: "Verified the upstream governed threshold", createdAt: RUN_AT, targetResultId: claim.resultId ?? "", targetResultHash: await hashClaimResult(claim) });
  const releasedClaim = await applyReviewToClaim(claim, claimReview);
  const decisionReview = await createReviewRecord({ decisionId: result.decisionId, reviewer: "Owner", disposition: "APPROVED", note: "Attempt to sign inputs without provenance", createdAt: RUN_AT, targetResultId: result.resultId, targetResultHash: await hashDecisionResult(result) });
  await assert.rejects(applyReviewToDecision(result, decisionReview, [releasedClaim]), /review-required decision cannot receive ordinary approval/);

  const incomplete = evaluateDecision({ ...missingProvenance, inputProvenance: { ...TEST_DECISION_INPUTS.inputProvenance, units: { ...TEST_DECISION_INPUTS.inputProvenance.units, capacity: "" } } }, [claim]);
  assert.equal(incomplete.status, "REVIEW_REQUIRED");
  const complete = evaluateDecision({ ...missingProvenance, ...TEST_DECISION_INPUTS }, [claim]);
  assert.equal(complete.status, "SUPPORTED");
});

test("80 links independently verifiable AuditBundles through exact previous root hashes", async () => {
  const dataset = await makeVerifiableDataset("id,score\nA,90\n", "id,score\nA,91\n");
  const claim = recomputeClaim(makeClaim({ type: "threshold", field: "score", aggregation: "average", operator: ">=", threshold: 80 }), dataset, RUN_AT);
  const first = await createEvidencePackage(dataset, [claim], RUN_AT);
  const second = await createEvidencePackage(dataset, [claim], "2026-08-07T10:00:00.000Z", { previousBundleHash: first.integrity.payloadHash });
  assert.equal(first.previousBundleHash, null);
  assert.equal(second.previousBundleHash, first.integrity.payloadHash);
  assert.equal((await verifyEvidencePackage(second)).valid, true);
  const chain = await verifyAuditBundleChain([first, second]);
  assert.equal(chain.valid, true);
  assert.equal(chain.links[0].passed, true);

  const wrongLink = await createEvidencePackage(dataset, [claim], "2026-08-07T11:00:00.000Z", { previousBundleHash: "c".repeat(64) });
  assert.equal((await verifyEvidencePackage(wrongLink)).valid, true);
  const broken = await verifyAuditBundleChain([first, wrongLink]);
  assert.equal(broken.valid, false);
  assert.match(broken.errors.join("; "), /not linked/);
});

test("81 reports malformed AuditBundle-chain entries without throwing or passing a missing link", async () => {
  const malformed = {} as Awaited<ReturnType<typeof createEvidencePackage>>;
  const one = await verifyAuditBundleChain([malformed]);
  assert.equal(one.valid, false);
  assert.equal(one.bundleChecks.length, 1);
  assert.equal(one.bundleChecks[0].hash, null);
  assert.match(one.errors.join("; "), /genesis bundle.*no previous root hash/i);
  assert.match(one.errors.join("; "), /failed independent verification/);
  assert.match(one.errors.join("; "), /no valid root hash/);

  const empty = await verifyAuditBundleChain([]);
  assert.equal(empty.valid, false);
  assert.deepEqual(empty.errors, ["Bundle chain cannot be empty"]);

  const dataset = await makeVerifiableDataset("id,score\nA,90\n", "id,score\nA,91\n");
  const claim = recomputeClaim(makeClaim({ type: "threshold", field: "score", aggregation: "average", operator: ">=", threshold: 80 }), dataset, RUN_AT);
  const first = await createEvidencePackage(dataset, [claim], RUN_AT);
  const two = await verifyAuditBundleChain([first, malformed]);
  assert.equal(two.valid, false);
  assert.equal(two.links[0].passed, false);
  assert.match(two.errors.join("; "), /not linked/);

  const notAnArray = await verifyAuditBundleChain(null as unknown as Awaited<ReturnType<typeof createEvidencePackage>>[]);
  assert.equal(notAnArray.valid, false);
  assert.deepEqual(notAnArray.errors, ["AuditBundle chain must be an array"]);
});

test("82 anchors recommendation stability at an inserted exact 1.0 point", () => {
  const claim = recomputeClaim(
    makeClaim({ type: "threshold", field: "score", aggregation: "average", operator: ">=", threshold: 80 }),
    makeDataset([{ id: "A", score: 90 }], [{ id: "A", score: 90 }]),
    RUN_AT,
  );
  const result = evaluateDecision({
    id: "non-divisible-stability-grid",
    title: "Non-divisible stability grid",
    owner: "owner",
    ...TEST_ACTIONS,
    actionIfPass: "use the recommendation",
    actionIfFail: "hold",
    conditions: [{ claimId: claim.id, allowedStatuses: ["SUPPORTED"] }],
    objective: { benefitWeight: 1, costWeight: 1, riskWeight: 1 },
    options: [
      { id: "A", label: "A", benefit: 100, cost: 20, risk: 0, capacity: 1 },
      { id: "B", label: "B", benefit: 80, cost: 0, risk: 0, capacity: 1 },
    ],
    ...TEST_DECISION_INPUTS,
    uncertainty: {
      ...TEST_DECISION_INPUTS.uncertainty,
      stabilitySweep: { parameter: "benefitMultiplier", min: 0.6, max: 1.5, step: 0.3 },
    },
  }, [claim]);

  assert.equal(result.analysis?.recommendedOptionId, "A");
  assert.equal(result.analysis?.recommendationStability.recommendedOptionId, "A");
  assert.equal(result.analysis?.recommendationStability.min, 1);
  assert.equal(result.analysis?.recommendationStability.max, 1.5);
  assert.equal(result.analysis?.recommendationStability.evaluatedPoints, 5);
});
