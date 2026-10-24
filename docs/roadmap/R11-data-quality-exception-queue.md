# R11 — Make data-quality review actionable and correct bond checks

Accepted for planning: 22 October 2026. **Status: Planned; not implemented by this document.**
Tracking issue: #46. Parent roadmap: #36. Original review recommendation: **11 of 25**.
Phase: P1. Relative scope: M; no calendar estimate is committed.
Canonical plan: [R11-data-quality-exception-queue.md](R11-data-quality-exception-queue.md).

## Delivery routing — 24 October 2026

**D1 — minimum slices only.** Follow [DEMO_DELIVERY_PLAN.md](DEMO_DELIVERY_PLAN.md) and [CLAUDE_COMMANDS.md](CLAUDE_COMMANDS.md); their package order supersedes the original phase queue. Minimum scope: Fold review wording and non-penalizing optional identifiers into the workbench; retain all real gates. Later scope: Bond basis validation, exception queue, score redesign and safe bulk/date actions. This does not implement or complete the full R-plan. Dependencies below mean the minimum required contract, not every advanced feature of the referenced plan. Preserve all financial, backup and privacy safeguards.


## Advisor problem
An aggregate score of 0 hides priorities, and bonds quoted per 100 of face value receive misleading quantity-times-price warnings.

## Outcome
The advisor sees a short, accurate queue of blockers, material warnings and optional follow-ups.

## Advisor workflow
1. Open grouped exceptions by issue, account and affected amount.
2. Review evidence and resolve an individual item or eligible bulk group.
3. See confirmed values, completeness, freshness and coverage as distinct statuses.

## Data and calculation contracts
- Use one issue/status model across dashboard, holdings, insights, readiness and PDF.
- Encode security price basis (per unit/per 100/unknown) before quantity-value validation; never guess from a convenient matching total.
- Bulk confirmation excludes unresolved/ambiguous rows and preserves import/currency gates.
- Accepting an old date records an acknowledgement without changing the source date or making it fresh.

## Implementation slices
1. Add failing bond convention cases and correct shared valuation checks.
2. Replace the opaque aggregate headline with counts/coverage and severity explanations.
3. Build a filterable exception queue with return context and safe bulk actions.
4. Extend #19 for bulk date acknowledgement and undo; retain per-row evidence.

## Acceptance criteria
- [ ] The three correctly valued sample bonds are not flagged solely for per-100 pricing.
- [ ] Unknown price basis is reviewable rather than silently coerced.
- [ ] Confirmed does not mean fresh or complete; missing valuation is never zero.
- [ ] Bulk confirmation cannot settle incomplete imports or recommendation-currency review.
- [ ] Queue counts and final-route failure codes agree.

## Focused validation
- Validator cases: face amount, units, FX, missing basis, zero prices and true mismatch.
- Bulk eligibility/undo and date acknowledgement regressions.
- Browser/PDF: same unresolved items and explanations.
For implementation, also follow repository-required typecheck, full tests, extraction eval, production build and a relevant browser check. Do not claim these passed from this planning work.

## Approved valuation scope adjustment — 22 October 2026

Follow [VALUATION_SCOPE.md](VALUATION_SCOPE.md). Prioritize unreadable/non-finite values, incomplete reconciliation/imports, missing required FX, unresolved reviews and funding errors. Treat optional quote coverage/lookup failures separately from accepted input validity; they must not independently block a supported proposal. Dated inputs need explicit review and visible original dates, not compulsory repricing or re-dating. Keep security-date review distinct from the unchanged seven-day FX policy. Any changed readiness semantics must be tested through both UI/shared checks and the final-PDF route.

Additional planned checks: accepted old statement + failed quote lookup can complete after applicable review; missing value/FX or an incomplete import cannot; no bulk date acknowledgement changes original dates, settles currency reviews or makes data provider-verified. Keep the instrument-aware bond checks; do not require quantity-times-price reconstruction for unsupported conventions.

## Dependencies and sequencing
- No feature dependency; it can be the first bounded task after the current checkpoint.
R23a means the export/restore slice of recommendation 23; R23b means its multi-engagement isolation slice. A dependency on another plan means its required contract/slice must exist, not that all later extensions must ship first.

## Likely touchpoints
- `src/engines/dataQualityEngine.ts`
- `src/engines/dataTasks.ts`
- `src/engines/complianceEngine.ts`
- `src/components/review/ValueReviewTable.tsx`
- `src/app/page.tsx`
- `src/app/insights/page.tsx`
Paths labelled proposed do not exist yet; confirm exact locations against the implementation branch.

## Migration and rollout
Fix false positives independently, then replace the score presentation. Preserve useful issue records and prior confirmations.

## Success evidence
False-positive rate and time to resolve a meaningful exception.
Capture actual evidence in the issue/PR; no usability results are assumed.

## Out of scope / boundary
No reduction of safeguards simply to improve a score.

All work follows the shared implementation rules in [IMPLEMENTATION_GUIDE.md](IMPLEMENTATION_GUIDE.md). PR #34 stays a separate review checkpoint; no feature is closed by saving this plan.
