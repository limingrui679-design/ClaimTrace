import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export async function writeReleaseChecksum(archivePath) {
  if (typeof archivePath !== "string" || !archivePath.trim()) {
    throw new Error("Usage: npm run release:checksum -- <archive.zip>");
  }

  const resolvedArchive = path.resolve(archivePath);
  const archiveStat = await lstat(resolvedArchive);
  if (!archiveStat.isFile()) throw new Error("Release archive must be a regular file");

  const hash = createHash("sha256");
  for await (const chunk of createReadStream(resolvedArchive)) hash.update(chunk);

  const digest = hash.digest("hex");
  const archiveName = path.basename(resolvedArchive);
  const sidecarPath = `${resolvedArchive}.sha256`;
  const line = `${digest}  ${archiveName}\n`;
  await writeFile(sidecarPath, line, "utf8");
  return { archiveName, digest, line, sidecarPath };
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  const result = await writeReleaseChecksum(process.argv[2]);
  process.stdout.write(`${result.sidecarPath}\n`);
}
