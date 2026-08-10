import type { Rule, ThresholdSpec } from "../types";

export function thresholdSpecForRule(rule: Rule): ThresholdSpec | undefined {
  if (rule.type === "threshold") return rule.thresholdSpec;
  if (rule.type === "stability") return rule.supportToleranceSpec;
  return undefined;
}

export function reversalThresholdSpecForRule(rule: Rule): ThresholdSpec | undefined {
  return rule.type === "stability" ? rule.reversalThresholdSpec : undefined;
}

export function absoluteThresholdSpecForRule(rule: Rule): ThresholdSpec | undefined {
  return rule.type === "stability" ? rule.absoluteToleranceSpec : undefined;
}

export function isThresholdConfirmed(spec: ThresholdSpec | undefined) {
  return Boolean(spec?.source.trim() && spec?.rationale.trim() && spec?.confirmedBy?.trim() && spec?.confirmedAt && Number.isFinite(Date.parse(spec.confirmedAt)));
}

export function ruleIsPreliminary(rule: Rule) {
  if (rule.type === "rank") return false;
  return !isThresholdConfirmed(thresholdSpecForRule(rule));
}

export function stabilityReversalIsGoverned(rule: Extract<Rule, { type: "stability" }>) {
  if (rule.reversalThreshold === undefined) return false;
  const spec = reversalThresholdSpecForRule(rule);
  return isThresholdConfirmed(spec)
    && Math.abs((spec?.value ?? Number.NaN) - rule.reversalThreshold) < 1e-9
    && rule.reversalThreshold > rule.supportTolerance;
}
