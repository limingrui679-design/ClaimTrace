import { MAX_RAW_BYTES_PER_SNAPSHOT } from "./claimtrace-core";

export const MAX_LOCAL_CSV_BYTES = 10 * 1024 * 1024;

export function assertLocalCsvFileSize(file: { size: number }) {
  if (!Number.isFinite(file.size) || file.size < 0) throw new Error("CSV file size is invalid.");
  if (file.size > MAX_LOCAL_CSV_BYTES) throw new Error("CSV files are limited to 10 MiB in the local browser workspace.");
}

export function assertSelfContainedExportSizes(snapshots: Array<{ label: string; size: number }>) {
  const oversized = snapshots.filter((snapshot) => snapshot.size > MAX_RAW_BYTES_PER_SNAPSHOT);
  if (!oversized.length) return;
  const details = oversized.map((snapshot) => `${snapshot.label} (${snapshot.size.toLocaleString("en-US")} bytes)`).join(", ");
  throw new Error(`Verified AuditBundle or HTML report generation requires each raw snapshot to be at most 500 KB. Oversized: ${details}. Larger files can still be analyzed, but detached raw-snapshot verification is not implemented.`);
}
