# Handoff

## Current checkpoint — 28 November 2026: #119 "Prepare allocation proposal" (draft PR #120, stacked on PR #117) — the independent review's findings 1–6 are fixed and await re-review

- **Correction to the earlier #119 description:** Claude supplies the **proposed weights**. The engines calculate the current weights, check whether the trades can be funded and executed, and calculate the resulting allocation. Matching those calculations does not establish that the proposal is appropriate for the client.
- **Fixed (review of `d004791`), each with failing-first regressions** in `tests/allocationProposalReview.test.ts` (fixture `tests/support/allocationFixture.ts`):
  1. The brief and scope must reach the model on an earlier turn; only one completed, validated decision is addable; the decision tool exists only for the allocation task; the five-record limit counts strategy + legs.
  2. Executable amounts per holding, group and selection (after existing actions, in run order), shared by preview and Add; restrictions apply in the trade's direction.
  3. Claude's weights and gaps are reported as the proposal, never as engine evidence; the card's texts are checked too.
  4. Actual scope account IDs and a material basis (brief, holdings and values, FX, scope) are saved; a change blocks approving or issuing a new version until **Record re-review** (Recommendations card, with a note); prior versions stay frozen. The PDF and meeting view quote the client "when proposed" and show the brief's answer now and the re-review note.
  5. Zero-group / no-eligible-holding proposals show the achievable mix, gap and reason with an explicit strategy-only Add; a hold is exact, $0 of action, with existing actions shown apart.
  6. One validation for creation and backup restore.
- **Not done / limits:** test provider and scripted stand-ins only (not evidence of advice quality); no live Claude run; tax effects unknown; public preview out of scope; no new-security proposals.
- **Evidence (outside Git):** `evidence/allocation-review-2026-11-27/` (logs, browser screenshots, rendered final PDFs v1/v2). Impact note on PR #120.
- **Next:** independent re-review of PR #120. No merge; PR #117 is unchanged.

## Previous checkpoint — 27 November 2026: Codex's re-review of PR #117 passed at `82b7751`; private-UAT 0.1.2 built and UAT-tested installed; the one defect it found (#118) is fixed on the branch and awaits Codex review; production rollback still awaits the owner's Vercel re-verification

- **27 November: #118 fixed on PR #117** (source work and headless tests; the 0.1.2 binary is unchanged and stays the tested artifact).
  - **The defect:** found by the installed-app UAT. While every saved copy is unreadable, the window holds only the fictional sample, so a default Settings restore ("keep current firm & branding") saved the sample's firm, or an edit typed while saving was paused, instead of the backup's.
  - **The fix:**
    - One rule, `restoreTakesBackupFirm` in `src/engines/workspaceBackup.ts`: a restore takes the backup's firm when the advisor chooses it, or while the saved workspace is unreadable.
    - A store action, `restoreBackup`, applies it; Settings calls that action.
    - A read-only IPC call, `stratovell:workspace:status`, answered only for the app's own pages, tells the page about the load problem.
    - During a load problem the preview says the workspace couldn't be read and that the firm comes from the backup.
  - **Unchanged:** outside a load problem, nothing.
  - **Evidence:** the "#118" block of `tests/desktopReliability.test.ts`, with a failing-first log outside Git in `evidence/fix-118-2026-11-27/`. The impact note is on [#118](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/118).
- **27 November: installed-app UAT of 0.1.2**, owner-authorized. The first launch was visible, with the owner present; one isolated data folder; the test provider and dummy credentials only.
  - **Results:** all five stages ran. Raw: 131 passed, 5 failed. Three failures were test-script faults, corrected. Two are #118.
  - **Network:** no connection to a non-loopback address was observed.
  - **Not reproduced manually:** the stale-restore race; it is covered headless only.
  - **PDF:** the overflow pages are the existing #114, identical in 0.1.0.
  - **Record:** outside Git, `evidence/pr117-uat-0.1.2-installed-2026-11-27/UAT-RESULTS.md`, and REPORT.md section 34.
- **25 November, third batch:** Codex's source re-review passed at `82b7751b1f7bc03b7d001ee2ac859761f68f8c44` (CI: 992 tests and 2 private-fixture skips).
  - The unsigned private-UAT installer **0.1.2** was built from it: `dist-desktop\0.1.2\…` (outside Git), 131,674,610 bytes, SHA-256 `bd14e02c18ad8b77d13340d42a39cc8b011246fb59adde86a009dc72f59d57a5`.
  - 45 of 45 static checks passed.
- **25 November, second batch: Codex's re-review of `055f99b`** (source work and headless tests only). Three more findings are fixed in `f935e84`, each with a regression that failed first (the "re-review" block of `tests/desktopReliability.test.ts`; logs in `evidence/pr117-rereview-2026-11-25/`):
  1. **A Settings restore from a stale window bypassed the revision check:** its rollback read advanced the revision. The rollback copy is now peeked, so a stale restore is refused, the window refreshes, and the advisor retries. Tested through the real `restoreWorkspace`: newer firm details and an approved version are kept.
  2. **A failed restore cleared the load-problem guard.** The guard now stays until the replacement is on disk, the unreadable files are kept once, and a retry succeeds. Start over remains a separate choice.
  3. **An unlistable `backups` path blocked a healthy workspace.** The current file is now read first. A listing failure is a load problem only when a fallback is needed, and the daily copy is best-effort.
  - The [Install as app note](roadmap/INSTALL_AS_APP_ASSESSMENT.md) is corrected:
    - CMEK and zero-data-retention organizations start with the settings off, and apps aren't covered by zero data retention; HIPAA and hybrid deployments are separate.
    - The shared-link limits are documented, but behaviour for installed recipients is unverified.
    - A local MCP adapter remains possible.
    - PDF fidelity, storage and porting effort are unverified.
    - Electron is recommended because it is implemented and a migration is uncertain.
- **25 November, first batch (source work and headless tests only; Electron not launched, no installer run):**
  - **Codex review of `fd2db60`: NOT approved, with four findings.** All four are now fixed on PR #117, each with regression tests that failed before the fix and pass after it (`tests/desktopReliability.test.ts`; failing-first logs outside Git in `evidence/pr117-fixes-2026-11-25/`):
    - **A:** an unreadable workspace is reported as unreadable, never as new. Nothing is changed, saving is paused until the advisor chooses, and the unreadable files are kept in `unreadable-<time>/`.
    - **B:** writes are checked against a revision, so a stale window can't overwrite newer changes or approved versions.
    - **C:** a failed restore keeps the earlier unsaved workspace.
    - **D:** Getting started asks unless the workspace is the untouched sample, judged by content.
  - **The IPC handlers and the preload bridge now live in `desktop/shared/`**, so the tests drive the real code over an in-memory IPC.
  - **The freeze wording is corrected** (see the incident below).
  - **Install as app:** [INSTALL_AS_APP_ASSESSMENT.md](roadmap/INSTALL_AS_APP_ASSESSMENT.md). Keep the Electron route; no port, second UI or MCP. The note was revised in the second batch.
  - **Not covered by this batch:** the fixes are not checked in a running app (the notices are unrendered, and the cost of the synchronous save call is unmeasured). The 0.1.0 installer (built from `476e71d`) is the **pre-fix** artifact.

- **Released before this checkpoint (detail in [history (24 November)](CLAUDE_HANDOFF_HISTORY_2026-11-24.md) and earlier files):** D1–D4, the D5 gates and fixes, the Stratovell rename, PR #110 (`58deeb0`), PR #112 (`1f17770`) and **PR #115 (#113), merged as `831612cbb95bb91d528dfcb438dd612de03a41fe`**, release-verified (main CI, Production deployment 8032420343, smoke 18/18). Saved examples, "Approve all eligible", the analysis-inputs summary and the `target_pct` label from #115 remain.
- **Hosted pilot (#113), live briefly on 24 November and now retired.** It ran owner-only on Production, with a Neon Free database, a GitHub allow-list of `tylerbarnard23-PM`, and zero provider requests; no real Claude analysis ran. The checkpoint is REPORT.md section 32 and the [PR #115 comment](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/pull/115#issuecomment-7139409869).
  - **Retained, nothing deleted, and not inactive:** until the owner verifies the rollback, production still runs the hosted pilot (`COPILOT_MODE=hosted` at `831612c`) and uses this infrastructure. It covers Neon `stratovell-hosted` and its integration and rows, `STRATOVELL_CREDENTIAL_KEYS`, the GitHub OAuth app (exactly one active secret, "Last used"; the exposed one was revoked by the owner) and the Production variables.
  - **Production rollback:** authorized by the owner on 24 November: set `COPILOT_MODE=demo`, then redeploy the approved release. It is **not yet done**: Vercel requires the owner's own re-verification (passkey or authenticator) to edit that variable, so I cancelled the prompt and changed nothing. Until it is done, production still runs hosted mode at `831612c`. Once this PR is merged, the code itself treats `hosted` as the scripted demo.
  - The two-account hosted tests are superseded.
- **#116 desktop application, PR open:** branch `feat/desktop-windows-app` from main `831612c`. The impact note is on [#116](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/116). Architecture, build, signing and update path: [DESKTOP_APP.md](roadmap/DESKTOP_APP.md).
  - **Shape:** Electron 45.4.1 around the unchanged Next.js server.
    - **Persistence:** the workspace is saved to a per-user file, atomically, with a previous copy, daily backups and recovery.
    - **Local service:** a utility process on 127.0.0.1 with an allow-listed environment. The window pairs itself; CSRF, the credential store and the session gate are unchanged.
    - **PDFs:** printed with Electron's Chromium after the unchanged route gates.
    - **Window and quit:** a single instance; hardware acceleration off; closing stops the session and keeps its counters.
    - **Pages:** the welcome workflow page, the website's `/download` entry (no link until an approved release is recorded) and the preview banner.
  - **Hosted code removed:** sign-in, cloud keys, Postgres, their routes and `pg`.
  - **Installers** (all unsigned, private UAT, outside Git):
    - **0.1.0**, from `476e71d`: the pre-fix artifact, never relabelled. Its record is on the PR and in REPORT.md section 33.
    - **0.1.1:** an update-path test build only.
    - **0.1.2**, from `82b7751`: installed-app UAT done 27 November. It does **not** contain the #118 fix.
  - **Tested on Windows 11 Home 10.0.26200 only (the build machine). No clean-machine test.**
    - The 68 installed-app checks ran on 0.1.0. The 0.1.2 UAT is a separate, current record. Both are my own reported results; Codex hasn't repeated them independently.
    - No real Claude request was made, and no public download is approved.
- **Incident, 24 November:** the computer froze during the first visible desktop-window test of an unpacked Electron 45 build (hybrid AMD/NVIDIA laptop, 2022 NVIDIA driver). The owner forced a restart.
  - **The cause is unconfirmed.** A graphics-driver hang is a hypothesis only.
  - **Mitigations, not guarantees:** hardware acceleration is off. Later automated checks ran off-screen with `--disable-gpu` and a watchdog, and nothing froze again. That doesn't show a freeze can't recur, and those scripted checks were not a recovery test of the incident.
  - **Evidence** is kept outside Git (`evidence/pr116-desktop-2026-11-24/incident-and-run-logs/`, REPORT.md section 33).
- **Separate follow-ups (unchanged, not in #116):**
  - [#114](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/114): final-PDF pagination. The Client Profile section overflows onto a near-blank page, and footer numbers don't match the PDF's pages.
  - **The restriction-confirmation finding:** re-entering an unchanged restricted list records nothing (`ListQuestion` in `src/components/profile/DiscoveryQuestionnaire.tsx`). It needs an explicit "Confirm existing restrictions" followed by separate review. Restrictions stay enforced throughout.
  - Also: database TLS `verify-full` (now moot unless hosted returns), the "1 analyses" pluralization, and code signing before any public release.
- **Desktop demo: implementation, production verification and rehearsal are complete.** The recording package (PR #100: docs and ten synthetic captures only) holds the production evidence, a second fresh-profile rehearsal of the walkthrough, the narration outline and the capture checklist: [D5_RECORDING_PACKAGE.md](roadmap/D5_RECORDING_PACKAGE.md); its merge is recorded on PR #100 and [#57](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/57). **The owner's next task is to record and edit the video** of the scripted, synthetic demo. The R25 scorecard stays empty; no usability claim.
- **Delivered contracts to build on (store/backup v11, PR #110):** scope, alternatives and the shared desk evaluator (D1/D2); versioned models and sleeves (D2a); append-only approved versions, one meeting-view/PDF template and server re-gating (D3); the context-bound agent with preview and explicit Add, labelled demo/test/live modes (PR #110: Claude-only AI recommendations with recorded origins; Portfolio checks), and local onboarding with a user-owned key (D4). Earlier detail: [history (28 October)](CLAUDE_HANDOFF_HISTORY_2026-10-28.md), [history (16 November)](CLAUDE_HANDOFF_HISTORY_2026-11-16.md).
- **Remaining work (concise):**
  - **Owner decisions:** counsel's clearance of Stratovell (#35); [#85](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/85) secret scanning and push protection; [#87](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/87) PDF-route abuse controls; Vercel access (its settings remain unread); closing PR #80 as superseded.
  - D5: the R25 study itself (when participants exist); deferred mobile findings [#92](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/92), [#93](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/93), [#97](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/97) (draft PR #98 parked); the secrets and exposure gate items before any publication.
  - Agent: the 27-trial evaluation and real-model browser checks (budget unapproved; one owner-operated run has passed); finding 3's pairing policy; [#83](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/83); [#84](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/84).
  - Other: #76. Real-client use still requires #59.
- **Next action (pickup order, saved 27 November 2026):**
  1. **Codex reviews the #118 fix on PR #117** at the head named in the PR description. Address its findings, each with a regression test written first.
  2. **Only after that review passes, and on the owner's instruction:**
     - Build private UAT **0.1.3** in a new version folder. Keep 0.1.0–0.1.2 and their records.
     - Re-run the installed recovery stage (including a default restore during a load problem) and a short smoke test. The owner authorizes the controlled launches: no GPU, the watchdog, one isolated data folder.
     - Then the owner's UAT, ideally on a second, clean Windows computer. The checklist is outside Git: `evidence/pr117-uat-0.1.2-2026-11-25/DESKTOP-UAT-CHECKLIST-0.1.2.md`. Record failures; fix nothing silently.
  3. **Separately, when the owner's Vercel re-verification is available:** the authorized production rollback.
     - Set Production `COPILOT_MODE=demo` and redeploy `831612c`.
     - Then run the keyless check: the site must be scripted, and hosted credential, session and analysis operations must be refused, also with an existing signed-in cookie.
     - Record it on #116 and PR #115. Delete nothing.

     This step doesn't block steps 1 and 2.
  4. **Release decisions (owner):** code signing (a certificate, purchased only on the owner's instruction); where installers are published; when `src/domain/desktopRelease.ts` records an approved release; counsel's clearance of the name (#35).
  5. **Only then:** the recorder update and a free labelled rehearsal on the desktop build; separate approval before any real Claude analysis (the USD 5 take is still **unapproved**); the cut review before replacing the Windows voice.
  - Merge, publication of an installer, announcement, paid requests, re-recording, mobile and MCP work all need the owner's explicit instruction. Keep #114 and the restriction finding separate. Preserve all originals, recordings, voiceover packages, the stash, worktrees, `launch.json` and browser data. See "Next task" in [CLAUDE_COMMANDS.md](roadmap/CLAUDE_COMMANDS.md).
  - **Publication decisions stay open:** #35, [#85](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/85), [#87](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/87). The R25 study and the 27-trial paid evaluation remain unperformed.
- **Limitations carried forward:** replacements stay within one account and its cash currency; alternatives and library entries can't be deleted; no reserve conversion helper. D2a has no manager feeds, verified offerings, automatic funding sales, fee aggregation or nested models. D3 versions are local records, not tamper-proof books and records. Readiness labels, but doesn't refuse, an approved action outside a version's scope. All 25 R-plans remain Planned or partial; no scope issue closes.
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

Keep this file to the latest checkpoint, rules and next command (roughly 100 lines or fewer). Move superseded notes to a same-directory history file when needed rather than appending every release forever. Earlier checkpoints are preserved in [CLAUDE_HANDOFF_HISTORY_2026-10-24.md](CLAUDE_HANDOFF_HISTORY_2026-10-24.md), [CLAUDE_HANDOFF_HISTORY_2026-10-28.md](CLAUDE_HANDOFF_HISTORY_2026-10-28.md), [CLAUDE_HANDOFF_HISTORY_2026-11-16.md](CLAUDE_HANDOFF_HISTORY_2026-11-16.md), [CLAUDE_HANDOFF_HISTORY_2026-11-17.md](CLAUDE_HANDOFF_HISTORY_2026-11-17.md) and [CLAUDE_HANDOFF_HISTORY_2026-11-20.md](CLAUDE_HANDOFF_HISTORY_2026-11-20.md), [CLAUDE_HANDOFF_HISTORY_2026-11-23.md](CLAUDE_HANDOFF_HISTORY_2026-11-23.md), [CLAUDE_HANDOFF_HISTORY_2026-11-24.md](CLAUDE_HANDOFF_HISTORY_2026-11-24.md); the D2 release record is on [PR #75](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/pull/75) and the licensing correction in [LICENSING.md](../LICENSING.md). Do not load them automatically.

For the next package read [the delivery plan](roadmap/DEMO_DELIVERY_PLAN.md), [the command playbook](roadmap/CLAUDE_COMMANDS.md), the shared implementation rules and only the needed plan/code contracts. Start from [CLAUDE.md](../CLAUDE.md); for financial or persisted-state changes use the [contract impact checklist](CONTRACT_IMPACT_CHECKLIST.md). All 25 plans remain linked from [ROADMAP.md](../ROADMAP.md), not prerequisites to read in full each session.
