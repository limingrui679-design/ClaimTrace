import assert from "node:assert/strict";
import { lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { refreshPublicDataSources } from "../tools/refresh-public-data-sources";

const REFRESHED_AT = "2026-08-11T01:02:03.000Z";
const LAST_UPDATED = "2026-07-13";

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
            lstat,
            unlink,
            writeFile: async (target, content, encoding) => {
              stagedWrites += 1;
              if (failure.phase === "staging" && stagedWrites === failure.at) throw new Error("injected staging failure");
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
