# R07 — Separate financial changes from tasks and require explicit intent

Accepted for planning: 22 October 2026. **Status: Planned; not implemented by this document.**
Tracking issue: #42. Parent roadmap: #36. Original review recommendation: **7 of 25**.
Phase: P1. Relative scope: M; no calendar estimate is committed.
Canonical plan: [R07-explicit-recommendation-intent.md](R07-explicit-recommendation-intent.md).

## Advisor problem
A missing amount can imply a full sale or 50% reduction/paydown; service tasks share an oversized investment-action form.

## Outcome
Blank or unsupported instructions cannot masquerade as approved economic decisions.

## Advisor workflow
1. Start from a holding or choose a service task.
2. Select Buy, Sell amount, Sell all, Set target or Pay down; only relevant inputs appear.
3. Save a draft or approve after explicit intent and the shared preview are valid.

## Data and calculation contracts
- Represent explicit full exit separately from absent amount.
- Task records have status/owner/due date and no numerical portfolio effect.
- Validate intent at store/tool/server boundaries, not only disabled UI controls.
- Legacy ambiguous actions retain their previous interpretation as historical evidence but require restatement before new approval.

## Implementation slices
1. Inventory recommendation types and classify supported financial operations versus advisory/tasks.
2. Create a typed intent resolver used by engine, form, Copilot and readiness.
3. Remove implicit halve/full-exit defaults for new financial actions and add a safe migration/review flag.
4. Simplify status/save/approve controls and keep material-edit approval clearing.

## Acceptance criteria
- [ ] Blank reduce or debt amount cannot be approved as 50%.
- [ ] Sell all is explicit and shows the full amount; blank sell remains incomplete.
- [ ] Target overrides amount visibly; percent means percent of the named basis.
- [ ] Unsupported transfer/hedge text is advisory until structured legs exist.
- [ ] Imported/migrated currency-review flags remain open after unrelated edits.

## Focused validation
- Regression first: current blank-amount defaults, explicit sell-all, percentage and target precedence.
- Boundary tests for manual/store/Copilot saves and final route.
- Browser: task versus financial form, keyboard and approval transitions.
For implementation, also follow repository-required typecheck, full tests, extraction eval, production build and a relevant browser check. Do not claim these passed from this planning work.

## Dependencies and sequencing
- No feature dependency; it can be the first bounded task after the current checkpoint.
R23a means the export/restore slice of recommendation 23; R23b means its multi-engagement isolation slice. A dependency on another plan means its required contract/slice must exist, not that all later extensions must ship first.

## Likely touchpoints
- `src/domain/types.ts`
- `src/engines/proposalEngine.ts`
- `src/engines/recommendationAmounts.ts`
- `src/store/useStore.ts`
- `src/app/recommendations/page.tsx`
- `src/copilot/tools.ts`
Paths labelled proposed do not exist yet; confirm exact locations against the implementation branch.

## Migration and rollout
Preserve old workspace effects until deliberately restated; surface review rather than silently reinterpreting them.

## Success evidence
No observed accidental full exit or half-paydown from a blank field.
Capture actual evidence in the issue/PR; no usability results are assumed.

## Out of scope / boundary
Do not change recommendation currencies, resolve migration flags incidentally or execute any action.

All work follows the shared implementation rules in [IMPLEMENTATION_GUIDE.md](IMPLEMENTATION_GUIDE.md). PR #34 stays a separate review checkpoint; no feature is closed by saving this plan.
