# Release verification

## ClaimTrace 0.10.1 — 2026-08-11

This record describes a local release-candidate verification on Darwin arm64 with Node.js 22.20.0 and npm 10.9.3. It is a reproducibility receipt, not evidence of a hosted deployment, external adoption, or real-world impact.

### Executed checks

| Check | Result |
|---|---|
| `npm run ci` | Passed |
| Unit and integration tests | 155/155 passed |
| Built-artifact checks | 2/2 passed |
| Real-Chromium read-only acceptance test | 1/1 passed |
| Real-Chromium writable workflow and race test | 1/1 passed |
| Dataset-intent cross-flow matrix | case→import, import read→case, revision→case, case→demo passed |
| Dataset-intent transition unit tests | 2/2 passed; superseded case controllers abort and baseline/current read generations invalidate |
| Review/export isolation during dataset replacement | Passed; no stale record, download, or predecessor root |
| UI/workflow architecture split | `app/page.tsx` reduced from 952 to 610 lines; views, configuration, dataset intent, case loading, CSV import, and verified export are separate modules |
| Compiled build identity | Package version, supplied commit prefix, and read-only/local-writable mode rendered; read-only Chromium assertion passed |
| Executable cases loaded and run in Chromium | 10/10 passed |
| Controlled benchmark | 64/64 exact labels |
| Deterministic property trials | 512 across four seeded properties |
| Core statement and line coverage | 96.99% |
| Core function coverage | 99.37% |
| Core branch coverage | 78.74% |
| Executable case regeneration and AuditBundle verification | 10/10 passed |
| Public-source raw-content and cleaning-parameter tamper tests | 6/6 passed |
| Public-source update-date basis | 6/6 declare publisher-reported or not-separately-reported; World Bank and Treasury bind both response headers, USDOT binds official Socrata metadata, and all three missing dates carry an explicit reason |
| Publisher-date adversarial checks | Invalid ISO dates, two-response disagreement, wrong Socrata dataset identity, invalid `rowsUpdatedAt`, and fully rehashed date tampering rejected |
| Current evidence contracts | AuditBundle `2.5.0`; external-source metadata `2.2.0` |
| Source-refresh consistency, locking, recovery, and failure-path tests | 28/28 passed, including four-file Socrata commit and rollback |
| `npm audit --omit=dev` | 0 known vulnerabilities |
| `npm audit` | 0 known vulnerabilities |
| Repository English-only artifact test | Passed |
| Read-only UI mutation-control count | 0 |
| Local CSV pre-read size boundary | 10 MiB per file |
| Strict CSV and canonical-column adversarial regressions | Passed |
| Passed checks carrying diagnostic errors | 0 |

### Public-data coverage

The six external cases use pinned responses from the World Bank Indicators API, U.S. DOT/FTA Monthly Modal Time Series, U.S. Treasury yield-curve feed, CFPB Consumer Complaint Database, CDC PLACES, and ONS housing-affordability releases. For each case, the repository stores two source responses, source URLs and retrieval metadata, a publisher-update-date basis, attribution and limitations, source-specific cleaning parameters, raw-content hashes, cleaned snapshots, expected results, and a verified AuditBundle. World Bank dates are recomputed from both response headers; Treasury feed timestamps are normalized to a UTC date and must agree across both pinned feeds; and USDOT retains the official Socrata dataset metadata so its dataset identity, response hash, and `rowsUpdatedAt` date can be recomputed. CFPB, CDC, and ONS do not expose a separate update date through the selected response, so their metadata records that absence and its reason instead of guessing a date.

Normal `npm run cases:generate` execution is offline and deterministic. `npm run cases:refresh-sources` is a separate networked operation because a refresh can alter source content and downstream results. It acquires an exclusive refresh lock before reading or downloading; requires the lock path itself to be a directory rather than a symbolic link; requires the configuration, metadata, lock manifest, and transaction manifest to be regular files; confines distinct raw-response and publisher-metadata targets to direct, regular files in the case-local `raw-*` namespace; requires exactly one artifact per snapshot side, matching source type and cleaning definitions across configuration and metadata, and the registered cleaner for that source type; and rejects unsafe lock or transaction identities, metadata aliases, duplicate targets, symbolic links, nested paths, non-HTTPS URLs, embedded URL credentials, URL fragments, redirects, and source bodies above 8 MiB. It aborts remaining requests after any required download fails and retains the lock until all requests settle, validates both source responses, recomputes the publisher date from governed evidence, and leaves the selected case unchanged if any input fails validation. It preflights three or four targets immediately before replacement and persists their original and committed SHA-256 values in a version-2 transaction manifest. The source pair, optional publisher-metadata response, retrieval timestamp, and publisher date therefore commit or roll back together. On the next invocation, an interrupted version-2 replacement is hash-checked and restored before the case configuration is read, while committed work with unfinished cleanup is content-verified and cleaned. Legacy version-1 transaction state is left untouched and reported because it lacks content hashes; lock conflicts, cleanup failures, and hash mismatches are likewise surfaced to the caller.

### Deliberate claim boundaries

- Public observations are not represented as causal effects, business impact, policy outcomes, investment performance, or clinical conclusions.
- Decision thresholds and numerical option inputs are author-defined demonstration assumptions unless their provenance explicitly names another source.
- The public interface is a local read-only portfolio build; this verification does not claim a public deployment or authenticated enterprise workflow.
- The controlled benchmark is a committed regression set, not an external accuracy study.
