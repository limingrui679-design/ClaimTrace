# Roadmap

This document separates the verified baseline from possible future work. Items below the baseline are proposals, not shipped capabilities or commitments.

## Verified baseline

The `v0.10.3` line demonstrates:

- local browser execution for versioned CSV evidence;
- primary-key alignment, strict parsing, raw and normalized hashes, and bounded evidence references;
- executable claim and decision specifications with governed threshold and input provenance;
- distinct claim, decision, human-disposition, and release states;
- independently reverified AuditBundle JSON and HTML output;
- four deterministic synthetic fixtures and six pinned public-data cases;
- controlled benchmark, property, unit/integration, built-artifact, and real-browser checks;
- a public read-only portfolio build and a local writable build.

See [release verification](RELEASE_VERIFICATION.md) for exact evidence and [limitations](LIMITATIONS.md) for the current boundary.

## Candidate next steps

### Portable verification at larger scale

- Define a detached raw-snapshot input protocol for verified exports above the current 500 KB embedded-snapshot limit.
- Add streaming or chunked import only after its normalization and hash contract can be reproduced independently.

### Interoperability

- Evaluate explicit adapters for Parquet, SQL result sets, and lineage standards without weakening the current strict snapshot identity.
- Publish a versioned schema reference and compatibility fixtures for third-party AuditBundle readers.

### Authenticated governance

- Evaluate external identity, role-based authorization, trusted time, digital signatures, revocation, and durable storage as separate services.
- Preserve the current `LOCAL_UNVERIFIED` assurances until those controls are implemented and independently tested.

### External evaluation

- Seek domain-method review for at least one public-data case.
- Add usability evidence only from documented participants and tasks; do not infer adoption from repository traffic, demo access, or automated checks.

## Explicit non-goals for the current prototype

- claiming production deployment or institutional governance;
- presenting public-data examples as client work;
- treating benchmark checks as statistical accuracy or business impact;
- adding probabilistic language to deterministic sensitivity or bounded Monte Carlo outputs;
- replacing domain experts, source validation, or authorized decision makers.
