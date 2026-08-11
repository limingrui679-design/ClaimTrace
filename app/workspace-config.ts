import {
  RULE_ENGINE_VERSION,
  type Aggregation,
  type Claim,
  type ClaimStatus,
  type DecisionSpec,
  recomputeClaim,
} from "./claimtrace-core";
import { POPULATION_HEALTH_CASE } from "../src/cases";
import { DEMO_DATASET } from "./demo-case.generated";

export type View = "overview" | "data" | "claims" | "decision" | "review" | "report";

export const READ_ONLY_DEMO = import.meta.env.VITE_PUBLIC_READ_ONLY === "true";
export const CLAIMTRACE_VERSION = import.meta.env.VITE_CLAIMTRACE_VERSION || "development";
export const CLAIMTRACE_COMMIT = import.meta.env.VITE_CLAIMTRACE_COMMIT || "local-unbound";

export const DEMO_AUDIT_AT = POPULATION_HEALTH_CASE.expectedGeneratedAt;
const DEMO_CLAIM_SEEDS: Claim[] = POPULATION_HEALTH_CASE.claims.map((definition) => ({
  ...definition,
  kind: definition.rule.type === "stability" ? "VERSION_COMPARISON" : "SNAPSHOT",
  status: "REVIEW_REQUIRED",
  baselineStatus: "UNTESTABLE",
  baselineValue: "Computing",
  currentValue: "Computing",
  reason: "",
  action: "",
  sourceRefs: [],
  evidence: [],
  governance: { engineStatus: "REVIEW_REQUIRED", reviewDisposition: "PENDING", releaseStatus: "BLOCKED" },
  audit: {
    ruleVersion: RULE_ENGINE_VERSION,
    lastRunAt: DEMO_AUDIT_AT,
    baselineSha256: DEMO_DATASET.baselineMeta.sha256,
    currentSha256: DEMO_DATASET.currentMeta?.sha256,
    preliminary: false,
  },
}));

export const DEMO_CLAIMS = DEMO_CLAIM_SEEDS.map((claim) => recomputeClaim(claim, DEMO_DATASET, DEMO_AUDIT_AT));
export const DEMO_DECISIONS: DecisionSpec[] = POPULATION_HEALTH_CASE.decisions;
export { DEMO_DATASET };

export const NAV_ITEMS: Array<{ id: View; label: string; mobileLabel: string; short: string }> = [
  { id: "overview", label: "Project Audit", mobileLabel: "Project", short: "◇" },
  { id: "data", label: "Data Versions", mobileLabel: "Data", short: "≋" },
  { id: "claims", label: "Claim Rules", mobileLabel: "Claims", short: "◎" },
  { id: "decision", label: "Decision Impact", mobileLabel: "Decision", short: "↗" },
  { id: "review", label: "Human Review", mobileLabel: "Review", short: "✓" },
  { id: "report", label: "Audit Export", mobileLabel: "Export", short: "↓" },
];

export const STATUS_META: Record<ClaimStatus, { label: string; className: string; symbol: string }> = {
  SUPPORTED: { label: "Supported", className: "status-valid", symbol: "✓" },
  WEAKENED: { label: "Weakened", className: "status-weakened", symbol: "△" },
  REVERSED: { label: "Reversed", className: "status-invalid", symbol: "×" },
  UNTESTABLE: { label: "Untestable", className: "status-untestable", symbol: "–" },
  REVIEW_REQUIRED: { label: "Review required", className: "status-review", symbol: "?" },
};

export const AGGREGATION_LABELS: Record<Aggregation, string> = {
  average: "Average",
  sum: "Sum",
  min: "Minimum",
  max: "Maximum",
  count: "Count",
};

export function percent(part: number, total: number) {
  return total ? Math.round((part / total) * 100) : 0;
}
