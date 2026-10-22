# R16 — Compare current/proposed fees and income with data coverage

Accepted for planning: 22 October 2026. **Status: Planned; not implemented by this document.**
Tracking issue: #14. Parent roadmap: #36. Original review recommendation: **16 of 25**.
Phase: P3. Relative scope: L; no calendar estimate is committed.
Canonical plan: [R16-cost-and-income-comparison.md](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/blob/docs/advisor-roadmap-2026-10-22/docs/roadmap/R16-cost-and-income-comparison.md).

## Advisor problem
Headline estimates from available expense/yield fields can appear more complete than the data, and do not explain replacement economics.

## Outcome
Advisors can show reproducible recurring cost/income differences and distinguish them from transition costs.

## Advisor workflow
1. Inspect known fund expenses, advisory schedule and yields for each scenario.
2. Enter evidenced missing inputs or leave them unknown.
3. Compare annual dollars/rates, one-off transition costs, coverage and the basis for any savings claim.

## Data and calculation contracts
- Model unknown separately from explicit zero for fees/yields.
- Normalize annual expense/yield units; distinguish percent from basis points and currency amounts.
- Use the same scoped portfolio and valuation date for comparison; do not double-count embedded fund/advisory fees.
- Separate recurring expense reduction, transaction/FX cost and projected performance.

## Implementation slices
1. Define fee/yield input provenance and supported advisory fee schedule assumptions.
2. Implement shared current/proposed cost and income calculations with coverage.
3. Use actual proposed-only replacement holdings from R04.
4. Replace unqualified PDF headlines with the comparison, assumptions and unavailable components.

## Acceptance criteria
- [ ] A fund replacement's savings can be reconstructed from value and explicit expense ratios.
- [ ] A missing fee does not count as zero or produce a full-portfolio cost claim.
- [ ] Unknown yields do not imply no income; income estimates state their coverage and frequency.
- [ ] Tiered/advisory assumptions are disclosed; unsupported arrangements stay unavailable.
- [ ] Currency conversion and rounding occur once and do not create apparent savings.

## Focused validation
- Analytical fixtures: 1.42% versus 0.03%, partial coverage, tier boundaries, explicit zero and missing yield.
- Integration: actual replacement identity changes → cost comparison → PDF.
- Browser: input provenance and comparison under changed scope/currency.
For implementation, also follow repository-required typecheck, full tests, extraction eval, production build and a relevant browser check. Do not claim these passed from this planning work.

## Dependencies and sequencing
- [R04](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/blob/docs/advisor-roadmap-2026-10-22/docs/roadmap/R04-proposed-investments-and-replacements.md)
- [R05](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/blob/docs/advisor-roadmap-2026-10-22/docs/roadmap/R05-draft-scenarios.md)
- [R14](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/blob/docs/advisor-roadmap-2026-10-22/docs/roadmap/R14-classification-and-exposure-coverage.md)
R23a means the export/restore slice of recommendation 23; R23b means its multi-engagement isolation slice. A dependency on another plan means its required contract/slice must exist, not that all later extensions must ship first.

## Likely touchpoints
- `src/domain/types.ts`
- `src/engines/valuationTotals.ts`
- `src/engines/proposalEngine.ts`
- `src/app/proposal-builder/page.tsx`
- `src/pdf/templates/ProposalPdfTemplate.tsx`
Paths labelled proposed do not exist yet; confirm exact locations against the implementation branch.

## Migration and rollout
Annual recurring comparisons first; add transaction/FX estimates as separately labelled components when inputs are available.

## Success evidence
Advisors distinguish recurring savings from transition cost and unknown inputs.
Capture actual evidence in the issue/PR; no usability results are assumed.

## Out of scope / boundary
No guaranteed savings, after-tax return forecast or hidden external cost feed.

All work follows the shared implementation rules in [IMPLEMENTATION_GUIDE.md](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/blob/docs/advisor-roadmap-2026-10-22/docs/roadmap/IMPLEMENTATION_GUIDE.md). PR #34 stays a separate review checkpoint; no feature is closed by saving this plan.
