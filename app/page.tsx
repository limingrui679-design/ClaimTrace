"use client";

import {
  type ChangeEvent,
  type FormEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  RULE_ENGINE_VERSION,
  type Aggregation,
  type Claim,
  type ClaimStatus,
  type DecisionResult,
  type DecisionSpec,
  type DatasetVersion,
  type Operator,
  type ReviewRecord,
  type Rule,
  appendReviewRecord,
  applyReviewToClaim,
  applyReviewToDecision,
  auditSummary,
  buildHtmlReport,
  createReviewRecord,
  enforceDecisionReleaseDependencies,
  evaluateDecision,
  hashClaimResult,
  hashDecisionResult,
  isSnapshotVerified,
  makeImportedClaims,
  numericColumns,
  recomputeClaim,
  sameColumnSet,
  uniqueKeyCandidates,
  verifyDataset,
} from "./claimtrace-core";
import {
  AGGREGATION_LABELS,
  CLAIMTRACE_COMMIT,
  CLAIMTRACE_VERSION,
  DEMO_AUDIT_AT,
  DEMO_CLAIMS,
  DEMO_DATASET,
  DEMO_DECISIONS,
  NAV_ITEMS,
  READ_ONLY_DEMO,
  type View,
  percent,
} from "./workspace-config";
import {
  ClaimsView,
  DataView,
  DecisionView,
  Overview,
  ReportView,
  ReviewView,
} from "./views";
import { DatasetIntentCoordinator } from "./workflows/dataset-intent";
import { prepareVerifiedBundle as buildVerifiedBundle } from "./workflows/audit-export";
import { loadExecutableCase } from "./workflows/case-loader";
import {
  type FileSnapshot,
  alignFileSnapshotColumns,
  assertValidKey,
  readCsvFile,
} from "./workflows/import-workflow";

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
  const [caseLoadingId, setCaseLoadingId] = useState<string | null>(null);
  const [operationBusy, setOperationBusy] = useState(false);
  const [claimDraft, setClaimDraft] = useState({ title: "", field: "", aggregation: "average" as Aggregation, operator: ">=" as Operator, threshold: "", thresholdSource: "", rationale: "", confirmedBy: "" });
  const revisionInputRef = useRef<HTMLInputElement>(null);
  const datasetIntentRef = useRef(new DatasetIntentCoordinator());
  const operationInFlightRef = useRef(false);

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

  async function runExclusiveOperation(operation: (datasetIntent: number) => Promise<void>) {
    if (operationInFlightRef.current) {
      showToast("Another audit, export, or review operation is still in progress");
      return;
    }
    operationInFlightRef.current = true;
    setOperationBusy(true);
    const datasetIntent = datasetIntentRef.current.current();
    try {
      await operation(datasetIntent);
    } finally {
      operationInFlightRef.current = false;
      setOperationBusy(false);
    }
  }

  function beginDatasetIntent() {
    const datasetIntent = datasetIntentRef.current.beginDatasetIntent();
    setCaseLoadingId(null);
    return datasetIntent;
  }

  function isCurrentDatasetIntent(datasetIntent: number) {
    return datasetIntentRef.current.isCurrent(datasetIntent);
  }

  function resetImport() {
    datasetIntentRef.current.invalidateFileReads();
    setBaselineFile(null);
    setCurrentFile(null);
    setBaselinePreview(null);
    setCurrentPreview(null);
    setPrimaryKey("");
    setProjectName("");
    setImportError("");
  }

  function loadDemo() {
    beginDatasetIntent();
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
    setShowImport(false);
    resetImport();
    showToast("Reproducible synthetic demonstration restored");
  }

  async function loadCase(caseId: string) {
    const datasetIntent = beginDatasetIntent();
    const controller = datasetIntentRef.current.createCaseController(datasetIntent);
    setCaseLoadingId(caseId);
    try {
      const loaded = await loadExecutableCase(caseId, controller.signal);
      if (!loaded) return;
      if (!isCurrentDatasetIntent(datasetIntent)) return;
      const { definition, run } = loaded;
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
      setShowImport(false);
      resetImport();
      showToast(`Loaded and executed: ${definition.title}`);
    } catch (error) {
      if (isCurrentDatasetIntent(datasetIntent) && !(error instanceof DOMException && error.name === "AbortError")) {
        showToast(error instanceof Error ? error.message : "Case loading failed");
      }
    } finally {
      if (isCurrentDatasetIntent(datasetIntent)) {
        setCaseLoadingId(null);
        datasetIntentRef.current.clearCaseController(datasetIntent, controller);
      }
    }
  }

  async function selectBaseline(event: ChangeEvent<HTMLInputElement>) {
    const requestId = datasetIntentRef.current.beginFileRead("baseline");
    const file = event.target.files?.[0] ?? null;
    setBaselineFile(file);
    setBaselinePreview(null);
    setPrimaryKey("");
    setImportError("");
    if (!file) return;
    try {
      const preview = await readCsvFile(file);
      if (!datasetIntentRef.current.isCurrentFileRead("baseline", requestId)) return;
      setBaselinePreview(preview);
      if (!uniqueKeyCandidates(preview.columns, preview.rows, preview.lineNumbers).length) {
        setImportError("No unique, nonempty candidate primary key was found. Add a unique identifier column to the CSV first.");
      }
    } catch (error) {
      if (datasetIntentRef.current.isCurrentFileRead("baseline", requestId)) setImportError(error instanceof Error ? error.message : "Baseline could not be read");
    }
  }

  async function selectCurrent(event: ChangeEvent<HTMLInputElement>) {
    const requestId = datasetIntentRef.current.beginFileRead("current");
    const file = event.target.files?.[0] ?? null;
    setCurrentFile(file);
    setCurrentPreview(null);
    setImportError("");
    if (!file) return;
    try {
      const preview = await readCsvFile(file);
      if (!datasetIntentRef.current.isCurrentFileRead("current", requestId)) return;
      setCurrentPreview(preview);
    } catch (error) {
      if (datasetIntentRef.current.isCurrentFileRead("current", requestId)) setImportError(error instanceof Error ? error.message : "Current version could not be read");
    }
  }

  async function importProject(event: FormEvent) {
    event.preventDefault();
    if (READ_ONLY_DEMO) {
      showToast("Read-only portfolio mode cannot import local projects");
      return;
    }
    setImportError("");
    let datasetIntent: number | null = null;
    try {
      if (!baselineFile || !baselinePreview) throw new Error("Select and successfully read a baseline CSV.");
      if (!primaryKey) throw new Error("Select a unique primary key before creating the project.");
      assertValidKey(baselinePreview, primaryKey, "Baseline");
      if (currentFile && !currentPreview) throw new Error("The current-version CSV has not been read successfully.");
      datasetIntent = beginDatasetIntent();
      let alignedCurrent = currentPreview;
      if (currentPreview) {
        if (!sameColumnSet(baselinePreview.columns, currentPreview.columns)) throw new Error("Baseline and current versions must have exactly the same set of columns.");
        alignedCurrent = await alignFileSnapshotColumns(currentPreview, baselinePreview.columns);
        assertValidKey(alignedCurrent, primaryKey, "Current version");
      }
      const nextDataset = await verifyDataset({
        projectName: projectName.trim() || baselineFile.name.replace(/\.csv$/i, ""),
        baselineName: `Baseline · ${baselineFile.name}`,
        currentName: currentFile ? `Current · ${currentFile.name}` : undefined,
        baselineRows: baselinePreview.rows,
        currentRows: alignedCurrent?.rows,
        baselineLineNumbers: baselinePreview.lineNumbers,
        currentLineNumbers: alignedCurrent?.lineNumbers,
        baselineMeta: baselinePreview.meta,
        currentMeta: alignedCurrent?.meta,
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
      if (!isCurrentDatasetIntent(datasetIntent)) return;
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
      if (datasetIntent === null || isCurrentDatasetIntent(datasetIntent)) {
        setImportError(error instanceof Error ? error.message : "Import failed. Check the CSV files.");
      }
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
    const datasetIntent = beginDatasetIntent();
    try {
      const parsed = await readCsvFile(file);
      if (!isCurrentDatasetIntent(datasetIntent)) return;
      if (!sameColumnSet(dataset.columns, parsed.columns)) throw new Error("The current-version columns do not match the baseline columns.");
      const aligned = await alignFileSnapshotColumns(parsed, dataset.columns);
      assertValidKey(aligned, dataset.primaryKey, "Current version");
      const nextDataset: DatasetVersion = {
        ...dataset,
        currentName: `Current · ${file.name}`,
        currentRows: aligned.rows,
        currentLineNumbers: aligned.lineNumbers,
        currentMeta: aligned.meta,
        currentRawText: aligned.rawText,
        currentRawBytesBase64: aligned.rawBytesBase64,
      };
      const verifiedDataset = await verifyDataset(nextDataset);
      if (!isCurrentDatasetIntent(datasetIntent)) return;
      const runAt = new Date().toISOString();
      setDataset(verifiedDataset);
      setClaims((currentClaims) => currentClaims.map((claim) => recomputeClaim(claim, verifiedDataset, runAt)));
      setDecisionReviewOverrides({});
      setReviewRecords([]);
      setRevisionVisible(true);
      setLastAuditAt(runAt);
      showToast(`Current version aligned by primary key ${dataset.primaryKey} and re-audited`);
    } catch (error) {
      if (isCurrentDatasetIntent(datasetIntent)) showToast(error instanceof Error ? error.message : "Current version could not be read");
    } finally {
      event.target.value = "";
    }
  }

  async function runAudit() {
    await runExclusiveOperation(async (datasetIntent) => {
      const runAt = new Date().toISOString();
      const verifiedDataset = await verifyDataset(dataset, runAt);
      if (!isCurrentDatasetIntent(datasetIntent)) return;
      setDataset(verifiedDataset);
      setClaims((currentClaims) => currentClaims.map((claim) => recomputeClaim(claim, verifiedDataset, runAt)));
      setDecisionReviewOverrides({});
      setLastAuditAt(runAt);
      setActiveView("claims");
      showToast(`Deterministic recomputation completed with ${dataset.ruleVersion}`);
    });
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

  async function prepareCurrentBundle(generatedAt: string, datasetIntent: number) {
    const prepared = await buildVerifiedBundle({ dataset, claims, decisionSpecs, reviews: reviewRecords, previousBundleHash: lastExportedBundleHash, generatedAt });
    if (!isCurrentDatasetIntent(datasetIntent)) return null;
    setDataset(prepared.verifiedDataset);
    setClaims(prepared.bundle.claimResults);
    setDecisionReviewOverrides(Object.fromEntries(prepared.bundle.decisionResults.map((decision) => [decision.decisionId, decision.governance])));
    setLastAuditAt(generatedAt);
    return prepared;
  }

  async function exportEvidencePackage() {
    await runExclusiveOperation(async (datasetIntent) => {
      const generatedAt = new Date().toISOString();
      try {
        const prepared = await prepareCurrentBundle(generatedAt, datasetIntent);
        if (!prepared) return;
        const { bundle } = prepared;
        downloadFile("claimtrace-audit-bundle.json", JSON.stringify(bundle, null, 2), "application/json;charset=utf-8");
        setLastExportedBundleHash(bundle.integrity.payloadHash);
        showToast(bundle.previousBundleHash ? "AuditBundle verified and linked to the previous bundle root hash" : "Genesis AuditBundle recomputed, independently verified, and sealed with a root hash");
      } catch (error) {
        if (isCurrentDatasetIntent(datasetIntent)) showToast(error instanceof Error ? error.message : "AuditBundle export failed");
      }
    });
  }

  async function exportReport() {
    await runExclusiveOperation(async (datasetIntent) => {
      const generatedAt = new Date().toISOString();
      try {
        const prepared = await prepareCurrentBundle(generatedAt, datasetIntent);
        if (!prepared) return;
        const { bundle, verification } = prepared;
        downloadFile("ClaimTrace-Audit-Report.html", buildHtmlReport(bundle, verification), "text/html;charset=utf-8");
        showToast("HTML report generated with claims, decisions, review chain, and root-hash verification");
      } catch (error) {
        if (isCurrentDatasetIntent(datasetIntent)) showToast(error instanceof Error ? error.message : "HTML report export failed");
      }
    });
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
    await runExclusiveOperation(async (datasetIntent) => {
      try {
        if (READ_ONLY_DEMO) throw new Error("Read-only portfolio mode cannot create sign-off records");
        const claim = claims.find((item) => item.id === claimId);
        if (!claim?.resultId) throw new Error("The claim result has not been generated");
        const previous = reviewRecords.at(-1);
        const record = await createReviewRecord({ claimId, reviewer, disposition, note, createdAt: new Date().toISOString(), targetResultId: claim.resultId, targetResultHash: await hashClaimResult(claim) }, previous);
        const reviewed = await applyReviewToClaim(claim, record);
        if (!isCurrentDatasetIntent(datasetIntent)) return;
        setReviewRecords((records) => appendReviewRecord(records, record));
        setClaims((currentClaims) => currentClaims.map((item) => item.id === claimId ? reviewed : item));
        showToast(disposition === "APPROVED" ? "Sign-off appended and release status updated" : disposition === "RISK_ACCEPTED" ? "Risk acceptance recorded and release status marked" : "Returned and blocked from release");
      } catch (error) {
        if (isCurrentDatasetIntent(datasetIntent)) showToast(error instanceof Error ? error.message : "Review record could not be created");
      }
    });
  }

  async function recordDecisionReview(decisionId: string, disposition: ReviewRecord["disposition"], reviewer: string, note: string) {
    await runExclusiveOperation(async (datasetIntent) => {
      try {
        if (READ_ONLY_DEMO) throw new Error("Read-only portfolio mode cannot create decision sign-off records");
        const result = decisionResults.find((item) => item.decisionId === decisionId);
        if (!result) throw new Error("Decision result does not exist");
        const previous = reviewRecords.at(-1);
        const record = await createReviewRecord({ decisionId, reviewer, disposition, note, createdAt: new Date().toISOString(), targetResultId: result.resultId, targetResultHash: await hashDecisionResult(result) }, previous);
        const reviewed = await applyReviewToDecision(result, record, claims);
        if (!isCurrentDatasetIntent(datasetIntent)) return;
        setReviewRecords((records) => appendReviewRecord(records, record));
        setDecisionReviewOverrides((current) => ({ ...current, [decisionId]: reviewed.governance }));
        showToast(disposition === "APPROVED" ? "Decision signed off" : disposition === "RESIGNED" ? "New decision identity re-signed" : disposition === "RISK_ACCEPTED" ? "Risk acceptance recorded for the decision change" : "Decision returned and blocked from release");
      } catch (error) {
        if (isCurrentDatasetIntent(datasetIntent)) showToast(error instanceof Error ? error.message : "Decision review failed");
      }
    });
  }

  return (
    <main className="app-shell" aria-busy={operationBusy}>
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
          <div className="topbar-context">
            <span className="mobile-brand">ClaimTrace</span>
            <span className="breadcrumb"><b>CONTROL ROOM</b><i /> {NAV_ITEMS.find((item) => item.id === activeView)?.label}</span>
            <span className="build-receipt" data-testid="build-receipt">
              v{CLAIMTRACE_VERSION} · {CLAIMTRACE_COMMIT === "local-unbound" ? "local source build" : `commit ${CLAIMTRACE_COMMIT.slice(0, 7)}`} · {READ_ONLY_DEMO ? "read-only" : "local writable"}
            </span>
            {READ_ONLY_DEMO ? <span className="readonly-badge">Read-only portfolio mode · controls disabled</span> : null}
          </div>
          <div className="topbar-actions">
            {operationBusy ? <span className="readonly-badge" role="status">Operation in progress</span> : null}
            <button className="version-switch" onClick={() => setRevisionVisible((value) => !value)} disabled={!dataset.currentRows}><span className={revisionVisible ? "version-dot current" : "version-dot"} />Showing: {revisionVisible && dataset.currentRows ? "Current" : "Baseline"}<b>⌄</b></button>
            <button className="button ghost" onClick={exportEvidencePackage} disabled={operationBusy}>Export AuditBundle</button>
            <button className="button primary" onClick={runAudit} disabled={operationBusy}>Rerun audit</button>
          </div>
        </header>

        <div className="content">
          {activeView === "overview" ? <Overview dataset={dataset} claims={claims} selectedClaim={selectedClaim} counts={counts} healthScore={healthScore} completenessChecksPassed={completenessChecksPassed} completenessChecksTotal={completenessChecksTotal} changedRows={changedRows} displayLabel={displayLabel} lastAuditAt={lastAuditAt} sourceTraceability={sourceTraceability} calculationReproducibility={calculationReproducibility} snapshotVerification={snapshotVerification} auditFreshness={auditFreshness} activeCaseId={activeCaseId} caseLoadingId={caseLoadingId} operationBusy={operationBusy} onLoadCase={loadCase} onSelectClaim={(id) => { setSelectedClaimId(id); setActiveView("claims"); }} onImport={() => setShowImport(true)} onOpenClaims={() => setActiveView("claims")} onExport={exportReport} /> : null}
          {activeView === "claims" ? <ClaimsView claims={filteredClaims} selectedClaim={selectedClaim} dataset={dataset} filter={filter} search={search} counts={counts} operationBusy={operationBusy} onFilter={setFilter} onSearch={setSearch} onSelect={setSelectedClaimId} onAdd={openAddClaim} onExport={exportReport} /> : null}
          {activeView === "data" ? <DataView dataset={dataset} changedRows={changedRows} revisionVisible={revisionVisible} onToggleRevision={() => setRevisionVisible((value) => !value)} onImport={() => revisionInputRef.current?.click()} onNewProject={() => setShowImport(true)} /> : null}
          {activeView === "decision" ? <DecisionView decisions={decisions} results={decisionResults} claims={claims} /> : null}
          {activeView === "review" ? <ReviewView claims={claims} decisions={decisionResults} records={reviewRecords} operationBusy={operationBusy} onReview={recordReview} onDecisionReview={recordDecisionReview} /> : null}
          {activeView === "report" ? <ReportView dataset={dataset} claims={claims} counts={counts} completenessChecksPassed={completenessChecksPassed} completenessChecksTotal={completenessChecksTotal} displayLabel={displayLabel} lastAuditAt={lastAuditAt} operationBusy={operationBusy} onExport={exportReport} onCopy={copySummary} /> : null}
        </div>
      </section>

      {!READ_ONLY_DEMO ? <input data-claimtrace-mutation="import-revision" ref={revisionInputRef} className="visually-hidden" type="file" accept=".csv,text/csv" onChange={importRevision} /> : null}

      {!READ_ONLY_DEMO && showImport ? <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowImport(false); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="import-title"><button className="modal-close" onClick={() => setShowImport(false)} aria-label="Close">×</button><span className="eyebrow accent">PRIMARY-KEY IMPORT</span><h2 id="import-title">Import Your Analytical Project</h2><p>Select a unique primary key before comparing versions. File SHA-256 values, exact line numbers, the rule version, and the audit time will be recorded in the AuditBundle.</p><form onSubmit={importProject}>
        <label className="field-label">Project name<input value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="Example: 2026 Customer Retention Analysis" /></label>
        <div className="file-grid"><label className={`file-drop ${baselinePreview ? "ready" : ""}`}><input type="file" accept=".csv,text/csv" onChange={selectBaseline} /><span className="file-step">01</span><b>Baseline CSV</b><small>{baselineFile ? baselineFile.name : "Required · establish initial evidence"}</small></label><label className={`file-drop ${currentPreview ? "ready" : ""}`}><input type="file" accept=".csv,text/csv" onChange={selectCurrent} /><span className="file-step">02</span><b>Current CSV</b><small>{currentFile ? currentFile.name : "Optional · inspect version changes"}</small></label></div>
        {baselinePreview ? <div className="key-picker"><label className="field-label">Unique primary key (required)<select value={primaryKey} onChange={(event) => setPrimaryKey(event.target.value)}><option value="">Select explicitly; no automatic guessing</option>{keyCandidates.map((column) => <option key={column} value={column}>{column}</option>)}</select></label><p>{baselinePreview.rows.length} rows · {keyCandidates.length} candidate unique fields · SHA-256 {baselinePreview.meta.sha256.slice(0, 12)}…</p></div> : null}
        <div className="privacy-note"><span>LOCK</span><p><b>Local analysis</b><br />CSV files stay in this browser, are limited to 10 MiB each, and are not uploaded by ClaimTrace. AuditBundle export embeds raw data up to 500 KB per snapshot. Verified AuditBundle and HTML report generation both require snapshots within that limit; larger files can still be analyzed, but detached verification is not implemented. Inspect every export before sharing.</p></div>{importError ? <div className="form-error" role="alert">{importError}</div> : null}<div className="modal-actions"><button type="button" className="button ghost" onClick={() => { setShowImport(false); resetImport(); }}>Cancel</button><button type="submit" className="button primary">Validate key and create</button></div>
      </form></section></div> : null}

      {!READ_ONLY_DEMO && showAddClaim ? <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowAddClaim(false); }}><section className="modal compact" role="dialog" aria-modal="true" aria-labelledby="claim-title"><button className="modal-close" onClick={() => setShowAddClaim(false)} aria-label="Close">×</button><span className="eyebrow accent">TESTABLE CLAIM</span><h2 id="claim-title">Add a Testable Claim</h2><p>Bind the claim to a field, aggregation rule, and threshold. Both versions will be recomputed from source records.</p><form onSubmit={addClaim}>
        <label className="field-label">Claim in the report<textarea value={claimDraft.title} onChange={(event) => setClaimDraft({ ...claimDraft, title: event.target.value })} placeholder="Example: Mean satisfaction exceeds 8, so rollout can continue" rows={3} /></label><div className="form-grid two"><label className="field-label">Data field<select value={claimDraft.field} onChange={(event) => setClaimDraft({ ...claimDraft, field: event.target.value })}>{numericFields.map((field) => <option key={field} value={field}>{field}</option>)}</select></label><label className="field-label">Aggregation<select value={claimDraft.aggregation} onChange={(event) => setClaimDraft({ ...claimDraft, aggregation: event.target.value as Aggregation })}>{Object.entries(AGGREGATION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div><div className="form-grid rule-grid"><label className="field-label">Condition<select value={claimDraft.operator} onChange={(event) => setClaimDraft({ ...claimDraft, operator: event.target.value as Operator })}><option value=">=">≥</option><option value=">">&gt;</option><option value="<=">≤</option><option value="<">&lt;</option><option value="=">=</option></select></label><label className="field-label">Threshold<input type="number" step="any" value={claimDraft.threshold} onChange={(event) => setClaimDraft({ ...claimDraft, threshold: event.target.value })} placeholder="80" /></label></div><div className="form-grid"><label className="field-label">Threshold source<input value={claimDraft.thresholdSource} onChange={(event) => setClaimDraft({ ...claimDraft, thresholdSource: event.target.value })} placeholder="Policy, SLA, model card, or owner agreement" /></label><label className="field-label">Business rationale<input value={claimDraft.rationale} onChange={(event) => setClaimDraft({ ...claimDraft, rationale: event.target.value })} placeholder="Why crossing this value changes the action" /></label><label className="field-label">Confirmed by (leave blank for a preliminary diagnostic)<input value={claimDraft.confirmedBy} onChange={(event) => setClaimDraft({ ...claimDraft, confirmedBy: event.target.value })} placeholder="Example: Model Risk Owner" /></label></div><div className="modal-actions"><button type="button" className="button ghost" onClick={() => setShowAddClaim(false)}>Cancel</button><button type="submit" className="button primary">Compute and bind evidence</button></div>
      </form></section></div> : null}
      {toast ? <div className="toast" role="status"><span>✓</span>{toast}</div> : null}
    </main>
  );
}
