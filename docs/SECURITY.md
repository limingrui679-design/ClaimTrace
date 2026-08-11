# Security and integrity notes

## Local data handling

CSV files are decoded and processed in the browser. The application has no upload endpoint in this prototype. The full local workspace rejects each CSV above 10 MiB before reading its bytes, reducing accidental browser-memory exhaustion; this is a prototype boundary, not warehouse-scale streaming. Its versioned strict dialect rejects malformed quote placement rather than silently deleting or reinterpreting characters, and independent bundle verification uses the same parser and baseline-ordered normalization contract as import. Exporting creates local JSON or HTML files. A verified AuditBundle JSON export embeds raw snapshot text or base64-encoded bytes for each snapshot up to the 500 KB self-contained-verification limit, together with hashes and bounded row-level evidence; it is not a hash-only export. Files above 500 KB can still be analyzed, but the current interface blocks verified AuditBundle and HTML report export because detached raw-snapshot verification is not implemented. Users should still avoid loading sensitive data into an untrusted hosted origin and should inspect every generated file before sharing it.

## Integrity guarantees and boundaries

ClaimTrace emits one canonical AuditBundle root hash plus section hashes for snapshots, claims, decisions, reviews, chain identity, optional upstream lineage, and optional external-source provenance. Verification reconstructs embedded CSV snapshots, recomputes raw and normalized SHA-256, row counts, physical lines, and primary keys, then reruns claim and decision specifications. It compares regenerated claims, decisions, summaries, diffs, previews, review chain, release states, source transformations, and HTML-report inputs with exported fields. The health fixture also recomputes upstream filters, numerators, denominators, rounding, source-row counts, source-key hashes, and summary values. Each public-data fixture rehashes its two pinned official-source responses and deterministically regenerates both CSV snapshots from the retained source-specific cleaning parameters. Publisher-reported dates must be strict ISO calendar dates and are independently extracted from both World Bank/Treasury responses or from hashed, dataset-bound USDOT Socrata metadata.

Tests cover altered claim status/reason, summary numbers, diffs, recommended options, review notes, review order, upstream aggregation metadata, and upstream raw content. They also cover an attacker recomputing the bundle root and affected section hash: derived recomputation or upstream validation still rejects inconsistent exported results.

`previousBundleHash` can link one bundle root to another. `verifyAuditBundleChain()` checks every supplied bundle independently, rejects missing/incorrect predecessors, duplicate or malformed roots, project/key discontinuity, invalid genesis links, and structurally malformed entries without throwing. Independent bundle verification also isolates derived-result, upstream-lineage, and external-source-lineage diagnostics so malformed provenance cannot duplicate or overwrite unrelated checks. A single package cannot prove an absent predecessor existed, and the chain is not externally anchored.

These checks are tamper-evident consistency checks, not authenticity proof. Anyone who can replace the entire bundle, all inputs, all rules, and every hash can manufacture a new internally consistent bundle. The hashes do not prove that a source was honest, complete, authorized, licensed for a particular downstream use, or untampered before ingestion. There is no digital signature, external transparency log, or trusted timestamp.

Review records use UUIDs plus hashes of their bound result, each record, and the previous record. Export verification checks global order, chain links, the latest disposition, release state, and claim/decision result binding. Every record declares that identity is locally unverified, time comes from an untrusted local clock, authorization is self-asserted, and no cryptographic signature exists. This remains an in-session governance prototype and does not authenticate the person named as reviewer.

## Injection and export safety

Standalone HTML reports escape user-controlled text and display diagnostic messages only on failed verification checks. CSV is parsed as data and never executed. JSON evidence exports remain data files; downstream consumers must not execute their contents.

The public-source refresh command accepts distinct source and publisher-metadata targets only as direct regular files in the case-local `raw-*` namespace, preventing them from aliasing configuration, metadata, or derived case artifacts. Before downloading, it requires exactly one baseline and one current raw artifact, matching source type, publisher-date evidence, and cleaning definitions across configuration and metadata, the registered cleaner for that source type, and the controlled generator path. It rejects nested paths, paths through a symlinked parent, symbolic-link configuration, metadata, lock directories, lock manifests, transaction manifests, or final targets, duplicate targets, non-file targets, non-HTTPS URLs, embedded URL credentials, URL fragments, redirects, and source bodies above 8 MiB before replacement, then repeats the final target checks before the replacement transaction begins. A failed request aborts the remaining requests, and the exclusive lock remains held until they settle. Automatic interrupted-transaction recovery requires version-2 manifests with valid original and committed SHA-256 values and the generated three- or four-file layout: two source responses, optional publisher metadata, then `source-config.json`, with fixed indexed temporary and backup names. This prevents a forged recovery manifest from redirecting rollback into metadata or derived artifacts. Legacy unhashed state is reported and left untouched for manual resolution.

## Dependency and CI audit

Audit date: 2026-08-11.

- Production dependencies: `npm audit --omit=dev --audit-level=high` reports 0 known vulnerabilities.
- Full development toolchain: `npm audit --audit-level=high` reports 0 known vulnerabilities.

The browser shell was migrated from beta Vinext/RSC tooling to stable Vite + React static assets, removing the previously disclosed indirect `image-size` findings. ClaimTrace CI runs both audits and pins the official checkout, Node setup, and artifact-upload actions to complete commits from Node 24-compatible releases. This is a point-in-time result, not a promise that future advisories cannot affect the same lockfile.

## Reporting

For a security concern, open a private report with a minimal reproduction, affected version, impact, and suggested mitigation. Do not include real sensitive datasets.
