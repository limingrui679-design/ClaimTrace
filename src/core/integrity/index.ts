import type { Claim, DecisionOutcome, DecisionResult, DecisionSpec } from "../types";
import { sha256Text } from "../snapshot";

type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function canonicalValue(value: JsonValue): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalValue).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalValue(value[key])}`).join(",")}}`;
}

export function canonicalJson(value: unknown) {
  return canonicalValue(jsonClone(value) as JsonValue);
}

export async function sha256Canonical(value: unknown) {
  return sha256Text(canonicalJson(value));
}

// Portable synchronous SHA-256 is used only for deterministic in-browser result
// identities. AuditBundle verification independently checks the same payload
// with Web Crypto through sha256Canonical().
export function sha256TextSync(value: string) {
  const constants = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const rotateRight = (word: number, bits: number) => (word >>> bits) | (word << (32 - bits));
  const input = new TextEncoder().encode(value);
  const paddedLength = Math.ceil((input.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(input);
  padded[input.length] = 0x80;
  const view = new DataView(padded.buffer);
  const bitLength = input.length * 8;
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x1_0000_0000), false);
  view.setUint32(paddedLength - 4, bitLength >>> 0, false);

  const hash = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const words = new Uint32Array(64);
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(offset + index * 4, false);
    for (let index = 16; index < 64; index += 1) {
      const left = words[index - 15];
      const right = words[index - 2];
      const sigma0 = rotateRight(left, 7) ^ rotateRight(left, 18) ^ (left >>> 3);
      const sigma1 = rotateRight(right, 17) ^ rotateRight(right, 19) ^ (right >>> 10);
      words[index] = (words[index - 16] + sigma0 + words[index - 7] + sigma1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = hash;
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temporary1 = (h + sum1 + choice + constants[index] + words[index]) >>> 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temporary2 = (sum0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temporary1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temporary1 + temporary2) >>> 0;
    }
    hash[0] = (hash[0] + a) >>> 0;
    hash[1] = (hash[1] + b) >>> 0;
    hash[2] = (hash[2] + c) >>> 0;
    hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0;
    hash[5] = (hash[5] + f) >>> 0;
    hash[6] = (hash[6] + g) >>> 0;
    hash[7] = (hash[7] + h) >>> 0;
  }
  return [...hash].map((word) => word.toString(16).padStart(8, "0")).join("");
}

export function sha256CanonicalSync(value: unknown) {
  return sha256TextSync(canonicalJson(value));
}

function omitKey<T extends object, K extends keyof T>(value: T, key: K): Omit<T, K> {
  const copy = { ...value };
  Reflect.deleteProperty(copy, key);
  return copy;
}

export function decisionPolicyPayload(spec: DecisionSpec) {
  return {
    id: spec.id,
    actions: {
      pass: { id: spec.passActionId, instruction: spec.actionIfPass },
      hold: { id: spec.holdActionId, instruction: spec.actionIfFail },
    },
    conditions: spec.conditions.map((condition) => ({
      claimId: condition.claimId,
      allowedStatuses: [...condition.allowedStatuses].sort(),
    })).sort((left, right) => left.claimId.localeCompare(right.claimId)),
    options: (spec.options ?? []).map((option) => ({
      id: option.id,
      benefit: option.benefit,
      cost: option.cost,
      risk: option.risk,
      capacity: option.capacity,
    })).sort((left, right) => left.id.localeCompare(right.id)),
    objective: spec.objective ?? null,
    constraints: (spec.constraints ?? []).map((constraint) => ({
      id: constraint.id,
      metric: constraint.metric,
      operator: constraint.operator,
      value: constraint.value,
    })).sort((left, right) => left.id.localeCompare(right.id)),
    riskTolerance: spec.riskTolerance ?? null,
    scenarios: (spec.scenarios ?? []).map((scenario) => ({
      id: scenario.id,
      benefitMultiplier: scenario.benefitMultiplier ?? null,
      costMultiplier: scenario.costMultiplier ?? null,
      riskMultiplier: scenario.riskMultiplier ?? null,
      capacityMultiplier: scenario.capacityMultiplier ?? null,
    })).sort((left, right) => left.id.localeCompare(right.id)),
    uncertainty: spec.uncertainty ?? null,
    noActionLoss: spec.noActionLoss ?? null,
  };
}

export function hashDecisionPolicySync(spec: DecisionSpec) {
  return sha256CanonicalSync(decisionPolicyPayload(spec));
}

export function decisionActionIdentityPayload(spec: DecisionSpec, outcome: DecisionOutcome) {
  if (outcome === "PASS") return { id: spec.passActionId, instruction: spec.actionIfPass };
  if (outcome === "HOLD") return { id: spec.holdActionId, instruction: spec.actionIfFail };
  return { id: `review-required:${spec.id}`, instruction: "No executable action while review is required" };
}

export function hashDecisionActionIdentitySync(spec: DecisionSpec, outcome: DecisionOutcome) {
  return sha256CanonicalSync(decisionActionIdentityPayload(spec, outcome));
}

export function hashDecisionInputProvenanceSync(spec: DecisionSpec) {
  return sha256CanonicalSync(spec.inputProvenance ?? null);
}

export function claimReviewPayload(claim: Claim) {
  const stableClaim = omitKey(claim, "governance");
  return {
    ...stableClaim,
    audit: omitKey(stableClaim.audit, "lastRunAt"),
  };
}

export function decisionReviewPayload(result: DecisionResult) {
  return omitKey(result, "governance");
}

export async function hashClaimResult(claim: Claim) {
  return sha256Canonical(claimReviewPayload(claim));
}

export async function hashDecisionResult(result: DecisionResult) {
  return sha256Canonical(decisionReviewPayload(result));
}
