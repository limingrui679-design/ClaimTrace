"use client";

import {
  type ChangeEvent,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  RULE_ENGINE_VERSION,
  type Aggregation,
  type Claim,
  type ClaimStatus,
  type DecisionSpec,
  type DecisionResult,
  type DatasetVersion,
  type ExternalSourceProvenance,
  type Operator,
  type ParsedCSV,
  type Rule,
  type RowDiff,
  type ReviewRecord,
  type SnapshotMeta,
  type UpstreamLineage,
  auditSummary,
  appendReviewRecord,
  applyReviewToClaim,
  applyReviewToDecision,
  bytesToBase64,
  buildHtmlReport,
  canonicalizeRows,
  completeEvidence,
  computeEvidenceCompleteness,
  createEvidencePackage,
  createReviewRecord,
  decodeBuffer,
  detectEncoding,
  diffRowsByKey,
  enforceDecisionReleaseDependencies,
  evaluateDecision,
  hashClaimResult,
  hashDecisionResult,
  isSnapshotVerified,
  makeImportedClaims,
  numericColumns,
  parseCSV,
  recomputeClaim,
  sha256Hex,
  sha256Text,
  uniqueKeyCandidates,
  validatePrimaryKey,
  verifyDataset,
  verifyEvidencePackage,
} from "./claimtrace-core";
import { CASE_CATALOG, EXECUTABLE_CASES, POPULATION_HEALTH_CASE, runExecutableCase } from "../src/cases";
import { DEMO_DATASET } from "./demo-case.generated";

type View = "overview" | "data" | "claims" | "decision" | "review" | "report";

const READ_ONLY_DEMO = import.meta.env.VITE_PUBLIC_READ_ONLY === "true";

interface FileSnapshot extends ParsedCSV {
  meta: SnapshotMeta;
  rawText: string;
  rawBytesBase64: string;
}

const DEMO_AUDIT_AT = POPULATION_HEALTH_CASE.expectedGeneratedAt;
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
  audit: { ruleVersion: RULE_ENGINE_VERSION, lastRunAt: DEMO_AUDIT_AT, baselineSha256: DEMO_DATASET.baselineMeta.sha256, currentSha256: DEMO_DATASET.currentMeta?.sha256, preliminary: false },
}));
const DEMO_CLAIMS = DEMO_CLAIM_SEEDS.map((claim) => recomputeClaim(claim, DEMO_DATASET, DEMO_AUDIT_AT));
const DEMO_DECISIONS: DecisionSpec[] = POPULATION_HEALTH_CASE.decisions;

const NAV_ITEMS: Array<{ id: View; label: string; mobileLabel: string; short: string }> = [
  { id: "overview", label: "Project Audit", mobileLabel: "Project", short: "◇" },
  { id: "data", label: "Data Versions", mobileLabel: "Data", short: "≋" },
  { id: "claims", label: "Claim Rules", mobileLabel: "Claims", short: "◎" },
  { id: "decision", label: "Decision Impact", mobileLabel: "Decision", short: "↗" },
  { id: "review", label: "Human Review", mobileLabel: "Review", short: "✓" },
  { id: "report", label: "Audit Export", mobileLabel: "Export", short: "↓" },
];

const STATUS_META: Record<ClaimStatus, { label: string; className: string; symbol: string }> = {
  SUPPORTED: { label: "Supported", className: "status-valid", symbol: "✓" },
  WEAKENED: { label: "Weakened", className: "status-weakened", symbol: "△" },
  REVERSED: { label: "Reversed", className: "status-invalid", symbol: "×" },
  UNTESTABLE: { label: "Untestable", className: "status-untestable", symbol: "–" },
  REVIEW_REQUIRED: { label: "Review required", className: "status-review", symbol: "?" },
};

const AGGREGATION_LABELS: Record<Aggregation, string> = {
  average: "Average",
  sum: "Sum",
  min: "Minimum",
  max: "Maximum",
  count: "Count",
};

function downloadFile(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function readCsvFile(file: File): Promise<FileSnapshot> {
  const buffer = await file.arrayBuffer();
  const rawText = decodeBuffer(buffer);
  const parsed = parseCSV(rawText);
  const now = new Date().toISOString();
  const rawSha256 = await sha256Hex(buffer);
  const normalizedSha256 = await sha256Text(canonicalizeRows(parsed.columns, parsed.rows));
  return {
    ...parsed,
    rawText,
    rawBytesBase64: bytesToBase64(buffer),
    meta: {
      fileName: file.name,
      sha256: rawSha256,
      normalizedSha256,
      hashVerified: true,
      verification: {
        status: "verified",
        method: "raw-bytes+normalized-rows",
        verifiedAt: now,
        recomputedSha256: rawSha256,
        recomputedNormalizedSha256: normalizedSha256,
      },
      generatedAt: now,
      rowCount: parsed.rows.length,
      byteSize: buffer.byteLength,
      encoding: detectEncoding(buffer),
      mediaType: "text/csv",
    },
  };
}

function sameColumns(left: string[], right: string[]) {
  return left.length === right.length && left.every((column) => right.includes(column));
}

function percent(part: number, total: number) {
  return total ? Math.round((part / total) * 100) : 0;
}

export default function Home() {
  const [activeView, setActiveView] = useState<View>("overview");
  const [dataset, setDataset] = useState<DatasetVersion>(DEMO_DATASET);
  const [claims, setClaims] = useState<Claim[]>(DEMO_CLAIMS);
  const [selectedClaimId, setSelectedClaimId] = useState(DEMO_CLAIMS[0].id);
  const [revisionVisible, setRevisionVisible] = useState(true);
  const [filter, setFilter] = useState<"all" | ClaimStatus>("all");
  const [search, setSearch] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [showAddClaim, setShowAddClaim] = useState(false);
  const [toast, setToast] = useState("");
  const [projectName, setProjectName] = useState("");
  const [baselineFile, setBaselineFile] = useState<File | null>(null);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [baselinePreview, setBaselinePreview] = useState<FileSnapshot | null>(null);
  const [currentPreview, setCurrentPreview] = useState<FileSnapshot | null>(null);
  const [primaryKey, setPrimaryKey] = useState("");
  const [importError, setImportError] = useState("");
  const [lastAuditAt, setLastAuditAt] = useState(DEMO_AUDIT_AT);
  const [reviewRecords, setReviewRecords] = useState<ReviewRecord[]>([]);
  const [lastExportedBundleHash, setLastExportedBundleHash] = useState<string | null>(null);
  const [decisionSpecs, setDecisionSpecs] = useState<DecisionSpec[]>(DEMO_DECISIONS);
  const [decisionReviewOverrides, setDecisionReviewOverrides] = useState<Record<string, DecisionResult["governance"]>>({});
  const [activeCaseId, setActiveCaseId] = useState<string | null>("population-health");
  const [claimDraft, setClaimDraft] = useState({ title: "", field: "", aggregation: "average" as Aggregation, operator: ">=" as Operator, threshold: "", thresholdSource: "", rationale: "", confirmedBy: "" });
  const revisionInputRef = useRef<HTMLInputElement>(null);

  const summary = useMemo(() => auditSummary(claims, dataset), [claims, dataset]);
  const counts: Record<ClaimStatus, number> = {
    SUPPORTED: summary.supported,
    WEAKENED: summary.weakened,
    REVERSED: summary.reversed,
    UNTESTABLE: summary.untestable,
    REVIEW_REQUIRED: summary.reviewRequired,
  };
  const healthScore = summary.evidenceCoverage;
  const completenessChecksPassed = summary.completenessChecksPassed;
  const completenessChecksTotal = summary.completenessChecksTotal;
  const changedRows = summary.changedRecords;
  const selectedClaim = claims.find((claim) => claim.id === selectedClaimId) ?? claims[0];
  const filteredClaims = claims.filter((claim) => {
    const matchesFilter = filter === "all" || claim.status === filter;
    const matchesSearch = `${claim.title} ${claim.code} ${claim.category}`.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });
  const displayLabel = revisionVisible && dataset.currentName ? dataset.currentName : dataset.baselineName;
  const numericFields = numericColumns(dataset);
  const keyCandidates = baselinePreview ? uniqueKeyCandidates(baselinePreview.columns, baselinePreview.rows, baselinePreview.lineNumbers) : [];
  const sourceTraceability = percent(claims.filter((claim) => claim.sourceRefs.length > 0 && claim.sourceRefs.every((ref) => ref.lineNumber >= 2 && Boolean(ref.keyValue))).length, claims.length);
  const calculationReproducibility = percent(claims.filter((claim) => claim.rule && claim.audit.ruleVersion === dataset.ruleVersion).length, claims.length);
  const snapshotVerification = dataset.currentRows ? (isSnapshotVerified(dataset, "baseline") && isSnapshotVerified(dataset, "current") ? 100 : 0) : (isSnapshotVerified(dataset, "baseline") ? 100 : 0);
  const auditFreshness = percent(claims.filter((claim) => claim.audit.baselineSha256 === dataset.baselineMeta.sha256 && claim.audit.currentSha256 === dataset.currentMeta?.sha256).length, claims.length);
  const decisions = decisionSpecs;
  const decisionResults = useMemo(() => decisions.map((decision) => {
    const result = evaluateDecision(decision, claims);
    const override = decisionReviewOverrides[result.decisionId];
    const governed = override?.engineStatus === result.status ? { ...result, governance: override } : result;
    return enforceDecisionReleaseDependencies(governed, claims);
  }), [decisions, claims, decisionReviewOverrides]);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 3000);
  }

  function resetImport() {
    setBaselineFile(null);
    setCurrentFile(null);
    setBaselinePreview(null);
    setCurrentPreview(null);
    setPrimaryKey("");
    setProjectName("");
    setImportError("");
  }

  function loadDemo() {
    setDataset(DEMO_DATASET);
    setClaims(DEMO_CLAIMS);
    setSelectedClaimId(DEMO_CLAIMS[0].id);
    setRevisionVisible(true);
    setLastAuditAt(DEMO_AUDIT_AT);
    setReviewRecords([]);
    setLastExportedBundleHash(null);
    setDecisionSpecs(DEMO_DECISIONS);
    setDecisionReviewOverrides({});
    setActiveCaseId("population-health");
    setActiveView("overview");
    showToast("Reproducible synthetic demonstration restored");
  }

  async function loadCase(caseId: string) {
    const definition = EXECUTABLE_CASES.find((item) => item.id === caseId);
    if (!definition) return;
    try {
      const [baselineResponse, currentResponse, upstreamResponse, sourceResponse] = await Promise.all([
        fetch(definition.baselineFile),
        fetch(definition.currentFile),
        definition.upstreamLineageFile ? fetch(definition.upstreamLineageFile) : Promise.resolve(null),
        definition.sourceMetadataFile ? fetch(definition.sourceMetadataFile) : Promise.resolve(null),
      ]);
      if (!baselineResponse.ok || !currentResponse.ok) throw new Error("Case snapshots could not be loaded");
      if (upstreamResponse && !upstreamResponse.ok) throw new Error("Case upstream lineage could not be loaded");
      if (sourceResponse && !sourceResponse.ok) throw new Error("Case external-source metadata could not be loaded");
      const upstreamLineage = upstreamResponse ? await upstreamResponse.json() as UpstreamLineage : undefined;
      const externalSource = sourceResponse ? await sourceResponse.json() as ExternalSourceProvenance : undefined;
      const run = await runExecutableCase(definition, await baselineResponse.text(), await currentResponse.text(), upstreamLineage, externalSource);
      setDataset(run.dataset);
      setClaims(run.claims);
      setDecisionSpecs(run.decisionSpecs);
      setDecisionReviewOverrides({});
      setSelectedClaimId(run.claims[0]?.id ?? "");
      setRevisionVisible(true);
      setLastAuditAt(definition.expectedGeneratedAt);
      setReviewRecords([]);
      setLastExportedBundleHash(null);
      setActiveCaseId(caseId);
      setActiveView("overview");
      showToast(`Loaded and executed: ${definition.title}`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Case loading failed");
    }
  }

  async function selectBaseline(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setBaselineFile(file);
    setBaselinePreview(null);
    setPrimaryKey("");
    setImportError("");
    if (!file) return;
    try {
      const preview = await readCsvFile(file);
      setBaselinePreview(preview);
      if (!uniqueKeyCandidates(preview.columns, preview.rows, preview.lineNumbers).length) {
        setImportError("No unique, nonempty candidate primary key was found. Add a unique identifier column to the CSV first.");
      }
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Baseline could not be read");
    }
  }

  async function selectCurrent(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setCurrentFile(file);
    setCurrentPreview(null);
    setImportError("");
    if (!file) return;
    try {
      setCurrentPreview(await readCsvFile(file));
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Current version could not be read");
    }
  }

  function assertValidKey(snapshot: FileSnapshot, key: string, label: string) {
    const validation = validatePrimaryKey(snapshot.rows, snapshot.lineNumbers, key);
    if (!validation.valid) {
      const problems = [
        validation.duplicates.length ? `Duplicate values: ${validation.duplicates.slice(0, 5).join(", ")}` : "",
        validation.missingLines.length ? `Empty values on lines: ${validation.missingLines.slice(0, 5).join(", ")}` : "",
      ].filter(Boolean).join("; ");
      throw new Error(`${label} primary key ${key} is invalid (${problems})`);
    }
  }

  async function importProject(event: FormEvent) {
    event.preventDefault();
    if (READ_ONLY_DEMO) {
      showToast("Read-only portfolio mode cannot import local projects");
      return;
    }
    setImportError("");
    try {
      if (!baselineFile || !baselinePreview) throw new Error("Select and successfully read a baseline CSV.");
      if (!primaryKey) throw new Error("Select a unique primary key before creating the project.");
      assertValidKey(baselinePreview, primaryKey, "Baseline");
      if (currentFile && !currentPreview) throw new Error("The current-version CSV has not been read successfully.");
      if (currentPreview) {
        if (!sameColumns(baselinePreview.columns, currentPreview.columns)) throw new Error("Baseline and current versions must have exactly the same set of columns.");
        assertValidKey(currentPreview, primaryKey, "Current version");
      }
      const nextDataset = await verifyDataset({
        projectName: projectName.trim() || baselineFile.name.replace(/\.csv$/i, ""),
        baselineName: `Baseline · ${baselineFile.name}`,
        currentName: currentFile ? `Current · ${currentFile.name}` : undefined,
        baselineRows: baselinePreview.rows,
        currentRows: currentPreview?.rows,
        baselineLineNumbers: baselinePreview.lineNumbers,
        currentLineNumbers: currentPreview?.lineNumbers,
        baselineMeta: baselinePreview.meta,
        currentMeta: currentPreview?.meta,
        baselineRawText: baselinePreview.rawText,
        currentRawText: currentPreview?.rawText,
        baselineRawBytesBase64: baselinePreview.rawBytesBase64,
        currentRawBytesBase64: currentPreview?.rawBytesBase64,
        columns: baselinePreview.columns,
        primaryKey,
        ruleVersion: RULE_ENGINE_VERSION,
        isDemo: false,
        dataOrigin: "USER",
      });
      const runAt = new Date().toISOString();
      const autoClaims = makeImportedClaims(nextDataset, runAt);
      if (!autoClaims.length) throw new Error("No computable numeric field was found. Check the CSV content.");
      setDataset(nextDataset);
      setClaims(autoClaims);
      setDecisionSpecs([{ id: "decision-imported", title: "Should the current analytical recommendation proceed?", owner: "To be assigned", passActionId: "imported:submit-for-signoff", holdActionId: "imported:pause-and-revise", actionIfPass: "The current recommendation can proceed to human sign-off.", actionIfFail: "Pause the recommendation and revise the analysis.", conditions: [{ claimId: autoClaims[0].id, allowedStatuses: ["SUPPORTED", "WEAKENED"] }], stakeholders: ["Analysis lead", "Business owner"], objective: { benefitWeight: 1, costWeight: 0.2, riskWeight: 1 }, riskTolerance: 20, inputProvenance: { kind: "MANUAL_ASSUMPTION", source: "Default demonstration parameters for imported projects", version: "1.0.0", rationale: "The following benefit, cost, risk, and capacity values are manual assumptions and must be replaced or confirmed before sign-off", units: { benefit: "assumption points", cost: "assumption points", risk: "assumption points", capacity: "assumption points" } }, uncertainty: { method: "BOUNDED_UNIFORM", benefitMultiplier: [0.8, 1.2], costMultiplier: [0.85, 1.2], riskMultiplier: [0.8, 1.25], capacityMultiplier: [0.9, 1.15], trials: 512, seed: "imported-default-v1", stabilitySweep: { parameter: "benefitMultiplier", min: 0.5, max: 1.5, step: 0.05 } }, constraints: [{ id: "budget", label: "Budget", metric: "cost", operator: "<=", value: 50 }], options: [{ id: "hold", label: "Hold", benefit: 25, cost: 8, risk: 5, capacity: 5 }, { id: "limited", label: "Limited rollout", benefit: 65, cost: 35, risk: 18, capacity: 30 }, { id: "full", label: "Full rollout", benefit: 95, cost: 75, risk: 35, capacity: 70 }] }]);
      setDecisionReviewOverrides({});
      setReviewRecords([]);
      setLastExportedBundleHash(null);
      setActiveCaseId(null);
      setSelectedClaimId(autoClaims[0].id);
      setRevisionVisible(Boolean(nextDataset.currentRows));
      setLastAuditAt(runAt);
      setShowImport(false);
      resetImport();
      setActiveView("overview");
      showToast(`Created ${autoClaims.length} evidence chains using primary key ${primaryKey}`);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Import failed. Check the CSV files.");
    }
  }

  async function importRevision(event: ChangeEvent<HTMLInputElement>) {
    if (READ_ONLY_DEMO) {
      showToast("Read-only portfolio mode cannot import a current version");
      event.target.value = "";
      return;
    }
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = await readCsvFile(file);
      if (!sameColumns(dataset.columns, parsed.columns)) throw new Error("The current-version columns do not match the baseline columns.");
      assertValidKey(parsed, dataset.primaryKey, "Current version");
      const nextDataset: DatasetVersion = {
        ...dataset,
        currentName: `Current · ${file.name}`,
        currentRows: parsed.rows,
        currentLineNumbers: parsed.lineNumbers,
        currentMeta: parsed.meta,
        currentRawText: parsed.rawText,
        currentRawBytesBase64: parsed.rawBytesBase64,
      };
      const verifiedDataset = await verifyDataset(nextDataset);
      const runAt = new Date().toISOString();
      setDataset(verifiedDataset);
      setClaims((currentClaims) => currentClaims.map((claim) => recomputeClaim(claim, verifiedDataset, runAt)));
      setDecisionReviewOverrides({});
      setReviewRecords([]);
      setRevisionVisible(true);
      setLastAuditAt(runAt);
      showToast(`Current version aligned by primary key ${dataset.primaryKey} and re-audited`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Current version could not be read");
    } finally {
      event.target.value = "";
    }
  }

  async function runAudit() {
    const runAt = new Date().toISOString();
    const verifiedDataset = await verifyDataset(dataset, runAt);
    setDataset(verifiedDataset);
    setClaims((currentClaims) => currentClaims.map((claim) => recomputeClaim(claim, verifiedDataset, runAt)));
    setDecisionReviewOverrides({});
    setLastAuditAt(runAt);
    setActiveView("claims");
    showToast(`Deterministic recomputation completed with ${dataset.ruleVersion}`);
  }

  function addClaim(event: FormEvent) {
    event.preventDefault();
    if (READ_ONLY_DEMO) {
      showToast("Read-only portfolio mode cannot add claims");
      return;
    }
    const threshold = Number(claimDraft.threshold);
    if (!claimDraft.title.trim() || !claimDraft.field || !Number.isFinite(threshold)) {
      showToast("Enter a claim, a field, and a valid threshold");
      return;
    }
    const runAt = new Date().toISOString();
    const rule: Rule = {
      type: "threshold",
      field: claimDraft.field,
      aggregation: claimDraft.aggregation,
      operator: claimDraft.operator,
      threshold,
      thresholdSpec: {
        value: threshold,
        unit: "score",
        source: claimDraft.thresholdSource.trim() || "User input; source pending",
        rationale: claimDraft.rationale.trim() || "Business rationale pending",
        confirmedBy: claimDraft.confirmedBy.trim() || undefined,
        confirmedAt: claimDraft.confirmedBy.trim() ? runAt : undefined,
      },
    };
    const nextClaim = recomputeClaim({
      id: `claim-${Date.now()}`,
      kind: "SNAPSHOT",
      code: `CT-${String(claims.length + 1).padStart(3, "0")}`,
      title: claimDraft.title.trim(),
      section: "User-added claim",
      owner: "Current analyst",
      category: "Custom test",
      status: "REVIEW_REQUIRED",
      baselineStatus: "UNTESTABLE",
      baselineValue: "Computing",
      currentValue: "Computing",
      formula: `${AGGREGATION_LABELS[claimDraft.aggregation]}(${claimDraft.field}) ${claimDraft.operator} ${threshold}`,
      reason: "",
      action: "",
      sourceRefs: [],
      evidence: [],
      governance: { engineStatus: "REVIEW_REQUIRED", reviewDisposition: "PENDING", releaseStatus: "BLOCKED" },
      audit: { ruleVersion: dataset.ruleVersion, lastRunAt: runAt, baselineSha256: dataset.baselineMeta.sha256, currentSha256: dataset.currentMeta?.sha256, preliminary: !claimDraft.confirmedBy.trim() },
      rule,
    }, dataset, runAt);
    setClaims((currentClaims) => [...currentClaims, nextClaim]);
    setSelectedClaimId(nextClaim.id);
    setLastAuditAt(runAt);
    setClaimDraft({ title: "", field: numericFields[0] ?? "", aggregation: "average", operator: ">=", threshold: "", thresholdSource: "", rationale: "", confirmedBy: "" });
    setShowAddClaim(false);
    setActiveView("claims");
    showToast("The new claim was computed and linked to record-level evidence");
  }

  async function prepareVerifiedBundle(generatedAt: string) {
    const verifiedDataset = await verifyDataset(dataset, generatedAt);
    const verifiedClaims = claims.map((claim) => recomputeClaim(claim, verifiedDataset, generatedAt));
    const bundle = await createEvidencePackage(verifiedDataset, verifiedClaims, generatedAt, { decisionSpecs, reviews: reviewRecords, previousBundleHash: lastExportedBundleHash });
    const verification = await verifyEvidencePackage(bundle);
    if (!verification.valid) {
      const failed = verification.checks.filter((check) => !check.passed).map((check) => check.name).join(", ");
      throw new Error(`AuditBundle independent verification failed: ${failed || "unknown check"}`);
    }
    setDataset(verifiedDataset);
    setClaims(bundle.claimResults);
    setDecisionReviewOverrides(Object.fromEntries(bundle.decisionResults.map((decision) => [decision.decisionId, decision.governance])));
    setLastAuditAt(generatedAt);
    return { bundle, verification };
  }

  async function exportEvidencePackage() {
    const generatedAt = new Date().toISOString();
    try {
      const { bundle } = await prepareVerifiedBundle(generatedAt);
      downloadFile("claimtrace-audit-bundle.json", JSON.stringify(bundle, null, 2), "application/json;charset=utf-8");
      setLastExportedBundleHash(bundle.integrity.payloadHash);
      showToast(bundle.previousBundleHash ? "AuditBundle verified and linked to the previous bundle root hash" : "Genesis AuditBundle recomputed, independently verified, and sealed with a root hash");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "AuditBundle export failed");
    }
  }

  async function exportReport() {
    const generatedAt = new Date().toISOString();
    try {
      const { bundle, verification } = await prepareVerifiedBundle(generatedAt);
      downloadFile("ClaimTrace-Audit-Report.html", buildHtmlReport(bundle, verification), "text/html;charset=utf-8");
      showToast("HTML report generated with claims, decisions, review chain, and root-hash verification");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "HTML report export failed");
    }
  }

  function copySummary() {
    const text = `${dataset.projectName}: audited ${summary.total} claims: ${summary.reversed} reversed, ${summary.weakened} weakened, ${summary.untestable} untestable, ${summary.reviewRequired} requiring review, and ${summary.supported} supported. Completeness checks passed: ${summary.completenessChecksPassed}/${summary.completenessChecksTotal} (not model accuracy or business impact). Primary key: ${dataset.primaryKey}; rule: ${dataset.ruleVersion}.`;
    navigator.clipboard?.writeText(text).then(() => showToast("Project summary copied"), () => showToast("Copy failed; use the exported report instead"));
  }

  function openAddClaim() {
    if (READ_ONLY_DEMO) {
      showToast("Read-only portfolio mode cannot add claims");
      return;
    }
    setClaimDraft((draft) => ({ ...draft, field: draft.field || numericFields[0] || "" }));
    setShowAddClaim(true);
  }

  async function recordReview(claimId: string, disposition: ReviewRecord["disposition"], reviewer: string, note: string) {
    try {
      if (READ_ONLY_DEMO) throw new Error("Read-only portfolio mode cannot create sign-off records");
      const claim = claims.find((item) => item.id === claimId);
      if (!claim?.resultId) throw new Error("The claim result has not been generated");
      const previous = reviewRecords.at(-1);
      const record = await createReviewRecord({ claimId, reviewer, disposition, note, createdAt: new Date().toISOString(), targetResultId: claim.resultId, targetResultHash: await hashClaimResult(claim) }, previous);
      const reviewed = await applyReviewToClaim(claim, record);
      setReviewRecords((records) => appendReviewRecord(records, record));
      setClaims((currentClaims) => currentClaims.map((item) => item.id === claimId ? reviewed : item));
      showToast(disposition === "APPROVED" ? "Sign-off appended and release status updated" : disposition === "RISK_ACCEPTED" ? "Risk acceptance recorded and release status marked" : "Returned and blocked from release");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Review record could not be created");
    }
  }

  async function recordDecisionReview(decisionId: string, disposition: ReviewRecord["disposition"], reviewer: string, note: string) {
    try {
      if (READ_ONLY_DEMO) throw new Error("Read-only portfolio mode cannot create decision sign-off records");
      const result = decisionResults.find((item) => item.decisionId === decisionId);
      if (!result) throw new Error("Decision result does not exist");
      const previous = reviewRecords.at(-1);
      const record = await createReviewRecord({ decisionId, reviewer, disposition, note, createdAt: new Date().toISOString(), targetResultId: result.resultId, targetResultHash: await hashDecisionResult(result) }, previous);
      const reviewed = await applyReviewToDecision(result, record, claims);
      setReviewRecords((records) => appendReviewRecord(records, record));
      setDecisionReviewOverrides((current) => ({ ...current, [decisionId]: reviewed.governance }));
      showToast(disposition === "APPROVED" ? "Decision signed off" : disposition === "RESIGNED" ? "New decision identity re-signed" : disposition === "RISK_ACCEPTED" ? "Risk acceptance recorded for the decision change" : "Decision returned and blocked from release");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Decision review failed");
    }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setActiveView("overview")} aria-label="Return to audit overview">
          <span className="brand-mark"><i /><i /><i /></span>
          <span><b>ClaimTrace</b><small>Evidence intelligence</small></span>
        </button>
        <nav className="main-nav" aria-label="Primary navigation">
          {NAV_ITEMS.map((item) => <button key={item.id} aria-label={item.label} className={activeView === item.id ? "active" : ""} onClick={() => setActiveView(item.id)}><span className="nav-glyph">{item.short}</span><span className="nav-label"><span className="nav-label-desktop">{item.label}</span><span className="nav-label-mobile">{item.mobileLabel}</span></span>{item.id === "claims" && counts.REVERSED > 0 ? <em>{counts.REVERSED}</em> : null}</button>)}
        </nav>
        <div className="sidebar-project">
          <span className="eyebrow">CURRENT PROJECT</span>
          <strong>{dataset.projectName}</strong>
          <span>{dataset.dataOrigin === "PUBLIC" ? "Reproducible public-data case · verifiable source and license" : dataset.isDemo ? "Reproducible synthetic case · downloadable records" : "Local project · data stays in the browser"}</span>
          <div className="project-score"><span style={{ width: `${healthScore}%` }} /></div>
          <small>Completeness checks passed {completenessChecksPassed}/{completenessChecksTotal}</small>
        </div>
        <div className="sidebar-actions">{!READ_ONLY_DEMO ? <button data-claimtrace-mutation="import-project" className="sidebar-secondary" onClick={() => setShowImport(true)}>＋ Import new project</button> : null}{!dataset.isDemo ? <button className="sidebar-link" onClick={loadDemo}>Restore demo project</button> : null}</div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="topbar-context"><span className="mobile-brand">ClaimTrace</span><span className="breadcrumb"><b>CONTROL ROOM</b><i /> {NAV_ITEMS.find((item) => item.id === activeView)?.label}</span>{READ_ONLY_DEMO ? <span className="readonly-badge">Read-only portfolio mode · controls disabled</span> : null}</div>
          <div className="topbar-actions">
            <button className="version-switch" onClick={() => setRevisionVisible((value) => !value)} disabled={!dataset.currentRows}><span className={revisionVisible ? "version-dot current" : "version-dot"} />Showing: {revisionVisible && dataset.currentRows ? "Current" : "Baseline"}<b>⌄</b></button>
            <button className="button ghost" onClick={exportEvidencePackage}>Export AuditBundle</button>
            <button className="button primary" onClick={runAudit}>Rerun audit</button>
          </div>
        </header>

        <div className="content">
          {activeView === "overview" ? <Overview dataset={dataset} claims={claims} selectedClaim={selectedClaim} counts={counts} healthScore={healthScore} completenessChecksPassed={completenessChecksPassed} completenessChecksTotal={completenessChecksTotal} changedRows={changedRows} displayLabel={displayLabel} lastAuditAt={lastAuditAt} sourceTraceability={sourceTraceability} calculationReproducibility={calculationReproducibility} snapshotVerification={snapshotVerification} auditFreshness={auditFreshness} activeCaseId={activeCaseId} onLoadCase={loadCase} onSelectClaim={(id) => { setSelectedClaimId(id); setActiveView("claims"); }} onImport={() => setShowImport(true)} onOpenClaims={() => setActiveView("claims")} onExport={exportReport} /> : null}
          {activeView === "claims" ? <ClaimsView claims={filteredClaims} selectedClaim={selectedClaim} dataset={dataset} filter={filter} search={search} counts={counts} onFilter={setFilter} onSearch={setSearch} onSelect={setSelectedClaimId} onAdd={openAddClaim} onExport={exportReport} /> : null}
          {activeView === "data" ? <DataView dataset={dataset} changedRows={changedRows} revisionVisible={revisionVisible} onToggleRevision={() => setRevisionVisible((value) => !value)} onImport={() => revisionInputRef.current?.click()} onNewProject={() => setShowImport(true)} /> : null}
          {activeView === "decision" ? <DecisionView decisions={decisions} results={decisionResults} claims={claims} /> : null}
          {activeView === "review" ? <ReviewView claims={claims} decisions={decisionResults} records={reviewRecords} onReview={recordReview} onDecisionReview={recordDecisionReview} /> : null}
          {activeView === "report" ? <ReportView dataset={dataset} claims={claims} counts={counts} completenessChecksPassed={completenessChecksPassed} completenessChecksTotal={completenessChecksTotal} displayLabel={displayLabel} lastAuditAt={lastAuditAt} onExport={exportReport} onCopy={copySummary} /> : null}
        </div>
      </section>

      {!READ_ONLY_DEMO ? <input data-claimtrace-mutation="import-revision" ref={revisionInputRef} className="visually-hidden" type="file" accept=".csv,text/csv" onChange={importRevision} /> : null}

      {!READ_ONLY_DEMO && showImport ? <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowImport(false); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="import-title"><button className="modal-close" onClick={() => setShowImport(false)} aria-label="Close">×</button><span className="eyebrow accent">PRIMARY-KEY IMPORT</span><h2 id="import-title">Import Your Analytical Project</h2><p>Select a unique primary key before comparing versions. File SHA-256 values, exact line numbers, the rule version, and the audit time will be recorded in the AuditBundle.</p><form onSubmit={importProject}>
        <label className="field-label">Project name<input value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="Example: 2026 Customer Retention Analysis" /></label>
        <div className="file-grid"><label className={`file-drop ${baselinePreview ? "ready" : ""}`}><input type="file" accept=".csv,text/csv" onChange={selectBaseline} /><span className="file-step">01</span><b>Baseline CSV</b><small>{baselineFile ? baselineFile.name : "Required · establish initial evidence"}</small></label><label className={`file-drop ${currentPreview ? "ready" : ""}`}><input type="file" accept=".csv,text/csv" onChange={selectCurrent} /><span className="file-step">02</span><b>Current CSV</b><small>{currentFile ? currentFile.name : "Optional · inspect version changes"}</small></label></div>
        {baselinePreview ? <div className="key-picker"><label className="field-label">Unique primary key (required)<select value={primaryKey} onChange={(event) => setPrimaryKey(event.target.value)}><option value="">Select explicitly; no automatic guessing</option>{keyCandidates.map((column) => <option key={column} value={column}>{column}</option>)}</select></label><p>{baselinePreview.rows.length} rows · {keyCandidates.length} candidate unique fields · SHA-256 {baselinePreview.meta.sha256.slice(0, 12)}…</p></div> : null}
        <div className="privacy-note"><span>LOCK</span><p><b>Local analysis</b><br />CSV files are read only in this browser. Exports contain raw snapshot hashes, not upload activity.</p></div>{importError ? <div className="form-error" role="alert">{importError}</div> : null}<div className="modal-actions"><button type="button" className="button ghost" onClick={() => { setShowImport(false); resetImport(); }}>Cancel</button><button type="submit" className="button primary">Validate key and create</button></div>
      </form></section></div> : null}

      {!READ_ONLY_DEMO && showAddClaim ? <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowAddClaim(false); }}><section className="modal compact" role="dialog" aria-modal="true" aria-labelledby="claim-title"><button className="modal-close" onClick={() => setShowAddClaim(false)} aria-label="Close">×</button><span className="eyebrow accent">TESTABLE CLAIM</span><h2 id="claim-title">Add a Testable Claim</h2><p>Bind the claim to a field, aggregation rule, and threshold. Both versions will be recomputed from source records.</p><form onSubmit={addClaim}>
        <label className="field-label">Claim in the report<textarea value={claimDraft.title} onChange={(event) => setClaimDraft({ ...claimDraft, title: event.target.value })} placeholder="Example: Mean satisfaction exceeds 8, so rollout can continue" rows={3} /></label><div className="form-grid two"><label className="field-label">Data field<select value={claimDraft.field} onChange={(event) => setClaimDraft({ ...claimDraft, field: event.target.value })}>{numericFields.map((field) => <option key={field} value={field}>{field}</option>)}</select></label><label className="field-label">Aggregation<select value={claimDraft.aggregation} onChange={(event) => setClaimDraft({ ...claimDraft, aggregation: event.target.value as Aggregation })}>{Object.entries(AGGREGATION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div><div className="form-grid rule-grid"><label className="field-label">Condition<select value={claimDraft.operator} onChange={(event) => setClaimDraft({ ...claimDraft, operator: event.target.value as Operator })}><option value=">=">≥</option><option value=">">&gt;</option><option value="<=">≤</option><option value="<">&lt;</option><option value="=">=</option></select></label><label className="field-label">Threshold<input type="number" step="any" value={claimDraft.threshold} onChange={(event) => setClaimDraft({ ...claimDraft, threshold: event.target.value })} placeholder="80" /></label></div><div className="form-grid"><label className="field-label">Threshold source<input value={claimDraft.thresholdSource} onChange={(event) => setClaimDraft({ ...claimDraft, thresholdSource: event.target.value })} placeholder="Policy, SLA, model card, or owner agreement" /></label><label className="field-label">Business rationale<input value={claimDraft.rationale} onChange={(event) => setClaimDraft({ ...claimDraft, rationale: event.target.value })} placeholder="Why crossing this value changes the action" /></label><label className="field-label">Confirmed by (leave blank for a preliminary diagnostic)<input value={claimDraft.confirmedBy} onChange={(event) => setClaimDraft({ ...claimDraft, confirmedBy: event.target.value })} placeholder="Example: Model Risk Owner" /></label></div><div className="modal-actions"><button type="button" className="button ghost" onClick={() => setShowAddClaim(false)}>Cancel</button><button type="submit" className="button primary">Compute and bind evidence</button></div>
      </form></section></div> : null}
      {toast ? <div className="toast" role="status"><span>✓</span>{toast}</div> : null}
    </main>
  );
}

function PageIntro({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: ReactNode }) {
  return <div className="page-intro"><div><span className="eyebrow accent">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{actions ? <div className="page-actions">{actions}</div> : null}</div>;
}

function StatusPill({ status }: { status: ClaimStatus }) {
  const meta = STATUS_META[status];
  return <span className={`status-pill ${meta.className}`} aria-label={meta.label}><i>{meta.symbol}</i><span className="status-label">{meta.label}</span></span>;
}

function StatusMix({ counts, compact = false }: { counts: Record<ClaimStatus, number>; compact?: boolean }) {
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const segments: Array<{ status: ClaimStatus; tone: string }> = [
    { status: "SUPPORTED", tone: "supported" },
    { status: "WEAKENED", tone: "weakened" },
    { status: "REVERSED", tone: "reversed" },
    { status: "REVIEW_REQUIRED", tone: "review" },
    { status: "UNTESTABLE", tone: "untestable" },
  ];
  return <div className={`status-mix ${compact ? "compact" : ""}`} role="img" aria-label={`${counts.SUPPORTED} supported, ${counts.WEAKENED} weakened, ${counts.REVERSED} reversed, ${counts.REVIEW_REQUIRED} requiring review, ${counts.UNTESTABLE} untestable`}>
    <div className="status-mix-track">{segments.map(({ status, tone }) => counts[status] ? <i key={status} className={tone} style={{ width: `${percent(counts[status], total)}%` }} /> : null)}</div>
    <div className="status-mix-legend">{segments.map(({ status, tone }) => <span key={status}><i className={tone} /><b>{STATUS_META[status].label}</b><em>{counts[status]}</em></span>)}</div>
  </div>;
}

function ExecutiveBrief({ dataset, counts, healthScore, changedRows, lastAuditAt }: { dataset: DatasetVersion; counts: Record<ClaimStatus, number>; healthScore: number; changedRows: number; lastAuditAt: string }) {
  const actionCount = counts.REVERSED + counts.WEAKENED + counts.REVIEW_REQUIRED + counts.UNTESTABLE;
  const signal = counts.REVERSED > 0 ? "Intervention required" : actionCount > 0 ? "Managed review required" : "Evidence set is clear";
  const signalTone = counts.REVERSED > 0 ? "critical" : actionCount > 0 ? "watch" : "clear";
  return <section className="executive-brief" aria-label="Executive audit readout">
    <div className="executive-copy">
      <span className="executive-kicker">EXECUTIVE READOUT / CURRENT EVIDENCE IDENTITY</span>
      <div className={`executive-signal ${signalTone}`}><i />{signal}</div>
      <h2>{actionCount ? `${actionCount} of ${Object.values(counts).reduce((sum, count) => sum + count, 0)} claims need a governed response.` : "All audited claims are ready for governed use."}</h2>
      <p>The latest run links the decision layer to verified snapshots, executable rules, primary-key records, and an independently checkable export.</p>
      <div className="executive-meta"><span><b>{healthScore}%</b> evidence coverage</span><span><b>{changedRows}</b> changed records</span><span><b>{dataset.primaryKey}</b> primary key</span></div>
    </div>
    <div className="executive-analytics">
      <div className="analytics-head"><div><span>CLAIM PORTFOLIO</span><b>Status distribution</b></div><small>Recomputed {new Date(lastAuditAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</small></div>
      <StatusMix counts={counts} />
      <div className="control-matrix"><div><span>Snapshot</span><b>{dataset.currentMeta ? "Dual version" : "Baseline only"}</b></div><div><span>Integrity</span><b>{isSnapshotVerified(dataset, "baseline") && (!dataset.currentRows || isSnapshotVerified(dataset, "current")) ? "Verified" : "Review"}</b></div><div><span>Rule engine</span><b>{dataset.ruleVersion.replace("claimtrace-rule/", "v")}</b></div><div><span>Audit mode</span><b>{dataset.dataOrigin === "PUBLIC" ? "Public data" : dataset.isDemo ? "Synthetic case" : "Local data"}</b></div></div>
    </div>
  </section>;
}

function Overview({ dataset, claims, selectedClaim, counts, healthScore, completenessChecksPassed, completenessChecksTotal, changedRows, displayLabel, lastAuditAt, sourceTraceability, calculationReproducibility, snapshotVerification, auditFreshness, activeCaseId, onLoadCase, onSelectClaim, onImport, onOpenClaims, onExport }: {
  dataset: DatasetVersion; claims: Claim[]; selectedClaim?: Claim; counts: Record<ClaimStatus, number>; healthScore: number; completenessChecksPassed: number; completenessChecksTotal: number; changedRows: number; displayLabel: string; lastAuditAt: string; sourceTraceability: number; calculationReproducibility: number; snapshotVerification: number; auditFreshness: number; activeCaseId: string | null; onLoadCase: (id: string) => void; onSelectClaim: (id: string) => void; onImport: () => void; onOpenClaims: () => void; onExport: () => void | Promise<void>;
}) {
  const activeCase = CASE_CATALOG.find((item) => item.id === activeCaseId);
  return <>
    <PageIntro eyebrow="EVIDENCE AUDIT WORKSPACE" title="Every claim should explain why it holds." description={`ClaimTrace uses the unique primary key "${dataset.primaryKey}" to bind each claim to rules, fields, exact line numbers, and SHA-256 data snapshots. Reordering records does not create false changes.`} actions={<>{!READ_ONLY_DEMO ? <button data-claimtrace-mutation="import-project" className="button ghost" onClick={onImport}>Import your project</button> : null}<button className="button primary" onClick={onOpenClaims}>View audit results <span>→</span></button></>} />
    <ExecutiveBrief dataset={dataset} counts={counts} healthScore={healthScore} changedRows={changedRows} lastAuditAt={lastAuditAt} />
    <div className="workflow-strip" aria-label="Six-step audit workflow">{["Create project", "Verify snapshots", "Define claims", "Run audit", "Evaluate decisions", "Human sign-off"].map((step, index) => <div key={step} className={index < 4 ? "done" : ""}><span>{index + 1}</span><b>{step}</b></div>)}</div>
    {activeCaseId === "population-health" ? <div className="demo-disclosure"><b>Reproducible synthetic health case</b><span>Each version contains 4,218 follow-up records and 286 validation samples. The revision adds 9 false negatives, and 20 summary derivations can be recomputed from raw primary-key sets.</span><a href="/demo-data/manifest.json" download>Generation manifest</a><a href="/cases/population-health/upstream-lineage.json" download>Upstream lineage</a><a href="/demo-data/followup-baseline.csv" download>Follow-up records</a><a href="/demo-data/validation-baseline.csv" download>Validation records</a></div> : activeCase?.synthetic === false ? <div className="demo-disclosure"><b>Reproducible external public-data case</b><span>World Bank WDI indicator data. The AuditBundle embeds fixed API responses, access date, CC BY 4.0 license, cleaning rules, and raw-response SHA-256 values, then regenerates both CSV snapshots.</span><a href={activeCase.sourceMetadataFile ?? `/cases/${activeCaseId}/source-metadata.json`} download>Source metadata</a><a href={`/cases/${activeCaseId}/cleaning-log.json`} download>Cleaning log</a><a href={`/cases/${activeCaseId}/evidence-package.json`} download>AuditBundle</a></div> : activeCaseId ? <div className="demo-disclosure"><b>Executable synthetic case</b><span>Loaded executable ClaimSpec and DecisionSpec definitions, expected audit results, and a case AuditBundle.</span><a href={`/cases/${activeCaseId}/manifest.json`} download>Case manifest</a><a href={`/cases/${activeCaseId}/evidence-package.json`} download>AuditBundle</a></div> : null}
    <div className="metric-grid">
      <article className="metric-card"><div className="metric-top"><span>Audited claims</span><i className="metric-icon ink">C</i></div><strong>{claims.length}</strong><div className="metric-meter"><i style={{ width: `${percent(claims.filter((claim) => claim.rule && claim.audit.ruleVersion === dataset.ruleVersion).length, claims.length)}%` }} /></div><small>{claims.filter((claim) => claim.rule && claim.audit.ruleVersion === dataset.ruleVersion).length}/{claims.length} bound to executable rules</small></article>
      <article className="metric-card danger"><div className="metric-top"><span>Require action</span><i className="metric-icon red">!</i></div><strong>{counts.REVERSED + counts.WEAKENED + counts.REVIEW_REQUIRED + counts.UNTESTABLE}</strong><div className="metric-meter danger"><i style={{ width: `${percent(counts.REVERSED + counts.WEAKENED + counts.REVIEW_REQUIRED + counts.UNTESTABLE, claims.length)}%` }} /></div><small>{counts.REVERSED} reversed · {counts.WEAKENED} weakened · {counts.REVIEW_REQUIRED} requiring review</small></article>
      <article className="metric-card"><div className="metric-top"><span>Data changes</span><i className="metric-icon amber">Δ</i></div><strong>{changedRows}</strong><div className="metric-meter amber"><i style={{ width: `${Math.min(100, percent(changedRows, Math.max(dataset.baselineRows.length, dataset.currentRows?.length ?? 0)))}%` }} /></div><small>Added, removed, or modified records by primary key</small></article>
      <article className="metric-card"><div className="metric-top"><span>Completeness checks passed</span><i className="metric-icon green">✓</i></div><strong>{completenessChecksPassed}<em>/{completenessChecksTotal}</em></strong><div className="metric-meter"><i style={{ width: `${percent(completenessChecksPassed, completenessChecksTotal)}%` }} /></div><small>Calculated from 16 checks per claim; not model accuracy or business impact</small></article>
    </div>
    <div className="overview-grid"><section className="panel health-panel"><div className="panel-head"><div><span className="eyebrow">AUDIT RUN STATUS</span><h2>Evidence Completeness Checks</h2></div><span className="live-badge"><i /> Computed</span></div><div className="health-body"><div className="health-ring" style={{ "--score": `${healthScore * 3.6}deg` } as CSSProperties}><div><strong>{completenessChecksPassed}/{completenessChecksTotal}</strong><span>checks passed</span></div></div><div className="health-bars"><HealthBar label="Source traceability" value={sourceTraceability} /><HealthBar label="Calculation reproducibility" value={calculationReproducibility} /><HealthBar label="Snapshot verification" value={snapshotVerification} /><HealthBar label="Audit-result freshness" value={auditFreshness} tone={auditFreshness < 100 ? "warning" : "normal"} /></div></div><div className="health-foot"><span>Last recomputation</span><b>{new Date(lastAuditAt).toLocaleString("en-US")}</b><span className="spacer" /><span>Rule</span><b>{dataset.ruleVersion}</b></div></section>
      <section className="panel claim-health-panel"><div className="panel-head"><div><span className="eyebrow">CLAIM HEALTH</span><h2>Change-Impact Queue</h2></div><button className="text-button" onClick={onOpenClaims}>View all →</button></div><div className="claim-queue">{claims.slice(0, 5).map((claim) => <button key={claim.id} className={selectedClaim?.id === claim.id ? "selected" : ""} onClick={() => onSelectClaim(claim.id)}><span className={`queue-symbol ${STATUS_META[claim.status].className}`}>{STATUS_META[claim.status].symbol}</span><span className="queue-copy"><b>{claim.title}</b><small>{claim.code} · {claim.section}</small></span><StatusPill status={claim.status} /></button>)}</div></section></div>
    <div className="bottom-grid"><section className="panel evidence-preview"><div className="panel-head"><div><span className="eyebrow">EVIDENCE-CHAIN PREVIEW</span><h2>{selectedClaim?.code ?? "—"}</h2></div></div>{selectedClaim ? <EvidenceChain claim={selectedClaim} dataset={dataset} compact /> : <EmptyState text="No claims yet" />}</section><section className="panel change-log"><div className="panel-head"><div><span className="eyebrow">VERSION FACTS</span><h2>Integrity Record</h2></div></div><ol><li className="danger"><i /><div><b>{counts.REVERSED} claims should no longer be cited</b><span>From the latest full recomputation</span></div><time>AUDIT</time></li><li className="amber"><i /><div><b>{changedRows} records changed</b><span>{displayLabel}</span></div><time>KEY</time></li><li><i /><div><b>Baseline SHA-256 {isSnapshotVerified(dataset, "baseline") ? "reverified" : "not yet reverified"}</b><span>{dataset.baselineMeta.sha256.slice(0, 16)}…</span></div><time>HASH</time></li></ol><button className="button report-button" onClick={onExport}>Generate audit report</button></section></div>
    <section className="case-library"><div className="panel-head"><div><span className="eyebrow">EXECUTABLE CASE PACKS</span><h2>Six Executable Cases: Five Synthetic and One Public-Data Case</h2></div><a href="/cases/catalog.json" download>Download catalog</a></div><div>{CASE_CATALOG.map((item) => <article key={item.id} className={activeCaseId === item.id ? "active" : ""}><span>{item.domain.toUpperCase()}</span><h3>{item.title}</h3><p>{item.question}</p><small>{item.synthetic ? "Synthetic data" : "External public data"} · {item.claimCount} executable rules · {item.decisionCount} decisions · primary key {item.primaryKey}</small><button className="button primary" onClick={() => onLoadCase(item.id)}>{activeCaseId === item.id ? "Rerun case" : "Load and audit"}</button><div><a href={item.expectedAuditFile} download>Expected results</a><a href={`/cases/${item.id}/evidence-package.json`} download>AuditBundle</a>{item.sourceMetadataFile ? <a href={item.sourceMetadataFile} download>Source and license</a> : null}<a href={item.readmeFile} download>Documentation</a></div></article>)}</div></section>
  </>;
}

function HealthBar({ label, value, tone = "normal" }: { label: string; value: number; tone?: "normal" | "warning" }) {
  return <div className="health-bar"><span>{label}</span><b>{value === 100 ? "Passed" : "Review"}</b><div><i className={tone} style={{ width: `${value}%` }} /></div></div>;
}

function ClaimsView({ claims, selectedClaim, dataset, filter, search, counts, onFilter, onSearch, onSelect, onAdd, onExport }: { claims: Claim[]; selectedClaim?: Claim; dataset: DatasetVersion; filter: "all" | ClaimStatus; search: string; counts: Record<ClaimStatus, number>; onFilter: (value: "all" | ClaimStatus) => void; onSearch: (value: string) => void; onSelect: (id: string) => void; onAdd: () => void; onExport: () => void }) {
  const filterItems: Array<{ id: "all" | ClaimStatus; label: string; count: number }> = [
    { id: "all", label: "All", count: Object.values(counts).reduce((a, b) => a + b, 0) },
    { id: "REVERSED", label: "Reversed", count: counts.REVERSED },
    { id: "WEAKENED", label: "Weakened", count: counts.WEAKENED },
    { id: "SUPPORTED", label: "Supported", count: counts.SUPPORTED },
    { id: "UNTESTABLE", label: "Untestable", count: counts.UNTESTABLE },
    { id: "REVIEW_REQUIRED", label: "Review required", count: counts.REVIEW_REQUIRED },
  ];
  return <><PageIntro eyebrow="CLAIM-LEVEL TRACEABILITY" title="Claims and Evidence" description="Claim status always comes from the latest complete audit. Switching data views does not rewrite status, and exports never inherit presentation state." actions={<><button className="button ghost" onClick={onExport}>Export audit report</button>{!READ_ONLY_DEMO ? <button data-claimtrace-mutation="create-claim" className="button primary" onClick={onAdd}>＋ Add testable claim</button> : null}</>} />
    <section className="claim-portfolio-summary"><div><span className="eyebrow">PORTFOLIO SIGNAL</span><h2>{counts.REVERSED ? `${counts.REVERSED} claims are no longer safe to cite` : counts.REVIEW_REQUIRED ? `${counts.REVIEW_REQUIRED} claims need human review` : "No reversed claims in the current run"}</h2><p>Filter the portfolio without changing the computed result identity.</p></div><StatusMix counts={counts} compact /><div className="portfolio-kpis"><span><b>{Object.values(counts).reduce((sum, count) => sum + count, 0)}</b>Total</span><span className="critical"><b>{counts.REVERSED + counts.WEAKENED}</b>Material</span><span><b>{counts.SUPPORTED}</b>Supported</span></div></section>
    <div className="claim-toolbar"><div className="filter-tabs">{filterItems.map((item) => <button key={item.id} className={filter === item.id ? "active" : ""} onClick={() => onFilter(item.id)}>{item.label}<span>{item.count}</span></button>)}</div><label className="search-box"><span>⌕</span><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search claim, code, or category" /></label></div><div className="claims-layout"><section className="claim-list" aria-label="Claim list">{claims.length ? claims.map((claim) => <button key={claim.id} className={selectedClaim?.id === claim.id ? "active" : ""} onClick={() => onSelect(claim.id)}><div className="claim-list-top"><span>{claim.code}</span><StatusPill status={claim.status} /></div><h3>{claim.title}</h3><p>{claim.section} · {claim.owner}</p><div className="value-shift"><span>{claim.baselineValue}</span><b>→</b><span>{claim.currentValue}</span></div></button>) : <EmptyState text="No matching claims" />}</section>{selectedClaim ? <ClaimDetail claim={selectedClaim} dataset={dataset} /> : <section className="panel"><EmptyState text="Select a claim to inspect its evidence" /></section>}</div></>;
}

function ClaimDetail({ claim, dataset }: { claim: Claim; dataset: DatasetVersion }) {
  const completeness = computeEvidenceCompleteness(claim, dataset);
  const thresholdSpec = claim.rule?.type === "threshold" ? claim.rule.thresholdSpec : claim.rule?.type === "stability" ? claim.rule.supportToleranceSpec : undefined;
  const reversalSpec = claim.rule?.type === "stability" ? claim.rule.reversalThresholdSpec : undefined;
  return <article className="claim-detail"><div className="claim-detail-head"><div><span className="claim-code">{claim.code} · {claim.category} · {claim.kind === "SNAPSHOT" ? "Snapshot claim" : "Version-comparison claim"}</span><h2>{claim.title}</h2><p>{claim.section} · Owner: {claim.owner}</p></div><StatusPill status={claim.status} /></div><div className={`impact-callout ${STATUS_META[claim.status].className}`}><span className="impact-icon">{STATUS_META[claim.status].symbol}</span><div><b>{claim.reason}</b><p>Recommended action: {claim.action}</p></div></div><div className="comparison-strip"><div><span>Baseline calculation</span><b>{claim.baselineValue}</b></div><i>→</i><div><span>Current calculation</span><b>{claim.currentValue}</b></div><div className="confidence"><span>Completeness checks passed</span><b>{completeness.passed}/{completeness.total}</b><small>Not model accuracy or business impact</small></div></div>{completeness.missing.length ? <div className="completeness-warning">Missing evidence: {completeness.missing.join(", ")}</div> : null}<section className="detail-section"><div className="detail-title"><div><span className="eyebrow">FULL LINEAGE</span><h3>Claim Evidence Chain</h3></div><small>{dataset.upstreamLineage ? "Claim → rule result → summary row → aggregation rule → raw primary keys → SHA-256 snapshot" : "Claim → rule result → field → primary-key records → SHA-256 snapshot"}</small></div><EvidenceChain claim={claim} dataset={dataset} /></section><div className="detail-two-col"><section className="detail-section"><div className="detail-title"><h3>Rule and Sample Definition</h3><span className={claim.audit.preliminary ? "amber-text" : "verified"}>{claim.audit.preliminary ? "Preliminary diagnostic" : `✓ ${claim.audit.ruleVersion}`}</span></div><div className="formula-box"><span>FORMULA</span><code>{claim.formula}</code></div>{thresholdSpec ? <div className="provenance-box"><b>Support-threshold source: {thresholdSpec.source}</b><span>{thresholdSpec.rationale}</span><small>{thresholdSpec.confirmedBy ? `Confirmed by ${thresholdSpec.confirmedBy} · ${new Date(thresholdSpec.confirmedAt ?? "").toLocaleString("en-US")}` : "No confirmer; formal sign-off is unavailable"}</small></div> : null}{claim.rule?.type === "stability" ? <div className="provenance-box"><b>Reversal threshold: {claim.rule.reversalThreshold ?? "Not set"}</b><span>{reversalSpec?.rationale ?? "After the support threshold is exceeded, require review instead of applying an automatic multiplier."}</span><small>{reversalSpec?.confirmedBy ? `Confirmed by ${reversalSpec.confirmedBy} · ${new Date(reversalSpec.confirmedAt ?? "").toLocaleString("en-US")}` : "Reversal threshold has not been independently confirmed"}</small></div> : null}{claim.sampleProfiles ? <div className="sample-grid"><div><span>Baseline valid / total</span><b>{claim.sampleProfiles.baseline.effectiveRows} / {claim.sampleProfiles.baseline.totalRows}</b><small>Missing {claim.sampleProfiles.baseline.missingRows}</small></div><div><span>Current valid / total</span><b>{claim.sampleProfiles.current?.effectiveRows ?? "—"} / {claim.sampleProfiles.current?.totalRows ?? "—"}</b><small>Missing {claim.sampleProfiles.current?.missingRows ?? "—"}</small></div></div> : null}<p className="audit-time">Generated: {new Date(claim.audit.lastRunAt).toLocaleString("en-US")}</p></section><section className="detail-section"><div className="detail-title"><h3>Record-Level Location</h3><span>{claim.sourceRefs.length} exported references</span></div>{claim.evidenceScope ? <div className="scope-note">Baseline {claim.evidenceScope.sides.baseline.exportedReferences}/{claim.evidenceScope.sides.baseline.matchingRows} · current {claim.evidenceScope.sides.current?.exportedReferences ?? 0}/{claim.evidenceScope.sides.current?.matchingRows ?? 0}; paired changed keys {claim.evidenceScope.pairedChangedKeys}, boundary records {(claim.evidenceScope.sides.baseline.boundaryReferences + (claim.evidenceScope.sides.current?.boundaryReferences ?? 0))}, deterministic samples {(claim.evidenceScope.sides.baseline.sampledReferences + (claim.evidenceScope.sides.current?.sampledReferences ?? 0))}. {claim.evidenceScope.truncated ? "Truncated at the scale limit." : "All matching records are covered."}</div> : null}<div className="source-list">{claim.sourceRefs.slice(0, 12).map((ref) => <div key={`${ref.snapshot}-${ref.fileName}-${ref.lineNumber}-${ref.keyValue}`}><b>{ref.snapshot === "baseline" ? "Baseline" : "Current"} · {ref.keyField}={ref.keyValue}</b><span>{ref.fileName} · line {ref.lineNumber} · fields {ref.fields.join(" + ")}</span><code>sha256:{ref.sha256.slice(0, 16)}…</code></div>)}{claim.sourceRefs.length > 12 ? <p>The remaining {claim.sourceRefs.length - 12} extracted references are included in the exported AuditBundle.</p> : null}</div></section></div><footer className="claim-signoff"><div><span>Engine status</span><b>{claim.governance.engineStatus}</b></div><div><span>Review disposition</span><b>{claim.governance.reviewDisposition}</b></div><div><span>Release status</span><b className={claim.governance.releaseStatus === "APPROVED_FOR_USE" ? "green-text" : "red-text"}>{claim.governance.releaseStatus}</b></div><button className="button ghost" onClick={() => window.print()}>Print this evidence</button></footer></article>;
}

function EvidenceChain({ claim, dataset, compact = false }: { claim: Claim; dataset: DatasetVersion; compact?: boolean }) {
  const completeNodes = completeEvidence(claim, dataset);
  const nodes = compact ? completeNodes.slice(0, 5) : completeNodes;
  return <div className={`evidence-chain ${compact ? "compact" : ""}`}>{nodes.map((node, index) => <div className="evidence-node" key={`${node.kind}-${index}`}><span className="node-index">{String(index + 1).padStart(2, "0")}</span><small>{node.kind}</small><b>{node.title}</b><p>{node.detail}</p>{index < nodes.length - 1 ? <i className="connector">→</i> : null}</div>)}</div>;
}

function DataView({ dataset, changedRows, revisionVisible, onToggleRevision, onImport, onNewProject }: { dataset: DatasetVersion; changedRows: number; revisionVisible: boolean; onToggleRevision: () => void; onImport: () => void; onNewProject: () => void }) {
  const visibleColumns = dataset.columns.filter((column) => column !== dataset.primaryKey).slice(0, 4);
  const diffs = dataset.currentRows ? diffRowsByKey(dataset) : [];
  const displayDiffs: RowDiff[] = revisionVisible && dataset.currentRows ? diffs.slice(0, 12) : dataset.baselineRows.slice(0, 12).map((row, index) => ({ key: String(row[dataset.primaryKey]), kind: "unchanged", changedFields: [], baseline: row, baselineLine: dataset.baselineLineNumbers[index] }));
  const kindLabel = { unchanged: "Unchanged", changed: "Modified", added: "Added", removed: "Removed" };
  const diffCounts = {
    unchanged: diffs.filter((diff) => diff.kind === "unchanged").length,
    changed: diffs.filter((diff) => diff.kind === "changed").length,
    added: diffs.filter((diff) => diff.kind === "added").length,
    removed: diffs.filter((diff) => diff.kind === "removed").length,
  };
  const totalKeys = diffs.length || dataset.baselineRows.length;
  return <><PageIntro eyebrow="VERSION-AWARE DATA" title="Data Versions and Changes" description={`Versions are aligned by the unique primary key "${dataset.primaryKey}". Row reordering is not counted as a change; additions, deletions, and field modifications are recorded separately.`} actions={!READ_ONLY_DEMO ? <><button data-claimtrace-mutation="import-project" className="button ghost" onClick={onNewProject}>Import new project</button><button data-claimtrace-mutation="import-revision" className="button primary" onClick={onImport}>＋ Import current CSV</button></> : undefined} />
    <section className="diff-intelligence"><div className="diff-intro"><span className="eyebrow">VERSION DELTA</span><h2>{dataset.currentRows ? `${percent(changedRows, totalKeys)}% of aligned keys changed` : "Import a current snapshot to calculate change"}</h2><p>Every segment is calculated after primary-key alignment; record order is ignored.</p></div><div className="diff-visual"><div className="diff-track" role="img" aria-label={`${diffCounts.unchanged} unchanged, ${diffCounts.changed} modified, ${diffCounts.added} added, ${diffCounts.removed} removed`}><i className="unchanged" style={{ width: `${percent(diffCounts.unchanged || (!diffs.length ? totalKeys : 0), totalKeys)}%` }} /><i className="changed" style={{ width: `${percent(diffCounts.changed, totalKeys)}%` }} /><i className="added" style={{ width: `${percent(diffCounts.added, totalKeys)}%` }} /><i className="removed" style={{ width: `${percent(diffCounts.removed, totalKeys)}%` }} /></div><div className="diff-stats"><span><i className="unchanged" /><b>{diffCounts.unchanged || (!diffs.length ? totalKeys : 0)}</b>Unchanged</span><span><i className="changed" /><b>{diffCounts.changed}</b>Modified</span><span><i className="added" /><b>{diffCounts.added}</b>Added</span><span><i className="removed" /><b>{diffCounts.removed}</b>Removed</span></div></div></section>
    <div className="version-cards"><article className={!revisionVisible ? "active" : ""}><div className="version-card-top"><span className="version-tag baseline">BASELINE</span><span>{isSnapshotVerified(dataset, "baseline") ? "SHA-256 verified" : "Verification incomplete"}</span></div><h2>{dataset.baselineName}</h2><p>{dataset.baselineRows.length} records · primary key {dataset.primaryKey}</p><div className="hash-line"><span>{dataset.baselineMeta.fileName}</span><code>{dataset.baselineMeta.sha256}</code><small>Snapshot time {new Date(dataset.baselineMeta.generatedAt).toLocaleString("en-US")}</small></div><button onClick={() => revisionVisible && onToggleRevision()}>View baseline data</button></article><div className="version-arrow"><span>Compare by primary key</span>→</div><article className={revisionVisible ? "active current" : "current"}><div className="version-card-top"><span className="version-tag current">CURRENT</span><span>{dataset.currentMeta && isSnapshotVerified(dataset, "current") ? "SHA-256 verified" : "Awaiting import"}</span></div><h2>{dataset.currentName ?? "No current version imported"}</h2><p>{dataset.currentRows ? `${dataset.currentRows.length} records · ${changedRows} changes` : "Import to deterministically recompute every claim"}</p>{dataset.currentMeta ? <div className="hash-line"><span>{dataset.currentMeta.fileName}</span><code>{dataset.currentMeta.sha256}</code><small>Snapshot time {new Date(dataset.currentMeta.generatedAt).toLocaleString("en-US")}</small></div> : <div className="hash-line"><span>No current-version hash</span></div>}<button disabled={!dataset.currentRows} onClick={() => !revisionVisible && onToggleRevision()}>View current data</button></article></div><section className="panel data-table-panel"><div className="panel-head"><div><span className="eyebrow">PRIMARY-KEY DIFF</span><h2>{revisionVisible && dataset.currentRows ? "Record-Level Version Differences" : "Baseline Records"}</h2></div><div className="table-legend"><span><i className="old" />Baseline value</span><span><i className="new" />Current value</span></div></div><div className="table-wrap"><table><thead><tr><th>Status</th><th>{dataset.primaryKey}</th><th>Line</th>{visibleColumns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{displayDiffs.map((diff) => { const beforeRow = diff.baseline; const afterRow = diff.current ?? diff.baseline; return <tr key={diff.key}><td><span className={`diff-kind ${diff.kind}`}>{kindLabel[diff.kind]}</span></td><td>{diff.key}</td><td>{diff.baselineLine ? `B:${diff.baselineLine}` : "—"}{diff.currentLine ? ` / C:${diff.currentLine}` : ""}</td>{visibleColumns.map((column) => { const before = beforeRow?.[column] ?? ""; const after = afterRow?.[column] ?? ""; const changed = diff.changedFields.includes(column) || diff.kind === "added" || diff.kind === "removed"; return <td key={column}>{changed ? <span className="cell-change"><del>{String(before) || "∅"}</del><ins>{String(after) || "∅"}</ins></span> : <span>{String(after)}</span>}</td>; })}</tr>; })}</tbody></table></div><footer className="table-foot"><span>Showing first {Math.min(12, displayDiffs.length)} · {dataset.currentRows ? diffs.length : dataset.baselineRows.length} total primary keys</span><span>{dataset.baselineMeta.fileName} · processed locally in the browser</span></footer></section></>;
}

function DecisionView({ decisions, results, claims }: { decisions: DecisionSpec[]; results: ReturnType<typeof evaluateDecision>[]; claims: Claim[] }) {
  const statusLabel = (result?: DecisionResult) => result?.status === "DECISION_CHANGED"
    ? "Action changed"
    : result?.status === "RESIGN_REQUIRED"
      ? "Re-sign required"
      : result?.status === "REVIEW_REQUIRED"
        ? "Review required"
        : result?.comparisonBasis === "NO_HISTORY"
          ? "Current result is computable"
          : "Action unchanged";
  const changedDecisions = results.filter((result) => result.status === "DECISION_CHANGED").length;
  const resignDecisions = results.filter((result) => result.status === "RESIGN_REQUIRED").length;
  const reviewDecisions = results.filter((result) => result.status === "REVIEW_REQUIRED").length;
  return <>
    <PageIntro eyebrow="CLAIM → DECISION" title="Does the change actually alter the action?" description="Only a change in outcome, stable action identity, recommendation, or feasible action set counts as an action change. Snapshot, rule, or evidence-identity updates alone trigger re-signing instead." />
    <section className="decision-portfolio"><div className="decision-portfolio-copy"><span className="eyebrow">DECISION PORTFOLIO</span><h2>{changedDecisions ? `${changedDecisions} recommended action${changedDecisions === 1 ? " has" : "s have"} materially changed` : resignDecisions ? `${resignDecisions} decision${resignDecisions === 1 ? " needs" : "s need"} renewed sign-off` : "Current action identities remain stable"}</h2><p>Evidence identity and action identity are monitored separately.</p></div><div className="decision-flow"><span><i>01</i><b>{claims.length}</b>Bound claims</span><em>→</em><span><i>02</i><b>{decisions.length}</b>Policies</span><em>→</em><span className={changedDecisions || reviewDecisions ? "attention" : "clear"}><i>03</i><b>{changedDecisions + resignDecisions + reviewDecisions}</b>Governance events</span></div></section>
    <div className="decision-grid">{decisions.map((decision) => {
      const result = results.find((item) => item.decisionId === decision.id);
      const recommended = result?.analysis?.options.find((option) => option.optionId === result.analysis?.recommendedOptionId);
      const provenance = decision.inputProvenance;
      const feasibleScores = result?.analysis?.options.filter((option) => option.feasible).map((option) => option.score) ?? [];
      const minScore = feasibleScores.length ? Math.min(...feasibleScores) : 0;
      const maxScore = feasibleScores.length ? Math.max(...feasibleScores) : 1;
      const scoreWidth = (score: number) => maxScore === minScore ? 100 : Math.max(10, Math.min(100, 10 + ((score - minScore) / (maxScore - minScore)) * 90));
      return <article className="panel decision-card" key={decision.id}>
        <header><div><span className="eyebrow">DECISION POLICY</span><h2>{decision.title}</h2><p>Owner: {decision.owner}{decision.stakeholders?.length ? ` · Stakeholders: ${decision.stakeholders.join(", ")}` : ""}</p></div><span className={`decision-state ${result?.status.toLowerCase()}`}>{statusLabel(result)}</span></header>
        <div className="decision-outcomes"><div><span>Recorded prior sign-off identity{result?.previousVersionId ? ` · ${result.previousVersionId}` : ""}</span><b>{result?.previousOutcome ?? "No history"} · {result?.previousRecommendedOptionId ?? "No recommendation"}</b></div><i>→</i><div><span>Current outcome and recommendation</span><b>{result?.currentOutcome ?? "—"} · {result?.binding.recommendedOptionId ?? "No recommendation"}</b></div></div>
        <p className="decision-reason">{result?.reason}</p>
        {provenance ? <div className="provenance-box"><b>{provenance.kind === "MANUAL_ASSUMPTION" ? "Manual assumption inputs" : "Data-derived inputs"} · {provenance.version}</b><span>{provenance.source}</span><small>{provenance.rationale} · Units: benefit {provenance.units.benefit} / cost {provenance.units.cost} / risk {provenance.units.risk} / capacity {provenance.units.capacity}</small></div> : <div className="completeness-warning">Benefit, cost, risk, and capacity provenance and units have not been declared.</div>}
        {result?.analysis ? <div className="decision-analysis"><div className="analysis-title"><b>Multi-Option Scoring</b><span>Constraint-screened</span></div>{result.analysis.options.map((option) => <div className={`option-score ${option.optionId === recommended?.optionId ? "recommended" : ""} ${option.feasible ? "" : "eliminated"}`} key={option.optionId}><div><span>{option.label}{option.paretoEfficient ? " · Pareto frontier" : ""}</span><strong>{option.feasible ? option.score : "Eliminated"}</strong></div><div className="score-track"><i style={{ width: option.feasible ? `${scoreWidth(option.score)}%` : "4%" }} /></div><small>{option.failedConstraints.join(", ") || (option.optionId === recommended?.optionId ? "Current recommendation" : "Feasible")} · score interval {option.scoreInterval?.min ?? "—"} to {option.scoreInterval?.max ?? "—"} · break-even benefit {option.breakEvenBenefit ?? "—"}</small></div>)}<div className="analysis-notes"><p>Scenario sensitivity: {result.analysis.sensitivity.map((item) => `${item.label}→${item.recommendedOptionId ?? "no feasible option"}`).join("; ")}</p><p>Recommendation stability: benefit multiplier {result.analysis.recommendationStability.min}–{result.analysis.recommendationStability.max} preserves {result.analysis.recommendationStability.recommendedOptionId ?? "no recommendation"} (step {result.analysis.recommendationStability.step}).</p><p>Pareto frontier: {result.analysis.paretoFrontierOptionIds.join(", ") || "no feasible option"}.</p></div>{result.analysis.monteCarlo ? <div className="monte-carlo-chart"><div><b>Fixed-seed stability exercise</b><span>{result.analysis.monteCarlo.trials} bounded-uniform trials · not a predictive probability</span></div>{result.analysis.monteCarlo.recommendationShares.map((item) => <div className="scenario-bar" key={item.optionId}><span>{item.optionId}</span><div><i style={{ width: `${item.share * 100}%` }} /></div><b>{(item.share * 100).toFixed(1)}%</b></div>)}</div> : null}</div> : null}
        <div className="decision-conditions">{decision.conditions.map((condition) => { const claim = claims.find((item) => item.id === condition.claimId); return <div key={condition.claimId}><span>{claim?.code ?? condition.claimId}</span><b>{claim?.title ?? "Claim does not exist"}</b>{claim ? <><StatusPill status={claim.status} /><small>Release: {claim.governance.releaseStatus}</small></> : null}</div>; })}</div>
        <footer>{result?.currentOutcome === "PASS" ? decision.actionIfPass : decision.actionIfFail}<small>Action ID: {result?.binding.activeActionId ?? "—"}</small></footer>
      </article>;
    })}</div>
  </>;
}

function ReviewView({ claims, decisions, records, onReview, onDecisionReview }: { claims: Claim[]; decisions: DecisionResult[]; records: ReviewRecord[]; onReview: (claimId: string, disposition: ReviewRecord["disposition"], reviewer: string, note: string) => void; onDecisionReview: (decisionId: string, disposition: ReviewRecord["disposition"], reviewer: string, note: string) => void }) {
  const [reviewer, setReviewer] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const pending = claims.filter((claim) => claim.governance.releaseStatus === "BLOCKED");
  const pendingDecisions = decisions.filter((decision) => decision.governance.releaseStatus === "BLOCKED");
  const releasedClaims = claims.length - pending.length;
  const releasedDecisions = decisions.length - pendingDecisions.length;
  const submit = (claim: Claim, disposition: ReviewRecord["disposition"]) => onReview(claim.id, disposition, reviewer.trim(), (notes[claim.id] ?? "").trim());
  const submitDecision = (decision: DecisionResult, disposition: ReviewRecord["disposition"]) => onDecisionReview(decision.decisionId, disposition, reviewer.trim(), (notes[`decision:${decision.decisionId}`] ?? "").trim());
  const description = READ_ONLY_DEMO
    ? "Read-only portfolio mode displays engine status, human disposition, and release status only. Reviewer identity, notes, return, risk-acceptance, and sign-off controls are not rendered."
    : "Engine status, human disposition, and release status are stored separately. Display names are local records, not authenticated identities. A downstream decision can be approved only after every bound claim has been signed off.";
  return <>
    <PageIntro eyebrow="HUMAN GOVERNANCE" title="Human Review and Locally Recorded, Unauthenticated Sign-Offs" description={description} />
    <section className="governance-pipeline"><div><span className="eyebrow">RELEASE PIPELINE</span><h2>Governance state at a glance</h2></div><div className="pipeline-stage"><i>01</i><span>Engine evaluated</span><b>{claims.length + decisions.length}</b><em>100%</em></div><div className="pipeline-line"><i /></div><div className="pipeline-stage review"><i>02</i><span>Awaiting review</span><b>{pending.length + pendingDecisions.length}</b><em>{percent(pending.length + pendingDecisions.length, claims.length + decisions.length)}%</em></div><div className="pipeline-line"><i style={{ width: `${percent(releasedClaims + releasedDecisions, claims.length + decisions.length)}%` }} /></div><div className="pipeline-stage release"><i>03</i><span>Released for use</span><b>{releasedClaims + releasedDecisions}</b><em>{percent(releasedClaims + releasedDecisions, claims.length + decisions.length)}%</em></div></section>
    {READ_ONLY_DEMO
      ? <div className="readonly-governance-notice" role="status"><b>Read-only portfolio mode</b><span>Review and sign-off controls are disabled. The content below displays governance state and existing records only.</span></div>
      : <div className="review-identity"><label>Reviewer display name (identity not verified)<input data-claimtrace-mutation="review-identity" value={reviewer} onChange={(event) => setReviewer(event.target.value)} placeholder="Enter a name or role; stored locally without identity authentication" /><small>ClaimTrace does not currently verify identity, role authorization, or trusted time.</small></label></div>}
    <div className="review-layout">
      <section className="panel review-queue">
        <div className="panel-head"><div><span className="eyebrow">REVIEW QUEUE</span><h2>Pending Claims and Decisions</h2></div><span>{pending.length + pendingDecisions.length} items</span></div>
        {pending.length ? pending.map((claim) => {
          const canApprove = ["SUPPORTED", "WEAKENED"].includes(claim.status);
          const canRiskAccept = claim.status === "REVERSED";
          return <article key={claim.id}><div><span>{claim.code} · {claim.kind === "SNAPSHOT" ? "Snapshot claim" : "Version-comparison claim"}</span><h3>{claim.title}</h3><p>{claim.reason}</p><small>Engine: {claim.governance.engineStatus} · review: {claim.governance.reviewDisposition} · release: {claim.governance.releaseStatus}</small>{READ_ONLY_DEMO ? <p className="readonly-review-copy">Read-only portfolio mode does not accept review notes or sign-off actions.</p> : <textarea data-claimtrace-mutation="claim-review-note" value={notes[claim.id] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [claim.id]: event.target.value }))} placeholder={canRiskAccept ? "State the business rationale for accepting reversal risk (at least 10 characters)" : "Document the threshold, denominator, evidence, and sign-off judgment"} />}</div><StatusPill status={claim.status} />{!READ_ONLY_DEMO ? <div className="review-actions"><button data-claimtrace-mutation="claim-return" onClick={() => submit(claim, "CHANGES_REQUESTED")}>Return for changes</button>{canApprove ? <button data-claimtrace-mutation="claim-approve" className="approve" onClick={() => submit(claim, "APPROVED")}>Confirm local sign-off</button> : null}{canRiskAccept ? <button data-claimtrace-mutation="claim-risk-accept" className="risk" onClick={() => submit(claim, "RISK_ACCEPTED")}>Accept risk and override</button> : null}</div> : null}</article>;
        }) : <EmptyState text="No claims currently require review" />}
        {pendingDecisions.map((decision) => {
          const canApprove = decision.status === "SUPPORTED";
          const needsResign = ["DECISION_CHANGED", "RESIGN_REQUIRED"].includes(decision.status);
          const canRiskAccept = decision.status === "DECISION_CHANGED";
          const unreleased = decision.boundClaimIds.filter((claimId) => !["APPROVED_FOR_USE", "APPROVED_WITH_RISK"].includes(claims.find((claim) => claim.id === claimId)?.governance.releaseStatus ?? "BLOCKED"));
          const noteKey = `decision:${decision.decisionId}`;
          const placeholder = decision.status === "RESIGN_REQUIRED" ? "Confirm that the new snapshot, rule, or evidence identity was checked" : needsResign ? "Explain why the new recommendation, feasible set, or decision outcome is being signed" : "Enter a reason to sign off or return the decision";
          return <article key={noteKey} className="decision-review"><div><span>DECISION · {decision.decisionId}</span><h3>{decision.previousOutcome ?? "No sign-off history"} → {decision.currentOutcome}</h3><p>{decision.reason}</p>{unreleased.length ? <p className="completeness-warning">Upstream claims not released: {unreleased.join(", ")}. This decision cannot currently be signed off.</p> : null}<small>Engine: {decision.governance.engineStatus} · review: {decision.governance.reviewDisposition} · release: {decision.governance.releaseStatus}</small>{READ_ONLY_DEMO ? <p className="readonly-review-copy">Read-only portfolio mode does not accept decision-review notes or sign-off actions.</p> : <textarea data-claimtrace-mutation="decision-review-note" value={notes[noteKey] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [noteKey]: event.target.value }))} placeholder={placeholder} />}</div>{!READ_ONLY_DEMO ? <div className="review-actions"><button data-claimtrace-mutation="decision-return" onClick={() => submitDecision(decision, "CHANGES_REQUESTED")}>Return decision</button>{canApprove ? <button data-claimtrace-mutation="decision-approve" disabled={unreleased.length > 0} className="approve" onClick={() => submitDecision(decision, "APPROVED")}>Sign off decision</button> : null}{needsResign ? <button data-claimtrace-mutation="decision-resign" disabled={unreleased.length > 0} className="approve" onClick={() => submitDecision(decision, "RESIGNED")}>Re-sign</button> : null}{canRiskAccept ? <button data-claimtrace-mutation="decision-risk-accept" disabled={unreleased.length > 0} className="risk" onClick={() => submitDecision(decision, "RISK_ACCEPTED")}>Accept change risk</button> : null}</div> : null}</article>;
        })}
      </section>
      <section className="panel audit-log"><div className="panel-head"><div><span className="eyebrow">APPEND-ONLY LOG</span><h2>Local, Unauthenticated Sign-Off Records</h2></div><span>{records.length} records</span></div>{records.length ? <ol>{[...records].reverse().map((record) => <li key={record.id}><b>{record.disposition === "APPROVED" ? "Signed off locally" : record.disposition === "RESIGNED" ? "Re-signed locally" : record.disposition === "RISK_ACCEPTED" ? "Risk accepted" : "Returned"} · {record.claimId ?? record.decisionId}</b><span>{record.reviewer} (identity not verified) · {new Date(record.createdAt).toLocaleString("en-US")}</span><p>{record.note}</p><code>uuid:{record.id} · result:{record.targetResultId.slice(0, 24)}… · sha256:{record.recordHash.slice(0, 16)}…</code></li>)}</ol> : <EmptyState text="No local, unauthenticated sign-off records yet" />}</section>
    </div>
  </>;
}

function ReportView({ dataset, claims, counts, completenessChecksPassed, completenessChecksTotal, displayLabel, lastAuditAt, onExport, onCopy }: { dataset: DatasetVersion; claims: Claim[]; counts: Record<ClaimStatus, number>; completenessChecksPassed: number; completenessChecksTotal: number; displayLabel: string; lastAuditAt: string; onExport: () => void | Promise<void>; onCopy: () => void }) {
  return <><PageIntro eyebrow="AUDIT HANDOFF" title="Audit Report" description="The HTML report is generated from the same independently verified AuditBundle and covers claims, decisions, input provenance, the local unauthenticated review chain, and the canonical root hash." actions={<><button className="button ghost" onClick={onCopy}>Copy summary</button><button className="button primary" onClick={onExport}>Download complete HTML report</button></>} /><article className="report-sheet"><header><div className="report-brand"><span className="brand-mark dark"><i /><i /><i /></span><b>ClaimTrace</b></div><span className="report-label">EVIDENCE & DECISION AUDIT / {new Date().getFullYear()}</span></header><div className="report-title"><span>VERSIONED EVIDENCE AND DECISION AUDIT REPORT</span><h1>{dataset.projectName}</h1><p>Showing: {displayLabel} · primary key: {dataset.primaryKey} · rule: {dataset.ruleVersion}</p></div><div className="report-summary"><div className="report-score"><strong>{completenessChecksPassed}/{completenessChecksTotal}</strong><span>completeness<br />checks passed</span></div><div><h2>Executive Summary</h2><p>Audited <b>{claims.length}</b> claims: <b className="red-text">{counts.REVERSED} reversed</b>, <b className="amber-text">{counts.WEAKENED} weakened</b>, {counts.UNTESTABLE} untestable, {counts.REVIEW_REQUIRED} requiring review, and {counts.SUPPORTED} supported. The ratio comes from 16 completeness checks per claim; it is not model accuracy or business impact.</p></div></div><div className="report-status-visual"><div><span>CLAIM PORTFOLIO</span><b>Current audit distribution</b></div><StatusMix counts={counts} compact /></div><section className="report-section"><h2>Immediate Action Required</h2><div className="report-alerts">{claims.filter((claim) => claim.status === "REVERSED").map((claim) => <div key={claim.id}><span>{claim.code}</span><div><b>{claim.title}</b><p>{claim.action}</p></div></div>)}{!counts.REVERSED ? <p className="all-clear">No claims are currently reversed.</p> : null}</div></section><section className="report-section"><h2>Claim-by-Claim Audit Results</h2><div className="report-table"><div className="report-row heading"><span>Code</span><span>Claim</span><span>Baseline</span><span>Current</span><span>Status</span></div>{claims.map((claim) => <div className="report-row" key={claim.id}><span>{claim.code}</span><span>{claim.title}</span><span>{claim.baselineValue}</span><span>{claim.currentValue}</span><span><StatusPill status={claim.status} /></span></div>)}</div></section><footer><p>Engine status, human disposition, and release status are stored separately; local display names are not authenticated.</p><div><span>Last recomputation: {new Date(lastAuditAt).toLocaleString("en-US")}</span><span>Baseline SHA-256: {dataset.baselineMeta.sha256.slice(0, 16)}…</span></div></footer></article></>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty-state"><span>∅</span><p>{text}</p></div>;
}
