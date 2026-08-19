import { readFile } from "node:fs/promises";
import process from "node:process";
import { type AuditBundle, verifyAuditBundle, verifyAuditBundleChain } from "../src/core/index.ts";

type OutputMode = "human" | "json";

interface LoadedBundle {
  file: string;
  bundle: AuditBundle;
}

function usage() {
  return [
    "ClaimTrace AuditBundle verifier",
    "",
    "Usage:",
    "  npm run verify:bundle -- <evidence-package.json> [--json]",
    "  npm run verify:chain -- <bundle-1.json> <bundle-2.json> [...] [--json]",
    "",
    "Exit codes: 0 valid, 1 verification failed, 2 input or usage error.",
  ].join("\n");
}

async function loadBundle(file: string): Promise<LoadedBundle> {
  const text = await readFile(file, "utf8");
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${file}: expected one JSON object`);
  }
  return { file, bundle: parsed as AuditBundle };
}

function rootHash(bundle: AuditBundle) {
  const candidate = bundle?.integrity?.payloadHash;
  return typeof candidate === "string" ? candidate : null;
}

async function verifyOne(file: string, mode: OutputMode) {
  const loaded = await loadBundle(file);
  const verification = await verifyAuditBundle(loaded.bundle);
  const output = {
    command: "bundle",
    file,
    schemaVersion: loaded.bundle.schemaVersion ?? null,
    project: loaded.bundle.project ?? null,
    rootHash: rootHash(loaded.bundle),
    valid: verification.valid,
    checks: verification.checks,
  };
  if (mode === "json") {
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  } else {
    const lines = [
      "ClaimTrace AuditBundle verification",
      `File: ${file}`,
      `Project: ${output.project ?? "unknown"}`,
      `Schema: ${output.schemaVersion ?? "unknown"}`,
      `Root: ${output.rootHash ?? "missing"}`,
      `Result: ${verification.valid ? "VALID" : "INVALID"}`,
      "",
      ...verification.checks.flatMap((check) => [
        `${check.passed ? "PASS" : "FAIL"}  ${check.name}`,
        ...check.errors.map((error) => `      ${error}`),
      ]),
    ];
    process.stdout.write(`${lines.join("\n")}\n`);
  }
  return verification.valid ? 0 : 1;
}

async function verifyChain(files: string[], mode: OutputMode) {
  const loaded = await Promise.all(files.map(loadBundle));
  const verification = await verifyAuditBundleChain(loaded.map((item) => item.bundle));
  const output = {
    command: "chain",
    files,
    roots: loaded.map((item) => ({ file: item.file, rootHash: rootHash(item.bundle) })),
    valid: verification.valid,
    errors: verification.errors,
    links: verification.links,
    bundleChecks: verification.bundleChecks,
  };
  if (mode === "json") {
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  } else {
    const lines = [
      "ClaimTrace AuditBundle chain verification",
      `Bundles: ${files.length}`,
      `Result: ${verification.valid ? "VALID" : "INVALID"}`,
      "",
      ...output.roots.map((item, index) => `${index + 1}. ${item.file}\n   ${item.rootHash ?? "missing root hash"}`),
      ...verification.links.map((link) => `${link.passed ? "PASS" : "FAIL"}  link ${link.fromIndex + 1} → ${link.toIndex + 1}`),
      ...verification.errors.map((error) => `FAIL  ${error}`),
    ];
    process.stdout.write(`${lines.join("\n")}\n`);
  }
  return verification.valid ? 0 : 1;
}

async function main() {
  const [command, ...rawArgs] = process.argv.slice(2);
  const mode: OutputMode = rawArgs.includes("--json") ? "json" : "human";
  const files = rawArgs.filter((argument) => argument !== "--json");
  if (command === "bundle" && files.length === 1) return verifyOne(files[0], mode);
  if (command === "chain" && files.length >= 1) return verifyChain(files, mode);
  process.stderr.write(`${usage()}\n`);
  return 2;
}

try {
  process.exitCode = await main();
} catch (error) {
  process.stderr.write(`ClaimTrace verifier input error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 2;
}
