# Advisor product roadmap

Accepted by Tyler Barnard on **22 October 2026**: all **25** recommendations from the [competitor and advisor workflow review](docs/research/2026-10-22-advisor-ux-review.md).
Tracking epic: [#36](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/36).

**This is the accepted implementation direction and detailed backlog, not a claim that the features are built.** Each item below has its own plan and acceptance checks. The current save changes documentation and issue tracking only.

## Product outcome

An advisor can reconcile messy client data, choose the assets in scope, construct a funded proposed portfolio, compare alternatives, approve an explainable version and present it consistently on screen and in PDF. Keep the existing deterministic engines and data-review safeguards. No rebuild from scratch is planned.

## Current checkpoint

- Main observed before this documentation save: `1d6f0c0a67dac79c2a6a3bbe498fba79793a452c`. Since then PR #34 was reviewed, fixed and merged: main `4e6da186a62e92b76d886e6e32e67af23410a688`, live in production.
- PR #34 (the precise live preview) is complete. R08 is a separate follow-up that reuses it, not a duplicate preview.
- #26 FX work is complete and live (PR #60, merge `e54d56e3d381a65715bedcf686bf7d59935591bf`). #28 date rendering is in review as its own change (PR #63).
- Naming #35 is a separate pre-LinkedIn task; no name has been selected. Preserve browser storage and working links during that transition.
- This roadmap does not merge, deploy, change hosting, run a new live model, purchase data or authorize external trading.

## Client-data privacy prerequisite

[PII protection plan](docs/roadmap/PII_PROTECTION.md), tracking [#59](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/59), is a cross-cutting prerequisite for the accepted roadmap. R01–R25 numbering remains unchanged.

The public demo stays synthetic/sample-only. Current local PDF reading does not mean the whole workflow stays on-device: other ingestion, Copilot and PDF rendering use server requests, and workspace data persists in the browser. Complete the minimum-data projections and threat-model work early. Before a real-client pilot, require reviewed identity/per-client authorization, encrypted persistence/key management, AI/vendor policy, logging/export/retention controls and synthetic-canary/end-to-end evidence. Masking alone does not meet this gate.

R09/R10 intake, R12 discovery, R19 snapshots, R21 sharing, R22 Copilot and R23 backup/client isolation inherit the relevant controls. Real-client exports require protected handling; a sample-only backup feature is not an authorization to export real PII. No new provider or production configuration is selected by this plan.

## Delivery phases and exit evidence

Phases indicate dependency order, not dates or fixed-duration sprints. Some plans are intentionally split across phases. Shared dependencies refer to the minimum required contract/slice, not all later extensions of a feature.

| Phase | Bounded delivery | Exit evidence |
|---|---|---|
| P0 — secure the checkpoint | ~~Review PR #34~~ (merged `4e6da18`); ~~#26~~ (merged `e54d56e`) then #28 (in review: PR #63); R23a backup/restore; R25 study protocol/baseline | Review findings recorded; saved workspace recoverable; FX/date cases pass; study protocol exists and results remain empty until observed |
| P1 — trustworthy inputs | R07 explicit intent; R11 accurate exceptions; R12 client constraints; R02 scope; R09 matched import then R10 source repair; R14 truthful classification; R18 candidate refresh; R23b client isolation | No duplicate parent/position value, no implicit 50% action, scope/unknowns visible, import/valuation/currency gates preserved |
| P2 — portfolio construction | R05 scenarios; R04 new investments/replacements; R06 explicit funding; R03 targets/workspace; R08 contextual preview; R01 navigation shell | A synthetic account can be reallocated with a reserve, real sell/buy legs, alternative drafts and a reconciled funding ledger, without changing current holdings |
| P3 — explain and approve | R13 relevant insights; R14 optional exposure enrichment; R15 bounded risk review; R16 costs/income; R17 tax context; R19 snapshots; R12 IPS summary | Every numerical statement is supported or explicitly unavailable; the approved economic package has reproducible versioned inputs |
| P4 — complete advisor/client journey | R01 complete guided flow; R20 templates; R21 local presentation; R22 contextual Copilot; repeat R25 | Advisor can navigate the complete task, understand the proposal, present the same figures as PDF and distinguish scripted versus live mode |
| P5 — controlled delivery and follow-through | R21 protected/versioned sharing after server/access prerequisites; R24 implementation handoff; later risk/projection extensions only after methodology/data decisions | Client receives one controlled version; acknowledgement is separate from authority; implementation export reconciles and never implies trades executed |

R23a = export/validated restore. R23b = multi-engagement ownership and safe switching. Both are slices of R23 (#55), not extra recommendations. R01's early shell does not imply every later stage is implemented. R14 starts with truthful labels before external enrichment. R15 starts with explainable preferences/constraints before sophisticated quantitative measures.

## All 25 accepted recommendations

The R01–R25 IDs preserve the original review numbering. GitHub issue numbers are separate.

| Review ID | Detailed plan | Tracking issue | Delivery phase | Relative scope | Status |
|---|---|---|---|---|---|
| R01 (1) | [Guide advisors through a complete proposal journey](docs/roadmap/R01-guided-proposal-journey.md) | [#37](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/37) | P2 shell; P4 complete journey | M | Planned |
| R02 (2) | [Define proposal scope and allocation denominators](docs/roadmap/R02-proposal-scope.md) | [#38](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/38) | P1 | L | Planned |
| R03 (3) | [Build current, proposed and target allocation workspace](docs/roadmap/R03-allocation-workspace.md) | [#17](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/17) | P2 | L | Planned |
| R04 (4) | [Add proposed-only investments and linked sell/buy replacements](docs/roadmap/R04-proposed-investments-and-replacements.md) | [#39](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/39) | P2 | L | Planned |
| R05 (5) | [Compare named draft portfolio scenarios before approval](docs/roadmap/R05-draft-scenarios.md) | [#40](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/40) | P2 foundation | L | Planned |
| R06 (6) | [Make cash reserves, funding sources and transfers explicit](docs/roadmap/R06-funding-and-cash-controls.md) | [#41](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/41) | P2 | L | Planned |
| R07 (7) | [Separate financial changes from tasks and require explicit intent](docs/roadmap/R07-explicit-recommendation-intent.md) | [#42](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/42) | P1 | M | Planned |
| R08 (8) | [Open contextual portfolio changes with complete scenario effects](docs/roadmap/R08-contextual-holding-preview.md) | [#43](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/43) | P2 | M | Planned |
| R09 (9) | [Match imports to accounts and reconcile statement updates](docs/roadmap/R09-matched-import-updates.md) | [#44](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/44) | P1 | L | Planned |
| R10 (10) | [Repair extraction exceptions beside source evidence](docs/roadmap/R10-source-repair-workbench.md) | [#45](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/45) | P1 | L | Planned |
| R11 (11) | [Make data-quality review actionable and correct bond checks](docs/roadmap/R11-data-quality-exception-queue.md) | [#46](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/46) | P1 | M | Planned |
| R12 (12) | [Capture client goals, cash needs, restrictions and IPS inputs](docs/roadmap/R12-client-objectives-and-constraints.md) | [#47](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/47) | P1 inputs; P3 IPS | M | Planned |
| R13 (13) | [Prioritize insights and track advisory follow-up tasks](docs/roadmap/R13-personalized-insights-and-tasks.md) | [#48](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/48) | P3 | M | Planned |
| R14 (14) | [Distinguish classification, underlying exposure and estimated mixes](docs/roadmap/R14-classification-and-exposure-coverage.md) | [#49](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/49) | P1 truthful labels; P3 enrichment | L | Planned |
| R15 (15) | [Connect client preferences to transparent portfolio risk review](docs/roadmap/R15-transparent-risk-review.md) | [#12](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/12) | P3 bounded risk; later quantified analytics | L | Planned |
| R16 (16) | [Compare current/proposed fees and income with data coverage](docs/roadmap/R16-cost-and-income-comparison.md) | [#14](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/14) | P3 | L | Planned |
| R17 (17) | [Review taxable transition effects and gain constraints](docs/roadmap/R17-tax-transition-review.md) | [#50](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/50) | P3 | L | Planned |
| R18 (18) | [Review valuation and FX refresh changes before applying them](docs/roadmap/R18-valuation-and-fx-review.md) | [#51](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/51) | P0 fixes; P1 reviewable refresh | M | Planned (P0 slice #26 complete: PR #60, `e54d56e`; reviewable refresh remains) |
| R19 (19) | [Freeze approved proposal snapshots and clarify approval](docs/roadmap/R19-approved-proposal-snapshots.md) | [#52](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/52) | P3 foundation; P4 delivery | L | Planned |
| R20 (20) | [Create concise proposal templates and contextual disclosures](docs/roadmap/R20-proposal-templates-and-disclosures.md) | [#53](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/53) | P4 | M | Planned |
| R21 (21) | [Present approved proposals digitally and share fixed versions](docs/roadmap/R21-client-presentation-and-sharing.md) | [#16](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/16) | P4 local presentation; P5 protected sharing | L | Planned |
| R22 (22) | [Embed contextual Copilot with clear demo/live mode](docs/roadmap/R22-contextual-copilot.md) | [#54](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/54) | P4 | M | Planned |
| R23 (23) | [Back up engagements and preserve multiple clients safely](docs/roadmap/R23-engagement-backup-and-switching.md) | [#55](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/55) | P0 backup; P1/P2 client isolation | L staged | Planned |
| R24 (24) | [Export an account-level implementation handoff and track follow-up](docs/roadmap/R24-implementation-handoff.md) | [#56](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/56) | P5 | M-L | Planned |
| R25 (25) | [Measure advisor usability and verify accessible workflows](docs/roadmap/R25-advisor-usability-and-accessibility.md) | [#57](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/57) | P0 baseline; repeat at each milestone | M | Planned |

Scope estimates are comparative only. Implementation PRs should split the listed slices; do not turn a Large item into a single sprawling change. Acceptance criteria live in the individual plans. Completion requires actual implementation/validation evidence, not this documentation commit.

## Required contracts before expanding UI

- **Scope** identifies the included data and denominator, with context/exclusions explicit.
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
- #26/#28 support R18. The existing accepted FX policy remains in force. #26 is complete (PR #60, merged `e54d56e`, live); R18's reviewable candidate refresh remains Planned; #28 is in review separately (PR #63).
- #33/#34 deliver the precise preview; R08 (#43) separately connects it to the working portfolio.
- #35 naming remains separate before LinkedIn publication.

Original issue bodies/history are retained when expanded. No existing feature issue is closed by saving the plan.

## Measurement and release discipline

Use synthetic scenarios and the repeatable R25 protocol. Measure unassisted completion, assistance, critical errors, time and comprehension of scope, funding, approval and unknown data. Set targets from actual observations, not competitor marketing claims.

A useful P2 demonstration is: import a synthetic statement → reconcile → choose investment-only scope → preserve a reserve → enter an illustrative target → construct a real replacement → compare funded alternatives. P4 adds version approval and a concise presentation. Sample targets are examples of software behavior, not investment advice.

For every implementation: identify the exact issue/slice, preserve saved data, run meaningful checks, show a reviewable result and update this table only with evidence. Merge/deploy follow the existing owner-approval agreement. The accepted scope does not require repeated approval for routine choices inside these plans.

## Start next time

Read [CLAUDE_HANDOFF.md](docs/CLAUDE_HANDOFF.md), this roadmap and [IMPLEMENTATION_GUIDE.md](docs/roadmap/IMPLEMENTATION_GUIDE.md). PRs #34 and #60 (#26) are merged; #28 is in review as PR #63. After it, follow the newest checkpoint in the handoff. Use R23a before the larger stored-schema migrations. New construction work starts from R07/R12/R02 contracts and progresses through R05/R04/R06 to R03.

Keep work in bounded PRs. Record real commit heads, checks and preview/deployment evidence; do not assume a delayed Vercel preview belongs to a newer commit.

## Agent provider and evaluation requirement — 22 October 2026

R22 / #54 now includes [provider support and agent evaluation](docs/roadmap/AGENT_EVALUATION.md). Keep Claude as the first supported provider behind a minimal adapter; Atlas installation does not require Claude Desktop/Code, and scripted demo mode needs no key. Additional providers require their own behavioral evidence and #59 vendor/privacy approval. Add offline orchestration tests to CI, opt-in budgeted synthetic live-model evaluations, and browser acceptance flows. Record numerical evidence, authority boundaries, actual model, task quality, cost and latency; parser eval results are not agent eval results. Foundation tests may be a bounded earlier slice; contextual UI dependencies and #26 then #28 sequencing remain unchanged. All new capabilities remain Planned.
