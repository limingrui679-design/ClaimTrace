# ClaimTrace v0.10.2

This patch release makes publisher-date failures and release checksums precise and portable.

## What changed

- Publisher update-date validation is now an independent lineage gate rather than a side effect of CSV cleaning.
- Invalid and evidence-mismatched dates stop before snapshot rebuilding, so verification reports the governing root cause once without misleading baseline/current CSV-rebuild messages.
- An invalid declared date no longer also emits a derivative evidence-mismatch message; a valid but wrong date still produces the exact mismatch diagnostic.
- Offline generation and networked refresh retain the same publisher-date evidence checks after the separation.
- Release checksum sidecars record only the ZIP base name, with an explicit portability assertion in the release procedure.
- The existing Sites project identifier is versioned and production builds prove that its metadata and static Worker entry are packaged together; a deployment is claimed only after the exact release build is publicly opened and its receipt is checked.

## Verified scope

- Six bounded public-data audit cases and four deterministic synthetic stress fixtures.
- 155 unit/integration tests, three built-artifact and release-package checks, and two Chromium flows.
- 64 internally labeled benchmark scenarios and 512 fixed-seed property iterations.
- Local, unauthenticated review records; no identity, RBAC, trusted time, or digital-signature claim.

This is a reproducible portfolio prototype. Hosting configuration or a preview is not evidence of production deployment, authenticated governance, external adoption, real-user outcomes, or institutional impact.
