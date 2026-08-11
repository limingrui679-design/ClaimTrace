# Public Data: U.S. Treasury Yield-Curve Period Audit

Reproducible public-data case based on **U.S. Department of the Treasury — Daily Treasury Par Yield Curve Rates**. The package pins both official-source responses and their SHA-256 hashes, retrieval metadata, license and attribution, declared limitations, source-specific deterministic cleaning parameters, two cleaned CSV snapshots, executable claim and decision specifications, expected output, and a self-verifiable AuditBundle.

The observed rows and derived descriptive measures come from the pinned public source. Every decision-option benefit, cost, risk, and capacity value is separately labeled as a manual demonstration assumption; it is not an observed outcome or a recommendation from the source publisher.

## Reproduce and verify

```bash
npm run cases:generate
npm run test:unit
```

Normal generation is offline and rebuilds the CSV snapshots from the committed raw responses. A deliberate source refresh is a separate networked action: `npm run cases:refresh-sources -- us-treasury-yield-curve`.

## Source and scope

- Publisher: U.S. Department of the Treasury
- Dataset: Daily Treasury Par Yield Curve Rates
- Measure: DAILY-TREASURY-PAR-YIELD-CURVE — Year-end Treasury par yields by maturity
- Retrieved: 2026-08-11T11:07:55.527Z
- License: U.S. Government work / public data (https://www.usa.gov/government-copyright)
- Baseline source: https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value=2024
- Current source: https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value=2025

## Declared limitations

- Par yields are not bond prices, realized returns, credit spreads, or an investment recommendation.
- Two year-end observations do not characterize within-year volatility or identify causes of curve changes.
- The maturities are a declared analytical selection from the official daily curve.

ClaimTrace indicates transformations and does not imply publisher endorsement.
