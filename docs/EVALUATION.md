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

The full suite contains 131 automated tests: 130 unit/integration tests and one real-Chromium acceptance test. It covers parsing and encodings, exact physical lines, duplicate headers and keys, keyed diffs, missing values and sample composition, zero baselines, threshold boundaries, ranking ties, snapshot and whole-bundle tampering, balanced two-sided exports, deterministic sampling, delayed sign-off export, stable action identity, content-derived claim-result identity, numerical-input provenance release gates, split action/evidence decision identity, upstream release gating, cross-bundle links, break-even/interval/Pareto/Monte Carlo analysis, exact-1.0 stability anchoring on non-divisible sweep grids, review governance, verified raw-to-summary lineage, public-source regeneration and tamper rejection, bounded external cleaning parameters, paired source-refresh replacement, retrieval timestamps, malformed-response rejection, failed-pair cancellation with lock retention until settlement, staging cleanup, mid-replacement rollback, forced-process-interruption recovery, committed-cleanup failure reporting and next-run completion, legacy unhashed-transaction refusal, exclusive concurrent-refresh rejection, unsafe-lock-identity rejection, nested and symlink-parent raw-path rejection before download, transaction content-hash verification, non-file target rejection, 10 case-level reproductions, independent benchmark labels, deterministic properties, 10,000-row behavior, HTML escaping, split production SPA-bundle checks, the Sites static-worker package entry, and zero rendered mutation controls in the read-only portfolio UI. The browser flow executes all 10 catalog cases and rejects page errors or failed requests. At 390 px, it also clicks all six primary routes, verifies that each route-specific visualization renders, and checks that every bottom-navigation control remains fully inside the viewport without horizontal document overflow. TypeScript checking is a separate required CI step.

`npm run test:coverage` instruments `src/core` and enforces minimums of 95% statements, 95% lines, 95% functions, and 75% branches. The 2026-08-11 release run reports 97.11% statements/lines, 99.33% functions, and 77.68% branches. CI uploads the HTML and LCOV report as a short-lived artifact.

## Next evaluation step

Before claiming external performance, create a blinded, independently labeled set of real-but-deidentified analysis revisions, publish annotation rules, compare mature tools and stronger baselines, and report confidence intervals plus category-level errors. That work is not represented as completed; the current scenarios remain regression tests.
