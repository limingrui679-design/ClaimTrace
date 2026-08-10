import { randomUUID } from "node:crypto";
import { readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { SnapshotSide } from "../src/core";

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
}

interface StagedFile {
  target: string;
  temporary: string;
  content: string;
}

function caseFile(directory: string, fileName: string) {
  const resolved = path.resolve(directory, fileName);
  if (!resolved.startsWith(`${path.resolve(directory)}${path.sep}`)) throw new Error(`${fileName}: raw file must stay inside its case directory`);
  return resolved;
}

async function replaceFiles(files: Array<{ target: string; content: string }>) {
  const staged: StagedFile[] = files.map(({ target, content }) => ({
    target,
    temporary: `${target}.claimtrace-refresh-${process.pid}-${randomUUID()}`,
    content,
  }));
  try {
    await Promise.all(staged.map((file) => writeFile(file.temporary, file.content, "utf8")));
    for (const file of staged) await rename(file.temporary, file.target);
  } finally {
    await Promise.all(staged.map((file) => unlink(file.temporary).catch(() => undefined)));
  }
}

export async function refreshPublicDataSources(options: RefreshPublicDataSourcesOptions = {}) {
  const casesDirectory = options.casesDirectory ?? CASES;
  const requested = new Set(options.requestedCaseIds ?? []);
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? (() => new Date());
  const available = new Map<string, { directory: string; configPath: string; config: SourceConfig }>();

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
    available.set(entry.name, { directory, configPath, config });
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

    const retrievedAt = now().toISOString();
    const nextConfig = { ...item.config, retrievedAt };
    await replaceFiles([
      ...SIDES.map((side) => ({ target: caseFile(item.directory, item.config.rawFiles[side]), content: downloads[side] })),
      { target: item.configPath, content: `${JSON.stringify(nextConfig, null, 2)}\n` },
    ]);
    refreshed += 1;
  }
  return { refreshed, retrievedCaseIds: caseIds };
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const result = await refreshPublicDataSources({ requestedCaseIds: process.argv.slice(2) });
  process.stdout.write(`Refreshed and pinned ${result.refreshed} public-data case source pairs and updated their retrieval timestamps. Run npm run cases:generate to rebuild derived evidence.\n`);
}
