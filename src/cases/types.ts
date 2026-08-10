import { sha256CanonicalSync, type CsvValue, type DecisionInputProvenance, type DecisionSpec, type DecisionUncertainty, type Rule, type SignedDecisionResult } from "../core";

export interface CaseClaimDefinition {
  id: string;
  code: string;
  title: string;
  section: string;
  owner: string;
  category: string;
  formula: string;
  rule: Rule;
}

export interface ExecutableCaseDefinition {
  id: string;
  title: string;
  projectName: string;
  primaryKey: string;
  baselineFile: string;
  currentFile: string;
  claims: CaseClaimDefinition[];
  decisions: DecisionSpec[];
  expectedGeneratedAt: string;
  dataOrigin?: "SYNTHETIC" | "PUBLIC";
  sourceMetadataFile?: string;
  upstreamLineageFile?: string;
}

export function confirmedThreshold(value: number, unit: "percent" | "absolute" | "score" | "count", source: string, rationale: string) {
  return { value, unit, source, rationale, confirmedBy: "Synthetic case owner", confirmedAt: "2026-08-08T00:00:00.000Z" } as const;
}

export function filter(field: string, equals: CsvValue) {
  return { field, equals };
}

export function manualDecisionInputs(source: string, rationale: string): DecisionInputProvenance {
  return {
    kind: "MANUAL_ASSUMPTION",
    source,
    version: "1.0.0",
    rationale,
    units: {
      benefit: "synthetic utility points",
      cost: "synthetic cost points",
      risk: "synthetic risk points",
      capacity: "synthetic capacity points",
    },
    confirmedBy: "Synthetic case owner",
    confirmedAt: "2026-08-08T00:00:00.000Z",
  };
}

export function controlledUncertainty(seed: string): DecisionUncertainty {
  return {
    method: "BOUNDED_UNIFORM",
    benefitMultiplier: [0.8, 1.2],
    costMultiplier: [0.85, 1.2],
    riskMultiplier: [0.8, 1.25],
    capacityMultiplier: [0.9, 1.15],
    trials: 512,
    seed,
    stabilitySweep: { parameter: "benefitMultiplier", min: 0.5, max: 1.5, step: 0.05 },
  };
}

export function syntheticPriorDecision(input: {
  decisionId: string;
  versionId: string;
  outcome: SignedDecisionResult["outcome"];
  recommendedOptionId: string | null;
  feasibleOptionIds: string[];
  claimIds: string[];
  activeActionId: string;
  activeActionInstruction: string;
  signedAt: string;
  signedBy: string;
}): SignedDecisionResult {
  const reviewRecordId = `synthetic-prior-review:${input.decisionId}:${input.versionId}`;
  return {
    versionId: input.versionId,
    outcome: input.outcome,
    activeActionId: input.activeActionId,
    actionIdentityHash: sha256CanonicalSync({ id: input.activeActionId, instruction: input.activeActionInstruction }),
    recommendedOptionId: input.recommendedOptionId,
    feasibleOptionIds: [...input.feasibleOptionIds].sort(),
    decisionPolicyHash: sha256CanonicalSync({ fixture: "prior-decision-policy", decisionId: input.decisionId, versionId: input.versionId }),
    decisionInputProvenanceHash: sha256CanonicalSync({ fixture: "prior-decision-input-provenance", decisionId: input.decisionId, versionId: input.versionId }),
    baselineSha256: sha256CanonicalSync({ fixture: "prior-baseline", versionId: input.versionId }),
    currentSha256: sha256CanonicalSync({ fixture: "prior-current", versionId: input.versionId }),
    ruleVersion: "claimtrace-rule/4.0.0",
    claimResultIds: input.claimIds.map((claimId) => `prior-result:${input.versionId}:${claimId}`),
    historyBasis: "RECORDED_IDENTITY",
    reviewRecordId,
    reviewRecordHash: sha256CanonicalSync({ fixture: "prior-review", reviewRecordId, signedBy: input.signedBy, signedAt: input.signedAt }),
    signedAt: input.signedAt,
    signedBy: input.signedBy,
  };
}
