import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import test from "node:test";

const ROOT = resolve(process.cwd());
const TARGETS = [
  "app",
  "src",
  "tools",
  "tests",
  "benchmarks",
  "public/cases",
  "public/demo-data",
  "docs",
  "README.md",
  "CHANGELOG.md",
  "index.html",
  "package.json",
];
const TEXT_EXTENSIONS = new Set([".css", ".csv", ".html", ".js", ".json", ".md", ".mjs", ".ts", ".tsx", ".txt", ".yaml", ".yml"]);
const EXCLUDED_DIRECTORIES = new Set(["coverage", "dist", "node_modules", "test-results"]);
const EXCLUDED_FILES = new Set(["docs/RELEASING.md"]);
const HAN = /[\u3400-\u9fff]/u;

function extension(path) {
  const dot = path.lastIndexOf(".");
  return dot >= 0 ? path.slice(dot) : "";
}

function collect(path, output) {
  if (EXCLUDED_FILES.has(relative(ROOT, path))) return;
  const stats = statSync(path);
  if (stats.isDirectory()) {
    for (const entry of readdirSync(path)) {
      if (!EXCLUDED_DIRECTORIES.has(entry)) collect(join(path, entry), output);
    }
    return;
  }
  if (TEXT_EXTENSIONS.has(extension(path))) output.push(path);
}

test("all shipped ClaimTrace text artifacts are English-only", () => {
  const files = [];
  for (const target of TARGETS) collect(resolve(ROOT, target), files);
  const failures = files.flatMap((file) => {
    const text = readFileSync(file, "utf8");
    if (!HAN.test(text)) return [];
    const lines = text.split(/\r?\n/u);
    const line = lines.findIndex((value) => HAN.test(value)) + 1;
    return [`${relative(ROOT, file)}:${line}`];
  });
  assert.deepEqual(failures, [], `Non-English text found in:\n${failures.join("\n")}`);
});
