# Getting started

ClaimTrace has two supported review paths: a public read-only demonstration and a local writable workspace. Both execute the same deterministic case and audit core; only the available controls differ.

## Choose a path

| Path | Best for | Boundary |
|---|---|---|
| [Public read-only demo](https://claimtrace-audit.limingrui2.chatgpt.site) | Reviewing the interface and ten committed cases without installing anything | No import, claim creation, review note, or sign-off controls |
| Local writable workspace | Importing CSV versions, defining claims, recording local review state, and exporting verified artifacts | Browser-session state; no account, upload endpoint, or durable multi-user service |

The hosted demo visibly reports the release version, source receipt, and read-only mode. That receipt binds the compiled artifact to a source revision; it is not authentication or proof of production governance.

## Prerequisites

- Node.js 22.13 or newer
- npm
- Chromium only if you want to run the browser acceptance tests

## Install and run

```bash
git clone https://github.com/limingrui679-design/ClaimTrace.git
cd ClaimTrace
npm ci
npm run dev
```

Open the local URL printed by Vite.

## Walk through the first audit

1. Open **Project Audit** and choose one of the committed cases.
2. Inspect **Data Versions** to see primary-key-aligned additions, removals, modifications, and unchanged records.
3. Open **Claim Rules** to inspect each rule, denominator, threshold provenance, exact evidence references, and current status.
4. Open **Decision Impact** to separate action changes from evidence-only re-signing requirements.
5. Use **Human Review** only in the local writable build. Review display names and local-clock timestamps remain explicitly unauthenticated.
6. Open **Audit Export** to produce JSON and HTML from the same independently reverified AuditBundle.

## Import a custom CSV project

The local workspace accepts a baseline CSV and a current CSV with the same exact case-sensitive column set. Choose a unique, non-empty primary key before the versions are aligned. Row order does not count as a change.

Supported text encodings are UTF-8, UTF-8 with BOM, UTF-16LE with BOM, and UTF-16BE with BOM. The strict CSV dialect supports escaped quotes, multiline fields, CRLF, and empty trailing cells while rejecting malformed quote boundaries.

### Size boundary

- Each browser-imported CSV is limited to 10 MiB before its bytes are read.
- Verified AuditBundle and HTML export embed up to 500 KB of raw data per snapshot.
- Larger files can be analyzed locally, but verified export is blocked because detached raw-file verification is not implemented.

Avoid loading sensitive data into an untrusted hosted origin, and inspect every export before sharing it.

## Common commands

```bash
# Local development
npm run dev

# Rebuild deterministic demo and case artifacts
npm run demo:generate
npm run cases:generate

# Run the controlled benchmark
npm run benchmark

# Check documentation references
npm run test:docs

# Independently verify one exported or committed AuditBundle
npm run verify:bundle -- public/cases/cdc-places-depression/evidence-package.json

# Verify a chronological chain of AuditBundles
npm run verify:chain -- bundle-1.json bundle-2.json

# Run the complete local quality gate
npm run ci
```

Install Chromium once before the complete gate if it is not already present:

```bash
npx playwright install chromium
```

## Refreshing public sources

Normal case generation is offline and consumes committed raw responses. Refreshing a public source is a separate networked action because it can change evidence and downstream results:

```bash
npm run cases:refresh-sources -- world-bank-life-expectancy
npm run cases:generate
```

The refresh path validates case-local targets, source type, cleaner binding, HTTPS URLs, response size, publisher dates, transaction hashes, and recovery state before replacing evidence. See [release verification](RELEASE_VERIFICATION.md) for the exact protocol.

## Next reading

- [Case catalog](CASE_CATALOG.md)
- [Evidence model](EVIDENCE_MODEL.md)
- [Bundle verification and JSON Schema](VERIFY_BUNDLES.md)
- [Architecture](ARCHITECTURE.md)
- [Development guide](../DEVELOPMENT.md)
- [Security](SECURITY.md) and [limitations](LIMITATIONS.md)
