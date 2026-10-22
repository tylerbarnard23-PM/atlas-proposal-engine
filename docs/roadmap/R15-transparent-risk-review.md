# R15 — Connect client preferences to transparent portfolio risk review

Accepted for planning: 22 October 2026. **Status: Planned; not implemented by this document.**
Tracking issue: #12. Parent roadmap: #36. Original review recommendation: **15 of 25**.
Phase: P3 bounded risk; later quantified analytics. Relative scope: L; no calendar estimate is committed.
Canonical plan: [R15-transparent-risk-review.md](R15-transparent-risk-review.md).

## Advisor problem
A proprietary-looking score can suggest precision or suitability unsupported by Atlas's inputs and methodology.

## Outcome
Advisors can explain the recorded client preference, portfolio evidence, limits and the proposed trade-off.

## Advisor workflow
1. Review client tolerance/capacity/liquidity separately from portfolio characteristics.
2. Compare current/proposed concentration, asset mix and available stress evidence against documented limits.
3. Open assumptions, data coverage and unavailable measures before client presentation.

## Data and calculation contracts
- Do not collapse questionnaire answers and calculated portfolio risk into an unexplained comparable number.
- Version questionnaire/scoring methodology and preserve answer dates and unknowns.
- Fixed asset-class shocks are illustrative stresses, not realized historical backtests.
- Quantitative volatility/range/projection requires chosen data, correlations/horizon/methodology, reproducible inputs and coverage.

## Implementation slices
1. Refine #12 to start with transparent preferences and simple portfolio evidence.
2. Update #13 to label fixed shocks honestly, with a separate path for genuine historical modeling.
3. Refine #15's projection plan: scenario ranges only after return/volatility assumptions, fees, horizon and uncertainty treatment are documented.
4. Integrate risk review and explicit methodology into snapshots and client output.

## Acceptance criteria
- [ ] The advisor can state what each risk measure means and excludes.
- [ ] Incomplete/mixed assets yield partial or unavailable analytics, not invented whole-portfolio certainty.
- [ ] No target allocation or questionnaire score alone is labelled suitable.
- [ ] Fixed-shock results cannot appear under a historical-performance heading.
- [ ] Projected ranges identify assumptions and do not imply guaranteed or empirically calibrated probabilities.

## Focused validation
- Deterministic fixtures for questionnaires, concentrations and illustrative stresses.
- Analytical cases for unsupported assets, missing histories and methodology changes.
- Browser: advisor can inspect assumptions and gaps without leaving the comparison.
For implementation, also follow repository-required typecheck, full tests, extraction eval, production build and a relevant browser check. Do not claim these passed from this planning work.

## Dependencies and sequencing
- [R02](R02-proposal-scope.md)
- [R12](R12-client-objectives-and-constraints.md)
- [R14](R14-classification-and-exposure-coverage.md)
R23a means the export/restore slice of recommendation 23; R23b means its multi-engagement isolation slice. A dependency on another plan means its required contract/slice must exist, not that all later extensions must ship first.

## Likely touchpoints
- `src/domain/types.ts`
- `src/engines/insightEngine.ts`
- `src/app/client-profile/page.tsx`
- `src/app/proposal-builder/page.tsx`
- `src/pdf/templates/ProposalPdfTemplate.tsx`
Paths labelled proposed do not exist yet; confirm exact locations against the implementation branch.

## Migration and rollout
Deliver the explainable preference/constraint review first. Keep quantitative additions visible as planned until their data/methods pass review.

## Success evidence
Advisor and client comprehension of risk trade-offs and uncertainty.
Capture actual evidence in the issue/PR; no usability results are assumed.

## Out of scope / boundary
No imitation of Nitrogen's proprietary Risk Number, invented predictive precision or automatic suitability determination.

All work follows the shared implementation rules in [IMPLEMENTATION_GUIDE.md](IMPLEMENTATION_GUIDE.md). PR #34 stays a separate review checkpoint; no feature is closed by saving this plan.
