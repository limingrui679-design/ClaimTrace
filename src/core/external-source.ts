import type { ExternalCleaningImplementation, ExternalSourceProvenance, ExternalSourceType, SnapshotSide } from "./types";
import { parseCSV } from "./snapshot";

export interface ExternalSnapshotRebuild {
  text: string | null;
  errors: string[];
  transformations: string[];
}

const CLEANING_IMPLEMENTATION_BY_SOURCE: Record<ExternalSourceType, ExternalCleaningImplementation> = {
  WORLD_BANK_INDICATORS_API_V2: "world-bank-indicator-v1",
  USDOT_NTD_SOCRATA_V1: "usdot-ntd-monthly-v1",
  US_TREASURY_YIELD_CURVE_XML_V1: "treasury-yield-curve-v1",
  CFPB_COMPLAINT_TRENDS_V1: "cfpb-complaint-trends-v1",
  CDC_PLACES_SOCRATA_V1: "cdc-places-county-v1",
  ONS_EXPLORE_LOCAL_STATISTICS_CSV_V1: "ons-housing-affordability-v1",
};

export function externalCleaningBindingError(provenance: ExternalSourceProvenance) {
  const expected = CLEANING_IMPLEMENTATION_BY_SOURCE[provenance.sourceType];
  if (!expected) return `Unsupported external source type: ${String(provenance.sourceType)}`;
  if (provenance.cleaning.implementation !== expected) return `External source type ${provenance.sourceType} must use cleaning implementation ${expected}`;
  if (provenance.sourceLastUpdated) {
    if (provenance.sourceLastUpdatedBasis !== "PUBLISHER_REPORTED") return "A source last-updated date must be labeled as publisher reported";
    if (provenance.sourceLastUpdatedNotReportedReason?.trim()) return "A reported source update date cannot also carry a not-reported reason";
  } else {
    if (provenance.sourceLastUpdatedBasis !== "NOT_SEPARATELY_REPORTED") return "A missing source last-updated date must be labeled as not separately reported";
    if (!provenance.sourceLastUpdatedNotReportedReason?.trim()) return "A missing source last-updated date requires a not-reported reason";
  }
  return null;
}

function csvCell(value: string) {
  return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function csv(columns: string[], rows: Array<Array<string | number>>) {
  return `${columns.join(",")}\n${rows.map((row) => row.map((value) => csvCell(String(value))).join(",")).join("\n")}\n`;
}

function params(provenance: ExternalSourceProvenance) {
  return provenance.cleaning.parameters as Record<string, unknown>;
}

function stringParameter(input: Record<string, unknown>, name: string, errors: string[]) {
  const value = input[name];
  if (typeof value !== "string" || !value.trim()) {
    errors.push(`Cleaning parameter ${name} must be a nonempty string`);
    return "";
  }
  return value;
}

function integerParameter(input: Record<string, unknown>, name: string, errors: string[], minimum: number, maximum: number) {
  const value = input[name];
  if (typeof value !== "number" || !Number.isInteger(value) || value < minimum || value > maximum) {
    errors.push(`Cleaning parameter ${name} must be an integer from ${minimum} to ${maximum}`);
    return minimum;
  }
  return value;
}

function stringArrayParameter(input: Record<string, unknown>, name: string, errors: string[]) {
  const value = input[name];
  if (!Array.isArray(value) || !value.length || value.some((item) => typeof item !== "string" || !item.trim())) {
    errors.push(`Cleaning parameter ${name} must be a nonempty string array`);
    return [] as string[];
  }
  return value as string[];
}

function artifactText(provenance: ExternalSourceProvenance, side: SnapshotSide, errors: string[]) {
  const matches = provenance.rawArtifacts.filter((artifact) => artifact.side === side);
  if (matches.length !== 1) {
    errors.push(`${side}: exactly one embedded raw response is required`);
    return null;
  }
  return matches[0].text;
}

function parseJson(text: string, side: SnapshotSide, errors: string[]) {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    errors.push(`${side}: embedded raw response is not valid JSON`);
    return null;
  }
}

function fixed(value: unknown, decimalPlaces: number, label: string, errors: string[]) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    errors.push(`${label}: expected a finite numeric value`);
    return "";
  }
  return numeric.toFixed(decimalPlaces);
}

function requireCoverage(found: string[], selected: string[], side: SnapshotSide, label: string, errors: string[]) {
  const unique = new Set(found);
  if (unique.size !== found.length) errors.push(`${side}: ${label} contains duplicate selected identifiers`);
  if (found.length !== selected.length || selected.some((id) => !unique.has(id))) errors.push(`${side}: ${label} does not fully cover the declared selection`);
}

function cleanWorldBank(provenance: ExternalSourceProvenance, side: SnapshotSide): ExternalSnapshotRebuild {
  const errors: string[] = [];
  const input = params(provenance);
  const text = artifactText(provenance, side, errors);
  const baselineYear = stringParameter(input, "baselineYear", errors);
  const currentYear = stringParameter(input, "currentYear", errors);
  const selected = stringArrayParameter(input, "selectedCountryCodes", errors);
  const decimalPlaces = integerParameter(input, "decimalPlaces", errors, 0, 20);
  if (!text) return { text: null, errors, transformations: [] };
  const parsed = parseJson(text, side, errors);
  if (!Array.isArray(parsed) || !Array.isArray(parsed[1]) || typeof parsed[0] !== "object" || parsed[0] === null) {
    errors.push(`${side}: World Bank response structure is invalid`);
    return { text: null, errors, transformations: [] };
  }
  const header = parsed[0] as { lastupdated?: unknown };
  if (provenance.sourceLastUpdated && header.lastupdated !== provenance.sourceLastUpdated) errors.push(`${side}: source update date does not match provenance`);
  const year = side === "baseline" ? baselineYear : currentYear;
  const selectedSet = new Set(selected);
  const sourceRows = (parsed[1] as Array<Record<string, unknown>>)
    .filter((row) => row.date === year && selectedSet.has(String(row.countryiso3code ?? "")))
    .sort((left, right) => String(left.countryiso3code).localeCompare(String(right.countryiso3code)));
  requireCoverage(sourceRows.map((row) => String(row.countryiso3code ?? "")), selected, side, "World Bank response", errors);
  const rows = sourceRows.map((row) => {
    const indicator = row.indicator as { id?: unknown; value?: unknown } | undefined;
    const country = row.country as { value?: unknown } | undefined;
    if (indicator?.id !== provenance.measure.id || indicator?.value !== provenance.measure.name) errors.push(`${side}:${String(row.countryiso3code)}: indicator identity mismatch`);
    return [String(row.countryiso3code ?? ""), String(country?.value ?? ""), year, fixed(row.value, decimalPlaces, `${side}:${String(row.countryiso3code)}`, errors), provenance.measure.id];
  });
  return {
    text: csv(["country_code", "country", "observation_year", "life_expectancy_years", "indicator_code"], rows),
    errors,
    transformations: ["Parse pinned World Bank Indicators API JSON", `Filter to ${selected.length} declared ISO3 countries and ${year}`, `Round life expectancy to ${decimalPlaces} decimal places`, "Sort by ISO3 country code and emit stable UTF-8 CSV"],
  };
}

function cleanUsdot(provenance: ExternalSourceProvenance, side: SnapshotSide): ExternalSnapshotRebuild {
  const errors: string[] = [];
  const input = params(provenance);
  const text = artifactText(provenance, side, errors);
  const year = stringParameter(input, side === "baseline" ? "baselineYear" : "currentYear", errors);
  const month = stringParameter(input, "month", errors);
  const selected = stringArrayParameter(input, "selectedNtdIds", errors);
  const decimalPlaces = integerParameter(input, "decimalPlaces", errors, 0, 20);
  if (!text) return { text: null, errors, transformations: [] };
  const parsed = parseJson(text, side, errors);
  if (!Array.isArray(parsed)) {
    errors.push(`${side}: USDOT Socrata response must be a JSON array`);
    return { text: null, errors, transformations: [] };
  }
  const selectedSet = new Set(selected);
  const sourceRows = (parsed as Array<Record<string, unknown>>)
    .filter((row) => selectedSet.has(String(row._5_digit_ntd_id ?? "")))
    .sort((left, right) => String(left._5_digit_ntd_id).localeCompare(String(right._5_digit_ntd_id)));
  requireCoverage(sourceRows.map((row) => String(row._5_digit_ntd_id ?? "")), selected, side, "USDOT response", errors);
  const rows = sourceRows.map((row) => {
    const id = String(row._5_digit_ntd_id ?? "");
    if (String(row.year ?? "") !== year || String(row.month ?? "") !== month || row.mode_name !== "Heavy Rail" || row.type_of_service !== "DO") errors.push(`${side}:${id}: period, mode, or service type does not match the declared query`);
    const ridership = Number(row.ridership);
    const hours = Number(row.vehicle_revenue_hours);
    if (!Number.isFinite(ridership) || !Number.isFinite(hours) || hours <= 0) errors.push(`${side}:${id}: ridership or revenue hours are invalid`);
    return [id, String(row.agency ?? ""), String(row.month_year ?? "").slice(0, 10), String(row.mode_name ?? ""), String(row.type_of_service ?? ""), fixed(ridership, 0, `${side}:${id}:ridership`, errors), fixed(hours, 0, `${side}:${id}:hours`, errors), fixed(ridership / hours, decimalPlaces, `${side}:${id}:productivity`, errors)];
  });
  return {
    text: csv(["ntd_id", "agency", "period", "mode", "type_of_service", "ridership", "vehicle_revenue_hours", "riders_per_revenue_hour"], rows),
    errors,
    transformations: ["Parse pinned USDOT Socrata JSON", `Require ${month} ${year}, Heavy Rail, and directly operated service`, `Keep ${selected.length} declared NTD agency identifiers`, `Derive riders per vehicle-revenue hour to ${decimalPlaces} decimal places`, "Sort by NTD identifier and emit stable UTF-8 CSV"],
  };
}

function cleanTreasury(provenance: ExternalSourceProvenance, side: SnapshotSide): ExternalSnapshotRebuild {
  const errors: string[] = [];
  const input = params(provenance);
  const text = artifactText(provenance, side, errors);
  const date = stringParameter(input, side === "baseline" ? "baselineDate" : "currentDate", errors);
  const decimalPlaces = integerParameter(input, "decimalPlaces", errors, 0, 20);
  const maturitiesValue = input.maturities;
  const maturities = Array.isArray(maturitiesValue) ? maturitiesValue as Array<Record<string, unknown>> : [];
  if (!maturities.length || maturities.some((item) => typeof item.code !== "string" || typeof item.label !== "string" || typeof item.xmlField !== "string")) errors.push("Cleaning parameter maturities must declare code, label, and xmlField");
  if (!text) return { text: null, errors, transformations: [] };
  const entries = [...text.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((match) => match[1]);
  const entry = entries.find((candidate) => new RegExp(`<d:NEW_DATE[^>]*>${date}T`).test(candidate));
  if (!entry) {
    errors.push(`${side}: Treasury response does not contain ${date}`);
    return { text: null, errors, transformations: [] };
  }
  const rows = maturities.map((maturity) => {
    const field = String(maturity.xmlField);
    const match = entry.match(new RegExp(`<d:${field}[^>]*>([^<]*)<\\/d:${field}>`));
    if (!match) errors.push(`${side}:${field}: yield value is missing`);
    return [String(maturity.code), String(maturity.label), date, fixed(match?.[1], decimalPlaces, `${side}:${field}`, errors)];
  });
  return {
    text: csv(["maturity_code", "maturity", "observation_date", "yield_percent"], rows),
    errors,
    transformations: ["Parse pinned U.S. Treasury Atom/XML yield-curve feed", `Select the official observation dated ${date}`, `Project ${maturities.length} declared maturities`, `Format yields to ${decimalPlaces} decimal places`, "Emit stable UTF-8 CSV in declared maturity order"],
  };
}

function slug(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function cleanCfpb(provenance: ExternalSourceProvenance, side: SnapshotSide): ExternalSnapshotRebuild {
  const errors: string[] = [];
  const input = params(provenance);
  const text = artifactText(provenance, side, errors);
  const period = stringParameter(input, side === "baseline" ? "baselinePeriod" : "currentPeriod", errors);
  const topIssues = integerParameter(input, "topIssues", errors, 1, 1_000);
  const decimalPlaces = integerParameter(input, "decimalPlaces", errors, 0, 20);
  if (!text) return { text: null, errors, transformations: [] };
  const parsed = parseJson(text, side, errors) as { aggregations?: { issue?: { doc_count?: unknown; issue?: { buckets?: unknown } } } } | null;
  const issueAggregation = parsed?.aggregations?.issue;
  const total = Number(issueAggregation?.doc_count);
  const buckets = issueAggregation?.issue?.buckets;
  if (!Number.isFinite(total) || total <= 0 || !Array.isArray(buckets)) {
    errors.push(`${side}: CFPB issue aggregation is missing or invalid`);
    return { text: null, errors, transformations: [] };
  }
  const selected = (buckets as Array<Record<string, unknown>>).slice(0, topIssues);
  if (selected.length !== topIssues) errors.push(`${side}: CFPB response does not contain ${topIssues} issue buckets`);
  const rows = selected.map((bucket) => {
    const issue = String(bucket.key ?? "");
    const count = Number(bucket.doc_count);
    if (!issue || !Number.isFinite(count)) errors.push(`${side}: CFPB issue bucket is malformed`);
    return [slug(issue), issue, period, fixed(count, 0, `${side}:${issue}:count`, errors), fixed((count / total) * 100, decimalPlaces, `${side}:${issue}:share`, errors), fixed(total, 0, `${side}:total`, errors)];
  }).sort((left, right) => String(left[0]).localeCompare(String(right[0])));
  requireCoverage(rows.map((row) => String(row[0])), rows.map((row) => String(row[0])), side, "CFPB issue identifiers", errors);
  return {
    text: csv(["issue_id", "issue", "period", "complaint_records", "share_percent", "period_total_records"], rows),
    errors,
    transformations: ["Parse pinned CFPB complaint-trends aggregation JSON", `Retain the ${topIssues} most frequent structured issue buckets for ${period}`, "Do not ingest consumer narrative text", `Calculate bucket share of all matched records to ${decimalPlaces} decimal places`, "Sort by deterministic issue identifier and emit stable UTF-8 CSV"],
  };
}

function cleanCdc(provenance: ExternalSourceProvenance, side: SnapshotSide): ExternalSnapshotRebuild {
  const errors: string[] = [];
  const input = params(provenance);
  const text = artifactText(provenance, side, errors);
  const year = stringParameter(input, side === "baseline" ? "baselineDataYear" : "currentDataYear", errors);
  const selected = stringArrayParameter(input, "selectedCountyFips", errors);
  const decimalPlaces = integerParameter(input, "decimalPlaces", errors, 0, 20);
  if (!text) return { text: null, errors, transformations: [] };
  const parsed = parseJson(text, side, errors);
  if (!Array.isArray(parsed)) {
    errors.push(`${side}: CDC PLACES response must be a JSON array`);
    return { text: null, errors, transformations: [] };
  }
  const selectedSet = new Set(selected);
  const sourceRows = (parsed as Array<Record<string, unknown>>).filter((row) => selectedSet.has(String(row.locationid ?? ""))).sort((left, right) => String(left.locationid).localeCompare(String(right.locationid)));
  requireCoverage(sourceRows.map((row) => String(row.locationid ?? "")), selected, side, "CDC response", errors);
  const rows = sourceRows.map((row) => {
    const id = String(row.locationid ?? "");
    if (String(row.year ?? "") !== year || row.measureid !== "DEPRESSION" || row.datavaluetypeid !== "AgeAdjPrv") errors.push(`${side}:${id}: year, measure, or data-value type does not match the declared query`);
    return [id, String(row.stateabbr ?? ""), String(row.locationname ?? ""), year, fixed(row.data_value, decimalPlaces, `${side}:${id}:estimate`, errors), fixed(row.low_confidence_limit, decimalPlaces, `${side}:${id}:low-ci`, errors), fixed(row.high_confidence_limit, decimalPlaces, `${side}:${id}:high-ci`, errors), fixed(row.totalpop18plus, 0, `${side}:${id}:population`, errors), String(row.measureid ?? "")];
  });
  return {
    text: csv(["county_fips", "state", "county", "data_year", "age_adjusted_depression_percent", "ci_low_percent", "ci_high_percent", "adult_population", "measure_id"], rows),
    errors,
    transformations: ["Parse pinned CDC PLACES Socrata JSON", `Require ${year} age-adjusted DEPRESSION estimates`, `Keep ${selected.length} declared county FIPS codes`, `Retain model-based estimate, confidence interval, and adult-population fields at ${decimalPlaces} decimal place`, "Sort by county FIPS and emit stable UTF-8 CSV"],
  };
}

function cleanOns(provenance: ExternalSourceProvenance, side: SnapshotSide): ExternalSnapshotRebuild {
  const errors: string[] = [];
  const input = params(provenance);
  const text = artifactText(provenance, side, errors);
  const period = stringParameter(input, side === "baseline" ? "baselinePeriod" : "currentPeriod", errors);
  const selected = stringArrayParameter(input, "selectedAuthorityCodes", errors);
  const decimalPlaces = integerParameter(input, "decimalPlaces", errors, 0, 20);
  if (!text) return { text: null, errors, transformations: [] };
  let parsed;
  try {
    parsed = parseCSV(text);
  } catch (error) {
    errors.push(`${side}: ONS CSV cannot be parsed: ${error instanceof Error ? error.message : "unknown error"}`);
    return { text: null, errors, transformations: [] };
  }
  const selectedSet = new Set(selected);
  const sourceRows = parsed.rows.filter((row) => selectedSet.has(String(row.areacd ?? ""))).sort((left, right) => String(left.areacd).localeCompare(String(right.areacd)));
  requireCoverage(sourceRows.map((row) => String(row.areacd ?? "")), selected, side, "ONS response", errors);
  const rows = sourceRows.map((row) => {
    const id = String(row.areacd ?? "");
    if (String(row.period ?? "") !== period) errors.push(`${side}:${id}: ONS period does not match the declared query`);
    return [id, String(row.areanm ?? ""), period, fixed(row.value, decimalPlaces, `${side}:${id}:ratio`, errors)];
  });
  return {
    text: csv(["authority_code", "authority", "period", "housing_affordability_ratio"], rows),
    errors,
    transformations: ["Parse pinned ONS Explore Local Statistics CSV", `Require period ${period}`, `Keep ${selected.length} declared local-authority codes`, `Format the workplace-based affordability ratio to ${decimalPlaces} decimal places`, "Sort by authority code and emit stable UTF-8 CSV"],
  };
}

export function rebuildExternalSnapshot(provenance: ExternalSourceProvenance, side: SnapshotSide): ExternalSnapshotRebuild {
  const bindingError = externalCleaningBindingError(provenance);
  if (bindingError) return { text: null, errors: [bindingError], transformations: [] };
  switch (provenance.cleaning.implementation) {
    case "world-bank-indicator-v1": return cleanWorldBank(provenance, side);
    case "usdot-ntd-monthly-v1": return cleanUsdot(provenance, side);
    case "treasury-yield-curve-v1": return cleanTreasury(provenance, side);
    case "cfpb-complaint-trends-v1": return cleanCfpb(provenance, side);
    case "cdc-places-county-v1": return cleanCdc(provenance, side);
    case "ons-housing-affordability-v1": return cleanOns(provenance, side);
    default: return { text: null, errors: [`Unsupported external cleaning implementation: ${String(provenance.cleaning.implementation)}`], transformations: [] };
  }
}
