# R03 — Build current, proposed and target allocation workspace

Accepted for planning: 22 October 2026. **Status: Planned; not implemented by this document.**
Tracking issue: #17. Parent roadmap: #36. Original review recommendation: **3 of 25**.
Phase: P2. Relative scope: L; no calendar estimate is committed.
Canonical plan: [R03-allocation-workspace.md](R03-allocation-workspace.md).

## Delivery routing — 24 October 2026

**D1/D2 — minimum slices only.** Follow [DEMO_DELIVERY_PLAN.md](DEMO_DELIVERY_PLAN.md) and [CLAUDE_COMMANDS.md](CLAUDE_COMMANDS.md); their package order supersedes the original phase queue. Minimum scope: Current/proposed/target grid, drift and supported funded edits. Later scope: Saved model library and broader automatic action generation; no optimizer claim. This does not implement or complete the full R-plan. Dependencies below mean the minimum required contract, not every advanced feature of the referenced plan. Preserve all financial, backup and privacy safeguards.


## Advisor problem
Advisors cannot set and reconcile an allocation target in one workspace; overall comparison is concentrated in document output.

## Outcome
The advisor can choose a model or custom target and inspect actual funded proposed changes alongside current holdings.

## Advisor workflow
1. Select the scope and draft scenario.
2. Choose a saved model or enter target dollars/percentages and reserve.
3. Review current, target, proposed and drift; select investments and explicitly generate or edit candidate actions.

## Data and calculation contracts
- Version model definitions, target weights and their classification basis separately from proposed holdings/actions.
- A target is desired exposure, not an executed trade or a fabricated holding.
- One shared scenario result supplies current/proposed values, funding, coverage and unresolved actions.
- Weights reconcile to 100% or show an explicit unallocated remainder; rounding residue is disclosed, never invented performance.

## Implementation slices
1. Extend #17 with custom and saved model schemas, including supported asset classes and restrictions.
2. Build a responsive comparison grid and accessible chart driven by the same data.
3. Add target validation and a deterministic draft action-generation pass for supported instruments/accounts.
4. Show infeasible targets with remaining drift rather than forcing completion.
5. Wire the shared preview into the workspace, then carry the same scenario into review/output.

## Acceptance criteria
- [ ] An illustrative 60/35/5 target can be entered for an investment-only scope.
- [ ] Locks, a cash reserve, unknown asset mix or missing rates prevent false claims of target achievement.
- [ ] Current and proposed column totals reconcile to the funding ledger.
- [ ] Generated actions are drafts and actual holdings are unchanged.
- [ ] Model revisions and custom edits do not silently rewrite an approved scenario.

## Focused validation
- Tests: target total, cents/weight rounding, locked holdings, zero portfolio, unsupported asset class and missing inputs.
- Integration: target → draft changes → shared engine → drift.
- Browser: custom target, saved model, infeasible case and reload.
For implementation, also follow repository-required typecheck, full tests, extraction eval, production build and a relevant browser check. Do not claim these passed from this planning work.

## Dependencies and sequencing
- **D1 early workspace:** minimum R02 scope, R05 active-draft, R07 explicit-intent and shared-evaluation contracts, implemented together. Full R04 new positions and R06 reserve/transfer UX are D2/later, not prerequisites to the D1 current/proposed/target view. Do not claim those unsupported actions work yet.
- [R02](R02-proposal-scope.md)
- [R04](R04-proposed-investments-and-replacements.md)
- [R05](R05-draft-scenarios.md)
- [R06](R06-funding-and-cash-controls.md)
- [R07](R07-explicit-recommendation-intent.md)
R23a means the export/restore slice of recommendation 23; R23b means its multi-engagement isolation slice. A dependency on another plan means its required contract/slice must exist, not that all later extensions must ship first.

## Likely touchpoints
- `src/domain/types.ts`
- `src/engines/proposalEngine.ts`
- `src/engines/recommendationPreview.ts (PR #34)`
- `src/app/recommendations/page.tsx`
- `src/app/proposal-builder/page.tsx`
Paths labelled proposed do not exist yet; confirm exact locations against the implementation branch.

## Migration and rollout
Ship read-only comparison and target entry before draft action generation. Initial models are clearly synthetic examples.

## Success evidence
Successful completion of a funded target-allocation task; residual drift is understood.
Capture actual evidence in the issue/PR; no usability results are assumed.

## Out of scope / boundary
No claim of mathematical optimization, suitability or trade execution.

All work follows the shared implementation rules in [IMPLEMENTATION_GUIDE.md](IMPLEMENTATION_GUIDE.md). PR #34 stays a separate review checkpoint; no feature is closed by saving this plan.
