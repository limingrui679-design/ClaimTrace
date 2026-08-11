import {
  CSV_DIALECT_VERSION,
  NORMALIZED_ROWS_VERSION,
  SNAPSHOT_SCHEMA_VERSION,
  type CsvRow,
  type CsvValue,
  type DatasetVersion,
  type ParsedCSV,
  type PrimaryKeyValidation,
  type SnapshotManifest,
  type SnapshotMeta,
  type SnapshotSide,
  type SnapshotVerification,
} from "../types";

export function valueToNumber(value: CsvValue | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/[%,$¥，]/g, "");
  if (!cleaned || /^(na|n\/a|null|nan|missing|\.)$/i.test(cleaned)) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

export function decodeBuffer(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes.slice(3));
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le", { fatal: true }).decode(bytes.slice(2));
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be", { fatal: true }).decode(bytes.slice(2));
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("The file is not valid UTF-8, UTF-16LE, or UTF-16BE");
  }
}

export function detectEncoding(buffer: ArrayBuffer): "utf-8" | "utf-16le" | "utf-16be" {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return "utf-16le";
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return "utf-16be";
  return "utf-8";
}

export async function sha256Hex(buffer: ArrayBuffer) {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function sha256Text(text: string) {
  return sha256Hex(new TextEncoder().encode(text).buffer as ArrayBuffer);
}

export function bytesToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
  }
  return btoa(binary);
}

export function base64ToBuffer(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

export function parseCSV(text: string): ParsedCSV {
  const matrix: string[][] = [];
  const lineNumbers: number[] = [];
  let row: string[] = [];
  let cell = "";
  let state: "unquoted" | "quoted" | "after-quote" = "unquoted";
  let cellWasQuoted = false;
  let physicalLine = 1;
  let rowStartLine = 1;

  const finishCell = () => {
    row.push(cellWasQuoted ? cell : cell.trim());
    cell = "";
    cellWasQuoted = false;
    state = "unquoted";
  };

  const finishRow = () => {
    finishCell();
    if (row.some((entry) => entry.length > 0)) {
      matrix.push(row);
      lineNumbers.push(rowStartLine);
    }
    row = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (state === "quoted") {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        state = "after-quote";
      } else {
        cell += char;
        if (char === "\n" || char === "\r") {
          if (char === "\r" && next === "\n") {
            cell += next;
            index += 1;
          }
          physicalLine += 1;
        }
      }
      continue;
    }

    if (state === "after-quote") {
      if (char === ",") {
        finishCell();
      } else if (char === "\n" || char === "\r") {
        finishRow();
        if (char === "\r" && next === "\n") index += 1;
        physicalLine += 1;
        rowStartLine = physicalLine;
      } else {
        throw new Error(`Line ${physicalLine} contains an unexpected character after a closing quote`);
      }
      continue;
    }

    if (char === '"') {
      if (cell.length > 0) throw new Error(`Line ${physicalLine} contains a quote inside an unquoted field`);
      state = "quoted";
      cellWasQuoted = true;
    } else if (char === ",") {
      finishCell();
    } else if (char === "\n" || char === "\r") {
      finishRow();
      if (char === "\r" && next === "\n") index += 1;
      physicalLine += 1;
      rowStartLine = physicalLine;
    } else {
      cell += char;
    }
  }
  if (state === "quoted") throw new Error(`Line ${rowStartLine} contains an unclosed quote`);
  if (row.length || cell.length || cellWasQuoted) finishRow();
  if (matrix.length < 2) throw new Error("CSV requires a header and at least one data row");

  const columns = matrix[0].map((column) => column.replace(/^\uFEFF/, "").trim());
  if (columns.some((column) => !column)) throw new Error("CSV headers cannot contain blank field names");
  const duplicateColumns = columns.filter((column, index) => columns.indexOf(column) !== index);
  if (duplicateColumns.length) throw new Error(`CSV contains duplicate field names: ${Array.from(new Set(duplicateColumns)).join(", ")}`);

  const rows = matrix.slice(1).map((values, rowIndex) => {
    if (values.length > columns.length) {
      throw new Error(`Line ${lineNumbers[rowIndex + 1]} has ${values.length - columns.length} more fields than the header`);
    }
    const record: CsvRow = {};
    columns.forEach((column, columnIndex) => {
      record[column] = values[columnIndex] ?? "";
    });
    return record;
  });
  return { columns, rows, lineNumbers: lineNumbers.slice(1) };
}

export function validatePrimaryKey(rows: CsvRow[], lineNumbers: number[], primaryKey: string): PrimaryKeyValidation {
  const seen = new Set<string>();
  const duplicateSet = new Set<string>();
  const missingLines: number[] = [];
  rows.forEach((row, index) => {
    const raw = row[primaryKey];
    const key = raw === undefined || raw === null ? "" : String(raw).trim();
    if (!key) missingLines.push(lineNumbers[index] ?? index + 2);
    else if (seen.has(key)) duplicateSet.add(key);
    else seen.add(key);
  });
  return { valid: duplicateSet.size === 0 && missingLines.length === 0, duplicates: [...duplicateSet], missingLines };
}

export function uniqueKeyCandidates(columns: string[], rows: CsvRow[], lineNumbers: number[]) {
  return columns.filter((column) => validatePrimaryKey(rows, lineNumbers, column).valid);
}

export function sameColumnSet(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  const leftColumns = new Set(left);
  const rightColumns = new Set(right);
  return leftColumns.size === left.length
    && rightColumns.size === right.length
    && left.every((column) => rightColumns.has(column));
}

export function alignParsedCsvColumns(parsed: ParsedCSV, canonicalColumns: string[]): ParsedCSV {
  if (!sameColumnSet(canonicalColumns, parsed.columns)) {
    throw new Error("CSV columns do not match the required canonical column set");
  }
  return { ...parsed, columns: [...canonicalColumns] };
}

export function canonicalizeRows(columns: string[], rows: CsvRow[]) {
  return JSON.stringify(rows.map((row) => columns.map((column) => String(row[column] ?? ""))));
}

function dataForSide(dataset: DatasetVersion, side: SnapshotSide) {
  return side === "baseline"
    ? { rows: dataset.baselineRows, lines: dataset.baselineLineNumbers, meta: dataset.baselineMeta, rawText: dataset.baselineRawText, rawBytesBase64: dataset.baselineRawBytesBase64 }
    : { rows: dataset.currentRows ?? [], lines: dataset.currentLineNumbers ?? [], meta: dataset.currentMeta, rawText: dataset.currentRawText, rawBytesBase64: dataset.currentRawBytesBase64 };
}

export async function verifySnapshot(dataset: DatasetVersion, side: SnapshotSide, verifiedAt = new Date().toISOString()): Promise<SnapshotVerification> {
  const { rows, lines, meta, rawText, rawBytesBase64 } = dataForSide(dataset, side);
  const errors: string[] = [];
  if (!meta) return { status: "failed", errors: ["Snapshot metadata is missing"] };
  if (rawText === undefined && rawBytesBase64 === undefined) errors.push("The evidence bundle does not contain the raw CSV bytes, so the file hash cannot be recomputed");
  const recomputedSha256 = rawBytesBase64 !== undefined
    ? await sha256Hex(base64ToBuffer(rawBytesBase64))
    : rawText === undefined ? undefined : await sha256Text(rawText);
  const recomputedNormalizedSha256 = await sha256Text(canonicalizeRows(dataset.columns, rows));
  if (recomputedSha256 && recomputedSha256 !== meta.sha256) errors.push("Raw-file SHA-256 mismatch");
  if (meta.normalizedSha256 && recomputedNormalizedSha256 !== meta.normalizedSha256) errors.push("Normalized-record SHA-256 mismatch");
  if (meta.rowCount !== rows.length) errors.push("Row count does not match the manifest");
  if (lines.length !== rows.length) errors.push("Physical-line count does not match the row count");
  if (!validatePrimaryKey(rows, lines, dataset.primaryKey).valid) errors.push("Unique primary-key validation failed");
  return {
    status: errors.length ? "failed" : "verified",
    method: "raw-bytes+normalized-rows",
    verifiedAt,
    recomputedSha256,
    recomputedNormalizedSha256,
    errors: errors.length ? errors : undefined,
  };
}

export async function verifyDataset(dataset: DatasetVersion, verifiedAt = new Date().toISOString()): Promise<DatasetVersion> {
  const baselineVerification = await verifySnapshot(dataset, "baseline", verifiedAt);
  const currentVerification = dataset.currentRows ? await verifySnapshot(dataset, "current", verifiedAt) : undefined;
  const withVerification = (meta: SnapshotMeta, verification: SnapshotVerification): SnapshotMeta => ({
    ...meta,
    hashVerified: verification.status === "verified",
    verification,
  });
  return {
    ...dataset,
    baselineMeta: withVerification(dataset.baselineMeta, baselineVerification),
    currentMeta: dataset.currentMeta && currentVerification ? withVerification(dataset.currentMeta, currentVerification) : dataset.currentMeta,
  };
}

export function isSnapshotVerified(dataset: DatasetVersion, side: SnapshotSide) {
  const { rows, lines, meta } = dataForSide(dataset, side);
  if (!meta) return false;
  const verification = meta.verification;
  return verification?.status === "verified"
    && verification.recomputedSha256 === meta.sha256
    && (!meta.normalizedSha256 || verification.recomputedNormalizedSha256 === meta.normalizedSha256)
    && meta.rowCount === rows.length
    && lines.length === rows.length
    && validatePrimaryKey(rows, lines, dataset.primaryKey).valid;
}

export function buildSnapshotManifest(dataset: DatasetVersion, side: SnapshotSide): SnapshotManifest | null {
  const { meta } = dataForSide(dataset, side);
  if (!meta) return null;
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    csvDialectVersion: CSV_DIALECT_VERSION,
    normalizationVersion: NORMALIZED_ROWS_VERSION,
    snapshotId: `${side}-${meta.sha256.slice(0, 16)}`,
    side,
    fileName: meta.fileName,
    sha256: meta.sha256,
    normalizedSha256: meta.normalizedSha256,
    rowCount: meta.rowCount,
    byteSize: meta.byteSize,
    columns: dataset.columns,
    primaryKey: dataset.primaryKey,
    generatedAt: meta.generatedAt,
    verifiedAt: meta.verification?.verifiedAt,
    verificationStatus: meta.verification?.status ?? "unverified",
  };
}
