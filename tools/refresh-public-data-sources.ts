import { randomUUID } from "node:crypto";
import { lstat, mkdir, readdir, readFile, rename, rmdir, unlink, writeFile } from "node:fs/promises";
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

export interface RefreshFileOperations {
  lstat: typeof lstat;
  mkdir: typeof mkdir;
  readFile: typeof readFile;
  readdir: typeof readdir;
  rename: typeof rename;
  rmdir: typeof rmdir;
  unlink: typeof unlink;
  writeFile: typeof writeFile;
}

const DEFAULT_FILE_OPERATIONS: RefreshFileOperations = { lstat, mkdir, readFile, readdir, rename, rmdir, unlink, writeFile };

type RefreshTransactionPhase = "prepared" | "backed-up" | "committed";

interface RefreshTransactionManifest {
  schemaVersion: "claimtrace-source-refresh-transaction/1.0.0";
  transactionId: string;
  ownerPid: number;
  phase: RefreshTransactionPhase;
  files: Array<{ target: string; temporary: string; backup: string }>;
}

interface TransactionDirectoryIdentity {
  transactionId: string;
  preparing: boolean;
  ownerPid: number;
}

const TRANSACTION_MANIFEST = "transaction.json";
const ACTIVE_TRANSACTIONS = new Set<string>();

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

function errnoCode(error: unknown) {
  return (error as NodeJS.ErrnoException).code;
}

async function lstatIfExists(filePath: string, operations: RefreshFileOperations) {
  try {
    return await operations.lstat(filePath);
  } catch (error) {
    if (errnoCode(error) === "ENOENT") return null;
    throw error;
  }
}

async function unlinkIfExists(filePath: string, operations: RefreshFileOperations) {
  try {
    await operations.unlink(filePath);
  } catch (error) {
    if (errnoCode(error) !== "ENOENT") throw error;
  }
}

function transactionDirectoryIdentity(name: string): TransactionDirectoryIdentity | null {
  const match = name.match(/^\.claimtrace-refresh-(preparing-)?(\d+)-([0-9a-f-]+)$/i);
  if (!match) return null;
  return {
    preparing: Boolean(match[1]),
    ownerPid: Number(match[2]),
    transactionId: `${match[2]}-${match[3]}`,
  };
}

function ownerIsActive(identity: TransactionDirectoryIdentity) {
  if (ACTIVE_TRANSACTIONS.has(identity.transactionId)) return true;
  if (identity.ownerPid === process.pid) return false;
  try {
    process.kill(identity.ownerPid, 0);
    return true;
  } catch (error) {
    return errnoCode(error) !== "ESRCH";
  }
}

function transactionArtifact(transactionDirectory: string, fileName: string) {
  if (!fileName || path.basename(fileName) !== fileName) throw new Error(`${fileName}: invalid source-refresh transaction artifact`);
  return path.join(transactionDirectory, fileName);
}

function runtimeTransactionFiles(caseDirectory: string, transactionDirectory: string, manifest: RefreshTransactionManifest) {
  return manifest.files.map((file) => ({
    target: caseFile(caseDirectory, file.target),
    temporary: transactionArtifact(transactionDirectory, file.temporary),
    backup: transactionArtifact(transactionDirectory, file.backup),
  }));
}

function validateTransactionManifest(caseDirectory: string, transactionDirectory: string, value: unknown) {
  if (!value || typeof value !== "object") throw new Error(`${transactionDirectory}: invalid source-refresh transaction manifest`);
  const manifest = value as RefreshTransactionManifest;
  if (manifest.schemaVersion !== "claimtrace-source-refresh-transaction/1.0.0") throw new Error(`${transactionDirectory}: unsupported source-refresh transaction schema`);
  const identity = transactionDirectoryIdentity(path.basename(transactionDirectory));
  if (!identity || manifest.transactionId !== identity.transactionId || manifest.ownerPid !== identity.ownerPid) throw new Error(`${transactionDirectory}: transaction identity mismatch`);
  if (!(["prepared", "backed-up", "committed"] as unknown[]).includes(manifest.phase)) throw new Error(`${transactionDirectory}: invalid transaction phase`);
  if (!Array.isArray(manifest.files) || manifest.files.length !== 3) throw new Error(`${transactionDirectory}: transaction must contain exactly three files`);
  const runtimeFiles = runtimeTransactionFiles(caseDirectory, transactionDirectory, manifest);
  if (new Set(runtimeFiles.map((file) => file.target)).size !== runtimeFiles.length) throw new Error(`${transactionDirectory}: transaction targets must be distinct`);
  if (new Set(runtimeFiles.flatMap((file) => [file.temporary, file.backup])).size !== runtimeFiles.length * 2) throw new Error(`${transactionDirectory}: transaction artifacts must be distinct`);
  return manifest;
}

async function writeTransactionManifest(transactionDirectory: string, manifest: RefreshTransactionManifest, operations: RefreshFileOperations) {
  const manifestPath = path.join(transactionDirectory, TRANSACTION_MANIFEST);
  const nextPath = `${manifestPath}.next`;
  await operations.writeFile(nextPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await operations.rename(nextPath, manifestPath);
}

async function cleanupTransactionDirectory(caseDirectory: string, transactionDirectory: string, manifest: RefreshTransactionManifest, operations: RefreshFileOperations) {
  const runtimeFiles = runtimeTransactionFiles(caseDirectory, transactionDirectory, manifest);
  const cleanupErrors: unknown[] = [];
  for (const artifact of [...runtimeFiles.flatMap((file) => [file.temporary, file.backup]), `${path.join(transactionDirectory, TRANSACTION_MANIFEST)}.next`]) {
    try {
      await unlinkIfExists(artifact, operations);
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  if (cleanupErrors.length) throw new AggregateError(cleanupErrors, `${transactionDirectory}: source-refresh artifact cleanup failed`);
  const unknownEntries = (await operations.readdir(transactionDirectory) as string[]).filter((name) => name !== TRANSACTION_MANIFEST);
  if (unknownEntries.length) throw new Error(`${transactionDirectory}: unexpected transaction artifacts remain: ${unknownEntries.join(", ")}`);
  await unlinkIfExists(path.join(transactionDirectory, TRANSACTION_MANIFEST), operations);
  await operations.rmdir(transactionDirectory);
}

async function rollbackTransaction(caseDirectory: string, transactionDirectory: string, manifest: RefreshTransactionManifest, operations: RefreshFileOperations) {
  const rollbackErrors: unknown[] = [];
  for (const file of runtimeTransactionFiles(caseDirectory, transactionDirectory, manifest).reverse()) {
    try {
      const backupStats = await lstatIfExists(file.backup, operations);
      const targetStats = await lstatIfExists(file.target, operations);
      if (backupStats) {
        if (!backupStats.isFile()) throw new Error(`${file.backup}: transaction backup must be a regular file`);
        if (targetStats && !targetStats.isFile()) throw new Error(`${file.target}: source refresh target must be a regular file`);
        await operations.rename(file.backup, file.target);
      } else if (!targetStats || !targetStats.isFile()) {
        throw new Error(`${file.target}: original target and transaction backup are both unavailable`);
      }
    } catch (error) {
      rollbackErrors.push(error);
    }
  }
  if (rollbackErrors.length) throw new AggregateError(rollbackErrors, `${transactionDirectory}: source-refresh rollback was incomplete`);
}

async function verifyCommittedTargets(caseDirectory: string, transactionDirectory: string, manifest: RefreshTransactionManifest, operations: RefreshFileOperations) {
  const verificationErrors: unknown[] = [];
  for (const file of runtimeTransactionFiles(caseDirectory, transactionDirectory, manifest)) {
    try {
      const stats = await operations.lstat(file.target);
      if (!stats.isFile()) throw new Error(`${file.target}: committed source-refresh target must be a regular file`);
    } catch (error) {
      verificationErrors.push(error);
    }
  }
  if (verificationErrors.length) throw new AggregateError(verificationErrors, `${transactionDirectory}: committed source-refresh targets are incomplete`);
}

async function recoverTransactionDirectory(caseDirectory: string, transactionDirectory: string, identity: TransactionDirectoryIdentity, operations: RefreshFileOperations) {
  if (ownerIsActive(identity)) throw new Error(`${transactionDirectory}: another source refresh transaction is still active`);
  const manifestPath = path.join(transactionDirectory, TRANSACTION_MANIFEST);
  let manifestText: string;
  try {
    manifestText = await operations.readFile(manifestPath, "utf8") as string;
  } catch (error) {
    if (errnoCode(error) !== "ENOENT") throw error;
    const entries = await operations.readdir(transactionDirectory) as string[];
    if (!identity.preparing && entries.length) throw new Error(`${transactionDirectory}: transaction manifest is missing`);
    for (const entry of entries) {
      const artifact = transactionArtifact(transactionDirectory, entry);
      const stats = await operations.lstat(artifact);
      if (!stats.isFile()) throw new Error(`${artifact}: orphaned preparing artifact must be a regular file`);
      await operations.unlink(artifact);
    }
    await operations.rmdir(transactionDirectory);
    return;
  }
  const manifest = validateTransactionManifest(caseDirectory, transactionDirectory, JSON.parse(manifestText));
  if (manifest.phase === "committed") await verifyCommittedTargets(caseDirectory, transactionDirectory, manifest, operations);
  else await rollbackTransaction(caseDirectory, transactionDirectory, manifest, operations);
  await cleanupTransactionDirectory(caseDirectory, transactionDirectory, manifest, operations);
}

async function recoverInterruptedTransactions(caseDirectory: string, operations: RefreshFileOperations) {
  const entries = await operations.readdir(caseDirectory, { withFileTypes: true });
  for (const entry of entries.filter((item) => item.isDirectory()).sort((left, right) => left.name.localeCompare(right.name))) {
    const identity = transactionDirectoryIdentity(entry.name);
    if (identity) await recoverTransactionDirectory(caseDirectory, path.join(caseDirectory, entry.name), identity, operations);
  }
}

async function replaceFiles(caseDirectory: string, files: Array<{ target: string; content: string }>, operations: RefreshFileOperations) {
  const resolvedCaseDirectory = path.resolve(caseDirectory);
  const normalizedFiles = files.map((file) => ({ ...file, target: path.resolve(file.target) }));
  if (normalizedFiles.length !== 3) throw new Error("Source refresh transactions must contain exactly three files");
  for (const file of normalizedFiles) caseFile(resolvedCaseDirectory, path.relative(resolvedCaseDirectory, file.target));
  if (new Set(normalizedFiles.map((file) => file.target)).size !== normalizedFiles.length) throw new Error("Source refresh targets must be distinct");
  await Promise.all(normalizedFiles.map(async (file) => {
    const stats = await operations.lstat(file.target);
    if (!stats.isFile()) throw new Error(`${file.target}: source refresh target must be a regular file`);
  }));

  const transactionId = `${process.pid}-${randomUUID()}`;
  const preparingDirectory = path.join(resolvedCaseDirectory, `.claimtrace-refresh-preparing-${transactionId}`);
  const transactionDirectory = path.join(resolvedCaseDirectory, `.claimtrace-refresh-${transactionId}`);
  let activeDirectory = preparingDirectory;
  let directoryCreated = false;
  let manifest: RefreshTransactionManifest = {
    schemaVersion: "claimtrace-source-refresh-transaction/1.0.0",
    transactionId,
    ownerPid: process.pid,
    phase: "prepared",
    files: normalizedFiles.map((file, index) => ({
      target: path.relative(resolvedCaseDirectory, file.target),
      temporary: `${index}.new`,
      backup: `${index}.backup`,
    })),
  };

  ACTIVE_TRANSACTIONS.add(transactionId);
  try {
    try {
      await operations.mkdir(preparingDirectory);
      directoryCreated = true;
      await writeTransactionManifest(preparingDirectory, manifest, operations);
      await operations.rename(preparingDirectory, transactionDirectory);
      activeDirectory = transactionDirectory;
      const runtimeFiles = runtimeTransactionFiles(resolvedCaseDirectory, transactionDirectory, manifest);
      const writeResults = await Promise.allSettled(runtimeFiles.map((file, index) => operations.writeFile(file.temporary, normalizedFiles[index].content, "utf8")));
      const writeErrors = writeResults.filter((result): result is PromiseRejectedResult => result.status === "rejected").map((result) => result.reason);
      if (writeErrors.length) throw new AggregateError(writeErrors, "Source refresh staging failed");
      for (const file of runtimeFiles) await operations.rename(file.target, file.backup);
      const backedUpManifest: RefreshTransactionManifest = { ...manifest, phase: "backed-up" };
      await writeTransactionManifest(transactionDirectory, backedUpManifest, operations);
      manifest = backedUpManifest;
      for (const file of runtimeFiles) await operations.rename(file.temporary, file.target);
      const committedManifest: RefreshTransactionManifest = { ...manifest, phase: "committed" };
      await writeTransactionManifest(transactionDirectory, committedManifest, operations);
      manifest = committedManifest;
    } catch (error) {
      if (!directoryCreated) throw error;
      const recoveryErrors: unknown[] = [];
      try {
        if (activeDirectory === transactionDirectory) await rollbackTransaction(resolvedCaseDirectory, transactionDirectory, manifest, operations);
        await cleanupTransactionDirectory(resolvedCaseDirectory, activeDirectory, manifest, operations);
      } catch (recoveryError) {
        recoveryErrors.push(recoveryError);
      }
      if (recoveryErrors.length) throw new AggregateError([error, ...recoveryErrors], "Source refresh failed and rollback or cleanup was incomplete");
      throw error;
    }

    try {
      await cleanupTransactionDirectory(resolvedCaseDirectory, transactionDirectory, manifest, operations);
    } catch (cleanupError) {
      throw new AggregateError([cleanupError], "Source refresh committed but transaction cleanup failed; rerun the refresh to recover");
    }
  } finally {
    ACTIVE_TRANSACTIONS.delete(transactionId);
  }
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

  const entries = await fileOperations.readdir(casesDirectory, { withFileTypes: true });
  for (const entry of entries.filter((item) => item.isDirectory())) {
    const directory = path.join(casesDirectory, entry.name);
    await recoverInterruptedTransactions(directory, fileOperations);
    const configPath = path.join(directory, "source-config.json");
    let configText: string;
    try {
      configText = await fileOperations.readFile(configPath, "utf8");
    } catch (error) {
      if (errnoCode(error) === "ENOENT") continue;
      throw error;
    }
    const config = JSON.parse(configText) as SourceConfig;
    if (config.schemaVersion !== "claimtrace-external-source-config/2.0.0") throw new Error(`${entry.name}: unsupported source-config schema`);
    const provenance = JSON.parse(await fileOperations.readFile(path.join(directory, "source-metadata.json"), "utf8")) as ExternalSourceProvenance;
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
    await replaceFiles(item.directory, [
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
