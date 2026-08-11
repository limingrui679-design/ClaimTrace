import {
  type Claim,
  type DatasetVersion,
  type DecisionSpec,
  type ReviewRecord,
  createEvidencePackage,
  recomputeClaim,
  verifyDataset,
  verifyEvidencePackage,
} from "../claimtrace-core";
import { assertSelfContainedExportSizes } from "../import-policy";

interface PrepareVerifiedBundleInput {
  dataset: DatasetVersion;
  claims: Claim[];
  decisionSpecs: DecisionSpec[];
  reviews: ReviewRecord[];
  previousBundleHash: string | null;
  generatedAt: string;
}

export async function prepareVerifiedBundle(input: PrepareVerifiedBundleInput) {
  assertSelfContainedExportSizes([
    { label: "Baseline", size: input.dataset.baselineMeta.byteSize },
    ...(input.dataset.currentMeta ? [{ label: "Current", size: input.dataset.currentMeta.byteSize }] : []),
  ]);
  const verifiedDataset = await verifyDataset(input.dataset, input.generatedAt);
  const verifiedClaims = input.claims.map((claim) => recomputeClaim(claim, verifiedDataset, input.generatedAt));
  const bundle = await createEvidencePackage(verifiedDataset, verifiedClaims, input.generatedAt, {
    decisionSpecs: input.decisionSpecs,
    reviews: input.reviews,
    previousBundleHash: input.previousBundleHash,
  });
  const verification = await verifyEvidencePackage(bundle);
  if (!verification.valid) {
    const failed = verification.checks.filter((check) => !check.passed).map((check) => check.name).join(", ");
    throw new Error(`AuditBundle independent verification failed: ${failed || "unknown check"}`);
  }
  return { bundle, verification, verifiedDataset };
}
