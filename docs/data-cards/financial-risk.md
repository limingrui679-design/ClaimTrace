# Data card: Financial risk

- **Purpose:** demonstrate portfolio probability thresholds, exposure, missingness, additions/removals, and gate decisions.
- **Files:** `public/cases/financial-risk/baseline.csv` and `current.csv`.
- **Primary key:** `account_id`.
- **Generator:** `tools/generate-case-fixtures.mjs`.
- **Population:** five synthetic account observations per version; no real borrowers or financial institution.
- **Revision mechanisms:** probability updates, one missing probability, one removed account, one added account, and label changes.
- **Intended claims:** average probability gate, highest-risk portfolio, and effective-sample stability.
- **Decision:** whether a simplified portfolio rule may proceed to review.
- **Limitations:** not a credit model, portfolio backtest, calibrated validation study, regulatory artifact, or lending recommendation.
