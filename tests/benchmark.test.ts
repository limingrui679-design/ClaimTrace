import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { runControlledBenchmark } from "../benchmarks/controlled-benchmark";

test("controlled benchmark contains 64 distinct labeled edge-case scenarios", () => {
  const result = runControlledBenchmark();
  assert.equal(result.scenarioCount, 64);
  assert.equal(result.outcomes.length, 64);
  assert.equal(Object.keys(result.byCategory).length, 8);
  assert.equal(result.labelSource, "benchmarks/labels.json");
  assert.match(result.design, /64 distinct controlled scenarios/);
  for (const category of Object.values(result.byCategory)) assert.equal(category.scenarios, 8);
});

test("deterministic engine matches every controlled label", () => {
  const result = runControlledBenchmark();
  assert.equal(result.metrics.claimtraceCorrect, 64);
  assert.equal(result.metrics.claimtraceAccuracy, 1);
});

test("naive line and scalar baselines expose the targeted failure modes", () => {
  const result = runControlledBenchmark();
  assert.ok(result.metrics.naiveCorrect < result.metrics.claimtraceCorrect);
  assert.equal(result.byCategory.row_reorder.naiveCorrect, 0);
  assert.ok(result.byCategory.zero_baseline.naiveCorrect < result.byCategory.zero_baseline.scenarios);
  assert.ok(result.byCategory.missing_pattern.naiveCorrect < result.byCategory.missing_pattern.scenarios);
  assert.ok(result.byCategory.rank_edge.naiveCorrect < result.byCategory.rank_edge.scenarios);
  assert.ok(result.byCategory.decision_identity.naiveCorrect < result.byCategory.decision_identity.scenarios);
  assert.ok(result.metrics.metricOnlyCorrect < result.metrics.claimtraceCorrect);
  assert.ok(result.metrics.diffOnlyCorrect < result.metrics.claimtraceCorrect);
  assert.equal(result.classification.claimtrace.falseReassuranceRate, 0);
  assert.ok(result.classification.lineOrScalarBaseline.falseReassuranceRate > 0);
  assert.ok(result.ablations.withoutDenominatorAwarenessCorrect < result.metrics.claimtraceCorrect);
  assert.ok(result.ablations.withoutThresholdGovernanceCorrect < result.metrics.claimtraceCorrect);
  assert.ok(result.ablations.withoutDecisionIdentityCorrect < result.metrics.claimtraceCorrect);
});

test("independent label JSON contains exactly one label for every scenario", async () => {
  const labels = JSON.parse(await readFile(new URL("../benchmarks/labels.json", import.meta.url), "utf8"));
  assert.equal(Object.keys(labels.labels).length, 64);
  assert.equal(labels.schemaVersion, "claimtrace-regression-labels/2.0.0");
});

test("committed benchmark artifact equals a fresh run", async () => {
  const committed = JSON.parse(await readFile(new URL("../benchmarks/results.json", import.meta.url), "utf8"));
  assert.deepEqual(committed, runControlledBenchmark());
});
