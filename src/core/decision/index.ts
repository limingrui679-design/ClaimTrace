import type {
  Claim,
  DecisionAnalysis,
  DecisionBinding,
  DecisionConstraint,
  DecisionOption,
  DecisionOutcome,
  DecisionResult,
  DecisionScenario,
  DecisionSpec,
  DecisionStatus,
  SignedDecisionResult,
} from "../types";
import { hashDecisionActionIdentitySync, hashDecisionInputProvenanceSync, hashDecisionPolicySync, sha256CanonicalSync } from "../integrity";

function claimGateOutcome(decision: DecisionSpec, claims: Claim[]): DecisionOutcome {
  let requiresReview = false;
  for (const condition of decision.conditions) {
    const claim = claims.find((candidate) => candidate.id === condition.claimId);
    if (!claim) return "REVIEW";
    if (["UNTESTABLE", "REVIEW_REQUIRED"].includes(claim.status)) requiresReview = true;
    else if (!condition.allowedStatuses.includes(claim.status)) return "HOLD";
  }
  return requiresReview ? "REVIEW" : "PASS";
}

function adjustedMetric(option: DecisionOption, metric: DecisionConstraint["metric"], scenario?: DecisionScenario) {
  if (metric === "cost") return option.cost * (scenario?.costMultiplier ?? 1);
  if (metric === "risk") return option.risk * (scenario?.riskMultiplier ?? 1);
  return option.capacity * (scenario?.capacityMultiplier ?? 1);
}

function satisfies(value: number, constraint: DecisionConstraint) {
  return constraint.operator === "<=" ? value <= constraint.value : value >= constraint.value;
}

function scoreOption(option: DecisionOption, decision: DecisionSpec, scenario?: DecisionScenario) {
  const weights = decision.objective ?? { benefitWeight: 1, costWeight: 1, riskWeight: 1 };
  const benefit = option.benefit * (scenario?.benefitMultiplier ?? 1);
  const cost = option.cost * (scenario?.costMultiplier ?? 1);
  const risk = option.risk * (scenario?.riskMultiplier ?? 1);
  return benefit * weights.benefitWeight - cost * weights.costWeight - risk * weights.riskWeight;
}

function optionResults(decision: DecisionSpec, scenario?: DecisionScenario) {
  return (decision.options ?? []).map((option) => {
    const failedConstraints = (decision.constraints ?? [])
      .filter((constraint) => !satisfies(adjustedMetric(option, constraint.metric, scenario), constraint))
      .map((constraint) => constraint.id);
    const adjustedRisk = adjustedMetric(option, "risk", scenario);
    if (decision.riskTolerance !== undefined && adjustedRisk > decision.riskTolerance) failedConstraints.push("risk-tolerance");
    return {
      optionId: option.id,
      label: option.label,
      feasible: failedConstraints.length === 0,
      score: Number(scoreOption(option, decision, scenario).toFixed(6)),
      failedConstraints,
    };
  }).sort((left, right) => Number(right.feasible) - Number(left.feasible) || right.score - left.score || left.optionId.localeCompare(right.optionId));
}

function recommendedOptionId(results: ReturnType<typeof optionResults>, noActionLoss?: number) {
  const best = results.find((option) => option.feasible);
  if (noActionLoss !== undefined && (!best || best.score < -noActionLoss)) return "NO_ACTION";
  return best?.optionId;
}

function round(value: number, digits = 6) {
  return Number(value.toFixed(digits));
}

function validRange(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length === 2 && value.every((item) => Number.isFinite(item)) && value[0] > 0 && value[0] <= value[1];
}

function validUncertainty(decision: DecisionSpec) {
  const uncertainty = decision.uncertainty;
  if (!uncertainty) return true;
  const sweep = uncertainty.stabilitySweep;
  return uncertainty.method === "BOUNDED_UNIFORM"
    && validRange(uncertainty.benefitMultiplier)
    && validRange(uncertainty.costMultiplier)
    && validRange(uncertainty.riskMultiplier)
    && validRange(uncertainty.capacityMultiplier)
    && Number.isInteger(uncertainty.trials)
    && uncertainty.trials >= 100
    && uncertainty.trials <= 10_000
    && nonEmptyString(uncertainty.seed)
    && (!sweep || (sweep.parameter === "benefitMultiplier" && Number.isFinite(sweep.min) && Number.isFinite(sweep.max) && Number.isFinite(sweep.step) && sweep.min > 0 && sweep.min <= 1 && sweep.max >= 1 && sweep.step > 0 && sweep.step <= sweep.max - sweep.min));
}

function paretoFrontier(decision: DecisionSpec, baseResults: ReturnType<typeof optionResults>) {
  const feasibleIds = new Set(baseResults.filter((result) => result.feasible).map((result) => result.optionId));
  const options = (decision.options ?? []).filter((option) => feasibleIds.has(option.id));
  return options.filter((candidate) => !options.some((other) => other.id !== candidate.id
    && other.benefit >= candidate.benefit
    && other.cost <= candidate.cost
    && other.risk <= candidate.risk
    && other.capacity <= candidate.capacity
    && (other.benefit > candidate.benefit || other.cost < candidate.cost || other.risk < candidate.risk || other.capacity < candidate.capacity)))
    .map((option) => option.id)
    .sort();
}

function breakEvenBenefit(option: DecisionOption, decision: DecisionSpec) {
  const weights = decision.objective ?? { benefitWeight: 1, costWeight: 1, riskWeight: 1 };
  if (!(weights.benefitWeight > 0)) return undefined;
  const alternativeScore = decision.noActionLoss === undefined ? 0 : -decision.noActionLoss;
  return round((alternativeScore + option.cost * weights.costWeight + option.risk * weights.riskWeight) / weights.benefitWeight);
}

function scoreInterval(option: DecisionOption, decision: DecisionSpec) {
  const uncertainty = decision.uncertainty;
  if (!uncertainty || !validUncertainty(decision)) {
    const score = round(scoreOption(option, decision));
    return { min: score, max: score };
  }
  const values: number[] = [];
  for (const benefitMultiplier of uncertainty.benefitMultiplier) {
    for (const costMultiplier of uncertainty.costMultiplier) {
      for (const riskMultiplier of uncertainty.riskMultiplier) {
        values.push(scoreOption(option, decision, { id: "interval-corner", label: "interval corner", benefitMultiplier, costMultiplier, riskMultiplier }));
      }
    }
  }
  return { min: round(Math.min(...values)), max: round(Math.max(...values)) };
}

function recommendationStability(decision: DecisionSpec, baseRecommendation?: string) {
  const configured = validUncertainty(decision) ? decision.uncertainty?.stabilitySweep : undefined;
  const sweep = configured ?? { parameter: "benefitMultiplier" as const, min: 0.5, max: 1.5, step: 0.05 };
  const multipliers = new Set<number>([round(sweep.min, 8), 1, round(sweep.max, 8)]);
  const stepCount = Math.ceil((sweep.max - sweep.min) / sweep.step);
  for (let index = 0; index <= stepCount; index += 1) {
    const value = round(sweep.min + index * sweep.step, 8);
    if (value <= sweep.max + 1e-8) multipliers.add(value);
  }
  const points: Array<{ multiplier: number; recommendation?: string }> = [];
  for (const value of [...multipliers].sort((left, right) => left - right)) {
    const results = optionResults(decision, { id: `stability-${value}`, label: `benefit x ${value}`, benefitMultiplier: value });
    points.push({ multiplier: value, recommendation: recommendedOptionId(results, decision.noActionLoss) });
  }
  const anchor = points.findIndex((point) => point.multiplier === 1);
  const target = points[anchor]?.recommendation ?? baseRecommendation;
  let start = anchor;
  let end = anchor;
  while (start > 0 && points[start - 1].recommendation === target) start -= 1;
  while (end < points.length - 1 && points[end + 1].recommendation === target) end += 1;
  return {
    parameter: "benefitMultiplier" as const,
    recommendedOptionId: target,
    min: points[start]?.multiplier ?? 1,
    max: points[end]?.multiplier ?? 1,
    step: sweep.step,
    evaluatedPoints: points.length,
  };
}

function seededRandom(seed: string) {
  let state = Number.parseInt(sha256CanonicalSync(seed).slice(0, 8), 16) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function quantile(values: number[], probability: number) {
  const sorted = [...values].sort((left, right) => left - right);
  if (!sorted.length) return 0;
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const weight = position - lower;
  return round(sorted[lower] * (1 - weight) + sorted[upper] * weight);
}

function monteCarlo(decision: DecisionSpec) {
  const uncertainty = decision.uncertainty;
  if (!uncertainty || !validUncertainty(decision)) return undefined;
  const random = seededRandom(`${decision.id}|${uncertainty.seed}`);
  const optionScores = new Map((decision.options ?? []).map((option) => [option.id, [] as number[]]));
  const optionFeasible = new Map((decision.options ?? []).map((option) => [option.id, 0]));
  const recommendations = new Map<string, number>();
  const sample = ([minimum, maximum]: [number, number]) => minimum + random() * (maximum - minimum);
  for (let trial = 0; trial < uncertainty.trials; trial += 1) {
    const scenario: DecisionScenario = {
      id: `mc-${trial}`,
      label: `Monte Carlo ${trial + 1}`,
      benefitMultiplier: sample(uncertainty.benefitMultiplier),
      costMultiplier: sample(uncertainty.costMultiplier),
      riskMultiplier: sample(uncertainty.riskMultiplier),
      capacityMultiplier: sample(uncertainty.capacityMultiplier),
    };
    const results = optionResults(decision, scenario);
    for (const result of results) {
      optionScores.get(result.optionId)?.push(result.score);
      if (result.feasible) optionFeasible.set(result.optionId, (optionFeasible.get(result.optionId) ?? 0) + 1);
    }
    const recommendation = recommendedOptionId(results, decision.noActionLoss) ?? "NO_FEASIBLE_OPTION";
    recommendations.set(recommendation, (recommendations.get(recommendation) ?? 0) + 1);
  }
  return {
    method: "DETERMINISTIC_SEEDED_BOUNDED_UNIFORM" as const,
    seed: uncertainty.seed,
    trials: uncertainty.trials,
    recommendationShares: [...recommendations.entries()].map(([optionId, count]) => ({ optionId, count, share: round(count / uncertainty.trials) })).sort((left, right) => right.count - left.count || left.optionId.localeCompare(right.optionId)),
    options: [...optionScores.entries()].map(([optionId, scores]) => ({ optionId, feasibilityRate: round((optionFeasible.get(optionId) ?? 0) / uncertainty.trials), scoreP05: quantile(scores, 0.05), scoreP50: quantile(scores, 0.5), scoreP95: quantile(scores, 0.95) })).sort((left, right) => left.optionId.localeCompare(right.optionId)),
  };
}

export function analyzeDecisionOptions(decision: DecisionSpec): DecisionAnalysis | undefined {
  if (!decision.options?.length) return undefined;
  const baseOptions = optionResults(decision);
  const frontier = paretoFrontier(decision, baseOptions);
  const frontierSet = new Set(frontier);
  const options = baseOptions.map((result) => {
    const option = decision.options?.find((candidate) => candidate.id === result.optionId);
    return {
      ...result,
      breakEvenBenefit: option ? breakEvenBenefit(option, decision) : undefined,
      scoreInterval: option ? scoreInterval(option, decision) : undefined,
      paretoEfficient: frontierSet.has(result.optionId),
    };
  });
  const defaultScenarios: DecisionScenario[] = [
    { id: "benefit-down-20", label: "Benefit down 20%", benefitMultiplier: 0.8 },
    { id: "cost-up-20", label: "Cost up 20%", costMultiplier: 1.2 },
    { id: "risk-up-20", label: "Risk up 20%", riskMultiplier: 1.2 },
  ];
  const scenarios = decision.scenarios?.length ? decision.scenarios : defaultScenarios;
  const recommendation = recommendedOptionId(options, decision.noActionLoss);
  return {
    options,
    recommendedOptionId: recommendation,
    noActionScore: decision.noActionLoss === undefined ? undefined : -decision.noActionLoss,
    sensitivity: scenarios.map((scenario) => ({
      scenarioId: scenario.id,
      label: scenario.label,
      recommendedOptionId: recommendedOptionId(optionResults(decision, scenario), decision.noActionLoss),
    })),
    paretoFrontierOptionIds: frontier,
    recommendationStability: recommendationStability(decision, recommendation),
    monteCarlo: monteCarlo(decision),
  };
}

function firstConsistent(values: Array<string | undefined>) {
  const present = [...new Set(values.filter((value): value is string => Boolean(value)))];
  return present.length === 1 ? present[0] : "";
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function actionId(decision: DecisionSpec, outcome: DecisionOutcome) {
  if (outcome === "PASS") return nonEmptyString(decision.passActionId) ? decision.passActionId : "";
  if (outcome === "HOLD") return nonEmptyString(decision.holdActionId) ? decision.holdActionId : "";
  return `review-required:${decision.id}`;
}

function currentBinding(decision: DecisionSpec, claims: Claim[], analysis: DecisionAnalysis | undefined, outcome: DecisionOutcome): DecisionBinding {
  const boundClaims = decision.conditions.map((condition) => claims.find((claim) => claim.id === condition.claimId));
  return {
    activeActionId: actionId(decision, outcome),
    actionIdentityHash: hashDecisionActionIdentitySync(decision, outcome),
    recommendedOptionId: analysis?.recommendedOptionId ?? null,
    feasibleOptionIds: (analysis?.options ?? []).filter((option) => option.feasible).map((option) => option.optionId).sort(),
    decisionPolicyHash: hashDecisionPolicySync(decision),
    decisionInputProvenanceHash: hashDecisionInputProvenanceSync(decision),
    baselineSha256: firstConsistent(boundClaims.map((claim) => claim?.audit.baselineSha256)),
    currentSha256: firstConsistent(boundClaims.map((claim) => claim?.audit.currentSha256)) || undefined,
    ruleVersion: firstConsistent(boundClaims.map((claim) => claim?.audit.ruleVersion)),
    claimResultIds: boundClaims.map((claim, index) => claim?.resultId ?? `missing:${decision.conditions[index].claimId}`).sort(),
  };
}

function completeSignedHistory(history: SignedDecisionResult) {
  const hash = /^[a-f0-9]{64}$/i;
  return Boolean(
    nonEmptyString(history.versionId)
    && nonEmptyString(history.signedBy)
    && Number.isFinite(Date.parse(history.signedAt))
    && nonEmptyString(history.ruleVersion)
    && nonEmptyString(history.activeActionId)
    && nonEmptyString(history.reviewRecordId)
    && hash.test(history.actionIdentityHash)
    && hash.test(history.reviewRecordHash)
    && hash.test(history.decisionPolicyHash)
    && hash.test(history.decisionInputProvenanceHash)
    && hash.test(history.baselineSha256)
    && (!history.currentSha256 || hash.test(history.currentSha256))
    && Array.isArray(history.feasibleOptionIds)
    && Array.isArray(history.claimResultIds)
    && history.claimResultIds.every(nonEmptyString)
    && history.historyBasis === "RECORDED_IDENTITY",
  );
}

function sameStringSet(left: string[], right: string[]) {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

const CHANGE_LABELS: Record<DecisionResult["changeReasons"][number], string> = {
  OUTCOME: "decision outcome",
  ACTION_IDENTITY: "active action identity",
  RECOMMENDED_OPTION: "recommended option",
  FEASIBLE_OPTIONS: "feasible option set",
  DECISION_POLICY: "decision policy",
  INPUT_PROVENANCE: "decision-input provenance",
  BASELINE_SNAPSHOT: "baseline data snapshot",
  CURRENT_SNAPSHOT: "current data snapshot",
  RULE_VERSION: "rule version",
  CLAIM_RESULTS: "bound claim results",
};

const ACTION_CHANGE_REASONS = new Set<DecisionResult["changeReasons"][number]>([
  "OUTCOME",
  "ACTION_IDENTITY",
  "RECOMMENDED_OPTION",
  "FEASIBLE_OPTIONS",
]);

export function evaluateDecision(decision: DecisionSpec, claims: Claim[]): DecisionResult {
  const analysis = analyzeDecisionOptions(decision);
  let currentOutcome = claimGateOutcome(decision, claims);
  if (currentOutcome === "PASS" && analysis && !analysis.recommendedOptionId) currentOutcome = "HOLD";

  const history = decision.priorSignedResult;
  const binding = currentBinding(decision, claims, analysis, currentOutcome);
  const previousOutcome = history?.outcome ?? null;
  const affectedClaimIds = decision.conditions
    .filter((condition) => {
      const claim = claims.find((candidate) => candidate.id === condition.claimId);
      return !claim || !condition.allowedStatuses.includes(claim.status);
    })
    .map((condition) => condition.claimId)
    .sort();
  const changeReasons: DecisionResult["changeReasons"] = [];

  if (history && completeSignedHistory(history)) {
    if (history.outcome !== currentOutcome) changeReasons.push("OUTCOME");
    if (history.activeActionId !== binding.activeActionId || history.actionIdentityHash !== binding.actionIdentityHash) changeReasons.push("ACTION_IDENTITY");
    if ((history.recommendedOptionId ?? null) !== binding.recommendedOptionId) changeReasons.push("RECOMMENDED_OPTION");
    if (!sameStringSet(history.feasibleOptionIds, binding.feasibleOptionIds)) changeReasons.push("FEASIBLE_OPTIONS");
    if (history.decisionPolicyHash !== binding.decisionPolicyHash) changeReasons.push("DECISION_POLICY");
    if (history.decisionInputProvenanceHash !== binding.decisionInputProvenanceHash) changeReasons.push("INPUT_PROVENANCE");
    if (history.baselineSha256 !== binding.baselineSha256) changeReasons.push("BASELINE_SNAPSHOT");
    if ((history.currentSha256 ?? "") !== (binding.currentSha256 ?? "")) changeReasons.push("CURRENT_SNAPSHOT");
    if (history.ruleVersion !== binding.ruleVersion) changeReasons.push("RULE_VERSION");
    if (!sameStringSet(history.claimResultIds, binding.claimResultIds)) changeReasons.push("CLAIM_RESULTS");
  }

  const base = {
    decisionId: decision.id,
    previousOutcome,
    previousVersionId: history?.versionId,
    previousRecommendedOptionId: history?.recommendedOptionId,
    currentOutcome,
    boundClaimIds: decision.conditions.map((condition) => condition.claimId).sort(),
    affectedClaimIds,
    comparisonBasis: history ? "RECORDED_SIGNED_IDENTITY" as const : "NO_HISTORY" as const,
    changeReasons,
    binding,
    analysis,
  };
  const finish = (status: DecisionStatus, reason: string): DecisionResult => {
    const resultWithoutId = {
      ...base,
      status,
      reason,
      governance: { engineStatus: status, reviewDisposition: "PENDING" as const, releaseStatus: "BLOCKED" as const },
    };
    return {
      ...resultWithoutId,
      resultId: `decision-result:${decision.id}:${sha256CanonicalSync(resultWithoutId).slice(0, 24)}`,
    };
  };

  const missingActionIdentity = !nonEmptyString(decision.passActionId)
    || !nonEmptyString(decision.holdActionId)
    || !nonEmptyString(decision.actionIfPass)
    || !nonEmptyString(decision.actionIfFail);
  if (missingActionIdentity) {
    return finish("REVIEW_REQUIRED", "The decision lacks stable PASS/HOLD action IDs or action instructions, so a signable action identity cannot be established.");
  }
  if (!validUncertainty(decision)) {
    return finish("REVIEW_REQUIRED", "The uncertainty configuration is invalid: multiplier ranges must be positive and ordered, trials must be an integer from 100 to 10,000, and the fixed seed and stability sweep must be complete.");
  }
  const provenance = decision.inputProvenance;
  const provenanceFields = provenance
    ? [provenance.source, provenance.version, provenance.rationale, provenance.units?.benefit, provenance.units?.cost, provenance.units?.risk, provenance.units?.capacity]
    : [];
  if (decision.options?.length && (provenanceFields.length !== 7 || provenanceFields.some((value) => !nonEmptyString(value)))) {
    return finish("REVIEW_REQUIRED", "The numerical decision options lack complete source, version, rationale, or benefit/cost/risk/capacity units. Trial calculations may be viewed but cannot be released.");
  }

  if (history && !completeSignedHistory(history)) {
    return finish("REVIEW_REQUIRED", "The recorded prior sign-off identity lacks the action identity, recommendation, feasible set, policy hash, input-provenance hash, snapshots, bound claims, or review-record hash, so it cannot establish whether the action changed.");
  }
  if (currentOutcome === "REVIEW") {
    return finish("REVIEW_REQUIRED", "At least one bound claim is untestable or awaiting review; there is no signable decision result.");
  }
  if (history && changeReasons.length) {
    const actionChanges = changeReasons.filter((reason) => ACTION_CHANGE_REASONS.has(reason));
    if (actionChanges.length) {
      if (previousOutcome !== currentOutcome) {
        const additional = actionChanges.filter((reason) => reason !== "OUTCOME").map((reason) => CHANGE_LABELS[reason]);
        const additionalText = additional.length ? `; ${additional.join(", ")} also changed` : "";
        return finish("DECISION_CHANGED", `The recorded prior signed version ${history.versionId} was ${previousOutcome}; the current outcome is ${currentOutcome}${additionalText}. The action identity changed and must be signed again.`);
      }
      const changed = actionChanges.map((reason) => CHANGE_LABELS[reason]).join(", ");
      return finish("DECISION_CHANGED", `The decision outcome remains ${currentOutcome}, but ${changed} differs from recorded prior signed version ${history.versionId}. The action identity changed and must be signed again.`);
    }
    const changed = changeReasons.map((reason) => CHANGE_LABELS[reason]).join(", ");
    return finish("RESIGN_REQUIRED", `The current outcome, recommendation, and feasible action set match recorded prior signed version ${history.versionId}, but ${changed} changed. The evidence identity must be signed again; this does not mean the action changed.`);
  }
  const recommendation = binding.recommendedOptionId ? ` Recommended option: ${binding.recommendedOptionId}.` : "";
  const historyNote = history ? "The action identity matches the recorded prior sign-off identity; this bundle does not prove that the prior AuditBundle exists." : "No prior signed decision is recorded, so no version-change classification is made.";
  return finish("SUPPORTED", `${currentOutcome === "PASS" ? decision.actionIfPass : decision.actionIfFail}${recommendation} ${historyNote}`);
}
