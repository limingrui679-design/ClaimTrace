import type { CsvRow, DatasetVersion, Rule } from "../types";
import { validatePrimaryKey, valueToNumber } from "../snapshot";
import { rowsForRule } from "./index";

import { decimalParts, relativeBand, units, type DecimalParts } from "./decimal-units";

function numericSample(rows: CsvRow[], rule: Rule, primaryKey: string) {
  const result = new Map<string, DecimalParts>();
  for (const row of rowsForRule(rows, rule)) {
    const value = valueToNumber(row[rule.field]);
    if (value !== null) result.set(String(row[primaryKey]).trim(), decimalParts(value));
  }
  return result;
}

interface RevisionWitness {
  matchedKeys: number;
  changedKeys: number;
  fullRefreshExceedsBand: boolean;
  upwardKeys: string[] | null;
  downwardKeys: string[] | null;
}

/** The fewest independently refreshed keys sufficient to exceed each side of a stability band. */
export function minimumRevisionWitness(dataset: DatasetVersion, rule: Rule): RevisionWitness | undefined {
  if (rule.type !== "stability" || !["average", "sum"].includes(rule.aggregation)
    || !Number.isFinite(rule.supportTolerance) || rule.supportTolerance < 0 || !dataset.currentRows) return;
  const key = dataset.primaryKey;
  if (!validatePrimaryKey(dataset.baselineRows, dataset.baselineLineNumbers, key).valid
    || !validatePrimaryKey(dataset.currentRows, dataset.currentLineNumbers ?? [], key).valid) return;
  const old = numericSample(dataset.baselineRows, rule, key);
  const next = numericSample(dataset.currentRows, rule, key);
  if (!old.size || old.size !== next.size) return;
  let places = 0;
  for (const [id, value] of old) {
    const current = next.get(id);
    if (!current) return;
    places = Math.max(places, value.places, current.places);
  }
  const zero = BigInt(0);
  let baseline = zero;
  let net = zero;
  const edits: { id: string; delta: bigint }[] = [];
  for (const [id, value] of old) {
    const before = units(value, places);
    const delta = units(next.get(id)!, places) - before;
    baseline += before;
    net += delta;
    if (delta !== zero) edits.push({ id, delta });
  }
  if (baseline === zero) return;
  const { band, scale } = relativeBand(baseline, rule.supportTolerance);
  // With fixed support, a mean and its sum have the same relative change.
  function smallest(direction: bigint) {
    const candidates = edits.map(edit => ({ id: edit.id, gain: direction * edit.delta }))
      .filter(edit => edit.gain > zero)
      .sort((a, b) => a.gain === b.gain ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : a.gain > b.gain ? -1 : 1);
    let prefix = zero;
    const keys: string[] = [];
    for (const item of candidates) {
      prefix += item.gain;
      keys.push(item.id);
      if (prefix * scale > band) return keys;
    }
    return null;
  }
  return {
    matchedKeys: old.size, changedKeys: edits.length,
    fullRefreshExceedsBand: (net < zero ? -net : net) * scale > band,
    upwardKeys: smallest(BigInt(1)), downwardKeys: smallest(BigInt(-1)),
  };
}
