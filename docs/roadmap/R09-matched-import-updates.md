# R09 — Match imports to accounts and reconcile statement updates

Accepted for planning: 22 October 2026. **Status: Planned; not implemented by this document.**
Tracking issue: #44. Parent roadmap: #36. Original review recommendation: **9 of 25**.
Phase: P1. Relative scope: L; no calendar estimate is committed.
Canonical plan: [R09-matched-import-updates.md](R09-matched-import-updates.md).

## Delivery routing — 24 October 2026

**After the demo milestone.** Follow [DEMO_DELIVERY_PLAN.md](DEMO_DELIVERY_PLAN.md) and [CLAUDE_COMMANDS.md](CLAUDE_COMMANDS.md); their package order supersedes the original phase queue. Minimum scope: Use the existing initial import/reconciliation flow; do not claim matched-update support. Later scope: Matched/replacement import updates, duplicate detection and reconciliation across versions. This does not implement or complete the full R-plan. Dependencies below mean the minimum required contract, not every advanced feature of the referenced plan. Preserve all financial, backup and privacy safeguards.


## Advisor problem
Appending incoming records does not distinguish repeat statements, newer snapshots and account-summary balances followed by positions.

## Outcome
An advisor understands exactly which records an import will create, update, replace or leave unchanged.

## Advisor workflow
1. Select source and intended engagement; inspect detected document/account/date/currency.
2. Review suggested account matches and a diff of new/changed/unchanged/potential duplicates.
3. Choose create, append or replace statement snapshot, then commit atomically and inspect reconciliation.

## Data and calculation contracts
- Store import batch/document identity and stable account/position matching evidence; fingerprint detection is a hint, not proof of same ownership.
- An account balance and its detailed positions are parent/children, not additive assets.
- Matching uses explicit account identity, date and identifiers; same names alone cannot auto-merge.
- Preserve recommendation links or require explicit remapping if a holding ID is replaced.

## Implementation slices
1. Unify PDF/CSV/Excel/OFX/paste review entry points around a staged import result.
2. Add duplicate-batch detection and advisor-approved account mapping.
3. Build deterministic statement diff and balance-placeholder replacement.
4. Commit with an undoable import transaction that preserves unrelated records.

## Acceptance criteria
- [ ] Reimporting identical data cannot silently double value.
- [ ] A LifeView balance followed by its detailed account positions replaces the selected balance without double counting.
- [ ] A newer statement does not append another copy of the same snapshot by default.
- [ ] Two clients/accounts with similar names are not automatically merged.
- [ ] Existing holdings/recommendations outside the chosen update remain unchanged; incomplete imports stay flagged.

## Focused validation
- Synthetic end-to-end imports across supported formats and matching ambiguities.
- Integration: recommendation references, reverse import/undo, duplicate/reload and missing rows.
- Browser: explicit account choice and before/after import totals.
For implementation, also follow repository-required typecheck, full tests, extraction eval, production build and a relevant browser check. Do not claim these passed from this planning work.

## Dependencies and sequencing
- [R23a](R23-engagement-backup-and-switching.md) — required slice only
R23a means the export/restore slice of recommendation 23; R23b means its multi-engagement isolation slice. A dependency on another plan means its required contract/slice must exist, not that all later extensions must ship first.

## Likely touchpoints
- `src/app/import-center/page.tsx`
- `src/components/import/PdfImport.tsx`
- `src/components/import/importTarget.ts`
- `src/ingestion`
- `src/store/useStore.ts`
Paths labelled proposed do not exist yet; confirm exact locations against the implementation branch.

## Migration and rollout
First add a review diff to current append behavior; enable replacement only with an explicit choice and recoverable transaction.

## Success evidence
Duplicate-value incidents and account-matching corrections in R25 tasks.
Capture actual evidence in the issue/PR; no usability results are assumed.

## Out of scope / boundary
No invented account assignments or generic-PDF accuracy guarantee.

All work follows the shared implementation rules in [IMPLEMENTATION_GUIDE.md](IMPLEMENTATION_GUIDE.md). PR #34 stays a separate review checkpoint; no feature is closed by saving this plan.
