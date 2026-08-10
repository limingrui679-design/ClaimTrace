# Public Data: World Bank Life-Expectancy Version Audit

Reproducible public-data case based on the World Bank World Development Indicators API. The package pins two API responses, their SHA-256 hashes, the access and source-update dates, CC BY 4.0 attribution, a deterministic cleaning log, two cleaned CSV snapshots, executable claim and decision specifications, expected output, and a self-verifiable AuditBundle. The decision-option values remain clearly labeled manual demonstration assumptions; this is a descriptive data-version audit, not a causal or epidemiological study.

Run from the repository root:

```bash
npm run cases:generate
npm run test:unit
```

Source: World Bank, World Development Indicators, SP.DYN.LE00.IN. License: CC BY 4.0. Accessed 2026-08-10. ClaimTrace indicates transformations and does not imply World Bank endorsement.
