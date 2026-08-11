# ClaimTrace v0.10.1

This patch release binds publisher-reported update dates to independently inspectable source evidence.

## What changed

- Publisher dates must be valid ISO calendar dates.
- World Bank dates are extracted from both pinned Indicators API response headers and must agree.
- U.S. Treasury dates are extracted from both pinned Atom feed headers, normalized to a UTC calendar date, and must agree.
- USDOT dates are extracted from pinned official Socrata dataset metadata whose dataset identity, response hash, and `rowsUpdatedAt` value are verified.
- The refresh command updates each source pair, optional publisher-metadata response, retrieval time, and publisher date as one three- or four-file transaction with tested rollback.
- Fully rehashed bundles with an invalid or evidence-mismatched publisher date are rejected.

## Verified scope

- Six bounded public-data audit cases and four deterministic synthetic stress fixtures.
- 155 unit/integration tests, two built-artifact checks, and two Chromium flows.
- 64 internally labeled benchmark scenarios and 512 fixed-seed property iterations.
- Local, unauthenticated review records; no identity, RBAC, trusted time, or digital-signature claim.

This is a reproducible portfolio prototype. The release does not claim a hosted demo, production deployment, external adoption, real-user outcomes, or institutional impact.
