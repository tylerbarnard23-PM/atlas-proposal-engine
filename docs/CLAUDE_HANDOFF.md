# Handoff

## Current checkpoint — 24 October 2026: D1 allocation desk in review (PR #72)

- **Read next:** [DEMO_DELIVERY_PLAN.md](roadmap/DEMO_DELIVERY_PLAN.md) and [CLAUDE_COMMANDS.md](roadmap/CLAUDE_COMMANDS.md). D1 is implemented and awaits Codex review; D2 (funded alternatives) follows only after D1's owner-authorized release.
- **PR #72** on `feat/d1-allocation-desk`, built from main `bc248e1ea2eb72a405167a3424422624aaa7de3c` (PRs #70 and #71 merged). The implementation commit is `ee55b96`; the docs commit follows (see the PR for the exact head). Not merged or deployed.
  - **Delivered:** `/allocation-desk` with selected-account scope (context assets and liabilities out of the denominator), current/proposed/target grid with drift and actual cash, one working draft (members separate from approval and PDF prose; draft vs approved-subset preview), explicit position edits through `previewRecommendation`/`applyRecommendationsToProposed`, and a recorded input basis with change detection.
  - **State:** store v7 and backup workspace v7 add `workingDraft`. The idempotent migration and the strict v6-backup upgrade make approved recommendations the members, so previews are unchanged. Legacy implicit sizes keep their effect, but a new approval needs an explicit amount.
  - **Not in D1:** new destinations, automatic trades, scenario duplication and reserve enforcement (D2). Cash lines take no edit.
- **Heads:** the implementation is `ee55b96`. The tested head `ff750941ae8eb80fc1323c3d22f47b9cc1c258b3` includes the docs. Any later commit is a docs-only checkpoint that won't have finished CI yet.
- **Validation:**
  - **Local (`ff75094`):** typecheck passed; 25 files, **420 passed, 0 skipped** (the private UBS PDF is present locally); eval 2 of 2; build passed.
  - **CI (run 40103554615 on `ff75094`):** **418 passed, 2 skipped (420)**, where the 2 need the private PDF; eval 2 of 2; build passed. The Vercel preview for `ff75094` is ready.
- **Browser check:**
  - The real saved v6 workspace on localhost:3001 migrated to v7 with draft and approved previews identical.
  - The acceptance story passed: 60/30/10 → targets with no trades → a 10,000 reduction previewed as 50/30/20 with cash 20,000 → the state survived a reload.
  - The legacy Approve gate showed correctly.
  - The workspace was restored byte-identical (v6, 200,907 bytes) and the task server stopped.
- **Limitations:**
  - The seed's `rec_reduce_aapl` and `rec_pay_mortgage` need explicit amounts before a new approval.
  - Existing actions are edited on Recommendations, not on the desk.
  - At narrow widths the grid scrolls sideways.
  - Reserves, new destinations, automatic trades and alternatives are D2.
- **Next step:** Codex reviews PR #72 before any owner-authorized merge. D2 has not started.
- **Preserved:** accepted values/FX/source dates, readiness and final-PDF gates (they still use approved actions), funding/import/approval protections, v6 compatibility, #59 and agent requirements. All 25 IDs remain Planned; D1 is a minimum slice.
- **Before this:** PR #70 (`8b06b6a`, review wording/identifier score) and PR #71 (`bc248e1`, demo-first plan) merged on 24 October 2026; main CI passed 402/2 skipped (404). Older history: [CLAUDE_HANDOFF_HISTORY_2026-10-24.md](CLAUDE_HANDOFF_HISTORY_2026-10-24.md).

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
