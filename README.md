# ClaimTrace

> Versioned evidence and decision auditing for analytical claims.

[Case catalog](public/cases/catalog.json) · [Controlled benchmark](benchmarks/results.json) · [Implementation status](#implementation-status) · [Release checklist](docs/CLAIMTRACE_RELEASING.md)

![ClaimTrace real browser walkthrough](docs/claimtrace-demo.gif)

ClaimTrace turns a report sentence into a governed, executable object. It connects natural-language claims to a user-selected primary key, exact CSV lines, raw and normalized SHA-256 snapshots, sample denominators, threshold provenance, deterministic rules, downstream decisions, and local review records.

When a revised dataset arrives, ClaimTrace aligns records by key and answers two separate questions:

1. Is the analytical claim still supported?
2. Did the action change, or does unchanged action merely require a new sign-off?

The repository includes a separately compiled read-only portfolio mode. The standard local build keeps import, rule creation, review, and export workflows available without an account or server-side data upload. No hosted deployment is required to review or run the project.

## Why it is different

Most data-diff tools stop at changed cells, while dashboards stop at changed metrics. ClaimTrace propagates a version change through a governed chain:

```text
source → snapshot → keyed records → sample profile → claim → decision → review → AuditBundle
```

Core safeguards:

- **Primary-key comparison:** record order does not create false changes.
- **Exact evidence references:** both versions retain keys, physical lines, fields, and snapshot hashes.
- **Balanced bounded export:** changed keys are paired across versions; real boundary rows come next; a fixed-seed sample fills remaining capacity.
- **Zero-baseline safety:** `0 → n` never becomes an invented percentage. It requires a governed absolute tolerance or review.
- **Tie- and missingness-aware rules:** ties, absent groups, empty groups, denominator changes, and cohort changes cannot silently pass.
- **Governed thresholds:** values, units, sources, rationales, confirmers, and confirmation times are rule content. Unconfirmed defaults remain preliminary.
- **Stable result identity:** a threshold, formula, filter, provenance, computed result, or evidence change creates a new claim-result ID and invalidates stale release state.
- **Separate claim and decision states:** claim statuses and decision statuses cannot be confused.
- **Action identity:** outcome, active action ID/instruction, recommended option, or feasible set changes produce `DECISION_CHANGED`; evidence-only identity changes produce `RESIGN_REQUIRED`.
- **Provenance gate:** numerical decision options without source, version, rationale, and units remain visible trial calculations but cannot be signed.
- **Decision depth:** constraint filtering, deterministic scoring, break-even benefit, score intervals, Pareto frontier, recommendation-stability sweeps, and fixed-seed bounded Monte Carlo are reported without calling them prediction probabilities.
- **Governance propagation:** a downstream decision cannot be released while any bound claim is blocked or unsigned.
- **Whole-bundle verification:** verification reconstructs snapshots and reruns claims, decisions, source transformations, review state, and summaries instead of trusting exported result fields.
- **Cross-bundle chain:** `previousBundleHash` links independently retained bundles; chain verification checks every root and exact predecessor relationship.

## Quick start

Requires Node.js 22.13 or newer.

```bash
npm ci
npm run dev
```

Open the local URL printed by Vite. CSV input supports UTF-8, UTF-8 with BOM, UTF-16LE with BOM, and UTF-16BE with BOM.

Full verification:

```bash
npx playwright install chromium
npm run ci
npm audit --omit=dev
npm audit
```

`npm run ci` runs lint, TypeScript checking, deterministic fixture generation, the benchmark, a production build, 106 unit/integration tests, one real-Chromium read-only acceptance test, and coverage thresholds.

## Reproducible cases

Five cases use deterministic synthetic data. The sixth uses pinned World Bank WDI API responses for life expectancy at birth (`SP.DYN.LE00.IN`), with access date, API URL, source update date, license, raw-response SHA-256, transformation configuration, and cleaning log retained in the case and AuditBundle.

| Domain | Audit question | Data origin |
|---|---|---|
| [Business operations](public/cases/business-operations/) | Should channel and service resources be reallocated after ranking and SLA changes? | Synthetic |
| [Financial risk](public/cases/financial-risk/) | Does a portfolio gate remain executable after probability, membership, and missingness changes? | Synthetic |
| [Population health](public/cases/population-health/) | Do revised risk, recall, and follow-up rates change pilot and allocation decisions? | Synthetic with verifiable upstream lineage |
| [Public policy](public/cases/public-policy/) | Is expansion still supported when coverage is stable but the eligible population changes? | Synthetic |
| [Spatial planning](public/cases/spatial-planning/) | Should a candidate site change after demand, travel-time, and risk revisions? | Synthetic |
| [World Bank life expectancy](public/cases/world-bank-life-expectancy/) | Which descriptive claims and publication actions change between 2019 and 2024 snapshots? | External public data, CC BY 4.0 |

The external case cites the [World Bank indicator page](https://data.worldbank.org/indicator/SP.DYN.LE00.IN), [API documentation](https://datahelpdesk.worldbank.org/knowledgebase/articles/889392), and [World Bank public license terms](https://datacatalog.worldbank.org/public-licenses). Its policy thresholds and decision inputs remain explicitly illustrative; they are not World Bank recommendations.

Regenerate every case:

```bash
npm run demo:generate
npm run cases:generate
```

Every case includes executable specifications, two snapshots, expected results, a manifest, documentation, and a verified AuditBundle. The population-health case additionally connects 4,218 follow-up and 286 validation records per version through 20 reproducible aggregations to 11 audited summary rows.

## Evaluation and verification status

- **107 / 107 automated tests** — 106 unit/integration tests plus 1 real-Chromium read-only acceptance test
- **64 / 64 distinct controlled benchmark scenarios** across eight edge-case families
- **512 deterministic property-test trials** across four seeded properties
- **97.68% statement/line coverage, 79.19% branch coverage, 99.25% function coverage** for `src/core`
- **6 / 6 case AuditBundles regenerated and independently verified**
- **0 known production dependency vulnerabilities**
- **0 known full development-toolchain vulnerabilities**

The benchmark labels are stored separately from the execution logic in [`benchmarks/labels.json`](benchmarks/labels.json). The deliberately weak line/scalar, metric-only, and keyed-diff baselines score 27/64, 35/64, and 24/64 respectively. These results establish regression behavior on committed boundaries only—not production accuracy, external validity, user impact, or superiority to mature audit platforms. See [`docs/EVALUATION.md`](docs/EVALUATION.md).

## Architecture

```text
src/core/snapshot/      CSV, encoding, hashes, manifests, primary keys
src/core/claim-spec/    threshold provenance and confirmation
src/core/statistics/    aggregation, denominators, diffs, ties
src/core/validation/    claim execution and bounded references
src/core/decision/      action identity and option analysis
src/core/governance/    review records and release propagation
src/core/integrity/     canonical JSON and stable identities
src/core/evidence/      AuditBundle, chain verification, HTML reports
src/cases/              six executable case specifications
```

The browser is built as a stable Vite + React SPA and can produce static Cloudflare-compatible assets. The audit core is deterministic and independent of the UI, and the repository runs locally without a hosted service. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`docs/EVIDENCE_MODEL.md`](docs/EVIDENCE_MODEL.md).

The interface uses a consulting-style evidence control room rather than a generic administration template: an executive audit readout, claim-status portfolio mix, primary-key version-delta chart, option-scoring and fixed-seed stability graphics, governance release pipeline, and print-ready executive report are all driven by the current computed results. No decorative chart uses invented metrics.

## Honest governance boundary

Review records explicitly declare:

```text
identity: LOCAL_UNVERIFIED
timestamp: LOCAL_CLOCK_UNVERIFIED
authorization: SELF_ASSERTED
cryptographicSignature: NONE
```

UUIDs, SHA-256 record chaining, and AuditBundle roots provide tamper-evident internal consistency; they do not authenticate a reviewer, prove source truth, provide a trusted timestamp, or replace role-based authorization and digital signatures. The current review history is browser-session state, not a durable multi-user ledger. See [`docs/LIMITATIONS.md`](docs/LIMITATIONS.md) and [`docs/SECURITY.md`](docs/SECURITY.md).

## Responsible portfolio wording

Supported by committed artifacts:

> Independently designed and implemented a local-first prototype for versioned analytical-claim auditing, connecting primary-key data changes, governed thresholds, sample denominators, SHA-256 snapshots, executable rules, decision identity, and local review records; validated it with 64 controlled scenarios, 512 deterministic property trials, five reproducible synthetic cases, and one provenance-bound public-data case.

Not supported: production deployment, real institutional governance, authenticated sign-off, real-user outcomes, five empirical domain studies, causal policy evaluation, portfolio backtesting, epidemiologic inference, or GIS analysis.


## Implementation status

ClaimTrace does more than compare changed cells. It connects source provenance, data snapshots, keyed records, sample denominators, executable claims, decision identity, and local review records in one versioned audit chain.

The current release closes four core loops:

- HTML and JSON are generated from the same independently verified AuditBundle, including claims, decisions, numerical-input provenance, the review chain, completeness checks, and the canonical root hash.
- Action change is separated from evidence refresh: an active action, recommendation, or feasible-set change produces `DECISION_CHANGED`, while unchanged action with new rule or evidence identity produces `RESIGN_REQUIRED`.
- All six cases execute from committed specifications: five use synthetic data, and one retains World Bank source, license, access date, raw-response hashes, and cleaning lineage.
- Human review is always described as local and unauthenticated; a user-entered display name is never presented as a login identity, authorized role, trusted timestamp, or digital signature.

The interface reports completeness as passed checks, such as `48/48`. This is not model accuracy, research effect, or business impact. The read-only portfolio build removes import and sign-off controls; those workflows remain available in the standard local repository build.

## License

[MIT](LICENSE) © 2026 Mingrui Li
