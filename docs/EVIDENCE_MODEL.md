# Evidence model

## SnapshotManifest

Each snapshot records its side, file name, raw SHA-256, normalized-record SHA-256, row count, byte size, columns, primary key, CSV-dialect version, normalization-policy version, generation time, verification time, and verification status. A 64-character string alone is not treated as proof: verification recomputes the digest from retained raw CSV and the canonical row representation.

`claimtrace-csv-strict/1.0.0` uses explicit unquoted, quoted, and after-quote parser states. It rejects a bare quote inside an unquoted field, non-delimiter content after a closing quote, unterminated quoted fields, duplicate headers, and inconsistent row widths. It preserves leading and trailing whitespace inside quoted fields, trims unquoted cells, treats doubled quotes as one literal quote, retains embedded newlines, and accepts LF or CRLF record endings.

`claimtrace-normalized-rows/1.0.0` uses the baseline manifest's column order as the canonical order for both snapshots. A current file with the same exact case-sensitive column set may arrive in a different order and is aligned before normalized hashing and execution. Missing, additional, differently cased, or duplicate columns are rejected. AuditBundle reconstruction and verification apply the same versioned contracts rather than a separate import-only interpretation.

## Claim rule

A claim binds natural-language text to:

- a field and aggregation;
- include/exclude filters;
- a stability, threshold, or grouped-rank rule;
- a canonical comparison-result ID derived from stable claim and rule content;
- threshold value, unit, source, business rationale, confirmer, and confirmation time where applicable;
- baseline/current sample profiles;
- exact key and physical-line references;
- rule-engine version and audit time.

An automatic tolerance without a confirmer remains `REVIEW_REQUIRED` and is labeled preliminary.

The result ID covers the claim text, formula, executable rule, threshold provenance, filters, computed status and values, sample profile, evidence scope, exact source references, rule-engine version, and snapshot hashes. It excludes mutable run time and governance state. Changing a threshold, formula, filter, or provenance source therefore creates a new result identity, blocks the old release, and changes the bound result ID seen by downstream decisions.

Claims have two explicit kinds:

- `SNAPSHOT`: a threshold or rank can be evaluated on one version.
- `VERSION_COMPARISON`: stability is defined across two versions and therefore has no fabricated baseline claim status.

Stability rules use two independent governed values: `supportTolerance` and optional `reversalThreshold`. Both carry their own source, rationale, confirmer, and time. If a change exceeds the support tolerance but no valid reversal threshold exists, the engine returns `REVIEW_REQUIRED`; it never invents a two-times rule.

## Sample profile

For each version ClaimTrace records:

- total rows;
- rows after filters;
- effective numeric rows;
- missing rows;
- excluded rows;
- distinct included primary keys and a stable key-set fingerprint;
- group counts for rank rules.

A stable mean does not silently pass when the denominator or sample composition changes.

## Separate status semantics

Claim statuses are:

- `SUPPORTED`: current evidence supports the governed claim.
- `WEAKENED`: a stability claim moved beyond its confirmed support tolerance but remains below a separately confirmed reversal threshold.
- `REVERSED`: current evidence contradicts the governed claim.
- `UNTESTABLE`: required data, a valid expected group, or an executable rule is absent.
- `REVIEW_REQUIRED`: evidence is ambiguous, provenance is incomplete, a tie/empty group exists, sample composition changed, or a newly supported claim needs sign-off.

Decision statuses are separate:

- `SUPPORTED`: a current decision is executable and both its action identity and evidence identity match the recorded prior signed identity.
- `DECISION_CHANGED`: the outcome, active stable action ID/instruction, recommended option, or feasible action set changed. This is an action change even when other identity fields also changed.
- `RESIGN_REQUIRED`: the action identity is unchanged, but the decision policy, input provenance, snapshot hashes, rule version, or bound claim-result IDs changed. It requires a new sign-off but must not be described as an action change.
- `REVIEW_REQUIRED`: bound claims are unresolved or signed history is incomplete.

## DecisionSpec

A decision contains an owner, claim conditions, allowed statuses, stable `passActionId` / `holdActionId` values and their instructions, optional scored options, objective weights, costs, benefits, risks, capacity, constraints, stakeholders, scenario multipliers, no-action loss, input provenance, and a recorded prior signed result. The stored result binds outcome, active action ID and instruction hash, recommended option, feasible option IDs, decision-policy hash, decision-input provenance hash, baseline/current snapshot SHA-256, rule version, claim-result IDs, and its review record/hash.

The policy hash contains only fields that drive gating, action identity, feasibility, scoring, or scenario calculations. It includes stable action IDs and their executable instructions, while titles, owners, stakeholder labels, and option/constraint display labels are excluded. Input provenance separately records whether numbers are manual assumptions or data-derived, together with source, version, rationale, and benefit/cost/risk/capacity units. If numerical options exist and any required provenance field is blank, the engine can still show the deterministic trial calculation but returns `REVIEW_REQUIRED`; the governance layer and interface do not permit sign-off. The bundled synthetic cases use complete manual-assumption provenance and do not present their scores as observed effects, costs, or risks.

`priorSignedResult.historyBasis = RECORDED_IDENTITY` means the current bundle can validate the shape and use of that stored identity, but does not prove that a previous AuditBundle exists. With no recorded history, the engine reports the current outcome without inventing a change.

The option layer is deliberately deterministic rather than an opaque optimizer: it filters infeasible actions, scores the remaining actions with committed weights, reports break-even benefit and declared-range score intervals, identifies the non-dominated Pareto frontier, sweeps the benefit multiplier to find the recommendation-stability region, and runs a fixed-seed bounded-uniform Monte Carlo over declared benefit/cost/risk/capacity ranges. These outputs are sensitivity diagnostics, not confidence intervals or forecast probabilities.

## ReviewRecord

Review records bind a claim or decision to a user-entered reviewer, disposition, note, timestamp, UUID, SHA-256 record hash, and previous-record hash. New records append; they do not overwrite history. A `REVERSED` claim cannot receive ordinary approval: it requires an explicit `RISK_ACCEPTED` disposition and a written reason.

The reviewer field is a display name, not an authenticated identity. Each record includes an explicit assurance block: `identity = LOCAL_UNVERIFIED`, `timestamp = LOCAL_CLOCK_UNVERIFIED`, `authorization = SELF_ASSERTED`, and `cryptographicSignature = NONE`. These values are also covered by the record hash and exported report.

A claim review hash excludes only the mutable `audit.lastRunAt` field. It still binds the stable result ID, rule version, baseline/current snapshot SHA-256, rule output, evidence references, and all other result content. This lets a claim signed at `t1` be independently recomputed and exported at `t2` without weakening its data or rule binding.

The model stores three separate governance fields:

- `engineStatus`: deterministic calculation result;
- `reviewDisposition`: human approval, return, or risk acceptance;
- `releaseStatus`: whether the result remains blocked or is approved for use, with or without explicit risk.

Decision calculation remains independent of human release state, but decision release does not: every bound claim must already be `APPROVED_FOR_USE` or `APPROVED_WITH_RISK` before a downstream decision can receive `APPROVED`, `RESIGNED`, or `RISK_ACCEPTED` release. If an upstream claim is later returned or blocked, the downstream release is automatically blocked while its original human disposition remains preserved in the append-only record.

## AuditBundle

The exported `AuditBundle` places snapshot manifests/payloads, claim specifications/results, decision specifications/results, diffs, summaries, previews, reviews, review-chain head, optional upstream lineage, optional external-source provenance, and `previousBundleHash` under one canonical SHA-256 root. Section hashes localize changes but do not replace the root.

Verification does not trust exported result fields. It reconstructs snapshots from raw bytes, validates hashes and primary keys, reruns all claim and decision specifications, reapplies the review chain, and compares regenerated derived fields. If upstream lineage is present, it also verifies raw source hashes, filters, numerator/denominator rules, rounding, source-key-set hashes, and the resulting summary rows. External-source verification requires exactly one embedded response per snapshot side and binds each declared source type to its registered cleaning implementation before either snapshot is rebuilt. The bundle is tamper-evident but not digitally signed; see `docs/SECURITY.md`.

For every public-data case, verification additionally rehashes both retained official-source responses, checks retrieval/license/measure metadata, applies the source-specific committed cleaning parameters, regenerates the baseline and current CSV text, and compares it with the snapshot payloads. The supported transformations cover World Bank Indicators JSON, USDOT and CDC Socrata JSON, U.S. Treasury Atom/XML, CFPB nested trend aggregations, and ONS CSV.

`verifyAuditBundleChain()` accepts bundles in oldest-to-newest order, verifies each package independently, and then checks genesis, exact predecessor roots, duplicate or malformed roots, project continuity, and primary-key continuity. Structurally malformed entries produce failed checks and link results instead of an exception. Within each bundle, derived-result, upstream-lineage, and external-source-lineage verification report exactly one independent result each, so malformed provenance does not duplicate or mask unrelated diagnostics. A single bundle validates only the format of its link; proving a prior bundle requires retaining and supplying that bundle. The chain is not digitally signed or externally anchored.

The standalone HTML report accepts only a verified bundle plus its verification result. It includes claim/result IDs, evidence counts, decision action identity, recommendation and feasible sets, change reasons, numerical provenance, sensitivity analysis, governance state, local unauthenticated review records, record hashes, AuditBundle root and section checks, optional external-source metadata, and limitations. A passed verification check always has an empty error list; the report renders diagnostic messages only for failed checks.

## Completeness

The UI displays a passed-check count rather than an accuracy percentage. Each claim has 16 explicit checks: claim text, stable result binding, executable rule, threshold provenance, rule version, field presence, primary-key validity, extraction scope, both-version references, paired changed keys, source-row resolution, exact lines, key references, reverified hashes, timestamps, and formula. A missing current or baseline reference prevents 16/16, even if every exported reference on the remaining side is valid. This check rate is not model accuracy or business impact.

When a claim exceeds the 200-reference boundary, each version first receives a quota. Changed keys that exist on both sides are exported as record pairs; boundary distance is computed from the actual threshold, stability band, or rank frontier; remaining capacity is filled by a fixed-seed deterministic sample. `EvidenceScope` records matching and exported counts separately for baseline and current, plus pair, boundary, and sample counts.
