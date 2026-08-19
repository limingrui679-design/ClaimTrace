export const RULE_ENGINE_VERSION = "claimtrace-rule/6.3.0";
export const EVIDENCE_SCHEMA_VERSION = "claimtrace-audit-bundle/2.6.0";
export const SNAPSHOT_SCHEMA_VERSION = "claimtrace-snapshot/1.1.0";
export const CSV_DIALECT_VERSION = "claimtrace-csv-strict/1.0.0";
export const NORMALIZED_ROWS_VERSION = "claimtrace-normalized-rows/1.0.0";

export type ClaimStatus =
  | "SUPPORTED"
  | "WEAKENED"
  | "REVERSED"
  | "UNTESTABLE"
  | "REVIEW_REQUIRED";
export type DecisionStatus = "SUPPORTED" | "DECISION_CHANGED" | "RESIGN_REQUIRED" | "REVIEW_REQUIRED";
export type CsvValue = string | number;
export type CsvRow = Record<string, CsvValue>;
export type Aggregation = "average" | "sum" | "min" | "max" | "count";
export type Operator = ">" | ">=" | "<" | "<=" | "=";
export type SnapshotSide = "baseline" | "current";
export type ClaimKind = "SNAPSHOT" | "VERSION_COMPARISON";
export type ReviewDisposition = "PENDING" | "APPROVED" | "RESIGNED" | "CHANGES_REQUESTED" | "RISK_ACCEPTED";
export type ReleaseStatus = "BLOCKED" | "INTERNAL_ONLY" | "APPROVED_FOR_USE" | "APPROVED_WITH_RISK";

export interface ParsedCSV {
  columns: string[];
  rows: CsvRow[];
  lineNumbers: number[];
}

export interface SnapshotVerification {
  status: "verified" | "unverified" | "failed";
  method?: "raw-bytes+normalized-rows";
  verifiedAt?: string;
  recomputedSha256?: string;
  recomputedNormalizedSha256?: string;
  errors?: string[];
}

export interface SnapshotMeta {
  fileName: string;
  sha256: string;
  normalizedSha256?: string;
  /** Compatibility flag. Integrity decisions use verification.status. */
  hashVerified: boolean;
  verification?: SnapshotVerification;
  generatedAt: string;
  rowCount: number;
  byteSize: number;
  encoding?: "utf-8" | "utf-16le" | "utf-16be";
  mediaType?: "text/csv";
}

export interface SnapshotManifest {
  schemaVersion: string;
  csvDialectVersion: typeof CSV_DIALECT_VERSION;
  normalizationVersion: typeof NORMALIZED_ROWS_VERSION;
  snapshotId: string;
  side: SnapshotSide;
  fileName: string;
  sha256: string;
  normalizedSha256?: string;
  rowCount: number;
  byteSize: number;
  columns: string[];
  primaryKey: string;
  generatedAt: string;
  verifiedAt?: string;
  verificationStatus: SnapshotVerification["status"];
}

export interface DatasetVersion {
  projectName: string;
  baselineName: string;
  currentName?: string;
  baselineRows: CsvRow[];
  currentRows?: CsvRow[];
  baselineLineNumbers: number[];
  currentLineNumbers?: number[];
  baselineMeta: SnapshotMeta;
  currentMeta?: SnapshotMeta;
  baselineRawText?: string;
  currentRawText?: string;
  baselineRawBytesBase64?: string;
  currentRawBytesBase64?: string;
  columns: string[];
  primaryKey: string;
  ruleVersion: string;
  isDemo: boolean;
  dataOrigin?: "SYNTHETIC" | "PUBLIC" | "USER";
  externalSource?: ExternalSourceProvenance;
  upstreamLineage?: UpstreamLineage;
}

export type ExternalSourceType =
  | "WORLD_BANK_INDICATORS_API_V2"
  | "USDOT_NTD_SOCRATA_V1"
  | "US_TREASURY_YIELD_CURVE_XML_V1"
  | "CFPB_COMPLAINT_TRENDS_V1"
  | "CDC_PLACES_SOCRATA_V1"
  | "ONS_EXPLORE_LOCAL_STATISTICS_CSV_V1";

export type ExternalCleaningImplementation =
  | "world-bank-indicator-v1"
  | "usdot-ntd-monthly-v1"
  | "treasury-yield-curve-v1"
  | "cfpb-complaint-trends-v1"
  | "cdc-places-county-v1"
  | "ons-housing-affordability-v1";

export type ExternalCleaningParameter = string | number | boolean | string[] | number[] | Array<Record<string, string | number>>;

export type SourceLastUpdatedEvidence =
  | { method: "RAW_RESPONSE_PAIR" }
  | { method: "PUBLISHER_METADATA"; sourceUrl: string; fileName: string; sha256: string; text: string };

export interface ExternalSourceProvenance {
  schemaVersion: "claimtrace-external-source/2.2.0";
  sourceType: ExternalSourceType;
  publisher: string;
  dataset: string;
  measure: { id: string; name: string };
  retrievedAt: string;
  sourceLastUpdated?: string | null;
  sourceLastUpdatedBasis: "PUBLISHER_REPORTED" | "NOT_SEPARATELY_REPORTED";
  sourceLastUpdatedNotReportedReason?: string;
  sourceLastUpdatedEvidence?: SourceLastUpdatedEvidence;
  sourceUrls: { baseline: string; current: string };
  license: string;
  licenseUrl: string;
  attribution: string;
  limitations: string[];
  cleaning: {
    implementation: ExternalCleaningImplementation;
    scriptPath: string;
    parameters: Record<string, ExternalCleaningParameter>;
  };
  rawArtifacts: Array<{ side: SnapshotSide; fileName: string; sha256: string; text: string }>;
}

export interface UpstreamSource {
  id: string;
  side: SnapshotSide;
  fileName: string;
  primaryKey: string;
  sha256: string;
  rowCount: number;
  byteSize: number;
  rawText: string;
  rawBytesBase64?: string;
}

export interface UpstreamAggregation {
  id: string;
  side: SnapshotSide;
  summaryKey: string;
  sourceId: string;
  filters: FilterClause[];
  numerator: { operation: "sum" | "count"; field?: string };
  denominator: { operation: "sum" | "count"; field?: string };
  multiplier: number;
  roundDigits: number;
  sourceRowCount: number;
  sourceKeysHash: string;
  formulaVersion: string;
}

export interface UpstreamLineage {
  schemaVersion: "claimtrace-upstream-lineage/1.0.0";
  generatedAt: string;
  sources: UpstreamSource[];
  aggregations: UpstreamAggregation[];
}

export interface FilterClause {
  field: string;
  equals: CsvValue;
}

export interface RuleProvenance {
  source: string;
  rationale: string;
  confirmedBy?: string;
  confirmedAt?: string;
}

export interface ThresholdSpec extends RuleProvenance {
  value: number;
  unit: "percent" | "absolute" | "score" | "count";
}

interface RuleBase {
  field: string;
  aggregation: Aggregation;
  filters?: FilterClause[];
  excludes?: FilterClause[];
}

export type Rule =
  | (RuleBase & {
      type: "stability";
      supportTolerance: number;
      reversalThreshold?: number;
      absoluteTolerance?: number;
      supportToleranceSpec?: ThresholdSpec;
      reversalThresholdSpec?: ThresholdSpec;
      absoluteToleranceSpec?: ThresholdSpec;
    })
  | (RuleBase & {
      type: "threshold";
      operator: Operator;
      threshold: number;
      thresholdSpec?: ThresholdSpec;
    })
  | (RuleBase & {
      type: "interval-threshold";
      lowerField: string;
      upperField: string;
      operator: Exclude<Operator, "=">;
      threshold: number;
      intervalLevel: number;
      intervalLabel: string;
      thresholdSpec?: ThresholdSpec;
    })
  | (RuleBase & {
      type: "rank";
      groupField: string;
      expectedGroup: CsvValue;
      rank: "max" | "min";
      tiePolicy?: "allow_tied" | "require_unique";
    });

export interface EvidenceNode {
  id: string;
  kind: string;
  title: string;
  detail: string;
  bound: boolean;
}

export interface SourceReference {
  snapshot: SnapshotSide;
  fileName: string;
  sha256: string;
  keyField: string;
  keyValue: string;
  lineNumber: number;
  fields: string[];
}

export interface EvidenceSideScope {
  matchingRows: number;
  exportedReferences: number;
  changedCandidates: number;
  pairedChangedReferences: number;
  unpairedChangedReferences: number;
  boundaryReferences: number;
  sampledReferences: number;
}

export interface EvidenceScope {
  matchingRows: number;
  exportedReferences: number;
  truncated: boolean;
  strategy: "all-matching" | "changed+boundary+sample";
  maxReferences: number;
  seed: string;
  pairedChangedKeys: number;
  sides: {
    baseline: EvidenceSideScope;
    current?: EvidenceSideScope;
  };
}

export interface SampleProfile {
  totalRows: number;
  filteredRows: number;
  effectiveRows: number;
  missingRows: number;
  excludedRows: number;
  includedKeyCount: number;
  includedKeysHash: string;
  groupCounts: Record<string, number>;
}

export interface ClaimAuditMeta {
  ruleVersion: string;
  lastRunAt: string;
  baselineSha256: string;
  currentSha256?: string;
  preliminary: boolean;
}

export interface Claim {
  id: string;
  kind: ClaimKind;
  code: string;
  title: string;
  section: string;
  owner: string;
  category: string;
  status: ClaimStatus;
  baselineStatus: ClaimStatus;
  baselineValue: string;
  currentValue: string;
  formula: string;
  reason: string;
  action: string;
  sourceRefs: SourceReference[];
  evidence: EvidenceNode[];
  evidenceScope?: EvidenceScope;
  sampleProfiles?: { baseline: SampleProfile; current?: SampleProfile };
  resultId?: string;
  decisionIds?: string[];
  audit: ClaimAuditMeta;
  governance: {
    engineStatus: ClaimStatus;
    reviewDisposition: ReviewDisposition;
    releaseStatus: ReleaseStatus;
    latestReviewId?: string;
  };
  rule?: Rule;
}

export interface ClaimSpec {
  id: string;
  code: string;
  title: string;
  section: string;
  owner: string;
  category: string;
  formula: string;
  rule?: Rule;
  decisionIds?: string[];
}

export interface PrimaryKeyValidation {
  valid: boolean;
  duplicates: string[];
  missingLines: number[];
}

export interface RowDiff {
  key: string;
  kind: "unchanged" | "changed" | "added" | "removed";
  changedFields: string[];
  baseline?: CsvRow;
  current?: CsvRow;
  baselineLine?: number;
  currentLine?: number;
}

export interface EvidenceCompleteness {
  score: number;
  passed: number;
  total: number;
  missing: string[];
}

export interface AuditSummary {
  total: number;
  supported: number;
  weakened: number;
  reversed: number;
  untestable: number;
  reviewRequired: number;
  completenessChecksPassed: number;
  completenessChecksTotal: number;
  evidenceCoverage: number;
  changedRecords: number;
}

export interface RankResult {
  winners: Array<{ group: string; value: number }>;
  groups: Array<{ group: string; value: number }>;
  tied: boolean;
  missingGroupRows: number;
}

export interface IntervalThresholdResult {
  point: number;
  lower: number;
  upper: number;
  matchingRows: number;
}

export interface DecisionCondition {
  claimId: string;
  allowedStatuses: ClaimStatus[];
}

export type DecisionOutcome = "PASS" | "HOLD" | "REVIEW";

export interface DecisionOption {
  id: string;
  label: string;
  benefit: number;
  cost: number;
  risk: number;
  capacity: number;
}

export interface DecisionConstraint {
  id: string;
  label: string;
  metric: "cost" | "risk" | "capacity";
  operator: "<=" | ">=";
  value: number;
}

export interface DecisionScenario {
  id: string;
  label: string;
  benefitMultiplier?: number;
  costMultiplier?: number;
  riskMultiplier?: number;
  capacityMultiplier?: number;
}

export interface DecisionUncertainty {
  method: "BOUNDED_UNIFORM";
  benefitMultiplier: [number, number];
  costMultiplier: [number, number];
  riskMultiplier: [number, number];
  capacityMultiplier: [number, number];
  trials: number;
  seed: string;
  stabilitySweep?: {
    parameter: "benefitMultiplier";
    min: number;
    max: number;
    step: number;
  };
}

export interface DecisionInputProvenance {
  kind: "MANUAL_ASSUMPTION" | "DATA_DERIVED";
  source: string;
  version: string;
  rationale: string;
  units: {
    benefit: string;
    cost: string;
    risk: string;
    capacity: string;
  };
  confirmedBy?: string;
  confirmedAt?: string;
}

export interface SignedDecisionResult {
  versionId: string;
  outcome: DecisionOutcome;
  activeActionId: string;
  actionIdentityHash: string;
  recommendedOptionId: string | null;
  feasibleOptionIds: string[];
  decisionPolicyHash: string;
  decisionInputProvenanceHash: string;
  baselineSha256: string;
  currentSha256?: string;
  ruleVersion: string;
  claimResultIds: string[];
  historyBasis: "RECORDED_IDENTITY";
  reviewRecordId: string;
  reviewRecordHash: string;
  signedAt: string;
  signedBy: string;
}

export interface DecisionSpec {
  id: string;
  title: string;
  owner: string;
  passActionId: string;
  holdActionId: string;
  actionIfPass: string;
  actionIfFail: string;
  conditions: DecisionCondition[];
  options?: DecisionOption[];
  objective?: { benefitWeight: number; costWeight: number; riskWeight: number };
  constraints?: DecisionConstraint[];
  riskTolerance?: number;
  stakeholders?: string[];
  scenarios?: DecisionScenario[];
  uncertainty?: DecisionUncertainty;
  noActionLoss?: number;
  inputProvenance?: DecisionInputProvenance;
  priorSignedResult?: SignedDecisionResult;
}

export interface DecisionOptionResult {
  optionId: string;
  label: string;
  feasible: boolean;
  score: number;
  failedConstraints: string[];
  breakEvenBenefit?: number;
  scoreInterval?: { min: number; max: number };
  paretoEfficient?: boolean;
}

export interface DecisionSensitivityResult {
  scenarioId: string;
  label: string;
  recommendedOptionId?: string;
}

export interface DecisionAnalysis {
  options: DecisionOptionResult[];
  recommendedOptionId?: string;
  noActionScore?: number;
  sensitivity: DecisionSensitivityResult[];
  paretoFrontierOptionIds: string[];
  recommendationStability: {
    parameter: "benefitMultiplier";
    recommendedOptionId?: string;
    min: number;
    max: number;
    step: number;
    evaluatedPoints: number;
  };
  monteCarlo?: {
    method: "DETERMINISTIC_SEEDED_BOUNDED_UNIFORM";
    seed: string;
    trials: number;
    recommendationShares: Array<{ optionId: string; count: number; share: number }>;
    options: Array<{ optionId: string; feasibilityRate: number; scoreP05: number; scoreP50: number; scoreP95: number }>;
  };
}

export interface DecisionBinding {
  activeActionId: string;
  actionIdentityHash: string;
  recommendedOptionId: string | null;
  feasibleOptionIds: string[];
  decisionPolicyHash: string;
  decisionInputProvenanceHash: string;
  baselineSha256: string;
  currentSha256?: string;
  ruleVersion: string;
  claimResultIds: string[];
}

export interface DecisionResult {
  resultId: string;
  decisionId: string;
  previousOutcome: DecisionOutcome | null;
  previousVersionId?: string;
  previousRecommendedOptionId?: string | null;
  currentOutcome: DecisionOutcome;
  status: DecisionStatus;
  reason: string;
  boundClaimIds: string[];
  affectedClaimIds: string[];
  comparisonBasis: "RECORDED_SIGNED_IDENTITY" | "NO_HISTORY";
  changeReasons: Array<"OUTCOME" | "ACTION_IDENTITY" | "RECOMMENDED_OPTION" | "FEASIBLE_OPTIONS" | "DECISION_POLICY" | "INPUT_PROVENANCE" | "BASELINE_SNAPSHOT" | "CURRENT_SNAPSHOT" | "RULE_VERSION" | "CLAIM_RESULTS">;
  binding: DecisionBinding;
  analysis?: DecisionAnalysis;
  governance: {
    engineStatus: DecisionStatus;
    reviewDisposition: ReviewDisposition;
    releaseStatus: ReleaseStatus;
    latestReviewId?: string;
  };
}

export interface ReviewRecord {
  id: string;
  claimId?: string;
  decisionId?: string;
  reviewer: string;
  disposition: Exclude<ReviewDisposition, "PENDING">;
  note: string;
  createdAt: string;
  targetResultId: string;
  targetResultHash: string;
  assurance: {
    identity: "LOCAL_UNVERIFIED";
    timestamp: "LOCAL_CLOCK_UNVERIFIED";
    authorization: "SELF_ASSERTED";
    cryptographicSignature: "NONE";
  };
  previousRecordId?: string;
  previousRecordHash?: string;
  recordHash: string;
}

export interface CaseDefinition {
  id: string;
  domain: "business" | "finance" | "health" | "policy" | "spatial" | "public-data";
  title: string;
  question: string;
  primaryKey: string;
  baselineFile: string;
  currentFile: string;
  claimCount: number;
  decisionCount: number;
  synthetic: boolean;
  method: string;
  capabilities: string[];
  boundary: string;
  sourceMetadataFile?: string;
  dataCard: string;
  claimsFile: string;
  decisionsFile: string;
  expectedAuditFile: string;
  readmeFile: string;
}
