# Advisor product roadmap

Accepted by Tyler Barnard on **22 October 2026**: all **25** recommendations from the [competitor and advisor workflow review](docs/research/2026-10-22-advisor-ux-review.md).
Tracking epic: [#36](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/36).

**This is the accepted implementation direction and detailed backlog, not a claim that the features are built.** Each item below has its own plan and acceptance checks. The current save changes documentation and issue tracking only.

## Delivery decision — 24 October 2026

Build the employer-facing **synthetic advisor demo first** using [delivery packages with the approved D2a model/manager slice](docs/roadmap/DEMO_DELIVERY_PLAN.md) and the [Claude command playbook](docs/roadmap/CLAUDE_COMMANDS.md). **D1 (allocation desk) is released (PR #72, `0381db1`). D2 (funded alternatives) is released (PR #75, `073049f`).** **D2a (model/manager proposals) is released (PR #79, `c0ee4e9`).** **D3 (review once, present consistently) is released (PR #81, `85b3910`).** **D4 (the bounded contextual agent) is in progress.** D5 follows D4's review/release. The small review-copy/optional-identifier cleanup is already delivered (PR #70 (merged `8b06b6a`)); D1 builds on it and must not repeat it. The prior stand-alone R11-first prompt is superseded. Routine design choices are authorized within the accepted scope; don't insert another approval-only planning round.

All 25 directions remain accepted, but only their listed minimum slices are on the demo critical path. Broader features are explicitly later, not cancelled or marked complete. This sequence supersedes the old P0–P5 queue. No provider-deletion, advanced-analytics, full exception-queue, multi-client or remote-sharing prerequisite holds up the workspace. The financial contracts and #59 real-client gate remain.

Use Opus 5.5 in Claude Code Desktop: High for domain/migration/agent-boundary work, Medium for bounded implementation/release and Low for saves. One command carries a coherent task through code, self-review, tests, documentation and PR; one Codex review follows. No release-only checkpoint PRs. This save changes planning only.

## Product outcome

An advisor can reconcile messy client data, choose the assets in scope, construct a funded proposed portfolio, compare alternatives, approve an explainable version and present it consistently on screen and in PDF. Keep the existing deterministic engines and data-review safeguards. No rebuild from scratch is planned.

## Accepted valuation scope — 22 October 2026

Use verified statement/imported account values or explicit advisor-approved valuations with source, currency and date. Keep FX, reconciliation, missing-value, funding and approval safeguards. Broad security repricing/research is optional future scope, not a prerequisite for a proposal. No rewrite is planned.

The approved [valuation scope and safe-retirement plan](docs/roadmap/VALUATION_SCOPE.md) governs related work. R18 owns core valuation simplification and later candidate FX review; R19a brings the accepted input/FX-basis record into P1, with full approved snapshots later. R14–R16 use supported data first; provider enrichment remains deferred. Prioritize R07/R12/R02 → R05/R04/R06 → R03 over quote-provider breadth. R25 must test the journey with no security-quote keys. This adjustment changes plans only; no provider or readiness behavior has changed.

## Current checkpoint

- **D2 released:** [PR #75](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/pull/75) merged pinned to `5b0f8b1` as `073049ff526a58b0ab14bc05a6bf640ab80c5cb8` (25 October 2026); main CI run 40204437975 passed (466 passed, 2 private-PDF skips; eval 2/2; build), with a GitHub Production deployment for `073049f`; release and production smoke evidence on PR #75 and #36. It adds funded alternatives: proposed-only investments, linked replacements applied whole or not at all, an account's eligible cash (no fallback to other cash) with a reserve kept in its stated currency, and named alternatives with a shared-evaluator comparison; store/backup v8 (`Account.funding.reserveCurrency`, declared unresolved funding and destination links) with v7/v6 upgrades. Minimum R04/R05/R06 slices only; no feature issue closes. Follow-up #76 stays open.
- **D1 released:** [PR #72](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/pull/72) (merged `0381db1`, 24 October 2026; production evidence on the PR and #36) added the Allocation desk: selected-account scope, current/proposed/target grid with drift and actual cash, one working draft (membership separate from approval and PDF prose), explicit position edits through the shared engine, a recorded input basis, store/backup v7 with an idempotent migration and v6-backup upgrade. Minimum slices of R01/R02/R03/R05/R07/R08/R19a only; no feature issue closes.
- **Delivered before D1:** [PR #70](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/pull/70), reviewed at `6449889bfbf9a07ff3a45c8446301e87693a8c4b` and merged pinned as `8b06b6a842d8b11adc1b96967c78aee9c0e12a6c` (24 October 2026): value-review readiness wording (same codes and results) and no quality-score penalty for a missing identifier, including legacy saved warnings. Main CI passed (402 passed, 2 skipped, 404). It counts toward D1; do not repeat it.
- **Latest release:** PR #69 (R18 slice 1) is merged as `7d5999fa01e15a1271bb81812cd8cabbbf58d095`. Main CI run 40097812771 passed: 393 passed, 2 skipped (395 total), eval 2/2, typecheck/build. Production smoke evidence is on [PR #69](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/pull/69#issuecomment-6384766252) and [#51](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/51#issuecomment-6384766474). Source/approval dates, quote-free UI and final gates were checked; only slice 1 is complete. #51 stays open. Read old checkpoint entries below as historical evidence.

- Main observed before this documentation save: `1d6f0c0a67dac79c2a6a3bbe498fba79793a452c`. Since then PR #34 was reviewed, fixed and merged: main `4e6da186a62e92b76d886e6e32e67af23410a688`, live in production.
- PR #34 (the precise live preview) is complete. R08 is a separate follow-up that reuses it, not a duplicate preview.
- #26 FX work is complete and live (PR #60, merge `e54d56e3d381a65715bedcf686bf7d59935591bf`). #28 date rendering is complete and live (PR #63, merge `23db797c58b2241e8b0c229818ebeecb06755d47`); follow-up #64 (UTC "today" writes) is logged.
- R23a is complete and live: PR #66 (Codex-reviewed head `d088dab657c802d18c8e34882f245603f31ab75e`) merged as `e56335e5fdb4f2f343cdea605333b16cda9ad932` on 23 October 2026 (production `dpl_DUsfyjnmjxaUaLNfBhrNfHixwqsy`). It precedes persisted-schema migrations: each later store version needs a matching backup migration step. R23b is not started; #55 stays open.
- Naming #35 is a separate pre-LinkedIn task; no name has been selected. Preserve browser storage and working links during that transition.
- This roadmap does not merge, deploy, change hosting, run a new live model, purchase data or authorize external trading.

## Client-data privacy prerequisite

[PII protection plan](docs/roadmap/PII_PROTECTION.md), tracking [#59](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/59), is a cross-cutting prerequisite for the accepted roadmap. R01–R25 numbering remains unchanged.

The public demo stays synthetic/sample-only. Current local PDF reading does not mean the whole workflow stays on-device: other ingestion, Copilot and PDF rendering use server requests, and workspace data persists in the browser. Complete the minimum-data projections and threat-model work early. Before a real-client pilot, require reviewed identity/per-client authorization, encrypted persistence/key management, AI/vendor policy, logging/export/retention controls and synthetic-canary/end-to-end evidence. Masking alone does not meet this gate.

R09/R10 intake, R12 discovery, R19 snapshots, R21 sharing, R22 Copilot and R23 backup/client isolation inherit the relevant controls. Real-client exports require protected handling; a sample-only backup feature is not an authorization to export real PII. No new provider or production configuration is selected by this plan.

## Delivery packages and exit evidence

The [demo-first plan](docs/roadmap/DEMO_DELIVERY_PLAN.md) is the active sequence. Package completion is distinct from full R-plan completion. Minimum shared contracts ship with their first usable task; later extensions do not become hidden prerequisites.

| Package | Coherent task | Minimum exit evidence |
|---|---|---|
| D1 — Working allocation desk | Selected-account scope, current/proposed/target grid, explicit active draft and contextual existing-position edits; bundle small review/identifier cleanup. | Correct denominator/context, same-engine values/cash/drift, no implicit actions or preview approvals, compatible migration/backup and save/reload. |
| D2 — Funded alternatives | New investment/atomic replacement, explicit eligible cash/reserve, duplicate and compare two alternatives. | Distinct destination identity, correct funding and reserve breaches, independent alternatives, no imaginary transfers or current-holding changes. |
| D2a — Model and manager proposals | Versioned target models and funded manager/strategy sleeves; [bounded plan](docs/roadmap/MODEL_AND_MANAGER_PROPOSALS.md), tracking #73. | Reconciled sleeve/exposure values, explicit unknowns, enforced minimums/reserves, version/isolation and backup tests. |
| D3 — Review and present | Bounded approved economic snapshot, one local presentation and matching concise PDF. | Same reviewed inputs/FX/actions/figures, later edits isolated, known/unknown cost coverage, server issuance gates retained. |
| D4 — Bounded agent evidence | Contextual investigate/simulate/draft with a tested single-provider loop. | Offline authority/numerical/error tests; opt-in budgeted synthetic live evidence for live claims; public remains scripted/no-key. |
| D5 — Publish the supported demo | Golden path, blocked paths, keyboard/errors, screened owner-selected branding and honest README/demo script. | Actual recorded evidence and limits, working URLs/storage keys, no invented advisor study or real-client production claim. |

Default to one coherent PR per package; D1 may split minimum contracts/migration from the visible workspace, and another split needs an actual independently testable boundary. Do not create tiny docs/copy/release PRs between each slice or one giant five-package branch. The [command playbook](docs/roadmap/CLAUDE_COMMANDS.md) defines effort and save/review/release behavior.

Later work includes full R09/R10/R11/R13, quantitative R15, full R16/R17, R23b, R24, remote R21 and R18 provider/cache retirement/candidate-refresh UI. Relevant truthful data labels and genuine blockers remain in the demo. #59 is still mandatory before real-client use; naming #35 is still before LinkedIn publication. R25 real-advisor research remains planned and results cannot be invented.

## All 25 accepted recommendations

The R01–R25 IDs preserve the original review numbering. GitHub issue numbers are separate.

| Review ID | Detailed plan | Tracking issue | Demo allocation (partial scope) | Relative scope | Status |
|---|---|---|---|---|---|
| R01 (1) | [Guide advisors through a complete proposal journey](docs/roadmap/R01-guided-proposal-journey.md) | [#37](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/37) | D1/D3/D5 minimum; rest later | M | Planned (D1 minimum released: PR #72) |
| R02 (2) | [Define proposal scope and allocation denominators](docs/roadmap/R02-proposal-scope.md) | [#38](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/38) | D1 minimum; rest later | L | Planned (D1 minimum released: PR #72) |
| R03 (3) | [Build current, proposed and target allocation workspace](docs/roadmap/R03-allocation-workspace.md) | [#17](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/17) | D1/D2/D2a minimum; rest later | L | Planned (D1 minimum released: PR #72; D2a minimum released: PR #79) |
| R04 (4) | [Add proposed-only investments and linked sell/buy replacements](docs/roadmap/R04-proposed-investments-and-replacements.md) | [#39](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/39) | D2/D2a minimum; rest later | L | Planned (D2 minimum released: PR #75; D2a minimum released: PR #79) |
| R05 (5) | [Compare named draft portfolio scenarios before approval](docs/roadmap/R05-draft-scenarios.md) | [#40](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/40) | D1/D2/D2a minimum; rest later | L | Planned (D1 minimum released: PR #72; D2 minimum released: PR #75) |
| R06 (6) | [Make cash reserves, funding sources and transfers explicit](docs/roadmap/R06-funding-and-cash-controls.md) | [#41](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/41) | D1/D2/D2a minimum; rest later | L | Planned (D2 minimum released: PR #75) |
| R07 (7) | [Separate financial changes from tasks and require explicit intent](docs/roadmap/R07-explicit-recommendation-intent.md) | [#42](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/42) | D1 minimum; rest later | M | Planned (D1 minimum released: PR #72) |
| R08 (8) | [Open contextual portfolio changes with complete scenario effects](docs/roadmap/R08-contextual-holding-preview.md) | [#43](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/43) | D1/D2 minimum; rest later | M | Planned (D1 minimum released: PR #72) |
| R09 (9) | [Match imports to accounts and reconcile statement updates](docs/roadmap/R09-matched-import-updates.md) | [#44](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/44) | Later; existing behavior retained | L | Planned |
| R10 (10) | [Repair extraction exceptions beside source evidence](docs/roadmap/R10-source-repair-workbench.md) | [#45](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/45) | Later; existing behavior retained | L | Planned |
| R11 (11) | [Make data-quality review actionable and correct bond checks](docs/roadmap/R11-data-quality-exception-queue.md) | [#46](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/46) | D1 minimum; rest later | M | Planned (review wording/optional-identifier slice delivered: PR #70 (merged `8b06b6a`); queue, bond and staleness work later) |
| R12 (12) | [Capture client goals, cash needs, restrictions and IPS inputs](docs/roadmap/R12-client-objectives-and-constraints.md) | [#47](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/47) | D1/D2/D3 minimum; rest later | M | Planned |
| R13 (13) | [Prioritize insights and track advisory follow-up tasks](docs/roadmap/R13-personalized-insights-and-tasks.md) | [#48](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/48) | Later; existing behavior retained | M | Planned |
| R14 (14) | [Distinguish classification, underlying exposure and estimated mixes](docs/roadmap/R14-classification-and-exposure-coverage.md) | [#49](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/49) | D1/D2/D2a minimum; rest later | L | Planned (D2a minimum released: PR #79) |
| R15 (15) | [Connect client preferences to transparent portfolio risk review](docs/roadmap/R15-transparent-risk-review.md) | [#12](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/12) | Later; existing behavior retained | L | Planned |
| R16 (16) | [Compare current/proposed fees and income with data coverage](docs/roadmap/R16-cost-and-income-comparison.md) | [#14](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/14) | D2a/D3 minimum; rest later | L | Planned (D2a minimum released: PR #79; D3 minimum released: PR #81) |
| R17 (17) | [Review taxable transition effects and gain constraints](docs/roadmap/R17-tax-transition-review.md) | [#50](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/50) | Later; existing behavior retained | L | Planned |
| R18 (18) | [Use accepted valuations and review FX changes; defer security repricing](docs/roadmap/R18-valuation-and-fx-review.md) | [#51](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/51) | D1 minimum; rest later | M staged | Planned (FX/date fixes complete; retirement audit merged; slice 1 complete: PR #69, `7d5999f`; review wording delivered: PR #70 (merged `8b06b6a`); candidate FX review not implemented; security repricing deferred) |
| R19 (19) | [Freeze approved proposal snapshots and clarify approval](docs/roadmap/R19-approved-proposal-snapshots.md) | [#52](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/52) | D1/D2a/D3 minimum; rest later | L | Planned (D1 minimum released: PR #72; D3 minimum released: PR #81) |
| R20 (20) | [Create concise proposal templates and contextual disclosures](docs/roadmap/R20-proposal-templates-and-disclosures.md) | [#53](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/53) | D3 minimum; rest later | M | Planned (D3 minimum released: PR #81) |
| R21 (21) | [Present approved proposals digitally and share fixed versions](docs/roadmap/R21-client-presentation-and-sharing.md) | [#16](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/16) | D3 minimum; rest later | L | Planned (D3 minimum released: PR #81) |
| R22 (22) | [Embed contextual Copilot with clear demo/live mode](docs/roadmap/R22-contextual-copilot.md) | [#54](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/54) | D4 minimum; rest later | M | Planned |
| R23 (23) | [Back up engagements and preserve multiple clients safely](docs/roadmap/R23-engagement-backup-and-switching.md) | [#55](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/55) | R23a released; R23b later | L staged | Planned (R23a backup/restore complete: PR #66, `e56335e`; R23b not started) |
| R24 (24) | [Export an account-level implementation handoff and track follow-up](docs/roadmap/R24-implementation-handoff.md) | [#56](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/56) | Later; existing behavior retained | M-L | Planned |
| R25 (25) | [Measure advisor usability and verify accessible workflows](docs/roadmap/R25-advisor-usability-and-accessibility.md) | [#57](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/57) | D1/D5 minimum; rest later | M | Planned |

Relative scope describes the full original feature, not the size of the demo slice. Scope estimates are comparative only. Implementation PRs should split the listed slices; do not turn a Large item into a single sprawling change. Acceptance criteria live in the individual plans. Completion requires actual implementation/validation evidence, not this documentation commit.

## Required contracts before expanding UI

- **Scope** identifies the included data and denominator, with context/exclusions explicit.
- **Accepted valuation basis** retains values, source dates and exact FX/input revision; mixed dates stay visible. Optional prices are not a prerequisite.
- **Scenario** is an editable candidate with stable action IDs and baseline/rate revisions.
- **Proposed instrument/action group** supports a genuine destination and linked replacement legs.
- **Funding ledger** identifies actual account/currency sources, reserves, explicit transfers and unresolved prerequisites.
- **Shared evaluation result** supplies proposed values, cash, drift, completeness and blockers to every surface.
- **Approved snapshot** captures the complete reviewed input/output package and its version.
- **Engagement boundary** keeps client data separate while firm preferences remain shared.

These are coordinated contracts, not seven competing copies of portfolio state. See [implementation guidance](docs/roadmap/IMPLEMENTATION_GUIDE.md).

## Existing backlog integration

- #17 is expanded into R03; #12 into R15; #14 into R16; #16 into R21.
- #18 is the policy/tax/version coordination issue. Its separate selected tasks are R12 (#47), R17 (#50), R19 (#52), with implementation follow-through in R24 (#56).
- #11 estimated mix supports R14; R09 handles replacing summary balances with real positions.
- #19 bulk date acceptance supports R11; old dates remain old after acknowledgement.
- #13 fixed asset-class shocks are explicitly illustrative stress tests; genuine historical backtesting needs a separate method/data path.
- #15 projections remain included as a later R15 extension, with documented data and assumptions first.
- #26/#28 support R18. The existing accepted FX policy remains in force. #26 is complete (PR #60, merged `e54d56e`, live); R18 slice 1 is released (PR #69, `7d5999f`); provider retirement and candidate FX review remain later; optional security repricing is deferred; #28 is complete (PR #63, merged `23db797`, live).
- #33/#34 deliver the precise preview; R08 (#43) separately connects it to the working portfolio.
- #35 naming remains separate before LinkedIn publication.

Original issue bodies/history are retained when expanded. No existing feature issue is closed by saving the plan.

## Measurement and release discipline

Use synthetic scenarios and the repeatable R25 protocol. Measure unassisted completion, assistance, critical errors, time and comprehension of scope, funding, approval and unknown data. Set targets from actual observations, not competitor marketing claims.

A useful P2 demonstration is: import a synthetic statement → reconcile → choose investment-only scope → preserve a reserve → enter an illustrative target → construct a real replacement → compare funded alternatives. Run it without security-quote keys or provider setup; accepted values and explicitly supplied FX are sufficient. P4 adds version approval and a concise presentation. Sample targets are examples of software behavior, not investment advice.

For every implementation: identify the exact issue/slice, preserve saved data, run meaningful checks, show a reviewable result and update this table only with evidence. Merge/deploy follow the existing owner-approval agreement. The accepted scope does not require repeated approval for routine choices inside these plans.

## Start next time

Verify actual GitHub/local state, read the latest handoff and the next package in the [delivery plan](docs/roadmap/DEMO_DELIVERY_PLAN.md), then use the [command playbook](docs/roadmap/CLAUDE_COMMANDS.md). D3 is released (PR #81, `85b3910`); D4 is in progress and D5 follows its review/release. Do not run the old stand-alone R11 cleanup prompt or start provider deletion first. Preserve any work already started from an older prompt; reuse/reconcile it rather than reset it.

Include documentation and self-review in the implementation PR. Stop for Codex review with the exact code/CI/preview heads. Merge/deploy still require the owner's explicit authorization. If a session ends mid-package, save WIP with a precise continuation rather than replacing it with another tiny task. Reforecast after D1/D2 using actual delivery evidence.

## Agent provider and evaluation requirement — 22 October 2026

R22 / #54 now includes [provider support and agent evaluation](docs/roadmap/AGENT_EVALUATION.md). Keep Claude as the first supported provider behind a minimal adapter; Atlas installation does not require Claude Desktop/Code, and scripted demo mode needs no key. Additional providers require their own behavioral evidence and #59 vendor/privacy approval. Add offline orchestration tests to CI, opt-in budgeted synthetic live-model evaluations, and browser acceptance flows. Record numerical evidence, authority boundaries, actual model, task quality, cost and latency; parser eval results are not agent eval results. Foundation tests can ship alongside D1–D3; D4 contextual integration uses their minimum contracts. #26 and #28 are already released. No full personalized-insights or extra provider project is a demo prerequisite. All new capabilities remain Planned.
