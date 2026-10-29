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
  - **Status (28 October 2026):** D4 is implemented in PR #82 and awaiting Codex review. It is unmerged and not deployed to production. D5 has not started.
  - **Local validation at `20223e4`:** typecheck clean; 539 tests passed; extraction eval 2/2; build passed.
  - **CI:** CI run 40712229577 and Vercel passed on `20223e4`. The CI test counts weren't read and aren't inferred from the local count.
  - **Browser evidence** used the deterministic test provider, not a real model.
  - **Live evaluation and real-model browser testing are unperformed.** The proposed budget in AGENT_EVALUATION.md is **not approved**; its pricing, spending safeguards and evaluation design still need review.
  - **Cleanup:** task servers are stopped (ports 3107, 3108 and 3199 free), and the temporary seeds, tests and `public/` files are removed. `.claude/launch.json` is restored to its original entries. Saved browser workspaces and `stash@{0}` are preserved.
  - **D4 review (29 October 2026):** a focused review confirmed 11 defects. Each was reproduced first in `tests/agentReview.test.ts`, then fixed together on PR #82:
    - **Untrusted figures:** figures inside holding, account and file names, notes and titles counted as engine evidence. Now they're neither evidence nor claims.
    - **Deeper reserve breach:** a purchase into an account already below its reserve was draftable.
    - **Combined effect:** simulations in a run ignored drafts already saved, and acceptance didn't check the selection together. Both now use the shared `candidateProblems` gate in `allocationDesk.ts` (store, tool and page).
    - **Stale profile:** a client-profile change didn't invalidate a pending answer.
    - **Tool crash:** an unexpected tool error crashed the run, and an unreadable workspace gave an unhandled 500 (now 422).
    - **Output limit:** the cumulative output limit could be overshot.
    - **Timeout status:** a timeout at the deadline reported a generic failure.
    - **Usage:** usage ignored the declined attempt before a fallback.
    - **Identity:** the client's name, household name and import file names reached the model inside account names, notes and the question.
    - **Spend accounting:** the guard priced fallbacks at Opus 5.5 rates and checked no fallback re-run. The docs no longer call it a hard ceiling.

    Evidence is in PR #82.
  - **D4 review round 2 (Codex findings, 29 October 2026):** four findings, reproduced first in `tests/agentReview2.test.ts` and fixed together. The eleven round-1 fixes are kept.
    1. **Live-evaluation runner** (`eval/runner.ts`):
       - unknown or empty case selections and non-integer trial counts are rejected;
       - the verdict fails on critical failures, zero coverage or interrupted coverage, and reports are written first;
       - a subset is labelled apart from the full 27-trial suite;
       - the guard's input-size estimate now carries across trials (found while testing).
    2. **Typed evidence:** currency, unit and change sign are checked, and unchecked claims are explicit in the loop, the UI and the grader.
    3. **Advisory classification:** uses the engine preview's half-cent `no_change` rule instead of a $1 threshold.
    4. **Terminal checks:** cancellation, deadline and output (fallback attempts included) are checked after every response, before success or any tool. The docs no longer claim a hard combined output ceiling.

    Runtime model and fallback configuration are unchanged.
  - **D4 review round 3 (29 October 2026):** `simulate_recommendation`'s `pct_change` is `recommendationPreview`'s `pctChange`, in percentage points (60,000 → 54,000 is -10). Evidence had classed it as a fraction, so the checker rejected -10% and accepted -1,000%. It is now a percentage.
    - Reproduced first in `tests/agentReview3.test.ts`: decrease, increase and zero change through the real preview, tool, evidence, checker, loop and grader.
    - Every other percent field was audited against its producer; all are percentage points. No tool returns a fraction today.
    - Engine, editor and PDF values are unchanged.
  - **Next session:** Codex reviews PR #82, then the owner decides whether to authorize a specific live-evaluation configuration and budget. That budget is not approved, and its safeguards changed in both review rounds.
- **Preserve:** PR #80 (the D5 secrets/exposure plan) is open; keep its work when reconciling docs, and don't merge it as part of D4.
- **Open follow-up:** #76 (reserve-breach attribution for legacy actions), unchanged.
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
