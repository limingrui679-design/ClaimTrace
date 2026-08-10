# Public Data: CFPB Credit-Card Complaint Pattern Audit

Reproducible public-data case based on **U.S. Consumer Financial Protection Bureau — Consumer Complaint Database trends API**. The package pins both official-source responses and their SHA-256 hashes, retrieval metadata, license and attribution, declared limitations, source-specific deterministic cleaning parameters, two cleaned CSV snapshots, executable claim and decision specifications, expected output, and a self-verifiable AuditBundle.

The observed rows and derived descriptive measures come from the pinned public source. Every decision-option benefit, cost, risk, and capacity value is separately labeled as a manual demonstration assumption; it is not an observed outcome or a recommendation from the source publisher.

## Reproduce and verify

```bash
npm run cases:generate
npm run test:unit
```

Normal generation is offline and rebuilds the CSV snapshots from the committed raw responses. A deliberate source refresh is a separate networked action: `npm run cases:refresh-sources -- cfpb-credit-card-complaints`.

## Source and scope

- Publisher: U.S. Consumer Financial Protection Bureau
- Dataset: Consumer Complaint Database trends API
- Measure: CREDIT-CARD-ISSUE-BUCKETS — Structured credit-card complaint issue records
- Retrieved: 2026-08-10T00:00:00.000Z
- License: CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/)
- Baseline source: https://www.consumerfinance.gov/data-research/consumer-complaints/search/api/v1/trends?date_received_min=2024-01-01&date_received_max=2024-06-30&lens=product&focus=Credit%20card&sub_lens=issue&trend_interval=month&trend_depth=10&sub_lens_depth=10
- Current source: https://www.consumerfinance.gov/data-research/consumer-complaints/search/api/v1/trends?date_received_min=2025-01-01&date_received_max=2025-06-30&lens=product&focus=Credit%20card&sub_lens=issue&trend_interval=month&trend_depth=10&sub_lens_depth=10

## Declared limitations

- Complaint records are not a statistical sample of consumer experience and cannot be interpreted as incidence or company performance rates without exposure denominators.
- The Bureau does not verify all facts alleged in complaints, and issue counts are not adjudicated findings.
- This case uses structured aggregates only and excludes consumer narrative text.

ClaimTrace indicates transformations and does not imply publisher endorsement.
