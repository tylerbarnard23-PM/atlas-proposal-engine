# R16 — Compare current/proposed fees and income with data coverage

Accepted for planning: 22 October 2026. **Status: Planned; not implemented by this document.** **D3 minimum released (PR #81, `85b3910`):** known-input expense ratio and income, current and proposed, with value/count coverage or "Unavailable"; no invented zeros, savings or forecasts. Full fee schedules and enrichment remain later.
Tracking issue: #14. Parent roadmap: #36. Original review recommendation: **16 of 25**.
Phase: P3 known inputs; automatic enrichment deferred. Relative scope: L; no calendar estimate is committed.
Canonical plan: [R16-cost-and-income-comparison.md](R16-cost-and-income-comparison.md).

## Delivery routing — 24 October 2026

**D3 — minimum slices only.** Follow [DEMO_DELIVERY_PLAN.md](DEMO_DELIVERY_PLAN.md) and [CLAUDE_COMMANDS.md](CLAUDE_COMMANDS.md); their package order supersedes the original phase queue. Minimum scope: Show reproducible known-input fees/income and coverage, or explicitly unavailable; no enrichment prerequisite. Later scope: Full fee schedule modeling, transition cost modeling and automatic data enrichment. This does not implement or complete the full R-plan. Dependencies below mean the minimum required contract, not every advanced feature of the referenced plan. Preserve all financial, backup and privacy safeguards.


## Approved D2a contract routing — 24 October 2026

The bounded [model and manager proposal slice](MODEL_AND_MANAGER_PROPOSALS.md), #73, follows D2 and precedes D3. Reuse this plan's minimum scenario/funding/exposure/fee/snapshot contracts as applicable. Keep strategy sleeves separate from underlying asset-class exposure and owned positions, disclose unknown data, preserve model revisions and use shared funding/reserve/approval gates. Full enrichment and UMA operations remain later; this note claims no implementation.

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
- Use the same scoped accepted valuation basis for current/proposed comparison; disclose actual source dates and mixed-date limits rather than inventing one source date; do not double-count embedded fund/advisory fees.
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

## Approved valuation scope adjustment — 22 October 2026

Follow [VALUATION_SCOPE.md](VALUATION_SCOPE.md). Start with evidenced statement/advisor-entered expenses, fee schedules and income/yield assumptions, preserving source/date and unknown coverage. Automatic fee/yield enrichment is deferred, not a dependency of constructing or approving a supported allocation proposal. An unavailable yield is not zero; no whole-portfolio income/savings claim follows from partial inputs. Compare alternatives on the same accepted basis without fetching fresh security prices.

## Dependencies and sequencing
- [R04](R04-proposed-investments-and-replacements.md)
- [R05](R05-draft-scenarios.md)
- [R14](R14-classification-and-exposure-coverage.md)
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

All work follows the shared implementation rules in [IMPLEMENTATION_GUIDE.md](IMPLEMENTATION_GUIDE.md). PR #34 stays a separate review checkpoint; no feature is closed by saving this plan.
