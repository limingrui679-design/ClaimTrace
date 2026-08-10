import assert from "node:assert/strict";
import test from "node:test";
import {
  RULE_ENGINE_VERSION,
  type Claim,
  type CsvRow,
  type DatasetVersion,
  type Rule,
  compareRows,
  diffRowsByKey,
  recomputeClaim,
} from "../app/claimtrace-core";

const RUN_AT = "2026-08-08T00:00:00.000Z";
const BASE_HASH = "a".repeat(64);
const CURRENT_HASH = "b".repeat(64);

function randomGenerator(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function shuffled<T>(values: T[], random: () => number) {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [copy[index], copy[target]] = [copy[target], copy[index]];
  }
  return copy;
}

function dataset(baselineRows: CsvRow[], currentRows: CsvRow[]): DatasetVersion {
  return {
    projectName: "Property test",
    baselineName: "baseline",
    currentName: "current",
    baselineRows,
    currentRows,
    baselineLineNumbers: baselineRows.map((_, index) => index + 2),
    currentLineNumbers: currentRows.map((_, index) => index + 2),
    baselineMeta: { fileName: "baseline.csv", sha256: BASE_HASH, hashVerified: true, verification: { status: "verified", recomputedSha256: BASE_HASH }, generatedAt: RUN_AT, rowCount: baselineRows.length, byteSize: 100 },
    currentMeta: { fileName: "current.csv", sha256: CURRENT_HASH, hashVerified: true, verification: { status: "verified", recomputedSha256: CURRENT_HASH }, generatedAt: RUN_AT, rowCount: currentRows.length, byteSize: 100 },
    columns: [...new Set([...baselineRows, ...currentRows].flatMap((row) => Object.keys(row)))],
    primaryKey: "id",
    ruleVersion: RULE_ENGINE_VERSION,
    isDemo: false,
  };
}

function claimFor(rule: Rule, data: DatasetVersion) {
  const seed: Claim = {
    id: "property-claim",
    kind: rule.type === "stability" ? "VERSION_COMPARISON" : "SNAPSHOT",
    code: "PROP-001",
    title: "Property claim",
    section: "test",
    owner: "test",
    category: "property",
    status: "REVIEW_REQUIRED",
    baselineStatus: "UNTESTABLE",
    baselineValue: "",
    currentValue: "",
    formula: "property",
    reason: "",
    action: "",
    sourceRefs: [],
    evidence: [],
    governance: { engineStatus: "REVIEW_REQUIRED", reviewDisposition: "PENDING", releaseStatus: "BLOCKED" },
    audit: { ruleVersion: RULE_ENGINE_VERSION, lastRunAt: RUN_AT, baselineSha256: BASE_HASH, currentSha256: CURRENT_HASH, preliminary: false },
    rule,
  };
  return recomputeClaim(seed, data, RUN_AT);
}

test("property: keyed diff is invariant to 128 deterministic row permutations", () => {
  const random = randomGenerator(20260808);
  for (let iteration = 0; iteration < 128; iteration += 1) {
    const rows = Array.from({ length: 4 + (iteration % 29) }, (_, index) => ({ id: `K-${iteration}-${index}`, value: Math.floor(random() * 10_000), group: `G-${index % 4}` }));
    assert.equal(compareRows(dataset(rows, shuffled(rows, random))), 0, `iteration ${iteration}`);
  }
});

test("property: one keyed edit remains one changed record under arbitrary ordering", () => {
  const random = randomGenerator(741852);
  for (let iteration = 0; iteration < 128; iteration += 1) {
    const rows = Array.from({ length: 6 + (iteration % 23) }, (_, index) => ({ id: `R-${index}`, value: index, note: `n-${iteration}-${index}` }));
    const editedKey = `R-${Math.floor(random() * rows.length)}`;
    const current = shuffled(rows.map((row) => row.id === editedKey ? { ...row, note: `${row.note}-edited` } : row), random);
    const diffs = diffRowsByKey(dataset(rows, current)).filter((item) => item.kind !== "unchanged");
    assert.deepEqual(diffs.map((item) => item.key), [editedKey], `iteration ${iteration}`);
  }
});

test("property: governed stability accepts 128 same-cohort changes inside the boundary", () => {
  const random = randomGenerator(963258);
  const rule: Rule = {
    type: "stability",
    field: "value",
    aggregation: "average",
    supportTolerance: 5,
    supportToleranceSpec: { value: 5, unit: "percent", source: "property-test policy", rationale: "inclusive five-percent band", confirmedBy: "test owner", confirmedAt: RUN_AT },
  };
  for (let iteration = 0; iteration < 128; iteration += 1) {
    const baseline = Array.from({ length: 5 + (iteration % 17) }, (_, index) => ({ id: `S-${index}`, value: 20 + random() * 180 }));
    const ratio = 0.951 + random() * 0.098;
    const current = shuffled(baseline.map((row) => ({ ...row, value: Number((Number(row.value) * ratio).toFixed(8)) })), random);
    assert.equal(claimFor(rule, dataset(baseline, current)).status, "SUPPORTED", `iteration ${iteration}`);
  }
});

test("property: grouped rank result is invariant to row order and supports a unique winner", () => {
  const random = randomGenerator(159357);
  const rule: Rule = { type: "rank", field: "value", aggregation: "average", groupField: "group", expectedGroup: "Winner", rank: "max", tiePolicy: "require_unique" };
  for (let iteration = 0; iteration < 128; iteration += 1) {
    const rows = [
      { id: `W-${iteration}-1`, group: "Winner", value: 100 + random() },
      { id: `W-${iteration}-2`, group: "Winner", value: 101 + random() },
      { id: `O-${iteration}-1`, group: "Other", value: 60 + random() },
      { id: `O-${iteration}-2`, group: "Other", value: 61 + random() },
      { id: `T-${iteration}`, group: "Third", value: 20 + random() },
    ];
    assert.equal(claimFor(rule, dataset(rows, shuffled(rows, random))).status, "SUPPORTED", `iteration ${iteration}`);
  }
});
