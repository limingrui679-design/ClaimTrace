import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = path.join(ROOT, "public", "cases");
const GENERATED_AT = "2026-08-08T00:00:00.000Z";

function cell(value) {
  const text = value === null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csv(columns, rows) {
  return `${columns.join(",")}\n${rows.map((row) => columns.map((column) => cell(row[column])).join(",")).join("\n")}\n`;
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

const cases = [
  {
    id: "business-operations",
    primaryKey: "channel_id",
    columns: ["channel_id", "channel", "conversion_rate", "ticket_hours", "eligible_leads"],
    baseline: [
      { channel_id: "CH-01", channel: "Search", conversion_rate: 8.4, ticket_hours: 11.2, eligible_leads: 1200 },
      { channel_id: "CH-02", channel: "Referral", conversion_rate: 9.1, ticket_hours: 8.6, eligible_leads: 760 },
      { channel_id: "CH-03", channel: "Partner", conversion_rate: 7.8, ticket_hours: 13.4, eligible_leads: 920 },
      { channel_id: "CH-04", channel: "Direct", conversion_rate: 8.7, ticket_hours: 7.9, eligible_leads: 1100 },
    ],
    current: [
      { channel_id: "CH-01", channel: "Search", conversion_rate: 8.2, ticket_hours: 12.8, eligible_leads: 1180 },
      { channel_id: "CH-02", channel: "Referral", conversion_rate: 8.5, ticket_hours: 9.2, eligible_leads: 680 },
      { channel_id: "CH-03", channel: "Partner", conversion_rate: 9.3, ticket_hours: 15.1, eligible_leads: 950 },
      { channel_id: "CH-04", channel: "Direct", conversion_rate: 8.7, ticket_hours: "", eligible_leads: 1100 },
    ],
  },
  {
    id: "financial-risk",
    primaryKey: "account_id",
    columns: ["account_id", "portfolio", "pd_percent", "exposure", "observed_label"],
    baseline: [
      { account_id: "A-001", portfolio: "Retail", pd_percent: 2.1, exposure: 120, observed_label: 0 },
      { account_id: "A-002", portfolio: "Retail", pd_percent: 3.2, exposure: 95, observed_label: 0 },
      { account_id: "A-003", portfolio: "SME", pd_percent: 5.8, exposure: 260, observed_label: 1 },
      { account_id: "A-004", portfolio: "SME", pd_percent: 4.9, exposure: 310, observed_label: 0 },
      { account_id: "A-005", portfolio: "Retail", pd_percent: 2.8, exposure: 80, observed_label: 0 },
    ],
    current: [
      { account_id: "A-001", portfolio: "Retail", pd_percent: 2.4, exposure: 120, observed_label: 0 },
      { account_id: "A-002", portfolio: "Retail", pd_percent: "", exposure: 95, observed_label: 1 },
      { account_id: "A-003", portfolio: "SME", pd_percent: 6.4, exposure: 260, observed_label: 1 },
      { account_id: "A-004", portfolio: "SME", pd_percent: 5.6, exposure: 310, observed_label: 1 },
      { account_id: "A-006", portfolio: "Retail", pd_percent: 3.9, exposure: 140, observed_label: 0 },
    ],
  },
  {
    id: "spatial-planning",
    primaryKey: "site_id",
    columns: ["site_id", "zone", "demand_index", "travel_minutes", "flood_risk"],
    baseline: [
      { site_id: "S-01", zone: "North", demand_index: 78, travel_minutes: 18, flood_risk: 2 },
      { site_id: "S-02", zone: "East", demand_index: 82, travel_minutes: 22, flood_risk: 1 },
      { site_id: "S-03", zone: "South", demand_index: 74, travel_minutes: 16, flood_risk: 3 },
      { site_id: "S-04", zone: "West", demand_index: 80, travel_minutes: 20, flood_risk: 2 },
    ],
    current: [
      { site_id: "S-04", zone: "West", demand_index: 86, travel_minutes: 19, flood_risk: 2 },
      { site_id: "S-02", zone: "East", demand_index: 81, travel_minutes: 24, flood_risk: 1 },
      { site_id: "S-01", zone: "North", demand_index: 78, travel_minutes: 18, flood_risk: 2 },
      { site_id: "S-03", zone: "South", demand_index: 73, travel_minutes: 17, flood_risk: 4 },
    ],
  },
];

const catalog = [];
for (const definition of cases) {
  const directory = path.join(OUTPUT, definition.id);
  await mkdir(directory, { recursive: true });
  const baseline = csv(definition.columns, definition.baseline);
  const current = csv(definition.columns, definition.current);
  await writeFile(path.join(directory, "baseline.csv"), baseline, "utf8");
  await writeFile(path.join(directory, "current.csv"), current, "utf8");
  const manifest = {
    schemaVersion: "claimtrace-case/1.0.0",
    generatedAt: GENERATED_AT,
    synthetic: true,
    caseId: definition.id,
    primaryKey: definition.primaryKey,
    columns: definition.columns,
    files: {
      "baseline.csv": { sha256: sha256(baseline), bytes: Buffer.byteLength(baseline), rows: definition.baseline.length },
      "current.csv": { sha256: sha256(current), bytes: Buffer.byteLength(current), rows: definition.current.length },
    },
  };
  await writeFile(path.join(directory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  catalog.push(manifest);
}

catalog.splice(2, 0, {
  schemaVersion: "claimtrace-case/1.0.0",
  generatedAt: GENERATED_AT,
  synthetic: true,
  caseId: "population-health",
  primaryKey: "row_id",
  files: {
    "baseline.csv": { path: "/demo-data/summary-baseline.csv", manifest: "/demo-data/manifest.json" },
    "current.csv": { path: "/demo-data/summary-revision.csv", manifest: "/demo-data/manifest.json" },
  },
});

await mkdir(OUTPUT, { recursive: true });
await writeFile(path.join(OUTPUT, "catalog.json"), `${JSON.stringify({ generatedAt: GENERATED_AT, cases: catalog }, null, 2)}\n`, "utf8");
process.stdout.write(`Cataloged ${catalog.length} deterministic case packs (${cases.length} generated here, one generated by demo:generate).\n`);
