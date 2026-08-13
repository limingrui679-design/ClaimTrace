# ClaimTrace development guide

This guide maps the repository to its responsibilities and defines the local workflow for changing ClaimTrace without weakening reproducibility or claim boundaries.

## Prerequisites

- Node.js 22.13 or newer
- npm
- Chromium for browser acceptance tests

```bash
npm ci
npx playwright install chromium
```

## Repository map

```text
app/                 React views and browser workflow orchestration
app/workflows/       dataset intent, case loading, CSV import, verified export
src/core/            deterministic snapshot, claim, decision, governance, and evidence logic
src/cases/           ten executable case specifications and shared runtime
public/cases/        generated, self-contained case packs loaded by the browser
public/demo-data/    generated upstream population-health fixture
benchmarks/          independent labels, scenarios, and committed results
tests/               unit, integration, property, artifact, and Chromium checks
tools/               deterministic generators, refresh protocol, benchmark, and release helpers
docs/                concepts, guides, case catalog, evaluation, security, and release evidence
build/               Sites-compatible Vite packaging helper
```

The browser interface must render canonical results from `src/core`; it must not recreate or mutate audit truth in presentation code. The executable cases and tests call the same core used by the application.

## Development loop

```bash
npm run dev
npm run lint
npm run typecheck
npm run test:unit
```

If you change a generator, case specification, source transformation, rule contract, or evidence schema, regenerate deterministic artifacts before testing:

```bash
npm run demo:generate
npm run cases:generate
npm run benchmark
```

Review every generated diff. A generator should never be used to hide an unexplained fixture change.

## Test tiers

| Command | Scope |
|---|---|
| `npm run test:docs` | Local documentation and image references |
| `npm run test:unit` | Core, cases, refresh protocol, benchmark, properties, import policy, and workflow coordination |
| `npm run test:built-artifact` | Production bundle, Sites package, and portable checksum behavior |
| `npm run test:browser:readonly` | Compiled read-only reviewer path in Chromium |
| `npm run test:browser:writable` | Import, replacement, review, and verified-export path in Chromium |
| `npm run test:coverage` | Enforced `src/core` coverage thresholds |
| `npm run ci` | Complete local quality gate |

## Build modes

The standard local build is writable:

```bash
npm run build
npm run preview
```

The public portfolio build removes mutation controls at compile time:

```bash
CLAIMTRACE_COMMIT=<commit> VITE_PUBLIC_READ_ONLY=true npm run build
npm run preview
```

The visible commit receipt binds the compiled artifact to supplied metadata. It does not authenticate the deployment or prove that the artifact is publicly reachable.

## Invariants to preserve

- Record order must not create data changes; primary-key identity controls alignment.
- Raw-file and normalized-row hashes must remain separately reproducible.
- Claim result identity must change when semantic rules, evidence, provenance, outputs, or snapshot identity change.
- `DECISION_CHANGED` must remain distinct from `RESIGN_REQUIRED`.
- Decision release must remain blocked by unreleased upstream claims.
- Review identity, local time, authorization, and signature assurances must remain explicitly unverified.
- AuditBundle verification must recompute derived content rather than trust stored result fields.
- Public-data observations and manual decision assumptions must remain distinct.

## Documentation changes

Update the [documentation hub](docs/README.md) when adding a guide. Keep detailed protocols out of the README unless they are necessary for a first successful run. Run:

```bash
npm run test:docs
```

Visual assets under `docs/readme` must include an SVG `title` and `desc`, render legibly at GitHub width, and avoid invented product metrics.

## Before opening a pull request

```bash
npm run ci
npm audit --omit=dev
npm audit
git diff --check
```

Then confirm that generated artifacts are intentional, documentation links resolve, no secret or sensitive dataset was added, and every performance or impact statement is supported by the committed evidence.
