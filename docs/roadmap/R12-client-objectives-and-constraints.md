# R12 — Capture client goals, cash needs, restrictions and IPS inputs

Accepted for planning: 22 October 2026. **Status: Planned; not implemented by this document.**
Tracking issue: #47. Parent roadmap: #36. Original review recommendation: **12 of 25**.
Phase: P1 inputs; P3 IPS. Relative scope: M; no calendar estimate is committed.
Canonical plan: [R12-client-objectives-and-constraints.md](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/blob/docs/advisor-roadmap-2026-10-22/docs/roadmap/R12-client-objectives-and-constraints.md).

## Advisor problem
Liquidity/income preferences appear in output without corresponding profile controls, while important constraints remain free text.

## Outcome
Portfolio construction and client explanations use explicit, dated advisor-confirmed inputs.

## Advisor workflow
1. Record purpose, time horizon, liquidity/income needs, reserve, tax context and restricted assets.
2. Keep unassessed inputs distinct from completed discovery and separate private notes from client text.
3. Review an IPS-style summary with allocation ranges, rebalancing policy and exceptions.

## Data and calculation contracts
- Persist structured objectives and constraints with assessment state, date, source and client visibility.
- Legacy seeded/default values are not retroactively labelled as explicitly discovered.
- Monetary goals retain currency and timeframe; constraint IDs feed funding/target evaluation.
- IPS is an advisor-reviewed document, not a certification of suitability or a legal agreement.

## Implementation slices
1. Expose existing liquidity/income controls and add unassessed states and structured needs.
2. Connect reserves/restrictions to scope, funding and construction validation.
3. Create a client-visible policy summary from approved inputs with clear gaps.
4. Keep this as a child of #18, separate from tax and snapshot implementation.

## Acceptance criteria
- [ ] Every printed liquidity/income preference is explicitly recorded or labelled unassessed.
- [ ] A do-not-sell restriction and reserve affect draft action feasibility.
- [ ] Private discovery notes never enter client-facing output by default.
- [ ] Currency changes cannot relabel cash needs without conversion/review.
- [ ] Editing a material objective flags affected scenarios for review.

## Focused validation
- Migration for defaulted versus confirmed values; goal-currency and constraint tests.
- Integration: reserve and restricted holding honored by construction.
- Browser/PDF: clear discovery states, private/public separation and IPS gaps.
For implementation, also follow repository-required typecheck, full tests, extraction eval, production build and a relevant browser check. Do not claim these passed from this planning work.

## Dependencies and sequencing
- [R23a](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/blob/docs/advisor-roadmap-2026-10-22/docs/roadmap/R23-engagement-backup-and-switching.md) — required slice only
R23a means the export/restore slice of recommendation 23; R23b means its multi-engagement isolation slice. A dependency on another plan means its required contract/slice must exist, not that all later extensions must ship first.

## Likely touchpoints
- `src/domain/types.ts`
- `src/app/client-profile/page.tsx`
- `src/store/useStore.ts`
- `src/engines/complianceEngine.ts`
- `src/pdf/templates/ProposalPdfTemplate.tsx`
Paths labelled proposed do not exist yet; confirm exact locations against the implementation branch.

## Migration and rollout
Collect structured inputs first; generate the IPS summary only after they drive actual construction checks.

## Success evidence
Advisor can explain the recorded objective and identify unassessed needs.
Capture actual evidence in the issue/PR; no usability results are assumed.

## Out of scope / boundary
No implied legal IPS acceptance or automatic client-risk recommendation.

All work follows the shared implementation rules in [IMPLEMENTATION_GUIDE.md](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/blob/docs/advisor-roadmap-2026-10-22/docs/roadmap/IMPLEMENTATION_GUIDE.md). PR #34 stays a separate review checkpoint; no feature is closed by saving this plan.
