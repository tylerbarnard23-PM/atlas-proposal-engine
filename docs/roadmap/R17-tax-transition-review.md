# R17 — Review taxable transition effects and gain constraints

Accepted for planning: 22 October 2026. **Status: Planned; not implemented by this document.**
Tracking issue: #50. Parent roadmap: #36. Original review recommendation: **17 of 25**.
Phase: P3. Relative scope: L; no calendar estimate is committed.
Canonical plan: [R17-tax-transition-review.md](R17-tax-transition-review.md).

## Delivery routing — 24 October 2026

**After the demo milestone.** Follow [DEMO_DELIVERY_PLAN.md](DEMO_DELIVERY_PLAN.md) and [CLAUDE_COMMANDS.md](CLAUDE_COMMANDS.md); their package order supersedes the original phase queue. Minimum scope: Retain cost-basis evidence and clearly say tax/transition optimization is not modeled. Later scope: Taxable transition, gain budgets and tax-aware optimization. This does not implement or complete the full R-plan. Dependencies below mean the minimum required contract, not every advanced feature of the referenced plan. Preserve all financial, backup and privacy safeguards.


## Advisor problem
Proposed sales and cross-account funding are not accompanied by structured known/unknown tax context.

## Outcome
Advisors can identify estimated realized gains/losses and implementation questions before approving a transition.

## Advisor workflow
1. Inspect account tax classification and supplied cost basis/date/currency.
2. Review estimated realized gain/loss for supported proportional sales and set a gain budget or do-not-sell restriction.
3. Identify items needing tax-lot information or professional review.

## Data and calculation contracts
- Cost basis is sourced money with currency; market value cannot substitute for missing basis.
- Account tax category and ownership determine which review is relevant; unknown stays unassessed.
- Aggregate proportional estimates are distinct from lot-selected or jurisdiction-specific tax calculations.
- No tax due is calculated without explicit assumptions; wash-sale, holding-period and asset-location logic need separate supported methods.

## Implementation slices
1. Create the tax child of #18 with bounded account/position-level estimates.
2. Validate basis and supported proportional-sale calculations against scenario actions.
3. Add gain-budget feasibility checks and explicit unknowns.
4. Carry evidence, assumptions and unresolved transfer questions into review/output.

## Acceptance criteria
- [ ] Known basis yields a reproducible gain estimate for a supported sale.
- [ ] Missing basis yields unassessed tax impact, never zero gain.
- [ ] A reserve/funding plan cannot conceal a retirement distribution or ownership mismatch.
- [ ] Gain budgets constrain supported generated changes; no action is silently forced through.
- [ ] Output does not describe a market-value estimate as tax optimization or advice.

## Focused validation
- Fixtures: gain, loss, partial sale, missing/invalid basis, cross-currency and mixed account categories.
- Integration: gain budget/locked holding → infeasible target with residual drift.
- Browser/PDF: known estimate and unknown tax context are equally visible.
For implementation, also follow repository-required typecheck, full tests, extraction eval, production build and a relevant browser check. Do not claim these passed from this planning work.

## Dependencies and sequencing
- [R04](R04-proposed-investments-and-replacements.md)
- [R06](R06-funding-and-cash-controls.md)
- [R12](R12-client-objectives-and-constraints.md)
R23a means the export/restore slice of recommendation 23; R23b means its multi-engagement isolation slice. A dependency on another plan means its required contract/slice must exist, not that all later extensions must ship first.

## Likely touchpoints
- `src/domain/types.ts`
- `src/engines/proposalEngine.ts`
- `src/ingestion`
- `src/app/recommendations/page.tsx`
- `src/pdf/templates/ProposalPdfTemplate.tsx`
Paths labelled proposed do not exist yet; confirm exact locations against the implementation branch.

## Migration and rollout
Read-only tax context first; then bounded gain budgets. Advanced lot and jurisdiction logic remains a separately assessed extension.

## Success evidence
Advisors identify taxable consequences and unknowns without treating estimates as advice.
Capture actual evidence in the issue/PR; no usability results are assumed.

## Out of scope / boundary
No comprehensive tax optimizer, wash-sale guarantee, tax filing or invented tax rates.

All work follows the shared implementation rules in [IMPLEMENTATION_GUIDE.md](IMPLEMENTATION_GUIDE.md). PR #34 stays a separate review checkpoint; no feature is closed by saving this plan.
