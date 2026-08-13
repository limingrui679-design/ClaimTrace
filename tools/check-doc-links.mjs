import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const rootGuides = ["README.md", "CONTRIBUTING.md", "DEVELOPMENT.md"];

async function markdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await markdownFiles(absolute));
    else if (entry.isFile() && entry.name.endsWith(".md")) files.push(absolute);
  }
  return files;
}

function localTarget(raw) {
  const trimmed = raw.trim();
  const value = trimmed.startsWith("<")
    ? trimmed.slice(1, trimmed.indexOf(">"))
    : trimmed.split(/\s+["']/u, 1)[0];
  if (!value || value.startsWith("#") || value.startsWith("//") || /^[a-z][a-z0-9+.-]*:/iu.test(value)) return null;
  const withoutFragment = value.split("#", 1)[0].split("?", 1)[0];
  return withoutFragment ? decodeURIComponent(withoutFragment) : null;
}

function references(markdown) {
  const withoutFences = markdown.replace(/```[\s\S]*?```/gu, "");
  const found = [];
  for (const match of withoutFences.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/gu)) found.push(match[1]);
  for (const match of withoutFences.matchAll(/(?:href|src)="([^"]+)"/gu)) found.push(match[1]);
  return found;
}

const files = [
  ...rootGuides.map((file) => path.join(root, file)),
  ...await markdownFiles(path.join(root, "docs")),
];

const failures = [];
let checked = 0;
for (const file of files) {
  const markdown = await readFile(file, "utf8");
  for (const raw of references(markdown)) {
    const target = localTarget(raw);
    if (!target) continue;
    checked += 1;
    const absolute = target.startsWith("/")
      ? path.join(root, target.slice(1))
      : path.resolve(path.dirname(file), target);
    try {
      await access(absolute);
    } catch {
      failures.push(`${path.relative(root, file)} -> ${raw}`);
    }
  }
}

if (failures.length) {
  console.error(`Broken local documentation references (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Checked ${checked} local references across ${files.length} documentation files.`);
}
