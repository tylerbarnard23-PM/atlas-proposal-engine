# R14 — Distinguish classification, underlying exposure and estimated mixes

Accepted for planning: 22 October 2026. **Status: Planned; not implemented by this document.**
Tracking issue: #49. Parent roadmap: #36. Original review recommendation: **14 of 25**.
Phase: P1 truthful labels; P3 enrichment. Relative scope: L; no calendar estimate is committed.
Canonical plan: [R14-classification-and-exposure-coverage.md](R14-classification-and-exposure-coverage.md).

## Advisor problem
A single holding classification, denomination or issuer country can be mistaken for full economic exposure.

## Outcome
Advisors understand what the allocation actually measures and where detail is unknown or estimated.

## Advisor workflow
1. Inspect holding category separately from underlying asset mix, issuer country and denomination.
2. Provide a documented estimate for a balance-only account or attach verified detailed positions.
3. See verified, estimated and unknown coverage and the basis/date of each chart.

## Data and calculation contracts
- Estimated exposure slices are analytical children, not additional owned holdings; their values cannot be added again to net worth.
- Preserve classification source/date/method and keep unknown distinct from zero.
- Replacement by verified positions retires the estimate explicitly and retains its history.
- Look-through data requires a supported source/date; denomination is not underlying currency risk.

## Implementation slices
1. Relabel existing charts and mixed/unclassified holdings honestly.
2. Extend #11 with an estimated-mix editor, basis, weights and provenance.
3. Implement shared exposure aggregation and coverage with no double counting.
4. Add optional provider enrichment only after a dataset/license decision; show unsupported cases.

## Acceptance criteria
- [ ] A target-date fund is not asserted to be 100% equity without evidence.
- [ ] A USD-priced international fund is not asserted to be wholly US economic exposure.
- [ ] Estimated 70/25/5 slices total the parent balance while net worth remains unchanged.
- [ ] Detailed positions replace estimated slices without double value.
- [ ] Current/proposed use equivalent exposure basis and disclose unknowns.

## Focused validation
- Unit/integration: mixed funds, balance-only parent/children, weights, stale source and missing data.
- Migration preserves original holding classification and amounts.
- Browser/PDF: same coverage, labels and provenance.
For implementation, also follow repository-required typecheck, full tests, extraction eval, production build and a relevant browser check. Do not claim these passed from this planning work.

## Dependencies and sequencing
- [R02](R02-proposal-scope.md)
- [R09](R09-matched-import-updates.md)
R23a means the export/restore slice of recommendation 23; R23b means its multi-engagement isolation slice. A dependency on another plan means its required contract/slice must exist, not that all later extensions must ship first.

## Likely touchpoints
- `src/domain/types.ts`
- `src/engines/normalizationEngine.ts`
- `src/engines/insightEngine.ts`
- `src/app/accounts-assets/page.tsx`
- `src/pdf/templates/ProposalPdfTemplate.tsx`
Paths labelled proposed do not exist yet; confirm exact locations against the implementation branch.

## Migration and rollout
Truthful labels and estimates first; no fabricated look-through percentages while waiting for external data.

## Success evidence
Correct comprehension of verified versus estimated exposure.
Capture actual evidence in the issue/PR; no usability results are assumed.

## Out of scope / boundary
No automatic external-data purchase or inferred revenue/geographic exposure.

All work follows the shared implementation rules in [IMPLEMENTATION_GUIDE.md](IMPLEMENTATION_GUIDE.md). PR #34 stays a separate review checkpoint; no feature is closed by saving this plan.
