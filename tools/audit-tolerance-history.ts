import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import {
  auditToleranceHistory, parseCSV, rebuildExternalSnapshot, sha256Text,
  type Claim, type CsvRow, type ExternalSourceProvenance, type ToleranceHistorySpec,
} from "../src/core/index.ts";

async function treasuryHistory() {
  const dir = fileURLToPath(new URL("../public/cases/us-treasury-yield-curve/", import.meta.url));
  const source: ExternalSourceProvenance = JSON.parse(await readFile(join(dir, "source-metadata.json"), "utf8"));
  const claims: Claim[] = JSON.parse(await readFile(join(dir, "claims.json"), "utf8"));
  const claim = claims.find(item => item.id === "treasury-selected-mean-stability");
  if (claim?.rule?.type !== "stability" || claim.rule.aggregation !== "average") throw new Error("Missing UST-003 mean stability rule.");
  for (const raw of source.rawArtifacts) {
    const body = await readFile(join(dir, raw.fileName), "utf8");
    if (await sha256Text(body) !== raw.sha256 || body !== raw.text) throw new Error(`Pinned XML mismatch for ${raw.fileName}`);
  }

  const parameters = source.cleaning.parameters;
  const baselineDate = String(parameters.baselineDate);
  const lastDate = String(parameters.currentDate);
  const current = source.rawArtifacts.find(raw => raw.side === "current")!;
  const publishedDates = [...current.text.matchAll(/<d:NEW_DATE\b[^>]*>(\d{4}-\d{2}-\d{2})T/g)]
    .map(match => match[1]).filter(date => date > baselineDate && date <= lastDate).sort();
  if (publishedDates.at(-1) !== lastDate) throw new Error("Declared endpoint missing from Treasury archive.");
  const dates = [baselineDate, ...publishedDates];
  const keys = (parameters.maturities as {code: string}[]).map(item => item.code);
  const rows: CsvRow[] = [];
  const snapshotHashes: Record<string, string> = {};
  for (const date of dates) {
    const side = date === baselineDate ? "baseline" : "current";
    const daily = { ...source, cleaning: { ...source.cleaning, parameters: { ...parameters, currentDate: date } } };
    const rebuilt = rebuildExternalSnapshot(daily, side);
    if (!rebuilt.text || rebuilt.errors.length) throw new Error(`${date}: ${rebuilt.errors.join(", ")}`);
    if (date === baselineDate || date === lastDate) snapshotHashes[side] = await sha256Text(rebuilt.text);
    rows.push(...parseCSV(rebuilt.text).rows);
  }
  const history = auditToleranceHistory(rows, {
    dates, keys, dateField: "observation_date", keyField: "maturity_code", valueField: claim.rule.field,
    aggregation: "average", tolerancePct: claim.rule.supportTolerance,
  });

  const months = new Map<string, typeof history.observations>();
  for (const observation of history.observations.slice(1)) {
    const month = observation.date.slice(0, 7);
    if (!months.has(month)) months.set(month, []);
    months.get(month)!.push(observation);
  }
  const monthlyEndpoints = [...months].map(([month, days]) => ({
    month, first: days[0], last: days[days.length - 1], observedDates: days.length,
    breaches: days.filter(day => day.status === "breach").length,
    hiddenBreachDates: days[0].status === "within" && days[days.length - 1].status === "within"
      ? days.filter(day => day.status === "breach").map(day => day.date) : [],
  }));
  return {
    claimId: claim.id,
    calendar: "All published observation dates in the pinned annual Treasury XML between the declared endpoints.",
    vintage: source.retrievedAt,
    snapshotHashes,
    sources: source.rawArtifacts.map(raw => ({side: raw.side, file: raw.fileName, url: source.sourceUrls[raw.side], sha256: raw.sha256})),
    monthlyEndpoints, history,
  };
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.log(JSON.stringify(await treasuryHistory(), null, 2));
} else if (args.length === 2) {
  const csv = await readFile(args[0], "utf8");
  const spec = await readFile(args[1], "utf8");
  const history = auditToleranceHistory(parseCSV(csv).rows, JSON.parse(spec) as ToleranceHistorySpec);
  console.log(JSON.stringify({ csvSha256: await sha256Text(csv), specSha256: await sha256Text(spec), history }, null, 2));
} else {
  throw new Error("Use audit:history with no arguments for Treasury, or supply a long-format CSV and JSON specification.");
}
