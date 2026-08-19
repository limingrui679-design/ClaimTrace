# Release verification

## ClaimTrace 0.11.0 — 2026-08-20

This record describes a local release-candidate verification on Darwin arm64 with Node.js 22.20.0 and npm 10.9.3. It is a reproducibility receipt, not evidence of external adoption or real-world impact.

### Executed checks

| Check | Result |
|---|---|
| `npm run ci` | Passed |
| Unit and integration tests | 166/166 passed |
| Built-artifact and release-package checks | 3/3 passed |
| Real-Chromium read-only acceptance test | 1/1 passed |
| Real-Chromium writable workflow and race test | 1/1 passed |
| Dataset-intent cross-flow matrix | case→import, import read→case, revision→case, case→demo passed |
| Import-dialog intent boundary | Opening an import aborts an older case request before CSV preview or form submission; the delayed browser race passed |
| Dataset-intent transition unit tests | 2/2 passed; superseded case controllers abort and baseline/current read generations invalidate |
| Review/export isolation during dataset replacement | Passed; no stale record, download, or predecessor root |
| UI/workflow architecture split | `app/page.tsx` reduced from 952 to 610 lines; views, configuration, dataset intent, case loading, CSV import, and verified export are separate modules |
| Compiled build identity | Package version, supplied commit prefix, and read-only/local-writable mode rendered; read-only Chromium assertion passed |
| Executable cases loaded and run in Chromium | 10/10 passed |
| Controlled benchmark | 64/64 exact labels |
| Deterministic property trials | 512 across four seeded properties |
| 20,000-row bounded evidence selection | Passed the unchanged 10-second browser-scale budget after reusing the keyed diff; full-suite observation 2.14 seconds |
| Core statement and line coverage | 96.83% |
| Core function coverage | 99.39% |
| Core branch coverage | 78.98% |
| Executable case regeneration and AuditBundle verification | 10/10 passed |
| Published structural schema | 10/10 generated AuditBundles satisfy AuditBundle 2.6.0; missing integrity rejected; raw-bytes-only payload accepted |
| Command-line verifier | Valid bundle, semantically tampered bundle, and genesis-chain paths passed with exit codes 0/1/0 |
| Reported-interval rule | Complete support, threshold crossing, complete reversal, malformed bounds, multi-row selection, and invalid untrusted metadata paths passed |
| Public-source raw-content and cleaning-parameter tamper tests | 6/6 passed |
| Public-source update-date basis | 6/6 declare publisher-reported or not-separately-reported; World Bank and Treasury bind both response headers, USDOT binds official Socrata metadata, and all three missing dates carry an explicit reason |
| Publisher-date adversarial checks | Invalid ISO dates, two-response disagreement, wrong Socrata dataset identity, invalid `rowsUpdatedAt`, and fully rehashed date tampering rejected |
| Publisher-date diagnostic isolation | Each invalid or mismatched declared date produces one root-cause diagnostic, no duplicate message, and no derivative baseline/current CSV-rebuild failure |
| Current evidence contracts | AuditBundle `2.6.0`; rule engine `6.3.0`; external-source metadata `2.2.0` |
| Source-refresh consistency, locking, recovery, and failure-path tests | 28/28 passed, including four-file Socrata commit and rollback |
| `npm audit --omit=dev` | 0 known vulnerabilities |
| `npm audit` | 0 known vulnerabilities |
| Repository English-only artifact test | Passed |
| Documentation references | 125 checked across 24 documentation files |
| README and case-card visual QA | 1600 px case landscape plus 1440 px desktop and 390 px mobile application captures reviewed; no horizontal overflow |
| Read-only UI mutation-control count | 0 |
| Local CSV pre-read size boundary | 10 MiB per file |
| Strict CSV and canonical-column adversarial regressions | Passed |
| Passed checks carrying diagnostic errors | 0 |
| Release checksum portability | SHA-256 sidecar records the ZIP base name only; no local absolute path |
| Sites build package | Project metadata, static Worker entry, and read-only assets packaged together; public deployment requires a separate receipt check |

### Public-data coverage

The six external cases use pinned responses from the World Bank Indicators API, U.S. DOT/FTA Monthly Modal Time Series, U.S. Treasury yield-curve feed, CFPB Consumer Complaint Database, CDC PLACES, and ONS housing-affordability releases. For each case, the repository stores two source responses, source URLs and retrieval metadata, a publisher-update-date basis, attribution and limitations, source-specific cleaning parameters, raw-content hashes, cleaned snapshots, expected results, and a verified AuditBundle. World Bank dates are recomputed from both response headers; Treasury feed timestamps are normalized to a UTC date and must agree across both pinned feeds; and USDOT retains the official Socrata dataset metadata so its dataset identity, response hash, and `rowsUpdatedAt` date can be recomputed. CFPB, CDC, and ONS do not expose a separate update date through the selected response, so their metadata records that absence and its reason instead of guessing a date.

Normal `npm run cases:generate` execution is offline and deterministic. `npm run cases:refresh-sources` is a separate networked operation because a refresh can alter source content and downstream results. It acquires an exclusive refresh lock before reading or downloading; requires the lock path itself to be a directory rather than a symbolic link; requires the configuration, metadata, lock manifest, and transaction manifest to be regular files; confines distinct raw-response and publisher-metadata targets to direct, regular files in the case-local `raw-*` namespace; requires exactly one artifact per snapshot side, matching source type and cleaning definitions across configuration and metadata, and the registered cleaner for that source type; and rejects unsafe lock or transaction identities, metadata aliases, duplicate targets, symbolic links, nested paths, non-HTTPS URLs, embedded URL credentials, URL fragments, redirects, and source bodies above 8 MiB. It aborts remaining requests after any required download fails and retains the lock until all requests settle, validates both source responses, recomputes the publisher date from governed evidence, and leaves the selected case unchanged if any input fails validation. It preflights three or four targets immediately before replacement and persists their original and committed SHA-256 values in a version-2 transaction manifest. The source pair, optional publisher-metadata response, retrieval timestamp, and publisher date therefore commit or roll back together. On the next invocation, an interrupted version-2 replacement is hash-checked and restored before the case configuration is read, while committed work with unfinished cleanup is content-verified and cleaned. Legacy version-1 transaction state is left untouched and reported because it lacks content hashes; lock conflicts, cleanup failures, and hash mismatches are likewise surfaced to the caller.

### Deliberate claim boundaries

- Public observations are not represented as causal effects, business impact, policy outcomes, investment performance, or clinical conclusions.
- Decision thresholds and numerical option inputs are author-defined demonstration assumptions unless their provenance explicitly names another source.
- The public interface is compiled as a read-only portfolio build. Hosting metadata does not establish a deployment; any public URL must show this package version and exact release-commit prefix before it is cited. The interface is not an authenticated enterprise workflow.
- The controlled benchmark is a committed regression set, not an external accuracy study.
