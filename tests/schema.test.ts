import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { CASE_CATALOG } from "../src/cases/index.ts";

const root = process.cwd();
const schemaFile = join(root, "schemas/claimtrace-audit-bundle-2.6.0.schema.json");

async function validator() {
  const schema = JSON.parse(await readFile(schemaFile, "utf8")) as object;
  const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
  addFormats(ajv);
  return ajv.compile(schema);
}

test("all ten generated AuditBundles satisfy the published structural schema", async () => {
  const validate = await validator();
  for (const item of CASE_CATALOG) {
    const file = join(root, "public", "cases", item.id, "evidence-package.json");
    const bundle = JSON.parse(await readFile(file, "utf8")) as unknown;
    assert.equal(validate(bundle), true, `${item.id}: ${JSON.stringify(validate.errors)}`);
  }
});

test("the structural schema rejects a missing integrity envelope", async () => {
  const validate = await validator();
  const file = join(root, "public/cases/cdc-places-depression/evidence-package.json");
  const bundle = JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
  delete bundle.integrity;
  assert.equal(validate(bundle), false);
  assert.ok(validate.errors?.some((error) => error.keyword === "required" && error.params.missingProperty === "integrity"));
});

test("the structural schema accepts a raw-bytes-only snapshot payload", async () => {
  const validate = await validator();
  const file = join(root, "public/cases/cdc-places-depression/evidence-package.json");
  const bundle = JSON.parse(await readFile(file, "utf8")) as {
    snapshotPayloads: { baseline: { text?: string; rawBytesBase64?: string } };
  };
  assert.ok(bundle.snapshotPayloads.baseline.rawBytesBase64);
  delete bundle.snapshotPayloads.baseline.text;
  assert.equal(validate(bundle), true, JSON.stringify(validate.errors));
});
