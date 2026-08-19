# ClaimTrace documentation

This directory is the documentation entry point for ClaimTrace. Start with the runnable workflow, then move into the evidence model, verification record, and contribution guides as needed.

## Start here

| Goal | Read this |
|---|---|
| Run the public demo or a local writable workspace | [Getting started](GETTING_STARTED.md) |
| Compare the ten reproducible examples | [Case catalog](CASE_CATALOG.md) |
| Understand what an AuditBundle contains | [Evidence model](EVIDENCE_MODEL.md) |
| Verify an AuditBundle from the command line | [Bundle verification](VERIFY_BUNDLES.md) |
| See module boundaries and data flow | [Architecture](ARCHITECTURE.md) |
| Reproduce benchmarks, tests, and coverage | [Evaluation](EVALUATION.md) |
| Understand security assumptions and non-goals | [Security](SECURITY.md) · [Limitations](LIMITATIONS.md) |

## Documentation map

### Learn the model

- [Evidence model](EVIDENCE_MODEL.md) defines snapshots, claim-result identity, decision identity, review assurances, and AuditBundle verification.
- [Architecture](ARCHITECTURE.md) explains the deterministic core, browser workflows, case runtime, and read-only build boundary.
- [Case catalog](CASE_CATALOG.md) separates controlled synthetic fixtures from provenance-bound public-data demonstrations.

### Run and verify

- [Getting started](GETTING_STARTED.md) covers local setup, the first audit, CSV import, export limits, and common commands.
- [Bundle verification](VERIFY_BUNDLES.md) covers the versioned JSON Schema, CLI exit codes, independent recomputation, and linked histories.
- [Evaluation](EVALUATION.md) records benchmark design, property tests, browser checks, coverage, and interpretation limits.
- [Release verification](RELEASE_VERIFICATION.md) records the exact evidence for the current release candidate.
- [Security](SECURITY.md) and [limitations](LIMITATIONS.md) state what hashes, local review records, and the hosted demo do—and do not—prove.

### Develop and release

- [Development guide](../DEVELOPMENT.md) maps repository directories to responsibilities and defines the local quality gate.
- [Contributing guide](../CONTRIBUTING.md) explains issue, pull-request, generated-artifact, and evidence-boundary expectations.
- [Code of Conduct](../CODE_OF_CONDUCT.md) defines participation standards and private conduct-reporting guidance.
- [Release checklist](CLAIMTRACE_RELEASING.md), [release notes](RELEASE_NOTES.md), and the root [changelog](../CHANGELOG.md) cover publication.
- [Roadmap](ROADMAP.md) separates the verified baseline from possible future work; roadmap items are not shipped claims.

### Portfolio appendices

These files support evidence-bounded application reuse. They are not product specifications, admissions predictions, or evidence of external adoption.

- [Portfolio handoff](PORTFOLIO_HANDOFF.md)
- [Program alignment](PROGRAM_ALIGNMENT.md)

## Generated case documentation

Each public case pack under [`public/cases`](../public/cases/) contains a co-located README, source metadata, cleaning record, manifest, expected audit, and verified evidence package. Synthetic fixture cards live in [`docs/data-cards`](data-cards/). The machine-readable index is [`public/cases/catalog.json`](../public/cases/catalog.json).

Run `npm run test:docs` from the repository root after changing documentation. It checks every local Markdown and HTML-style file reference in the root guides and this directory.
