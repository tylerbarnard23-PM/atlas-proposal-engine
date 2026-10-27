# Handoff

## Current routing — 27 October 2026

- D2a is released: PR #79 merged as `c0ee4e95119e8b8879ff3a68b4201aefa824b832`; main CI and synthetic production smoke are recorded in [the release comment](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/pull/79).
- **Next implementation: D3**, then D4 and D5. The newly approved [D5 secrets/exposure review and report-only prompt](roadmap/D5_SECRETS_EXPOSURE_REVIEW.md) is a publication check, not an immediate detour. It is planned/unperformed; #59's real-client gate remains unchanged. Escalate exposed usable credentials immediately at any stage.

## D2 / D2a contract checkpoint

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
- **Licensing:** PR #77 (merged `7e1c1c4`) added the historical MIT notice, the corrected README and a rights-verification checklist ([LICENSING.md](../LICENSING.md), [status](LICENSING_STATUS.md)). It makes no legal-clearance claim; the checklist is still open.
- **Development models:** Sonnet 5.5 for routine work; Opus 5.5 at High effort for financial/domain, migration and security decisions. This is development guidance only, never Atlas's runtime model or API settings.
- **D2a released: PR #79** (`feat/d2a-model-manager-proposals`, built from main `9c99d63`, merged as `c0ee4e9`). The contract-impact note and decisions are on [#73](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/73#issuecomment-6417742543).
  - **Library:** append-only `strategies` and `models`, each identified by `(id, revision)` and immutable. `WorkingDraft.model` pins one revision and never follows a newer one; an asset-class model sets targets.
  - **Sleeves:** proposed-only destinations with `destination.strategy` pinned (asset class `custom`, balance only). A plan's funded purchases are one D2 linked unit from the designated cash, applied whole or blocked.
  - **Minimums:** a known minimum is enforced in the engine. An unsupplied minimum blocks the new readiness check `strategy_terms` until the advisor records a review.
  - **Views:** look-through exposure keeps unknown mixes unknown; fees are listed by component and never summed.
  - **Persistence:** store and backup v9, with strict v8/v7/v6 upgrades.
  - **Evidence:** in the PR.
  - **Review fixes, round 1 (after `d1c530d`; see the PR for the exact head):**
    - Sleeve amounts and minimums are compared in the sleeve's own currency, using the evaluator's `DeskPosition.proposedNative`. Preview cash is labelled in the reporting currency.
    - A pending plan preview is bound to its alternative, model revision, account and amounts (`pendingPlanKey`), is recomputed from current inputs, and is set aside when stale. Revision forms are keyed per definition.
    - Minimum reviews live in a pin-independent "Sleeve actions" list (`sleeveRows`) covering this alternative's and every approved sleeve.
    - Purchase-only units are called "Linked purchase", not "Linked replacement".
  - **Review fixes, round 2 (after `5d926f2`; see the PR for the exact head):** sleeve rows read the shared evaluator's result for the alternative that owns each action (the page's per-alternative draft results; the approved result only for approved actions in no alternative), never the page's Draft/Approved view, because destination IDs are shared. Purchases keep their own currency, the minimum is assessed only against the funded commitment, and left-out actions show their reason.
- **Next:** D3 (review once, present consistently), which captures the D2a revisions, sleeves and exposure coverage. Merge any new implementation only on the owner's pinned approval.
- **D2a scope:** versioned model targets and funded manager/strategy sleeves, with known minimums and fees and explicit unknown exposures. Sleeves are funded through D2's eligible cash, reserves (in their stated currency) and atomic units. This is proposal design, not UMA operations or execution.
- **Open follow-up:** #76 (a reserve breach caused by a legacy action can leave out and blame a cash-adding replacement). It is not part of D2a.
- **Limitations carried forward:**
  - replacements stay within one account and its cash currency;
  - alternatives can't be deleted;
  - there is no reserve conversion helper;
  - the comparison has no history;
  - approved snapshots and presentation are D3;
  - D2a: no manager feeds or verified offerings, no automatic sales to fund a plan, no fee aggregation, no nested models, and library entries can't be deleted; sleeves show as Other / unclassified in the existing grid and PDF.

  All 25 R-plans remain Planned or partial; no scope issue closes.
- **Preserved:** accepted values, FX and source dates, every readiness and final-PDF gate, legacy recommendation effects, #59 privacy, backup and agent requirements.

## Licensing documentation correction — 26 October 2026

See [LICENSING.md](../LICENSING.md) and [rights-verification status](LICENSING_STATUS.md). Current blanket open-source wording is removed; historical MIT evidence/grants and third-party rights are preserved. Ownership/exclusivity verification remains open and requires qualified review; keep private supporting documents outside Git. No application behavior or delivery sequencing changed.

## Working agreements

- One active implementation branch/coherent task. Preserve other files, the stash and existing work; do not reset or clean. If the previous R11 command already created work, reconcile/reuse it.
- Current holdings are observed data. Draft actions, approval and prose inclusion are distinct. Use one shared evaluator; preserve source/currency/date, FX, funding, incomplete-import, missing-value, link/currency-review and approval gates.
- Trace the minimum contract before changing it (impact note first: [checklist](CONTRACT_IMPACT_CHECKLIST.md)); test financial/state examples first. Iterate with focused checks, self-review and fix blockers together, then run the required final typecheck/full tests/eval/build and relevant browser/PDF checks. Keep baseline assertions; no recapture to hide regressions. CI remains enabled.
- Include plan/checkpoint docs in the feature PR. Stop for Codex review; merge/deploy only when owner-authorized and pinned to the reviewed head. Record releases on the PR/issue, not a new release-only docs PR.
- Public mode stays scripted/synthetic, with no live API key or real client information. Follow [PII_PROTECTION.md](roadmap/PII_PROTECTION.md) / #59 and [AGENT_EVALUATION.md](roadmap/AGENT_EVALUATION.md). Paid live evaluations need an explicit budget. No provider/model/spend/name decision is implied by routine coding authority.
- Preserve browser data before opening Atlas for mutation tests; restore exactly, keep test data synthetic/private and stop task-owned servers. Third-party PDFs stay out of git; the private UBS fixture remains ignored and its two tests may skip in CI.

## Context budget and history

Keep this file to the latest checkpoint, rules and next command (roughly 100 lines or fewer). Move superseded notes to a same-directory history file when needed rather than appending every release forever. The complete previous handoff is preserved in [CLAUDE_HANDOFF_HISTORY_2026-10-24.md](CLAUDE_HANDOFF_HISTORY_2026-10-24.md); do not load it automatically.

For the next package (D3) read its section in [the delivery plan](roadmap/DEMO_DELIVERY_PLAN.md), the relevant snapshot/presentation contracts and [the delivered D2a contracts](roadmap/MODEL_AND_MANAGER_PROPOSALS.md), [the command playbook](roadmap/CLAUDE_COMMANDS.md), the shared implementation rules and only the needed plan/code contracts. Start from [CLAUDE.md](../CLAUDE.md); for financial or persisted-state changes use the [contract impact checklist](CONTRACT_IMPACT_CHECKLIST.md). All 25 plans remain linked from [ROADMAP.md](../ROADMAP.md), not prerequisites to read in full each session.
