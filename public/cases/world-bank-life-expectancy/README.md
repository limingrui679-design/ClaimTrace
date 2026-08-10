# Public Data: World Bank Life-Expectancy Cross-Year Audit

Reproducible public-data case based on **World Bank — World Development Indicators**. The package pins both official-source responses and their SHA-256 hashes, retrieval metadata, license and attribution, declared limitations, source-specific deterministic cleaning parameters, two cleaned CSV snapshots, executable claim and decision specifications, expected output, and a self-verifiable AuditBundle.

The observed rows and derived descriptive measures come from the pinned public source. Every decision-option benefit, cost, risk, and capacity value is separately labeled as a manual demonstration assumption; it is not an observed outcome or a recommendation from the source publisher.

## Reproduce and verify

```bash
npm run cases:generate
npm run test:unit
```

Normal generation is offline and rebuilds the CSV snapshots from the committed raw responses. A deliberate source refresh is a separate networked action: `npm run cases:refresh-sources -- world-bank-life-expectancy`.

## Source and scope

- Publisher: World Bank
- Dataset: World Development Indicators
- Measure: SP.DYN.LE00.IN — Life expectancy at birth, total (years)
- Retrieved: 2026-08-10T00:00:00.000Z
- License: CC BY 4.0 (https://datacatalog.worldbank.org/public-licenses)
- Baseline source: https://api.worldbank.org/v2/country/CHN;JPN;USA;GBR;FRA;DEU;BRA;IND/indicator/SP.DYN.LE00.IN?date=2019&format=json&per_page=1000
- Current source: https://api.worldbank.org/v2/country/CHN;JPN;USA;GBR;FRA;DEU;BRA;IND/indicator/SP.DYN.LE00.IN?date=2024&format=json&per_page=1000

## Declared limitations

- The two snapshots compare observation years, not two releases of the same observation year.
- The eight-country selection is illustrative and is not a representative global sample.
- Descriptive differences do not identify causes, intervention effects, or country performance.

ClaimTrace indicates transformations and does not imply publisher endorsement.
