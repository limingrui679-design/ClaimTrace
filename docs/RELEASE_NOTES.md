# ClaimTrace v0.10.3

This patch release makes ClaimTrace faster to evaluate as a portfolio system while preserving its complete audit evidence and claim boundaries.

## What changed

- Reworked the README opening around the practical versioned-evidence problem, a ten-case comparison, and a compact reviewer-facing workflow.
- Kept the complete claim and decision-state graph and all technical evidence available in expandable sections instead of deleting audit detail.
- Added an accessible system-architecture graphic, documentation hub, concise getting-started path, contributor guidance, issue and pull-request templates, citation metadata, and a proposal-only roadmap.
- Added documentation-reference validation to both the local and hosted quality gates.
- Updated the audited transitive development dependency `nanoid` and retained zero known production or development dependency findings.
- Preserved all six bounded public-data cases, four deterministic synthetic fixtures, current publisher-date validation, portable checksums, and exact public-build provenance.

## Verified scope

- Six bounded public-data audit cases and four deterministic synthetic stress fixtures.
- 155 unit/integration tests, three built-artifact and release-package checks, and two Chromium flows.
- 64 internally labeled benchmark scenarios and 512 fixed-seed property iterations.
- Local, unauthenticated review records; no identity, RBAC, trusted time, or digital-signature claim.

This is a reproducible portfolio prototype. Hosting configuration or a preview is not evidence of production deployment, authenticated governance, external adoption, real-user outcomes, or institutional impact.
