# Handoff

## Current checkpoint — 25 October 2026: D1 released; D2 funded alternatives reviewed and fixed (PR #75)

- **D1 released:** PR #72 was Codex-reviewed at `d6df4cf` and merged pinned as **`0381db13a69b1b62d65019b89fc5d6da47e1b420`**. Main CI run 40136036212 passed: 427 passed, 2 skipped (429). GitHub records a Production deployment for `0381db1`. Production smoke and backup-cycle evidence is on [PR #72](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/pull/72#issuecomment-6390031556) and [#36](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/36#issuecomment-6390031724).
- **PR #75** on `feat/d2-funded-alternatives`, built from main `0381db1`. The implementation commit is `55b83e0`; the docs commit follows (see the PR for the exact head). Not merged or deployed. The contract notes are in the PR.
  - **Engine:** proposed-only investments (`Recommendation.destination`) and linked replacements (`Recommendation.linked`) apply as units, whole or not at all. Anything left out goes to `ProposedPortfolio.blocked` with its reason. `Account.funding` sets the eligible cash and reserve, and `reserveStatus` reports headroom (unknown is never spendable). Legacy actions and household paydown are unchanged.
  - **Readiness:** new checks `funding_reserves` and `approved_alternative`. The final-PDF route receives the alternatives.
  - **State:** store/backup v8 add `alternatives`, account funding and the new action fields. The migration is idempotent, and v7/v6 backups are validated strictly as their own version, then upgraded.
  - **Desk:** duplicate, rename and switch alternatives (isolated, approvals cleared); funding rows; a replace-into-new-investment edit; units left out; and the alternatives comparison.
- **Review fixes, round 1 (`b5c3e19`):**
  - An oversized linked sale, measured against the position as it stands in the draft, is left out whole.
  - Eligible cash must still be a cash line in its account.
  - Copilot readiness receives the alternatives.
- **Review fixes, round 2 (backup consistency, `9815c55`):** Normal app actions could leave references that the export refused:
  - removing the eligible cash line;
  - reclassifying it as an investment;
  - removing a proposed investment's destination account.

  They are now declared in v8 backups, the same way removed recommendation links are:
  - `engagement.unresolvedFunding: [{ accountId, cashHoldingId, reason: "removed" | "not_cash" }]`;
  - `unresolvedLinks[].destinationAccountId`.

  Rules for these declarations:
  - Both are derived at export and checked exactly on restore. Undeclared or false declarations are still rejected, and v7/v6 files can't carry them.
  - The funding rule and reserve are kept and never pointed at other cash. Nothing is spent until the advisor chooses valid cash, and `funding_reserves` names the problem.
  - A replacement whose destination account is removed keeps its destination, loses its approval (`needs_review`) and blocks `recommendation_links`. A rejected one stays rejected and can be reopened.
  - Recovery never re-approves anything.
  - The store contract is unchanged (no migration); v8 is unreleased, so only the v8 backup schema gains the fields.
  - Regressions are in `tests/backupConsistency.test.ts` (three new normal-workflow round trips and "D2 references the app can leave unresolved").
- **Review fixes, round 3 (explicit funding, `c50188c`):**
  - An account with a funding rule now uses its designated eligible cash only. When that line is removed, reclassified or unvalued, the engine never falls back to another cash line or creates a new one.
  - Affected actions stay unapplied. Units are left out whole, and legacy actions are reported in `blocked` with a funding reason: `funding_reserves` blocks, not `fx_available`. The Recommendations preview says "can't be funded" rather than "missing rate".
  - Household loan paydown draws only on an account's valid eligible cash; accounts without rules are unchanged.
  - **Funding control:** an unresolved saved source stays selected and labelled ("Saved: … removed"), and Save can't overwrite it. "Remove funding rule" is a separate, labelled action. When the source currency is unknown, the reserve is shown without inventing one.
  - Regressions are under "an explicit funding rule never falls back" in `tests/fundedAlternatives.test.ts`.
- **Review fixes, round 4 (reserve currency):** the commit follows `c50188c` (see the PR for the exact head).
  - `Account.funding.reserveCurrency` records the currency a reserve was stated in. The store saves a rule only when that currency matches the source's basis (an approved value's currency, else its statement currency).
  - A mismatch is a new unresolved-funding reason, `reserve_currency`, declared in v8 backups like the others. It covers a source whose native or approved currency changed, and a rule with no recorded currency (from an earlier v8 build: shown as "currency unknown", never guessed). Nothing is spent, `funding_reserves` names it, and the reserve is kept and never relabelled or converted.
  - **Control:** the saved rule is shown separately from the pending source and reserve, and the input is labelled with the pending currency. A source in another currency, or an unknown one, starts with an empty reserve that must be entered before Save. Unchanged valid rules keep their values.
  - No store migration and no change to the v7/v6 upgrades: those versions have no funding rules.
  - Regressions are under "a reserve keeps its currency basis" in `tests/fundedAlternatives.test.ts`. Older tests that change a line's currency now restate the reserve, and their `setAccountFunding` calls state `reserveCurrency`.
- **Validation (round 4, local):** typecheck passed; 26 files, **468 passed, 0 skipped**; eval 2 of 2; build passed. CI runs on the pushed head; the 2 private-PDF tests are skipped there.
- **Browser check (round 4):**
  - The run used a fresh `atlas-reserve.localhost` origin, so the user's localhost workspace was never loaded.
  - Setup (synthetic): a EUR deposit was added to the brokerage in the stored seed.
  - Steps and results, all through the UI:
    - set a USD 25,000 rule;
    - switch the pending source to EUR: the reserve is empty and labelled EUR, the restatement prompt shows, Save is disabled, and the saved rule is unchanged;
    - enter EUR 20,000 and save: the rule is stored with `reserveCurrency` EUR and enforced in EUR (headroom €30,000);
    - after reload, switching back to USD asks for a USD restatement.
  - Afterwards the origin's storage was cleared and the server stopped.
- **Round 3 evidence (`c50188c`):**
  - local: 463 passed;
  - CI run 40201711359: 461 passed, 2 skipped;
  - browser: no fallback after the designated line was removed; unchanged Save; deliberate rule removal.
- **Round 2 evidence (`9815c55`):**
  - local: 456 passed;
  - CI run 40200538647: 454 passed, 2 skipped;
  - browser: export → restore → reload with removed eligible cash.
- **Round 1 browser check:** the desk refused an oversized sale. The localhost workspace was restored byte-identical (v6, hash `99aa0da7…`).
- **Earlier evidence (`dc1be24`):** CI run 40139204916; synthetic story (10,001 blocked; 50/40/10; B 55/35/10 vs A 50/40/10; reload).
- **Sequencing (approved):** D2 → **D2a** (model portfolios and manager sleeves) → D3 (presentation). The D2a plan is saved separately in PR #74 (tracking issue #73), unmerged. Before implementing D2a, reconcile that branch with D2's delivered contracts (store/backup v8, `Account.funding`, `Recommendation.destination`/`linked`, `alternatives`, `funding_reserves`/`approved_alternative`), preserving both branches' documentation.
- **Limitations:**
  - Replacements stay within one account and its eligible-cash currency.
  - Alternatives can't be deleted yet.
  - There is no reserve currency other than the cash line's own.
  - The comparison has no history.
  - When a legacy action (such as a household loan paydown) breaches a reserve, the latest unit buying in that account is left out and blamed, even if it adds cash. Readiness still blocks; follow-up issue filed.
  - Approved snapshots and presentation are D3.
- **Next step:** Codex re-reviews PR #75 at the review head before any owner-authorized merge. D2a and D3 have not started.
- **Preserved:** accepted values/FX/source dates, all existing readiness and final-PDF gates, legacy recommendation effects, v6/v7 compatibility, #59 and agent requirements. All 25 IDs remain Planned.

## Licensing documentation correction — 26 October 2026

See [LICENSING.md](../LICENSING.md) and [rights-verification status](LICENSING_STATUS.md). Current blanket open-source wording is removed; historical MIT evidence/grants and third-party rights are preserved. Ownership/exclusivity verification remains open and requires qualified review; keep private supporting documents outside Git. No application behavior or delivery sequencing changed.

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
