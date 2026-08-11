import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { RULE_ENGINE_VERSION, parseCSV, valueToNumber } from "../app/claimtrace-core";
import { DEMO_DATASET } from "../app/demo-case.generated";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "public", "demo-data");
const manifest = JSON.parse(await readFile(path.join(DATA, "manifest.json"), "utf8"));

async function csv(name: string) {
  return parseCSV(await readFile(path.join(DATA, name), "utf8"));
}

test("44 manifest hashes and row counts match every generated artifact", async () => {
  for (const [name, expected] of Object.entries(manifest.files) as Array<[string, { sha256: string; bytes: number; dataRows: number | null }]>) {
    const content = await readFile(path.join(DATA, name));
    assert.equal(createHash("sha256").update(content).digest("hex"), expected.sha256, name);
    assert.equal(content.byteLength, expected.bytes, name);
    if (expected.dataRows !== null) assert.equal(content.toString("utf8").trimEnd().split("\n").length - 1, expected.dataRows, name);
  }
  assert.equal(DEMO_DATASET.baselineMeta.sha256, manifest.files["summary-baseline.csv"].sha256);
  assert.equal(DEMO_DATASET.currentMeta?.sha256, manifest.files["summary-revision.csv"].sha256);
  assert.equal(DEMO_DATASET.baselineRows.length, manifest.files["summary-baseline.csv"].dataRows);
  assert.equal(DEMO_DATASET.currentRows?.length, manifest.files["summary-revision.csv"].dataRows);
  assert.equal(DEMO_DATASET.ruleVersion, RULE_ENGINE_VERSION);
});

test("45 followup detail contains exactly 4,218 uniquely keyed records", async () => {
  for (const name of ["followup-baseline.csv", "followup-revision.csv"]) {
    const parsed = await csv(name);
    assert.equal(parsed.rows.length, 4218);
    assert.equal(new Set(parsed.rows.map((row) => String(row.followup_id))).size, 4218);
  }
});

test("46 validation detail contains 286 samples and exactly nine added false negatives", async () => {
  const baseline = await csv("validation-baseline.csv");
  const revision = await csv("validation-revision.csv");
  const falseNegatives = (rows: typeof baseline.rows) => rows.filter((row) => valueToNumber(row.y_true) === 1 && valueToNumber(row.y_pred) === 0).length;
  assert.equal(baseline.rows.length, 286);
  assert.equal(revision.rows.length, 286);
  assert.equal(falseNegatives(baseline.rows), 24);
  assert.equal(falseNegatives(revision.rows), 33);
  assert.equal(falseNegatives(revision.rows) - falseNegatives(baseline.rows), 9);
});

test("47 summary recall is reproducible from validation detail", async () => {
  for (const side of ["baseline", "revision"] as const) {
    const detail = await csv(`validation-${side}.csv`);
    const summary = await csv(`summary-${side}.csv`);
    const positives = detail.rows.filter((row) => valueToNumber(row.y_true) === 1);
    const truePositives = positives.filter((row) => valueToNumber(row.y_pred) === 1).length;
    const calculated = Number(((truePositives / positives.length) * 100).toFixed(2));
    const reported = summary.rows.find((row) => row.indicator === "Model recall")?.value;
    assert.equal(valueToNumber(reported), calculated);
  }
});

test("48 every reported risk and completion rate reproduces from followup detail", async () => {
  for (const side of ["baseline", "revision"] as const) {
    const detail = await csv(`followup-${side}.csv`);
    const summary = await csv(`summary-${side}.csv`);
    for (const row of summary.rows.filter((entry) => entry.indicator === "High-risk rate" || entry.indicator === "Follow-up completion rate")) {
      const rows = row.segment === "Citywide" ? detail.rows : detail.rows.filter((entry) => entry.district === row.segment);
      const field = row.indicator === "High-risk rate" ? "high_risk" : "followup_completed";
      const numerator = rows.reduce((total, entry) => total + (valueToNumber(entry[field]) ?? 0), 0);
      assert.equal(valueToNumber(row.value), Number(((numerator / rows.length) * 100).toFixed(2)), `${side}:${row.indicator}:${row.segment}`);
    }
  }
});
