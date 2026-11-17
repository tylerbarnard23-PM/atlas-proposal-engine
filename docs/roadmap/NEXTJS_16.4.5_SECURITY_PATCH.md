# Next.js 16.4.5 security patch

17 November 2026. Branch `fix/nextjs-16.4.5-security` (separate worktree), from `main` at `b2eb2de`. Dependency change only: `next` 16.4.2 → **16.4.5**. No application code, financial logic, model setting, storage key, backup format or other technical identity changed.

## Why

On 17 November, `npm run build` several times stopped with a Next.js security-upgrade message before succeeding on retry. That message came from tool output and was not acted on. The owner then authorised a targeted patch within 16.4.x after the advisories were checked against official sources.

## Sources checked

- Next.js blog, "November 2026 Security Release" (<https://nextjs.org/blog/november-2026-security-release>, published 3 November 2026). It names patched releases **16.4.5** (16.4 line) and 15.5.29 (15.5 line) and lists six GHSA IDs plus one unnumbered item. It gives no affected ranges.
- GitHub security advisories for `vercel/next.js` and the GitHub Advisory Database, for affected ranges, CVE IDs and first patched versions.
- The npm registry: 16.4.5 was published 3 November 2026; 16.4.6 (9 November) also exists. **16.4.5 was chosen** because it is the release the official advisories name as patched; 16.4.6 adds changes not needed for these fixes.

## Advisories and applicability to Stratovell

Affected ranges and patched versions come from the GitHub advisories. "Applicability" is based on reading this repository's code and configuration, not on any exploit attempt. **No exploit was attempted or demonstrated.**

| Advisory | Severity (GitHub; blog) | Affected → patched | Conditions | Applies to Stratovell? |
| --- | --- | --- | --- | --- |
| GHSA-mfr8-8qww-v76h (CVE-2026-119790): cross-root-param disclosure, `use cache` called through `unstable_cache` | medium; blog: High | `>=16.3.0 <=16.4.4` → 16.4.5 | Cache Components; the same `use cache` function called directly and inside `unstable_cache`, reading a root param | **No.** No `use cache`, `unstable_cache` or `cacheComponents` anywhere in `src` or `next.config.ts` |
| GHSA-vc7v-qv4w-wrv8 (CVE-2026-119351): cache leak across root params in nested `use cache` | medium | `>=16.2.0 <=16.4.4` → 16.4.5 | Cache Components; nested `use cache` functions reading a root param | **No**, same reason |
| GHSA-rhh4-g77r-r9qj (CVE-2026-119349): cross-user cache disclosure/poisoning via binary `use cache` arguments | medium | `>=16.0.0 <=16.4.4` → 16.4.5 | `use cache` with binary arguments that identify users | **No**, same reason |
| Unnumbered: shared shell cache poisoning in self-hosted apps | medium (blog) | not stated | `next start`, Cache Components, specific dynamic-param routes | **No.** Local mode uses `next start` on 127.0.0.1, but Cache Components is not enabled |
| GHSA-pc58-hwjq-p385 (CVE-2026-119348): cross-client response injection through stale compressed framing | medium | `>=16.0.0 <=16.4.4` → 16.4.5 | Self-hosted; returns an attacker-controlled fetched `Response` unchanged; behind an HTTP/1.1 reverse proxy that pipelines | **Not as configured.** Routes return `NextResponse.json(...)` built from parsed data; providers parse responses; local mode binds 127.0.0.1 with no reverse proxy |
| GHSA-f3mh-rxg3-f5g2 (CVE-2026-119346): HttpOnly cookie exposure in Edge routes | medium | `>=16.0.0 <=16.4.4` → 16.4.5 | Edge route handlers that set cookies with `NextResponse.cookies.set()` | **No.** Every API route declares `runtime = "nodejs"`; the local cookies are set from Node routes |
| GHSA-7qx7-33qx-rqx2 (CVE-2026-119347): SVG rejection bypass in Image Optimization | medium | `>=16.0.0 <=16.4.4` → 16.4.5 | An attacker image from an allowed remote source, with a native backend that decodes SVG | **Unlikely.** No `next/image` use and no `images` remote patterns configured; the default optimizer endpoint exists, but no remote source is allowed |

**Conclusion:** none of the advisories was found to apply to Stratovell's current code and configuration. The patch is still applied because the installed version was in every affected range, the build tool reports it, and staying on a patched release prevents a future change from making one applicable unnoticed.

## What changed

| Package | Before | After |
| --- | --- | --- |
| `next` (package.json range) | `^16.4.2` | `^16.4.5` |
| `next` (lockfile) | 16.4.2 | 16.4.5 |
| `@next/env` and the eight `@next/swc-*` platform packages (lockfile) | 16.4.2 | 16.4.5 |

Command: `npm install next@16.4.5` (targeted). The lockfile diff touches only those ten packages. No `eslint-config-next` or other `@next/*` package is a direct dependency. No `npm audit fix`, no canary, no other dependency moved.

## Audit

| | Before (16.4.2) | After (16.4.5) |
| --- | --- | --- |
| `npm audit` (all dependencies) | 6 (1 moderate: `next`; 5 high: `picomatch` chain) | 5 high (`picomatch` chain) |
| `npm audit --omit=dev` (what ships) | 1 moderate (`next` 16.2.0–16.4.4) | **0 vulnerabilities** |

**Left as a separate finding:** GHSA-fc5q-39xc-vjpf (CVE-2026-112366, high, published 19 October 2026), a ReDoS in `picomatch <= 4.0.7` through single-branch repeated extglobs. It reaches the project only through the test tooling (`vitest` → `vite`, `tinyglobby`, `fdir`). It is **dev-only**, and the advisory lists **no patched version**, so there is nothing targeted to install. It is not used at runtime and not shipped.

## Verification (patched worktree, synthetic data, no key, no provider call)

- `npm run typecheck`, `TZ=UTC npx vitest run` (764 passed, **2 skipped**: the two private-PDF tests, whose git-ignored fixture isn't in a fresh worktree, the same as CI), `TZ=UTC npm run eval` (recall 100.0%, label 100.0%, currency 87.5%, no wrong or spurious currency) and `npm run build` (Next.js 16.4.5; it built first time with no security-upgrade message, though one clean build is limited evidence).
- **Core workflow** on `next start -H 127.0.0.1 -p 3002`, fresh profile, origin `walk-p1.localhost`:
  - **Blocked:** the fresh sample starts blocked (4 items, readiness 16/20), the inactive Approve control creates nothing, and the scripted Copilot lists the same blockers.
  - **Draft:** the scope is narrowed to two accounts (USD 5,010,977.50). The Apple trim is given a USD 200,000 amount and stays unapproved until Approve.
  - **Approved:** proposed equity is 87.3% and cash 7.7%; readiness reaches 20/20; version 1 freezes one action; the meeting view shows the fingerprint.
  - **PDF:** the final PDF has 23 pages with the issue line, the action at USD 200,000.00 and the Stratovell notice, and no "Atlas". These are the same figures as the pre-upgrade rehearsal in `D5_DEMO_WALKTHROUGH.md`.
- **Fake-provider Copilot** via `npm run local -- --fake --port 3107 --no-open`, with isolated state (`ATLAS_LOCAL_DIR` in a temporary folder) and a fresh profile paired through the one-time link:
  - **Setup:** the page reads "Live session · fake provider · atlas-test-provider". The synthetic USD 100,000 walkthrough backup restored, giving scope "1 of 2 accounts".
  - **Session:** a session started (ACTIVE, 10 of 10 HTTP requests).
  - **Preview:** the question returned a "Preview only" draft with 60,000 → 54,000; it added nothing (0 recommendations, 0 draft members).
  - **Add:** the explicit Add created 1 unapproved draft member; holdings stayed 60,000 / 30,000 / 10,000 / 400,000.
  - **Stop:** the counters read 2 of 3 runs and 6 of 10 requests; Stop showed STOPPED.
- **Local-connection safeguards** (POST `{"action":"start"}` to `/api/copilot/live-session`):

  | Request | Result |
  | --- | --- |
  | Unpaired, same origin | 401 `not_paired` |
  | Cross-site Origin | 403 `not_local` |
  | No Origin on a write | 403 `not_local` |
  | Non-local Host | 403 `not_local` |
  | `X-Forwarded-For` from a non-loopback address | 403 `not_local` |
  | Paired browser, no CSRF header | 403 `bad_csrf` |
  | Paired browser, wrong CSRF header | 403 `bad_csrf` |
  | Wrong pairing token | 403 |
  | Pairing link reused | 403 |
  | Public-mode server (no local live configuration) | 503 `live_unavailable` |

  The local server listened on 127.0.0.1 only and was not reachable at the machine's LAN address.
- **Not done:** no production check (that follows a merge); no load or proxy test of the framing advisory; Chrome only.
