import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIRECTORY = path.join(ROOT, "public", "cases", "world-bank-life-expectancy");
const CONFIG_FILE = path.join(DIRECTORY, "source-config.json");
const SIDES = [
  { side: "baseline", fileName: "raw-2019.json", outputName: "baseline.csv" },
  { side: "current", fileName: "raw-2024.json", outputName: "current.csv" },
];

const sha256 = (content) => createHash("sha256").update(content).digest("hex");
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const csvCell = (value) => /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;

await mkdir(DIRECTORY, { recursive: true });
const config = JSON.parse(await readFile(CONFIG_FILE, "utf8"));
const outputs = {};
const rawArtifacts = [];

for (const definition of SIDES) {
  const rawText = await readFile(path.join(DIRECTORY, definition.fileName), "utf8");
  const response = JSON.parse(rawText);
  if (!Array.isArray(response) || !Array.isArray(response[1])) throw new Error(`${definition.fileName}: invalid World Bank response`);
  if (response[0]?.lastupdated !== config.sourceLastUpdated) throw new Error(`${definition.fileName}: source last-updated date changed`);
  const year = definition.side === "baseline" ? config.cleaning.baselineYear : config.cleaning.currentYear;
  const selected = new Set(config.cleaning.selectedCountryCodes);
  const rows = response[1]
    .filter((row) => row.date === year && selected.has(row.countryiso3code))
    .sort((left, right) => left.countryiso3code.localeCompare(right.countryiso3code));
  if (rows.length !== selected.size || new Set(rows.map((row) => row.countryiso3code)).size !== selected.size) throw new Error(`${definition.fileName}: selected country coverage is incomplete or duplicated`);
  const lines = rows.map((row) => {
    if (row.indicator?.id !== config.indicator.id || row.indicator?.value !== config.indicator.name) throw new Error(`${definition.fileName}: indicator identity mismatch`);
    if (!Number.isFinite(row.value)) throw new Error(`${definition.fileName}: non-numeric or missing value for ${row.countryiso3code}`);
    return [row.countryiso3code, row.country?.value ?? "", year, row.value.toFixed(config.cleaning.decimalPlaces), config.indicator.id].map((value) => csvCell(String(value))).join(",");
  });
  const csvText = `country_code,country,observation_year,life_expectancy_years,indicator_code\n${lines.join("\n")}\n`;
  await writeFile(path.join(DIRECTORY, definition.outputName), csvText, "utf8");
  outputs[definition.outputName] = { sha256: sha256(csvText), bytes: Buffer.byteLength(csvText), rows: rows.length };
  rawArtifacts.push({ side: definition.side, fileName: definition.fileName, sha256: sha256(rawText), text: rawText });
}

const provenance = {
  schemaVersion: "claimtrace-external-source/1.0.0",
  sourceType: "WORLD_BANK_INDICATORS_API_V2",
  publisher: config.publisher,
  dataset: config.dataset,
  indicator: config.indicator,
  retrievedAt: config.retrievedAt,
  sourceLastUpdated: config.sourceLastUpdated,
  sourceUrls: config.sourceUrls,
  license: config.license,
  licenseUrl: config.licenseUrl,
  attribution: config.attribution,
  cleaning: config.cleaning,
  rawArtifacts,
};
await writeFile(path.join(DIRECTORY, "source-metadata.json"), json(provenance), "utf8");
await writeFile(path.join(DIRECTORY, "cleaning-log.json"), json({
  schemaVersion: "claimtrace-cleaning-log/1.0.0",
  generatedAt: config.retrievedAt,
  implementation: config.cleaning.implementation,
  sourceConfigSha256: sha256(await readFile(CONFIG_FILE)),
  transformations: [
    "Parse two pinned World Bank Indicators API v2 JSON responses",
    `Require indicator ${config.indicator.id} and source last-updated ${config.sourceLastUpdated}`,
    `Keep exactly ${config.cleaning.selectedCountryCodes.length} declared ISO3 country codes`,
    `Map ${config.cleaning.baselineYear} to baseline and ${config.cleaning.currentYear} to current`,
    `Round life expectancy to ${config.cleaning.decimalPlaces} decimal places with fixed-width output`,
    "Sort records by ISO3 country code and emit UTF-8 CSV with a stable column order",
  ],
  rawArtifacts: rawArtifacts.map(({ side, fileName, sha256: digest, text }) => ({ side, fileName, sha256: digest, bytes: Buffer.byteLength(text) })),
  outputs,
}), "utf8");

process.stdout.write("Generated deterministic World Bank public-data snapshots and provenance.\n");
