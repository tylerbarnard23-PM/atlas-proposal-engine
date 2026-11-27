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

### Next task: Codex review of the #118 fix on PR #117; then, on the owner's instruction, 0.1.3 and the installed recovery re-run

Saved on 27 November 2026. This supersedes the 25 November command below.

```
Review the #118 fix on Stratovell PR #117 (branch feat/desktop-windows-app) at the head named in its description.
Verify the local and GitHub heads, the tree, the stash and the worktrees first, and preserve newer work.
Read docs/CLAUDE_HANDOFF.md, docs/roadmap/DESKTOP_APP.md, issue #118 and REPORT.md section 34.

#118, found by the installed-app UAT of 0.1.2: a default Settings restore during a load problem kept the in-memory
sample firm (or an edit typed while saving was paused) instead of the backup's firm. Review:
- restoreTakesBackupFirm (src/engines/workspaceBackup.ts) and backupPreview's unreadable / fromBackup fields;
- the store action restoreBackup and the Settings panel calling it;
- the read-only stratovell:workspace:status IPC call and the bridge's loadProblem(), answered only for the app's own pages;
- the "#118" block of tests/desktopReliability.test.ts;
- that nothing changes outside a load problem.

Record any finding with a regression test written first. Source work and headless tests only.

Only after the review passes and the owner says so: build private UAT 0.1.3 in a new version folder (keep 0.1.0–0.1.2),
then, with the owner's authorization for controlled launches (no GPU, watchdog, one isolated data folder), re-run the
installed recovery stage, including a default restore during a load problem, and a short smoke test.

The production rollback is separate: it waits for the owner's Vercel re-verification and preserves Neon, OAuth and secrets.

Need explicit instruction: merge, deployment, publication, a paid or model request, recording, a signing purchase, mobile work or MCP work. The USD 5 take is unapproved.
```

### Previous task (done 25–27 November 2026; Codex's re-review passed at `82b7751`, 0.1.2 built and UAT-tested; don't rerun): independent Codex re-review of PR #117's A–D fixes

Saved on 25 November 2026.

```
Re-review Stratovell PR #117 (branch feat/desktop-windows-app) at the head named in its description.
Verify the local and GitHub heads, the tree, the stash and the worktrees first, and preserve newer work.
Read docs/CLAUDE_HANDOFF.md, docs/roadmap/DESKTOP_APP.md and REPORT.md sections 33–34.

Review the fixes for Codex findings A–D:
- A: the unreadable-workspace state, refused saves, and the kept copies;
- B: revision-checked writes and following other windows;
- C: save-now with a pending queue;
- D: the content-based Getting started confirmation.

Then review the fixes for the three re-review findings at 055f99b:
1. a stale Settings restore, refused through peek and the real restoreWorkspace;
2. the load-problem guard, kept until a restore succeeds, with the copies kept once;
3. the current file read first, and backup-listing failures.

Also review the desktop/shared IPC and bridge extraction, tests/desktopReliability.test.ts, and the revised docs/roadmap/INSTALL_AS_APP_ASSESSMENT.md.

Record any finding with a regression test written first.

Source work and headless tests only: do not launch Electron, run installers or automate Windows dialogs. Rebuild the installer only after the review passes and the owner says so.

The production rollback is separate: it waits for the owner's Vercel re-verification and preserves Neon, OAuth and secrets.

Need explicit instruction: merge, deployment, publication, a paid or model request, recording, a signing purchase, mobile work or MCP work. The USD 5 take is unapproved.
```

### Superseded: production rollback, Codex review of the #116 desktop PR, then owner UAT

Saved on 24 November 2026. Stratovell is now a desktop application (#116; [DESKTOP_APP.md](DESKTOP_APP.md)). PR #115 was merged as `831612cbb95bb91d528dfcb438dd612de03a41fe` and its hosted mode is retired on the #116 branch (`feat/desktop-windows-app`, from `831612c`). The PR description names the head to review. **Merge, publication of an installer, announcement, paid requests, re-recording, mobile and MCP work are separate decisions, none given.** Verify heads, tree, stash and worktrees first, and preserve newer work.

1. **The owner completes the authorized production rollback:**
   - re-verify in Vercel;
   - set Production `COPILOT_MODE=demo`;
   - redeploy the approved release.

   Then a keyless check: the site is scripted, and hosted credential, session and analysis operations are refused, also with an existing signed-in cookie. Record it on #116 and PR #115. Neon, its integration and rows, the encryption keys, deployment secrets and the GitHub OAuth app stay as inactive infrastructure.
2. **Codex reviews the #116 PR** at its exact head:
   - **Persistence:** the atomic file, recovery, restore, and port independence.
   - **Desktop boundary:** the allow-listed environment, the IPC bridge, navigation and network limits, the fuses, the build's contents check and junction handling.
   - **The PDF print path** (same gates, Electron's Chromium).
   - **Shutdown:** stopping the session without resetting counters.
   - **Hosted retirement:** `hosted` now falls back to the demo.
   - **The pages:** welcome, `/download` (no link without an approved release) and the preview banner.
3. **Owner desktop UAT** with the private installer (checklist outside Git: `evidence/pr116-desktop-2026-11-24/DESKTOP-UAT-CHECKLIST.md`), on a second computer if possible.
4. **Owner release decisions:** code signing, the publication location, recording an approved release, and #35.
5. Only then: the recorder update, a free labelled rehearsal, and separate approval for any real Claude analysis. The USD 5 take is still **unapproved**.

Keep [#114](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/114) and the restriction-confirmation finding as separate follow-ups. Keep mobile and MCP work parked. Preserve all originals, recordings, voiceover packages, the stash, worktrees, `launch.json` and browser data.

### Previous task (done 24 November 2026; PR #115 merged as `831612c` and verified, hosted pilot then retired by #116; don't rerun): Codex re-review of the #113 PR, then owner setup and desktop UAT


Updated on 24 November 2026. Codex reviewed `780c099` and found two defects; both are fixed on the same PR. The PR description names the head to review.
- **Development identities:** they are refused when the current configuration doesn't allow dev sign-in.
- **Bulk approval:** it covers only pending, explicitly sized Claude and advisor records in view.

Codex also ran the five opt-in real-Postgres concurrency cases on a disposable PostgreSQL 17.12 at `780c099`, and they passed. Step 1 below is now that re-review, at the new head.

Saved on 23 November 2026. PR #112 (#111) is released as `1f17770afafaf177aae2bb1af18bb26226fed044` and production-verified (keyless smoke 62/62; the desktop UAT checklist is outside Git, owner feedback pending). The #113 PR (branch `feat/hosted-claude-and-saved-examples`, from `1f17770`) adds hosted Claude connectivity and the Saved examples workflow; see the handoff and [HOSTED_CLAUDE.md](HOSTED_CLAUDE.md). **Merge, hosted setup and any paid run are separate decisions, none given.** Verify heads, tree and stash first, and preserve newer work.

1. **Codex re-reviews the #113 PR** at its exact head (first the two fixes, then the complete PR):
   - **Hosted path:** authentication (state, PKCE, hashed sign-in tokens, Origin checks); per-user isolation of keys and sessions; encryption (AAD binding, key ring); fail-closed readiness; no substitution of the script or test provider for Claude; atomic per-user session row (the unchanged state machine behind a backend); shared metering; no provider request on page load, key save or session start.
   - **Recommendations:** Saved examples and run-example sections; Approve all eligible (known Claude and advisor records only; unknown origins listed for individual review); the approved-example notice and confirmed withdrawal (records, origins and versions unchanged).
   - **Analysis inputs** and the `target_pct` label.
2. **Only on the owner's explicit instruction:** merge pinned to the reviewed head (`gh pr merge <N> --merge --match-head-commit <full SHA>`), then main CI, the deployment and a keyless production check. The public site stays the scripted demonstration until step 3.
3. **Owner setup of hosted connectivity** (HOSTED_CLAUDE.md "Owner setup"):
   - Postgres and `npm run hosted:migrate`;
   - `STRATOVELL_CREDENTIAL_KEYS`;
   - a GitHub OAuth app;
   - `COPILOT_MODE=hosted` and `STRATOVELL_PUBLIC_ORIGIN`;
   - none of `ANTHROPIC_BASE_URL`, `STRATOVELL_DEV_SIGNIN` or `COPILOT_LIVE_PROVIDER` in production.

   Then a production check with a throwaway account. No real Claude run without the signed-in user's own explicit choice.
4. **Desktop UAT by the owner** (the #112 checklist, plus the hosted cases once connected).
5. **Update the recorder, refresh the free rehearsal,** then **obtain separate approval** for the one-run live take. The USD 5 estimated guard is still **unapproved**.
6. **Record, assemble and review the cut,** then replace the temporary Windows voice. Preserve every recording and voiceover package.

Keep [#114](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/114) (PDF pagination) and the owner's restriction-confirmation finding as separate follow-ups. Keep mobile work parked. Preserve all originals, recordings, the stash, worktrees, `launch.json` and browser data.

### Previous task (done 23 November 2026; PR #112 merged as `1f17770`, released and production-verified, don't rerun): Codex re-review of PR #112, then the owner's merge decision and the analysis-led take

Saved on 23 November 2026. PR #110 is released as `58deeb017a84c2ea357b3780bfe7028f94160b08` and production-verified; the free rehearsal passed on the released code (201 of 201). PR #112 for #111 (branch `feat/client-objectives-empty-recommendations`, from `58deeb0`) adds the Client objectives page and stops preloading recommendations. Codex's review of `5b71ecd` found one issue (the prewritten-sample notice counted samples hidden by the Current draft view); it is fixed in `127f2c9`, so the sample count now follows the cards shown. See the handoff for its checks. **Merge authorization and paid-run authorization are separate and neither has been given.** Verify heads, tree and stash first, and preserve newer work.

1. **Codex re-reviews PR #112** at its exact head: the sample-notice fix (`127f2c9`: counted from the cards shown, in both views, with the saved-record exception) and the original scope — empty initialization (fresh, "Restore sample data", new client, import), preserved records, accurate origins, the moved discovery state and old links, no analysis request from navigation, unchanged store/backup v11, engines, readiness rules, prompts and spending.
2. **The owner's merge decision, only on explicit instruction:** merge pinned to the reviewed head (`gh pr merge 112 --merge --match-head-commit <full SHA>`).
3. **Release verification:** main CI, the deployment and a keyless production check of the empty start, an existing workspace's sample notice in both views and the Client objectives flow.
4. **Update the recorder** (outside Git): discovery on `/client-objectives`, the imported client starting with zero recommendations, and the concise brief on Stratovell AI.
5. **Refresh the free fake-provider rehearsal** on the released code.
6. **Obtain separate approval** for the one-run, analysis-led live-Claude take (the next command in REPORT.md section 28, updated for `/client-objectives`). The USD 5 estimated guard is still **unapproved**.
7. **Record:** the imported client with zero recommendations → the advisor's objectives and constraints → Claude's actual analysis and feasible alternatives → an unapproved draft → explicit Add and approval → frozen proposal and PDF. No fixed Apple or other predetermined trade.
8. **Assemble and review the complete cut,** then replace the temporary Windows voice. Preserve every recording and voiceover package.

Keep mobile work parked. Preserve all originals, recordings, the stash, worktrees, `launch.json` and browser data. Keep the publication gates and evaluation limitations recorded.

### Previous task (done 23 November 2026; PR #110 merged as `58deeb0`, released and production-verified, don't rerun): the owner's merge decision for PR #110, then the demo pickup order

Saved on 21 November 2026. [PR #110](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/pull/110) on `feat/client-discovery-stratovell-ai`. Codex re-reviewed head **`85adf1b9654cb9ab8b83f3587b0166e1848eabe6`** (application fix `1c98ae5ae78bb5aa9ecf96c3a715d5494ed6e5c9`) and found no remaining blocker in the three fixes; its 197 focused tests and four regression probes passed, and all reported CI and Vercel checks passed on `85adf1b`. `main` is `7aab3f4bee62446a82d1d917946ae28cede72c5e`. A docs-only checkpoint may sit on top of the reviewed head. The v3 rehearsal predates the fixes; Codex did no new browser or video review. **Merge authorization and paid-run authorization are separate and neither has been given.** Verify heads, tree and stash first, and preserve newer work.

1. **Tyler decides whether to authorize merging PR #110.** Before any authorized merge, verify the exact final head, its documentation-only difference from the reviewed head `85adf1b9654cb9ab8b83f3587b0166e1848eabe6`, mergeability and successful checks; pin the merge to that full SHA (`gh pr merge 110 --merge --match-head-commit <full SHA>`).
2. **After merging:** verify main CI and the deployment, then run bounded synthetic, keyless production checks of discovery, Portfolio checks, recommendation origins, saved-workspace compatibility and the frozen brief in approved proposals.
3. **Refresh the fake-provider rehearsal** against the final code.
4. **Obtain separate approval** before the proposed one-run live-Claude recording. The USD 5 estimated guard is still **unapproved**.
5. **Record the analysis-led workflow:** advisor-entered objectives and constraints → Claude's analysis and feasible alternatives → unapproved recommendation → explicit Add and approval → frozen proposal and PDF. Do not prescribe a fixed Apple trade merely to obtain predictable footage.
6. **Assemble and review the complete cut,** then replace the temporary Windows voice. Preserve the approved import chapter, the clearer connection wording and all voiceover packages.

Keep mobile work parked. Preserve all originals, recordings, the stash, worktrees, `launch.json` and browser data. Keep the publication gates and evaluation limitations recorded.

### Previous task (done 21 November 2026; Codex found no remaining blocker at `85adf1b`, don't rerun): re-review PR #110 (the fixes for Codex's findings at 527407e)

Saved on 21 November 2026. [PR #110](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/pull/110) on `feat/client-discovery-stratovell-ai`, `main` at `7aab3f4`. Codex reviewed `527407e` and held the merge for three findings; they are fixed at code **`1c98ae5`** (impact note: [comment](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/pull/110#issuecomment-7070187330)), with a docs-only checkpoint on top. Nothing on the branch is approved yet. Verify heads, tree and stash first, and preserve newer work.

1. **Codex** re-reviews `1c98ae5` against the findings:
   - **The conversation across views:** both views stay mounted (`hidden`), no remount key; a prefill replaces only the question; the answer shows its own question and flags an unrun one; the tab follows the URL (`useSearchParams`, pushState). Check: a request in flight survives a switch; stale-context protection, Cancel and Stop unchanged.
   - **Client-stated evidence:** no scanning of the brief's text; `clientStatedAmounts` (planned withdrawal, income need, each with its currency) only; free text never evidence, whatever its whitespace; trimmed and collapsed forms in the untrusted list; "a value match only" wording.
   - **Duplicated origins:** `knownOrigin` before new IDs in `duplicateDraft`; unknown stays unknown; copies unapproved and out of the PDF; originals and versions untouched.
   - Regressions: `tests/reviewFindings110b.test.ts`.
2. **The owner** decides on merge (pinned: `gh pr merge 110 --merge --match-head-commit <reviewed head>`), then reads main CI and the production deployment once.
3. **Then, only with the owner's explicit approval and budget:** a fresh fake rehearsal on the merged build, then the Claude-led live take (`recorder/live-take-plan-analysis.md` outside Git). The proposed USD 5 allowance is **not approved**.

### Previous task (done 21 November 2026, don't rerun): re-review PR #110 (review fixes, proposal brief and the Claude-led workflow)

Saved on 21 November 2026. [PR #110](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/pull/110) on `feat/client-discovery-stratovell-ai`, `main` at `7aab3f4`. Two batches await independent Codex review; **neither is approved**. Verify heads, tree and stash first, and preserve newer work.

1. **Codex** re-reviews the review fixes and the proposal brief (`59430bf`, `034fe50`, `c9a5153`; see the previous task below and the [impact note](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/pull/110#issuecomment-7064058137)).
2. **Codex** reviews the Claude-led workflow ([impact note](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/pull/110#issuecomment-7066165327)):
   - **`eaf56a2`, Portfolio checks:** the template generator (`recommendationFromInsight`, "Convert to recommendation") is gone; Insights left the navigation and is the Portfolio checks view in Stratovell AI (`/insights` redirects to `/copilot?view=checks`); each check has a basis (rule, observed figure, product-default threshold, scope, valuation dates, limits); thresholds unchanged; trade-prescribing wording removed; "Analyze this finding" only prefills.
   - **`808c1e7`, Claude as the only AI source and recommendation origins:** request `runAs` and the server's 409 `run_mode_mismatch` before engines or live admission; hosted demo offers only a separately chosen scripted example; server-stamped `Recommendation.origin` (claude with models, example: scripted/test/sample, advisor, unrecorded); edits keep the source and record `editedByAdvisorAt`; older records labelled only from reliable evidence; v11 backup and snapshot schemas carry it (older envelopes strict); historical versions byte-identical; prompt and tools `claude-led-2026-11-21`.
   - **`288f3fd`:** readable basis text. **`6630392`:** an edited prewritten sample record stays labelled as the sample's.
   - Check in particular: no path turns a rule flag into a recommendation; a fake or scripted run is never labelled Claude's; approval invalidation, the simulation-to-draft binding, figure checks and final-PDF gates are unchanged.
3. **The owner** decides on merge (pinned: `gh pr merge 110 --merge --match-head-commit <reviewed head>`), then reads main CI and the production deployment once.
4. **Then, only with the owner's explicit approval and budget:** a fresh fake rehearsal on the merged build, then the Claude-led live take (`recorder/live-take-plan-analysis.md` outside Git). The proposed USD 5 allowance is **not approved**.

**Rehearsal on this build (outside Git):** Fake-provider rehearsal v3 of the Claude-led workflow on build `VGMtmllG-FBJAaAYk8rc-` (code `288f3fd`; isolated profile and state folder `work\atlas-local-analysis-fake3`, no key): run `work\analysis-fake-2026-11-21T17-31-22-317Z`, **198 of 198 recorder checks** (Portfolio checks with their basis and no recommendation created; the answer, draft, record and version labelled as test-provider examples, never Claude's; figures 6 of 6 matched; version 1 `9fc2565190438b37`; final PDF with the frozen brief). Chapter `output-analysis-rehearsal-v3` 4:35.9, validation 27 of 27; cut `output-revised-cut-rehearsal-v3` 5:53.5, 7 of 7; voiceover package `10-analysis-rehearsal-v3` exact, round trip 5 of 5. It proves the flow, not Claude's analysis.

**Carried forward for the demo (outside Git):** Stratovell AI labels; the shortened connection guide v2; the non-prescriptive analysis question (`recorder/analysis-question.txt`; the earlier one kept as `analysis-question.v1-superseded.txt`); the workflow sentence ("The advisor records the client's objectives. Stratovell checks the portfolio data and calculates possible changes. Claude analyzes that information and prepares recommendations for advisor review and approval."); Portfolio checks instead of Insights; origin labels on the answer, draft, record and version; readable answer holds; the completed-session counters framed without the next-session form; the PDF detail shots and the frozen client brief; the temporary Windows voice with masters, scripts, segments, captions and cue timings kept; no paid voice service; the key entered privately for that server session only, Stop and Disconnect on completion or failure.

### Previous task (done 21 November 2026, don't rerun): re-review checkpoint for the review fixes

Saved on 21 November 2026. [PR #110](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/pull/110) on `feat/client-discovery-stratovell-ai`: the review fixes and the proposal brief are at code `c9a5153` (on top of the reviewed `c9a4ac6`), followed by a docs-only checkpoint. `main` is at `7aab3f4`. Verify heads, tree and stash first, and preserve newer work.

1. **Codex** re-reviews from `c9a4ac6` (impact note: [comment](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/pull/110#issuecomment-7064058137)):
   - **`59430bf`, finding 1:** every discovery free-text field excluded from evidence; the brief's figures tagged as client-brief evidence and reported in `FigureCheck.clientStated`, never matched; engine figures still match. **Finding 2:** per-100 only for a bond type, or for fixed income identified by a CUSIP or ISIN with no instrument type; ETFs, funds and shares per unit. **Finding 3:** `numberFieldEdit` and `NumberField`: an invalid or negative edit shows an error (`aria-invalid`, `role="alert"`) and records no value (amount removed, or time horizon Not discussed), so no older reviewed answer stands behind it.
   - **`034fe50`, the proposal brief:** `inputs.clientBrief` frozen for new versions (fingerprinted, strict v11 schema, no private notes or analysis note); the template presents it instead of the older levels; historical versions byte-identical (seeded fingerprint and markup hashes from the reviewed code); `snapshotStatus` ignores the field for versions without it; the route refuses a tampered or unknown brief; workspace drafts compute the brief on the server.
   - **`c9a5153`:** the number-field error text.
2. **The owner** decides on merge (pinned: `gh pr merge 110 --merge --match-head-commit <reviewed head>`), then reads main CI and the production deployment once.
3. **Then, only with the owner's explicit approval and budget:** a fresh fake rehearsal on the merged build, then the analysis-led live take (`recorder/live-take-plan-analysis.md` outside Git). The proposed USD 5 allowance is **not approved**.

**Carried forward for the demo (outside Git):** Stratovell AI labels; the shortened connection guide v2; the analysis-led question; readable answer holds; the completed-session counters framed without the next-session form; the PDF detail shots (approved-change row, holdings) and now the frozen client brief in the PDF; the temporary Windows voice with masters, scripts, segments, captions and cue timings kept; no paid voice service; the key entered privately for that server session only, Stop and Disconnect on completion or failure.

### Previous task (done 21 November 2026, don't rerun): fix the PR #110 review findings

Saved on 20 November 2026. **Opus 5.5 · High effort.** [PR #110](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/pull/110) was reviewed at `c9a4ac67502d7c64c9d59d3cb4627919faf70cff` (`main` at `7aab3f4`); every reported check passed, but the merge is on hold for three findings ([record](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/pull/110#issuecomment-7055631506)). Verify heads, tree and stash first; the branch head may be a later docs-only checkpoint on top of `c9a4ac6`. Preserve all work and recordings. No amend or force-push.

```text
Fix the three PR #110 review findings in one batch on feat/client-discovery-stratovell-ai, and resolve the PDF presentation decision. Do not run a live take.

Read CLAUDE.md, the handoff and this task. Verify local/GitHub heads, tree and stash. The reviewed code basis is c9a4ac6; build on the current branch head.

First write failing regressions through real paths (they must fail on c9a4ac6), then fix together:
1. src/copilot/tools.ts: discovery.otherConstraints (and any other advisor-typed discovery text) belongs in the untrusted-text exclusions. A figure typed there (e.g. USD 987,654,321.23) must never count as evidence; an answer that calls it calculated cash must be flagged unsupported. Cover reviewed and unreviewed answers, through the real agent loop and figure check.
2. src/engines/quantityPrice.ts: per-100 pricing only for bond-type instruments, not for an ETF or mutual fund classed as fixed income. Quantity 100, price 100, value 100 on a fixed-income ETF/fund must warn; a correctly priced bond still must not; ordinary shares and genuine mismatches as before. Re-trace Insights, readiness and AI consumers and the sample baseline.
3. DiscoveryQuestionnaire.tsx NumberField: an invalid edit (e.g. -100000, or non-numeric text) must never leave a stored value and its reviewed status looking current. Show a validation error, keep the stored value visibly distinct or require a valid value, and never mark a review current for a value the field doesn't show. Test through the actual input handler.

Then resolve the PDF presentation (owner decision; recommended): a version approved with discovery renders its own frozen, reviewed brief in the PDF and meeting view (answers with review status, unknowns, conflicts; no private notes); a version without discovery, and every historical approved version, renders exactly as before. Write the contract-impact note first (template, approved-version rendering, final-PDF route), prove historical versions are byte-identical in content and fingerprint, and check the rendered PDF.

Keep: the terminology (Stratovell AI, Analyze portfolio, AI connection, Connect Claude; technical identifiers unchanged); privacy (no identity or private discovery notes in model-bound data or the PDF brief; the shared redaction); store/backup v11 compatibility; model, effort, fallbacks, authority and spending unchanged.

Run typecheck, full UTC tests, eval and build; a browser check of the questionnaire edit and, if the template changes, a PDF check. Push new commits (no amend or force-push), update the PR, handoff, saved next command and the outside-Git REPORT.md, read CI once, and stop for re-review.

No merge, paid request, live take, recording retry, settings change, publication, dependency upgrade or mobile work. The proposed USD 5 live-take allowance is not approved.
```

**Carried forward for the demo (outside Git):**
- **Recording:** the analysis-led recorder, the guide v2, the storyboard and the PDF pickup stay as they are. Any later take needs a fresh rehearsal on the fixed build, then the owner's explicit approval of a session and budget. The key is entered privately, for that server session only, and is never read or recorded. Stop and Disconnect on completion or failure.
- **Voiceover:** the Windows narration stays temporary. Keep masters, scripts, sentence segments, captions and cue timings. The final voice pass comes after the picture and wording are approved, with no paid voice service.

### Previous task (reviewed 20 November 2026 at `c9a4ac6`; merge on hold for three findings, don't rerun): review client discovery and Stratovell AI (PR #110)

Saved on 20 November 2026. [PR #110](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/pull/110) is on branch `feat/client-discovery-stratovell-ai`, from `main` at `7aab3f4` (PR #108, released and verified). Impact notes: [#109](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/109) and [#46](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/46#issuecomment-7052076612). Verify heads, tree and stash first, and preserve newer work.

1. **Codex** reviews PR #110 at its head, commit by commit:
   - **#46 (partial):** `engines/quantityPrice.ts` gives one convention to the import warning, the import's classification and the holding check; per 100 is accepted in the holding check only for fixed income or a bond type; a share that matches only per 100, and every genuine mismatch, still warn. The sample's insight list loses exactly one false note.
   - **The discovery contract:** absent `discovery` means "Not discussed yet" everywhere; no default, older level or older text is read or adopted as an answer; reviews go stale on a changed answer or clarification; store v11 is a no-op migration; backup v11 restores v6–v10 and the older envelopes stay strict; the export allow-list walks the record; versions approved before discovery are byte-identical and still issue; a tampered frozen discovery is refused by the final-PDF route.
   - **The model-bound brief:** `get_portfolio_overview` carries `client_brief` (review status, unknowns, conflicts, missing details, the advisor's note); no names (shared `redactIdentity`), no `advisorDiscoveryNotes`, no older levels; restricted investments on file are still sent as unconfirmed. The prompt changes are instructions only; model, effort, fallbacks, tool authority, accounting and spending are unchanged. A discovery edit or review changes the input revision, and Add refuses the stale preview.
   - **The UI and terminology:** accessible selection buttons, the brief with "What a live analysis sends to Anthropic", the private-notes card, the earlier levels for the PDF; "Stratovell AI", "Analyze portfolio", "AI connection", "Connect Claude"; technical identifiers unchanged; old "Proposal Copilot" draft notes still recognized; the fake provider is still described as not a model.
2. **The owner** decides on merge (pinned: `gh pr merge 110 --merge --match-head-commit <reviewed head>`), then reads main CI and the production deployment once. No paid call is part of this step.
3. **Then, only with the owner's explicit approval and budget:** the revised, analysis-led live take. Its plan is saved outside Git (the owner's demo folder: `recorder/live-take-plan-analysis.md`, recorder `record-analysis.cjs`, proven by a captured fake-provider rehearsal). **Proposed session:** 1 run, 10 HTTP requests, 30 minutes, and a **USD 5 estimated guard** (the app's maximum). USD 3 is too tight for this question: each request is first reserved at its worst case (about USD 2.71), so a USD 3 guard stops further requests once about USD 0.29 is spent, and comparing two simulations takes about 6 to 9 requests. Expected about USD 0.30 to 0.80, estimated from list prices; the Console workspace's spend limit is the real cap. The key is entered by the owner privately for that server session only, never read or recorded; the session is stopped and the key disconnected on completion or failure.
4. **Still open, unchanged:** the PDF's client-profile block (older levels or the brief: owner decision); #106 and #107; the rest of R11; publication decisions (#35 counsel and the announcement gate, #85, #87, Vercel settings, closing PR #80); mobile stays parked (draft PR #98 at `59f6a9b`, #92, #93, #97); the R25 study and the 27-trial paid evaluation.

### Previous task (done 20 November 2026; PR #108 merged as `7aab3f4` and verified, don't rerun): review the statement-import fixes (PR #108)

Saved on 20 November 2026. [PR #108](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/pull/108) is on branch `fix/import-statement-dates-bond-class`, from `main` at `bb1ff9f`.
- Application commit `5a02b8d`, then docs.
- **Review follow-up `03c2344`**, from the reviewed head `0664b40`:
  - a zero or out-of-range numeric date gives an unknown date with a reason, not a crash;
  - a separate-cell labelled value that is ambiguous, impossible or unreadable is reported, and never replaced by another labelled date;
  - bare headers are still ignored.

Re-review the diff from `0664b40`. It fixes the two defects that stopped the demo's statement-import chapter:
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
