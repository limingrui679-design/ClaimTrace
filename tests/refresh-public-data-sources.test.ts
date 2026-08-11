import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, rmdir, symlink, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { refreshPublicDataSources } from "../tools/refresh-public-data-sources";

const REFRESHED_AT = "2026-08-11T01:02:03.000Z";
const LAST_UPDATED = "2026-07-13";
const TEST_FILE_OPERATIONS = { lstat, mkdir, readFile, readdir, rename, rmdir, unlink, writeFile };

function worldBankResponse(year: string, value: number) {
  return JSON.stringify([
    { page: 1, pages: 1, per_page: 1000, total: 1, sourceid: "2", lastupdated: LAST_UPDATED },
    [{
      indicator: { id: "SP.DYN.LE00.IN", value: "Life expectancy at birth, total (years)" },
      country: { id: "US", value: "United States" },
      countryiso3code: "USA",
      date: year,
      value,
      unit: "",
      obs_status: "",
      decimal: 0,
    }],
  ]);
}

async function makeFixture() {
  const casesDirectory = await mkdtemp(path.join(os.tmpdir(), "claimtrace-refresh-test-"));
  const directory = path.join(casesDirectory, "public-case");
  await mkdir(directory);
  const config = {
    schemaVersion: "claimtrace-external-source-config/2.0.0",
    retrievedAt: "2026-08-10T00:00:00.000Z",
    sourceUrls: {
      baseline: "https://example.test/baseline",
      current: "https://example.test/current",
    },
    rawFiles: {
      baseline: "raw-baseline.json",
      current: "raw-current.json",
    },
    retainedField: "preserved",
  };
  const oldBaseline = worldBankResponse("2019", 78.8);
  const oldCurrent = worldBankResponse("2024", 78.9);
  const provenance = {
    schemaVersion: "claimtrace-external-source/2.0.0",
    sourceType: "WORLD_BANK_INDICATORS_API_V2",
    publisher: "World Bank",
    dataset: "World Development Indicators",
    measure: { id: "SP.DYN.LE00.IN", name: "Life expectancy at birth, total (years)" },
    retrievedAt: config.retrievedAt,
    sourceLastUpdated: LAST_UPDATED,
    sourceUrls: config.sourceUrls,
    license: "CC BY 4.0",
    licenseUrl: "https://example.test/license",
    attribution: "World Bank test fixture",
    limitations: ["Test fixture only."],
    cleaning: {
      implementation: "world-bank-indicator-v1",
      scriptPath: "tools/generate-public-data-cases.ts",
      parameters: {
        baselineYear: "2019",
        currentYear: "2024",
        selectedCountryCodes: ["USA"],
        decimalPlaces: 3,
      },
    },
    rawArtifacts: [
      { side: "baseline", fileName: config.rawFiles.baseline, sha256: "fixture-baseline", text: oldBaseline },
      { side: "current", fileName: config.rawFiles.current, sha256: "fixture-current", text: oldCurrent },
    ],
  };
  await writeFile(path.join(directory, "source-config.json"), `${JSON.stringify(config, null, 2)}\n`, "utf8");
  await writeFile(path.join(directory, "source-metadata.json"), `${JSON.stringify(provenance, null, 2)}\n`, "utf8");
  await writeFile(path.join(directory, "raw-baseline.json"), oldBaseline, "utf8");
  await writeFile(path.join(directory, "raw-current.json"), oldCurrent, "utf8");
  return { casesDirectory, directory, oldBaseline, oldCurrent };
}

test("source refresh replaces both snapshots and records the actual retrieval time", async () => {
  const fixture = await makeFixture();
  try {
    const newBaseline = worldBankResponse("2019", 79.1);
    const newCurrent = worldBankResponse("2024", 79.4);
    const fetcher = (async (input: string | URL | Request) => {
      return new Response(String(input).endsWith("baseline") ? newBaseline : newCurrent, { status: 200 });
    }) as typeof fetch;
    const result = await refreshPublicDataSources({
      casesDirectory: fixture.casesDirectory,
      requestedCaseIds: ["public-case"],
      fetcher,
      now: () => new Date(REFRESHED_AT),
    });
    assert.deepEqual(result, { refreshed: 1, retrievedCaseIds: ["public-case"] });
    assert.equal(await readFile(path.join(fixture.directory, "raw-baseline.json"), "utf8"), newBaseline);
    assert.equal(await readFile(path.join(fixture.directory, "raw-current.json"), "utf8"), newCurrent);
    const config = JSON.parse(await readFile(path.join(fixture.directory, "source-config.json"), "utf8"));
    assert.equal(config.retrievedAt, REFRESHED_AT);
    assert.equal(config.retainedField, "preserved");
  } finally {
    await rm(fixture.casesDirectory, { recursive: true, force: true });
  }
});

test("source refresh leaves the case untouched when either download fails", async () => {
  const fixture = await makeFixture();
  try {
    const originalConfig = await readFile(path.join(fixture.directory, "source-config.json"), "utf8");
    const fetcher = (async (input: string | URL | Request) => String(input).endsWith("baseline")
      ? new Response(worldBankResponse("2019", 79.1), { status: 200 })
      : new Response("unavailable", { status: 503, statusText: "Unavailable" })) as typeof fetch;
    await assert.rejects(
      refreshPublicDataSources({
        casesDirectory: fixture.casesDirectory,
        requestedCaseIds: ["public-case"],
        fetcher,
        now: () => new Date(REFRESHED_AT),
      }),
      /public-case:current: 503 Unavailable/,
    );
    assert.equal(await readFile(path.join(fixture.directory, "raw-baseline.json"), "utf8"), fixture.oldBaseline);
    assert.equal(await readFile(path.join(fixture.directory, "raw-current.json"), "utf8"), fixture.oldCurrent);
    assert.equal(await readFile(path.join(fixture.directory, "source-config.json"), "utf8"), originalConfig);
  } finally {
    await rm(fixture.casesDirectory, { recursive: true, force: true });
  }
});

test("source refresh aborts the peer request and retains its lock until the pair settles", async () => {
  const fixture = await makeFixture();
  let releaseAbortedFetch: () => void = () => undefined;
  let firstRefresh: ReturnType<typeof refreshPublicDataSources> | undefined;
  try {
    let signalAbortObserved!: () => void;
    const abortObserved = new Promise<void>((resolve) => { signalAbortObserved = resolve; });
    const abortedFetchGate = new Promise<void>((resolve) => { releaseAbortedFetch = resolve; });
    let peerAborted = false;
    firstRefresh = refreshPublicDataSources({
      casesDirectory: fixture.casesDirectory,
      requestedCaseIds: ["public-case"],
      fetcher: (async (input: string | URL | Request, init?: RequestInit) => {
        if (String(input).endsWith("baseline")) {
          const signal = init?.signal;
          assert.ok(signal);
          return new Promise<Response>((_resolve, reject) => {
            signal.addEventListener("abort", () => {
              peerAborted = true;
              signalAbortObserved();
              void abortedFetchGate.then(() => reject(signal.reason ?? new DOMException("Aborted", "AbortError")));
            }, { once: true });
          });
        }
        return new Response("unavailable", { status: 503, statusText: "Unavailable" });
      }) as typeof fetch,
    });

    await abortObserved;
    let concurrentDownloads = 0;
    await assert.rejects(
      refreshPublicDataSources({
        casesDirectory: fixture.casesDirectory,
        requestedCaseIds: ["public-case"],
        fetcher: (async () => {
          concurrentDownloads += 1;
          return new Response(fixture.oldBaseline, { status: 200 });
        }) as typeof fetch,
      }),
      /another source refresh is already active/,
    );
    assert.equal(concurrentDownloads, 0);

    releaseAbortedFetch();
    await assert.rejects(firstRefresh, /public-case:current: 503 Unavailable/);
    assert.equal(peerAborted, true);
    assert.deepEqual((await readdir(fixture.casesDirectory)).filter((name) => name.startsWith(".claimtrace-refresh-lock")), []);
    assert.deepEqual((await readdir(fixture.directory)).filter((name) => name.startsWith(".claimtrace-refresh-")), []);
  } finally {
    releaseAbortedFetch();
    await firstRefresh?.catch(() => undefined);
    await rm(fixture.casesDirectory, { recursive: true, force: true });
  }
});

test("source refresh rejects malformed nonempty content before replacing any case file", async () => {
  const fixture = await makeFixture();
  try {
    const originalConfig = await readFile(path.join(fixture.directory, "source-config.json"), "utf8");
    const fetcher = (async (input: string | URL | Request) => String(input).endsWith("baseline")
      ? new Response("<html>upstream maintenance page</html>", { status: 200 })
      : new Response(worldBankResponse("2024", 79.4), { status: 200 })) as typeof fetch;
    await assert.rejects(
      refreshPublicDataSources({
        casesDirectory: fixture.casesDirectory,
        requestedCaseIds: ["public-case"],
        fetcher,
        now: () => new Date(REFRESHED_AT),
      }),
      /public-case:baseline: source content failed cleaning validation/,
    );
    assert.equal(await readFile(path.join(fixture.directory, "raw-baseline.json"), "utf8"), fixture.oldBaseline);
    assert.equal(await readFile(path.join(fixture.directory, "raw-current.json"), "utf8"), fixture.oldCurrent);
    assert.equal(await readFile(path.join(fixture.directory, "source-config.json"), "utf8"), originalConfig);
  } finally {
    await rm(fixture.casesDirectory, { recursive: true, force: true });
  }
});

test("source refresh preserves every target after staging, backup, or replacement failures", async () => {
  const failures = [
    { phase: "staging", at: 2 },
    { phase: "backup", at: 2 },
    { phase: "promotion", at: 1 },
    { phase: "promotion", at: 2 },
    { phase: "promotion", at: 3 },
  ] as const;
  for (const failure of failures) {
    const fixture = await makeFixture();
    try {
      const originalConfig = await readFile(path.join(fixture.directory, "source-config.json"), "utf8");
      const newBaseline = worldBankResponse("2019", 79.1);
      const newCurrent = worldBankResponse("2024", 79.4);
      let stagedWrites = 0;
      let backupRenames = 0;
      let promotionRenames = 0;
      await assert.rejects(
        refreshPublicDataSources({
          casesDirectory: fixture.casesDirectory,
          requestedCaseIds: ["public-case"],
          fetcher: (async (input: string | URL | Request) => new Response(
            String(input).endsWith("baseline") ? newBaseline : newCurrent,
            { status: 200 },
          )) as typeof fetch,
          now: () => new Date(REFRESHED_AT),
          fileOperations: {
            ...TEST_FILE_OPERATIONS,
            writeFile: async (target, content, encoding) => {
              if (String(target).endsWith(".new")) {
                stagedWrites += 1;
                if (failure.phase === "staging" && stagedWrites === failure.at) throw new Error("injected staging failure");
              }
              await writeFile(target, content, encoding);
            },
            rename: async (source, target) => {
              if (String(target).endsWith(".backup")) {
                backupRenames += 1;
                if (failure.phase === "backup" && backupRenames === failure.at) throw new Error("injected backup failure");
              }
              if (String(source).endsWith(".new")) {
                promotionRenames += 1;
                if (failure.phase === "promotion" && promotionRenames === failure.at) throw new Error("injected replacement failure");
              }
              await rename(source, target);
            },
          },
        }),
        /Source refresh staging failed|injected (backup|replacement) failure/,
      );
      assert.equal(await readFile(path.join(fixture.directory, "raw-baseline.json"), "utf8"), fixture.oldBaseline);
      assert.equal(await readFile(path.join(fixture.directory, "raw-current.json"), "utf8"), fixture.oldCurrent);
      assert.equal(await readFile(path.join(fixture.directory, "source-config.json"), "utf8"), originalConfig);
      assert.deepEqual((await readdir(fixture.directory)).filter((file) => file.includes(".claimtrace-refresh-")), []);
    } finally {
      await rm(fixture.casesDirectory, { recursive: true, force: true });
    }
  }
});

test("source refresh reports committed cleanup failures and completes cleanup on the next run", async () => {
  const fixture = await makeFixture();
  try {
    const newBaseline = worldBankResponse("2019", 79.1);
    const newCurrent = worldBankResponse("2024", 79.4);
    const fetcher = (async (input: string | URL | Request) => new Response(
      String(input).endsWith("baseline") ? newBaseline : newCurrent,
      { status: 200 },
    )) as typeof fetch;
    let failedBackupUnlinks = 0;
    await assert.rejects(
      refreshPublicDataSources({
        casesDirectory: fixture.casesDirectory,
        requestedCaseIds: ["public-case"],
        fetcher,
        now: () => new Date(REFRESHED_AT),
        fileOperations: {
          ...TEST_FILE_OPERATIONS,
          unlink: async (target) => {
            if (String(target).endsWith(".backup")) {
              failedBackupUnlinks += 1;
              throw new Error("injected committed cleanup failure");
            }
            await unlink(target);
          },
        },
      }),
      /Source refresh committed but transaction cleanup failed/,
    );
    assert.equal(failedBackupUnlinks, 3);
    assert.equal(await readFile(path.join(fixture.directory, "raw-baseline.json"), "utf8"), newBaseline);
    assert.equal(await readFile(path.join(fixture.directory, "raw-current.json"), "utf8"), newCurrent);
    const committedConfig = JSON.parse(await readFile(path.join(fixture.directory, "source-config.json"), "utf8"));
    assert.equal(committedConfig.retrievedAt, REFRESHED_AT);
    assert.equal((await readdir(fixture.directory)).filter((file) => file.startsWith(".claimtrace-refresh-")).length, 1);

    const result = await refreshPublicDataSources({
      casesDirectory: fixture.casesDirectory,
      requestedCaseIds: ["public-case"],
      fetcher,
      now: () => new Date(REFRESHED_AT),
    });
    assert.deepEqual(result, { refreshed: 1, retrievedCaseIds: ["public-case"] });
    assert.deepEqual((await readdir(fixture.directory)).filter((file) => file.startsWith(".claimtrace-refresh-")), []);
  } finally {
    await rm(fixture.casesDirectory, { recursive: true, force: true });
  }
});

test("source refresh retains committed backups when a target no longer matches its transaction hash", async () => {
  const fixture = await makeFixture();
  try {
    const newBaseline = worldBankResponse("2019", 79.1);
    const newCurrent = worldBankResponse("2024", 79.4);
    const fetcher = (async (input: string | URL | Request) => new Response(
      String(input).endsWith("baseline") ? newBaseline : newCurrent,
      { status: 200 },
    )) as typeof fetch;
    await assert.rejects(
      refreshPublicDataSources({
        casesDirectory: fixture.casesDirectory,
        requestedCaseIds: ["public-case"],
        fetcher,
        now: () => new Date(REFRESHED_AT),
        fileOperations: {
          ...TEST_FILE_OPERATIONS,
          unlink: async (target) => {
            if (String(target).endsWith(".backup")) throw new Error("injected committed cleanup failure");
            await unlink(target);
          },
        },
      }),
      /Source refresh committed but transaction cleanup failed/,
    );
    const baselinePath = path.join(fixture.directory, "raw-baseline.json");
    await writeFile(baselinePath, "corrupted-but-regular", "utf8");
    await assert.rejects(
      refreshPublicDataSources({ casesDirectory: fixture.casesDirectory, requestedCaseIds: ["missing-for-recovery-only"] }),
      /committed source-refresh target hash mismatch/,
    );
    assert.equal(await readFile(baselinePath, "utf8"), "corrupted-but-regular");
    const transactionNames = (await readdir(fixture.directory)).filter((name) => name.startsWith(".claimtrace-refresh-"));
    assert.equal(transactionNames.length, 1);
    const transactionEntries = await readdir(path.join(fixture.directory, transactionNames[0]));
    assert.equal(transactionEntries.filter((name) => name.endsWith(".backup")).length, 3);

    await writeFile(baselinePath, newBaseline, "utf8");
    const result = await refreshPublicDataSources({
      casesDirectory: fixture.casesDirectory,
      requestedCaseIds: ["public-case"],
      fetcher,
      now: () => new Date(REFRESHED_AT),
    });
    assert.deepEqual(result, { refreshed: 1, retrievedCaseIds: ["public-case"] });
    assert.deepEqual((await readdir(fixture.directory)).filter((name) => name.startsWith(".claimtrace-refresh-")), []);
  } finally {
    await rm(fixture.casesDirectory, { recursive: true, force: true });
  }
});

test("source refresh refuses automatic recovery of a legacy transaction without content hashes", async () => {
  const fixture = await makeFixture();
  try {
    const baselinePath = path.join(fixture.directory, "raw-baseline.json");
    const transactionId = `${process.pid}-${randomUUID()}`;
    const transactionDirectory = path.join(fixture.directory, `.claimtrace-refresh-${transactionId}`);
    const backupPath = path.join(transactionDirectory, "0.backup");
    await mkdir(transactionDirectory);
    await writeFile(path.join(transactionDirectory, "transaction.json"), `${JSON.stringify({
      schemaVersion: "claimtrace-source-refresh-transaction/1.0.0",
      transactionId,
      ownerPid: process.pid,
      phase: "prepared",
      files: ["raw-baseline.json", "raw-current.json", "source-config.json"].map((target, index) => ({
        target,
        temporary: `${index}.new`,
        backup: `${index}.backup`,
      })),
    }, null, 2)}\n`, "utf8");
    await writeFile(backupPath, "corrupted legacy backup", "utf8");

    let downloads = 0;
    await assert.rejects(
      refreshPublicDataSources({
        casesDirectory: fixture.casesDirectory,
        requestedCaseIds: ["recovery-probe-only"],
        fetcher: (async () => {
          downloads += 1;
          return new Response(fixture.oldBaseline, { status: 200 });
        }) as typeof fetch,
      }),
      /legacy source-refresh transaction lacks content hashes; refusing automatic recovery/,
    );
    assert.equal(downloads, 0);
    assert.equal(await readFile(baselinePath, "utf8"), fixture.oldBaseline);
    assert.equal(await readFile(backupPath, "utf8"), "corrupted legacy backup");
    assert.deepEqual((await readdir(transactionDirectory)).sort(), ["0.backup", "transaction.json"]);
    assert.deepEqual((await readdir(fixture.casesDirectory)).filter((name) => name.startsWith(".claimtrace-refresh-lock")), []);
  } finally {
    await rm(fixture.casesDirectory, { recursive: true, force: true });
  }
});

test("source refresh serializes concurrent invocations before the second one downloads", async () => {
  const fixture = await makeFixture();
  let releaseFirstFetch: () => void = () => undefined;
  let firstRefresh: Promise<Awaited<ReturnType<typeof refreshPublicDataSources>>> | undefined;
  try {
    const newBaseline = worldBankResponse("2019", 79.1);
    const newCurrent = worldBankResponse("2024", 79.4);
    let signalFirstFetch!: () => void;
    const firstFetchStarted = new Promise<void>((resolve) => { signalFirstFetch = resolve; });
    const firstFetchGate = new Promise<void>((resolve) => { releaseFirstFetch = resolve; });
    firstRefresh = refreshPublicDataSources({
      casesDirectory: fixture.casesDirectory,
      requestedCaseIds: ["public-case"],
      fetcher: (async (input: string | URL | Request) => {
        signalFirstFetch();
        await firstFetchGate;
        return new Response(String(input).endsWith("baseline") ? newBaseline : newCurrent, { status: 200 });
      }) as typeof fetch,
      now: () => new Date(REFRESHED_AT),
    });
    await firstFetchStarted;
    let secondDownloads = 0;
    await assert.rejects(
      refreshPublicDataSources({
        casesDirectory: fixture.casesDirectory,
        requestedCaseIds: ["public-case"],
        fetcher: (async () => {
          secondDownloads += 1;
          return new Response(newBaseline, { status: 200 });
        }) as typeof fetch,
      }),
      /another source refresh is already active/,
    );
    assert.equal(secondDownloads, 0);
    releaseFirstFetch();
    assert.deepEqual(await firstRefresh, { refreshed: 1, retrievedCaseIds: ["public-case"] });
    assert.deepEqual((await readdir(fixture.casesDirectory)).filter((name) => name.startsWith(".claimtrace-refresh-lock")), []);
    assert.deepEqual((await readdir(fixture.directory)).filter((name) => name.startsWith(".claimtrace-refresh-")), []);
  } finally {
    releaseFirstFetch();
    await firstRefresh?.catch(() => undefined);
    await rm(fixture.casesDirectory, { recursive: true, force: true });
  }
});

test("source refresh rejects an unsafe lock identity without resolving it as a path", async () => {
  const fixture = await makeFixture();
  try {
    const lockDirectory = path.join(fixture.casesDirectory, ".claimtrace-refresh-lock");
    const neighboringDirectory = path.join(fixture.casesDirectory, "neighboring-directory");
    const sentinelPath = path.join(neighboringDirectory, "sentinel.txt");
    await mkdir(lockDirectory);
    await mkdir(neighboringDirectory);
    await writeFile(sentinelPath, "must remain untouched", "utf8");
    await writeFile(path.join(lockDirectory, "lock.json"), `${JSON.stringify({
      schemaVersion: "claimtrace-source-refresh-lock/1.0.0",
      lockId: `${process.pid}-../neighboring-directory`,
      ownerPid: process.pid,
    }, null, 2)}\n`, "utf8");

    await assert.rejects(
      refreshPublicDataSources({ casesDirectory: fixture.casesDirectory, requestedCaseIds: ["public-case"] }),
      /invalid source-refresh lock identity/,
    );
    assert.equal(await readFile(sentinelPath, "utf8"), "must remain untouched");
    assert.deepEqual(await readdir(lockDirectory), ["lock.json"]);
  } finally {
    await rm(fixture.casesDirectory, { recursive: true, force: true });
  }
});

test("source refresh rejects a raw path through a symlinked parent before downloading", async () => {
  const fixture = await makeFixture();
  try {
    const outsideDirectory = path.join(fixture.casesDirectory, "outside-targets");
    const outsideBaselinePath = path.join(outsideDirectory, "raw-baseline.json");
    const outsideCurrentPath = path.join(outsideDirectory, "raw-current.json");
    await mkdir(outsideDirectory);
    await writeFile(outsideBaselinePath, "outside baseline must remain untouched", "utf8");
    await writeFile(outsideCurrentPath, "outside current must remain untouched", "utf8");
    await symlink(outsideDirectory, path.join(fixture.directory, "escape"));

    const configPath = path.join(fixture.directory, "source-config.json");
    const metadataPath = path.join(fixture.directory, "source-metadata.json");
    const config = JSON.parse(await readFile(configPath, "utf8"));
    config.rawFiles.baseline = "escape/raw-baseline.json";
    config.rawFiles.current = "escape/raw-current.json";
    const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
    for (const artifact of metadata.rawArtifacts) artifact.fileName = config.rawFiles[artifact.side];
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
    await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");

    let downloads = 0;
    await assert.rejects(
      refreshPublicDataSources({
        casesDirectory: fixture.casesDirectory,
        requestedCaseIds: ["public-case"],
        fetcher: (async () => {
          downloads += 1;
          return new Response(worldBankResponse("2019", 79.1), { status: 200 });
        }) as typeof fetch,
      }),
      /source-refresh file must be a direct child of its case directory/,
    );
    assert.equal(downloads, 0);
    assert.equal(await readFile(outsideBaselinePath, "utf8"), "outside baseline must remain untouched");
    assert.equal(await readFile(outsideCurrentPath, "utf8"), "outside current must remain untouched");
    assert.deepEqual((await readdir(fixture.casesDirectory)).filter((name) => name.startsWith(".claimtrace-refresh-lock")), []);
    assert.deepEqual((await readdir(fixture.directory)).filter((name) => name.startsWith(".claimtrace-refresh-")), []);
  } finally {
    await rm(fixture.casesDirectory, { recursive: true, force: true });
  }
});

test("source refresh restores an interrupted transaction before reading the case again", async () => {
  const fixture = await makeFixture();
  try {
    const newBaseline = worldBankResponse("2019", 79.1);
    const newCurrent = worldBankResponse("2024", 79.4);
    const refreshModuleUrl = new URL("../tools/refresh-public-data-sources.ts", import.meta.url).href;
    const childProgram = `
      import { lstat, mkdir, readFile, readdir, rename, rmdir, unlink, writeFile } from "node:fs/promises";
      import { refreshPublicDataSources } from ${JSON.stringify(refreshModuleUrl)};
      let promotions = 0;
      await refreshPublicDataSources({
        casesDirectory: process.env.CLAIMTRACE_CRASH_CASES,
        requestedCaseIds: ["public-case"],
        fetcher: async (input) => new Response(String(input).endsWith("baseline")
          ? ${JSON.stringify(newBaseline)}
          : ${JSON.stringify(newCurrent)}, { status: 200 }),
        now: () => new Date(${JSON.stringify(REFRESHED_AT)}),
        fileOperations: {
          lstat, mkdir, readFile, readdir, rmdir, unlink, writeFile,
          rename: async (source, target) => {
            await rename(source, target);
            if (String(source).endsWith(".new")) {
              promotions += 1;
              if (promotions === 1) process.exit(86);
            }
          },
        },
      });
    `;
    const child = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", childProgram], {
      cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
      env: { ...process.env, CLAIMTRACE_CRASH_CASES: fixture.casesDirectory },
      encoding: "utf8",
      timeout: 30_000,
    });
    assert.equal(child.status, 86, `child stderr:\n${child.stderr}`);
    await assert.rejects(readFile(path.join(fixture.directory, "source-config.json"), "utf8"), { code: "ENOENT" });
    assert.equal((await readdir(fixture.directory)).filter((file) => file.startsWith(".claimtrace-refresh-")).length, 1);

    const result = await refreshPublicDataSources({
      casesDirectory: fixture.casesDirectory,
      requestedCaseIds: ["public-case"],
      fetcher: (async (input: string | URL | Request) => new Response(
        String(input).endsWith("baseline") ? newBaseline : newCurrent,
        { status: 200 },
      )) as typeof fetch,
      now: () => new Date(REFRESHED_AT),
    });
    assert.deepEqual(result, { refreshed: 1, retrievedCaseIds: ["public-case"] });
    assert.equal(await readFile(path.join(fixture.directory, "raw-baseline.json"), "utf8"), newBaseline);
    assert.equal(await readFile(path.join(fixture.directory, "raw-current.json"), "utf8"), newCurrent);
    const config = JSON.parse(await readFile(path.join(fixture.directory, "source-config.json"), "utf8"));
    assert.equal(config.retrievedAt, REFRESHED_AT);
    assert.deepEqual((await readdir(fixture.directory)).filter((file) => file.startsWith(".claimtrace-refresh-")), []);
    assert.deepEqual((await readdir(fixture.casesDirectory)).filter((file) => file.startsWith(".claimtrace-refresh-lock")), []);
  } finally {
    await rm(fixture.casesDirectory, { recursive: true, force: true });
  }
});

test("source refresh rejects a non-file target before staging replacements", async () => {
  const fixture = await makeFixture();
  try {
    const baselinePath = path.join(fixture.directory, "raw-baseline.json");
    const currentPath = path.join(fixture.directory, "raw-current.json");
    const originalConfig = await readFile(path.join(fixture.directory, "source-config.json"), "utf8");
    await rm(currentPath);
    await mkdir(currentPath);
    await assert.rejects(
      refreshPublicDataSources({
        casesDirectory: fixture.casesDirectory,
        requestedCaseIds: ["public-case"],
        fetcher: (async (input: string | URL | Request) => new Response(
          String(input).endsWith("baseline") ? worldBankResponse("2019", 79.1) : worldBankResponse("2024", 79.4),
          { status: 200 },
        )) as typeof fetch,
      }),
      /source refresh target must be a regular file/,
    );
    assert.equal(await readFile(baselinePath, "utf8"), fixture.oldBaseline);
    assert.equal(await readFile(path.join(fixture.directory, "source-config.json"), "utf8"), originalConfig);
    assert.deepEqual((await readdir(fixture.directory)).filter((file) => file.includes(".claimtrace-refresh-")), []);
  } finally {
    await rm(fixture.casesDirectory, { recursive: true, force: true });
  }
});

test("source refresh rejects an unknown requested case instead of succeeding with zero work", async () => {
  const fixture = await makeFixture();
  try {
    await assert.rejects(
      refreshPublicDataSources({ casesDirectory: fixture.casesDirectory, requestedCaseIds: ["missing-case"] }),
      /Unknown public-data case ID\(s\): missing-case/,
    );
  } finally {
    await rm(fixture.casesDirectory, { recursive: true, force: true });
  }
});
