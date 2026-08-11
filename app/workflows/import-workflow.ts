import {
  type ParsedCSV,
  type SnapshotMeta,
  alignParsedCsvColumns,
  bytesToBase64,
  canonicalizeRows,
  decodeBuffer,
  detectEncoding,
  parseCSV,
  sha256Hex,
  sha256Text,
  validatePrimaryKey,
} from "../claimtrace-core";
import { assertLocalCsvFileSize } from "../import-policy";

export interface FileSnapshot extends ParsedCSV {
  meta: SnapshotMeta;
  rawText: string;
  rawBytesBase64: string;
}

export async function readCsvFile(file: File): Promise<FileSnapshot> {
  assertLocalCsvFileSize(file);
  const buffer = await file.arrayBuffer();
  const rawText = decodeBuffer(buffer);
  const parsed = parseCSV(rawText);
  const now = new Date().toISOString();
  const rawSha256 = await sha256Hex(buffer);
  const normalizedSha256 = await sha256Text(canonicalizeRows(parsed.columns, parsed.rows));
  return {
    ...parsed,
    rawText,
    rawBytesBase64: bytesToBase64(buffer),
    meta: {
      fileName: file.name,
      sha256: rawSha256,
      normalizedSha256,
      hashVerified: true,
      verification: {
        status: "verified",
        method: "raw-bytes+normalized-rows",
        verifiedAt: now,
        recomputedSha256: rawSha256,
        recomputedNormalizedSha256: normalizedSha256,
      },
      generatedAt: now,
      rowCount: parsed.rows.length,
      byteSize: buffer.byteLength,
      encoding: detectEncoding(buffer),
      mediaType: "text/csv",
    },
  };
}

export async function alignFileSnapshotColumns(snapshot: FileSnapshot, canonicalColumns: string[]): Promise<FileSnapshot> {
  const aligned = alignParsedCsvColumns(snapshot, canonicalColumns);
  const normalizedSha256 = await sha256Text(canonicalizeRows(canonicalColumns, aligned.rows));
  return {
    ...snapshot,
    ...aligned,
    meta: {
      ...snapshot.meta,
      normalizedSha256,
      verification: {
        ...snapshot.meta.verification,
        status: "verified",
        method: "raw-bytes+normalized-rows",
        recomputedSha256: snapshot.meta.sha256,
        recomputedNormalizedSha256: normalizedSha256,
      },
    },
  };
}

export function assertValidKey(snapshot: FileSnapshot, key: string, label: string) {
  const validation = validatePrimaryKey(snapshot.rows, snapshot.lineNumbers, key);
  if (validation.valid) return;
  const problems = [
    validation.duplicates.length ? `Duplicate values: ${validation.duplicates.slice(0, 5).join(", ")}` : "",
    validation.missingLines.length ? `Empty values on lines: ${validation.missingLines.slice(0, 5).join(", ")}` : "",
  ].filter(Boolean).join("; ");
  throw new Error(`${label} primary key ${key} is invalid (${problems})`);
}
