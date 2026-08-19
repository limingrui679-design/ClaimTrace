# Verify an AuditBundle outside the browser

ClaimTrace exports one portable JSON object containing the pinned snapshots, executable claim and decision specifications, recomputed results, review chain, source lineage, and canonical integrity envelope. A stored `VALID` label is never trusted: the verifier rebuilds the data state and reruns the checks.

## Verify one bundle

From a clean repository checkout:

```bash
npm ci
npm run verify:bundle -- public/cases/cdc-places-depression/evidence-package.json
```

The human-readable output reports the schema, project, canonical root, overall result, and each verification stage. For automation, add `--json`:

```bash
npm run --silent verify:bundle -- public/cases/cdc-places-depression/evidence-package.json --json
```

The `--silent` flag suppresses npm's command banner so standard output is one parseable JSON document.

Exit codes are stable:

| Code | Meaning |
|---:|---|
| `0` | Every verification stage passed. |
| `1` | The JSON was readable, but one or more integrity or recomputation checks failed. |
| `2` | Usage, file reading, or JSON parsing failed. |

## Verify a linked history

AuditBundles can bind an exact predecessor through `previousBundleHash`. Supply a chronological sequence to verify every bundle independently and then verify every link:

```bash
npm run verify:chain -- bundle-1.json bundle-2.json bundle-3.json
```

The first object must be a genesis bundle with `previousBundleHash: null`. Every later value must equal the preceding bundle's verified canonical root; project and primary-key identity must also stay consistent.

## Schema validation is not semantic verification

The versioned [AuditBundle 2.6.0 JSON Schema](../schemas/claimtrace-audit-bundle-2.6.0.schema.json) validates the interchange envelope, required sections, version constants, hash shapes, snapshot manifests, and summary types. It is useful for editor support and ingestion guards.

Schema validation alone cannot establish that:

- snapshot hashes match their raw bytes and normalized rows;
- stored diffs, claims, decisions, summaries, or review links are correct;
- public-source responses regenerate the committed CSV snapshots;
- section hashes and the canonical bundle root match; or
- a multi-bundle history is complete and correctly linked.

The CLI verifier performs those executable checks. Even a valid, recomputable bundle proves internal consistency—not publisher truth, reviewer identity, trusted time, institutional approval, domain validity, or real-world impact.

## Verification stages

| Stage | What is recomputed or checked |
|---|---|
| `schema` | ClaimTrace schema and bundle-type version binding |
| `previous-bundle-link` | predecessor-root format and no self-link |
| `bundle-root` | canonical payload SHA-256 |
| `section-hashes` | chain, snapshots, claims, decisions, reviews, provenance, and upstream sections |
| `snapshots` | raw bytes/text, encoding, strict CSV, canonical columns, keys, raw and normalized hashes |
| `derived-recomputation` | keyed diff, claims, evidence, decisions, review state, summaries, and previews |
| `upstream-lineage` | raw-record-to-summary calculations where declared |
| `external-source-lineage` | pinned public responses, update metadata, cleaning implementation, parameters, and regenerated snapshots |

To see deliberate tamper rejection, change any committed bundle field without rebuilding the canonical integrity envelope and rerun the command. Automated tests also cover rehashed source tampering, malformed lineage, missing sections, wrong predecessor links, duplicate chain roots, and stored-result manipulation.
