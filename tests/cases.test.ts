import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { computeEvidenceCompleteness, sha256Canonical, verifyEvidencePackage } from "../app/claimtrace-core";
import { EXECUTABLE_CASES, runExecutableCase } from "../src/cases";
import { rebuildExternalSnapshot } from "../src/core";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CASES = path.join(ROOT, "public", "cases");

for (const definition of EXECUTABLE_CASES) {
  test(`executable case ${definition.id} reproduces its claims, decisions, evidence, and manifest`, async () => {
    const directory = path.join(CASES, definition.id);
    const baselineText = await readFile(path.join(directory, "baseline.csv"), "utf8");
    const currentText = await readFile(path.join(directory, "current.csv"), "utf8");
    const committedClaims = JSON.parse(await readFile(path.join(directory, "claims.json"), "utf8"));
    const committedDecisions = JSON.parse(await readFile(path.join(directory, "decisions.json"), "utf8"));
    const expected = JSON.parse(await readFile(path.join(directory, "expected-audit.json"), "utf8"));
    const evidence = JSON.parse(await readFile(path.join(directory, "evidence-package.json"), "utf8"));
    const manifest = JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8"));
    assert.deepEqual(committedClaims, definition.claims);
    assert.deepEqual(committedDecisions, definition.decisions);

    const upstreamLineage = definition.upstreamLineageFile
      ? JSON.parse(await readFile(path.join(ROOT, "public", definition.upstreamLineageFile.replace(/^\//, "")), "utf8"))
      : undefined;
    const externalSource = definition.sourceMetadataFile
      ? JSON.parse(await readFile(path.join(ROOT, "public", definition.sourceMetadataFile.replace(/^\//, "")), "utf8"))
      : undefined;
    const run = await runExecutableCase(definition, baselineText, currentText, upstreamLineage, externalSource);
    const projection = {
      schemaVersion: "claimtrace-case-audit/1.0.0",
      caseId: definition.id,
      generatedAt: definition.expectedGeneratedAt,
      claims: run.claims.map((claim) => ({ id: claim.id, kind: claim.kind, baselineStatus: claim.baselineStatus, status: claim.status, baselineValue: claim.baselineValue, currentValue: claim.currentValue, evidenceCompleteness: computeEvidenceCompleteness(claim, run.dataset) })),
      decisions: run.decisions.map((decision) => ({ decisionId: decision.decisionId, previousOutcome: decision.previousOutcome, currentOutcome: decision.currentOutcome, status: decision.status, recommendedOptionId: decision.analysis?.recommendedOptionId ?? null })),
    };
    assert.deepEqual(projection, expected);
    assert.deepEqual(run.evidencePackage, evidence);
    assert.equal((await verifyEvidencePackage(evidence)).valid, true);
    assert.equal(manifest.claimCount, definition.claims.length);
    assert.equal(manifest.decisionCount, definition.decisions.length);
    for (const [name, metadata] of Object.entries(manifest.files) as Array<[string, { sha256: string; bytes: number }]>) {
      const content = await readFile(path.join(directory, name));
      assert.equal(content.byteLength, metadata.bytes, name);
      assert.equal(createHash("sha256").update(content).digest("hex"), metadata.sha256, name);
    }
  });
}

for (const definition of EXECUTABLE_CASES.filter((item) => item.dataOrigin === "PUBLIC")) {
  test(`${definition.id} rejects rehashed raw-source or cleaning-parameter tampering`, async () => {
    const bundle = JSON.parse(await readFile(path.join(CASES, definition.id, "evidence-package.json"), "utf8"));
    assert.equal((await verifyEvidencePackage(bundle)).valid, true);
    for (const mutate of [
      (copy: typeof bundle) => { copy.externalSource.rawArtifacts[0].text += " "; },
      (copy: typeof bundle) => { copy.externalSource.cleaning.parameters.decimalPlaces += 1; },
    ]) {
      const copy = structuredClone(bundle);
      mutate(copy);
      copy.integrity.sectionHashes.provenance = await sha256Canonical(copy.externalSource);
      const payload = Object.fromEntries(Object.entries(copy).filter(([key]) => key !== "integrity"));
      copy.integrity.payloadHash = await sha256Canonical(payload);
      const verification = await verifyEvidencePackage(copy);
      assert.equal(verification.valid, false);
      assert.equal(verification.checks.find((check: { name: string }) => check.name === "external-source-lineage")?.passed, false);
    }
  });
}

test("publisher-reported update dates remain bound after a full bundle rehash", async () => {
  for (const caseId of ["world-bank-life-expectancy", "usdot-transit-operations", "us-treasury-yield-curve"]) {
    const bundle = JSON.parse(await readFile(path.join(CASES, caseId, "evidence-package.json"), "utf8"));
    for (const sourceLastUpdated of ["not-a-date", "2000-01-01"]) {
      const copy = structuredClone(bundle);
      copy.externalSource.sourceLastUpdated = sourceLastUpdated;
      copy.integrity.sectionHashes.provenance = await sha256Canonical(copy.externalSource);
      const payload = Object.fromEntries(Object.entries(copy).filter(([key]) => key !== "integrity"));
      copy.integrity.payloadHash = await sha256Canonical(payload);
      const verification = await verifyEvidencePackage(copy);
      assert.equal(verification.valid, false, `${caseId}:${sourceLastUpdated}`);
      assert.equal(verification.checks.find((check: { name: string }) => check.name === "external-source-lineage")?.passed, false);
    }
  }

  const treasury = JSON.parse(await readFile(path.join(CASES, "us-treasury-yield-curve", "evidence-package.json"), "utf8"));
  for (const replacement of ["2026-02-31T15:47:41Z", "2026-08-09T15:47:41Z"]) {
    const copy = structuredClone(treasury);
    const artifact = copy.externalSource.rawArtifacts.find((item: { side: string }) => item.side === "baseline");
    artifact.text = artifact.text.replace(/<updated>[^<]+<\/updated>/, `<updated>${replacement}</updated>`);
    artifact.sha256 = createHash("sha256").update(artifact.text).digest("hex");
    copy.integrity.sectionHashes.provenance = await sha256Canonical(copy.externalSource);
    const payload = Object.fromEntries(Object.entries(copy).filter(([key]) => key !== "integrity"));
    copy.integrity.payloadHash = await sha256Canonical(payload);
    const verification = await verifyEvidencePackage(copy);
    assert.equal(verification.valid, false, replacement);
    assert.equal(verification.checks.find((check: { name: string }) => check.name === "external-source-lineage")?.passed, false);
  }
});

test("USDOT publisher metadata identity, timestamp, and hash remain independently bound", async () => {
  const bundle = JSON.parse(await readFile(path.join(CASES, "usdot-transit-operations", "evidence-package.json"), "utf8"));
  for (const mutate of [
    (copy: typeof bundle) => { copy.externalSource.sourceLastUpdatedEvidence.text = copy.externalSource.sourceLastUpdatedEvidence.text.replace(/"id"\s*:\s*"5ti2-5uiv"/, '"id":"wrong-id"'); },
    (copy: typeof bundle) => { copy.externalSource.sourceLastUpdatedEvidence.text = copy.externalSource.sourceLastUpdatedEvidence.text.replace(/"rowsUpdatedAt"\s*:\s*\d+/, '"rowsUpdatedAt":0'); },
  ]) {
    const copy = structuredClone(bundle);
    mutate(copy);
    copy.externalSource.sourceLastUpdatedEvidence.sha256 = createHash("sha256").update(copy.externalSource.sourceLastUpdatedEvidence.text).digest("hex");
    copy.integrity.sectionHashes.provenance = await sha256Canonical(copy.externalSource);
    const payload = Object.fromEntries(Object.entries(copy).filter(([key]) => key !== "integrity"));
    copy.integrity.payloadHash = await sha256Canonical(payload);
    const verification = await verifyEvidencePackage(copy);
    assert.equal(verification.valid, false);
    assert.equal(verification.checks.find((check: { name: string }) => check.name === "external-source-lineage")?.passed, false);
  }
});

test("external cleaners reject invalid parameters and source-type bindings without throwing", async () => {
  const worldBank = JSON.parse(await readFile(path.join(CASES, "world-bank-life-expectancy", "source-metadata.json"), "utf8"));
  worldBank.cleaning.parameters.decimalPlaces = 101;
  const worldBankResult = rebuildExternalSnapshot(worldBank, "baseline");
  assert.match(worldBankResult.errors.join("; "), /decimalPlaces must be an integer from 0 to 20/);

  const cfpb = JSON.parse(await readFile(path.join(CASES, "cfpb-credit-card-complaints", "source-metadata.json"), "utf8"));
  cfpb.cleaning.parameters.topIssues = 0;
  const cfpbResult = rebuildExternalSnapshot(cfpb, "baseline");
  assert.match(cfpbResult.errors.join("; "), /topIssues must be an integer from 1 to 1000/);

  const unexplainedDateGap = JSON.parse(await readFile(path.join(CASES, "cfpb-credit-card-complaints", "source-metadata.json"), "utf8"));
  delete unexplainedDateGap.sourceLastUpdatedNotReportedReason;
  const unexplainedDateGapResult = rebuildExternalSnapshot(unexplainedDateGap, "baseline");
  assert.match(unexplainedDateGapResult.errors.join("; "), /requires a not-reported reason/);

  const mislabeled = structuredClone(worldBank);
  mislabeled.sourceType = "US_TREASURY_YIELD_CURVE_XML_V1";
  const mislabeledResult = rebuildExternalSnapshot(mislabeled, "baseline");
  assert.equal(mislabeledResult.text, null);
  assert.match(mislabeledResult.errors.join("; "), /must use cleaning implementation treasury-yield-curve-v1/);
});

test("AuditBundle verification isolates malformed upstream and external lineage structures", async () => {
  const externalBundle = JSON.parse(await readFile(path.join(CASES, "world-bank-life-expectancy", "evidence-package.json"), "utf8"));
  externalBundle.externalSource.cleaning = null;
  externalBundle.integrity.sectionHashes.provenance = await sha256Canonical(externalBundle.externalSource);
  const externalPayload = Object.fromEntries(Object.entries(externalBundle).filter(([key]) => key !== "integrity"));
  externalBundle.integrity.payloadHash = await sha256Canonical(externalPayload);
  const externalVerification = await verifyEvidencePackage(externalBundle);
  const externalChecks = externalVerification.checks.filter((check: { name: string }) => ["derived-recomputation", "upstream-lineage", "external-source-lineage"].includes(check.name));
  assert.deepEqual(externalChecks.map((check: { name: string }) => check.name), ["derived-recomputation", "upstream-lineage", "external-source-lineage"]);
  assert.equal(externalChecks[0].passed, true);
  assert.equal(externalChecks[1].passed, true);
  assert.equal(externalChecks[2].passed, false);
  assert.match(externalChecks[2].errors.join("; "), /External-source structure is invalid/);

  const mislabeledBundle = JSON.parse(await readFile(path.join(CASES, "world-bank-life-expectancy", "evidence-package.json"), "utf8"));
  mislabeledBundle.externalSource.sourceType = "US_TREASURY_YIELD_CURVE_XML_V1";
  mislabeledBundle.integrity.sectionHashes.provenance = await sha256Canonical(mislabeledBundle.externalSource);
  const mislabeledPayload = Object.fromEntries(Object.entries(mislabeledBundle).filter(([key]) => key !== "integrity"));
  mislabeledBundle.integrity.payloadHash = await sha256Canonical(mislabeledPayload);
  const mislabeledVerification = await verifyEvidencePackage(mislabeledBundle);
  const mislabeledCheck = mislabeledVerification.checks.find((check: { name: string }) => check.name === "external-source-lineage");
  assert.equal(mislabeledCheck?.passed, false);
  assert.match(mislabeledCheck?.errors.join("; ") ?? "", /must use cleaning implementation treasury-yield-curve-v1/);

  const upstreamBundle = JSON.parse(await readFile(path.join(CASES, "population-health", "evidence-package.json"), "utf8"));
  upstreamBundle.upstreamLineage.aggregations[0].filters = null;
  upstreamBundle.integrity.sectionHashes.upstream = await sha256Canonical(upstreamBundle.upstreamLineage);
  const upstreamPayload = Object.fromEntries(Object.entries(upstreamBundle).filter(([key]) => key !== "integrity"));
  upstreamBundle.integrity.payloadHash = await sha256Canonical(upstreamPayload);
  const upstreamVerification = await verifyEvidencePackage(upstreamBundle);
  const upstreamChecks = upstreamVerification.checks.filter((check: { name: string }) => ["derived-recomputation", "upstream-lineage", "external-source-lineage"].includes(check.name));
  assert.deepEqual(upstreamChecks.map((check: { name: string }) => check.name), ["derived-recomputation", "upstream-lineage", "external-source-lineage"]);
  assert.equal(upstreamChecks[0].passed, true);
  assert.equal(upstreamChecks[1].passed, false);
  assert.equal(upstreamChecks[2].passed, true);
  assert.match(upstreamChecks[1].errors.join("; "), /Upstream-lineage structure is invalid/);
});

test("population-health upstream lineage rejects rehashed aggregation and raw-source tampering", async () => {
  const bundle = JSON.parse(await readFile(path.join(CASES, "population-health", "evidence-package.json"), "utf8"));
  assert.equal((await verifyEvidencePackage(bundle)).valid, true);

  for (const mutate of [
    (copy: typeof bundle) => { copy.upstreamLineage.aggregations[0].sourceRowCount += 1; },
    (copy: typeof bundle) => { copy.upstreamLineage.sources[0].rawText = copy.upstreamLineage.sources[0].rawText.replace(",1,", ",0,"); },
  ]) {
    const copy = structuredClone(bundle);
    mutate(copy);
    copy.integrity.sectionHashes.upstream = await sha256Canonical(copy.upstreamLineage);
    const payload = Object.fromEntries(Object.entries(copy).filter(([key]) => key !== "integrity"));
    copy.integrity.payloadHash = await sha256Canonical(payload);
    const verification = await verifyEvidencePackage(copy);
    assert.equal(verification.valid, false);
    assert.equal(verification.checks.find((check: { name: string }) => check.name === "upstream-lineage")?.passed, false);
  }
});
