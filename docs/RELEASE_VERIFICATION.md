# Release verification

## ClaimTrace 0.8.0 — 2026-08-10

This record describes a local release-candidate verification on Darwin arm64 with Node.js 22.20.0 and npm 10.9.3. It is a reproducibility receipt, not evidence of a hosted deployment, external adoption, or real-world impact.

### Executed checks

| Check | Result |
|---|---|
| `npm run ci` | Passed |
| Unit and integration tests | 115/115 passed |
| Real-Chromium read-only acceptance test | 1/1 passed |
| Controlled benchmark | 64/64 exact labels |
| Deterministic property trials | 512 across four seeded properties |
| Core statement and line coverage | 97.02% |
| Core function coverage | 99.33% |
| Core branch coverage | 77.50% |
| Executable case regeneration and AuditBundle verification | 10/10 passed |
| Public-source raw-content and cleaning-parameter tamper tests | 6/6 passed |
| `npm audit --omit=dev` | 0 known vulnerabilities |
| `npm audit` | 0 known vulnerabilities |
| Repository English-only artifact test | Passed |
| Read-only UI mutation-control count | 0 |

### Public-data coverage

The six external cases use pinned responses from the World Bank Indicators API, U.S. DOT/FTA Monthly Modal Time Series, U.S. Treasury yield-curve feed, CFPB Consumer Complaint Database, CDC PLACES, and ONS housing-affordability releases. For each case, the repository stores two source responses, source URLs and retrieval metadata, attribution and limitations, source-specific cleaning parameters, raw-content hashes, cleaned snapshots, expected results, and a verified AuditBundle.

Normal `npm run cases:generate` execution is offline and deterministic. `npm run cases:refresh-sources` is a separate networked operation because a refresh can alter source content and downstream results.

### Deliberate claim boundaries

- Public observations are not represented as causal effects, business impact, policy outcomes, investment performance, or clinical conclusions.
- Decision thresholds and numerical option inputs are author-defined demonstration assumptions unless their provenance explicitly names another source.
- The public interface is a local read-only portfolio build; this verification does not claim a public deployment or authenticated enterprise workflow.
- The controlled benchmark is a committed regression set, not an external accuracy study.
