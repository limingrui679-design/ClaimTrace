export const MAX_LOCAL_CSV_BYTES = 10 * 1024 * 1024;

export function assertLocalCsvFileSize(file: { size: number }) {
  if (!Number.isFinite(file.size) || file.size < 0) throw new Error("CSV file size is invalid.");
  if (file.size > MAX_LOCAL_CSV_BYTES) throw new Error("CSV files are limited to 10 MiB in the local browser workspace.");
}
