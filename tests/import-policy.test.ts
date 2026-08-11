import assert from "node:assert/strict";
import test from "node:test";
import { MAX_RAW_BYTES_PER_SNAPSHOT } from "../app/claimtrace-core";
import { MAX_LOCAL_CSV_BYTES, assertLocalCsvFileSize, assertSelfContainedExportSizes } from "../app/import-policy";

test("browser import and verified-export size boundaries are explicit", () => {
  assert.doesNotThrow(() => assertLocalCsvFileSize({ size: MAX_LOCAL_CSV_BYTES }));
  assert.throws(() => assertLocalCsvFileSize({ size: MAX_LOCAL_CSV_BYTES + 1 }), /limited to 10 MiB/);
  assert.throws(() => assertLocalCsvFileSize({ size: Number.NaN }), /file size is invalid/);
  assert.throws(() => assertLocalCsvFileSize({ size: -1 }), /file size is invalid/);
  assert.doesNotThrow(() => assertSelfContainedExportSizes([{ label: "Baseline", size: MAX_RAW_BYTES_PER_SNAPSHOT }]));
  assert.throws(
    () => assertSelfContainedExportSizes([{ label: "Baseline", size: MAX_RAW_BYTES_PER_SNAPSHOT + 1 }]),
    /Verified AuditBundle or HTML report generation requires.*Baseline \(500,001 bytes\).*detached raw-snapshot verification is not implemented/,
  );
});
