import type { CaseDefinition } from "../core";
import { BUSINESS_OPERATIONS_CASE } from "./business-operations/case";
import { FINANCIAL_RISK_CASE } from "./financial-risk/case";
import { POPULATION_HEALTH_CASE } from "./population-health/case";
import { PUBLIC_POLICY_CASE } from "./public-policy/case";
import { SPATIAL_PLANNING_CASE } from "./spatial-planning/case";
import { WORLD_BANK_LIFE_EXPECTANCY_CASE } from "./world-bank-life-expectancy/case";

export * from "./types";
export * from "./runtime";
export * from "./business-operations/case";
export * from "./financial-risk/case";
export * from "./population-health/case";
export * from "./public-policy/case";
export * from "./spatial-planning/case";
export * from "./world-bank-life-expectancy/case";

export const EXECUTABLE_CASES = [BUSINESS_OPERATIONS_CASE, FINANCIAL_RISK_CASE, POPULATION_HEALTH_CASE, PUBLIC_POLICY_CASE, SPATIAL_PLANNING_CASE, WORLD_BANK_LIFE_EXPECTANCY_CASE];

export const CASE_CATALOG: CaseDefinition[] = [
  {
    id: "business-operations",
    domain: "business",
    title: "Business Operations: Channel Conversion and Service Capacity",
    question: "Should media spend and service capacity be reallocated after channel rankings change?",
    primaryKey: "channel_id",
    baselineFile: "/cases/business-operations/baseline.csv",
    currentFile: "/cases/business-operations/current.csv",
    claimCount: 3,
    decisionCount: 1,
    synthetic: true,
    dataCard: "docs/data-cards/business-operations.md",
    claimsFile: "/cases/business-operations/claims.json",
    decisionsFile: "/cases/business-operations/decisions.json",
    expectedAuditFile: "/cases/business-operations/expected-audit.json",
    readmeFile: "/cases/business-operations/README.md",
  },
  {
    id: "financial-risk",
    domain: "finance",
    title: "Financial Risk: Portfolio Risk and Admission Thresholds",
    question: "Can the original admission policy still be used after default probabilities and valid samples change?",
    primaryKey: "account_id",
    baselineFile: "/cases/financial-risk/baseline.csv",
    currentFile: "/cases/financial-risk/current.csv",
    claimCount: 3,
    decisionCount: 1,
    synthetic: true,
    dataCard: "docs/data-cards/financial-risk.md",
    claimsFile: "/cases/financial-risk/claims.json",
    decisionsFile: "/cases/financial-risk/decisions.json",
    expectedAuditFile: "/cases/financial-risk/expected-audit.json",
    readmeFile: "/cases/financial-risk/README.md",
  },
  {
    id: "population-health",
    domain: "health",
    title: "Population Health: Follow-Up Priorities and Model Gating",
    question: "Do revised risk and recall rates change the pilot decision or resource priorities?",
    primaryKey: "row_id",
    baselineFile: "/cases/population-health/baseline.csv",
    currentFile: "/cases/population-health/current.csv",
    claimCount: 5,
    decisionCount: 2,
    synthetic: true,
    dataCard: "docs/data-cards/population-health.md",
    claimsFile: "/cases/population-health/claims.json",
    decisionsFile: "/cases/population-health/decisions.json",
    expectedAuditFile: "/cases/population-health/expected-audit.json",
    readmeFile: "/cases/population-health/README.md",
  },
  {
    id: "public-policy",
    domain: "policy",
    title: "Public Policy: Program Coverage and Outcome Thresholds",
    question: "Does the scale-up recommendation remain supported when coverage is stable but the eligible population changes?",
    primaryKey: "district_id",
    baselineFile: "/cases/public-policy/baseline.csv",
    currentFile: "/cases/public-policy/current.csv",
    claimCount: 3,
    decisionCount: 1,
    synthetic: true,
    dataCard: "docs/data-cards/public-policy.md",
    claimsFile: "/cases/public-policy/claims.json",
    decisionsFile: "/cases/public-policy/decisions.json",
    expectedAuditFile: "/cases/public-policy/expected-audit.json",
    readmeFile: "/cases/public-policy/README.md",
  },
  {
    id: "spatial-planning",
    domain: "spatial",
    title: "Spatial Planning: Site Demand and Accessibility",
    question: "Should the candidate site change after demand-center and accessibility rankings shift?",
    primaryKey: "site_id",
    baselineFile: "/cases/spatial-planning/baseline.csv",
    currentFile: "/cases/spatial-planning/current.csv",
    claimCount: 3,
    decisionCount: 1,
    synthetic: true,
    dataCard: "docs/data-cards/spatial-planning.md",
    claimsFile: "/cases/spatial-planning/claims.json",
    decisionsFile: "/cases/spatial-planning/decisions.json",
    expectedAuditFile: "/cases/spatial-planning/expected-audit.json",
    readmeFile: "/cases/spatial-planning/README.md",
  },
  {
    id: "world-bank-life-expectancy",
    domain: "public-data",
    title: "Public Data: World Bank Life-Expectancy Version Audit",
    question: "Which descriptive claims and publication notes must change after the 2019 and 2024 indicator snapshots are compared?",
    primaryKey: "country_code",
    baselineFile: "/cases/world-bank-life-expectancy/baseline.csv",
    currentFile: "/cases/world-bank-life-expectancy/current.csv",
    claimCount: 3,
    decisionCount: 1,
    synthetic: false,
    sourceMetadataFile: "/cases/world-bank-life-expectancy/source-metadata.json",
    dataCard: "/cases/world-bank-life-expectancy/README.md",
    claimsFile: "/cases/world-bank-life-expectancy/claims.json",
    decisionsFile: "/cases/world-bank-life-expectancy/decisions.json",
    expectedAuditFile: "/cases/world-bank-life-expectancy/expected-audit.json",
    readmeFile: "/cases/world-bank-life-expectancy/README.md",
  },
];
