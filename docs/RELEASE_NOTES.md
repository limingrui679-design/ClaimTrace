# ClaimTrace v0.11.0

This minor release makes ClaimTrace easier to understand and independently verify while adding one bounded statistical capability. It preserves the ten-case portfolio and all prior evidence boundaries.

## What changed

- Rewrote the README and in-app introduction around a concrete question: whether refreshed data invalidates a conclusion or downstream decision.
- Expanded the ten-case landscape and browser cards so every case states its primary key, executed method, checks, committed result, action, demonstrated capability, and evidence boundary.
- Added an `interval-threshold` rule. It supports a claim only when the complete reported interval clears a boundary, reverses it only when the interval is wholly on the opposite side, and routes a crossing interval to review.
- Added a fourth CDC PLACES claim that audits a reported 95% interval without treating a point estimate as sufficient or presenting the threshold as CDC guidance.
- Published the structural AuditBundle 2.6.0 JSON Schema and a CLI that independently verifies one bundle or a chronological `previousBundleHash` chain with stable human/JSON output and exit codes.
- Added generated case metadata for method, capability tags, and explicit evidence boundaries.
- Corrected the application-alignment source of truth to the latest 15-program list, including Johns Hopkins Carey BAAI at #7 and Yale MSPH Health Informatics at #11, while keeping every portfolio bridge explicitly applicant-authored.
- Corrected the CDC and ONS primary keys in the human-readable catalog.
- Added schema, CLI, interval-rule, and tamper-rejection tests; pinned CodeQL actions to immutable commits; and made schema changes trigger CI.
- Rebuilt the social card and read-only Chromium Demo, made the Demo renderer reproducible from declared dependencies, removed repeated 20,000-row diff work from evidence selection, and made opening an import immediately supersede an older case request.

## Verified scope

- Six bounded public-data audit cases and four deterministic synthetic stress fixtures.
- 166 unit/integration tests, three built-artifact and release-package checks, and two Chromium flows.
- 64/64 internally labeled benchmark scenarios and 512 fixed-seed property iterations.
- 10/10 generated AuditBundles satisfy the published structural schema and pass semantic recomputation.
- The 20,000-row bounded-evidence regression remains inside its 10-second browser-scale budget after keyed-diff reuse; UI actions retain a separate five-second timeout inside the longer writable workflow.
- 96.83% core statements/lines, 78.98% branches, and 99.39% functions covered.
- Zero known production or development dependency vulnerabilities at release-candidate verification.

ClaimTrace remains a local-first, reproducible portfolio prototype. A valid AuditBundle proves internal consistency, not source truth, domain validity, authenticated governance, institutional adoption, client delivery, or real-world impact.
