import { randomUUID } from "node:crypto";
import { lstat, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rebuildExternalSnapshot, type ExternalSourceProvenance, type SnapshotSide } from "../src/core";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CASES = path.join(ROOT, "public", "cases");
const SIDES: SnapshotSide[] = ["baseline", "current"];

interface SourceConfig {
  schemaVersion: string;
  retrievedAt: string;
  sourceUrls: Record<SnapshotSide, string>;
  rawFiles: Record<SnapshotSide, string>;
  [key: string]: unknown;
}

export interface RefreshPublicDataSourcesOptions {
  casesDirectory?: string;
  requestedCaseIds?: string[];
  fetcher?: typeof fetch;
  now?: () => Date;
  fileOperations?: RefreshFileOperations;
}

interface StagedFile {
  target: string;
  temporary: string;
  backup: string;
  content: string;
  backedUp: boolean;
  installed: boolean;
}

export interface RefreshFileOperations {
  lstat: typeof lstat;
  rename: typeof rename;
  unlink: typeof unlink;
  writeFile: typeof writeFile;
}

const DEFAULT_FILE_OPERATIONS: RefreshFileOperations = { lstat, rename, unlink, writeFile };

interface AvailableSource {
  directory: string;
  configPath: string;
  config: SourceConfig;
  provenance: ExternalSourceProvenance;
}

function caseFile(directory: string, fileName: string) {
  const resolved = path.resolve(directory, fileName);
  if (!resolved.startsWith(`${path.resolve(directory)}${path.sep}`)) throw new Error(`${fileName}: raw file must stay inside its case directory`);
  return resolved;
}

async function replaceFiles(files: Array<{ target: string; content: string }>, operations: RefreshFileOperations) {
  if (new Set(files.map((file) => file.target)).size !== files.length) throw new Error("Source refresh targets must be distinct");
  const transactionId = `${process.pid}-${randomUUID()}`;
  const staged: StagedFile[] = files.map(({ target, content }) => ({
    target,
    temporary: `${target}.claimtrace-refresh-${transactionId}.new`,
    backup: `${target}.claimtrace-refresh-${transactionId}.backup`,
    content,
    backedUp: false,
    installed: false,
  }));

  await Promise.all(staged.map(async (file) => {
    const stats = await operations.lstat(file.target);
    if (!stats.isFile()) throw new Error(`${file.target}: source refresh target must be a regular file`);
  }));

  try {
    const writeResults = await Promise.allSettled(staged.map((file) => operations.writeFile(file.temporary, file.content, "utf8")));
    const writeErrors = writeResults.filter((result): result is PromiseRejectedResult => result.status === "rejected").map((result) => result.reason);
    if (writeErrors.length) throw new AggregateError(writeErrors, "Source refresh staging failed");
    for (const file of staged) {
      await operations.rename(file.target, file.backup);
      file.backedUp = true;
    }
    for (const file of staged) {
      await operations.rename(file.temporary, file.target);
      file.installed = true;
    }
  } catch (error) {
    const rollbackErrors: unknown[] = [];
    for (const file of [...staged].reverse()) {
      try {
        if (file.installed) {
          await operations.unlink(file.target);
          file.installed = false;
        }
        if (file.backedUp) {
          await operations.rename(file.backup, file.target);
          file.backedUp = false;
        }
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    if (rollbackErrors.length) throw new AggregateError([error, ...rollbackErrors], "Source refresh failed and rollback was incomplete");
    throw error;
  } finally {
    await Promise.all(staged.map((file) => operations.unlink(file.temporary).catch(() => undefined)));
  }
  await Promise.all(staged.map((file) => operations.unlink(file.backup).catch(() => undefined)));
}

function validateSourceDefinition(caseId: string, config: SourceConfig, provenance: ExternalSourceProvenance) {
  if (provenance.schemaVersion !== "claimtrace-external-source/2.0.0") throw new Error(`${caseId}: unsupported source-metadata schema`);
  if (!Array.isArray(provenance.rawArtifacts)) throw new Error(`${caseId}: source-metadata rawArtifacts must be an array`);
  for (const side of SIDES) {
    const sourceUrl = config.sourceUrls?.[side];
    const rawFile = config.rawFiles?.[side];
    if (typeof sourceUrl !== "string" || !sourceUrl.trim()) throw new Error(`${caseId}:${side}: source URL must be a nonempty string`);
    if (typeof rawFile !== "string" || !rawFile.trim()) throw new Error(`${caseId}:${side}: raw file must be a nonempty string`);
    if (provenance.sourceUrls?.[side] !== sourceUrl) throw new Error(`${caseId}:${side}: source URL differs between source-config and source-metadata`);
    const artifacts = provenance.rawArtifacts.filter((artifact) => artifact.side === side);
    if (artifacts.length !== 1 || artifacts[0].fileName !== rawFile) throw new Error(`${caseId}:${side}: raw file differs between source-config and source-metadata`);
  }
}

function validateDownloadedContent(caseId: string, provenance: ExternalSourceProvenance, downloads: Record<SnapshotSide, string>) {
  const candidate = structuredClone(provenance);
  for (const artifact of candidate.rawArtifacts) artifact.text = downloads[artifact.side];
  for (const side of SIDES) {
    const rebuilt = rebuildExternalSnapshot(candidate, side);
    if (rebuilt.text === null || rebuilt.errors.length) {
      const details = rebuilt.errors.length ? rebuilt.errors.join("; ") : "cleaner returned no snapshot";
      throw new Error(`${caseId}:${side}: source content failed cleaning validation: ${details}`);
    }
  }
}

export async function refreshPublicDataSources(options: RefreshPublicDataSourcesOptions = {}) {
  const casesDirectory = options.casesDirectory ?? CASES;
  const requested = new Set(options.requestedCaseIds ?? []);
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? (() => new Date());
  const fileOperations = options.fileOperations ?? DEFAULT_FILE_OPERATIONS;
  const available = new Map<string, AvailableSource>();

  const entries = await readdir(casesDirectory, { withFileTypes: true });
  for (const entry of entries.filter((item) => item.isDirectory())) {
    const directory = path.join(casesDirectory, entry.name);
    const configPath = path.join(directory, "source-config.json");
    let configText: string;
    try {
      configText = await readFile(configPath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    const config = JSON.parse(configText) as SourceConfig;
    if (config.schemaVersion !== "claimtrace-external-source-config/2.0.0") throw new Error(`${entry.name}: unsupported source-config schema`);
    const provenance = JSON.parse(await readFile(path.join(directory, "source-metadata.json"), "utf8")) as ExternalSourceProvenance;
    validateSourceDefinition(entry.name, config, provenance);
    available.set(entry.name, { directory, configPath, config, provenance });
  }

  const unknown = [...requested].filter((caseId) => !available.has(caseId)).sort();
  if (unknown.length) throw new Error(`Unknown public-data case ID(s): ${unknown.join(", ")}. Available: ${[...available.keys()].sort().join(", ")}`);
  const caseIds = [...available.keys()].filter((caseId) => !requested.size || requested.has(caseId)).sort();

  let refreshed = 0;
  for (const caseId of caseIds) {
    const item = available.get(caseId)!;
    const downloads = Object.fromEntries(await Promise.all(SIDES.map(async (side) => {
      const response = await fetcher(item.config.sourceUrls[side], {
        headers: {
          Accept: "application/json, text/csv, application/xml, text/xml;q=0.9, */*;q=0.1",
          "User-Agent": "ClaimTrace/0.8 public-data portfolio research (https://github.com/limingrui679-design/ClaimTrace)",
        },
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`${caseId}:${side}: ${response.status} ${response.statusText}`);
      const text = await response.text();
      if (!text.trim()) throw new Error(`${caseId}:${side}: source returned an empty body`);
      return [side, text] as const;
    }))) as Record<SnapshotSide, string>;

    validateDownloadedContent(caseId, item.provenance, downloads);
    const retrievedAt = now().toISOString();
    const nextConfig = { ...item.config, retrievedAt };
    await replaceFiles([
      ...SIDES.map((side) => ({ target: caseFile(item.directory, item.config.rawFiles[side]), content: downloads[side] })),
      { target: item.configPath, content: `${JSON.stringify(nextConfig, null, 2)}\n` },
    ], fileOperations);
    refreshed += 1;
  }
  return { refreshed, retrievedCaseIds: caseIds };
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const result = await refreshPublicDataSources({ requestedCaseIds: process.argv.slice(2) });
  process.stdout.write(`Refreshed and pinned ${result.refreshed} public-data case source pairs and updated their retrieval timestamps. Run npm run cases:generate to rebuild derived evidence.\n`);
}
