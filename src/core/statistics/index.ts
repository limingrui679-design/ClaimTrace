import type {
  Aggregation,
  CsvRow,
  DatasetVersion,
  RankResult,
  RowDiff,
  Rule,
  SampleProfile,
} from "../types";
import { validatePrimaryKey, valueToNumber } from "../snapshot";

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
  const keys = [...new Set([...baselineMap.keys(), ...currentMap.keys()])].sort((left, right) => left.localeCompare(right, "zh-CN", { numeric: true }));

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
