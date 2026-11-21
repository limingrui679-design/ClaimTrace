# Evaluation

## Controlled benchmark

`benchmarks/controlled-benchmark.ts` executes 64 distinct controlled scenarios across eight edge-case families. Expected labels are committed separately in `benchmarks/labels.json`, rather than embedded in execution functions.

| Category | Scenarios | Examples of targeted failures |
|---|---:|---|
| Row reordering | 8 | reverse, rotate, adjacent swap, Unicode keys, natural-number keys, wide rows |
| Field edits | 8 | numeric/string edits, multiple fields, multiple rows, missing transitions, equivalent representation |
| Add/remove membership | 8 | add-only, remove-only, replacement, multiple changes, empty-side transitions |
| Zero baseline | 8 | zero-to-zero, signed changes, confirmed/unconfirmed absolute bands, exact boundary |
| Missing-data patterns | 8 | baseline/current/both missing, all missing, row membership, filtered denominator |
| Threshold boundaries | 8 | inclusive/exclusive equality, numeric epsilon, newly supported/reversed |
| Ranking edges | 8 | two- and three-way ties, allowed ties, near ties, absent/missing groups |
| Decision identity | 8 | outcome, recommendation, feasible set, rule hash, snapshot, incomplete history |

Run:

```bash
npm run benchmark
```

Committed exact-match results:

| Method | Correct | Accuracy |
|---|---:|---:|
| Full ClaimTrace | 64/64 | 1.000 |
| Metric only | 35/64 | 0.547 |
| Deliberately naive line/scalar/outcome baseline | 27/64 | 0.422 |
| Keyed diff only | 24/64 | 0.375 |

Full ClaimTrace has review precision 1.00, review recall 1.00, zero classification errors, and false-reassurance rate 0.00 on this controlled set. The line/scalar and metric-only baselines never emit review and each has a false-reassurance rate of 0.25 across status-labeled scenarios. A model that never predicts review has precision reported as 0 by convention here.

Three controlled ablations expose separate safeguards:

- removing denominator awareness falls to 57/64;
- removing zero-baseline threshold governance falls to 60/64;
- comparing only PASS/HOLD while ignoring decision identity falls to 59/64.

## Deterministic properties

`tests/property.test.ts` adds four seeded properties with 128 trials each (512 total):

- keyed diffs are invariant to record permutation;
- one keyed edit remains exactly one changed record under arbitrary ordering;
- a fixed cohort inside a governed stability band remains supported;
- a unique grouped-rank winner is invariant to row ordering.

These are generated regression checks, not 512 independently labeled cases.

## Interpretation

This is a controlled regression benchmark, not an external study. It demonstrates that the implemented rules match known labels for committed boundaries. It does not establish production accuracy, causal impact, time savings, user adoption, superiority to mature audit tools, or generalization to unseen schemas.

## Test suite and coverage

The full suite contains 181 automated checks: 176 unit/integration tests, 3 built-artifact and release-package checks, and 2 real-Chromium flows. It covers strict CSV parsing and encodings, quoted-whitespace and malformed-quote boundaries, canonical column alignment, pre-read local CSV size enforcement, exact physical lines, duplicate headers and keys, keyed diffs, missing values and sample composition, zero baselines, point and reported-interval threshold boundaries, interval-rule runtime metadata rejection, ranking ties, snapshot and whole-bundle tampering, the versioned AuditBundle JSON Schema including raw-bytes-only payloads, CLI valid/tampered/chain exit paths, PASS/error report consistency, balanced two-sided exports, deterministic sampling, delayed sign-off export, stable action identity, content-derived claim-result identity, numerical-input provenance release gates, split action/evidence decision identity, upstream release gating, cross-bundle links and malformed chain entries, isolated malformed-lineage diagnostics, break-even/interval/Pareto/Monte Carlo analysis, exact-1.0 stability anchoring on non-divisible sweep grids, review governance, verified raw-to-summary lineage, public-source regeneration and tamper rejection, strict publisher-date formats, World Bank and Treasury two-response date agreement, USDOT Socrata metadata identity/hash/timestamp binding, fully rehashed date-tamper rejection, root-cause-only date diagnostics, bounded external cleaning parameters, exact two-side artifact coverage, configuration/metadata cleaning consistency, source-type/cleaner binding, three- and four-file source-refresh commit/rollback, HTTPS-only source definitions, redirect rejection, bounded response bodies, retrieval timestamps, malformed-response rejection, failed-request cancellation with lock retention until settlement, staging cleanup, mid-replacement rollback, forced-process-interruption recovery, committed-cleanup failure reporting and next-run completion, legacy unhashed-transaction refusal, exclusive concurrent-refresh rejection, unsafe-lock-identity rejection, symbolic-linked lock-directory rejection, raw-target namespace isolation, metadata-alias and duplicate-target rejection, configuration and final-target symbolic-link rejection before download, nested and symlink-parent raw-path rejection before download, strict transaction target and artifact layouts, symbolic-link lock and transaction manifest rejection, transaction content-hash verification, non-file target rejection, direct dataset-generation transition tests, 10 case-level reproductions, independent benchmark labels, deterministic properties, 20,000-row bounded behavior, HTML escaping, split production SPA-bundle checks, the Sites static-worker package entry, portable release-checksum output, and zero rendered mutation controls in the read-only portfolio UI. The read-only browser flow executes all 10 catalog cases, checks the compiled version/commit/mode receipt, and rejects page errors or failed requests. At 390 px, it also clicks all six primary routes, verifies that each route-specific visualization renders, and checks that every bottom-navigation control remains fully inside the viewport without horizontal document overflow. The writable flow injects delayed case-to-case, case-to-import, import-read-to-case, revision-to-case, and case-to-demo transitions to prove global last-intent-wins behavior; verifies that stale review/export work cannot cross a dataset replacement; imports reordered columns; serializes review/export activation; independently verifies two chained AuditBundles; and checks verified HTML output. TypeScript checking is a separate required CI step.

The bounded-export regression also processes 20,000 changed rows under an unchanged 10-second browser-scale budget. Evidence selection reuses one keyed diff per claim execution instead of rebuilding and naturally sorting it for each snapshot; the final full-suite run observed 2.14 seconds for this case. This is a local regression guard, not a cross-device performance benchmark.

`npm run test:coverage` instruments `src/core` and enforces minimums of 95% statements, 95% lines, 95% functions, and 75% branches. The 2026-08-20 release-candidate run reports 96.83% statements/lines, 99.39% functions, and 78.98% branches. CI uploads the HTML and LCOV report as a short-lived artifact.

## Next evaluation step

Before claiming external performance, create a blinded, independently labeled set of real-but-deidentified analysis revisions, publish annotation rules, compare mature tools and stronger baselines, and report confidence intervals plus category-level errors. That work is not represented as completed; the current scenarios remain regression tests.

### Change within groups and change in group composition

For average-based comparisons, choose a grouping field in the claim detail. Shared groups use the symmetric difference in means weighted by their average share, plus the difference in shares weighted by their average mean. The midpoint of the two global means is the common reference for share effects and one-sided groups. Missing grouping values form their own stratum. The three contributions add to the observed change, including completely disjoint samples. They describe the chosen partition.

Across the two archived CDC PLACES snapshots, eight counties belong to seven states. Their unweighted mean age-adjusted estimate moved from 20.600% to 20.325%. With unchanged state shares, all −0.275 percentage points came from within-state changes. This describes the eight-county sample. The regression named “two actual CDC PLACES county snapshots” reads both original case CSV files.

### Minimum partial-refresh witness

A reviewer may see a stable final mean even when offsetting record changes could have broken the claim during a staggered refresh. Open any supported sum or mean stability claim and download the JSON witness. Its keys identify one smallest subset of observed updates per direction; ties are broken by key. The final-release comparison uses all updates together. Intermediate subsets are sensitivity scenarios, not observed release histories.

The calculation filters both snapshots, validates primary keys and requires identical sets of numeric observations and a nonzero baseline sum. Each record can move independently from its old value to its new value once. With a fixed denominator, sums and means have the same relative change. For each direction, the first k changes sorted by signed magnitude give the largest possible movement from any k records. The first prefix strictly outside the tolerance therefore certifies the minimum number. Decimal comparisons use the normalized numeric input values and include equality inside the band. Runtime is O(n log n).

| Bundled public case | Complete refresh | Smallest upward witness | Smallest downward witness |
|---|---|---|---|
| CDC PLACES, eight selected county point estimates | −1.335% (within 2%) | 3 counties, +2.002% | 2 counties, −2.549% |
| US Treasury, nine selected maturities | −11.319% (outside 10%) | None | 6 maturities, −10.295% |

To reproduce the public comparisons, run `npm run test:unit`. The case tests use the bundled CSVs and bound source manifests. A separate exhaustive oracle enumerates every subset in 126 small signed-baseline cases, checks the returned keys and minimum cardinality, and repeats with reversed input order. This diagnostic describes update sensitivity; the governed claim status continues to use the complete observed snapshots.

### Dated tolerance history

A daily series can cross and recover between two reviews. The [Treasury example output](../public/cases/us-treasury-yield-curve/tolerance-history.json) walks the existing UST-003 claim across the entire next calendar year. It takes the baseline, nine maturities and 10% relative tolerance from the bundled case. Every date uses the same unweighted mean and the same 2024-12-31 baseline of 4.4467%. The archived [2024 Treasury feed](https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value=2024) supplies that baseline and the [2025 feed](https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value=2025) supplies all 249 follow-up dates. The receipt binds both raw file hashes, the archive retrieval timestamp, subject keys and the complete observation series. Dates refer to yield observations in this archive vintage.

The final mean was 3.9433% (−11.32% relative to baseline). Checking every published date gives 37 breaches across three episodes. All nine maturities were present on every date.

| First outside | First observed return | Observations outside |
|---|---|---:|
| 2025-10-14 | 2025-10-15 | 1 |
| 2025-10-16 | 2025-10-29 | 9 |
| 2025-11-21 | Open at 2025-12-31 | 27 |

The largest observed absolute deviation was a 12.09% decline on December 18. Screening every calendar month for endpoints inside the original band with any intervening breach identifies October alone. Its first and final readings were −9.15% and −9.60%, while ten of its 22 observed dates crossed the band.

**Reproduce the case** with `npm run --silent audit:history`. Run `python3 tools/verify-treasury-history.py` for an independent check of every published date, excursion, peak and calendar-month screen against the two original XML feeds using decimal arithmetic. To audit your own long-format CSV, supply a JSON specification containing the expected observation calendar, cohort, columns, aggregation and tolerance.

```json
{
  "dates": ["2025-01-02", "2025-01-03", "2025-01-06"],
  "keys": ["A", "B"], "dateField": "date", "keyField": "series", "valueField": "yield",
  "aggregation": "average", "tolerancePct": 10
}
```

Run `npm run --silent audit:history -- observations.csv spec.json`. The first declared date anchors the entire panel. Each date needs one numeric record per declared key. Missing dates and mismatched keys have an unknown result and retain diagnostics. Recovery is the first subsequent comparable observation inside the inclusive band. Unknown dates during an episode are counted separately. An episode without an observed return has a null recovery date. The peak is the largest absolute observed change relative to the absolute baseline, reported with its direction. Normalized decimal integer arithmetic decides the band crossing before any display rounding. The input hashes in the custom CSV report identify the exact panel and calendar used.
