<p align="center">
  <img src="public/og.png" alt="ClaimTrace — versioned evidence and decision audit" width="100%">
</p>

# ClaimTrace

<p align="center">
  <strong>When data changes, which claims survive—and which decisions must change or be signed again?</strong>
</p>

<p align="center">
  <a href="https://claimtrace-audit.limingrui2.chatgpt.site"><strong>Open the public demo</strong></a>
  · <a href="https://github.com/limingrui679-design/ClaimTrace/releases/latest">Latest release</a>
  · <a href="docs/EVIDENCE_MODEL.md">Evidence model</a>
  · <a href="docs/LIMITATIONS.md">Limits</a>
  · <a href="docs/PORTFOLIO_HANDOFF.md">Portfolio handoff</a>
</p>

<p align="center">
  <a href="https://github.com/limingrui679-design/ClaimTrace/actions/workflows/claimtrace-ci.yml"><img src="https://github.com/limingrui679-design/ClaimTrace/actions/workflows/claimtrace-ci.yml/badge.svg" alt="ClaimTrace CI"></a>
</p>

ClaimTrace is a local-first prototype for auditing analytical claims across data versions. It joins source provenance, primary-key changes, sample denominators, governed thresholds, executable rules, downstream decisions, and local review records in one reproducible chain.

<table>
  <tr>
    <td align="center"><strong>10</strong><br>reproducible cases</td>
    <td align="center"><strong>160 / 160</strong><br>automated checks</td>
    <td align="center"><strong>64 / 64</strong><br>benchmark scenarios</td>
    <td align="center"><strong>512</strong><br>property trials</td>
  </tr>
</table>

<p align="center">
  <img src="docs/claimtrace-demo.gif" alt="ClaimTrace real-browser walkthrough" width="100%">
</p>
<p align="center"><em>Real-browser walkthrough of the read-only portfolio build.</em></p>

The [public demo](https://claimtrace-audit.limingrui2.chatgpt.site) is a separately compiled, read-only portfolio build bound to release `v0.10.2` and visible receipt `92d741b`. The local build adds CSV import, rule creation, review, and verified export. Neither build claims authenticated sign-off, durable collaboration, or production governance.

## From changed data to reviewable action

<p align="center">
  <img src="docs/readme/evidence-chain.svg" alt="ClaimTrace pipeline from source data to a verified AuditBundle" width="100%">
</p>

ClaimTrace answers two questions separately:

1. Is the analytical claim still supported?
2. Did the action change, or does unchanged action merely require a new sign-off?

That separation prevents a refreshed dataset from inheriting stale approval just because the final recommendation happened to remain the same.

## What the audit chain protects

| Risk | ClaimTrace control |
|---|---|
| Row order masquerades as change | Records align by a user-selected primary key. |
| A number loses its evidence | Both versions retain keys, physical lines, fields, denominators, and snapshot hashes. |
| A threshold looks authoritative without provenance | Value, unit, source, rationale, confirmer, and confirmation time are part of the rule. |
| Zero baselines, ties, or missing groups silently pass | Explicit edge-case states route unsupported comparisons to review. |
| Evidence changes but an old approval survives | Stable claim-result and decision identities invalidate stale release state. |
| An action changes without being noticed | Outcome, active action, recommendation, and feasible-set changes produce `DECISION_CHANGED`. |
| A bundle trusts its own stored answer | Verification reconstructs snapshots and reruns claims, decisions, review state, transformations, and summaries. |

See the full [evidence model](docs/EVIDENCE_MODEL.md), [architecture](docs/ARCHITECTURE.md), and [security model](docs/SECURITY.md).

## Ten reproducible cases

<p align="center">
  <img src="docs/readme/case-landscape.svg" alt="Four synthetic stress fixtures and six public-data cases" width="100%">
</p>

The four synthetic fixtures isolate controlled failure modes. The six public-data cases test source-bound cleaning and provenance against pinned official responses. These roles are complementary; synthetic cases are not presented as external validation, and public-data cases are descriptive demonstrations rather than real-world impact studies.

| Case | Audit focus | Origin |
|---|---|---|
| [Business operations](public/cases/business-operations/) | Ranking, SLA changes, resource allocation | Deterministic synthetic |
| [Financial risk](public/cases/financial-risk/) | Probability, membership, missingness, thresholds | Deterministic synthetic |
| [Population health](public/cases/population-health/) | Risk, recall, follow-up, model gating | Synthetic with verifiable upstream lineage |
| [Spatial planning](public/cases/spatial-planning/) | Demand, travel time, risk, site selection | Deterministic synthetic |
| [World Bank life expectancy](public/cases/world-bank-life-expectancy/) | Cross-year indicator claims | Public data · CC BY 4.0 |
| [USDOT transit operations](public/cases/usdot-transit-operations/) | Ridership and service intensity | Public data · U.S. DOT/FTA |
| [U.S. Treasury yield curve](public/cases/us-treasury-yield-curve/) | Period and curve-shape claims | Public data · U.S. Treasury |
| [CFPB credit-card complaints](public/cases/cfpb-credit-card-complaints/) | Issue ranking, shares, matched volume | Public data · CC0 |
| [CDC PLACES depression estimates](public/cases/cdc-places-depression/) | Selected-county release changes | Public data · CDC |
| [ONS housing affordability](public/cases/ons-housing-affordability/) | Selected-authority period changes | Public data · OGL v3.0 |

Every case contains executable specifications, two snapshots, expected results, a manifest, documentation, and a verified AuditBundle. The [machine-readable catalog](public/cases/catalog.json) records the generated artifacts and hashes.

## Try it

| Public demo | Local workspace |
|---|---|
| Read-only reviewer path with preloaded cases | Writable import, rule, review, and export workflows |
| No account or data upload | Files stay in the browser session |
| Bound to the `v0.10.2` release receipt | Requires Node.js 22.13 or newer |

```bash
npm ci
npm run dev
```

Open the local URL printed by Vite.

<details>
<summary><strong>CSV behavior and verified-export limits</strong></summary>

CSV input supports UTF-8, UTF-8 with BOM, UTF-16LE with BOM, and UTF-16BE with BOM. The strict dialect supports escaped quotes, multiline fields, CRLF, and empty trailing cells while rejecting malformed quote boundaries. Baseline column order is canonical for normalized hashes; the current file may reorder columns only when the exact case-sensitive set is unchanged.

The browser rejects files above 10 MiB before reading them. AuditBundle and verified HTML export embed up to 500 KB of raw data per snapshot. Larger files can still be analyzed, but detached raw-file verification and verified export are not implemented. Inspect exports before sharing them.
</details>

<details>
<summary><strong>Regenerate cases and refresh an official source</strong></summary>

Offline regeneration consumes the committed raw responses:

```bash
npm run demo:generate
npm run cases:generate
```

Source refresh is an explicit networked action that can change evidence:

```bash
npm run cases:refresh-sources -- usdot-transit-operations
npm run cases:generate
```

The refresh path uses case-local target restrictions, an exclusive lock, HTTPS URL validation, redirect rejection, response-size limits, source-specific cleaners, publisher-date checks, and hash-checked transaction recovery. See [release verification](docs/RELEASE_VERIFICATION.md) for the exact protocol.
</details>

## Verification

The `v0.10.2` release gate records:

<table>
  <tr>
    <td align="center"><strong>155</strong><br>unit + integration</td>
    <td align="center"><strong>3</strong><br>build + release</td>
    <td align="center"><strong>2</strong><br>Chromium flows</td>
    <td align="center"><strong>10 / 10</strong><br>verified bundles</td>
  </tr>
  <tr>
    <td align="center"><strong>96.99%</strong><br>statements + lines</td>
    <td align="center"><strong>78.75%</strong><br>branches</td>
    <td align="center"><strong>99.37%</strong><br>functions</td>
    <td align="center"><strong>0</strong><br>known npm vulnerabilities</td>
  </tr>
</table>

Run the complete local gate:

```bash
npx playwright install chromium
npm run ci
npm audit --omit=dev
npm audit
```

The 64-scenario benchmark and 512 deterministic property trials establish regression behavior on committed boundaries only. They do **not** establish production accuracy, external validity, user impact, or superiority to mature audit platforms. Details and baseline results are in [evaluation](docs/EVALUATION.md); exact release evidence is in [release verification](docs/RELEASE_VERIFICATION.md).

## Architecture

```text
versioned data
    ↓
snapshot + keyed diff
    ↓
claim specification + deterministic validation
    ↓
decision identity + governance propagation
    ↓
verified AuditBundle → JSON / HTML / review chain
```

| Layer | Responsibility |
|---|---|
| `src/core` | Deterministic snapshots, statistics, claims, decisions, governance, integrity, and evidence export |
| `src/cases` | Ten executable case specifications |
| `app/workflows` | Dataset intent, case loading, CSV import, and verified export |
| `app/views.tsx` | Presentation-only route views |

The Vite + React interface is separate from the audit core. No decorative chart uses invented metrics.

## Honest governance boundary

| Demonstrated by committed artifacts | Not demonstrated |
|---|---|
| Tamper-evident internal consistency | Authenticated reviewer identity |
| Deterministic claim and decision recomputation | Trusted timestamps or digital signatures |
| Local review-state propagation | Durable multi-user authorization |
| Public-data cleaning lineage | Source truth or institutional adoption |
| Reproducible prototype evaluation | Production deployment or real-user impact |

Review records explicitly declare `LOCAL_UNVERIFIED`, `LOCAL_CLOCK_UNVERIFIED`, `SELF_ASSERTED`, and `NONE` for identity, time, authorization, and cryptographic signature. SHA-256 chains and bundle roots detect internal inconsistency; they do not turn local display names into authenticated signers. See [limitations](docs/LIMITATIONS.md).

<details>
<summary><strong>Evidence-bound portfolio wording</strong></summary>

> Independently designed and implemented a local-first prototype for versioned analytical-claim auditing, connecting primary-key data changes, governed thresholds, sample denominators, SHA-256 snapshots, executable rules, decision identity, and local review records; validated it with 64 controlled scenarios, 512 deterministic property trials, four reproducible synthetic stress fixtures, and six provenance-bound public-data cases spanning operations, fixed income, consumer finance, population health, planning, and international indicators.

Unsupported claims include production deployment, real institutional governance, authenticated sign-off, real-user outcomes, causal policy or program evaluation, portfolio backtesting, investment performance, epidemiologic inference, representative consumer research, and GIS analysis.
</details>

## Implementation status

- JSON and HTML are generated from the same independently verified AuditBundle.
- `DECISION_CHANGED` is separate from `RESIGN_REQUIRED`.
- All ten committed case specifications regenerate and verify.
- The read-only portfolio build removes import and sign-off controls; the local repository retains them.
- Completeness such as `48/48` means passed checks—not model accuracy, research effect, or business impact.

## Documentation

| Need | Document |
|---|---|
| Understand the evidence object and identities | [Evidence model](docs/EVIDENCE_MODEL.md) |
| Inspect modules and data flow | [Architecture](docs/ARCHITECTURE.md) |
| Reproduce tests, benchmarks, and release evidence | [Evaluation](docs/EVALUATION.md) · [Release verification](docs/RELEASE_VERIFICATION.md) |
| Review security and non-goals | [Security](docs/SECURITY.md) · [Limitations](docs/LIMITATIONS.md) |
| Reuse the project in an application portfolio | [Portfolio handoff](docs/PORTFOLIO_HANDOFF.md) · [15-program alignment](docs/PROGRAM_ALIGNMENT.md) |
| Publish a new version | [Release checklist](docs/CLAIMTRACE_RELEASING.md) |

## License

[MIT](LICENSE) © 2026 Mingrui Li
