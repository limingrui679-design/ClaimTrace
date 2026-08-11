# Limitations and non-claims

## Implemented boundaries

- User project import is CSV only and limited to 10 MiB per file before browser-side reading. Excel, Parquet, SQL, OpenLineage, and warehouse adapters are not implemented. The bundled public cases have six narrow, source-specific acquisition/cleaning adapters; these are not a general API connector framework.
- Browser-local processing is suitable for reviewable files, not warehouse-scale lineage.
- Raw snapshots at or below 500 KB are embedded in a verified AuditBundle as text or base64-encoded bytes so the package can be verified on its own. Larger raw snapshots can still be analyzed locally, but verified AuditBundle and HTML report export is blocked because the current verifier has no detached raw-file input path.
- Evidence-reference selection precomputes full-snapshot statistics before ranking bounded references, but row count is not separately capped and the 10 MiB byte limit is not a latency guarantee.
- Source references are bounded at 200 per claim and changed-record exports at 500.
- Four case packs remain deterministic synthetic stress fixtures with executable claims, decisions, expected audits, evidence packages, and one-click UI loading. Six additional packs use pinned official public data, but each remains a bounded descriptive audit example rather than an external effectiveness study or representative domain benchmark.
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
- The synthetic business fixture does not establish measured operating impact or client adoption; the synthetic financial fixture is not a portfolio backtest or calibrated risk model; the synthetic health fixture is not an epidemiologic study; and the synthetic spatial fixture does not model GIS geometry, network accessibility, boundary changes, or MAUP.
- The six public cases verify acquisition metadata, pinned-response hashes, deterministic cleaning, and descriptive claim propagation. The Treasury case is not a trading strategy or return study; CFPB complaint records are not representative incidence rates or adjudicated findings; CDC PLACES values are model-based estimates rather than intervention effects or individual diagnoses; USDOT ridership per revenue hour is not causal efficiency or service quality; ONS selected-authority ratios are not a causal planning evaluation; and the World Bank comparison is cross-year, not a same-observation release-revision study.
- Public-case thresholds and numerical decision-option scores remain rule provenance or manually declared demonstration assumptions. They are not recommendations or impact estimates supplied by the source publishers and do not establish external validity.

## Product non-claims

The repository does not claim real users, institutional adoption, production deployment, time savings, financial impact, health outcomes, GitHub popularity, or a long development history.
