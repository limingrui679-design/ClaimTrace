# Contributing to ClaimTrace

ClaimTrace welcomes focused issues and pull requests that improve reproducibility, audit semantics, documentation, accessibility, or bounded case coverage.

Participation in project spaces is governed by the [Code of Conduct](CODE_OF_CONDUCT.md).

## Before starting

1. Read [getting started](docs/GETTING_STARTED.md), the [evidence model](docs/EVIDENCE_MODEL.md), and [limitations](docs/LIMITATIONS.md).
2. Search existing issues before opening a new one.
3. For a material rule, schema, case, or workflow change, open an issue describing the problem and the evidence needed to verify the proposed behavior.
4. Never attach sensitive, proprietary, personal, clinical, or credential-bearing data to an issue or pull request.

Security vulnerabilities should follow the private reporting guidance in [security](docs/SECURITY.md), not a public issue. Conduct reports should use the private contact in the [Code of Conduct](CODE_OF_CONDUCT.md).

## Local setup

```bash
git clone https://github.com/limingrui679-design/ClaimTrace.git
cd ClaimTrace
npm ci
npx playwright install chromium
npm run ci
```

See the [development guide](DEVELOPMENT.md) for the repository map, build modes, test tiers, and invariants.

## Contribution types

### Core behavior

Add or change deterministic behavior only with regression tests that prove the intended terminal state and protect adjacent boundaries. Schema or identity changes require regenerated case packs and updated evidence documentation.

### Cases and public sources

A new case must state its evidence role, primary key, source or synthetic generator, license, selection, cleaning contract, expected audit, decision-assumption boundary, and limitations. Public data must retain pinned source responses so normal generation remains offline and reproducible.

### Documentation and visual assets

Keep the root README value-first and scannable. Put detailed protocols in `docs/`, link them from [the documentation hub](docs/README.md), and run `npm run test:docs`. Diagrams must be accessible, source-controlled, and evidence-bound.

## Pull-request checklist

- Explain the problem, behavior change, and evidence.
- Add or update tests at the narrowest authoritative layer.
- Regenerate affected case, demo, or benchmark artifacts and review the diff.
- Run `npm run ci`, both npm audits, and `git diff --check`.
- Update documentation and release notes when behavior or a public contract changes.
- Preserve the distinction between prototype and production, internal verification and external validity, and public-data examples and real-world adoption.

By contributing, you agree that your contribution will be licensed under the repository's [MIT License](LICENSE).
