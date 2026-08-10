# Data card: World Bank life-expectancy cross-year case

- **Purpose:** demonstrate how pinned public API revisions propagate through descriptive claims, publication actions, evidence references, and a verified AuditBundle.
- **Publisher:** World Bank.
- **Dataset:** World Development Indicators.
- **Indicator:** `SP.DYN.LE00.IN`, Life expectancy at birth, total (years).
- **Snapshots:** 2019 baseline and 2024 current values for BRA, CHN, DEU, FRA, GBR, IND, JPN, and USA.
- **Access date:** 2026-08-10.
- **Source update recorded by API:** 2026-07-13.
- **License:** CC BY 4.0 under the World Bank public license terms.
- **Primary key:** `country_code`.

## Retained provenance

The case retains both pinned API response bodies, response SHA-256 values, exact query URLs, indicator and country selection, access/source-update dates, attribution, transformation implementation/version, decimal precision, cleaning log, cleaned CSV hashes, executable rules, illustrative decision assumptions, expected audit, and self-verifiable AuditBundle.

The generator parses the pinned JSON, requires the declared indicator and eight ISO3 codes, maps years to snapshot sides, rounds to three decimals, sorts by ISO3 code, and emits a stable UTF-8 CSV column order. Package verification repeats that transformation and compares exact snapshot text.

## Non-claims

This case is a descriptive cross-year audit, not a same-observation release-revision audit. It is not a causal analysis, epidemiological study, country performance ranking, policy recommendation, or external validation of ClaimTrace. The threshold and decision-option values are versioned manual demonstration assumptions and are not supplied or endorsed by the World Bank.
