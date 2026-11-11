# Handoff

## Current checkpoint — 28 October 2026: D3 released; D4 in progress

- **D3 released:** PR #81 merged pinned to the reviewed head `316cbb7e6c3ddc0d9ece7d4a8495bb83ec05943c` as **`85b3910bb9645c0c8f822755788bc11d96362a7d`** (28 October 2026, 14:14 UTC).
  - Main CI [run 40703946856](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/actions/runs/40703946856) passed: 510 passed, 2 private-PDF skips, eval 2/2, build.
  - GitHub records Production deployment 7387798168 for `85b3910` (success).
  - The synthetic production smoke passed; it is recorded on [PR #81](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/pull/81#issuecomment-6471553112) and [#52](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/52#issuecomment-6471553950):
    - Scope: a USD 100,000 investment scope with an EUR 10,000 fund and a USD 50,000 mortgage as context. The meeting view and PDF showed $100.0K denominators and the labelled context table.
    - Coverage: an ordinary new ETF with unknown terms reduced fee/income coverage (56%, 1 of 2 holdings) instead of disappearing.
    - Isolation: a later holding edit left v1 and its meeting view unchanged ("changed since: holdings").
    - Issuing: the real "Issue final PDF" button produced a 277 KB PDF, captured in memory, with a succeeded history record linked to v1.
    - Refusals: an altered snapshot got 422, and a stale-rate final got 422 while its draft copy got 200.
    - The saved production browser workspace was restored byte-identical.
  - Smoke limitations:
    - The button's own blob wasn't read page by page; the pages were read from a route replay of the same version.
    - The stale-rate case used a locally built, validly fingerprinted copy, because the server clock can't be aged.
    - The scenario was loaded through the Settings restore control.
- **Delivered contracts to build on (store/backup v10):**
  - Scope, alternatives and the shared desk evaluator (D1/D2).
  - Versioned models and strategy sleeves (D2a).
  - Append-only approved versions (`snapshots`) with fingerprints, one template for the meeting view and PDF, and server re-gating of final issuance (D3).
  - Scoped presentation, with household context outside every denominator.
  - Cost/income coverage over supplied data, with sleeves identified by strategy reference.
  - Superseded detail is in [CLAUDE_HANDOFF_HISTORY_2026-10-28.md](CLAUDE_HANDOFF_HISTORY_2026-10-28.md).
- **D4 in review: PR #82** (`feat/d4-contextual-agent`, from `85b3910`; contract-impact note on [#54](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/54#issuecomment-6471919494)). Not merged or deployed.
  - **Context:** `src/copilot/context.ts` (`inputRevision`). The route returns 409 `stale_context`, and `acceptAgentDrafts` re-checks the revision, is idempotent and adds unapproved members only.
  - **Tools:** `get_scope_overview` and `simulate_scope_change` (shared desk evaluator). A sized draft must be a draftable simulation. Simulations fail closed on scope, cash, missing values or FX, imports, blocked units, shortfalls, reserve breaches and duplicates.
  - **Loop:** `runAgent` with an injectable `MessagesClient`, bounds, explicit statuses, figure checks (`evidence.ts`), and labelled demo, test (`COPILOT_MODE=test`) and live modes. The model, effort and fallback are unchanged.
  - **Status (28 October 2026):** D4 is implemented in PR #82 and awaiting Codex review. It is unmerged and not deployed to production. Of D5, only the bounded usability slice below is done.
  - **Local validation at `20223e4`:** typecheck clean; 539 tests passed; extraction eval 2/2; build passed.
  - **CI:** CI run 40712229577 and Vercel passed on `20223e4`. The CI test counts weren't read and aren't inferred from the local count.
  - **Browser evidence** used the deterministic test provider, not a real model.
  - **Live evaluation and real-model browser testing are unperformed.** The proposed budget in AGENT_EVALUATION.md is **not approved**; its pricing, spending safeguards and evaluation design still need review.
  - **Cleanup:** task servers are stopped (ports 3107, 3108 and 3199 free), and the temporary seeds, tests and `public/` files are removed. `.claude/launch.json` is restored to its original entries. Saved browser workspaces and `stash@{0}` are preserved.
  - **D4 review rounds 1–3 (29 October 2026):** 11 + 4 + 1 confirmed defects, each reproduced first (`tests/agentReview*.test.ts`) and fixed on PR #82; details in [the history file](CLAUDE_HANDOFF_HISTORY_2026-10-28.md#d4-review-rounds-29-october-2026) and the PR. Runtime model and fallback configuration unchanged.
  - **D5 usability slice and its review-fix on PR #82 (29 October and 10 November 2026):** the owner-approved proposal-flow simplification (Copilot beside the desk, preview then explicit add, Draft/Approved views) and the four Codex UX findings fixed on it. A bounded D5 slice, **not D5 completion**. Presentation only. Last passing CI before the session work: [run 40945699075](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/actions/runs/40945699075) on `97b65e3`. Details: [history](CLAUDE_HANDOFF_HISTORY_2026-10-28.md#d5-usability-slice-and-review-fix-moved-11-november-2026).
  - **Live-evaluation pilot prepared (10 November 2026), NOT approved:** `valued_concentration` × 1 trial, at most 10 requests, a USD 5 estimate-based spending guard, and the runtime unchanged at reviewed code head `0c062d1`. The approval package is in [AGENT_EVALUATION.md](roadmap/AGENT_EVALUATION.md#proposed-pilot-one-case-one-trial--not-approved-owner-decision-pending): prices re-checked against the official docs, runner behaviour, cost estimate, the guard's limits, pass/fail criteria, stop conditions and the owner's PowerShell commands. No API call has been made.
    - **Estimate:** about USD 0.30–0.45 expected, about USD 1.35 at a plausible high. The guard refuses a request once recorded spend passes about USD 2.29; the 10-request limit is expected to bind first.
    - **Limits:** USD 5 is not a billing ceiling. The fallback model for Opus 5.5 is unpublished (priced at the $15 / $75 ceiling). The answer's wording can't be reviewed, because the runner keeps no answer text. A pilot pass replaces neither the full 27-trial suite nor the real-model browser check.
  - **Local live-testing session gate (10 November 2026):** every live browser request now passes one server-enforced session:
    - **Limits:** 30 minutes, 3 runs, 10 HTTP requests (retries included), one run at a time, the 100-second deadline, a USD 5 estimate-based guard (not a billing ceiling), and Stop.
    - **Arming and claiming:** armed only in a local terminal (`npm run live-session -- arm --provider anthropic|fake`, bound to that provider) and claimed by one browser with a one-time link.
    - **Fails closed:** on hosted deployments, base-URL overrides and non-local or cross-origin requests.
    - **Where:** `src/copilot/liveGate.ts`, `liveSessionStore.ts`, `routeHandler.ts`; the details and the owner setup are in [AGENT_EVALUATION.md](roadmap/AGENT_EVALUATION.md#local-live-testing-session-interactive--not-armed-paid-use-not-approved). The unused ungated `runLiveCopilot` was removed.
    - **Evidence:** fake providers only — `tests/liveSession.test.ts` (26 tests), 609 passed / 0 skipped locally, eval 2/2, build, and a fake-provider browser journey on `flow.localhost:3107`.
    - **Not armed for real; paid interactive testing NOT approved.** After any failed request the kept reservation (about USD 2.71) makes the guard refuse further requests in that session, by design.
  - **Codex review fixes to the session gate (10 November 2026):**
    1. **Provider binding:** arming needs `--provider anthropic|fake`, and the session is usable only while the server runs that provider. A fake session can never become paid. Older (version 1) records are refused until re-armed.
    2. **Usage validation:** usage counts as known only with complete accounting (`pricedUsage`); otherwise the reservation is kept and the run ends with the reason. Explicit zeros stay valid.

    **Evidence:** 19 regressions (16 failed first), 628 passed / 0 skipped locally, eval 2/2, build, and a fake-server rehearsal of the arming and refusal paths. **Reported, not changed:** the pilot runner's `budgetedClient` still prices missing usage as USD 0.
  - **Checkpoint (10 November 2026):** the provider-bound session and unknown-usage fixes were pushed at runtime head `d45dae1` for independent Codex review (since completed; see below).
    - **Local:** typecheck clean; 628 passed, 0 skipped (private fixture present); extraction eval 2/2; build passed.
    - **CI on `d45dae1`:** "Typecheck, test, build" passed ([run 42856385853](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/actions/runs/42856385853)), and Vercel passed. The CI test counts weren't read.
    - **Rehearsal:** fake-provider server only. The fake-to-Anthropic switch was tested with injected providers, not on a real Anthropic-configured server.
    - **Not done:** no real session armed, no paid call, no merge, no production deployment. **Paid testing remains unapproved.**
  - **Pilot-runner accounting fixed (10 November 2026; since reviewed, see below):** `budgetedClient` (`src/copilot/eval/budget.ts`) reserves each request's worst case before sending and settles to priced usage only with complete accounting (`pricedUsage`). Missing or invalid usage, an error, a timeout or a cancellation keeps the reservation. The runner (`runner.ts`) then ends the evaluation after that trial and fails the verdict ("Accounting incomplete …"). The report is still written. Valid zero usage settles as USD 0. Details: [AGENT_EVALUATION.md](roadmap/AGENT_EVALUATION.md) ("Pilot accounting").
    - **Evidence:** `tests/pilotAccounting.test.ts`, 22 tests, 21 of which failed before the fix (the 22nd, "no double counting", passed because the old wrapper never reserved). Fake providers only. Local final checks: typecheck clean; 650 passed, 0 skipped (38 files, private fixture present); eval 2/2; build passed. No browser check: nothing visible changed.
    - **Not changed:** runtime model, effort, prompt, tools, fallback, the loop's retries, the engines, the session gate and store/backup v10. Each trial's `usage` field is still the loop's own token tally; the cost is `spend`.
  - **Review complete (11 November 2026):** the joint Codex review of the session fixes and the pilot accounting at runtime head `538a8fc` finished with no new blocking findings (owner-reported). CI on `538a8fc` passed: 648 passed and 2 private-PDF skips, extraction eval 2/2, typecheck and build; Vercel passed (owner-reported).
  - **Paid testing:** the previous paid-pilot approval was withdrawn. **No paid testing is currently authorized**, and no real-Claude verification has occurred.
  - **Local Claude onboarding, Route 1, implemented (11 November 2026); awaiting Codex review.** The owner chose the existing API integration with a user-owned Console key. Guide and security design: [LOCAL_CLAUDE_SETUP.md](roadmap/LOCAL_CLAUDE_SETUP.md). Impact note and design, posted before coding: [PR #82 comment](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/pull/82#issuecomment-6799730283).
    - **Launcher and doctor:** `npm run local` (binds 127.0.0.1, uses the next free port, opens a one-time pairing link), `npm run local:pair`, `npm run local:doctor` (`scripts/atlas-local.mjs`).
    - **Pairing** (`localPairing.ts`): a one-time token becomes an HttpOnly cookie. Every credential change and session start needs the cookie, a CSRF header and the local same-origin checks (`localConnect.ts`).
    - **Key:** pasted under Connect Claude (`ConnectClaude.tsx`, shared by the page and the desk panel). Kept in server memory or the OS credential store (`credentialStore.ts`, optional dependency `@napi-rs/keyring`); never a plaintext file. The environment key is used only when selected. Saving makes no provider request ("saved, not yet verified").
    - **Sessions:** started in Atlas after confirming the allowance; the old limits are ceilings that can only be lowered. Record version 3 binds a session to its provider and credential revision; Replace and Disconnect stop it.
    - **Unchanged:** agent loop, prompt, tools, model, effort, fallback, engines, acceptance (unapproved drafts only) and store/backup v10.
    - **Evidence:** `tests/localConnect.test.ts` (34) and `tests/liveSession.test.ts` (45, seven updated for the new contract). Local final checks: typecheck clean; 684 passed, 0 skipped (39 files, private fixture present); eval 2/2; build passed.
    - **Browser** (fake provider, made-up keys, `connect.localhost:3107`, task-owned state folder): unpaired → pairing link → Admin key refused → key remembered in Windows Credential Manager → session started → ask → preview → add (unapproved) → reload (counters kept) → replace key (session stopped) → new lowered session in the desk panel at 375px → Stop → restart ("key needed again") → Disconnect. Refusals also checked over real HTTP.
    - **Not done:** no real key, no request to Anthropic, no real-Claude verification. macOS and Linux credential stores were not exercised.
    - **Cleanup:** task server stopped, state folder and the dummy OS entry removed, test origin's storage cleared, `.claude/launch.json` restored (sha256 `7b4ae74b…`). The owner's `127.0.0.1:3210` server was left alone.
  - **Pending owner decisions:** approval of a real-Claude verification (one key, one session, synthetic data) after review; data scope beyond sample data. No question has been put to Anthropic, and none is planned for Route 1.
  - **Next action:** the "Next command: review the local Claude onboarding" section in [CLAUDE_COMMANDS.md](roadmap/CLAUDE_COMMANDS.md#next-command-review-the-local-claude-onboarding). Reconciling PR #80's security plan, the zod fix and D5 copy cleanup come later.
- **Preserve:** PR #80 (the D5 secrets/exposure plan) is open; keep its work when reconciling docs, and don't merge it as part of D4.
- **Open follow-ups:** #76 (reserve-breach attribution for legacy actions), unchanged. **Zod audit warning:** `npm audit` reports GHSA-mrhx-c7xc-m3w5 (high) for zod <4.6.6, and its only offered fix is a breaking upgrade (`--force` installs zod 4.6.7). It needs a separate, tested dependency change; don't run `npm audit fix --force`.
- **Limitations carried forward:**
  - Replacements stay within one account and its cash currency; alternatives and library entries can't be deleted; there is no reserve conversion helper.
  - D2a has no manager feeds, verified offerings, automatic funding sales, fee aggregation or nested models.
  - D3 versions are local application records, not tamper-proof books and records. There is no remote sharing, client acknowledgement or signature.
  - Readiness labels, but doesn't refuse, an approved action outside a version's scope.

  All 25 R-plans remain Planned or partial; no scope issue closes.
- **Preserved:** accepted values, FX and source dates, every readiness and final-PDF gate, legacy recommendation effects, #59 privacy, backup and agent requirements.

## Working agreements

- One active implementation branch/coherent task. Preserve other files, the stash and existing work; do not reset or clean. If the previous command already created work, reconcile/reuse it.
- Current holdings are observed data. Draft actions, action approval, prose inclusion and version approval are distinct. Use one shared evaluator; preserve source/currency/date, FX, funding, incomplete-import, missing-value, link/currency-review and approval gates.
- Trace the minimum contract before changing it (impact note first: [checklist](CONTRACT_IMPACT_CHECKLIST.md)); test financial/state examples first. Iterate with focused checks, self-review and fix blockers together, then run the required final typecheck/full tests/eval/build and relevant browser/PDF checks. Keep baseline assertions; no recapture to hide regressions. CI remains enabled.
- Include plan/checkpoint docs in the feature PR. Stop for Codex review; merge/deploy only when owner-authorized and pinned to the reviewed head. Record releases on the PR/issue, not a new release-only docs PR.
- Public mode stays scripted/synthetic, with no live API key or real client information. Follow [PII_PROTECTION.md](roadmap/PII_PROTECTION.md) / #59 and [AGENT_EVALUATION.md](roadmap/AGENT_EVALUATION.md). Paid live evaluations need an explicit budget. No provider/model/spend/name decision is implied by routine coding authority.
- Preserve browser data before opening Atlas for mutation tests; restore exactly, keep test data synthetic/private and stop task-owned servers. Third-party PDFs stay out of git; the private UBS fixture remains ignored and its two tests may skip in CI.
- Development models: Sonnet 5.5 for routine work; Opus 5.5 at High effort for financial/domain, migration and security decisions. Development guidance only, never Atlas's runtime model or API settings.

## Context budget and history

Keep this file to the latest checkpoint, rules and next command (roughly 100 lines or fewer). Move superseded notes to a same-directory history file when needed rather than appending every release forever. Earlier checkpoints are preserved in [CLAUDE_HANDOFF_HISTORY_2026-10-24.md](CLAUDE_HANDOFF_HISTORY_2026-10-24.md) and [CLAUDE_HANDOFF_HISTORY_2026-10-28.md](CLAUDE_HANDOFF_HISTORY_2026-10-28.md); the D2 release record is on [PR #75](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/pull/75) and the licensing correction in [LICENSING.md](../LICENSING.md). Do not load them automatically.

For the next package read [the delivery plan](roadmap/DEMO_DELIVERY_PLAN.md), [the command playbook](roadmap/CLAUDE_COMMANDS.md), the shared implementation rules and only the needed plan/code contracts. Start from [CLAUDE.md](../CLAUDE.md); for financial or persisted-state changes use the [contract impact checklist](CONTRACT_IMPACT_CHECKLIST.md). All 25 plans remain linked from [ROADMAP.md](../ROADMAP.md), not prerequisites to read in full each session.
