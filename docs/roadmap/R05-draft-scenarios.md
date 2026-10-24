# R05 — Compare named draft portfolio scenarios before approval

Accepted for planning: 22 October 2026. **Status: Planned; not implemented by this document.**
Tracking issue: #40. Parent roadmap: #36. Original review recommendation: **5 of 25**.
Phase: P2 foundation. Relative scope: L; no calendar estimate is committed.
Canonical plan: [R05-draft-scenarios.md](R05-draft-scenarios.md).

## Delivery routing — 24 October 2026

**D1/D2 — minimum slices only.** Follow [DEMO_DELIVERY_PLAN.md](DEMO_DELIVERY_PLAN.md) and [CLAUDE_COMMANDS.md](CLAUDE_COMMANDS.md); their package order supersedes the original phase queue. Minimum scope: One active working draft first, then duplicate and compare two named alternatives. Later scope: Rich scenario history/undo and advanced comparison management. This does not implement or complete the full R-plan. Dependencies below mean the minimum required contract, not every advanced feature of the referenced plan. Preserve all financial, backup and privacy safeguards.


## Advisor problem
The combined proposed view is coupled to individual approvals, making exploration and comparison awkward.

## Outcome
Advisors can compare alternatives with a fixed baseline before selecting one for approval.

## Advisor workflow
1. Create Draft A from the current baseline, duplicate into Draft B and rename them.
2. Edit actions or targets; inspect differences and undo scenario edits.
3. Select a candidate for review without approving merely to display it.

## Data and calculation contracts
- Separate scenario membership, recommendation approval and prose inclusion.
- Persist scenario ID/revision, baseline revision, scope, action IDs and input-rate revision.
- Duplicating allocates new scenario/action IDs and clears approval; it does not duplicate current holdings.
- Use deterministic action ordering; conflicts or mutually exclusive actions are explicit.

## Implementation slices
1. Add scenario schema and shared evaluation API around the existing proposal engine.
2. Migrate saved recommendations into a named legacy scenario while preserving effects.
3. Add creation, duplication, selection, comparison and bounded undo history.
4. Detect changes to current holdings/rates and offer an explicit rebase with differences.

## Acceptance criteria
- [ ] Drafts can show complete combined effects without advisor approval.
- [ ] Alternatives start from the same baseline unless a visible rebase is accepted.
- [ ] Undo restores scenario edits without undoing unrelated client data.
- [ ] Editing a saved action replaces by ID and never applies it twice.
- [ ] Reload keeps scenario membership and approvals correctly separated.

## Focused validation
- Store migration parity with existing approved outputs.
- Deep-frozen-input tests and duplicate/undo/rebase integration cases.
- Browser: A/B comparison, approval independence, repeat edits and reload.
For implementation, also follow repository-required typecheck, full tests, extraction eval, production build and a relevant browser check. Do not claim these passed from this planning work.

## Dependencies and sequencing
- [R02](R02-proposal-scope.md)
- [R07](R07-explicit-recommendation-intent.md)
- [R23a](R23-engagement-backup-and-switching.md) — required slice only
R23a means the export/restore slice of recommendation 23; R23b means its multi-engagement isolation slice. A dependency on another plan means its required contract/slice must exist, not that all later extensions must ship first.

## Likely touchpoints
- `src/domain/types.ts`
- `src/store/useStore.ts`
- `src/engines/proposalEngine.ts`
- `src/engines/recommendationPreview.ts (PR #34)`
- `src/app/recommendations/page.tsx`
Paths labelled proposed do not exist yet; confirm exact locations against the implementation branch.

## Migration and rollout
Migrate in one versioned store change with an export checkpoint; introduce draft evaluation before changing approval screens.

## Success evidence
Advisors can compare two alternatives without changing current data or using approval as a preview switch.
Capture actual evidence in the issue/PR; no usability results are assumed.

## Out of scope / boundary
Approved immutable records are R19; this issue owns editable scenarios.

All work follows the shared implementation rules in [IMPLEMENTATION_GUIDE.md](IMPLEMENTATION_GUIDE.md). PR #34 stays a separate review checkpoint; no feature is closed by saving this plan.
