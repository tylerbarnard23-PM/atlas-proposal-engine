# R04 — Add proposed-only investments and linked sell/buy replacements

Accepted for planning: 22 October 2026. **Status: Planned; not implemented by this document.**
Tracking issue: #39. Parent roadmap: #36. Original review recommendation: **4 of 25**.
Phase: P2. Relative scope: L; no calendar estimate is committed.
Canonical plan: [R04-proposed-investments-and-replacements.md](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/blob/docs/advisor-roadmap-2026-10-22/docs/roadmap/R04-proposed-investments-and-replacements.md).

## Advisor problem
An unlinked recommendation is advisory-only, and the current replacement action leaves the original holding unchanged.

## Outcome
The advisor can replace a fund or buy a new security without pretending it is already owned.

## Advisor workflow
1. Select Buy new investment or Replace this investment.
2. Choose a verified catalog entry or explicit custom instrument; specify destination account, currency, amount and funding.
3. Preview both legs, residual cash, fees/data gaps and the resulting identities/weights.

## Data and calculation contracts
- Separate current holding IDs from proposed-only instrument/position IDs.
- A replacement is a grouped action with source and destination legs and stable IDs.
- Store instrument identity, price/as-of and classification provenance; missing data is explicit.
- A partially unresolved replacement group cannot be represented as a completed swap; apply atomically or report both-leg status.

## Implementation slices
1. Define proposed instrument/position and linked-action-group contracts.
2. Add a small synthetic catalog and a bounded custom-entry flow; do not imply a live security search integration.
3. Extend the shared engine to create proposed positions and validate account/funding compatibility.
4. Integrate replacement forms, previews, cards, cost inputs and snapshot output.

## Acceptance criteria
- [ ] Replacing Maritime with VOO removes/reduces the source and adds the destination in proposed holdings only.
- [ ] Both legs reconcile to cash, with one FX conversion per amount.
- [ ] Missing price, rate, account or identity leaves the action visibly incomplete.
- [ ] Cancel, repeat save and reload do not create duplicate proposed positions.
- [ ] Oversized sells cannot invent proceeds or conceal a clamped amount.

## Focused validation
- Regression: allocation-neutral replacement still changes security identity and expense inputs.
- Integration: buy not currently owned, partial replacement, zero-value source and cross-currency cases.
- Browser/PDF: current unchanged; proposed identity and cash match.
For implementation, also follow repository-required typecheck, full tests, extraction eval, production build and a relevant browser check. Do not claim these passed from this planning work.

## Dependencies and sequencing
- [R02](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/blob/docs/advisor-roadmap-2026-10-22/docs/roadmap/R02-proposal-scope.md)
- [R05](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/blob/docs/advisor-roadmap-2026-10-22/docs/roadmap/R05-draft-scenarios.md)
- [R07](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/blob/docs/advisor-roadmap-2026-10-22/docs/roadmap/R07-explicit-recommendation-intent.md)
R23a means the export/restore slice of recommendation 23; R23b means its multi-engagement isolation slice. A dependency on another plan means its required contract/slice must exist, not that all later extensions must ship first.

## Likely touchpoints
- `src/domain/types.ts`
- `src/engines/proposalEngine.ts`
- `src/engines/recommendationAmounts.ts`
- `src/app/recommendations/page.tsx`
- `src/copilot/tools.ts`
- `src/pdf/templates/ProposalPdfTemplate.tsx`
Paths labelled proposed do not exist yet; confirm exact locations against the implementation branch.

## Migration and rollout
Introduce explicit grouped replacement while keeping legacy advisory replacements labelled as awaiting destination selection.

## Success evidence
Advisors can explain source, destination and funding without creating a fake current holding.
Capture actual evidence in the issue/PR; no usability results are assumed.

## Out of scope / boundary
No broad instrument-data subscription or custodian order placement.

All work follows the shared implementation rules in [IMPLEMENTATION_GUIDE.md](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/blob/docs/advisor-roadmap-2026-10-22/docs/roadmap/IMPLEMENTATION_GUIDE.md). PR #34 stays a separate review checkpoint; no feature is closed by saving this plan.
