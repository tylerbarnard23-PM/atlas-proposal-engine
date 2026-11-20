# Claude Code Desktop command playbook

Approved workflow: 24 October 2026. Use with [DEMO_DELIVERY_PLAN.md](DEMO_DELIVERY_PLAN.md). This file is guidance/templates, not evidence that a command ran. Claude Code Desktop is the developer tool; Atlas's live API configuration remains separate and unchanged.

## Model and effort

Development models: **Sonnet 5.5** is fine for routine work (documentation, release and merge steps, bounded UI and wording fixes, mechanical updates, checking CI and evidence). Use **Opus 5.5 at High effort** for financial/domain contracts, state migrations and backup compatibility, security and privacy, readiness/approval semantics and difficult defect review. Effort (Low/Medium/High) still applies within a model. Never assume a terminal client is required.

This is development guidance only. It never changes Atlas's runtime model, providers, API settings or live-AI configuration.

| Work | Effort | Guidance |
|---|---|---|
| Domain/financial contracts, migrations, complete snapshot/agent boundary design, difficult defect review | **High** | Use for the first D1 contracts and D2–D4 semantic work. Carry implementation through the same coherent task; do not ask the owner to change effort repeatedly mid-command. |
| Bounded implementation after contracts are established, ordinary UI/integration fixes, approved release verification | **Medium** | Default for subsequent scoped work; raise to High only when the task changes financial meaning or recovery/authority boundaries. |
| Save/checkpoint, status reads, documentation/PR metadata housekeeping | **Low** | One status read, preserve work and stop. No new feature or Auto-fix. |

Effort is a workflow choice, not a promise of token savings or a new app model selection. Keep one writer per branch. A pending CI job is not a reason to start a second unrelated task or poll repeatedly.

## Implementation command contract

Every future implementation prompt names the package/subslice, effort, expected base (verify it), outcome and exclusions. It authorizes routine implementation/UX choices already within the approved plan, but does not authorize merge/deploy, paid evaluation, new vendors, real client data or a new project name unless explicitly stated. Read only the short active handoff, selected package/shared contracts and relevant code; do not load the historical handoff archive unless a specific regression needs it; do not reload every detailed plan or repeat broad competitor research.

Inspect → make a short design/contract note in the issue/implementation PR (for financial or persisted-state changes, the impact note in [CONTRACT_IMPACT_CHECKLIST.md](../CONTRACT_IMPACT_CHECKLIST.md)) → implement → focused regression tests → self-review/fix blocking findings together → final typecheck/full tests/eval/build/browser/PDF as applicable → include docs/checkpoint → open/update one PR → report exact evidence. Do not split off design-only or release-checkpoint PRs. A justified domain/migration split is allowed within a package; explain the dependency and keep it the same task, not 25 new prerequisites.

<a id="next-implementation-d1"></a>

## Historical D1 command — delivered in PR #72

**Status:** released (PR #72, `0381db1`). D2 (PR #75, `073049f`), D2a (PR #79, `c0ee4e9`) and D3 (PR #81, `85b3910`) are released too; D4 is in review (PR #82). Kept for reference.

**Opus 5.5 · High effort.** Use after the approved planning change is available in the implementation base; do not implement from the old stand-alone R11-first prompt. If a planning PR is still unmerged, verify it and obtain/execute only an explicitly owner-authorized pinned merge first. Do not silently merge it merely because this template exists.

```text
Build D1 — Working allocation desk from the approved demo-first delivery plan.

Verify actual local/GitHub heads, working tree, stash and existing work. PR #70 already delivered the small R11 cleanup (reviewed at 6449889bfbf9a07ff3a45c8446301e87693a8c4b, merged as 8b06b6a842d8b11adc1b96967c78aee9c0e12a6c); build on it and do not repeat or expand that cleanup in D1. The last verified release was main 8b06b6a842d8b11adc1b96967c78aee9c0e12a6c, PR #70 merged; it is a checkpoint, not permission to overwrite newer commits.

Read the latest handoff, docs/roadmap/DEMO_DELIVERY_PLAN.md (D1 and shared acceptance story), IMPLEMENTATION_GUIDE.md and the minimum relevant R02/R03/R05/R07/R19a contracts. Read other plans only for a touched contract. Do not spend another PR solely on the R11 text/identifier cleanup.

Deliver one usable portfolio-design workspace: selected-account investment scope and context/exclusions; current/proposed/target asset-class grid and drift; one working draft with explicit action membership and intent; contextual edits through the existing shared evaluator/preview; visible actual cash; save/reload and valid backup/restore. Targets alone create no trades. Separate draft preview, approval and prose inclusion. Preserve current holdings and all existing financial gates.

Capture the minimum accepted-value/source-date/FX input-basis record for the draft. Reuse stable IDs/order and preserve legacy effects/evidence. If persisted schema changes, implement a versioned/idempotent migration and supported old-backup upgrade together. Do not build a generic future platform.


Write a short concrete contract/UX note on the implementation issue/PR and proceed within approved scope. One coherent PR is the default; if needed, justify the D1 contracts/backup → workspace split from the plan. Do not stop for another routine design approval or delete existing work.

Use the committed synthetic acceptance story and negative cases. Test financial/state behavior through real engines/store/backup paths, self-review all touched flows and fix blocking findings together. Run the required final typecheck, full tests, eval, build and focused browser check; inspect PDF if output changes. Preserve/restore browser data and stop task servers.

Include the handoff/roadmap progress update in this feature branch. Link the PR to #36 and the relevant R-plan issues as partial scope; close none whose full acceptance is not delivered. Preserve all 25 IDs, PII gates and truthful capability labels.

Stop for Codex review with exact head, checks, preview association, remaining limitations and next command. Do not merge/deploy, add new investments/alternative duplication before D2, retire providers, enable live AI, implement remote sharing or process real client data.
```

## Active sequencing: D4 released → D5

D1 (PR #72, `0381db1`), D2 (PR #75, `073049f`), D2a (PR #79, `c0ee4e9`), D3 (PR #81, `85b3910`) and **D4 (PR #82, `3738588`, 16 November 2026)** are released; the commands below the next one are historical, so do not rerun them. **D5 is in progress** (desktop-first since 18 November 2026: mobile work is deferred).

### Next task: review the statement-import fixes (PR #108)

Saved on 20 November 2026. [PR #108](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/pull/108) is on branch `fix/import-statement-dates-bond-class`, from `main` at `bb1ff9f`, with application commit `5a02b8d` followed by docs. It fixes the two defects that stopped the demo's statement-import chapter:
- [#104](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/104): the statement date was ignored, so holdings were dated the import day.
- [#105](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/105): a municipal bond was imported as equity.

Verify heads, tree and stash first, and preserve newer work. The recording stays paused.

1. **Codex** reviews PR #108 at its head. Check:
   - **The date reader** (`src/ingestion/documents/statementDate.ts`): labels only at the start of a cell; one-way numeric dates only. A two-way, impossible or unreadable date, or labelled dates that disagree, stay unknown with the reason.
   - **The date precedence:** the holding's date, then the account's, then the document's. There is no fallback to the import day, for every source.
   - **The class evidence:** "General Obligation" only as the whole phrase, never a bare "GO". Equity is assumed only for a ticker with a share count and a price that isn't per 100. A row with only a CUSIP, ISIN or SEDOL, or priced per 100, stays `custom` with a warning.
   - **The UI:** the preview and review show the saved date and class, and "No date" blocks bulk confirmation.
   - **The impact note** on #104, and that store, backup, readiness and Copilot are unchanged.
   - **The deliberate behaviour change:** CSV, Excel, paste, OCR and OFX imports with no stated date now arrive undated. Follow-ups: #106 and #107.
2. **The owner** decides on merge (pinned: `gh pr merge 108 --merge --match-head-commit <reviewed head>`). Then, only on the owner's instruction:
   - re-rehearse the import chapter on the merged build;
   - record it, about 45 to 60 s, before the Part 1 walkthrough, with the existing recorder, narration and captions. The narration must say the PDF is read in the browser and not uploaded, and that no model reads it.
   - assemble and validate a new version, keeping every original recording.
3. **Still open, unchanged:**
   - the independent review of the Part 2 paused frame;
   - publication decisions: #35 counsel and the announcement gate, #85, #87, Vercel settings, and closing PR #80;
   - mobile stays parked: draft PR #98 at `59f6a9b`, and #92, #93, #97;
   - the R25 study and the 27-trial paid evaluation.

### Previous task (done 19 November 2026; PR #103 merged as `bb1ff9f`, don't rerun): review the Copilot live-demo fixes (PR #103)

Saved on 19 November 2026. [PR #103](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/pull/103) (branch `fix/d5-copilot-live-findings`, from `main` at `6660a61`; application commit `de19df5`, review follow-up `0fd4555` for spaced and capitalised multipliers, then docs commits) fixes what the private live-Claude recording found: [#102](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/102) the figure check dropping lowercase multipliers ("$250k" read as $250, with a false-pass risk), [#84](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/84) answer tables shown as raw pipes, [#101](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/101) a stopped other-provider session blocking Start (plus arming during an in-flight run), the live-mode figure copy, and the owner-approved model-facing name (Atlas → Stratovell, prompt/tools `d5-2026-11-19`). Verify heads, tree and stash first, and preserve newer work.

1. **Codex** reviews PR #103 at its head: the parser rule (multipliers kept in any case, glued or as a separate word after spaces on the same line; ordinary words after a space stay prose; unknown glued suffix → unchecked, never matched) and its tests, including the review cases "$250 k", "$2.5 MILLION", "$1 bn", "$3 mm" and "$250  K"; the table renderer stays React-text-only; only product names changed in model-facing text (tool names, schemas, authority rules and settings identical); `viewOf`/`armSession` keep provider and credential binding at arming, admission and every request; the impact note on #102.
2. **The owner** decides on merge (pinned: `gh pr merge 103 --merge --match-head-commit <reviewed head>`). No deployment, publication or paid call is part of this step.
3. **Still open, unchanged:** publication decisions (#35 counsel and announcement gate, #85, #87, Vercel settings, closing PR #80); mobile stays parked (draft PR #98 at `59f6a9b`, #92, #93, #97); the R25 study and the 27-trial paid evaluation. The demo recordings, recorder and their reports stay outside Git (owner's local folder).

### Previous task (recorded 19 November 2026, privately and outside Git): record and edit the desktop demo video

Saved on 18 November 2026. Desktop implementation, production verification and rehearsal are complete: PR #99 (`1f5a856`, the sample notice on every PDF page, [#94](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/94)) is production-verified page by page, and the recording package (PR #100, docs and synthetic captures) holds the evidence, narration outline and capture checklist ([D5_RECORDING_PACKAGE.md](D5_RECORDING_PACKAGE.md)). **Mobile stays deferred:** draft [PR #98](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/pull/98) is parked unchanged at `59f6a9b`; do not merge, revert, delete or continue it, and keep #92, #93 and #97 deferred. Verify heads, tree and stash first, and preserve newer work.

1. **The owner** records and edits the video of the scripted, synthetic demo using the narration outline and capture checklist (fresh browser profile, "Scripted demo · no model" and the sample notice visible, limits read aloud, nothing about advisors tested, time saved, security or competitors). Nothing here records it.
2. **Publication decisions, separate from recording and still open:** counsel's clearance of the Stratovell name ([#35](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/35)) and the announcement gate; [#85](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/85) secret scanning and push protection; [#87](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/87) public PDF-route exposure; Vercel settings (unread; the Vercel API is unreadable from this account); closing PR #80. Nothing is published or announced before these are decided.
3. **Later, separate work (not prerequisites for recording):** the R25 advisor study when consented advisors are available (the scorecard stays empty until real sessions); the 27-trial paid-agent evaluation (budget unapproved). Known print limitations, out of scope: the section footer counts sections, and the watermark is clipped at page breaks.

### Previous command (completed 18 November 2026): review the PDF sample notices

PR #99 was merged pinned to `300b57c` as `1f5a856` and production-verified (18 November 2026). Do not rerun.

### Previous command (completed 18 November 2026): review the D5 demo package

Saved on 17 November 2026. PR #91 (meeting-view fit; reset not reproduced) is released and production-verified (`b2eb2de`; [evidence](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/pull/91#issuecomment-6959423945)). The D5 demo package is on branch `docs/d5-demo-package`, docs only. Verify heads, tree and stash first, and preserve newer work.

1. **Codex** reviews the package PR: the walkthrough ([D5_DEMO_WALKTHROUGH.md](D5_DEMO_WALKTHROUGH.md)) matches what the rehearsal showed and claims no more; the R25 protocol ([R25_USABILITY_PROTOCOL.md](R25_USABILITY_PROTOCOL.md)) is usable and sends nothing; the scorecard ([R25_SCORECARD.md](R25_SCORECARD.md)) is empty and invents no result; the README distinguishes the one real-Claude run from the evaluations not performed; no runtime code, dependency, model setting or technical identity changed.
2. **The owner** decides on merge (pinned: `gh pr merge <N> --merge --match-head-commit <reviewed head>`), counsel's clearance of Stratovell, and the announcement gate. Nothing is announced before then.
3. **Claude, as separate bounded tasks (one issue each, tests first where code changes):** [#92](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/92) navigation below 768 px; [#93](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/93) skip link; [#94](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/94) whether every PDF page must carry the sample notice (a PDF-output change: contract-impact note and fixed-input before/after comparison first). Then re-run the walkthrough's keyboard and viewport checks.
4. **When advisors are available (owner-led, consented):** run the R25 protocol and fill the scorecard only from real sessions.
5. **Separate owner decisions:** the 27-trial agent evaluation budget, [#85](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/85), [#87](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/87), Vercel access (the Vercel API was not readable from this account), closing PR #80, (the Next.js 16.4.5 patch, [PR #96](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/pull/96), has since merged).

Until the owner says otherwise: no merge, announcement or LinkedIn publication, purchase, settings change or paid call.

### Previous command (done 17 November 2026, don't rerun): review the D5 stability batch

Done: PR #91 was approved and merged pinned to `64e8b2a` as `b2eb2de`, then verified in production.

### Previous command (done 17 November 2026, don't rerun): review the Stratovell branding PR

Done: Codex approved PR #90; it was merged pinned to `e813e7a` and verified in production.

### Previous command (done 17 November 2026, don't rerun): apply the chosen name

Superseded by the one above: the name is chosen and the rename is in PR #90.

### Previous command (done 16 November 2026, don't rerun): review the #86 request limits

Saved on 16 November 2026. PR #88 (the D5 security and dependency gate) is merged as `ba5f6ce`. Branch `fix/86-request-resource-limits`; the handoff names the PR and head. Verify heads, tree and stash first, and preserve any newer work.

1. **Codex** reviews the fix against [#86](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/86) and its impact note:
   - `src/server/requestLimits.ts`: the body reader, the shape guard and its limits, and the bounded error text;
   - its use on both PDF paths and in the Copilot handler before any schema, engine, readiness, Chromium or provider call;
   - the Copilot's nested-list limits;
   - `tests/requestLimits.test.ts`.
2. **Claude** fixes confirmed findings in one batch, failing regressions first, then runs the full checks and the browser check, and stops.
3. **Owner decisions remain separate:** merging the fix (pinned to the reviewed head); [#85](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/85); [#87](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/87); Vercel access; closing PR #80.
4. **After merge:** the D5 package — golden-path, keyboard and viewport evidence; the R25 protocol and empty scorecard; the README and demo narrative; the #35 name decision.

Until the owner says otherwise: no paid testing, no real key, no model call, no dependency change, no pairing-policy change, no repository or Vercel setting change, no merge, no deployment.

### Previous command (done 16 November 2026, don't rerun): review the D5 security and dependency gate

Saved on 16 November 2026. Branch `feat/d5-security-dependency-gate` (from main `3738588`); the handoff names the PR and head. Verify heads, tree and stash first, and preserve any newer work.

1. **Codex** reviews the batch against [D5_SECURITY_DEPENDENCY_GATE.md](D5_SECURITY_DEPENDENCY_GATE.md): the Zod 4.6.7 upgrade and its compatibility changes (`z.partialRecord` for the asset-class maps, the `snapshot.ts` record key, the export-allowlist walker), `tests/dependencySecurity.test.ts`, the coverage matrix and the findings' severities.
2. **Claude** fixes confirmed review findings in one batch, failing regressions first; then typecheck, full tests, extraction eval, build and the browser round trip; then stops.
3. **The owner** decides separately: enabling secret scanning and push protection ([#85](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/85)); PDF-route abuse controls ([#87](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/87)); whether to grant Vercel access so its configuration can be covered; closing PR #80 as superseded; merging this PR (pinned to the reviewed head).
4. **After merge:** the bounded fix for [#86](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/86) (limits on arrays parsed by public routes), then the D5 package: golden-path/keyboard/viewport evidence, the R25 protocol and empty scorecard, the README and demo narrative, and the #35 name decision.

Until the owner says otherwise: no paid testing (the 27-trial evaluation budget is unapproved), no real key, no model call, no further dependency change, no pairing-policy change, no merge, no deployment.

### Previous command (done 16 November 2026, don't rerun): after the real-Claude check

Saved on 16 November 2026. The owner-operated verification (Part A fake rehearsal, then Part B, one real run) is **done and passed**; the result is in the handoff and in [LOCAL_CLAUDE_SETUP.md](LOCAL_CLAUDE_SETUP.md). Branch `feat/d4-contextual-agent`, PR #82. Verify heads, tree and stash first, and preserve any newer work. Don't rerun Part B.

1. **Owner/Codex** review the result: one run, 4 requests, USD 0.0658 estimated, matching figures, an unapproved draft only on explicit Add. Confirm the actual charge in the Console if you want it checked (Atlas's figure is an estimate).
2. **The owner decides**, separately and explicitly: whether any further paid run is wanted (none is approved); finding 3's pairing policy; whether to triage [#84](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/84) (a markdown table in the answer possibly shown raw) and [#83](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/83); and when to merge.
3. **Still unperformed and required before any broader claim:** the full 27-trial agent evaluation and the real-model browser checks (budget unapproved). One run is not a pass of either.
4. **Not part of this:** the PR #80 reconciliation, the zod fix, D5 beyond the usability slice. Merge and deployment only on the owner's explicit authorization, pinned to the reviewed head.

Until the owner says otherwise: no real key, no model call, no paid testing, no dependency change, no merge, no deployment.


### Previous command (done 12 November 2026, don't rerun): review the onboarding fixes



Saved on 12 November 2026; the review and its fixes finished (owner-reported), so don't rerun. Branch `feat/d4-contextual-agent`, PR #82. The handoff names the head. Verify heads, tree and stash first, and preserve any newer work.

1. **Codex** reviews the fixes to findings 1, 2 and 4–8 **and the four rounds of defects found while reviewing them** — staged credential writes over two account slots, relative state-path overrides, per-backend cleanup tracking, the credential transaction, its lock's liveness, ownership and bounded waits, the deadline on native credential calls, **ownership of a native call that finishes after Atlas stopped waiting for it, on every write and removal path**, and intent recorded before the external write — against the security design and the findings tables in [LOCAL_CLAUDE_SETUP.md](LOCAL_CLAUDE_SETUP.md): credential validation and what it does and doesn't claim, the admission order, the credential write/commit/cleanup lifecycle and its failure, late-completion and interruption paths, instance-scoped cookies, state-path resolution, the authorize-then-read body handling, and environment-key handling.
2. **The owner** decides on finding 3's recommendation (pairing revocation, idle lifetime, a 24-hour cumulative allowance). Nothing there is built, and no existing limit may be raised without that decision.
3. **Claude** fixes confirmed findings in one batch, failing regressions first, with fake providers and dummy credentials only; then runs typecheck, full tests, extraction eval and build, and stops.
4. Only after that: the owner decides whether to approve one real-Claude verification (one key in a dedicated workspace with a spend limit, one session, synthetic data).

Until the owner says otherwise: no real key, no model call, no paid testing, no dependency change, no merge, no deployment.

### Next command: fix the onboarding review findings

**Done on 12 November 2026; don't rerun.** Findings 1, 2 and 4–8 are fixed with regressions; finding 3's recommendation is in the setup guide.

Saved on 11 November 2026; not yet started. Branch `feat/d4-contextual-agent`, PR #82, reviewed code head `03128df`. Verify heads, tree and stash first, and preserve any newer work. The findings are in [LOCAL_CLAUDE_SETUP.md](LOCAL_CLAUDE_SETUP.md#review-findings-11-november-2026-reviewed-head-03128df).

> Reproduce and batch-fix confirmed onboarding findings on PR #82, with meaningful failing regressions first. Resolve findings 1 and 2 before real credentials are used. Verify official credential guidance rather than treating a prefix as proof of authentication. Prepare a concrete recommendation for pairing revocation/lifetime and cumulative allowances. Include confirmed fixes 4–8 in the same coherent batch. Use fake providers and dummy credentials only, then run the required checks and isolated browser verification. Stop for Codex review.

Until the owner says otherwise: no real key, no model call, no paid testing, no session arming for a paid provider, no dependency change, no merge, no deployment.

### Next command: review the local Claude onboarding

**Step 1 done on 11 November 2026 (a read-only review at `03128df`); don't rerun it.** Steps 2 and 3 are carried by the command above.


Saved on 11 November 2026; not yet started. Branch `feat/d4-contextual-agent`, PR #82. The handoff names the head. Verify heads, tree and stash first, and preserve any newer work.

1. **Codex** reviews the Route 1 onboarding package against the security design in [LOCAL_CLAUDE_SETUP.md](LOCAL_CLAUDE_SETUP.md): pairing and CSRF, credential handling and its lifecycle, session binding and accounting, hosted and cross-origin refusals, and the preserved proposal contracts.
2. **Claude** fixes confirmed findings together, failing tests first, with fake providers and fake credential stores only; then runs typecheck, full tests, extraction eval and build, and stops.
3. Only after that: the owner decides whether to approve one real-Claude verification (one key in a dedicated workspace with a spend limit, one session, synthetic data).

Until the owner says otherwise: no real key, no model call, no paid testing, no merge, no deployment.

### Next command: settle the local Claude connection

**Done on 11 November 2026; don't rerun.** The owner chose Route 1, guided key entry in Atlas, optional OS-backed remembering and in-app session starts, and the package was implemented.

Saved on 11 November 2026. Branch `feat/d4-contextual-agent`, PR #82, reviewed runtime head `538a8fc`. Verify heads, tree and stash first, and preserve any newer work.

1. Read [LOCAL_CLAUDE_SETUP.md](LOCAL_CLAUDE_SETUP.md).
2. With the owner, settle the connection route and the setup experience. The pending decisions are listed there: the route, session controls, and whether to draft a question to Anthropic. Contact nobody.
3. Prepare the selected work as one coherent implementation: impact note first, failing tests first, fake providers only.

Until the owner says otherwise: no paid testing (the earlier pilot approval was withdrawn), no real session arming, no model call, no merge, no deployment.

### Next command: review, pilot accounting fix, then approval

**Done on 11 November 2026; don't rerun.** The pilot accounting fix is at `538a8fc`, and the joint Codex review of it and the session fixes finished with no new blocking findings. Step 4 never happened: the paid-pilot approval was withdrawn.

Saved on 10 November 2026. Branch `feat/d4-contextual-agent`, PR #82. Verify heads, tree and stash first, and preserve any newer work.

**Progress (10 November 2026):** step 2's pilot-runner accounting fix is done ahead of the review, at the owner's instruction; the handoff names the head. Next is step 1 for both batches together: Codex reviews the session fixes (`d45dae1`) and the pilot accounting. Then Claude fixes any confirmed blockers (step 2), runs step 3, and stops.

1. **Codex** reviews runtime head `d45dae1` (the provider-bound session and unknown-usage fixes) and its regression coverage.
2. **Claude** fixes the pilot-runner accounting gap together with any confirmed review blockers, writing failing regressions first. The gap: `budgetedClient` treats missing usage as a known USD 0. It must:
   - reuse `pricedUsage`;
   - keep a conservative reservation when usage is unknown;
   - report the condition clearly.

   Valid zero usage stays valid. Use fake providers only.
3. Run the appropriate final validation (typecheck, full tests, extraction eval, build), push, read CI once, and stop for review.
4. Only after that review comes the owner's explicit approval of any paid test. Until then: no real session arming, no paid call, no merge, no deployment.

### Next command: D4/D5 usability review-fix

**Done on 10 November 2026 (PR #82); don't rerun.** The evidence is in the handoff and on the PR. The next step is Codex review.

Use **Opus 5.5 High**. On `feat/d4-contextual-agent` (PR #82; the last passing code head is `97b65e3`), verify local and GitHub heads, the working tree and the stash first. Then fix the four open Codex UX findings listed in the [handoff](../CLAUDE_HANDOFF.md) as one batch: the new record hidden from the Current draft view, the outdated "Added to working draft" message, the same-page desk link leaving the narrow overlay open, and modal semantics for the narrow panel (the wide column stays nonmodal; cover resize cleanup).

- Write meaningful regression coverage and do actual UI checks.
- Preserve the financial engines, context and acceptance safeguards, store/backup v10, and the runtime model, prompt, fallback and spending settings.
- Never re-add, re-approve or change membership automatically.
- After the code settles, run typecheck, full tests, extraction eval and build. In the browser, check desktop, the narrow layout, keyboard cycling, resizing and same-page navigation, on an isolated `*.localhost` origin with synthetic data.
- Push, read CI once, and stop for Codex review.

Gates stay as they are:
- No paid live evaluation or real-model browser test; the budget is not approved.
- PR #80 is untouched.
- The zod advisory needs a separate tested dependency change; never run `npm audit fix --force`.
- D5 is incomplete.
- No merge or deployment without explicit owner authorization.

## Package prompt summaries

D1, D2, D2a and D3 are delivered (historical, kept for reference). D4 is in review (PR #82); D5 follows once D4 is released.

- **D2 — delivered (PR #75), historical — Opus 5.5 High:** use D1's delivered contracts; implement supported new destination/atomic replacement, explicit eligible funding/reserve enforcement and two independent named alternatives. Avoid a broad catalog, optimizer and unsupported transfer workflows. Stop at one reviewed package/justified split.
- **D2a — delivered (PR #79), historical — Opus 5.5 High:** after D2, implement [MODEL_AND_MANAGER_PROPOSALS.md](MODEL_AND_MANAGER_PROPOSALS.md): a small versioned model library, funded manager/strategy sleeves, known minimums/fees and explicit unknown exposure. Keep sleeve grouping separate from asset-class exposure; no double-counting or implicit trades. Use D2's delivered contracts (see the plan's "Delivered D2 contracts" section): designated eligible cash with no fallback, `reserveCurrency`, declared unresolved funding, atomic units and independent alternatives, plus real migrations and supported backup upgrades. Follow the committed synthetic fixtures and stop for Codex review; no manager feeds, execution or UMA administration.
- **D3 — delivered (PR #81), historical — Opus 5.5 High:** capture the whole reviewed economic package, including D2a model/strategy revisions and sleeve/exposure/fee coverage and use it for local presentation/PDF. Preserve new-final-request server gates and old-version isolation. One template; known/unknown coverage, no remote sharing or financial forecast detour.
- **D4 — in review (PR #82) — Opus 5.5 High:** contextual engine-backed draft agent, real offline orchestration tests and a prepared capped synthetic live runner. No spend without explicit budget, no second provider, no public live key. Report offline/fake/browser/live evidence separately.
- **D5 — Opus 5.5 Medium:** run the complete supported story, critical keyboard/error checks, README/demo narrative and owner-selected screened branding. Preserve links/keys; no fabricated study or production-ready claim. Real advisor recruitment and final name choice are explicit owner activities.

These summaries are expanded into one concrete command when that package becomes next. Do not execute all packages from this file or invent evidence for later packages.

## Review-fix command template

Use **Medium** for bounded established behavior, **High** for money, migration or authority findings. Recheck the reviewed head, reproduce each blocking finding first, batch the fixes on the same PR, preserve unrelated work, run changed-path tests while iterating and the full final checks after runtime code settles. Record exact heads and any missing evidence. Stop for review; no unrelated cosmetic expansion or merge.

## Release command template

**Opus 5.5 · Medium.** Only when the owner's command explicitly authorizes that release: verify exact reviewed head, clean state and passing checks; merge pinned; verify main CI and deployment association; smoke the changed flow on synthetic data and preserve browser state. Record actual results on the PR/issue. No feature issue closes for a partial slice, no automatic next package and no separate release-only docs PR. If a connector cannot read a deployment ID, use available GitHub deployment association and live evidence with the limitation stated; don't bypass access controls or invent a preview/build association.

## Save command template

**Opus 5.5 · Low.** When remaining session budget cannot safely cover the next coherent work step, save instead of starting a tiny unrelated task:

```text
Save and stop. Verify branch/tree/stash and actual remote head. Read CI/deployment status once; record pending honestly. Update the current handoff only if needed with package/subslice, exact code/tested/docs heads, actual checks, unresolved findings, server/browser restoration state and the next precise command. Commit/push only owned changes; mark incomplete work WIP or a draft PR, never ready. Preserve unrelated files and the stash; stop task-owned servers. No reset/clean, Auto-fix, new implementation, merge, deployment or model/provider change. Do not rerun the whole app suite solely for checkpoint docs or create a new checkpoint PR.
```

This approved cadence supersedes earlier prompts that made every small cleanup or repeated planning/release note a new prerequisite. Financial correctness, safe migrations, privacy, meaningful checks and owner merge authority remain unchanged.
