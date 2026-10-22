# R24 — Export an account-level implementation handoff and track follow-up

Accepted for planning: 22 October 2026. **Status: Planned; not implemented by this document.**
Tracking issue: #56. Parent roadmap: #36. Original review recommendation: **24 of 25**.
Phase: P5. Relative scope: M-L; no calendar estimate is committed.
Canonical plan: [R24-implementation-handoff.md](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/blob/docs/advisor-roadmap-2026-10-22/docs/roadmap/R24-implementation-handoff.md).

## Advisor problem
Generic implementation text does not identify the actual actions, sources, prerequisites or completion evidence.

## Outcome
An approved scenario produces a reconciled human-reviewable handoff while remaining clearly separate from executed trades.

## Advisor workflow
1. Open the approved version and inspect grouped account-level actions/transfers.
2. Assign owner, prerequisites and status; export a human-readable checklist/CSV.
3. Record implementation evidence separately and reconcile actual updates through a new import.

## Data and calculation contracts
- Each instruction references snapshot version, action/group IDs, account, instrument, currency and funding leg.
- Proposed, acknowledged and completed are distinct; completion requires explicit recorded evidence.
- Exported quantities are indicative if lot/price/settlement constraints are unknown; value proposals are not executable orders.
- External spreadsheet fields are escaped and exports contain only intended client-visible content.

## Implementation slices
1. Generate implementation items from structured approved actions and funding ledger.
2. Expose sequencing, missing account/transfer/settlement/tax data and explicit owner.
3. Add a bounded export plus completion notes/status history.
4. Compare subsequent imported actual holdings to the approved plan without rewriting the historical snapshot.

## Acceptance criteria
- [ ] The handoff totals and cash movements reconcile to its approved scenario.
- [ ] Every grouped replacement contains source and destination, with unresolved prerequisites visible.
- [ ] Marking one item completed cannot imply other items executed.
- [ ] Unknown transfer legality/settlement or tax treatment stays unassessed.
- [ ] New actual values arrive through a separate reconciled update, not mutation of approved history.

## Focused validation
- Integration: replacement/paydown/transfer grouping and stable snapshot references.
- Export: columns, currencies, rounding, formula-like strings and private-note exclusion.
- Browser: owner/status history and reimport comparison.
For implementation, also follow repository-required typecheck, full tests, extraction eval, production build and a relevant browser check. Do not claim these passed from this planning work.

## Dependencies and sequencing
- [R06](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/blob/docs/advisor-roadmap-2026-10-22/docs/roadmap/R06-funding-and-cash-controls.md)
- [R17](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/blob/docs/advisor-roadmap-2026-10-22/docs/roadmap/R17-tax-transition-review.md)
- [R19](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/blob/docs/advisor-roadmap-2026-10-22/docs/roadmap/R19-approved-proposal-snapshots.md)
R23a means the export/restore slice of recommendation 23; R23b means its multi-engagement isolation slice. A dependency on another plan means its required contract/slice must exist, not that all later extensions must ship first.

## Likely touchpoints
- `src/domain/types.ts`
- `src/engines/proposalEngine.ts`
- `src/app/proposal-builder/page.tsx`
- `src/pdf/templates/ProposalPdfTemplate.tsx`
- `proposed implementation export module`
Paths labelled proposed do not exist yet; confirm exact locations against the implementation branch.

## Migration and rollout
Checklist and bounded CSV first. No brokerage connection or unattended execution.

## Success evidence
Advisor can reconcile each proposed action to an account and prerequisite.
Capture actual evidence in the issue/PR; no usability results are assumed.

## Out of scope / boundary
No trade routing, execution confirmation by inference or legal transaction authorization.

All work follows the shared implementation rules in [IMPLEMENTATION_GUIDE.md](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/blob/docs/advisor-roadmap-2026-10-22/docs/roadmap/IMPLEMENTATION_GUIDE.md). PR #34 stays a separate review checkpoint; no feature is closed by saving this plan.
