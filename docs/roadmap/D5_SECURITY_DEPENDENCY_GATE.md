# D5 — Security and dependency gate

**Performed 16 November 2026** on branch `feat/d5-security-dependency-gate`, from main `3738588056b9351308d03374ce5fbf0e9587ada7` (D4 release). Report-only assessment plus one dependency change. Part of D5 / [R25](R25-advisor-usability-and-accessibility.md) / [#57](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/57), linked to [PII protection / #59](PII_PROTECTION.md).

This is a bounded secrets-and-exposure check of the supported synthetic demo, **not** a comprehensive security audit, penetration test, certification or permission to process real client data. A clean result means no findings within the checks recorded below, not proof that no secret exists. #59's real-client controls remain mandatory before any real-client pilot.

## Scope of this batch

1. **D4 release verification** (recorded in the [handoff](../CLAUDE_HANDOFF.md) and on PR #82/#54): main CI, the production deployment and a synthetic, keyless production smoke.
2. **The report-only assessment** planned in [PR #80](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/pull/80) (`D5_SECRETS_EXPOSURE_REVIEW.md`, accepted 27 October 2026), reconciled against current main below. PR #80 is left open and unmodified.
3. **GHSA-mrhx-c7xc-m3w5 (Zod)**: the smallest supported dependency change, with regressions.
4. Records: handoff, delivery plan, tracking and the saved next command.

Not in scope: pairing policy (finding 3), [#83](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/83), runtime model/prompt/tools, merging PR #80, credentials, paid calls, real client data. Other findings are reported here and in separate issues, not fixed in this batch.

## Reconciling PR #80's plan with current main

PR #80 was written on 27 October 2026 from `c0ee4e9` (D2a), before D3 and D4. Its review method, handling rules and exit evidence still apply unchanged. What changed underneath it:

| PR #80 assumption | Current main | Effect on the assessment |
|---|---|---|
| "D3 remains next; D4 follows, then D5" | D3 and D4 are released (`85b3910`, `3738588`) | The check now runs as part of D5, as the plan intended. |
| Public API boundary = demo Copilot, ingestion, market data, PDF | Adds D3's final-PDF route with server re-gating, and D4's local live mode: `/api/copilot` live path, `/api/copilot/live-session` (+`claim`), `/api/copilot/local/{pair,connection}` | Hosted refusal of every local/live endpoint was checked against production (below). |
| No credentials handled by the app | D4 accepts a user-owned Anthropic key locally: server memory or the OS credential store (`@napi-rs/keyring`), never a file | Checked: no key in tracked files, history, client bundles, production assets, local state files or backups. |
| No local state outside the browser | `.atlas-local/` (pairing, connection, session records: hashes and counters only) and `agent-eval-reports/` | Both git-ignored; nothing tracked under them. |
| Dependencies not in scope | `npm audit` reported GHSA-mrhx-c7xc-m3w5 (high) | Fixed in this batch (below). |

## Coverage

Target: code at `3738588` (= reviewed head `b46eb57` + merge), clean local production build of the same tree, and production deployment `7828072724` (GitHub "Production", success) served at `atlas-proposal-engine.vercel.app`. Tools: `git grep` over all 190 commits, `grep` over build output and downloaded production assets, `curl`, `npm audit` (npm 11 / Node 24.11.1), GitHub REST API. No scanner was installed.

| Surface | Status | What was checked |
|---|---|---|
| Repository and history | **Inspected** | All 190 commits for provider-key, cloud-key, GitHub-token, Slack-token and private-key patterns. `.env*`, key and credential files tracked: only `.env.example`, whose values are all empty. Private-fixture, `.atlas-local/` and eval-report paths: nothing tracked except the private folder's own `.gitignore`. |
| Build and CI | **Inspected** | One workflow, `permissions: contents: read`, no secrets referenced; no Actions secrets defined. Main CI run 43895100169 counts read (724 passed, 2 skipped). |
| Next.js client boundary | **Inspected** | No `NEXT_PUBLIC_` variables; `next.config.ts` sets no `env`. Clean production build: 43 static files, no credential patterns, none of the server-only variable or module names (`ANTHROPIC_API_KEY`, `COPILOT_MODE`, provider keys, `keyring`, `credentialStore`, `liveSessionStore`, `localConnection`), no source maps emitted. |
| Production assets and source maps | **Inspected** | 19 JS/CSS assets from five public pages (1.46 MB): no credential patterns, no server-only names, no `sourceMappingURL`; a `.map` URL returns 404. Build identity: production deployment for `3738588`, and D4-only behaviour observed (labels, refusals, preview/Add). |
| Public API and agent boundary | **Inspected (source + keyless probes)** | `GET /api/copilot` → `{"mode":"demo","model":null}`. Local/live endpoints all refuse on the hosted build: `local/connection` 503, `local/pair` 503, `live-session` start 503 / stop 403, `live-session/claim` 503. Market-data providers report no API key for any keyed provider; remaining providers are free public APIs. No paid or live call was made and no credential was used. |
| Vercel project environment and logs | **Unavailable** | The Vercel connection isn't authorized for this team scope; granting it is a permission change and was not requested. Hosted behaviour (demo mode, no model, refusals) is observed, but the environment variables themselves are not. |
| Vercel deployment protection, firewall, rate limits | **Unavailable** | Same reason. |
| GitHub secret scanning / push protection | **Inspected** | Both **disabled** (finding 1). |
| Dependencies | **Inspected** | `npm audit`: 1 high (Zod) before; **0** after this batch. |

## Findings

Severities are for this synthetic public demo. None is an exposed usable credential.

| # | Finding | Severity | Status | Evidence | Bounded remedy |
|---|---|---|---|---|---|
| 1 | **Secret scanning and push protection are disabled** on a public repository. | Medium (prevention gap) | Verified; reported as [#85](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/85) | GitHub `security_and_analysis`: all `disabled`. | Owner enables secret scanning and push protection in repository settings (free for public repositories). A settings change, so not made here. |
| 2 | **Unbounded arrays reach the public PDF route's parser.** `checkSnapshot` (backup schemas) parses `POST /api/proposals/[id]/generate-pdf` bodies; 50 of 51 arrays in those schemas have no size limit, so an array of invalid items is parsed element by element. Zod 4's fix only short-circuits collections that **have** a limit. | Medium (availability) | Verified locally; reported as [#86](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/86) | Measured on the route's own parser: 400,000 invalid elements in a 0.8 MB body used ~198 MB of heap and 0.8 s; growth is linear, so a ~4.5 MB body (the host limit) projects to ~1 GB. Not reproduced against production. | Add `.max()` limits to arrays parsed on public routes (or a pre-parse size guard), with a regression, as its own change. |
| 3 | **The final-PDF route is public, unauthenticated compute** (Chromium, `maxDuration` 120 s). It re-gates readiness and fingerprints, and no paid AI is involved, but repeated requests consume function quota. | Low | Source-traced; reported as [#87](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/87) | Route source; production returned 405 to GET today. Re-gating of altered versions is covered by existing tests and was observed in the D3 smoke, not re-run here. | Owner decides on rate limiting or deployment protection for the public demo. |
| 4 | `/api/copilot/live-session` validates the JSON `action` before its hosted-readiness check (400 for an unknown action, then 503/403 for real ones), unlike the local routes' authorize-then-read order. | Informational | Verified; no bypass | Production responses above. | Optional: check readiness first, for consistency. |
| 5 | `/api/ingest` receives uploaded statement content (non-PDF types) in the server function for parsing; PDFs are read in the browser. No onward third-party transmission was found. | Informational | Source-traced | Route and providers. | Part of #59's data-flow review; don't move processing. |

**False positives:** five distinct credential-shaped strings, all in `tests/localConnect.test.ts` and `tests/liveSession.test.ts`: three made-up canaries labelled as such, and two low-entropy hyphenated-word fixtures used to test key-shape checks. None is a credential.

**Not verified:** the Vercel environment, logs and protection settings (above); historical preview deployments; Actions logs beyond the main run's counts; supply chain beyond `npm audit`.

## GHSA-mrhx-c7xc-m3w5 — Zod (fixed in this batch)

**Advisory** (GitHub, published 1 October 2026, high, CVSS 7.5): Zod through 4.6.5 could exhaust memory on oversized constrained collections; patched in 4.6.6. No 3.x release is patched.

**Applicability, reproduced first:** Atlas's Copilot request schema limits its collections (holdings 1,000, accounts 200, …), but under Zod 3.25.76 a limit was checked only after every element had been parsed. At `parseCopilotRequest` — the public `/api/copilot` parser — 50,000 invalid holdings produced **100,001** issues and 20,000 invalid scope ids 20,001. Zod 4.6.6+ refuses an over-limit collection at once with a single size issue.

**Change:** `zod` `^3.24.1` → `^4.6.7` (one direct dependency). The tree now has a single copy, `zod@4.6.7`, shared by the Anthropic SDK (optional peer `^3.25 || ^4`) and `chromium-bidi` (which already required `^4.6.5`). `npm audit fix --force` was not used.

**Compatibility, and what had to change:**
- `z.record(valueSchema)` needs an explicit key schema in Zod 4 → `z.record(z.string(), z.unknown())` in `src/copilot/snapshot.ts`.
- Zod 4's `z.record(enumKey, …)` requires **every** enum key; Zod 3 accepted any subset. The four asset-class maps in the backup (draft targets, model weights, mixes) now use `z.partialRecord`, which keeps the old meaning: any subset, unknown keys still refused. Without it every export of a draft with targets failed.
- The export allowlist walker no longer references Zod 3's `ZodEffects`: Zod 4 keeps refinements on the schema itself, and a transform pipe is walked by its input side, as `innerType()` was.
- Tool definitions sent to the model are hand-written JSON schemas and are unchanged. Zod only validates tool inputs server-side; the wording of a validation error returned to the model when it sends malformed input now follows Zod 4 ("Invalid input: …").
- No store or backup version change; v6–v10 backups still restore.

**Regressions** (`tests/dependencySecurity.test.ts`, 7 tests): the two oversized-collection cases above (failed first: 100,001 and 20,001 issues); every installed Zod copy is ≥ 4.6.6 (failed first); a partial target map exports and restores unchanged (fails if the exhaustive record returns, checked by mutation); an unknown asset-class key is refused; the export allowlist still drops unnamed fields inside arrays, objects and refined fields.

**Validation:** typecheck clean; **733 passed, 0 skipped** (40 files, private fixture present); extraction eval 2/2; production build passed; `npm audit` 0 vulnerabilities. Browser check on the local production build (isolated `zod.localhost:3001`, synthetic data): restore through Settings, a partial Equity target set on the desk, a Copilot request accepted by the server parser (200), export through the real button (`targets: { equity: 50 }`, holdings unchanged), and that file restored again with targets and scope intact; no console errors.

## Exit evidence (against PR #80's checklist)

- [x] Commit, build/deployment identity, date, scope and tools recorded.
- [x] Coverage separates inspected, unavailable and not-applicable surfaces with reasons.
- [x] Verified findings have severity, redacted location, exposure path, impact and a bounded remedy.
- [x] No exposed usable credential; nothing required revocation.
- [ ] **Unavailable critical checks stay unresolved coverage:** Vercel environment, logs and protection are not cleared by this report.
- [x] Synthetic regression checks cover the implemented guard, with no secrets logged and no paid calls.
- [x] Public summaries are sanitized; no secret value, private URL or client data appears here.
- [x] The public demo remains synthetic and scripted; #59's real-client controls remain outstanding.

These are engineering release evidence, not a tamper-proof audit record or a guarantee.
