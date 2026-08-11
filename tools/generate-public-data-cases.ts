import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rebuildExternalSnapshot, type ExternalSourceProvenance, type SnapshotSide } from "../src/core";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CASES = path.join(ROOT, "public", "cases");
const SIDES: SnapshotSide[] = ["baseline", "current"];
const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = (content: string | Buffer) => createHash("sha256").update(content).digest("hex");

interface SourceConfig extends Omit<ExternalSourceProvenance, "schemaVersion" | "rawArtifacts"> {
  schemaVersion: "claimtrace-external-source-config/2.1.0";
  rawFiles: Record<SnapshotSide, string>;
}

const caseIds = (await readdir(CASES, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

let generated = 0;
for (const caseId of caseIds) {
  const directory = path.join(CASES, caseId);
  let configText: string;
  try {
    configText = await readFile(path.join(directory, "source-config.json"), "utf8");
  } catch {
    continue;
  }
  const config = JSON.parse(configText) as SourceConfig;
  if (config.schemaVersion !== "claimtrace-external-source-config/2.1.0") throw new Error(`${caseId}: unsupported source-config schema`);
  const rawArtifacts = await Promise.all(SIDES.map(async (side) => {
    const fileName = config.rawFiles[side];
    const text = await readFile(path.join(directory, fileName), "utf8");
    return { side, fileName, sha256: sha256(text), text };
  }));
  const provenance: ExternalSourceProvenance = {
    schemaVersion: "claimtrace-external-source/2.1.0",
    sourceType: config.sourceType,
    publisher: config.publisher,
    dataset: config.dataset,
    measure: config.measure,
    retrievedAt: config.retrievedAt,
    sourceLastUpdated: config.sourceLastUpdated,
    sourceLastUpdatedBasis: config.sourceLastUpdatedBasis,
    sourceLastUpdatedNotReportedReason: config.sourceLastUpdatedNotReportedReason,
    sourceUrls: config.sourceUrls,
    license: config.license,
    licenseUrl: config.licenseUrl,
    attribution: config.attribution,
    limitations: config.limitations,
    cleaning: config.cleaning,
    rawArtifacts,
  };
  const outputs: Record<string, { sha256: string; bytes: number; rows: number }> = {};
  const transformations: Record<SnapshotSide, string[]> = { baseline: [], current: [] };
  for (const side of SIDES) {
    const rebuilt = rebuildExternalSnapshot(provenance, side);
    if (!rebuilt.text || rebuilt.errors.length) throw new Error(`${caseId}:${side}: ${rebuilt.errors.join("; ") || "cleaner returned no output"}`);
    const fileName = `${side}.csv`;
    await writeFile(path.join(directory, fileName), rebuilt.text, "utf8");
    outputs[fileName] = {
      sha256: sha256(rebuilt.text),
      bytes: Buffer.byteLength(rebuilt.text),
      rows: Math.max(0, rebuilt.text.trimEnd().split(/\r?\n/).length - 1),
    };
    transformations[side] = rebuilt.transformations;
  }
  await writeFile(path.join(directory, "source-metadata.json"), json(provenance), "utf8");
  await writeFile(path.join(directory, "cleaning-log.json"), json({
    schemaVersion: "claimtrace-cleaning-log/2.0.0",
    generatedAt: config.retrievedAt,
    caseId,
    sourceType: config.sourceType,
    implementation: config.cleaning.implementation,
    sourceConfigSha256: sha256(configText),
    transformations,
    rawArtifacts: rawArtifacts.map(({ side, fileName, sha256: digest, text }) => ({ side, fileName, sha256: digest, bytes: Buffer.byteLength(text) })),
    outputs,
  }), "utf8");
  generated += 1;
}

process.stdout.write(`Generated ${generated} deterministic public-data case snapshot sets and provenance files.\n`);
