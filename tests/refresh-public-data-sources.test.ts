import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { refreshPublicDataSources } from "../tools/refresh-public-data-sources";

const REFRESHED_AT = "2026-08-11T01:02:03.000Z";

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
  await writeFile(path.join(directory, "source-config.json"), `${JSON.stringify(config, null, 2)}\n`, "utf8");
  await writeFile(path.join(directory, "raw-baseline.json"), "old baseline", "utf8");
  await writeFile(path.join(directory, "raw-current.json"), "old current", "utf8");
  return { casesDirectory, directory };
}

test("source refresh replaces both snapshots and records the actual retrieval time", async () => {
  const fixture = await makeFixture();
  try {
    const fetcher = (async (input: string | URL | Request) => {
      const side = String(input).endsWith("baseline") ? "baseline" : "current";
      return new Response(`new ${side}`, { status: 200 });
    }) as typeof fetch;
    const result = await refreshPublicDataSources({
      casesDirectory: fixture.casesDirectory,
      requestedCaseIds: ["public-case"],
      fetcher,
      now: () => new Date(REFRESHED_AT),
    });
    assert.deepEqual(result, { refreshed: 1, retrievedCaseIds: ["public-case"] });
    assert.equal(await readFile(path.join(fixture.directory, "raw-baseline.json"), "utf8"), "new baseline");
    assert.equal(await readFile(path.join(fixture.directory, "raw-current.json"), "utf8"), "new current");
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
      ? new Response("new baseline", { status: 200 })
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
    assert.equal(await readFile(path.join(fixture.directory, "raw-baseline.json"), "utf8"), "old baseline");
    assert.equal(await readFile(path.join(fixture.directory, "raw-current.json"), "utf8"), "old current");
    assert.equal(await readFile(path.join(fixture.directory, "source-config.json"), "utf8"), originalConfig);
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
