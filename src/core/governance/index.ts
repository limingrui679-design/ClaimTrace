import type { Claim, DecisionResult, ReviewRecord } from "../types";
import { hashClaimResult, hashDecisionResult, sha256Canonical } from "../integrity";

type ReviewInput = Omit<ReviewRecord, "id" | "recordHash" | "assurance" | "previousRecordId" | "previousRecordHash">;

function uuid() {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  throw new Error("This environment does not support secure UUID generation, so a governance record cannot be created");
}

export async function createReviewRecord(input: ReviewInput, previous?: ReviewRecord): Promise<ReviewRecord> {
  if (!input.claimId && !input.decisionId) throw new Error("A review record must bind either a claim or a decision");
  if (input.claimId && input.decisionId) throw new Error("A review record can bind only one target");
  if (!input.reviewer.trim()) throw new Error("Reviewer is required");
  if (!input.note.trim()) throw new Error("Review note is required");
  if (!Number.isFinite(Date.parse(input.createdAt))) throw new Error("Review time is invalid");
  if (!input.targetResultId.trim()) throw new Error("A review record must bind a specific result ID");
  if (!/^[a-f0-9]{64}$/i.test(input.targetResultHash)) throw new Error("The reviewed-object hash must be SHA-256");
  if (input.disposition === "RISK_ACCEPTED" && input.note.trim().length < 10) throw new Error("Risk acceptance requires a specific rationale of at least 10 characters");

  const recordWithoutHash = {
    ...input,
    id: uuid(),
    assurance: {
      identity: "LOCAL_UNVERIFIED" as const,
      timestamp: "LOCAL_CLOCK_UNVERIFIED" as const,
      authorization: "SELF_ASSERTED" as const,
      cryptographicSignature: "NONE" as const,
    },
    previousRecordId: previous?.id,
    previousRecordHash: previous?.recordHash,
  };
  return {
    ...recordWithoutHash,
    recordHash: await sha256Canonical(recordWithoutHash),
  };
}

export function appendReviewRecord(records: ReviewRecord[], next: ReviewRecord) {
  if (records.some((record) => record.id === next.id)) throw new Error("Duplicate review-record ID");
  const previous = records.at(-1);
  if (!previous && (next.previousRecordId || next.previousRecordHash)) throw new Error("The first review record cannot declare a predecessor");
  if (previous && next.previousRecordId !== previous.id) throw new Error("A review record must append to the global chain head");
  if (previous && next.previousRecordHash !== previous.recordHash) throw new Error("The prior review-record hash does not match");
  return [...records, next];
}

export async function verifyReviewChain(records: ReviewRecord[]) {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const { recordHash, ...payload } = record;
    if (ids.has(record.id)) errors.push(`${record.id}: duplicate record ID`);
    ids.add(record.id);
    if (await sha256Canonical(payload) !== recordHash) errors.push(`${record.id}: record hash mismatch`);
    if (!/^[a-f0-9]{64}$/i.test(record.targetResultHash)) errors.push(`${record.id}: invalid reviewed-object hash`);
    if (record.assurance?.identity !== "LOCAL_UNVERIFIED" || record.assurance?.timestamp !== "LOCAL_CLOCK_UNVERIFIED" || record.assurance?.authorization !== "SELF_ASSERTED" || record.assurance?.cryptographicSignature !== "NONE") errors.push(`${record.id}: invalid local-unverified assurance statement`);
    const previous = records[index - 1];
    if (!previous && (record.previousRecordId || record.previousRecordHash)) errors.push(`${record.id}: the first record incorrectly declares a predecessor`);
    if (previous && record.previousRecordId !== previous.id) errors.push(`${record.id}: predecessor is not the global chain head`);
    if (previous && record.previousRecordHash !== previous.recordHash) errors.push(`${record.id}: predecessor hash mismatch`);
  }
  return { valid: errors.length === 0, errors, headRecordId: records.at(-1)?.id ?? null, headRecordHash: records.at(-1)?.recordHash ?? null };
}

export async function applyReviewToClaim(claim: Claim, record: ReviewRecord): Promise<Claim> {
  if (record.claimId !== claim.id) throw new Error("The review record does not match the claim");
  if (record.targetResultId !== claim.resultId || record.targetResultHash !== await hashClaimResult(claim)) throw new Error("The review record is not bound to the current claim result");
  if (record.disposition === "RESIGNED") throw new Error("Re-signing applies only to changed decisions");
  if (record.disposition === "APPROVED" && !["SUPPORTED", "WEAKENED"].includes(claim.status)) {
    throw new Error(`${claim.status} cannot receive ordinary approval; request changes instead, and use explicit risk acceptance only for REVERSED claims`);
  }
  if (record.disposition === "RISK_ACCEPTED" && claim.status !== "REVERSED") {
    throw new Error("Only a REVERSED claim can use a risk-acceptance override");
  }
  const releaseStatus = record.disposition === "APPROVED"
    ? "APPROVED_FOR_USE" as const
    : record.disposition === "RISK_ACCEPTED"
      ? "APPROVED_WITH_RISK" as const
      : "BLOCKED" as const;
  return {
    ...claim,
    governance: {
      engineStatus: claim.status,
      reviewDisposition: record.disposition,
      releaseStatus,
      latestReviewId: record.id,
    },
  };
}

export function unreleasedBoundClaimIds(result: DecisionResult, claims: Claim[]) {
  return result.boundClaimIds.filter((claimId) => {
    const claim = claims.find((candidate) => candidate.id === claimId);
    return !claim || !["APPROVED_FOR_USE", "APPROVED_WITH_RISK"].includes(claim.governance.releaseStatus);
  });
}

export function enforceDecisionReleaseDependencies(result: DecisionResult, claims: Claim[]): DecisionResult {
  if (unreleasedBoundClaimIds(result, claims).length === 0 || result.governance.releaseStatus === "BLOCKED") return result;
  return {
    ...result,
    governance: {
      ...result.governance,
      releaseStatus: "BLOCKED",
    },
  };
}

export async function applyReviewToDecision(result: DecisionResult, record: ReviewRecord, claims: Claim[]): Promise<DecisionResult> {
  if (record.decisionId !== result.decisionId) throw new Error("The review record does not match the decision");
  if (record.targetResultId !== result.resultId || record.targetResultHash !== await hashDecisionResult(result)) throw new Error("The review record is not bound to the current decision result");
  if (record.disposition === "APPROVED" && result.status !== "SUPPORTED") throw new Error("A changed or review-required decision cannot receive ordinary approval");
  if (record.disposition === "RISK_ACCEPTED" && result.status !== "DECISION_CHANGED") throw new Error("Only a changed decision can use a risk-acceptance override");
  if (record.disposition === "RESIGNED" && !["DECISION_CHANGED", "RESIGN_REQUIRED"].includes(result.status)) throw new Error("Only an action change or evidence-identity update requires re-signing");
  if (["APPROVED", "RESIGNED", "RISK_ACCEPTED"].includes(record.disposition)) {
    const unreleasedClaims = unreleasedBoundClaimIds(result, claims);
    if (unreleasedClaims.length) throw new Error(`The decision cannot be released because upstream claims are unsigned or were returned: ${unreleasedClaims.join(", ")}`);
  }
  return {
    ...result,
    governance: {
      engineStatus: result.status,
      reviewDisposition: record.disposition,
      releaseStatus: ["APPROVED", "RESIGNED"].includes(record.disposition) ? "APPROVED_FOR_USE" : record.disposition === "RISK_ACCEPTED" ? "APPROVED_WITH_RISK" : "BLOCKED",
      latestReviewId: record.id,
    },
  };
}
