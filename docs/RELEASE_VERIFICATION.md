# Release verification

## ClaimTrace 0.8.0 — 2026-08-11

This record describes a local release-candidate verification on Darwin arm64 with Node.js 22.20.0 and npm 10.9.3. It is a reproducibility receipt, not evidence of a hosted deployment, external adoption, or real-world impact.

### Executed checks

| Check | Result |
|---|---|
| `npm run ci` | Passed |
| Unit and integration tests | 143/143 passed |
| Real-Chromium read-only acceptance test | 1/1 passed |
| Executable cases loaded and run in Chromium | 10/10 passed |
| Controlled benchmark | 64/64 exact labels |
| Deterministic property trials | 512 across four seeded properties |
| Core statement and line coverage | 97.22% |
| Core function coverage | 99.34% |
| Core branch coverage | 78.68% |
| Executable case regeneration and AuditBundle verification | 10/10 passed |
| Public-source raw-content and cleaning-parameter tamper tests | 6/6 passed |
| Source-refresh consistency, locking, recovery, and failure-path tests | 25/25 passed |
| `npm audit --omit=dev` | 0 known vulnerabilities |
| `npm audit` | 0 known vulnerabilities |
| Repository English-only artifact test | Passed |
| Read-only UI mutation-control count | 0 |

### Public-data coverage

The six external cases use pinned responses from the World Bank Indicators API, U.S. DOT/FTA Monthly Modal Time Series, U.S. Treasury yield-curve feed, CFPB Consumer Complaint Database, CDC PLACES, and ONS housing-affordability releases. For each case, the repository stores two source responses, source URLs and retrieval metadata, attribution and limitations, source-specific cleaning parameters, raw-content hashes, cleaned snapshots, expected results, and a verified AuditBundle.

Normal `npm run cases:generate` execution is offline and deterministic. `npm run cases:refresh-sources` is a separate networked operation because a refresh can alter source content and downstream results. It acquires an exclusive refresh lock before reading or downloading; requires the lock path itself to be a directory rather than a symbolic link; requires the configuration, metadata, lock manifest, and transaction manifest to be regular files; confines distinct raw-response targets to direct, regular files in the case-local `raw-*` namespace; requires exactly one artifact per snapshot side, matching source type and cleaning definitions across configuration and metadata, and the registered cleaner for that source type; and rejects unsafe lock or transaction identities, metadata aliases, duplicate targets, symbolic links, nested paths, non-HTTPS URLs, embedded URL credentials, URL fragments, redirects, and source bodies above 8 MiB. It aborts the peer request after either side fails and retains the lock until both requests settle, validates both responses with the declared source-specific cleaner before replacing either pinned response, updates the retrieval timestamp, and leaves the selected case unchanged if either download fails, redirects, is empty, exceeds the response limit, or fails source-schema and cleaning-parameter validation. It preflights all three targets again immediately before replacement and persists their original and committed SHA-256 values in a version-2 transaction manifest. Recovery requires the exact generated layout of two `raw-*` targets followed by `source-config.json` and matching indexed temporary and backup names. On the next invocation, an interrupted version-2 replacement is hash-checked and restored before the case configuration is read, while committed work with unfinished cleanup is content-verified and cleaned. Legacy version-1 transaction state is left untouched and reported because it lacks content hashes; lock conflicts, cleanup failures, and hash mismatches are likewise surfaced to the caller.

### Deliberate claim boundaries

- Public observations are not represented as causal effects, business impact, policy outcomes, investment performance, or clinical conclusions.
- Decision thresholds and numerical option inputs are author-defined demonstration assumptions unless their provenance explicitly names another source.
- The public interface is a local read-only portfolio build; this verification does not claim a public deployment or authenticated enterprise workflow.
- The controlled benchmark is a committed regression set, not an external accuracy study.
