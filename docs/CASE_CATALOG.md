# Reproducible case catalog

ClaimTrace ships ten executable cases with two distinct evidence roles. Four deterministic synthetic fixtures isolate failure modes under controlled conditions. Six public-data cases exercise pinned-source provenance and source-specific cleaning. Neither role is presented as real-user impact or external validation.

## At a glance

| Case | Evidence role | Primary key | Audit focus | Case pack |
|---|---|---|---|---|
| Business operations | Deterministic synthetic | `channel_id` | Ranking, SLA changes, and resource allocation | [Open](../public/cases/business-operations/) |
| Financial risk | Deterministic synthetic | `account_id` | Probability, membership, missingness, and thresholds | [Open](../public/cases/financial-risk/) |
| Population health | Synthetic with verified upstream lineage | `row_id` | Risk, recall, follow-up, and model gating | [Open](../public/cases/population-health/) |
| Spatial planning | Deterministic synthetic | `site_id` | Demand, travel time, risk, and site selection | [Open](../public/cases/spatial-planning/) |
| World Bank life expectancy | Pinned public data · CC BY 4.0 | `country_code` | Cross-year indicator claims | [Open](../public/cases/world-bank-life-expectancy/) |
| USDOT transit operations | Pinned public data · U.S. DOT/FTA | `ntd_id` | Ridership and service intensity | [Open](../public/cases/usdot-transit-operations/) |
| U.S. Treasury yield curve | Pinned public data · U.S. Treasury | `maturity_code` | Period and curve-shape claims | [Open](../public/cases/us-treasury-yield-curve/) |
| CFPB credit-card complaints | Pinned public data · CC0 | `issue_id` | Issue ranking, shares, and matched volume | [Open](../public/cases/cfpb-credit-card-complaints/) |
| CDC PLACES depression estimates | Pinned public data · CDC | `location_id` | Selected-county release changes | [Open](../public/cases/cdc-places-depression/) |
| ONS housing affordability | Pinned public data · OGL v3.0 | `area_code` | Selected-authority period changes | [Open](../public/cases/ons-housing-affordability/) |

## Why both roles matter

### Synthetic stress fixtures

Synthetic fixtures provide exact labels for edge conditions that are difficult to isolate in a public dataset: row reordering, zero baselines, missing values, tied ranks, membership changes, threshold crossings, stale result identity, and decision re-signing. They are deterministic regression cases, not observations about real people, firms, portfolios, or policies.

### Public-data cases

Public-data cases retain two pinned publisher responses, retrieval URLs and time, attribution and license, declared limitations, source-specific cleaning parameters, raw-response SHA-256 values, cleaned snapshots, expected output, and a verified AuditBundle. They test reproducible lineage on bounded selections; they do not establish causal effects, representative performance, publisher endorsement, or institutional adoption.

## Anatomy of a case pack

Every generated directory under [`public/cases`](../public/cases/) includes:

| Artifact | Purpose |
|---|---|
| `baseline.csv`, `current.csv` | Versioned snapshots consumed by the claim engine |
| `claims.json`, `decisions.json` | Executable specifications and governed assumptions |
| `expected-audit.json` | Committed expected terminal states for regression testing |
| `evidence-package.json` | Self-contained AuditBundle used for independent verification |
| `manifest.json` | Artifact sizes, hashes, and case metadata |
| `case.ts` | Executable case definition |
| `README.md` | Case-specific reproduction steps and interpretation limits |

Public-data packs also include raw publisher responses, `source-config.json`, `source-metadata.json`, and `cleaning-log.json`. The USDOT case additionally retains official Socrata dataset metadata; the population-health synthetic fixture retains verified raw-to-summary upstream lineage.

## Reproduce the complete catalog

```bash
npm run demo:generate
npm run cases:generate
npm run test:unit
```

Generation must leave the committed artifacts unchanged. The machine-readable catalog at [`public/cases/catalog.json`](../public/cases/catalog.json) records all ten packs and their file hashes.

## Interpretation boundary

- Thresholds and numerical decision options are versioned demonstration inputs unless an external source is explicitly named in their provenance.
- Public-source values remain descriptive. They are not causal, clinical, investment, regulatory, or planning recommendations.
- Passing case verification proves internal reproducibility against committed evidence. It does not authenticate the publisher response or demonstrate real-world effectiveness.
