import { isIsoCalendarDate } from "../external-source";
import { valueToNumber } from "../snapshot";
import type { CsvRow } from "../types";
import { decimalParts, relativeBand, units, type DecimalParts } from "./decimal-units";

export interface ToleranceHistorySpec {
  dates: readonly string[];
  keys: readonly string[];
  dateField: string;
  keyField: string;
  valueField: string;
  aggregation: "average" | "sum";
  tolerancePct: number;
}

type Status = "within" | "breach" | "missing_date" | "unaligned";
interface Observation {
  date: string;
  status: Status;
  value: number | null;
  changePct: number | null;
  problems?: { missing: string[]; unexpected: string[]; duplicates: string[]; nonNumeric: string[]; blankKeys: number };
}
interface Episode {
  firstObservedBreach: string;
  lastObservedBreach: string;
  firstObservedRecovery: string | null;
  breachedObservations: number;
  unknownObservationsBeforeRecovery: number;
}

/** Compare each scheduled observation to one fixed baseline on exactly the declared keys. */
export function auditToleranceHistory(rows: readonly CsvRow[], spec: ToleranceHistorySpec) {
  const { dates, keys, tolerancePct } = spec;
  if (dates.length < 2 || dates.some((date, i) => !isIsoCalendarDate(date) || (i > 0 && date <= dates[i - 1]))) {
    throw new Error("Declare at least two valid dates in strictly increasing order.");
  }
  const cohort = new Set(keys);
  if (!keys.length || keys.some(key => !key.trim() || key !== key.trim()) || cohort.size !== keys.length) {
    throw new Error("Declare unique, nonblank cohort keys.");
  }
  if (!Number.isFinite(tolerancePct) || tolerancePct < 0 || !["average", "sum"].includes(spec.aggregation)) {
    throw new Error("Use a finite nonnegative tolerance and average or sum aggregation.");
  }
  const byDate = new Map<string, CsvRow[]>(dates.map(date => [date, []]));
  for (const row of rows) {
    const bucket = byDate.get(String(row[spec.dateField] ?? ""));
    if (!bucket) throw new Error("Row has an undeclared or missing observation date.");
    bucket.push(row);
  }

  let reference: DecimalParts = { coefficient: BigInt(0), places: 0 };
  const observations: Observation[] = dates.map((date, i) => {
    const bucket = byDate.get(date)!;
    const byKey = new Map<string, number | null>();
    const duplicates = new Set<string>();
    const nonNumeric = new Set<string>();
    let blankKeys = 0;
    for (const row of bucket) {
      const key = String(row[spec.keyField] ?? "").trim();
      if (!key) { blankKeys++; continue; }
      if (byKey.has(key)) duplicates.add(key);
      const value = valueToNumber(row[spec.valueField]);
      if (value === null) nonNumeric.add(key);
      byKey.set(key, value);
    }
    const missing = keys.filter(key => !byKey.has(key));
    const unexpected = [...byKey.keys()].filter(key => !cohort.has(key)).sort();
    if (missing.length || unexpected.length || duplicates.size || nonNumeric.size || blankKeys) {
      if (i === 0) throw new Error("The baseline must contain one numeric observation per declared key.");
      return { date, status: bucket.length ? "unaligned" : "missing_date", value: null, changePct: null,
        problems: { missing, unexpected, duplicates: [...duplicates].sort(), nonNumeric: [...nonNumeric].sort(), blankKeys } };
    }
    const values = keys.map(key => decimalParts(byKey.get(key)!));
    const places = values.reduce((max, value) => Math.max(max, value.places), reference.places);
    const sum = values.reduce((total, value) => total + units(value, places), BigInt(0));
    if (i === 0) {
      if (sum === BigInt(0)) throw new Error("A relative tolerance requires a nonzero baseline.");
      reference = { coefficient: sum, places };
    }
    const referenceUnits = units(reference, places);
    const movement = sum - referenceUnits;
    const magnitude = movement < BigInt(0) ? -movement : movement;
    const { band, scale } = relativeBand(referenceUnits, tolerancePct);
    const status = magnitude * scale > band ? "breach" : "within";
    // Classifications above use decimal integers. Floating point is used only for reporting.
    const value = Number(sum + "e-" + places) / (spec.aggregation === "average" ? keys.length : 1);
    const changePct = Number(movement + "e-" + places) / Math.abs(Number(referenceUnits + "e-" + places)) * 100;
    if (!Number.isFinite(value) || !Number.isFinite(changePct)) throw new Error("Observed aggregate or relative change exceeds numeric range.");
    return { date, status, value, changePct };
  });

  const episodes: Episode[] = [];
  let open: Episode | undefined;
  let peak = observations[1];
  let peakMagnitude = -1;
  let unknownCount = 0;
  let breachCount = 0;
  for (const point of observations.slice(1)) {
    if (point.changePct === null) {
      unknownCount++;
      if (open) open.unknownObservationsBeforeRecovery++;
      continue;
    }
    if (Math.abs(point.changePct) > peakMagnitude) {
      peakMagnitude = Math.abs(point.changePct);
      peak = point;
    }
    if (point.status === "breach") {
      breachCount++;
      if (!open) {
        open = { firstObservedBreach: point.date, lastObservedBreach: point.date, firstObservedRecovery: null,
          breachedObservations: 0, unknownObservationsBeforeRecovery: 0 };
        episodes.push(open);
      }
      open.lastObservedBreach = point.date;
      open.breachedObservations++;
    } else if (open) {
      open.firstObservedRecovery = point.date;
      open = undefined;
    }
  }
  return {
    baselineDate: dates[0], baselineValue: observations[0].value!, keys: [...keys], tolerancePct, aggregation: spec.aggregation,
    expectedFollowUps: dates.length - 1, unknownCount, breachCount, endpoint: observations[observations.length - 1],
    peak: peakMagnitude < 0 ? null : { date: peak.date, changePct: peak.changePct! }, episodes, observations,
  };
}
