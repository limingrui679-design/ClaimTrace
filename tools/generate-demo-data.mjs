import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { RULE_ENGINE_VERSION } from "../src/core/types.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = path.join(ROOT, "public", "demo-data");
const GENERATED_AT = "2026-08-07T08:00:00.000Z";
const SEED = "claimtrace-demo-v2";

const districts = [
  { name: "North", count: 1000, riskBaseline: 318, riskRevision: 276, followupBaseline: 700, followupRevision: 730 },
  { name: "East", count: 1100, riskBaseline: 318, riskRevision: 353, followupBaseline: 871, followupRevision: 897 },
  { name: "South", count: 1050, riskBaseline: 269, riskRevision: 277, followupBaseline: 735, followupRevision: 770 },
  { name: "West", count: 1068, riskBaseline: 239, riskRevision: 254, followupBaseline: 748, followupRevision: 729 },
];

function csvCell(value) {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csv(columns, rows) {
  return `${columns.join(",")}\n${rows.map((row) => columns.map((column) => csvCell(row[column])).join(",")).join("\n")}\n`;
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function percent(numerator, denominator) {
  return Number(((numerator / denominator) * 100).toFixed(2));
}

function buildFollowup(side) {
  const rows = [];
  let globalIndex = 1;
  for (const district of districts) {
    const riskLimit = side === "baseline" ? district.riskBaseline : district.riskRevision;
    const followupLimit = side === "baseline" ? district.followupBaseline : district.followupRevision;
    for (let localIndex = 1; localIndex <= district.count; localIndex += 1) {
      rows.push({
        followup_id: `F-${String(globalIndex).padStart(4, "0")}`,
        district: district.name,
        high_risk: localIndex <= riskLimit ? 1 : 0,
        followup_completed: localIndex <= followupLimit ? 1 : 0,
      });
      globalIndex += 1;
    }
  }
  return rows;
}

function buildValidation(side) {
  return Array.from({ length: 286 }, (_, index) => {
    const ordinal = index + 1;
    const positive = ordinal <= 156;
    const truePositiveLimit = side === "baseline" ? 132 : 123;
    return {
      sample_id: `V-${String(ordinal).padStart(3, "0")}`,
      split: "validation",
      y_true: positive ? 1 : 0,
      y_pred: positive && ordinal <= truePositiveLimit ? 1 : 0,
    };
  });
}

function summary(side) {
  const rows = [];
  let rowNumber = 1;
  for (const district of districts) {
    const risk = side === "baseline" ? district.riskBaseline : district.riskRevision;
    rows.push({
      row_id: `R-${String(rowNumber).padStart(3, "0")}`,
      indicator: "High-risk rate",
      segment: district.name,
      value: percent(risk, district.count),
      unit: "%",
      source_file: `followup-${side}.csv`,
      source_field: "high_risk",
    });
    rowNumber += 1;
  }
  const truePositives = side === "baseline" ? 132 : 123;
  rows.push({ row_id: "R-005", indicator: "Model recall", segment: "Citywide", value: percent(truePositives, 156), unit: "%", source_file: `validation-${side}.csv`, source_field: "y_true+y_pred" });
  const completedTotal = districts.reduce((total, district) => total + (side === "baseline" ? district.followupBaseline : district.followupRevision), 0);
  rows.push({ row_id: "R-006", indicator: "Follow-up completion rate", segment: "Citywide", value: percent(completedTotal, 4218), unit: "%", source_file: `followup-${side}.csv`, source_field: "followup_completed" });
  rows.push({ row_id: "R-007", indicator: "Follow-up target", segment: "Citywide", value: 80, unit: "%", source_file: "policy.json", source_field: "followup_target_percent" });
  rowNumber = 8;
  for (const district of districts) {
    const completed = side === "baseline" ? district.followupBaseline : district.followupRevision;
    rows.push({
      row_id: `R-${String(rowNumber).padStart(3, "0")}`,
      indicator: "Follow-up completion rate",
      segment: district.name,
      value: percent(completed, district.count),
      unit: "%",
      source_file: `followup-${side}.csv`,
      source_field: "followup_completed",
    });
    rowNumber += 1;
  }
  return rows;
}

await mkdir(OUTPUT, { recursive: true });

const summaryBaseline = summary("baseline");
const summaryRevision = summary("revision");
const followupBaselineRows = buildFollowup("baseline");
const followupRevisionRows = buildFollowup("revision");
const validationBaselineRows = buildValidation("baseline");
const validationRevisionRows = buildValidation("revision");

const outputs = new Map([
  ["followup-baseline.csv", csv(["followup_id", "district", "high_risk", "followup_completed"], followupBaselineRows)],
  ["followup-revision.csv", csv(["followup_id", "district", "high_risk", "followup_completed"], followupRevisionRows)],
  ["validation-baseline.csv", csv(["sample_id", "split", "y_true", "y_pred"], validationBaselineRows)],
  ["validation-revision.csv", csv(["sample_id", "split", "y_true", "y_pred"], validationRevisionRows)],
  ["summary-baseline.csv", csv(["row_id", "indicator", "segment", "value", "unit", "source_file", "source_field"], summaryBaseline)],
  ["summary-revision.csv", csv(["row_id", "indicator", "segment", "value", "unit", "source_file", "source_field"], summaryRevision)],
  ["policy.json", `${JSON.stringify({ followup_target_percent: 80, approvedAt: "2026-07-31T09:00:00.000Z", synthetic: true }, null, 2)}\n`],
]);

const upstreamSources = [
  { id: "followup-baseline", side: "baseline", fileName: "followup-baseline.csv", primaryKey: "followup_id", rows: followupBaselineRows },
  { id: "followup-revision", side: "current", fileName: "followup-revision.csv", primaryKey: "followup_id", rows: followupRevisionRows },
  { id: "validation-baseline", side: "baseline", fileName: "validation-baseline.csv", primaryKey: "sample_id", rows: validationBaselineRows },
  { id: "validation-revision", side: "current", fileName: "validation-revision.csv", primaryKey: "sample_id", rows: validationRevisionRows },
].map((source) => {
  const rawText = outputs.get(source.fileName);
  return { id: source.id, side: source.side, fileName: source.fileName, primaryKey: source.primaryKey, sha256: sha256(rawText), rowCount: source.rows.length, byteSize: Buffer.byteLength(rawText), rawText };
});

function aggregation({ id, side, summaryKey, sourceId, sourceRows, sourcePrimaryKey, filters, numeratorField }) {
  const filtered = sourceRows.filter((row) => filters.every((entry) => String(row[entry.field] ?? "") === String(entry.equals)));
  return {
    id,
    side,
    summaryKey,
    sourceId,
    filters,
    numerator: { operation: "sum", field: numeratorField },
    denominator: { operation: "count" },
    multiplier: 100,
    roundDigits: 2,
    sourceRowCount: filtered.length,
    sourceKeysHash: sha256(JSON.stringify(filtered.map((row) => String(row[sourcePrimaryKey])).sort())),
    formulaVersion: "claimtrace-aggregation/1.0.0",
  };
}

const upstreamAggregations = [];
for (const [side, followupRows, validationRows, followupSource, validationSource] of [
  ["baseline", followupBaselineRows, validationBaselineRows, "followup-baseline", "validation-baseline"],
  ["current", followupRevisionRows, validationRevisionRows, "followup-revision", "validation-revision"],
]) {
  districts.forEach((district, index) => upstreamAggregations.push(aggregation({ id: `${side}-risk-${district.name}`, side, summaryKey: `R-${String(index + 1).padStart(3, "0")}`, sourceId: followupSource, sourceRows: followupRows, sourcePrimaryKey: "followup_id", filters: [{ field: "district", equals: district.name }], numeratorField: "high_risk" })));
  upstreamAggregations.push(aggregation({ id: `${side}-recall`, side, summaryKey: "R-005", sourceId: validationSource, sourceRows: validationRows, sourcePrimaryKey: "sample_id", filters: [{ field: "y_true", equals: 1 }], numeratorField: "y_pred" }));
  upstreamAggregations.push(aggregation({ id: `${side}-completion-city`, side, summaryKey: "R-006", sourceId: followupSource, sourceRows: followupRows, sourcePrimaryKey: "followup_id", filters: [], numeratorField: "followup_completed" }));
  districts.forEach((district, index) => upstreamAggregations.push(aggregation({ id: `${side}-completion-${district.name}`, side, summaryKey: `R-${String(index + 8).padStart(3, "0")}`, sourceId: followupSource, sourceRows: followupRows, sourcePrimaryKey: "followup_id", filters: [{ field: "district", equals: district.name }], numeratorField: "followup_completed" })));
}

const upstreamLineage = {
  schemaVersion: "claimtrace-upstream-lineage/1.0.0",
  generatedAt: GENERATED_AT,
  sources: upstreamSources,
  aggregations: upstreamAggregations,
};
outputs.set("upstream-lineage.json", `${JSON.stringify(upstreamLineage, null, 2)}\n`);

for (const [name, content] of outputs) await writeFile(path.join(OUTPUT, name), content, "utf8");

const manifest = {
  schemaVersion: "claimtrace-demo/2.0.0",
  generatedAt: GENERATED_AT,
  seed: SEED,
  synthetic: true,
  statements: {
    followupRecords: 4218,
    validationSamples: 286,
    validationPositives: 156,
    baselineTruePositives: 132,
    revisionTruePositives: 123,
    additionalFalseNegatives: 9,
  },
  formulas: {
    riskRate: "sum(high_risk) / count(followup_id) * 100",
    followupCompletionRate: "sum(followup_completed) / count(followup_id) * 100",
    recall: "TP / (TP + FN) * 100",
  },
  files: Object.fromEntries([...outputs].map(([name, content]) => [name, {
    sha256: sha256(content),
    bytes: Buffer.byteLength(content),
    dataRows: content.startsWith("{") ? null : content.trimEnd().split("\n").length - 1,
  }])),
};

await writeFile(path.join(OUTPUT, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

const generatedDataset = {
  projectName: "Community Chronic-Disease Follow-Up Prioritization",
  baselineName: "v1.0 · Synthetic baseline",
  currentName: "v1.1 · Synthetic revision",
  baselineRows: summaryBaseline,
  currentRows: summaryRevision,
  baselineLineNumbers: summaryBaseline.map((_, index) => index + 2),
  currentLineNumbers: summaryRevision.map((_, index) => index + 2),
  baselineMeta: {
    fileName: "summary-baseline.csv",
    sha256: manifest.files["summary-baseline.csv"].sha256,
    normalizedSha256: sha256(JSON.stringify(summaryBaseline.map((row) => ["row_id", "indicator", "segment", "value", "unit", "source_file", "source_field"].map((column) => String(row[column] ?? ""))))),
    hashVerified: true,
    verification: {
      status: "verified",
      method: "raw-bytes+normalized-rows",
      verifiedAt: GENERATED_AT,
      recomputedSha256: manifest.files["summary-baseline.csv"].sha256,
      recomputedNormalizedSha256: sha256(JSON.stringify(summaryBaseline.map((row) => ["row_id", "indicator", "segment", "value", "unit", "source_file", "source_field"].map((column) => String(row[column] ?? ""))))),
    },
    generatedAt: GENERATED_AT,
    rowCount: summaryBaseline.length,
    byteSize: manifest.files["summary-baseline.csv"].bytes,
    encoding: "utf-8",
    mediaType: "text/csv",
  },
  currentMeta: {
    fileName: "summary-revision.csv",
    sha256: manifest.files["summary-revision.csv"].sha256,
    normalizedSha256: sha256(JSON.stringify(summaryRevision.map((row) => ["row_id", "indicator", "segment", "value", "unit", "source_file", "source_field"].map((column) => String(row[column] ?? ""))))),
    hashVerified: true,
    verification: {
      status: "verified",
      method: "raw-bytes+normalized-rows",
      verifiedAt: GENERATED_AT,
      recomputedSha256: manifest.files["summary-revision.csv"].sha256,
      recomputedNormalizedSha256: sha256(JSON.stringify(summaryRevision.map((row) => ["row_id", "indicator", "segment", "value", "unit", "source_file", "source_field"].map((column) => String(row[column] ?? ""))))),
    },
    generatedAt: GENERATED_AT,
    rowCount: summaryRevision.length,
    byteSize: manifest.files["summary-revision.csv"].bytes,
    encoding: "utf-8",
    mediaType: "text/csv",
  },
  baselineRawText: outputs.get("summary-baseline.csv"),
  currentRawText: outputs.get("summary-revision.csv"),
  upstreamLineage,
  columns: ["row_id", "indicator", "segment", "value", "unit", "source_file", "source_field"],
  primaryKey: "row_id",
  ruleVersion: RULE_ENGINE_VERSION,
  isDemo: true,
};
const generatedModule = `// Generated by tools/generate-demo-data.mjs. Do not edit by hand.\nimport type { DatasetVersion } from "./claimtrace-core";\n\nexport const DEMO_DATASET = ${JSON.stringify(generatedDataset, null, 2)} as DatasetVersion;\n`;
await writeFile(path.join(ROOT, "app", "demo-case.generated.ts"), generatedModule, "utf8");
process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
