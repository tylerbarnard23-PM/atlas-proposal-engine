# R02 — Define proposal scope and allocation denominators

Accepted for planning: 22 October 2026. **Status: Planned; not implemented by this document.**
Tracking issue: #38. Parent roadmap: #36. Original review recommendation: **2 of 25**.
Phase: P1. Relative scope: L; no calendar estimate is committed.
Canonical plan: [R02-proposal-scope.md](R02-proposal-scope.md).

## Advisor problem
Whole-wealth assets, a home and business interest currently enter an investment denominator without an explicit scope decision.

## Outcome
The advisor can distinguish household wealth from the assets available for a selected reallocation.

## Advisor workflow
1. Choose household context, selected accounts or a custom portfolio subset.
2. Classify included assets as actionable, held-away, restricted or context-only and record exclusions.
3. See scope name, included value and excluded/unknown amounts beside every current/proposed/target comparison.

## Data and calculation contracts
- Persist a scope definition with stable engagement/account/holding IDs, inclusion reasons and revision.
- Use one scope selector for engine, charts, insights, Copilot and PDF; liabilities remain distinct from the asset allocation denominator.
- Unknown ownership or liquidity is not permission to trade or transfer; context holdings remain visible.
- Until an explicit readiness-policy change is reviewed, preserve existing missing-valuation/import gates; scope selection must not silently make unresolved data disappear.

## Implementation slices
1. Define scope schema, explicit defaults and a migration preserving the existing whole-household view.
2. Implement scope selection and a shared scoped valuation/allocation service.
3. Integrate labels and exclusions across working views and outputs.
4. Treat a scope revision as a scenario material change requiring review.

## Acceptance criteria
- [ ] A primary residence remains in net worth but can be excluded from the investment target.
- [ ] Household and selected-account views reconcile to their stated subsets; all percentages identify the denominator.
- [ ] A consolidated report does not acquire invented account/owner assignments.
- [ ] Unvalued included holdings produce partial/unavailable results, never zero or 1:1 conversion.
- [ ] Changing scope does not edit current holdings or retain an approval as if nothing changed.

## Focused validation
- Engine tests: home/business exclusions, liability, zero-valued scope, mixed currency and missing FX.
- Store migration: existing saved values and IDs unchanged.
- Browser/PDF: same named scope and denominator across outputs.
For implementation, also follow repository-required typecheck, full tests, extraction eval, production build and a relevant browser check. Do not claim these passed from this planning work.

## Dependencies and sequencing
- No feature dependency; it can be the first bounded task after the current checkpoint.
R23a means the export/restore slice of recommendation 23; R23b means its multi-engagement isolation slice. A dependency on another plan means its required contract/slice must exist, not that all later extensions must ship first.

## Likely touchpoints
- `src/domain/types.ts`
- `src/store/useStore.ts`
- `src/engines/valuationTotals.ts`
- `src/engines/insightEngine.ts`
- `src/pdf/templates/ProposalPdfTemplate.tsx`
Paths labelled proposed do not exist yet; confirm exact locations against the implementation branch.

## Migration and rollout
Add explicit labels first, then scoped calculations. Keep legacy scope as a named view until the advisor chooses a new one.

## Success evidence
Advisors correctly identify the denominator and excluded wealth in R25 tasks.
Capture actual evidence in the issue/PR; no usability results are assumed.

## Out of scope / boundary
No automatic assumption that every household account is managed or tradable.

All work follows the shared implementation rules in [IMPLEMENTATION_GUIDE.md](IMPLEMENTATION_GUIDE.md). PR #34 stays a separate review checkpoint; no feature is closed by saving this plan.
