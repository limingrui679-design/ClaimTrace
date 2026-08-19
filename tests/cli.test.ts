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
