# Handoff

## Current checkpoint — 25 October 2026: D2 released; D2a plan reconciled (PR #74)

- **D2 released:** PR #75 merged pinned to reviewed head `5b0f8b1082c87919542c8b67f08ac8e69f242b8c` as **`073049ff526a58b0ab14bc05a6bf640ab80c5cb8`**. Main CI run 40204437975 passed: 466 passed, 2 private-PDF skips (468), eval 2/2, build. GitHub records a successful Production deployment for `073049f`. A synthetic production smoke passed; it is recorded on [PR #75](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/pull/75) and [#36](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/36), and the browser workspace was restored byte-identical. It checked:
  - 50/40/10 for a funded replacement;
  - a 10,001 purchase left unapplied by the 10,000 reserve;
  - independent alternatives;
  - no fallback after the designated cash was removed;
  - explicit reserve restatement after a switch to EUR;
  - a final-PDF 422 on the funding gate.
- **D2 contracts to build on (store/backup v8):**
  - `Recommendation.destination` and `Recommendation.linked`: units are applied whole or listed in `ProposedPortfolio.blocked`.
  - `Account.funding = { cashHoldingId, reserve, reserveCurrency }`. The designated cash only, with no fallback; unresolved funding (`removed`, `not_cash`, `reserve_currency`) blocks spending and readiness, and v8 backups declare it in `engagement.unresolvedFunding`.
  - `alternatives` (inactive drafts) with isolated membership.
  - Readiness checks `funding_reserves` and `approved_alternative`, shared by the desk, PDF route and Copilot.
  - Removed destination accounts are declared in `unresolvedLinks[].destinationAccountId`.
  - v7/v6 backups upgrade strictly.
- **Next:** review and merge this planning PR (#74). Then implement **D2a model/manager proposals** (#73) at Opus 5.5 High from [MODEL_AND_MANAGER_PROPOSALS.md](roadmap/MODEL_AND_MANAGER_PROPOSALS.md), on the D2 contracts above, then D3 review/presentation, D4 agent evidence, D5 publication. Read the [delivery plan](roadmap/DEMO_DELIVERY_PLAN.md), the [command playbook](roadmap/CLAUDE_COMMANDS.md) and only the relevant contracts.
- **D2a scope:** versioned model targets and funded manager/strategy sleeves, with known minimums and fees and explicit unknown exposures. Sleeves are funded through D2's eligible cash, reserves (in their stated currency) and atomic units. This is proposal design, not UMA operations or execution.
- **Open follow-up:** #76 (a reserve breach caused by a legacy action can leave out and blame a cash-adding replacement). It is not part of D2a.
- **Limitations carried forward:**
  - replacements stay within one account and its cash currency;
  - alternatives can't be deleted;
  - there is no reserve conversion helper;
  - the comparison has no history;
  - approved snapshots and presentation are D3.

  All 25 R-plans remain Planned or partial; no scope issue closes.
- **Preserved:** accepted values, FX and source dates, every readiness and final-PDF gate, legacy recommendation effects, #59 privacy, backup and agent requirements.

## Working agreements

- One active implementation branch/coherent task. Preserve other files, the stash and existing work; do not reset or clean. If the previous R11 command already created work, reconcile/reuse it.
- Current holdings are observed data. Draft actions, approval and prose inclusion are distinct. Use one shared evaluator; preserve source/currency/date, FX, funding, incomplete-import, missing-value, link/currency-review and approval gates.
- Trace the minimum contract before changing it; test financial/state examples first. Iterate with focused checks, self-review and fix blockers together, then run the required final typecheck/full tests/eval/build and relevant browser/PDF checks. Keep baseline assertions; no recapture to hide regressions. CI remains enabled.
- Include plan/checkpoint docs in the feature PR. Stop for Codex review; merge/deploy only when owner-authorized and pinned to the reviewed head. Record releases on the PR/issue, not a new release-only docs PR.
- Public mode stays scripted/synthetic, with no live API key or real client information. Follow [PII_PROTECTION.md](roadmap/PII_PROTECTION.md) / #59 and [AGENT_EVALUATION.md](roadmap/AGENT_EVALUATION.md). Paid live evaluations need an explicit budget. No provider/model/spend/name decision is implied by routine coding authority.
- Preserve browser data before opening Atlas for mutation tests; restore exactly, keep test data synthetic/private and stop task-owned servers. Third-party PDFs stay out of git; the private UBS fixture remains ignored and its two tests may skip in CI.

## Context budget and history

Keep this file to the latest checkpoint, rules and next command (roughly 100 lines or fewer). Move superseded notes to a same-directory history file when needed rather than appending every release forever. The complete previous handoff is preserved in [CLAUDE_HANDOFF_HISTORY_2026-10-24.md](CLAUDE_HANDOFF_HISTORY_2026-10-24.md); do not load it automatically.

For the next package read D2 in [the delivery plan](roadmap/DEMO_DELIVERY_PLAN.md), [the command playbook](roadmap/CLAUDE_COMMANDS.md), the shared implementation rules and only the needed plan/code contracts. All 25 plans remain linked from [ROADMAP.md](../ROADMAP.md), not prerequisites to read in full each session.
