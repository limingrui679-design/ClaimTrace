import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { SnapshotSide } from "../src/core";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CASES = path.join(ROOT, "public", "cases");
const requested = new Set(process.argv.slice(2));
const SIDES: SnapshotSide[] = ["baseline", "current"];

const caseIds = (await readdir(CASES, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && (!requested.size || requested.has(entry.name)))
  .map((entry) => entry.name)
  .sort();

let refreshed = 0;
for (const caseId of caseIds) {
  const directory = path.join(CASES, caseId);
  let config: { schemaVersion: string; sourceUrls: Record<SnapshotSide, string>; rawFiles: Record<SnapshotSide, string> };
  try {
    config = JSON.parse(await readFile(path.join(directory, "source-config.json"), "utf8"));
  } catch {
    continue;
  }
  if (config.schemaVersion !== "claimtrace-external-source-config/2.0.0") throw new Error(`${caseId}: unsupported source-config schema`);
  for (const side of SIDES) {
    const response = await fetch(config.sourceUrls[side], {
      headers: {
        Accept: "application/json, text/csv, application/xml, text/xml;q=0.9, */*;q=0.1",
        "User-Agent": "ClaimTrace/0.8 public-data portfolio research (https://github.com/limingrui679-design)",
      },
    });
    if (!response.ok) throw new Error(`${caseId}:${side}: ${response.status} ${response.statusText}`);
    const text = await response.text();
    if (!text.trim()) throw new Error(`${caseId}:${side}: source returned an empty body`);
    await writeFile(path.join(directory, config.rawFiles[side]), text, "utf8");
  }
  refreshed += 1;
}

process.stdout.write(`Refreshed and pinned ${refreshed} public-data case source pairs.\n`);
