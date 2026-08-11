# ClaimTrace release checklist

## 1. Verify from the lockfile

Use Node.js 22.13 or newer:

```bash
npm ci
npx playwright install chromium
npm run ci
npm audit --omit=dev --audit-level=high
npm audit --audit-level=high
```

`npm run ci` must finish with generated fixtures unchanged, 142 passing unit/integration tests, one passing Chromium acceptance test, 64/64 benchmark labels, 512 deterministic property trials, and coverage above the committed thresholds.

## 2. Inspect generated evidence

```bash
npm run cases:generate
git diff --exit-code -- public/demo-data public/cases app/demo-case.generated.ts benchmarks/results.json
```

For every directory listed in `public/cases/catalog.json`, verify `manifest.json`, `expected-audit.json`, and `evidence-package.json`. Every public-data case must retain its two pinned official-source responses, source metadata, access date, license, limitations, cleaning configuration, and raw SHA-256 values. Source refresh is deliberately separate from offline case generation.

## 3. Build the two intended modes

Local full-function build:

```bash
npm run build
```

Read-only portfolio build:

```bash
VITE_PUBLIC_READ_ONLY=true npm run build
```

The read-only build must display the read-only portfolio badge and render no import, claim-creation, review, or sign-off controls. Navigation, case execution, evidence inspection, and downloads remain available.

## 4. Browser acceptance

Check desktop and 390 px mobile layouts. Exercise this sequence in a real browser:

```text
overview → public-data case → source lineage → keyed diff → claims → decisions → review → report
```

Confirm that the console has no warning/error entries and that the committed `docs/claimtrace-demo.gif` matches the current interface.

The committed Playwright test is a required release gate:

```bash
npm run test:browser
```

## 5. Package and identify the release

- Exclude `node_modules`, `dist`, coverage output, caches, logs, environment files, secrets, and unrelated workspace projects.
- Include source, lockfile, all ten case packs, benchmark labels/results, the real-browser GIF, LICENSE, and release documentation.
- Record the ZIP SHA-256 after packaging.
- Create a version tag only after the tag name, `package.json`, changelog heading, generated artifacts, tested archive, and repository commit refer to the same source version.

An unpushed local tag is not a GitHub Release. A hosted preview is not evidence of production use, authenticated governance, or institutional deployment.
