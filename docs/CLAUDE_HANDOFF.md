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
  - **D5 usability slice on PR #82 (29 October 2026):** the owner-approved proposal-flow simplification. A bounded D5 slice, **not D5 completion**. Impact note: [PR #82 comment](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/pull/82#issuecomment-6506681351). Presentation only: store/backup v10, engines, context/staleness checks, acceptance safeguards, tools, agent prompt, model, effort, fallback and spend controls are unchanged.
    - **Copilot beside the desk:** "Ask Copilot" opens a panel (a column at ≥1280px, a full-height panel below) built on `CopilotWorkspace` and `copilotRequest`, shared with the standalone page. Opening runs nothing. It shows the active alternative and the account scope.
    - **Preview state:** "Preview only — nothing added." with Add to working draft and Discard beside it; afterwards "Added to working draft — awaiting approval." with a link that highlights the action on Recommendations. Scripted demo and test-provider answers no longer say "saved" before acceptance; live answers aren't rewritten. Figure warnings and blocking reasons stay visible; the trace and IDs are behind Details.
    - **Desk:** "Draft changes (n)" and "Approved changes (m)" (`deskViewCounts`), highlighted dollar changes, and a scope summary (count and names) with a collapsed account editor. **Recommendations:** "Current draft (n)" and "All recommendations (m)" (`draftMembership`), with notes for recommendations, approvals and unresolved items outside the draft.
    - **Evidence:** `tests/proposalFlow.test.ts` (9 tests). Local final checks: typecheck clean, 576 passed and 0 skipped (35 files, private fixture present), eval 2/2, build. Browser, with the test provider (not a model) on `flow.localhost:3107` and the synthetic seed: scope → preview → discard → preview → add → Draft/Approved compare (saved workspace byte-identical) → reload → repeat (no duplicate) → highlighted on Recommendations. Also a stale refusal after a scope change, keyboard operation (open, ask, Escape, view switching) and 375px and 1440px viewports. No usability study and no real-model validation.
    - **Separate:** the owner completed a free-provider smoke before this slice (owner-reported; not repeated or re-recorded here).
    - **Cleanup:** the task server is stopped, the test origins' storage cleared, and `.claude/launch.json` restored (sha256 `7b4ae74b…`). The owner's `127.0.0.1:3210` server was left alone.
  - **Checkpoint (29 October 2026):** PR #82 is open, unmerged and not deployed. CI [run 40945699075](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/actions/runs/40945699075) passed on code head `97b65e3`: 574 passed and 2 private-PDF skips (576 total), extraction eval 2/2; build and Vercel passed.
  - **Usability review-fix (10 November 2026):** the four Codex UX findings, fixed together on PR #82. Each was reproduced first in `tests/proposalFlowUi.test.ts`, which server-renders the real pages and components against the real store (via the test-only `tests/support/liveStore.ts`; no new framework).
    1. **Saved record:** after New recommendation → Save, the record stays visible in whichever view is open, highlighted "Just saved", scrolled to and focused. A notice says where it is (in the draft, another alternative or none) and whether it's approved. Its membership and approval are unchanged. `?saved=` keeps the reveal across a reload; changing the view clears it.
    2. **Added message:** `draftNow` reads where each added action is now (in the draft, another alternative, no draft, rejected or deleted). "Added to working draft — awaiting approval" appears only while that's true; otherwise "Added from this answer earlier — it has changed since" plus a per-action status. Nothing is ever re-added or re-approved.
    3. **Desk link:** inside the desk panel it's a "Show it on the allocation desk" action that closes the panel and focuses the highlighted row. The standalone page links to `/allocation-desk?focus=…`, which the desk honours.
    4. **Modal panel:** below 80rem (Tailwind xl) the panel is a dialog: `aria-modal`, the rest of the page inert, Tab and Shift+Tab wrapping, page scroll locked, Escape or the backdrop closing it and focus returning to "Ask Copilot". At 80rem and above it is a nonmodal column. Both modes are one element tree, so resizing keeps the answer and isolation is added or removed cleanly. Focus moves only after the panel has closed (while it is open the page is inert); a desk reveal focuses the action, not the opener.
    - **Found while testing:** at 375px the open scope editor overflowed horizontally (a fieldset's min-content width). Fixed with `min-w-0` and `grid-cols-1`.
    - **Evidence:** local typecheck clean; 583 passed, 0 skipped (36 files, private fixture present); eval 2/2; build.
    - **Browser:** test provider (not a model) on `flow.localhost:3107`, synthetic seed. Checked:
      - wide: nonmodal column → preview → discard → add → untick and re-tick the action on the desk with Copilot open (the message follows) → desk reveal;
      - narrow: dialog semantics and isolation → Tab ×7 and Shift+Tab wrap in both directions → Escape returns focus → reopen → add → resize narrow → wide → narrow (answer kept, isolation removed and restored) → desk reveal;
      - Recommendations: save and reveal, reload, view change;
      - desk: `?focus=` arrival, Draft/Approved comparison (byte-identical), and a repeated request after reload adding no duplicate.

      No console errors. Not a usability study; not a real-model test.
    - **Limitation noted, not fixed (pre-existing):** the recommendation editor's Title field has no accessible name.
    - **Cleanup:** task server stopped; test origins' storage cleared; `.claude/launch.json` restored (sha256 `7b4ae74b…`); the owner's `127.0.0.1:3210` server left alone.
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
  - **Checkpoint (10 November 2026):** the provider-bound session and unknown-usage fixes are pushed at runtime head `d45dae1` and **await independent Codex review**.
    - **Local:** typecheck clean; 628 passed, 0 skipped (private fixture present); extraction eval 2/2; build passed.
    - **CI on `d45dae1`:** "Typecheck, test, build" passed ([run 42856385853](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/actions/runs/42856385853)), and Vercel passed. The CI test counts weren't read.
    - **Rehearsal:** fake-provider server only. The fake-to-Anthropic switch was tested with injected providers, not on a real Anthropic-configured server.
    - **Not done:** no real session armed, no paid call, no merge, no production deployment. **Paid testing remains unapproved.**
  - **Required before any paid testing: the pilot-runner accounting gap.** The command-line evaluation wrapper (`budgetedClient` in `src/copilot/eval/budget.ts`) still treats missing usage as a known USD 0. It must:
    - reuse the validated usage rules (`pricedUsage`);
    - keep a conservative reservation when usage is unknown;
    - report the condition clearly.

    Valid zero usage must stay valid.
  - **Next action:** the "Next command: review, pilot accounting fix, then approval" section in [CLAUDE_COMMANDS.md](roadmap/CLAUDE_COMMANDS.md#next-command-review-pilot-accounting-fix-then-approval). Reconciling PR #80's security plan, the zod fix and D5 copy cleanup come later.
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
