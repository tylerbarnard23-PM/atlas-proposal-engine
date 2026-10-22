# R18 — Review valuation and FX refresh changes before applying them

Accepted for planning: 22 October 2026. **Status: Planned.** The P0 #26 slice is complete (PR #60, merged `e54d56e`, 22 October 2026); the reviewable candidate refresh and the rest of this plan are not implemented.
Tracking issue: #51. Parent roadmap: #36. Original review recommendation: **18 of 25**.
Phase: P0 fixes; P1 reviewable refresh. Relative scope: M; no calendar estimate is committed.
Canonical plan: [R18-valuation-and-fx-review.md](R18-valuation-and-fx-review.md).

## Advisor problem
Partial FX replacement, stale/provenance gaps and silent refresh failure can alter or invalidate a draft without a clear explanation.

## Outcome
The advisor sees exactly what refreshed, what stayed and how a candidate refresh changes the proposal.

## Advisor workflow
1. See currencies/quotes in use, age, source and confirmation state.
2. Refresh into a candidate change set with updated/retained/failed/manual/mock results.
3. Compare affected values and draft scenario effects, then apply or keep the previous dataset.

## Data and calculation contracts
- Retain #26's accepted pair-orientation merge, dynamic in-use currencies (including approved valuation currencies), provenance and expiration rules.
- Seven calendar days is the initial product policy, not an institutional/regulatory standard; use a named constant.
- A confirmation binds the covered rate fingerprint and time and expires on policy deadline or changed rates.
- Apply a refresh atomically with an input revision; never rewrite an approved snapshot.
- Date-only labels follow #28; source timestamps and confirmation times retain instant semantics.

## Implementation slices
1. Deliver #26 and #28 separately (PR #34 is merged; #26 is done in PR #60).
2. Add candidate refresh/status results and current-versus-candidate valuation comparison.
3. Expose changed recommendation effects and approval/review consequences before commit.
4. Use shared readiness in UI, Copilot and PDF route and list rates actually used in output.

## Acceptance criteria
- [ ] Partial response retains unreturned rates with original dates/source; failure changes nothing and is visible.
- [ ] Newer reverse-orientation data cannot lose to a stale direct copy.
- [ ] Manual data remains manual and mock/fallback never becomes freshly provider-verified.
- [ ] In-use stale-rate confirmation expires on time or relevant dataset change.
- [ ] Dates match across browser/server time zones; approved historical snapshots remain unchanged.

## Focused validation
- All accepted #26 regressions, injected-clock boundaries and #28 non-UTC rendering cases.
- Integration: candidate apply/cancel, concurrent input revision and changed recommendation conversion.
- Browser/PDF: updated/retained/failed summary and rate-use disclosure.
For implementation, also follow repository-required typecheck, full tests, extraction eval, production build and a relevant browser check. Do not claim these passed from this planning work.

## Dependencies and sequencing
- PR #34
- #26
- #28
R23a means the export/restore slice of recommendation 23; R23b means its multi-engagement isolation slice. A dependency on another plan means its required contract/slice must exist, not that all later extensions must ship first.

## Likely touchpoints
- `src/app/market-data/page.tsx`
- `src/engines/currencyEngine.ts`
- `src/engines/normalizationEngine.ts`
- `src/engines/complianceEngine.ts`
- `src/utils/formatting.ts`
- `src/pdf/templates/ProposalPdfTemplate.tsx`
Paths labelled proposed do not exist yet; confirm exact locations against the implementation branch.

## Migration and rollout
Foundational fixes first; reviewable quote/valuation diffs follow. Preserve existing stored dates and sources during migration.

## Success evidence
Refresh failures understood and unexpected draft-value changes identified before applying.
Capture actual evidence in the issue/PR; no usability results are assumed.

## Out of scope / boundary
No automatic provider subscription, silent stale acceptance or actual transaction FX quotation.

All work follows the shared implementation rules in [IMPLEMENTATION_GUIDE.md](IMPLEMENTATION_GUIDE.md). PR #34 stays a separate review checkpoint; no feature is closed by saving this plan.
