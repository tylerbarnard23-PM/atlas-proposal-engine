# Handoff

## Current checkpoint — 24 October 2026

- **D1 released:** PR #72 merged pinned to reviewed head `d6df4cf1ab69ea7d27a2c7156af4ea6c976a80f4` as `0381db13a69b1b62d65019b89fc5d6da47e1b420`. Main CI run 40136036212 passed: 427 passed, 2 private-PDF skips (429), eval 2/2 and build. Release evidence: [PR #72](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/pull/72#issuecomment-6390031556), [#36](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/36#issuecomment-6390031724).
- **Reported production evidence:** scope/targets, second-sale preview matching save, combined shortfall/cancel, reload and v7 Settings backup/restore passed. Restore field/grid checks passed; the harness lost its exact-draft comparison reference. Original browser workspace restored byte-identical. These are release records, not rerun by this docs change.
- **Next:** D2 funded alternatives at Opus 5.5 High, preserving any work already started. Then **D2a model/manager proposals** (#73), then D3 review/presentation, D4 agent evidence, D5 publication. Read [delivery plan](roadmap/DEMO_DELIVERY_PLAN.md), [command playbook](roadmap/CLAUDE_COMMANDS.md) and only the relevant contracts.
- **Approved addition:** [MODEL_AND_MANAGER_PROPOSALS.md](roadmap/MODEL_AND_MANAGER_PROPOSALS.md) defines versioned model targets and funded manager/strategy sleeves, known minimums/fees and explicit unknown exposures. This is proposal design, not UMA operations or execution. No runtime functionality is implemented by this planning change.
- **State contract:** D1 store/backup v7 with supported strict v6 upgrade; preserve current IDs, order, approvals and contradictory legacy evidence. Draft membership, approval and PDF prose are distinct. Future migrations upgrade every currently supported backup version.
- **D1 limitations:** existing actions edited on Recommendations; liabilities current-only; narrow grid scrolls; reserves/new destinations/alternatives await D2. Model/sleeve proposals await D2a. All 25 full R-plans remain Planned/partial; no scope issue closes here.

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
