import assert from "node:assert/strict";
import test from "node:test";
import { MAX_LOCAL_CSV_BYTES, assertLocalCsvFileSize } from "../app/import-policy";

test("local CSV import rejects invalid or oversized files before reading their bytes", () => {
  assert.doesNotThrow(() => assertLocalCsvFileSize({ size: MAX_LOCAL_CSV_BYTES }));
  assert.throws(() => assertLocalCsvFileSize({ size: MAX_LOCAL_CSV_BYTES + 1 }), /limited to 10 MiB/);
  assert.throws(() => assertLocalCsvFileSize({ size: Number.NaN }), /file size is invalid/);
  assert.throws(() => assertLocalCsvFileSize({ size: -1 }), /file size is invalid/);
});
