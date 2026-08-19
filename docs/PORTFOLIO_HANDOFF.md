# Portfolio handoff

ClaimTrace is a publicly reviewable read-only demo and a locally runnable portfolio prototype. This file shortens the path from an application claim to the exact repository evidence that supports it. The public demo is not evidence of adoption, authenticated governance, customer delivery, or measured external impact.

## Current evidence boundary

- Source release: package `0.11.0`; release tag `v0.11.0`, attached ZIP, and the public build receipt must be bound to the same tag commit before release publication is claimed.
- Reproducible scope: six bounded official public-data audit cases and four deterministic synthetic stress fixtures.
- Review assurance: local, unauthenticated display names; local clock; self-asserted authorization; no cryptographic signature.
- Delivery status: public source, a reproducible local build, and a public read-only demo at <https://claimtrace-audit.limingrui2.chatgpt.site>. The deployed UI must visibly report `v0.11.0`, the matching release-commit prefix, and `read-only` before this handoff is complete; publication does not make it an authenticated or production-grade service.
- External validity: no users, institutional adoption, customer delivery, causal effect, ROI, health outcome, investment return, or policy impact is claimed.

## Short verification path

1. Open <https://claimtrace-audit.limingrui2.chatgpt.site> and confirm that the visible `v0.11.0 · commit … · read-only` receipt matches the `v0.11.0` tag commit.
2. Inspect `public/cases/catalog.json` for the ten-case scope and origin labels.
3. Inspect a public case's `source-metadata.json`, pinned raw responses, `cleaning-log.json`, snapshots, and `evidence-package.json`.
4. Run `npm ci`, `npm run verify:bundle -- public/cases/cdc-places-depression/evidence-package.json`, and `npm run ci` from a clean checkout.
5. Read `docs/VERIFY_BUNDLES.md`, `docs/RELEASE_VERIFICATION.md`, `docs/LIMITATIONS.md`, and `docs/SECURITY.md` before reusing any numerical claim.

## Supported application wording

> Built a local-first TypeScript/React system that detects when refreshed CSV evidence invalidates an analytical claim or downstream decision and exports independently recomputable AuditBundles; implemented versioned source lineage, point and reported-interval rules, decision/review identity, a JSON Schema and CLI verifier, and validated them with six bounded public-data cases, four synthetic stress fixtures, 166 unit/integration tests, three built-artifact checks, and two Chromium flows.

Use first person only for modules and design decisions that the applicant can explain and support with commit history or retained process evidence. If contribution was shared, identify the applicant's exact scope instead of claiming sole authorship.

## Unsupported wording

Do not describe ClaimTrace as a production deployment, authenticated approval system, AI/ML model, external accuracy benchmark, institutional adoption, ten real client projects, six clients, or evidence of real-world impact. Test coverage is not model accuracy; internal scenarios and fixed-seed property iterations are not external samples.

## Program use

Use one ClaimTrace project across applications. Select one primary case and at most one secondary case for each program, then pair it with the applicant's actual coursework, research, internship, or teaching evidence. `docs/PROGRAM_ALIGNMENT.md` records portfolio-fit interpretations, not admissions probabilities or proof of curricular equivalence.
