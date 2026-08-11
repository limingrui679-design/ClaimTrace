# Public Data: ONS Housing-Affordability Period Audit

Reproducible public-data case based on **Office for National Statistics — Explore Local Statistics: housing affordability ratio**. The package pins both official-source responses and their SHA-256 hashes, retrieval metadata, license and attribution, declared limitations, source-specific deterministic cleaning parameters, two cleaned CSV snapshots, executable claim and decision specifications, expected output, and a self-verifiable AuditBundle.

The observed rows and derived descriptive measures come from the pinned public source. Every decision-option benefit, cost, risk, and capacity value is separately labeled as a manual demonstration assumption; it is not an observed outcome or a recommendation from the source publisher.

## Reproduce and verify

```bash
npm run cases:generate
npm run test:unit
```

Normal generation is offline and rebuilds the CSV snapshots from the committed raw responses. A deliberate source refresh is a separate networked action: `npm run cases:refresh-sources -- ons-housing-affordability`.

## Source and scope

- Publisher: Office for National Statistics
- Dataset: Explore Local Statistics: housing affordability ratio
- Measure: HOUSING-AFFORDABILITY-RATIO — Median house price to median workplace-based earnings ratio
- Retrieved: 2026-08-11T11:07:45.932Z
- License: Open Government Licence v3.0 (https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/)
- Baseline source: https://www.ons.gov.uk/explore-local-statistics/api/v1/data.csv?indicator=housing-affordability-ratio&geo=ltla&time=2024-04-01
- Current source: https://www.ons.gov.uk/explore-local-statistics/api/v1/data.csv?indicator=housing-affordability-ratio&geo=ltla&time=2025-04-01

## Declared limitations

- The ratio combines median transacted-property prices with median workplace-based earnings and does not measure affordability for every household or tenure.
- Latest earnings inputs are provisional and the historical series can be revised annually.
- The selected local authorities illustrate audit mechanics and are not a representative spatial sample or a causal planning evaluation.

ClaimTrace indicates transformations and does not imply publisher endorsement.
