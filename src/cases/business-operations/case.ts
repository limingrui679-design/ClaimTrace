import type { ExecutableCaseDefinition } from "../types";
import { confirmedThreshold, controlledUncertainty, manualDecisionInputs, syntheticPriorDecision } from "../types";

export const BUSINESS_OPERATIONS_CASE: ExecutableCaseDefinition = {
  id: "business-operations",
  title: "Business Operations: Channel Conversion and Service Capacity",
  projectName: "Synthetic Channel Resource-Allocation Audit",
  primaryKey: "channel_id",
  baselineFile: "/cases/business-operations/baseline.csv",
  currentFile: "/cases/business-operations/current.csv",
  expectedGeneratedAt: "2026-08-08T00:00:00.000Z",
  claims: [
    {
      id: "business-referral-rank", code: "BO-001", title: "Referral remains the highest-converting channel", section: "Channel strategy", owner: "Growth owner", category: "Channel ranking", formula: "argmax(channel, conversion_rate) = Referral",
      rule: { type: "rank", field: "conversion_rate", aggregation: "average", groupField: "channel", expectedGroup: "Referral", rank: "max", tiePolicy: "require_unique" },
    },
    {
      id: "business-service-gate", code: "BO-002", title: "Average ticket handling time does not exceed 12 hours", section: "Service capacity", owner: "Service owner", category: "Service threshold", formula: "mean(ticket_hours) <= 12",
      rule: { type: "threshold", field: "ticket_hours", aggregation: "average", operator: "<=", threshold: 12, thresholdSpec: confirmedThreshold(12, "absolute", "Synthetic service SLA v1", "Handling times above 12 hours trigger service-capacity expansion") },
    },
    {
      id: "business-lead-stability", code: "BO-003", title: "Serviceable lead volume remains within a 5% change", section: "Capacity planning", owner: "Operations owner", category: "Volume stability", formula: "abs(mean(eligible_leads_v2)-mean(eligible_leads_v1))/mean(v1) <= 5%",
      rule: { type: "stability", field: "eligible_leads", aggregation: "average", supportTolerance: 5, reversalThreshold: 12, supportToleranceSpec: confirmedThreshold(5, "percent", "Synthetic capacity plan v1", "Retain the current staffing plan within a 5% change"), reversalThresholdSpec: confirmedThreshold(12, "percent", "Synthetic capacity risk policy v1", "At 12%, the original capacity assumption is invalid") },
    },
  ],
  decisions: [{
    id: "business-channel-allocation", title: "How should next month's channel budget and service capacity be allocated?", owner: "Commercial operations lead", passActionId: "business:keep-referral-priority", holdActionId: "business:freeze-and-reallocate", actionIfPass: "Retain the Referral-first allocation.", actionIfFail: "Freeze the original budget ranking and reallocate using the revised results.",
    conditions: [{ claimId: "business-referral-rank", allowedStatuses: ["SUPPORTED"] }, { claimId: "business-service-gate", allowedStatuses: ["SUPPORTED", "WEAKENED"] }],
    priorSignedResult: syntheticPriorDecision({ decisionId: "business-channel-allocation", versionId: "business-v1", outcome: "PASS", activeActionId: "business:keep-referral-priority", activeActionInstruction: "Retain the Referral-first allocation.", recommendedOptionId: "keep-referral", feasibleOptionIds: ["keep-referral"], claimIds: ["business-referral-rank", "business-service-gate"], signedAt: "2026-08-01T08:00:00.000Z", signedBy: "Synthetic commercial owner" }),
    stakeholders: ["Growth team", "Customer service team", "Finance"], objective: { benefitWeight: 1, costWeight: 0.25, riskWeight: 1 }, riskTolerance: 22, noActionLoss: 35, inputProvenance: manualDecisionInputs("Synthetic commercial planning assumptions", "Used to demonstrate deterministic multi-option scoring; these are not observed business outcomes or real budgets"), uncertainty: controlledUncertainty("business-allocation-v1"),
    constraints: [{ id: "budget", label: "Budget ceiling", metric: "cost", operator: "<=", value: 65 }, { id: "capacity", label: "Service capacity", metric: "capacity", operator: "<=", value: 55 }],
    options: [{ id: "keep-referral", label: "Keep Referral first", benefit: 64, cost: 42, risk: 24, capacity: 40 }, { id: "shift-partner", label: "Shift to Partner", benefit: 86, cost: 54, risk: 16, capacity: 52 }, { id: "expand-all", label: "Expand all channels", benefit: 105, cost: 88, risk: 28, capacity: 76 }],
  }],
};

export default BUSINESS_OPERATIONS_CASE;
