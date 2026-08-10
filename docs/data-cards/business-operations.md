# Data card: Business operations

- **Purpose:** demonstrate channel-rank, conversion, service-time, missingness, and resource-allocation audits.
- **Files:** `public/cases/business-operations/baseline.csv` and `current.csv`.
- **Primary key:** `channel_id`.
- **Generator:** `tools/generate-case-fixtures.mjs`.
- **Population:** four synthetic acquisition channels; no real customers or firms.
- **Revision mechanisms:** conversion changes, service-time changes, one missing service-time value, and stable membership.
- **Intended claims:** best conversion channel, service-time SLA, and average conversion stability.
- **Decision:** whether to reallocate campaign and service resources.
- **Limitations:** tiny constructed table; not representative of seasonality, attribution, or operational constraints.
