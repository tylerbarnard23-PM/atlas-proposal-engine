# R08 — Open contextual portfolio changes with complete scenario effects

Accepted for planning: 22 October 2026. **Status: Planned; not implemented by this document.**
Tracking issue: #43. Parent roadmap: #36. Original review recommendation: **8 of 25**.
Phase: P2. Relative scope: M; no calendar estimate is committed.
Canonical plan: [R08-contextual-holding-preview.md](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/blob/docs/advisor-roadmap-2026-10-22/docs/roadmap/R08-contextual-holding-preview.md).

## Advisor problem
PR #34 supplies precise previews, but advisors still start on a separate recommendation page and may miss cross-account interactions.

## Outcome
Selecting a position carries its context into a precise editor and complete scenario comparison.

## Advisor workflow
1. Choose Propose a change from a position row or account.
2. Edit in a drawer/panel with persistent current/proposed/delta/currency and funding warnings.
3. Switch between this action alone and its incremental effect within the selected full scenario.

## Data and calculation contracts
- Reuse PR #34's shared-engine simulation; do not infer cash as the negated position change.
- Evaluate full scenario dependencies including cross-account funding, not only actions on the same holding/account.
- Stable edited action IDs replace saved versions; preview never mutates or approves.

## Implementation slices
1. Add row/account entry points and carry selected IDs, scope and scenario.
2. Adapt the shared preview for draft scenario membership and complete dependency display.
3. Show actual cash movement, reserve/shortfall and prerequisite warnings alongside the form.
4. Keep saved cards, Copilot and PDF consistent with the same result.

## Acceptance criteria
- [ ] A USD 3 change remains visible at full currency precision.
- [ ] A cash holding never creates an invented second cash credit.
- [ ] A debt paydown affected by a sale in another account shows the complete interaction.
- [ ] Editing a saved action is not double-counted.
- [ ] Cancel/reload retains current holdings and the expected saved state.

## Focused validation
- Reuse #34 regressions; add cross-account-only interaction and linked replacement cases.
- Browser: holdings entry → edit → cancel/save → return context.
- Zero-value percentage is N/A; missing FX/import/currency-review warnings persist.
For implementation, also follow repository-required typecheck, full tests, extraction eval, production build and a relevant browser check. Do not claim these passed from this planning work.

## Dependencies and sequencing
- PR #34
- [R03](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/blob/docs/advisor-roadmap-2026-10-22/docs/roadmap/R03-allocation-workspace.md)
- [R04](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/blob/docs/advisor-roadmap-2026-10-22/docs/roadmap/R04-proposed-investments-and-replacements.md)
- [R05](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/blob/docs/advisor-roadmap-2026-10-22/docs/roadmap/R05-draft-scenarios.md)
- [R06](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/blob/docs/advisor-roadmap-2026-10-22/docs/roadmap/R06-funding-and-cash-controls.md)
R23a means the export/restore slice of recommendation 23; R23b means its multi-engagement isolation slice. A dependency on another plan means its required contract/slice must exist, not that all later extensions must ship first.

## Likely touchpoints
- `src/components/tables/HoldingsTable.tsx`
- `src/app/accounts-assets/page.tsx`
- `src/components/recommendations`
- `src/engines/recommendationPreview.ts (PR #34)`
Paths labelled proposed do not exist yet; confirm exact locations against the implementation branch.

## Migration and rollout
A follow-up issue after #33 is delivered, not a reopening of completed preview scope. Keep old recommendation route usable.

## Success evidence
Fewer page changes and correct comprehension of standalone versus combined effects.
Capture actual evidence in the issue/PR; no usability results are assumed.

## Out of scope / boundary
Do not rebuild the preview or widen PR #34 before its current review.

All work follows the shared implementation rules in [IMPLEMENTATION_GUIDE.md](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/blob/docs/advisor-roadmap-2026-10-22/docs/roadmap/IMPLEMENTATION_GUIDE.md). PR #34 stays a separate review checkpoint; no feature is closed by saving this plan.
