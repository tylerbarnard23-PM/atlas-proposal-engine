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
  - **Open: four Codex UX findings on the usability slice, to fix together next session** (not implemented yet):
    1. **Hidden new record.** New recommendation → Save from the Current draft view creates a record that the filter immediately hides. Reveal and highlight the saved record and say where it was saved, without changing its membership or approval.
    2. **Outdated "Added" message.** Copilot still says "Added to working draft" after the action has left that draft. Reconcile the message with actual membership, status and owning alternative, and tell "was added" apart from "is in the draft now". Never re-add or re-approve anything automatically.
    3. **Same-page link.** "See it in the allocation desk" is a same-page hash link that leaves the narrow overlay open. Close the overlay and reveal and focus the action; keep normal navigation from the standalone page.
    4. **Modal semantics.** The narrow panel needs modal semantics, Tab/Shift+Tab containment, isolation of the page behind it and correct focus restoration. The wide side column stays nonmodal. Cover cleanup when resizing between the two modes.
  - **Next session:** run the "D4/D5 usability review-fix" command in [CLAUDE_COMMANDS.md](roadmap/CLAUDE_COMMANDS.md#next-command-d4d5-usability-review-fix), then stop for Codex review. The live-evaluation budget is still not approved, and reconciling PR #80's security plan comes later.
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
