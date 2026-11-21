import type {
  Aggregation,
  CsvRow,
  DatasetVersion,
  IntervalThresholdResult,
  MeanChange,
  RankResult,
  RowDiff,
  Rule,
  SampleProfile,
} from "../types";
import { validatePrimaryKey, valueToNumber } from "../snapshot";

const KEY_COLLATOR = new Intl.Collator("zh-CN", { numeric: true });

export function rowsForRule(rows: CsvRow[], rule: Rule) {
  return rows.filter((row) => {
    const included = (rule.filters ?? []).every((filter) => String(row[filter.field] ?? "") === String(filter.equals));
    const excluded = (rule.excludes ?? []).some((filter) => String(row[filter.field] ?? "") === String(filter.equals));
    return included && !excluded;
  });
}

export function aggregate(rows: CsvRow[], field: string, method: Aggregation): number | null {
  if (method === "count") return rows.length;
  const values = rows.map((row) => valueToNumber(row[field])).filter((value): value is number => value !== null);
  if (!values.length) return null;
  if (method === "sum") return values.reduce((total, value) => total + value, 0);
  if (method === "min") return Math.min(...values);
  if (method === "max") return Math.max(...values);
  return values.reduce((total, value) => total + value, 0) / values.length;
}

/** Bridge between two means using the same record keys wherever they overlap. */
export function decomposeMeanChange(dataset: DatasetVersion, rule: Rule): MeanChange | undefined {
  if (!dataset.currentRows || rule.type !== "stability" || rule.aggregation !== "average") return;
  if (!validatePrimaryKey(dataset.baselineRows, dataset.baselineLineNumbers, dataset.primaryKey).valid
    || !validatePrimaryKey(dataset.currentRows, dataset.currentLineNumbers ?? [], dataset.primaryKey).valid) return;
  function observations(rows: CsvRow[]) {
    const values = new Map<string, number>();
    for (const row of rowsForRule(rows, rule)) {
      const value = valueToNumber(row[rule.field]);
      if (value !== null) values.set(String(row[dataset.primaryKey]), value);
    }
    return values;
  }
  const baseline = observations(dataset.baselineRows);
  const current = observations(dataset.currentRows);
  if (!baseline.size || !current.size) return;
  const mean = (values: Map<string, number>) => {
    let total = 0;
    for (const value of values.values()) total += value;
    return total / values.size;
  };
  let matched = 0;
  let before = 0;
  let after = 0;
  for (const [key, previous] of baseline) {
    const next = current.get(key);
    if (next === undefined) continue;
    matched++;
    before += previous;
    after += next;
  }
  const oldMean = mean(baseline);
  const newMean = mean(current);
  return {
    matched, entered: current.size - matched, left: baseline.size - matched,
    totalChange: newMean - oldMean,
    exitEffect: matched ? before / matched - oldMean : null,
    withinEffect: matched ? (after - before) / matched : null,
    entryEffect: matched ? newMean - after / matched : null,
  };
}

/** Symmetric within-group and composition effects for two independently sampled snapshots. */
export function stratifiedMeanChange(dataset: DatasetVersion, rule: Rule, field: string) {
  if (rule.type !== "stability" || rule.aggregation !== "average" || !dataset.currentRows ||
      !field || field === dataset.primaryKey || field === rule.field || !dataset.columns.includes(field)) return;
  const metric = rule.field;
  function summarize(rows: CsvRow[]) {
    const groups = new Map<string | null, { n: number; sum: number }>();
    let n = 0, sum = 0;
    for (const row of rowsForRule(rows, rule)) {
      const value = valueToNumber(row[metric]);
      if (value === null) continue;
      const key = String(row[field] ?? "").trim() || null;
      const group = groups.get(key) ?? { n: 0, sum: 0 };
      group.n += 1;
      group.sum += value;
      groups.set(key, group);
      n++;
      sum += value;
    }
    return { groups, n, mean: sum / n };
  }
  const old = summarize(dataset.baselineRows), next = summarize(dataset.currentRows);
  if (!old.n || !next.n) return;
  const reference = (old.mean + next.mean) / 2;
  let within = 0, composition = 0, oneSided = 0, sharedGroups = 0;
  for (const group of new Set([...old.groups.keys(), ...next.groups.keys()])) {
    const a = old.groups.get(group), b = next.groups.get(group);
    const p = (a?.n ?? 0) / old.n, q = (b?.n ?? 0) / next.n;
    if (a && b) {
      const before = a.sum / a.n, after = b.sum / b.n;
      within += (p + q) / 2 * (after - before);
      composition += (q - p) * ((before + after) / 2 - reference);
      sharedGroups++;
    } else if (a) {
      oneSided -= p * (a.sum / a.n - reference);
    } else if (b) {
      oneSided += q * (b.sum / b.n - reference);
    }
  }
  return { field, sharedGroups, baselineRows: old.n, currentRows: next.n,
    totalChange: next.mean - old.mean, within, composition, oneSided };
}

function stableKeyHash(keys: string[]) {
  let hash = 2166136261;
  for (const char of keys.slice().sort().join("\u001f")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function sampleProfile(rows: CsvRow[], rule: Rule, primaryKey: string): SampleProfile {
  const filtered = rowsForRule(rows, rule);
  const numericValues = rule.aggregation === "count"
    ? filtered.map(() => 1)
    : filtered.map((row) => valueToNumber(row[rule.field]));
  const groupCounts: Record<string, number> = {};
  if (rule.type === "rank") {
    for (const row of filtered) {
      const group = String(row[rule.groupField] ?? "").trim() || "__MISSING__";
      groupCounts[group] = (groupCounts[group] ?? 0) + 1;
    }
  }
  const keys = filtered.map((row) => String(row[primaryKey] ?? "")).filter(Boolean);
  const effectiveRows = numericValues.filter((value) => value !== null).length;
  return {
    totalRows: rows.length,
    filteredRows: filtered.length,
    effectiveRows,
    missingRows: filtered.length - effectiveRows,
    excludedRows: rows.length - filtered.length,
    includedKeyCount: new Set(keys).size,
    includedKeysHash: stableKeyHash(keys),
    groupCounts,
  };
}

export function sampleProfileChanged(baseline: SampleProfile, current: SampleProfile) {
  const stableGroups = (groups: Record<string, number>) => JSON.stringify(Object.entries(groups).sort(([left], [right]) => left.localeCompare(right)));
  return baseline.totalRows !== current.totalRows
    || baseline.filteredRows !== current.filteredRows
    || baseline.effectiveRows !== current.effectiveRows
    || baseline.missingRows !== current.missingRows
    || baseline.includedKeyCount !== current.includedKeyCount
    || baseline.includedKeysHash !== current.includedKeysHash
    || stableGroups(baseline.groupCounts) !== stableGroups(current.groupCounts);
}

export function evaluate(value: number, operator: ">" | ">=" | "<" | "<=" | "=", threshold: number) {
  if (operator === ">") return value > threshold;
  if (operator === ">=") return value >= threshold;
  if (operator === "<") return value < threshold;
  if (operator === "<=") return value <= threshold;
  return Math.abs(value - threshold) < 1e-9;
}

export function intervalThreshold(
  rows: CsvRow[],
  rule: Extract<Rule, { type: "interval-threshold" }>,
): IntervalThresholdResult | null {
  if (
    typeof rule.field !== "string" || !rule.field.trim()
    || typeof rule.lowerField !== "string" || !rule.lowerField.trim()
    || typeof rule.upperField !== "string" || !rule.upperField.trim()
    || ![">", ">=", "<", "<="].includes(rule.operator)
    || !Number.isFinite(rule.threshold)
    || !Number.isFinite(rule.intervalLevel) || rule.intervalLevel <= 0 || rule.intervalLevel > 1
    || typeof rule.intervalLabel !== "string" || !rule.intervalLabel.trim()
  ) return null;
  const filtered = rowsForRule(rows, rule);
  if (filtered.length !== 1) return null;
  const point = valueToNumber(filtered[0][rule.field]);
  const lower = valueToNumber(filtered[0][rule.lowerField]);
  const upper = valueToNumber(filtered[0][rule.upperField]);
  if (point === null || lower === null || upper === null || lower > point || point > upper) return null;
  return { point, lower, upper, matchingRows: filtered.length };
}

export function rankGroups(rows: CsvRow[], rule: Extract<Rule, { type: "rank" }>): RankResult | null {
  const grouped = new Map<string, CsvRow[]>();
  let missingGroupRows = 0;
  for (const row of rowsForRule(rows, rule)) {
    const group = String(row[rule.groupField] ?? "").trim();
    if (!group) {
      missingGroupRows += 1;
      continue;
    }
    if (!grouped.has(group)) grouped.set(group, []);
    grouped.get(group)?.push(row);
  }
  const groups = [...grouped.entries()]
    .map(([group, groupRows]) => ({ group, value: aggregate(groupRows, rule.field, rule.aggregation) }))
    .filter((item): item is { group: string; value: number } => item.value !== null)
    .sort((left, right) => (rule.rank === "max" ? right.value - left.value : left.value - right.value) || left.group.localeCompare(right.group));
  if (!groups.length) return null;
  const extreme = groups[0].value;
  const winners = groups.filter((item) => Math.abs(item.value - extreme) < 1e-9);
  return { winners, groups, tied: winners.length > 1, missingGroupRows };
}

export function diffRowsByKey(dataset: DatasetVersion): RowDiff[] {
  if (!dataset.currentRows) return [];
  const baselineValidation = validatePrimaryKey(dataset.baselineRows, dataset.baselineLineNumbers, dataset.primaryKey);
  const currentValidation = validatePrimaryKey(dataset.currentRows, dataset.currentLineNumbers ?? [], dataset.primaryKey);
  if (!baselineValidation.valid || !currentValidation.valid) throw new Error("Primary-key validation failed; record-level comparison cannot run");

  const baselineMap = new Map<string, { row: CsvRow; line: number }>();
  const currentMap = new Map<string, { row: CsvRow; line: number }>();
  dataset.baselineRows.forEach((row, index) => baselineMap.set(String(row[dataset.primaryKey]), { row, line: dataset.baselineLineNumbers[index] }));
  dataset.currentRows.forEach((row, index) => currentMap.set(String(row[dataset.primaryKey]), { row, line: dataset.currentLineNumbers?.[index] ?? index + 2 }));
  const keys = [...new Set([...baselineMap.keys(), ...currentMap.keys()])].sort(KEY_COLLATOR.compare);

  return keys.map((key) => {
    const baseline = baselineMap.get(key);
    const current = currentMap.get(key);
    if (!baseline && current) return { key, kind: "added", changedFields: dataset.columns, current: current.row, currentLine: current.line };
    if (baseline && !current) return { key, kind: "removed", changedFields: dataset.columns, baseline: baseline.row, baselineLine: baseline.line };
    const changedFields = dataset.columns.filter((column) => column !== dataset.primaryKey && String(baseline?.row[column] ?? "") !== String(current?.row[column] ?? ""));
    return {
      key,
      kind: changedFields.length ? "changed" : "unchanged",
      changedFields,
      baseline: baseline?.row,
      current: current?.row,
      baselineLine: baseline?.line,
      currentLine: current?.line,
    };
  });
}

export function compareRows(dataset: DatasetVersion) {
  return diffRowsByKey(dataset).filter((diff) => diff.kind !== "unchanged").length;
}
