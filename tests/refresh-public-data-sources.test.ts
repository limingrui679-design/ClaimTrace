import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, rmdir, symlink, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { refreshPublicDataSources } from "../tools/refresh-public-data-sources";

const REFRESHED_AT = "2026-08-11T01:02:03.000Z";
const LAST_UPDATED = "2026-07-13";
const NEW_LAST_UPDATED = "2026-08-10";
const TEST_FILE_OPERATIONS = { lstat, mkdir, readFile, readdir, rename, rmdir, unlink, writeFile };

function worldBankResponse(year: string, value: number, lastUpdated = LAST_UPDATED) {
  return JSON.stringify([
    { page: 1, pages: 1, per_page: 1000, total: 1, sourceid: "2", lastupdated: lastUpdated },
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

function textSha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

async function makeFixture() {
  const casesDirectory = await mkdtemp(path.join(os.tmpdir(), "claimtrace-refresh-test-"));
  const directory = path.join(casesDirectory, "public-case");
  await mkdir(directory);
  const cleaning = {
    implementation: "world-bank-indicator-v1",
    scriptPath: "tools/generate-public-data-cases.ts",
    parameters: {
      baselineYear: "2019",
      currentYear: "2024",
      selectedCountryCodes: ["USA"],
      decimalPlaces: 3,
    },
  };
  const config = {
    schemaVersion: "claimtrace-external-source-config/2.2.0",
    sourceType: "WORLD_BANK_INDICATORS_API_V2",
    retrievedAt: "2026-08-10T00:00:00.000Z",
    sourceLastUpdated: LAST_UPDATED,
    sourceLastUpdatedBasis: "PUBLISHER_REPORTED",
    sourceLastUpdatedEvidence: { method: "RAW_RESPONSE_PAIR" },
    sourceUrls: {
      baseline: "https://example.test/baseline",
      current: "https://example.test/current",
    },
    rawFiles: {
      baseline: "raw-baseline.json",
      current: "raw-current.json",
    },
    cleaning,
    retainedField: "preserved",
  };
  const oldBaseline = worldBankResponse("2019", 78.8);
  const oldCurrent = worldBankResponse("2024", 78.9);
  const provenance = {
    schemaVersion: "claimtrace-external-source/2.2.0",
    sourceType: config.sourceType,
    publisher: "World Bank",
    dataset: "World Development Indicators",
    measure: { id: "SP.DYN.LE00.IN", name: "Life expectancy at birth, total (years)" },
    retrievedAt: config.retrievedAt,
    sourceLastUpdated: LAST_UPDATED,
    sourceLastUpdatedBasis: "PUBLISHER_REPORTED",
    sourceLastUpdatedEvidence: { method: "RAW_RESPONSE_PAIR" },
    sourceUrls: config.sourceUrls,
    license: "CC BY 4.0",
    licenseUrl: "https://example.test/license",
    attribution: "World Bank test fixture",
    limitations: ["Test fixture only."],
    cleaning: config.cleaning,
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

function usdotResponse(year: string, ridership: number) {
  return JSON.stringify([{
    _5_digit_ntd_id: "10003",
    agency: "Test Transit",
    mode_name: "Heavy Rail",
    type_of_service: "DO",
    year,
    month: "May",
    month_year: `${year}-05-01T00:00:00.000`,
    vehicle_revenue_hours: "100",
    ridership: String(ridership),
  }]);
}

function socrataMetadata(date: string) {
  return JSON.stringify({ id: "5ti2-5uiv", name: "Monthly Modal Time Series", rowsUpdatedAt: Date.parse(`${date}T12:00:00Z`) / 1_000 });
}

async function makeSocrataFixture() {
  const casesDirectory = await mkdtemp(path.join(os.tmpdir(), "claimtrace-socrata-refresh-test-"));
  const directory = path.join(casesDirectory, "public-case");
  await mkdir(directory);
  const oldDate = "2026-07-07";
  const oldBaseline = usdotResponse("2024", 1_000);
  const oldCurrent = usdotResponse("2025", 1_100);
  const oldMetadata = socrataMetadata(oldDate);
  const sourceUrls = {
    baseline: "https://example.test/resource/5ti2-5uiv.json?side=baseline",
    current: "https://example.test/resource/5ti2-5uiv.json?side=current",
  };
  const rawFiles = { baseline: "raw-baseline.json", current: "raw-current.json" };
  const sourceLastUpdatedEvidence = {
    method: "PUBLISHER_METADATA",
    sourceUrl: "https://example.test/api/views/5ti2-5uiv",
    fileName: "raw-source-metadata.json",
  };
  const cleaning = {
    implementation: "usdot-ntd-monthly-v1",
    scriptPath: "tools/generate-public-data-cases.ts",
    parameters: { baselineYear: "2024", currentYear: "2025", month: "May", selectedNtdIds: ["10003"], decimalPlaces: 2 },
  };
  const config = {
    schemaVersion: "claimtrace-external-source-config/2.2.0",
    sourceType: "USDOT_NTD_SOCRATA_V1",
    retrievedAt: "2026-08-10T00:00:00.000Z",
    sourceLastUpdated: oldDate,
    sourceLastUpdatedBasis: "PUBLISHER_REPORTED",
    sourceLastUpdatedEvidence,
    sourceUrls,
    rawFiles,
    cleaning,
  };
  const provenance = {
    schemaVersion: "claimtrace-external-source/2.2.0",
    sourceType: config.sourceType,
    publisher: "Federal Transit Administration",
    dataset: "Monthly Modal Time Series",
    measure: { id: "ridership", name: "Ridership per vehicle-revenue hour" },
    retrievedAt: config.retrievedAt,
    sourceLastUpdated: oldDate,
    sourceLastUpdatedBasis: "PUBLISHER_REPORTED",
    sourceLastUpdatedEvidence: { ...sourceLastUpdatedEvidence, sha256: textSha256(oldMetadata), text: oldMetadata },
    sourceUrls,
    license: "U.S. Government public data",
    licenseUrl: "https://example.test/license",
    attribution: "USDOT test fixture",
    limitations: ["Test fixture only."],
    cleaning,
    rawArtifacts: [
      { side: "baseline", fileName: rawFiles.baseline, sha256: textSha256(oldBaseline), text: oldBaseline },
      { side: "current", fileName: rawFiles.current, sha256: textSha256(oldCurrent), text: oldCurrent },
    ],
  };
  const files = {
    "source-config.json": `${JSON.stringify(config, null, 2)}\n`,
    "source-metadata.json": `${JSON.stringify(provenance, null, 2)}\n`,
    [rawFiles.baseline]: oldBaseline,
    [rawFiles.current]: oldCurrent,
    [sourceLastUpdatedEvidence.fileName]: oldMetadata,
  };
  await Promise.all(Object.entries(files).map(([fileName, content]) => writeFile(path.join(directory, fileName), content, "utf8")));
  return { casesDirectory, directory, files };
}

test("source refresh replaces both snapshots and atomically records retrieval and publisher dates", async () => {
  const fixture = await makeFixture();
  try {
    const newBaseline = worldBankResponse("2019", 79.1, NEW_LAST_UPDATED);
    const newCurrent = worldBankResponse("2024", 79.4, NEW_LAST_UPDATED);
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
    assert.equal(config.sourceLastUpdated, NEW_LAST_UPDATED);
    assert.equal(config.retainedField, "preserved");
  } finally {
    await rm(fixture.casesDirectory, { recursive: true, force: true });
  }
});

test("source refresh rejects invalid or disagreeing publisher dates before replacing any file", async () => {
  for (const [label, baselineDate, currentDate, expected] of [
    ["invalid", "not-a-date", NEW_LAST_UPDATED, /World Bank lastupdated is not a valid ISO calendar date/],
    ["mismatch", LAST_UPDATED, NEW_LAST_UPDATED, /does not resolve to one date/],
  ] as const) {
    const fixture = await makeFixture();
    try {
      const originalConfig = await readFile(path.join(fixture.directory, "source-config.json"), "utf8");
      await assert.rejects(
        refreshPublicDataSources({
          casesDirectory: fixture.casesDirectory,
          requestedCaseIds: ["public-case"],
          fetcher: (async (input: string | URL | Request) => new Response(
            String(input).endsWith("baseline")
              ? worldBankResponse("2019", 79.1, baselineDate)
              : worldBankResponse("2024", 79.4, currentDate),
            { status: 200 },
          )) as typeof fetch,
        }),
        expected,
        label,
      );
      assert.equal(await readFile(path.join(fixture.directory, "raw-baseline.json"), "utf8"), fixture.oldBaseline);
      assert.equal(await readFile(path.join(fixture.directory, "raw-current.json"), "utf8"), fixture.oldCurrent);
      assert.equal(await readFile(path.join(fixture.directory, "source-config.json"), "utf8"), originalConfig);
    } finally {
      await rm(fixture.casesDirectory, { recursive: true, force: true });
    }
  }
});

test("Socrata metadata, source pair, and publisher date commit as one four-file transaction", async () => {
  const fixture = await makeSocrataFixture();
  try {
    const nextDate = "2026-08-10";
    const nextBaseline = usdotResponse("2024", 1_200);
    const nextCurrent = usdotResponse("2025", 1_300);
    const nextMetadata = socrataMetadata(nextDate);
    await refreshPublicDataSources({
      casesDirectory: fixture.casesDirectory,
      requestedCaseIds: ["public-case"],
      fetcher: (async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes("/api/views/")) return new Response(nextMetadata, { status: 200 });
        return new Response(url.includes("side=baseline") ? nextBaseline : nextCurrent, { status: 200 });
      }) as typeof fetch,
      now: () => new Date(REFRESHED_AT),
    });
    assert.equal(await readFile(path.join(fixture.directory, "raw-baseline.json"), "utf8"), nextBaseline);
    assert.equal(await readFile(path.join(fixture.directory, "raw-current.json"), "utf8"), nextCurrent);
    assert.equal(await readFile(path.join(fixture.directory, "raw-source-metadata.json"), "utf8"), nextMetadata);
    const config = JSON.parse(await readFile(path.join(fixture.directory, "source-config.json"), "utf8"));
    assert.equal(config.retrievedAt, REFRESHED_AT);
    assert.equal(config.sourceLastUpdated, nextDate);
  } finally {
    await rm(fixture.casesDirectory, { recursive: true, force: true });
  }
});

test("Socrata four-file refresh rolls back the source pair, metadata, and dates together", async () => {
  const fixture = await makeSocrataFixture();
  try {
    let promotions = 0;
    await assert.rejects(
      refreshPublicDataSources({
        casesDirectory: fixture.casesDirectory,
        requestedCaseIds: ["public-case"],
        fetcher: (async (input: string | URL | Request) => {
          const url = String(input);
          if (url.includes("/api/views/")) return new Response(socrataMetadata("2026-08-10"), { status: 200 });
          return new Response(url.includes("side=baseline") ? usdotResponse("2024", 1_200) : usdotResponse("2025", 1_300), { status: 200 });
        }) as typeof fetch,
        fileOperations: {
          ...TEST_FILE_OPERATIONS,
          rename: async (source, target) => {
            if (String(source).endsWith(".new")) {
              promotions += 1;
              if (promotions === 4) throw new Error("injected fourth-file replacement failure");
            }
            await rename(source, target);
          },
        },
      }),
      /injected fourth-file replacement failure/,
    );
    for (const [fileName, content] of Object.entries(fixture.files)) {
      assert.equal(await readFile(path.join(fixture.directory, fileName), "utf8"), content, fileName);
    }
    assert.deepEqual((await readdir(fixture.directory)).filter((file) => file.includes(".claimtrace-refresh-")), []);
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
      /public-case: publisher update-date extraction failed|public-case:baseline: source content failed cleaning validation/,
    );
    assert.equal(await readFile(path.join(fixture.directory, "raw-baseline.json"), "utf8"), fixture.oldBaseline);
    assert.equal(await readFile(path.join(fixture.directory, "raw-current.json"), "utf8"), fixture.oldCurrent);
    assert.equal(await readFile(path.join(fixture.directory, "source-config.json"), "utf8"), originalConfig);
  } finally {
    await rm(fixture.casesDirectory, { recursive: true, force: true });
  }
});

test("source refresh rejects malformed or inconsistent source metadata before downloading", async () => {
  const fixture = await makeFixture();
  try {
    const metadataPath = path.join(fixture.directory, "source-metadata.json");
    const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
    metadata.rawArtifacts.push({ side: "other", fileName: "source-metadata.json", sha256: "not-governed", text: "not governed" });
    await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
    let downloads = 0;
    await assert.rejects(
      refreshPublicDataSources({
        casesDirectory: fixture.casesDirectory,
        requestedCaseIds: ["public-case"],
        fetcher: (async () => {
          downloads += 1;
          return new Response(fixture.oldBaseline, { status: 200 });
        }) as typeof fetch,
      }),
      /source-metadata must contain exactly one baseline and one current raw artifact/,
    );
    assert.equal(downloads, 0);
    assert.equal(await readFile(path.join(fixture.directory, "raw-baseline.json"), "utf8"), fixture.oldBaseline);
    assert.equal(await readFile(path.join(fixture.directory, "raw-current.json"), "utf8"), fixture.oldCurrent);
  } finally {
    await rm(fixture.casesDirectory, { recursive: true, force: true });
  }

  const mismatchedFixture = await makeFixture();
  try {
    const metadataPath = path.join(mismatchedFixture.directory, "source-metadata.json");
    const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
    metadata.cleaning.parameters.decimalPlaces += 1;
    await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
    let downloads = 0;
    await assert.rejects(
      refreshPublicDataSources({
        casesDirectory: mismatchedFixture.casesDirectory,
        requestedCaseIds: ["public-case"],
        fetcher: (async () => {
          downloads += 1;
          return new Response(mismatchedFixture.oldBaseline, { status: 200 });
        }) as typeof fetch,
      }),
      /cleaning definition differs between source-config and source-metadata/,
    );
    assert.equal(downloads, 0);
    assert.equal(await readFile(path.join(mismatchedFixture.directory, "raw-baseline.json"), "utf8"), mismatchedFixture.oldBaseline);
    assert.equal(await readFile(path.join(mismatchedFixture.directory, "raw-current.json"), "utf8"), mismatchedFixture.oldCurrent);
  } finally {
    await rm(mismatchedFixture.casesDirectory, { recursive: true, force: true });
  }
});

test("source refresh rejects unsafe URLs, redirects, and oversized responses before replacement", async () => {
  const unsafeUrlFixture = await makeFixture();
  try {
    const configPath = path.join(unsafeUrlFixture.directory, "source-config.json");
    const metadataPath = path.join(unsafeUrlFixture.directory, "source-metadata.json");
    const config = JSON.parse(await readFile(configPath, "utf8"));
    const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
    config.sourceUrls.baseline = "http://example.test/baseline";
    metadata.sourceUrls.baseline = config.sourceUrls.baseline;
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
    await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
    let downloads = 0;
    await assert.rejects(
      refreshPublicDataSources({
        casesDirectory: unsafeUrlFixture.casesDirectory,
        requestedCaseIds: ["public-case"],
        fetcher: (async () => {
          downloads += 1;
          return new Response(unsafeUrlFixture.oldBaseline, { status: 200 });
        }) as typeof fetch,
      }),
      /source URL must use HTTPS without embedded credentials/,
    );
    assert.equal(downloads, 0);
  } finally {
    await rm(unsafeUrlFixture.casesDirectory, { recursive: true, force: true });
  }

  const unsafeMetadataUrlFixture = await makeSocrataFixture();
  try {
    const configPath = path.join(unsafeMetadataUrlFixture.directory, "source-config.json");
    const metadataPath = path.join(unsafeMetadataUrlFixture.directory, "source-metadata.json");
    const config = JSON.parse(await readFile(configPath, "utf8"));
    const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
    config.sourceLastUpdatedEvidence.sourceUrl = "http://example.test/api/views/5ti2-5uiv";
    metadata.sourceLastUpdatedEvidence.sourceUrl = config.sourceLastUpdatedEvidence.sourceUrl;
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
    await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
    let downloads = 0;
    await assert.rejects(
      refreshPublicDataSources({
        casesDirectory: unsafeMetadataUrlFixture.casesDirectory,
        requestedCaseIds: ["public-case"],
        fetcher: (async () => {
          downloads += 1;
          return new Response("not reached", { status: 200 });
        }) as typeof fetch,
      }),
      /publisher update metadata URL must use HTTPS without embedded credentials/,
    );
    assert.equal(downloads, 0);
  } finally {
    await rm(unsafeMetadataUrlFixture.casesDirectory, { recursive: true, force: true });
  }

  const redirectedFixture = await makeFixture();
  try {
    const originalConfig = await readFile(path.join(redirectedFixture.directory, "source-config.json"), "utf8");
    await assert.rejects(
      refreshPublicDataSources({
        casesDirectory: redirectedFixture.casesDirectory,
        requestedCaseIds: ["public-case"],
        fetcher: (async (input: string | URL | Request) => {
          const response = new Response(String(input).endsWith("baseline") ? redirectedFixture.oldBaseline : redirectedFixture.oldCurrent, { status: 200 });
          Object.defineProperties(response, {
            redirected: { value: true },
            url: { value: "https://redirected.example.test/final" },
          });
          return response;
        }) as typeof fetch,
      }),
      /source request was redirected; pin the final HTTPS URL explicitly/,
    );
    assert.equal(await readFile(path.join(redirectedFixture.directory, "raw-baseline.json"), "utf8"), redirectedFixture.oldBaseline);
    assert.equal(await readFile(path.join(redirectedFixture.directory, "raw-current.json"), "utf8"), redirectedFixture.oldCurrent);
    assert.equal(await readFile(path.join(redirectedFixture.directory, "source-config.json"), "utf8"), originalConfig);
  } finally {
    await rm(redirectedFixture.casesDirectory, { recursive: true, force: true });
  }

  const oversizedFixture = await makeFixture();
  try {
    const originalConfig = await readFile(path.join(oversizedFixture.directory, "source-config.json"), "utf8");
    const oversizedBody = "x".repeat(8 * 1024 * 1024 + 1);
    await assert.rejects(
      refreshPublicDataSources({
        casesDirectory: oversizedFixture.casesDirectory,
        requestedCaseIds: ["public-case"],
        fetcher: (async (input: string | URL | Request) => new Response(
          String(input).endsWith("baseline") ? oversizedBody : oversizedFixture.oldCurrent,
          { status: 200 },
        )) as typeof fetch,
      }),
      /source response exceeds the 8388608-byte limit/,
    );
    assert.equal(await readFile(path.join(oversizedFixture.directory, "raw-baseline.json"), "utf8"), oversizedFixture.oldBaseline);
    assert.equal(await readFile(path.join(oversizedFixture.directory, "raw-current.json"), "utf8"), oversizedFixture.oldCurrent);
    assert.equal(await readFile(path.join(oversizedFixture.directory, "source-config.json"), "utf8"), originalConfig);
  } finally {
    await rm(oversizedFixture.casesDirectory, { recursive: true, force: true });
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

test("source refresh rejects a version-2 transaction that targets case metadata", async () => {
  const fixture = await makeFixture();
  try {
    const metadataPath = path.join(fixture.directory, "source-metadata.json");
    const configPath = path.join(fixture.directory, "source-config.json");
    const originalMetadata = await readFile(metadataPath, "utf8");
    const originalConfig = await readFile(configPath, "utf8");
    const forgedBackup = "forged metadata backup";
    const transactionId = `${process.pid}-${randomUUID()}`;
    const transactionDirectory = path.join(fixture.directory, `.claimtrace-refresh-${transactionId}`);
    const backupPath = path.join(transactionDirectory, "0.backup");
    await mkdir(transactionDirectory);
    await writeFile(path.join(transactionDirectory, "transaction.json"), `${JSON.stringify({
      schemaVersion: "claimtrace-source-refresh-transaction/2.0.0",
      transactionId,
      ownerPid: process.pid,
      phase: "prepared",
      files: [
        { target: "source-metadata.json", temporary: "0.new", backup: "0.backup", originalSha256: textSha256(forgedBackup), committedSha256: textSha256("next metadata") },
        { target: "raw-current.json", temporary: "1.new", backup: "1.backup", originalSha256: textSha256(fixture.oldCurrent), committedSha256: textSha256("next current") },
        { target: "source-config.json", temporary: "2.new", backup: "2.backup", originalSha256: textSha256(originalConfig), committedSha256: textSha256("next config") },
      ],
    }, null, 2)}\n`, "utf8");
    await writeFile(backupPath, forgedBackup, "utf8");

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
      /transaction target layout is invalid/,
    );
    assert.equal(downloads, 0);
    assert.equal(await readFile(metadataPath, "utf8"), originalMetadata);
    assert.equal(await readFile(backupPath, "utf8"), forgedBackup);
    assert.deepEqual((await readdir(transactionDirectory)).sort(), ["0.backup", "transaction.json"]);
    assert.deepEqual((await readdir(fixture.casesDirectory)).filter((name) => name.startsWith(".claimtrace-refresh-lock")), []);
  } finally {
    await rm(fixture.casesDirectory, { recursive: true, force: true });
  }
});

test("source refresh rejects a noncanonical version-2 transaction artifact layout", async () => {
  const fixture = await makeFixture();
  try {
    const originalConfig = await readFile(path.join(fixture.directory, "source-config.json"), "utf8");
    const transactionId = `${process.pid}-${randomUUID()}`;
    const transactionDirectory = path.join(fixture.directory, `.claimtrace-refresh-${transactionId}`);
    await mkdir(transactionDirectory);
    await writeFile(path.join(transactionDirectory, "transaction.json"), `${JSON.stringify({
      schemaVersion: "claimtrace-source-refresh-transaction/2.0.0",
      transactionId,
      ownerPid: process.pid,
      phase: "prepared",
      files: [
        { target: "raw-baseline.json", temporary: "transaction.json.next", backup: "0.backup", originalSha256: textSha256(fixture.oldBaseline), committedSha256: textSha256("next baseline") },
        { target: "raw-current.json", temporary: "1.new", backup: "1.backup", originalSha256: textSha256(fixture.oldCurrent), committedSha256: textSha256("next current") },
        { target: "source-config.json", temporary: "2.new", backup: "2.backup", originalSha256: textSha256(originalConfig), committedSha256: textSha256("next config") },
      ],
    }, null, 2)}\n`, "utf8");

    await assert.rejects(
      refreshPublicDataSources({ casesDirectory: fixture.casesDirectory, requestedCaseIds: ["recovery-probe-only"] }),
      /transaction artifact layout is invalid/,
    );
    assert.equal(await readFile(path.join(fixture.directory, "raw-baseline.json"), "utf8"), fixture.oldBaseline);
    assert.equal(await readFile(path.join(fixture.directory, "raw-current.json"), "utf8"), fixture.oldCurrent);
    assert.equal(await readFile(path.join(fixture.directory, "source-config.json"), "utf8"), originalConfig);
    assert.deepEqual(await readdir(transactionDirectory), ["transaction.json"]);
  } finally {
    await rm(fixture.casesDirectory, { recursive: true, force: true });
  }
});

test("source refresh rejects a symlinked transaction manifest without reading it", async () => {
  const fixture = await makeFixture();
  try {
    const transactionId = `${process.pid}-${randomUUID()}`;
    const transactionDirectory = path.join(fixture.directory, `.claimtrace-refresh-${transactionId}`);
    const outsideManifestPath = path.join(fixture.casesDirectory, "outside-transaction.json");
    await mkdir(transactionDirectory);
    await writeFile(outsideManifestPath, "not a transaction manifest", "utf8");
    await symlink(outsideManifestPath, path.join(transactionDirectory, "transaction.json"));

    let downloads = 0;
    await assert.rejects(
      refreshPublicDataSources({
        casesDirectory: fixture.casesDirectory,
        requestedCaseIds: ["public-case"],
        fetcher: (async () => {
          downloads += 1;
          return new Response(fixture.oldBaseline, { status: 200 });
        }) as typeof fetch,
      }),
      /source-refresh transaction manifest must be a regular file/,
    );
    assert.equal(downloads, 0);
    assert.equal(await readFile(outsideManifestPath, "utf8"), "not a transaction manifest");
    assert.deepEqual(await readdir(transactionDirectory), ["transaction.json"]);
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

test("source refresh rejects a symlinked lock directory without reading or modifying its target", async () => {
  const fixture = await makeFixture();
  try {
    const outsideDirectory = path.join(fixture.casesDirectory, "outside-lock-directory");
    const outsideManifestPath = path.join(outsideDirectory, "lock.json");
    const sentinelPath = path.join(outsideDirectory, "sentinel.txt");
    await mkdir(outsideDirectory);
    await writeFile(outsideManifestPath, "outside manifest must remain unread", "utf8");
    await writeFile(sentinelPath, "outside sentinel must remain untouched", "utf8");
    await symlink(outsideDirectory, path.join(fixture.casesDirectory, ".claimtrace-refresh-lock"));

    let downloads = 0;
    await assert.rejects(
      refreshPublicDataSources({
        casesDirectory: fixture.casesDirectory,
        requestedCaseIds: ["public-case"],
        fetcher: (async () => {
          downloads += 1;
          return new Response(fixture.oldBaseline, { status: 200 });
        }) as typeof fetch,
      }),
      /source-refresh lock must be a directory and cannot be a symbolic link/,
    );
    assert.equal(downloads, 0);
    assert.equal(await readFile(outsideManifestPath, "utf8"), "outside manifest must remain unread");
    assert.equal(await readFile(sentinelPath, "utf8"), "outside sentinel must remain untouched");
    assert.equal((await lstat(path.join(fixture.casesDirectory, ".claimtrace-refresh-lock"))).isSymbolicLink(), true);
  } finally {
    await rm(fixture.casesDirectory, { recursive: true, force: true });
  }
});

test("source refresh rejects a symlinked lock manifest without reading it", async () => {
  const fixture = await makeFixture();
  try {
    const lockDirectory = path.join(fixture.casesDirectory, ".claimtrace-refresh-lock");
    const outsideManifestPath = path.join(fixture.casesDirectory, "outside-lock.json");
    await mkdir(lockDirectory);
    await writeFile(outsideManifestPath, "not a lock manifest", "utf8");
    await symlink(outsideManifestPath, path.join(lockDirectory, "lock.json"));

    let downloads = 0;
    await assert.rejects(
      refreshPublicDataSources({
        casesDirectory: fixture.casesDirectory,
        requestedCaseIds: ["public-case"],
        fetcher: (async () => {
          downloads += 1;
          return new Response(fixture.oldBaseline, { status: 200 });
        }) as typeof fetch,
      }),
      /source-refresh lock manifest must be a regular file/,
    );
    assert.equal(downloads, 0);
    assert.equal(await readFile(outsideManifestPath, "utf8"), "not a lock manifest");
    assert.deepEqual((await readdir(fixture.casesDirectory)).filter((name) => name.startsWith(".claimtrace-refresh-lock")), [".claimtrace-refresh-lock"]);
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

test("source refresh rejects a raw target alias to case metadata before downloading", async () => {
  const fixture = await makeFixture();
  try {
    const configPath = path.join(fixture.directory, "source-config.json");
    const metadataPath = path.join(fixture.directory, "source-metadata.json");
    const config = JSON.parse(await readFile(configPath, "utf8"));
    const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
    config.rawFiles.baseline = "source-metadata.json";
    metadata.rawArtifacts.find((artifact: { side: string }) => artifact.side === "baseline").fileName = "source-metadata.json";
    const configuredText = `${JSON.stringify(config, null, 2)}\n`;
    const metadataText = `${JSON.stringify(metadata, null, 2)}\n`;
    await writeFile(configPath, configuredText, "utf8");
    await writeFile(metadataPath, metadataText, "utf8");

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
      /raw-response file name must use the raw-\* namespace/,
    );
    assert.equal(downloads, 0);
    assert.equal(await readFile(configPath, "utf8"), configuredText);
    assert.equal(await readFile(metadataPath, "utf8"), metadataText);
    assert.deepEqual((await readdir(fixture.casesDirectory)).filter((name) => name.startsWith(".claimtrace-refresh-lock")), []);
    assert.deepEqual((await readdir(fixture.directory)).filter((name) => name.startsWith(".claimtrace-refresh-")), []);
  } finally {
    await rm(fixture.casesDirectory, { recursive: true, force: true });
  }
});

test("source refresh rejects duplicate raw targets before downloading", async () => {
  const fixture = await makeFixture();
  try {
    const configPath = path.join(fixture.directory, "source-config.json");
    const metadataPath = path.join(fixture.directory, "source-metadata.json");
    const config = JSON.parse(await readFile(configPath, "utf8"));
    const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
    config.rawFiles.current = config.rawFiles.baseline;
    metadata.rawArtifacts.find((artifact: { side: string }) => artifact.side === "current").fileName = config.rawFiles.baseline;
    const configuredText = `${JSON.stringify(config, null, 2)}\n`;
    const metadataText = `${JSON.stringify(metadata, null, 2)}\n`;
    await writeFile(configPath, configuredText, "utf8");
    await writeFile(metadataPath, metadataText, "utf8");

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
      /raw-response targets must be distinct/,
    );
    assert.equal(downloads, 0);
    assert.equal(await readFile(configPath, "utf8"), configuredText);
    assert.equal(await readFile(metadataPath, "utf8"), metadataText);
    assert.equal(await readFile(path.join(fixture.directory, "raw-baseline.json"), "utf8"), fixture.oldBaseline);
    assert.deepEqual((await readdir(fixture.casesDirectory)).filter((name) => name.startsWith(".claimtrace-refresh-lock")), []);
  } finally {
    await rm(fixture.casesDirectory, { recursive: true, force: true });
  }
});

test("source refresh rejects a symlinked source configuration before reading or downloading", async () => {
  const fixture = await makeFixture();
  try {
    const configPath = path.join(fixture.directory, "source-config.json");
    const outsideConfigPath = path.join(fixture.casesDirectory, "outside-source-config.json");
    const outsideConfig = await readFile(configPath, "utf8");
    await writeFile(outsideConfigPath, outsideConfig, "utf8");
    await unlink(configPath);
    await symlink(outsideConfigPath, configPath);

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
      /source-refresh configuration must be a regular file/,
    );
    assert.equal(downloads, 0);
    assert.equal(await readFile(outsideConfigPath, "utf8"), outsideConfig);
    assert.equal(await readFile(path.join(fixture.directory, "raw-baseline.json"), "utf8"), fixture.oldBaseline);
    assert.equal(await readFile(path.join(fixture.directory, "raw-current.json"), "utf8"), fixture.oldCurrent);
    assert.deepEqual((await readdir(fixture.casesDirectory)).filter((name) => name.startsWith(".claimtrace-refresh-lock")), []);
  } finally {
    await rm(fixture.casesDirectory, { recursive: true, force: true });
  }
});

test("source refresh rejects a symlinked final raw target before downloading", async () => {
  const fixture = await makeFixture();
  try {
    const baselinePath = path.join(fixture.directory, "raw-baseline.json");
    const currentPath = path.join(fixture.directory, "raw-current.json");
    const configPath = path.join(fixture.directory, "source-config.json");
    const originalCurrent = await readFile(currentPath, "utf8");
    const originalConfig = await readFile(configPath, "utf8");
    const outsidePath = path.join(fixture.casesDirectory, "outside-baseline.json");
    await writeFile(outsidePath, "outside baseline must remain untouched", "utf8");
    await unlink(baselinePath);
    await symlink(outsidePath, baselinePath);

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
      /raw-response target must be a regular file/,
    );
    assert.equal(downloads, 0);
    assert.equal(await readFile(outsidePath, "utf8"), "outside baseline must remain untouched");
    assert.equal(await readFile(currentPath, "utf8"), originalCurrent);
    assert.equal(await readFile(configPath, "utf8"), originalConfig);
    assert.deepEqual((await readdir(fixture.casesDirectory)).filter((name) => name.startsWith(".claimtrace-refresh-lock")), []);
    assert.deepEqual((await readdir(fixture.directory)).filter((name) => name.startsWith(".claimtrace-refresh-")), []);
  } finally {
    await rm(fixture.casesDirectory, { recursive: true, force: true });
  }
});

test("source refresh restores interrupted three- and four-file transactions before reading the case again", async () => {
  const fixture = await makeFixture();
  const socrataFixture = await makeSocrataFixture();
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

    const nextSocrataBaseline = usdotResponse("2024", 1_200);
    const nextSocrataCurrent = usdotResponse("2025", 1_300);
    const nextSocrataMetadata = socrataMetadata("2026-08-10");
    const socrataChildProgram = `
      import { lstat, mkdir, readFile, readdir, rename, rmdir, unlink, writeFile } from "node:fs/promises";
      import { refreshPublicDataSources } from ${JSON.stringify(refreshModuleUrl)};
      let promotions = 0;
      await refreshPublicDataSources({
        casesDirectory: process.env.CLAIMTRACE_CRASH_CASES,
        requestedCaseIds: ["public-case"],
        fetcher: async (input) => {
          const url = String(input);
          if (url.includes("/api/views/")) return new Response(${JSON.stringify(nextSocrataMetadata)}, { status: 200 });
          return new Response(url.includes("side=baseline") ? ${JSON.stringify(nextSocrataBaseline)} : ${JSON.stringify(nextSocrataCurrent)}, { status: 200 });
        },
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
    const socrataChild = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", socrataChildProgram], {
      cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
      env: { ...process.env, CLAIMTRACE_CRASH_CASES: socrataFixture.casesDirectory },
      encoding: "utf8",
      timeout: 30_000,
    });
    assert.equal(socrataChild.status, 86, `child stderr:\n${socrataChild.stderr}`);
    await assert.rejects(readFile(path.join(socrataFixture.directory, "source-config.json"), "utf8"), { code: "ENOENT" });
    assert.equal((await readdir(socrataFixture.directory)).filter((file) => file.startsWith(".claimtrace-refresh-")).length, 1);

    const socrataResult = await refreshPublicDataSources({
      casesDirectory: socrataFixture.casesDirectory,
      requestedCaseIds: ["public-case"],
      fetcher: (async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes("/api/views/")) return new Response(nextSocrataMetadata, { status: 200 });
        return new Response(url.includes("side=baseline") ? nextSocrataBaseline : nextSocrataCurrent, { status: 200 });
      }) as typeof fetch,
      now: () => new Date(REFRESHED_AT),
    });
    assert.deepEqual(socrataResult, { refreshed: 1, retrievedCaseIds: ["public-case"] });
    assert.equal(await readFile(path.join(socrataFixture.directory, "raw-baseline.json"), "utf8"), nextSocrataBaseline);
    assert.equal(await readFile(path.join(socrataFixture.directory, "raw-current.json"), "utf8"), nextSocrataCurrent);
    assert.equal(await readFile(path.join(socrataFixture.directory, "raw-source-metadata.json"), "utf8"), nextSocrataMetadata);
    const socrataConfig = JSON.parse(await readFile(path.join(socrataFixture.directory, "source-config.json"), "utf8"));
    assert.equal(socrataConfig.sourceLastUpdated, "2026-08-10");
    assert.deepEqual((await readdir(socrataFixture.directory)).filter((file) => file.startsWith(".claimtrace-refresh-")), []);
  } finally {
    await rm(fixture.casesDirectory, { recursive: true, force: true });
    await rm(socrataFixture.casesDirectory, { recursive: true, force: true });
  }
});

test("source refresh rejects a non-file target before downloading or staging replacements", async () => {
  const fixture = await makeFixture();
  try {
    const baselinePath = path.join(fixture.directory, "raw-baseline.json");
    const currentPath = path.join(fixture.directory, "raw-current.json");
    const originalConfig = await readFile(path.join(fixture.directory, "source-config.json"), "utf8");
    await rm(currentPath);
    await mkdir(currentPath);
    let downloads = 0;
    await assert.rejects(
      refreshPublicDataSources({
        casesDirectory: fixture.casesDirectory,
        requestedCaseIds: ["public-case"],
        fetcher: (async (input: string | URL | Request) => {
          downloads += 1;
          return new Response(
            String(input).endsWith("baseline") ? worldBankResponse("2019", 79.1) : worldBankResponse("2024", 79.4),
            { status: 200 },
          );
        }) as typeof fetch,
      }),
      /raw-response target must be a regular file/,
    );
    assert.equal(downloads, 0);
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
