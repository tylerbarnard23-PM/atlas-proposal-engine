# Handoff

## Current checkpoint — 24 October 2026: D1 released; D2 funded alternatives in review (PR #75)

- **D1 released:** PR #72 was Codex-reviewed at `d6df4cf` and merged pinned as **`0381db13a69b1b62d65019b89fc5d6da47e1b420`**. Main CI run 40136036212 passed: 427 passed, 2 skipped (429). GitHub records a Production deployment for `0381db1`. Production smoke and backup-cycle evidence is on [PR #72](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/pull/72#issuecomment-6390031556) and [#36](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/36#issuecomment-6390031724).
- **PR #75** on `feat/d2-funded-alternatives`, built from main `0381db1`. The implementation commit is `55b83e0`; the docs commit follows (see the PR for the exact head). Not merged or deployed. The contract notes are in the PR.
  - **Engine:** proposed-only investments (`Recommendation.destination`) and linked replacements (`Recommendation.linked`) apply as units, whole or not at all. Anything left out goes to `ProposedPortfolio.blocked` with its reason. `Account.funding` sets the eligible cash and reserve, and `reserveStatus` reports headroom (unknown is never spendable). Legacy actions and household paydown are unchanged.
  - **Readiness:** new checks `funding_reserves` and `approved_alternative`. The final-PDF route receives the alternatives.
  - **State:** store/backup v8 add `alternatives`, account funding and the new action fields. The migration is idempotent, and v7/v6 backups are validated strictly as their own version, then upgraded.
  - **Desk:** duplicate, rename and switch alternatives (isolated, approvals cleared); funding rows; a replace-into-new-investment edit; units left out; and the alternatives comparison.
- **Heads:** the implementation is `55b83e0`. The tested head `dc1be24c3007185cf0ce87d9bfbbda67be9718a3` adds the docs and the "In <alternative>" label fix. Any later commit is a docs-only checkpoint that won't have finished CI yet.
- **Validation:**
  - **Local (`dc1be24`):** typecheck passed; 26 files, **441 passed, 0 skipped**; eval 2 of 2; build passed.
  - **CI (run 40139204916 on `dc1be24`):** passed; the 2 private-PDF tests are skipped there. The Vercel preview for `dc1be24` is ready.
- **Browser check:** the synthetic story ran end to end: funding with a 10,000 reserve; 10,001 blocked whole; 50/40/10; duplicate B at 55/35/10 vs A at 50/40/10; the state survived a reload. The workspace was restored byte-identical (v6) and the task server stopped.
- **Sequencing (approved):** D2 → **D2a** (model portfolios and manager sleeves) → D3 (presentation). The D2a plan is saved separately in PR #74 (tracking issue #73), unmerged. Before implementing D2a, reconcile that branch with D2's delivered contracts (store/backup v8, `Account.funding`, `Recommendation.destination`/`linked`, `alternatives`, `funding_reserves`/`approved_alternative`), preserving both branches' documentation.
- **Limitations:**
  - Replacements stay within one account and its eligible-cash currency.
  - Alternatives can't be deleted yet.
  - There is no reserve currency other than the cash line's own.
  - The comparison has no history.
  - Approved snapshots and presentation are D3.
- **Next step:** Codex reviews PR #75 before any owner-authorized merge. D2a and D3 have not started.
- **Preserved:** accepted values/FX/source dates, all existing readiness and final-PDF gates, legacy recommendation effects, v6/v7 compatibility, #59 and agent requirements. All 25 IDs remain Planned.

## Working agreements

- One active implementation branch/coherent task. Preserve other files, the stash and existing work; do not reset or clean. If the previous R11 command already created work, reconcile/reuse it.
- Current holdings are observed data. Draft actions, approval and prose inclusion are distinct. Use one shared evaluator; preserve source/currency/date, FX, funding, incomplete-import, missing-value, link/currency-review and approval gates.
- Trace the minimum contract before changing it; test financial/state examples first. Iterate with focused checks, self-review and fix blockers together, then run the required final typecheck/full tests/eval/build and relevant browser/PDF checks. Keep baseline assertions; no recapture to hide regressions. CI remains enabled.
- Include plan/checkpoint docs in the feature PR. Stop for Codex review; merge/deploy only when owner-authorized and pinned to the reviewed head. Record releases on the PR/issue, not a new release-only docs PR.
- Public mode stays scripted/synthetic, with no live API key or real client information. Follow [PII_PROTECTION.md](roadmap/PII_PROTECTION.md) / #59 and [AGENT_EVALUATION.md](roadmap/AGENT_EVALUATION.md). Paid live evaluations need an explicit budget. No provider/model/spend/name decision is implied by routine coding authority.
- Preserve browser data before opening Atlas for mutation tests; restore exactly, keep test data synthetic/private and stop task-owned servers. Third-party PDFs stay out of git; the private UBS fixture remains ignored and its two tests may skip in CI.

## Context budget and history

Keep this file to the latest checkpoint, rules and next command (roughly 100 lines or fewer). Move superseded notes to a same-directory history file when needed rather than appending every release forever. The complete previous handoff is preserved in [CLAUDE_HANDOFF_HISTORY_2026-10-24.md](CLAUDE_HANDOFF_HISTORY_2026-10-24.md); do not load it automatically.

For the next package read [D1](roadmap/DEMO_DELIVERY_PLAN.md#d1-build-the-workbench-next), [the command playbook](roadmap/CLAUDE_COMMANDS.md#next-implementation-d1), the shared implementation rules and only the needed plan/code contracts. All 25 plans remain linked from [ROADMAP.md](../ROADMAP.md), not prerequisites to read in full each session.
