# Changelog

## 0.8.0 — 2026-08-11

- expanded the executable catalog from six to ten curated cases by adding five public-data audits for U.S. transit operations, Treasury yield curves, CFPB credit-card complaint trends, CDC PLACES depression estimates, and ONS housing affordability, while retiring the overlapping synthetic public-policy showcase;
- generalized external-source provenance so all six public cases retain pinned raw responses, source URLs, retrieval metadata, attribution, limitations, source-specific cleaning parameters, and exact SHA-256 verification;
- separated offline deterministic regeneration from explicit network refresh, and added source-tamper and cleaning-parameter-tamper rejection tests for every public case;
- made source refresh validate both responses with the declared source-specific cleaner before replacement, reject malformed HTTP 200 bodies and unknown case IDs, record the actual retrieval timestamp, preflight regular-file targets, persist per-case replacement transactions, restore interrupted uncommitted work on the next invocation, complete committed cleanup, and report cleanup failures;
- bounded integer cleaning parameters, split React into a dedicated production chunk, corrected the Treasury reference URL, and aligned public-case wording and release documentation with the ten-case catalog;
- expanded the Chromium acceptance flow to load and execute all ten catalog cases and reject page errors or failed asset and data requests;
- added a 15-program alignment matrix grounded in official curricula while separating documented program facts from portfolio-fit interpretation and disclosing current modeling gaps;
- regenerated and independently verified all 10 AuditBundles and passed 124/124 unit/integration tests, one real-Chromium acceptance test, 64/64 controlled scenarios, and the enforced core coverage thresholds.

## 0.7.0 — 2026-08-10

- rebuilt the complete interface as an executive evidence control room with a midnight-navy consulting visual system, responsive editorial typography, refined navigation, presentation-ready panels, and a print-oriented audit report;
- added result-driven visualizations for claim-status mix, completeness, primary-key version deltas, decision-policy flow, option scores, fixed-seed recommendation shares, and the human-review release pipeline without introducing decorative or invented metrics;
- preserved the 390 px six-route mobile navigation contract and extended the real-Chromium acceptance flow to verify each route-specific visualization;
- replaced the social-preview artwork with a matching ClaimTrace evidence-and-decision audit card and corrected the document language metadata to English;
- removed the stale hosted-demo link, clarified that GitHub and local execution are the intended handoff, and corrected the release checklist to 106 unit/integration tests plus one browser test.

## 0.6.3 — 2026-08-10

- fixed the 390 px bottom navigation by allowing all six grid columns and buttons to shrink, stacking icons above compact labels, and keeping each complete navigation control inside the viewport;
- expanded the real-Chromium mobile acceptance flow to click all six primary routes, verify each active page, check every button boundary, and reject horizontal document overflow.

## 0.6.2 — 2026-08-10

- converted the complete browser interface, audit engine messages, HTML report, six executable cases, generated datasets, tests, and repository documentation to English;
- added a repository-wide English-only regression test for shipped text artifacts and updated the public read-only browser acceptance test for the English interface;
- upgraded the rule engine to `claimtrace-rule/6.1.2`, regenerated and independently verified all case AuditBundles, and expanded verification to 106 unit/integration tests plus one real-browser test.

## 0.6.1 — 2026-08-10

- anchored recommendation-stability sweeps to an explicitly inserted `1.0` multiplier even when the configured `min`, `max`, and `step` grid would otherwise skip it, and report only the contiguous interval around that true base recommendation;
- removed import, rule-creation, review, and sign-off controls and dialogs from the compiled public read-only interface instead of leaving disabled mutation controls in the DOM;
- added an automated Chromium acceptance test covering overview, data, claims, and review routes at desktop and 390 px mobile widths, including a zero-enabled-mutation-control assertion;
- upgraded the rule engine to `claimtrace-rule/6.1.1`, regenerated and independently verified all six case AuditBundles, and expanded verification to 105 unit/integration tests plus one real-browser test, 64/64 controlled scenarios, and 512 deterministic property trials.

## 0.6.0 — 2026-08-10

- completed the standalone HTML handoff so one independently verified AuditBundle drives claim results, decision identity and change reasons, numerical-input provenance, option analysis, local unauthenticated review history, hash-chain details, root verification, and limitations;
- introduced `previousBundleHash` and `verifyAuditBundleChain()` for exact cross-bundle predecessor verification while retaining explicit limits for missing prior bundles, signatures, trusted time, roles, and revocation;
- added break-even benefit, bounded score intervals, Pareto-frontier reporting, recommendation-stability sweeps, and fixed-seed bounded Monte Carlo to the deterministic decision layer;
- added a sixth executable case from pinned World Bank WDI API responses with access date, source update, CC BY 4.0 license, raw-response SHA-256, cleaning configuration, deterministic CSV regeneration, and source-tamper tests;
- replaced percentage-style completeness claims in the interface with passed-check counts and raised supporting copy to a 12 px minimum;
- migrated the browser application from beta Vinext/RSC tooling to stable Vite + React static assets, eliminating the previously disclosed development dependency findings;
- added a separate ClaimTrace workflow with full-SHA-pinned GitHub Actions, enforceable core coverage thresholds, a downloadable coverage artifact, and both production and development dependency audits;
- added a real-browser interaction GIF and a compile-time read-only mode for the public demonstration build;
- upgraded the AuditBundle schema to `claimtrace-audit-bundle/2.2.0`, added structured local-review assurance fields and external-source provenance verification, and passed 104 automated tests, 64/64 controlled scenarios, and 512 deterministic property trials.

## 0.5.1 — 2026-08-09

- added stable `passActionId` and `holdActionId` fields and bound the currently executable action ID plus instruction hash into signed decision history; changing the active action now produces `DECISION_CHANGED` even when PASS/HOLD and the recommended option remain unchanged;
- replaced snapshot-only claim result IDs with canonical content-derived identities covering the executable rule, threshold provenance, formula, filters, computed output, sample profile, evidence scope, source references, rule version, and snapshot hashes;
- revoked stale claim release automatically when the stable result identity changes and propagated the new claim-result ID to downstream decisions as `RESIGN_REQUIRED` when the action itself is unchanged;
- made complete source, version, rationale, and benefit/cost/risk/capacity units a release gate for every numerical decision-option set; incomplete provenance remains visible as a deterministic trial calculation but is `REVIEW_REQUIRED` and cannot be signed;
- upgraded the rule engine to `claimtrace-rule/6.1.0`, the AuditBundle schema to `claimtrace-audit-bundle/2.1.0`, regenerated all five case bundles, and expanded the suite to 100 automated tests.

## 0.5.0 — 2026-08-09

- removed mutable `audit.lastRunAt` from claim review identity while retaining the stable result ID, rule version, and snapshot hashes, so a `t1` sign-off survives a `t2` AuditBundle export and recomputation;
- split decision action changes from evidence-only identity changes: outcome, recommendation, or feasible-set changes produce `DECISION_CHANGED`, while snapshot, policy, provenance, rule-version, or bound-result changes produce `RESIGN_REQUIRED`;
- replaced the broad decision-spec hash with a logic-only decision-policy hash that excludes titles, owners, labels, stakeholders, and pass/fail display copy;
- blocked downstream decision release until every bound claim has an approved release status, both in the governance engine and the interface;
- labeled prior case history as a recorded signed identity rather than proof that a prior AuditBundle exists;
- added source, version, rationale, and units for synthetic decision inputs, explicitly marking them as manual assumptions rather than observed costs or outcomes;
- added regression coverage for delayed export, snapshot-only re-signing, display-only metadata edits, upstream release gating, input-provenance changes, and correct PASS-to-HOLD wording.

## 0.4.0 — 2026-08-08

- replaced snapshot-only package checking with a canonical AuditBundle covering snapshots, claims, decisions, reviews, summaries, diffs, previews, and upstream lineage;
- made verification reconstruct raw snapshots and independently rerun claim, decision, review-chain, and raw-to-summary aggregation logic;
- bound signed decisions to recommendation, feasible set, decision-spec hash, snapshot hashes, rule version, claim-result IDs, and review record/hash;
- separated `ClaimStatus` from `DecisionStatus` and required re-signing for material decision-identity changes even when PASS/HOLD is unchanged;
- connected the health case's 4,218 follow-up and 286 validation records per version to 20 verified aggregations and 11 audited summary rows;
- replaced six repeated templates with 64 distinct controlled scenarios across eight edge-case families and added 512 deterministic property-test trials;
- added tamper tests for derived claims, decisions, reviews, record order, upstream aggregation metadata, and upstream raw content;
- added the explicit TypeScript extension required by Vite's future-compatible configuration loader.

## 0.3.0 — 2026-08-08

- balanced bounded evidence across baseline/current snapshots, with paired changed keys, rule-specific boundary records, and deterministic sampling;
- split snapshot claims from version-comparison claims and compare decisions only with stored signed history;
- replaced the implicit two-times stability rule with separately governed support and reversal thresholds;
- added constrained option scoring, no-action loss, stakeholders, and sensitivity scenarios;
- added UUID/SHA-256 review chains and separate engine, human-disposition, and release states for claims and decisions;
- upgraded all five synthetic datasets into executable case packs with expected audits and verified evidence packages;
- moved 48 regression labels into independent JSON and added multiple baselines, classification metrics, and ablations;
- added required TypeScript checking to local CI and GitHub Actions.

## 0.2.0 — 2026-08-08

- introduced modular snapshot, statistics, validation, decision, governance, and evidence cores;
- added deterministic health evidence fixtures, bounded exports, snapshot re-verification, and controlled regression scenarios.
