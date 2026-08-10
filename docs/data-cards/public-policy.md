# Data card: Public policy

- **Purpose:** demonstrate stable headline coverage with changing eligible populations, missing outcomes, and expansion decisions.
- **Files:** `public/cases/public-policy/baseline.csv` and `current.csv`.
- **Primary key:** `district_id`.
- **Generator:** `tools/generate-case-fixtures.mjs`.
- **Population:** four synthetic districts; no real government, program, or participants.
- **Revision mechanisms:** eligible-population composition changes, small coverage updates, and one missing outcome score.
- **Intended claims:** coverage stability, outcome threshold, and district ranking.
- **Decision:** whether evidence supports program expansion.
- **Limitations:** no causal identification, counterfactual, cost analysis, or equity assessment.
