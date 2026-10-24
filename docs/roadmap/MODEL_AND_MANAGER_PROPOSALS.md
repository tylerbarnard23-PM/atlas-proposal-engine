# D2a — Model portfolios and manager-sleeve proposals

Approved by Tyler on 24 October 2026. **Planned, not implemented.** Tracking [#73](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/73), part of #36, R03/#17 and R04/#39. Read with [delivery sequencing](DEMO_DELIVERY_PLAN.md) and [shared rules](IMPLEMENTATION_GUIDE.md).

## Purpose and boundary

An advisor can propose a saved model or allocate a supported account among named manager/strategy sleeves, compare the funded result with the current portfolio, and later present the reviewed version. This is UMA-style **proposal design**, not a UMA operating platform, manager appointment, trade execution or proof of product availability/suitability. Use synthetic examples and bounded advisor-entered definitions; do not imply a manager integration or verified offering.

Sequence: D1 released → D2 funded alternatives → **D2a** → D3 review/presentation → D4 agent evidence → D5 publication. D2a is one bounded additional slice within the existing 25 directions, not R26. D2 can proceed without implementing a speculative sleeve platform first. Full model administration, security catalog and exposure enrichment stay later.

## Advisor workflow

1. Select an existing supported account/scope and active alternative.
2. Choose a saved versioned model or create a custom target. Clearly distinguish an asset-class target model from a manager/strategy allocation model.
3. For a sleeve proposal, choose bounded synthetic/custom strategies and enter percentages or dollar allocations; show named basis, residual cash, minimums and fee coverage.
4. Inspect the target versus the **funded proposed result**. Selecting a model creates neither trades nor approval. Explicitly construct/confirm the needed draft actions through D2; show unresolved transitions/drift.
5. Compare alternatives without changing current holdings. D3 approves and freezes the selected definitions, funding and numerical result for matching presentation/PDF.

## Minimum domain contracts

- **Model:** stable ID, immutable revision, name, kind (asset-class target or strategy allocation), currency/basis, weights and explicit unallocated remainder. Keep synthetic/custom provenance and date. Editing a saved model creates a revision; existing scenarios never silently follow the latest.
- **Strategy:** stable ID/revision, manager and strategy labels, strategy type, currency, supplied minimum commitment and fee components if known, and exposure evidence/date or unknown. Missing minimum/fee/availability is not zero or verified eligibility.
- **Sleeve:** a proposal grouping in a supported account, separate from the model and from current holding identity. Keep target allocation distinct from funded value; record references to proposed positions/actions and strategy revision. One concrete representation selected during implementation; no competing portfolio ledger.
- **No double counting:** a sleeve containing proposed instruments is a grouping, not another asset on top of them. A balance-only managed mandate can be a proposed destination, but its underlying investments are not also created as owned positions. Never treat a manager name as an asset class or ticker.
- **Exposure:** manager/sleeve weights and asset-class exposures are separate views over the same value. Use only explicitly supplied supported mixes with provenance/date, never infer asset mix from a name. For the minimum implementation permit a flat supplied mix; no holdings-level feed or nested model graph. Unknown exposure remains an unknown bucket with count/value coverage, not zero.
- **Funding and minimums:** reuse D2's shared evaluator, eligible cash, reserve, currency and atomic linked transitions. Fund only genuine intended allocations, not targets. Known strategy minimums apply to actual proposed commitment. Below-minimum/unsupported allocations cannot be presented as completed transitions; show blockers in UI and server final issuance. Unknown minimum/eligibility requires explicit review/qualification under a documented rule, not an assertion that eligibility passed.
- **Fees:** separate known manager, platform/advisor and instrument components; label rates, bases, coverage and overlap. Do not sum an all-in fee with its embedded components or manufacture savings from missing data. Minimum slice can report fee inputs/coverage without a computed aggregate until supported.
- **Isolation:** cloning alternatives remaps sleeve/action IDs and clears new approval; model or scenario edits never rewrite another alternative or approved history.
- **Approval/output:** a selected model is not suitability assessment, investment agreement or advisor approval. D3 captures definition revisions, scope, target/funded sleeve allocation, exposures/unknowns, inputs/FX, funding, minimum exceptions and fee evidence with the approved version. D4 may explain/simulate these records, but cannot appoint managers, accept exceptions or approve.
- **Persistence:** preserve current storage key/data; version any schema change, use idempotent migrations and upgrade every backup version currently supported. Reload/export/restore must retain definitions, references and blockers.

## Committed synthetic acceptance fixtures

Use a separate USD 100,000 supported account fixture; do not replace the original D1/D2 60/30/10 story.

- Strategy allocation target: 40% Equity Manager A, 35% Fixed Income Manager B, 20% ETF Model C, 5% explicit eligible cash. On USD 100,000: 40,000 / 35,000 / 20,000 / 5,000. A target alone creates no proposed holding, transfer or approval.
- Supplied mix: A 100% equity, B 100% fixed income, C 50/50 equity/fixed income. After an explicitly funded feasible transition, sleeve totals reconcile to 100,000 and exposure is 50% equity / 45% fixed income / 5% cash; never 200,000 from counting sleeves and components twice.
- Remove C's mix: report 40% known equity, 35% known fixed income, 5% cash, 20% unknown. Do not renormalize the known 80% into a complete portfolio.
- A minimum of 50,000 makes its proposed 40,000 commitment fail; no false claim of a completed/eligible implementation.
- A 10,000 cash reserve makes this 5,000-cash target infeasible. Show reserve breach/drift; do not force fulfillment. A separate explicit feasible test uses a 5,000 reserve.
- Save asset-class model 60/35/5 separately; editing its revision to 50/45/5 leaves the prior alternative and any D3 approved version on the original revision.
- Test missing fees/minimums, duplicate assignments, totals above 100%, zero scope, missing FX, wrong account, atomic failure, cancellation, isolation, reload and old/current backup upgrades. Prove current holdings unchanged.
- D3 screen/PDF display the same approved manager/sleeve amounts, exposure coverage and definitions; live model/provider claims remain governed by the agent evaluation plan.

## Implementation and exit

**Claude Code Desktop / Opus 5.5 / High effort.** Inspect delivered D2, record 5–10 contract/UX decisions in the implementation issue/PR and implement one coherent slice. Reuse real store/engine/backup paths, write meaningful financial/state tests, self-review and batch blockers, then final required checks/browser and visual PDF checks when output changes. No new design-only PR or generic architecture platform.

Before D2a merge: funded proposals, minimum/reserve enforcement, definition revisions, unknown exposure/fee coverage, isolation and persistence are tested. D3 owns approved snapshots and final presentation integration; a minimal truthful existing PDF adaptation must ship alongside any change that would otherwise misstate current supported output. No financial/readiness gate may be UI-only.

## Explicitly later

Manager onboarding/due diligence feeds, custodian/overlay integrations, discretionary authority, manager order routing, sleeve-level tax optimization, household tax overlay, ongoing model rebalance service, nested models, performance/history and a verified commercial strategy marketplace. No promised deadline, provider purchase, live key or real-client launch is implied. [PII_PROTECTION.md](PII_PROTECTION.md) / #59 remains mandatory before real data.
