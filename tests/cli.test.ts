import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const verifier = join(process.cwd(), "tools/verify-audit-bundle.ts");
const fixture = join(process.cwd(), "public/cases/cdc-places-depression/evidence-package.json");

function run(...args: string[]) {
  return spawnSync(process.execPath, ["--import", "tsx", verifier, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
}

test("AuditBundle CLI returns machine-readable verification for a valid bundle", () => {
  const result = run("bundle", fixture, "--json");
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout) as { valid: boolean; rootHash: string; checks: Array<{ passed: boolean }> };
  assert.equal(output.valid, true);
  assert.match(output.rootHash, /^[a-f0-9]{64}$/);
  assert.ok(output.checks.length >= 8);
  assert.ok(output.checks.every((check) => check.passed));
});

test("AuditBundle CLI rejects a semantically tampered bundle", async () => {
  const directory = await mkdtemp(join(tmpdir(), "claimtrace-cli-"));
  try {
    const file = join(directory, "tampered.json");
    const bundle = JSON.parse(await readFile(fixture, "utf8")) as { project: string };
    bundle.project = `${bundle.project} tampered`;
    await writeFile(file, `${JSON.stringify(bundle)}\n`, "utf8");
    const result = run("bundle", file, "--json");
    assert.equal(result.status, 1, result.stderr);
    const output = JSON.parse(result.stdout) as { valid: boolean; checks: Array<{ name: string; passed: boolean }> };
    assert.equal(output.valid, false);
    assert.equal(output.checks.find((check) => check.name === "bundle-root")?.passed, false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("AuditBundle chain CLI independently verifies a genesis bundle", () => {
  const result = run("chain", fixture, "--json");
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout) as { valid: boolean; roots: unknown[]; links: unknown[] };
  assert.equal(output.valid, true);
  assert.equal(output.roots.length, 1);
  assert.equal(output.links.length, 0);
});

test("tolerance history CLI reproduces the Treasury year and all endpoint-masked months", async () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", "tools/audit-tolerance-history.ts"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, await readFile(join(process.cwd(), "public/cases/us-treasury-yield-curve/tolerance-history.json"), "utf8"));
  const { history, monthlyEndpoints } = JSON.parse(result.stdout);
  assert.deepEqual([history.expectedFollowUps, history.keys.length, history.unknownCount, history.breachCount], [249, 9, 0, 37]);
  assert.deepEqual(history.episodes.map((row: { firstObservedBreach: string; firstObservedRecovery: string | null }) =>
    [row.firstObservedBreach, row.firstObservedRecovery]), [
    ["2025-10-14", "2025-10-15"], ["2025-10-16", "2025-10-29"], ["2025-11-21", null],
  ]);
  assert.deepEqual(monthlyEndpoints.filter((month: {hiddenBreachDates: string[]}) => month.hiddenBreachDates.length)
    .map((month: {month: string; breaches: number}) => [month.month, month.breaches]), [["2025-10", 10]]);
  assert.equal(history.peak.date, "2025-12-18");
});

test("tolerance history CLI binds a custom panel and a separately supplied observation calendar", async () => {
  const dir = await mkdtemp(join(tmpdir(), "claimtrace-history-"));
  const csv = join(dir, "panel.csv");
  const spec = join(dir, "spec.json");
  try {
    await writeFile(csv, "date,id,rating\n2025-02-03,a,9\n2025-02-05,a,8\n");
    await writeFile(spec, JSON.stringify({ dates: ["2025-02-03", "2025-02-04", "2025-02-05"],
      keys: ["a"], keyField: "id", dateField: "date", valueField: "rating", aggregation: "sum", tolerancePct: 10 }));
    const result = spawnSync(process.execPath, ["--import", "tsx", "tools/audit-tolerance-history.ts", csv, spec], {encoding:"utf8"});
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.match(report.csvSha256, /^[a-f0-9]{64}$/);
    assert.match(report.specSha256, /^[a-f0-9]{64}$/);
    assert.equal(report.history.observations[1].status, "missing_date");
    assert.equal(report.history.episodes[0].firstObservedBreach, "2025-02-05");
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
});
