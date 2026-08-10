# Data card: Spatial planning

- **Purpose:** demonstrate order-insensitive site comparison, demand ranking, travel-time gates, and risk updates.
- **Files:** `public/cases/spatial-planning/baseline.csv` and `current.csv`.
- **Primary key:** `site_id`.
- **Generator:** `tools/generate-case-fixtures.mjs`.
- **Population:** four synthetic candidate sites; no real coordinates, residents, or planning authority.
- **Revision mechanisms:** row reordering, demand changes, travel-time changes, and flood-risk updates.
- **Intended claims:** highest-demand site, acceptable travel time, and risk threshold.
- **Decision:** whether to retain or change the candidate site.
- **Limitations:** no GIS geometry, network model, land constraints, or environmental assessment.
