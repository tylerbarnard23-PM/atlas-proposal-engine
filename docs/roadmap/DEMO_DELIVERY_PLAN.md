# Demo-first delivery plan

Approved planning direction: **24 October 2026**, Tyler Barnard. Parent [#36](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/36). This changes prioritization and execution, not application behavior. All 25 R01–R25 directions remain accepted and traceable; a delivered minimum slice does not complete its broader plan.

## The next release goal

Deliver a convincing, complete **synthetic advisor workflow for the employer-facing portfolio**:

Import and reconcile → select investment scope → design a funded reallocation → compare two alternatives → obtain a bounded agent draft → review and approve → present the same version on screen and in PDF.

The public demo stays scripted/synthetic; a separately enabled local live-agent demonstration must have its own recorded evidence. This milestone is not a real-client production launch. Do not claim production readiness, institutional compliance or completed PII protection from completing it.

## What changes about the way we work

- Build the five original delivery packages plus the bounded D2a model/manager slice, not all 25 feature plans serially. Start the allocation workspace next. The small R11 wording/identifier change is already delivered (PR #70 (merged `8b06b6a`)); do not repeat it.
- Implement the minimum required contracts alongside the first visible task that uses them. Do not finish every dependency's advanced UX before showing a useful workspace. An early grid is not permission to add separate UI arithmetic or bypass funding/approval rules.
- Default to one reviewable PR per package. D1 may need two linked PRs (minimum persisted contracts/backup migration, then the visible workspace); split another package only for a concrete independently testable migration or financial contract, not for copy/docs separately. Do not put all delivery packages in one branch.
- One Claude command owns inspect → implement → focused tests → self-review/fix → final validation → save/docs → open PR. One Codex review checkpoint follows a completed package or justified split. Fix all blocking findings together on the same PR.
- Keep the active handoff short; previous notes are archived in [CLAUDE_HANDOFF_HISTORY_2026-10-24.md](../CLAUDE_HANDOFF_HISTORY_2026-10-24.md) and read only for a specific need. Do not load the whole archive or all 25 plans each session.
- Keep documentation in the feature PR. Put merge/deployment evidence in that PR and the issue; refresh the handoff with the next substantive branch. No release-only checkpoint PR or repeated full-roadmap rewrite.
- Low/Medium/High effort are the available controls for **Claude Code Desktop on Opus 5.5**. There is no assumed Sonnet switch. Development-assistant settings are separate from Atlas's API model/provider configuration.

This is a smaller first milestone, not a promise that AI can implement the full roadmap in days. The previous 4–6-week demo range is only an unmeasured planning hypothesis. Re-estimate after D1 and D2 using actual sessions, review loops and blockers; do not invent a new deadline or completion percentage. The immediate evidence of acceleration is a usable workbench, fewer handoffs and complete tasks per PR.

## Current evidence and start point

- **D1 in review:** PR #72 (`feat/d1-allocation-desk`, implementation `ee55b96`) built from main `bc248e1` (PR #71 merged). Contract notes are in the PR. D2 starts only after D1's review/release.
- Observed main: `8b06b6a842d8b11adc1b96967c78aee9c0e12a6c` (PR #70, merged 24 October 2026; main CI run 40101245056: **402 passed, 2 skipped, 404 total**, eval 2/2, typecheck and build; GitHub Production deployment for that SHA). Before it: `7d5999fa01e15a1271bb81812cd8cabbbf58d095` (PR #69, R18 slice 1). PR #68's audit is merged as `298b719`; R23a is merged as `e56335e`.
- PR #69 reviewed head: `7619327ca7093a3351760f826560e3c577a30faf`. Main CI run 40097812771 passed: **393 passed, 2 skipped, 395 total**, eval 2/2, typecheck and build. The two skips need the private UBS PDF; the reported local suite passed all 395.
- Release evidence on [PR #69](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/pull/69#issuecomment-6384766252) and [#51](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/51#issuecomment-6384766474) records production draft/final-control tests, 422 missing-FX/incomplete-import gates, New York/UTC approval-date parity and exact browser-workspace restoration. These are prior release observations, not tests performed by this plan.
- [PR #70](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/pull/70) (`feat/r18-r11-review-wording`) appeared while this plan was drafted. It was Codex-reviewed at `6449889bfbf9a07ff3a45c8446301e87693a8c4b` and merged pinned as `8b06b6a842d8b11adc1b96967c78aee9c0e12a6c`. Its cleanup counts toward D1 and must not be repeated. The prior standalone R11-first command is superseded for new work; **D1 is the next substantial feature**, not another cleanup PR. Recheck actual heads/status before starting.

## Delivery sequence: D1 → D2 → D2a → D3 → D4 → D5

| Package | Advisor-visible result | Minimum contributing plans | Exit evidence |
|---|---|---|---|
| **D1 — Working allocation desk** | One workspace shows selected investment scope, current/proposed/target mix, drift and a contextual holding edit. | R01/R02/R03/R05/R07/R08, minimum R06/R11/R12/R14/R19a/R25 contracts | Scope excludes context wealth without losing it; explicit draft actions use the shared evaluator; save/reload/backup work; current holdings/approvals do not change during preview. |
| **D2 — Funded alternatives** | Replace into a new investment, preserve a cash reserve, duplicate and compare two named alternatives. | R04/R05/R06 with existing R02/R07/R08/R12/R14 | Real source/destination identities, atomic legs, correct FX and eligible funding; reserve breach blocks; two independent alternatives reconcile. |
| **D2a — Model and manager proposals** | Select versioned target models and propose funded manager/strategy sleeves with explicit exposure and fee coverage. | R03/R04; bounded R05/R06/R14/R16/R19 contracts, [#73](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/73) | No sleeve/component double counting; unknown exposure stays unknown; minimums/reserves enforced; definition revisions and alternatives isolated. |
| **D3 — Review once, present consistently** | Approve a complete version, then show that same version in a concise local presentation and PDF. | R19/R20/R21; concise R01/R12/R16 | The reviewed inputs/actions/FX and outputs are captured together; later edits make a new draft; amounts match every surface; unknown costs/tax/risk stay explicit. |
| **D4 — Demonstrate the bounded agent** | From the active portfolio/scenario, investigate → simulate → draft with evidence, then explicit advisor review. | R22 and its existing evaluation plan | Real orchestration tested offline, no duplicate/unauthorized actions, numbers agree with tools; a capped opt-in local live run supplies evidence for any live-agent claim. |
| **D5 — Package for LinkedIn** | A short, repeatable end-to-end demonstration with honest limits, accessible controls and screened visible branding. | R01/R25, naming #35, README/demo evidence | Golden-path and blocked-path checks, keyboard flow, actual evidence/limitations, name decision and preserved URLs/storage keys; no unearned production/usability claims. |

Packages are coordinated slices, not new feature IDs. D1's early R03 view does not depend on a completed new-security catalog, full R05 history or all R06 transfer features. It does depend on the minimum scope, draft membership/intent and shared-evaluation contracts described below. D4 can add offline loop fixtures during D1–D3 without delaying those packages, but its contextual UI uses the delivered contracts. No concurrent writers on the same branch.

### D1: build the workbench next

- Reuse the existing import/reconciliation flow and recommendation preview. Create one focused portfolio-design route/panel, not a redesign of every navigation page. Show account scope and excluded/context wealth beside current/proposed/target asset-class values/weights and remaining drift.
- Use the original observed holdings as the baseline. Capture the accepted values/source dates and FX/input revision for one active working draft (the minimum R19a record); do not call it an approved snapshot. Separate scenario membership, advisor approval and prose inclusion. Preserve existing recommendation IDs/order/effects and legacy evidence during migration.
- Legacy ambiguous instructions retain their prior interpretation as evidence, but must be explicitly restated before new approval; never silently apply an old implicit size to a new action.
- Support explicit edits to already-owned positions through the existing evaluator. No implicit 50% sell/default full exit. A target is a desired allocation; it does not create orders/holdings. Automatic action generation and new investments wait for D2; show unmet target drift honestly.
- State whether the workspace is previewing selected draft actions or the approved subset. Preview must not approve actions or silently change the final-PDF inputs. Scope selection must not hide existing incomplete-import/missing-value/FX gates; liabilities remain separate from asset-weight denominators.
- Capture only the objective/constraint fields actually needed. A reserve can be recorded, but label enforcement as unavailable until D2 implements it; do not present it as protected yet. Preserve unassessed/unknown states.
- Already delivered by PR #70 (merged `8b06b6a`): review wording and non-penalizing optional identifiers (existing readiness codes and gate results unchanged; old saved identifier warnings non-penalizing without rewriting holdings). Reuse it; do not repeat it. Do not build the full R11 queue, bulk review or bond-price-basis schema first.
- Choose the smallest persisted representation after tracing the current store. If a schema version changes, ship a real versioned/idempotent migration and supported old-backup upgrade in the same implementation. Do not add speculative fields for all later packages.
- If too coupled for one PR, the only default D1 split is (a) scope/draft/input contracts plus backup compatibility and engine behavior, then (b) the visible workbench/context flow. Show the whole planned task and the reason for the split before coding; no separate design-only approval loop for routine choices.

### D2: only supported, funded alternatives

Start with a dollar-based custom/synthetic destination and linked sell/buy group in a supported account. Keep destination identity distinct from current holdings; amounts retain currency. Enforce an explicit reserve on the chosen eligible cash source. Cash-like fund slices or unknown availability must not automatically become withdrawable cash. Unsupported new cross-account/owner/currency transfers remain unresolved; do not invent one or relax legacy financial safeguards. Preserve the already-tested legacy paydown behavior with regressions.

Duplicate the active draft into two named alternatives with independent IDs/actions and cleared alternative approval. Compare using one shared evaluator. No broad model library, optimizer, external security search or rich undo/history is needed for this milestone.

### D2a: models and manager-sleeve proposals

After D2 and before D3 implement [MODEL_AND_MANAGER_PROPOSALS.md](MODEL_AND_MANAGER_PROPOSALS.md). Deliver a small versioned model library and explicit proposed manager/strategy allocations, using D2 funding rather than treating targets as funded investments. Keep sleeve values separate from underlying exposure and disclose unknown minimums/fees/mixes. This supports UMA-style proposals, not UMA administration. Full catalogs and automated rebalancing remain later. D3 must preserve the chosen revisions and sleeve/exposure distinction in the reviewed presentation/PDF; D4 uses the same definitions without expanded authority.

### D3: a real reviewed package, not a screenshot

Capture the selected scope, accepted input/FX revision, current/proposed holdings, ordered actions/funding, explanations, disclosures, approval identity/time and supported assumptions. Use it for the local meeting view and PDF; changing inputs produces a new draft rather than rewriting the saved approved version. A new final-document request still obeys server readiness; historical viewing must not silently refresh rates or bypass current issuance gates.

Reuse one existing template. Show known cost/income inputs with coverage or mark the comparison unavailable; no invented zero/savings, unsupported tax/risk calculations or external data purchase. Capture D2a model/strategy revisions, target versus funded sleeves, exposure coverage and minimum/fee evidence in that same version. Full fee schedules, IPS generation, template administration and remote sharing stay later. Snapshots remain local application records, not tamper-proof regulatory books and records.

### D4: prove agent behavior without a provider detour

Follow [AGENT_EVALUATION.md](AGENT_EVALUATION.md), including its offline, live and browser layers. Keep the current Anthropic path behind only the minimum needed adapter; no second provider or model comparison is on this milestone's critical path. Contextual tools use delivered scope/scenario/input IDs, not a completed personalized-insights platform. They investigate and simulate with engine evidence, create unapproved drafts only, and fail closed on stale/wrong context, missing data, shortfalls or forbidden authority.

Prepare versioned synthetic cases, code-based numerical/authority checks and minimized usage/latency evidence. No paid calls in normal CI. Run live evaluations only with explicit approved credentials, configuration and a concrete run budget/limit; if none is authorized, prepare the runner and obtain that one budget decision before spending. Do not invent a passing live result. Public mode remains no-key/scripted; live-agent evidence may come from the separately enabled local synthetic demonstration. No private data or public live key.

### D5: publish the demonstrated scope

Run the same synthetic task with a keyboard and representative viewport; record assistance/failures honestly. Prepare the R25 protocol/empty scorecard now and perform the 3–5-advisor study when participants are available. Lack of recruitment need not delay an honestly labelled engineering demonstration; it does prohibit claiming measured advisor usability or competitor parity. No automatic outreach.

Screen and select visible branding under #35 before LinkedIn publication, keeping storage keys, repository/deployment URLs and saved data stable. Obtain the owner's final name choice; no trademark-clearance claim. Record the actual build, supported flow, limitations, agent mode/evidence and what the PM built/decided. No new landing platform or hosting migration.

## One repeatable acceptance story

Create a committed synthetic fixture (no third-party PDF or client information): household context contains a home of USD 400,000 outside an investment account of USD 100,000. The account has Equity ETF A 60,000, Bond ETF A 30,000 and eligible cash 10,000, with explicitly recorded dates and classifications.

1. Import/reconcile with existing tooling; household context is 500,000 while the selected investment denominator is 100,000. Current weights are 60/30/10.
2. Enter a 50/40/10 target. D1 supports a contextual explicit sale and shows actual cash/drift; the target alone executes nothing.
3. In D2 sell 10,000 of Equity ETF A and buy 10,000 of a new Bond ETF B with the same account's explicitly eligible cash. End at equity 50,000, bonds 40,000, cash 10,000; household/current records stay unchanged. No unit-price feed is needed.
4. After that sale, a purchase of 10,001 would leave cash 9,999 and must fail the 10,000 reserve constraint even though cash is positive. Do not apply half of an invalid linked replacement. Existing negative-cash and missing-FX checks remain.
5. Clone an alternative selling/buying 5,000 instead; show 55/35/10 without changing the first scenario. D3 approves a selected complete version; later edits cannot rewrite it.
6. D4's agent explains/simulates the active scenario and supplies an unapproved draft; the advisor owns acceptance and approval. Presentation/PDF use the approved version, not chat prose or a different alternative.

Keep additional fixtures for cross-currency/missing FX, unvalued liabilities, incomplete imports, stale confirmations, unknown classification, order-dependent actions, source-date/timezone boundaries, saved backups and rejected/cancelled work. A supported golden path is not permission to remove coverage for harder existing cases.

## Work explicitly off the demo critical path

- R09 matched update imports, R10 source repair, full R11 queue/bulk actions/bond conventions, R13 personalized task management, R14 look-through/estimated-mix UI, R15 quantitative risk/history/projections, full R16 fee schedules, R17 tax transition, R23b multi-client storage, R24 implementation export and R21 remote sharing.
- Further R18 provider/route/cache deletion or candidate-refresh UI. The quote UI is already removed; unused integrations can remain dormant until a justified maintenance slice. Keep the accepted-value/FX protections and no-quote regression tests.
- #61 cosmetic pair labels and #64 remaining date writers should be fixed with a relevant touched workflow when useful, not become automatic separate release prerequisites. New code must still obey date/timestamp semantics; a wrong value, approval state or critical workflow date is not a cosmetic exception.
- Additional live providers/models, new hosting/backend/auth stack and a broad research platform. Complete #59 before any real-client pilot; relevant minimum-data/authority/secret-handling controls still apply during the synthetic demo work.

Nothing is silently cancelled. See each original plan for its full backlog and acceptance criteria. Complete/close an original issue only when its full scope is actually delivered; track milestone slices separately. #59 is mandatory for a later real-client release, not an optional feature to erase from the roadmap.

## Review, validation and release policy

| Stage | Efficient default | Evidence that remains required |
|---|---|---|
| Start | Read the latest checkpoint, this package, shared rules and relevant contracts; inspect only needed code. | Verify actual heads, existing work, changed assumptions and migration ownership. Do not reread all 25 files every session. |
| Design/code | Write 5–10 contract/UX decisions in the implementation issue/PR, then implement within approved scope. | Reproduce financial/state defects or pin examples first. Escalate only material economic/privacy/spend/name/merge decisions not already authorized. |
| Iteration | Focused tests for changed behavior; self-review and batch all blocking fixes on the same branch. | One shared evaluator, currency/source integrity, draft-only preview, reference/backup preservation, actionable errors. |
| Final application head | Include docs and intended fixture/expectation updates before the final full run. | Typecheck, full tests, extraction eval, production build, focused browser flow, visual PDF check when layout changes. Never skip CI or recapture a baseline to hide failure. |
| Later edits | Re-run checks appropriate to code/runtime changes; metadata-only PR edits need no local app suite. | New runtime code after validation requires the relevant full final checks again. CI stays enabled on every actual head. |
| Review/release | One Codex review per coherent PR; keep fixes on it. Read CI once/use its monitor; report pending rather than repeatedly polling. | Exact-head passing checks and owner-authorized pinned merge; associated deployment and proportionate smoke check. Preserve/restore browser data, stop task servers. |
| Save | Update checkpoint once with branch/head, evidence, blockers and next command; push owned work. | Preserve the stash/unrelated files. Distinguish code-tested head from later docs-only head; do not enable Auto-fix or merge unattended. |

Block release for wrong money/funding, unintended approvals/mutations, data loss/broken restore, violated privacy/authority, inconsistent issued figures, or critical inaccessible/broken tasks. Log nonblocking cosmetic/enrichment improvements for the relevant package or later list; don't turn them into extra prerequisite PRs. A new defect that breaks existing supported behavior is still a blocker.

Use one active implementation branch and the [Claude command playbook](CLAUDE_COMMANDS.md). If a package spans a session limit, save an explicit WIP checkpoint; do not substitute a new tiny task or call the package finished. Record elapsed sessions, review rounds and actual unresolved blockers after D1/D2, then reforecast the rest.

## Publication exit checklist

- [ ] The synthetic import/scope/target/replacement/reserve/alternative/approval/presentation story passes on the exact published build.
- [ ] Current holdings, source dates, funding, baseline revisions, approvals and local backup/restore remain consistent; blocked cases remain blocked.
- [ ] The agent mode is obvious. Offline and any claimed live-model results are recorded separately with their limitations and budget provenance.
- [ ] The public site exposes no live key or real client data. #59's remaining production gates and the product's unsupported capabilities are explicit.
- [ ] Keyboard/error/empty-state checks are recorded; no invented advisor study, quantified risk, tax, execution or institutional-compliance claims.
- [ ] The owner-selected screened name, README, demo script and working links agree. Historical source records/storage keys remain intact.

This planning save does not implement D1–D5, merge code, change models/providers or deploy. Older P0–P5 ordering and the stand-alone R11-first prompt are superseded as delivery sequencing; the original financial contracts, evidence and full feature scopes remain in force.
