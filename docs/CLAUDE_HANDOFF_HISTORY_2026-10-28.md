# Handoff history — superseded 28 October 2026

The D2a-released / D3-in-review checkpoint, kept for lookup. The current checkpoint is in [CLAUDE_HANDOFF.md](CLAUDE_HANDOFF.md). Do not load this automatically.

## Superseded checkpoint — 27 October 2026: D3 implemented, in review (PR #81); D2a released

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
- **Status (28 October 2026):** D3 implemented; PR #81 open, unmerged, no merge approval. Codex review is incomplete. D4 and D5 are not started.
  - **Scope finding fixed (reproduced first):** a version's meeting view and PDF showed household-wide allocation and exposure (Before $111.0K, USD 90.1% / EUR 9.9%) while its results used the selected USD 100,000 scope. For a version, the template now takes amounts, weights and look-through exposure from the shared evaluator (`evaluateDesk`, approved view, the version's scope), and currency, country, liquidity, cost/income and concentration from in-scope holdings, each labelled "(investment scope)". Out-of-scope accounts and every liability appear as labelled household context on the Reviewed Package page and in household stats, outside every denominator. An approved action on an out-of-scope account is labelled as household context. Readiness, valuation and FX checks stay household-wide. No persisted shape, fingerprint or result changed; the live (no-version) PDF path is unchanged.
  - **Also fixed:** `recommendationCurrency` "PDF applies the converted amount once" depended on the wall clock (its 2026-10-20 rate turned stale on 28 October); the test now passes a fixed `now`.
  - **Cost/income coverage fixed (regressions first):** `costIncomeCoverage(holdings, sleeveIds)` excluded every `proposedOnly` holding as a "sleeve", which also dropped ordinary new investments (D2 destinations) from the denominator and could show "Not applicable" instead of "Unavailable". Sleeves are now only destinations pinned to a strategy revision (`sleeveRefs`); an ordinary new investment stays in the denominator, uncovered (no fee/yield fields exist for it). An explicit zero counts as supplied. The PDF's exclusion count and wording name actual sleeves only.
  - **Evidence:** see PR #81 (local typecheck, 512 passed / 0 skipped with the private fixture, eval 2/2, build; isolated `d3.localhost` browser checks of UI-approved versions, their meeting views and server PDFs; later edits left v1 byte-identical). CI for the pushed head is reported on the PR.
  - **Preserve:** PR #80 (D5 secrets/exposure plan) is open; keep it when reconciling docs.
- **Next:** finish Codex review of D3 (including the scope fix) before any owner-authorized, pinned merge.
- **Open follow-up:** #76 (reserve-breach attribution for legacy actions), unchanged.
- **Limitations carried forward:**
  - replacements stay within one account and its cash currency;
  - alternatives and library entries can't be deleted;
  - there is no reserve conversion helper;
  - D2a: no manager feeds or verified offerings, no automatic sales to fund a plan, no fee aggregation, no nested models;
  - D3: versions are local application records, not tamper-proof books and records. There is no remote sharing, link, client acknowledgement, signature or implementation status, and no version comparison beyond "changed since". The meeting view reads this browser's workspace only. Costs and income cover supplied holding data only: no fee schedules, savings, forecasts, tax or risk precision. Readiness doesn't block an approved action outside the version's scope (it is labelled, not refused), and the holdings and accounts appendices list the whole household without a scope column.

  All 25 R-plans remain Planned or partial; no scope issue closes.
- **Preserved:** accepted values, FX and source dates, every readiness and final-PDF gate, legacy recommendation effects, #59 privacy, backup and agent requirements.

## D4 review rounds (29 October 2026)

Moved from the handoff when the D5 usability slice was added. Evidence is on PR #82.

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

## D5 usability slice and review-fix (moved 11 November 2026)

Moved unchanged from the handoff's D4 checkpoint to keep it short.

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
