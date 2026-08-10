# Public Data: CDC PLACES Model-Based Estimate Audit

Reproducible public-data case based on **U.S. Centers for Disease Control and Prevention — PLACES: Local Data for Better Health, County Data**. The package pins both official-source responses and their SHA-256 hashes, retrieval metadata, license and attribution, declared limitations, source-specific deterministic cleaning parameters, two cleaned CSV snapshots, executable claim and decision specifications, expected output, and a self-verifiable AuditBundle.

The observed rows and derived descriptive measures come from the pinned public source. Every decision-option benefit, cost, risk, and capacity value is separately labeled as a manual demonstration assumption; it is not an observed outcome or a recommendation from the source publisher.

## Reproduce and verify

```bash
npm run cases:generate
npm run test:unit
```

Normal generation is offline and rebuilds the CSV snapshots from the committed raw responses. A deliberate source refresh is a separate networked action: `npm run cases:refresh-sources -- cdc-places-depression`.

## Source and scope

- Publisher: U.S. Centers for Disease Control and Prevention
- Dataset: PLACES: Local Data for Better Health, County Data
- Measure: DEPRESSION-AGE-ADJUSTED-PREVALENCE — Age-adjusted prevalence of depression among adults
- Retrieved: 2026-08-10T00:00:00.000Z
- License: U.S. Government public data; CDC data-use terms apply (https://www.cdc.gov/other/agencymaterials.html)
- Baseline source: https://data.cdc.gov/resource/fu4u-a9bh.json?$select=year%2Cstateabbr%2Clocationname%2Clocationid%2Cmeasureid%2Cdatavaluetypeid%2Cdata_value%2Clow_confidence_limit%2Chigh_confidence_limit%2Ctotalpop18plus&$where=measureid%3D%27DEPRESSION%27%20AND%20datavaluetypeid%3D%27AgeAdjPrv%27%20AND%20locationid%20in%28%2706037%27%2C%2706075%27%2C%2717031%27%2C%2725017%27%2C%2736061%27%2C%2748201%27%2C%2704013%27%2C%2753033%27%29&$order=locationid
- Current source: https://data.cdc.gov/resource/swc5-untb.json?$select=year%2Cstateabbr%2Clocationname%2Clocationid%2Cmeasureid%2Cdatavaluetypeid%2Cdata_value%2Clow_confidence_limit%2Chigh_confidence_limit%2Ctotalpop18plus&$where=measureid%3D%27DEPRESSION%27%20AND%20datavaluetypeid%3D%27AgeAdjPrv%27%20AND%20locationid%20in%28%2706037%27%2C%2706075%27%2C%2717031%27%2C%2725017%27%2C%2736061%27%2C%2748201%27%2C%2704013%27%2C%2753033%27%29&$order=locationid

## Declared limitations

- PLACES values are model-based small-area estimates with uncertainty intervals, not direct county survey estimates.
- Overlapping confidence intervals and model changes limit interpretation of year-to-year differences.
- The selected counties are illustrative; the case does not estimate intervention effects, diagnose individuals, or support clinical decisions.

ClaimTrace indicates transformations and does not imply publisher endorsement.
