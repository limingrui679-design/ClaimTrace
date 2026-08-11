# Portfolio handoff

ClaimTrace is a locally runnable, read-only-capable portfolio prototype. This file shortens the path from an application claim to the exact repository evidence that supports it. It is not a record of deployment, adoption, or measured external impact.

## Current evidence boundary

- Source release: package `0.10.1`; the release tag and attached ZIP must resolve to the same commit before they are cited.
- Reproducible scope: six bounded official public-data audit cases and four deterministic synthetic stress fixtures.
- Review assurance: local, unauthenticated display names; local clock; self-asserted authorization; no cryptographic signature.
- Delivery status: public source and a reproducible local/read-only build. No public hosted URL is claimed here until one is independently opened and bound to the release commit.
- External validity: no users, institutional adoption, customer delivery, causal effect, ROI, health outcome, investment return, or policy impact is claimed.

## Short verification path

1. Inspect `public/cases/catalog.json` for the ten-case scope and origin labels.
2. Inspect a public case's `source-metadata.json`, pinned raw responses, `cleaning-log.json`, snapshots, and `evidence-package.json`.
3. Run `npm ci` and `npm run ci` from a clean checkout.
4. Compare the package version and commit receipt in the read-only UI with the intended source revision.
5. Read `docs/RELEASE_VERIFICATION.md`, `docs/LIMITATIONS.md`, and `docs/SECURITY.md` before reusing any numerical claim.

## Supported application wording

> Built a local-first TypeScript/React prototype that binds versioned CSV evidence, governed analytical claims, decision identities, and local unauthenticated review records into independently recomputable AuditBundles; validated it with six bounded public-data cases, four synthetic stress fixtures, 155 unit/integration tests, two built-artifact checks, and two Chromium flows.

Use first person only for modules and design decisions that the applicant can explain and support with commit history or retained process evidence. If contribution was shared, identify the applicant's exact scope instead of claiming sole authorship.

## Unsupported wording

Do not describe ClaimTrace as a production deployment, authenticated approval system, AI/ML model, external accuracy benchmark, institutional adoption, ten real client projects, six clients, or evidence of real-world impact. Test coverage is not model accuracy; internal scenarios and fixed-seed property iterations are not external samples.

## Program use

Use one ClaimTrace project across applications. Select one primary case and at most one secondary case for each program, then pair it with the applicant's actual coursework, research, internship, or teaching evidence. `docs/PROGRAM_ALIGNMENT.md` records portfolio-fit interpretations, not admissions probabilities or proof of curricular equivalence.
