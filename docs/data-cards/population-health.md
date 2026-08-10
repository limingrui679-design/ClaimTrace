# Data card: Population health

- **Purpose:** demonstrate regional risk ranking, model-recall gating, follow-up targets, and resource decisions.
- **Files:** generated details and summaries under `public/demo-data`.
- **Primary key:** `row_id` for summary audit rows; upstream details use `followup_id` and `sample_id`.
- **Generator:** `tools/generate-demo-data.mjs`; fixed seed `claimtrace-demo-v2`.
- **Population:** 4,218 synthetic follow-up records and 286 synthetic validation samples per version.
- **Verified upstream lineage:** four raw CSV sources and 20 aggregate derivations connect raw primary keys to the 11 summary rows consumed by the claim engine; each derivation records filters, numerator, denominator, rounding, formula version, row count, source-key SHA-256, and summary value.
- **Revision mechanisms:** district risk/follow-up values and model predictions change deterministically.
- **Intended claims:** highest/lowest district, recall above 80%, and follow-up completion below 80%.
- **Decisions:** model pilot gate and regional resource allocation.
- **Limitations:** no real patients, providers, clinical efficacy, epidemiologic effect estimate, cohort-design claim, or deployment claim.
