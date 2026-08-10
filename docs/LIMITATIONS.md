# Limitations and non-claims

## Implemented boundaries

- CSV only. Excel, Parquet, SQL, APIs, OpenLineage, and warehouse adapters are not implemented.
- Browser-local processing is suitable for reviewable files, not warehouse-scale lineage.
- Raw snapshots larger than 500 KB are not embedded in the AuditBundle; external files are then required for independent hash re-verification and the self-contained verifier reports that boundary.
- Source references are bounded at 200 per claim and changed-record exports at 500.
- Five case packs are deterministic synthetic examples with executable claims, decisions, expected audits, evidence packages, and one-click UI loading. Four remain intentionally small fixtures rather than representative domain datasets. The sixth case uses pinned World Bank public API responses but remains a descriptive audit example, not an external effectiveness study.
- Review records are append-only in the current browser session and export, not a durable multi-user ledger.
- A case's `RECORDED_IDENTITY` prior decision can be compared deterministically, but that identity alone does not prove that a prior AuditBundle existed. New exports can carry `previousBundleHash`, and `verifyAuditBundleChain()` verifies exact predecessor roots only when every linked bundle is independently retained and supplied. This is still not an external transparency record.
- The canonical AuditBundle is tamper-evident, not signed. SHA-256 proves byte identity and internal consistency, not origin authenticity, truthfulness, collection quality, lawful use, or semantic validity.
- There is no digital signature, trusted timestamp authority, role-based access control, authenticated reviewer identity, durable revocation service, or external transparency log. Review records structurally declare `LOCAL_UNVERIFIED`, `LOCAL_CLOCK_UNVERIFIED`, `SELF_ASSERTED`, and `NONE` for those assurances.
- The read-only portfolio build is a presentation mode, not an authenticated governance service, and browser state is not durable.
- The committed interaction GIF is a real-browser walkthrough of the local application, not evidence of external users or production operation.

## Statistical boundaries

- Rules are deterministic checks, not causal inference.
- Missingness is surfaced but not imputed or modeled.
- Rank ties use exact numeric equality within `1e-9`; domain-specific uncertainty intervals are future work.
- Stability uses user-governed thresholds. A threshold does not become valid merely because it is entered.
- The controlled benchmark is synthetic and cannot establish external validity.
- The 64 scenarios are distinct synthetic edge cases with independently stored labels, not independently collected real-world cases. The 512 property-test trials are deterministic generated checks, not an external benchmark.
- Option scores use user-specified deterministic weights and constraints; they are not a calibrated utility model or a general mathematical-programming solver. Break-even values, score intervals, Pareto frontiers, recommendation-stability sweeps, and fixed-seed bounded Monte Carlo are sensitivity diagnostics driven by declared ranges—not confidence intervals, forecast probabilities, or uncertainty learned from data. Numerical options cannot be signed without source, version, rationale, and benefit/cost/risk/capacity units, but that provenance gate does not prove the inputs are true or well calibrated. The bundled cases label these inputs as versioned manual assumptions; they are not observed outcomes or externally validated estimates.
- The financial case is not a portfolio backtest or calibrated risk model; the policy case is not causal inference or cost-benefit evaluation; the health case is not an epidemiologic study; and the spatial case does not model GIS geometry, network accessibility, boundary changes, or MAUP.
- The World Bank case verifies acquisition metadata, pinned-response hashes, deterministic cleaning, and descriptive claim propagation. Its illustrative thresholds and action scores are not World Bank policy recommendations and do not establish external validity.

## Product non-claims

The repository does not claim real users, institutional adoption, production deployment, time savings, financial impact, health outcomes, GitHub popularity, or a long development history.
