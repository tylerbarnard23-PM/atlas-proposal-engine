# Handoff

## Current checkpoint — 27 October 2026: D3 implemented, in review (PR #81); D2a released

- **D2a released:** PR #79 merged pinned to reviewed head `402084e6943bca564eec4b667c5c2ec57ac1476c` as **`c0ee4e95119e8b8879ff3a68b4201aefa824b832`** (26 October 2026).
  - Main CI [run 40346074152](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/actions/runs/40346074152) passed: 487 passed, 2 private-PDF skips, eval 2/2, build.
  - GitHub records Production deployment 7335446932 for `c0ee4e9` (success).
  - A synthetic production smoke passed and is recorded on [PR #79](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/pull/79). It covered pinning with no actions, 40/35/20 funded sleeves with a 5,000 reserve, a known-minimum failure left out whole, purchase currency and attribution, review access after unpinning, and a v9 backup cycle. The browser workspace was restored byte-identical. #73 stays open.
- **D2a contracts (store/backup v9):**
  - Append-only `strategies` and `models`, immutable by `(id, revision)`; `WorkingDraft.model` pins one revision.
  - Sleeves are proposed-only destinations with `destination.strategy` (asset class `custom`). Minimums are enforced in the engine; readiness `strategy_terms` waits for a recorded review of an unsupplied minimum.
  - `exposureView` keeps unknown mixes unknown; fees are listed by component (`feeCoverage`), never summed.
- **D3 in review: [PR #81](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/pull/81)** (`feat/d3-reviewed-package`, built from main `c0ee4e9`; see the PR for the exact head). Not merged or deployed. The contract-impact note is on [#52](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/52#issuecomment-6443440356).
  - **Approved versions:** append-only `snapshots: ApprovedSnapshot[]` (`engines/approvedSnapshot.ts`). `approveVersion(note?)` runs only when the shared readiness passes and changes nothing else (action approvals, drafts and holdings stay as they are).
  - **What a version holds:** scope, targets and model pin; the accepted values and every rate in use (an input basis recorded at approval); the approved actions in saved order; accounts with funding and reserves; disclosures with their text frozen; the pinned model and every strategy revision used; results from the shared evaluator (`snapshotResults`); approval identity, time and note; and a 64-bit content fingerprint (`engines/snapshotRecord.ts`). Inputs pass through the backup allowlist (`projectSnapshotInputs`).
  - **Isolation:** later edits never rewrite a version. `snapshotStatus` reports what changed since (holdings, rates, actions, model, library and so on), each once.
  - **One template:** the meeting view (`/meeting/[id]`, read-only, shell-less) and every PDF from a version render `ProposalPdfTemplate` from the version's inputs at its approval time. A version adds a "Reviewed Package" page (identity, scope, input and FX basis, every approved action in order with its effect and prose status, funding and reserves, readiness at approval). A line on the cover and that page says whether it is the meeting view, an issued final or a draft copy.
  - **Issuing:** `POST /api/proposals/[id]/generate-pdf` accepts `{ snapshot }`. It validates the version strictly, recomputes its fingerprint and results (422 on a mismatch), and for a final document re-runs readiness on the version's own inputs with the server clock. Nothing is refreshed: stale rates mean approving a new version. The live `{ state }` path is unchanged.
  - **UI:** a "Review & present" page (`/review`) approves versions, lists them with their status, opens the meeting view and issues a final PDF or draft copy. PDF Preview now makes drafts only and points final issuance to Review. PDF history records `snapshotId` and `snapshotVersion`.
  - **Costs and income (R16 minimum):** `engines/costIncome.ts` reports the weighted expense ratio and income over supplied data only, current and proposed, with value and count coverage, or "Unavailable". The template no longer counts missing data as zero. Sleeves are excluded from holding ratios, and their fees are listed separately. The tax page says no tax analysis is included.
  - **D2a in the document:** a "Manager and Strategy Sleeves" page shows the pinned model, target against funded per sleeve (in the sleeve's own currency), minimum status and recorded review, supplied fees, and look-through exposure with Unknown and its coverage.
  - **Persistence:** store and backup v10 (`snapshots`; `pdfHistory[].snapshotId` and `snapshotVersion`), with strict v9/v8/v7/v6 upgrades. Restore rejects a version whose fingerprint or results don't match, duplicate IDs or numbers, another client's version, or a PDF job naming a missing version. Starting a new client or importing clears versions; restore keeps them.
  - **Evidence:** in the PR.
- **Status (27 October 2026):** D3 implemented; PR #81 open, unmerged, no merge approval. Codex review is incomplete. D4 and D5 are not started.
  - **Evidence at `3fcf455`:** local typecheck clean; full tests 504 passed, 0 skipped (private fixture present); eval 2/2; build passed. CI (check "Typecheck, test, build") passed on this head per Codex and a single status read; CI counts expected 502 passed, 2 skipped. Isolated-origin browser check done; its storage cleared, server stopped, launch.json restored.
  - **Open finding to reproduce first:** `snapshotResults` uses the selected-account scope, but the meeting view and PDF allocation and exposure calculations still include all holdings. The fixture has $100,000 in scope plus $11,000 outside (EUR fund). Keep household context separate, and verify scoped figures agree across desk, snapshot, meeting view and PDF.
  - **Preserve:** PR #80 (D5 secrets/exposure plan) is open; keep it when reconciling docs.
- **Next:** finish Codex review of D3 and reproduce the scope mismatch before any owner-authorized, pinned merge.
- **Open follow-up:** #76 (reserve-breach attribution for legacy actions), unchanged.
- **Limitations carried forward:**
  - replacements stay within one account and its cash currency;
  - alternatives and library entries can't be deleted;
  - there is no reserve conversion helper;
  - D2a: no manager feeds or verified offerings, no automatic sales to fund a plan, no fee aggregation, no nested models;
  - D3: versions are local application records, not tamper-proof books and records. There is no remote sharing, link, client acknowledgement, signature or implementation status, and no version comparison beyond "changed since". The meeting view reads this browser's workspace only. Costs and income cover supplied holding data only: no fee schedules, savings, forecasts, tax or risk precision.

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

Keep this file to the latest checkpoint, rules and next command (roughly 100 lines or fewer). Move superseded notes to a same-directory history file when needed rather than appending every release forever. The complete earlier handoff is preserved in [CLAUDE_HANDOFF_HISTORY_2026-10-24.md](CLAUDE_HANDOFF_HISTORY_2026-10-24.md); the D2 release record is on [PR #75](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/pull/75) and the licensing correction in [LICENSING.md](../LICENSING.md). Do not load them automatically.

For the next package (D4) read [the delivery plan](roadmap/DEMO_DELIVERY_PLAN.md), [the command playbook](roadmap/CLAUDE_COMMANDS.md), the shared implementation rules and only the needed plan/code contracts. Start from [CLAUDE.md](../CLAUDE.md); for financial or persisted-state changes use the [contract impact checklist](CONTRACT_IMPACT_CHECKLIST.md). All 25 plans remain linked from [ROADMAP.md](../ROADMAP.md), not prerequisites to read in full each session.
