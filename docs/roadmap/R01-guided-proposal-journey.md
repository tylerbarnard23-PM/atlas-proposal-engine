# R01 — Guide advisors through a complete proposal journey

Accepted for planning: 22 October 2026. **Status: Planned; not implemented by this document.**
Tracking issue: #37. Parent roadmap: #36. Original review recommendation: **1 of 25**.
Phase: P2 shell; P4 complete journey. Relative scope: M; no calendar estimate is committed.
Canonical plan: [R01-guided-proposal-journey.md](R01-guided-proposal-journey.md).

## Delivery routing — 24 October 2026

**D1/D3/D5 — minimum slices only.** Follow [DEMO_DELIVERY_PLAN.md](DEMO_DELIVERY_PLAN.md) and [CLAUDE_COMMANDS.md](CLAUDE_COMMANDS.md); their package order supersedes the original phase queue. Minimum scope: One working route and contextual edit/review/presentation navigation. Later scope: Broader navigation customization and every exceptional journey. This does not implement or complete the full R-plan. Dependencies below mean the minimum required contract, not every advanced feature of the referenced plan. Preserve all financial, backup and privacy safeguards.


## Advisor problem
Fourteen navigation destinations require the advisor to assemble a single client task across modules.

## Outcome
The advisor can resume and complete Prepare → Set scope & goals → Design → Review & approve → Present without losing context.

## Advisor workflow
1. Enter an engagement and see the current stage, next action and blockers.
2. Open a blocker in context; return to the same scenario, filters and scroll position.
3. Use direct navigation when desired; firm setup and provider configuration remain available outside the daily path.

## Data and calculation contracts
- Derive stage readiness from shared checks and scenario state; never maintain an independent completed-stage Boolean.
- Route context includes engagement ID, scenario ID and selected position; invalid/deleted context has an explicit recovery state.

## Implementation slices
1. P2: add a stage shell and resume context using existing readiness links; no new calculation or gate.
2. P4: connect each stage to the completed scope, workspace, review and presentation flows.
3. Provide empty/new-client and returning-client entry points, plus a next-action dashboard.
4. Keep existing routes working; replace module-oriented copy with the advisor task.

## Acceptance criteria
- [ ] An incomplete import opens the relevant source review, then returns to the originating proposal.
- [ ] Refreshing or navigating back restores the selected engagement/scenario; no cross-client context leak.
- [ ] Unresolved blockers remain visible; moving between stages does not approve or dismiss them.
- [ ] Expert navigation and existing bookmarks still work.

## Focused validation
- Browser: new client and returning-client journey, blocked final output, back/forward/reload.
- Keyboard focus returns to the originating action after resolving a task.
- Verify stage counts match shared readiness, including partial valuations.
For implementation, also follow repository-required typecheck, full tests, extraction eval, production build and a relevant browser check. Do not claim these passed from this planning work.

## Approved valuation scope adjustment — 22 October 2026

Follow [VALUATION_SCOPE.md](VALUATION_SCOPE.md). The ordinary journey is import/reconcile → accept source values/dates and scope → design/fund → review/approve → present. Security-price provider configuration is outside that path; a supported dollar proposal works without quote keys. Keep necessary FX and actual blockers visible, with existing bookmarks preserved. R25 must test the complete flow and source-date comprehension without provider setup. This is planned navigation work, not a UI change in this save.

## Dependencies and sequencing
- [R02](R02-proposal-scope.md)
- [R03](R03-allocation-workspace.md)
- [R08](R08-contextual-holding-preview.md)
- [R09](R09-matched-import-updates.md)
- [R11](R11-data-quality-exception-queue.md)
- [R19](R19-approved-proposal-snapshots.md)
- [R20](R20-proposal-templates-and-disclosures.md)
R23a means the export/restore slice of recommendation 23; R23b means its multi-engagement isolation slice. A dependency on another plan means its required contract/slice must exist, not that all later extensions must ship first.

## Likely touchpoints
- `src/components/layout`
- `src/app/page.tsx`
- `src/app/proposal-builder/page.tsx`
- `src/app/pdf-preview/page.tsx`
Paths labelled proposed do not exist yet; confirm exact locations against the implementation branch.

## Migration and rollout
Deliver the shell before moving routes. Remove redundant daily navigation only after task testing; retain redirects or aliases.

## Success evidence
Unassisted task completion and backtracking/page changes in the R25 study.
Capture actual evidence in the issue/PR; no usability results are assumed.

## Out of scope / boundary
No wholesale visual redesign, new readiness bypass or removal of expert access.

All work follows the shared implementation rules in [IMPLEMENTATION_GUIDE.md](IMPLEMENTATION_GUIDE.md). PR #34 stays a separate review checkpoint; no feature is closed by saving this plan.
