# R10 — Repair extraction exceptions beside source evidence

Accepted for planning: 22 October 2026. **Status: Planned; not implemented by this document.**
Tracking issue: #45. Parent roadmap: #36. Original review recommendation: **10 of 25**.
Phase: P1. Relative scope: L; no calendar estimate is committed.
Canonical plan: [R10-source-repair-workbench.md](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/blob/docs/advisor-roadmap-2026-10-22/docs/roadmap/R10-source-repair-workbench.md).

## Advisor problem
The Workbench promises field mapping but mainly lists extracted rows and document-level Verify/Exclude controls.

## Outcome
An advisor can repair a skipped/ambiguous row, map its account and recheck the stated total in one place.

## Advisor workflow
1. Open an exception and view the relevant source page or precise text excerpt.
2. Edit value/currency/row type/identifier/account mapping with provenance.
3. Reparse or recalculate reconciliation, review the diff and save a revision.

## Data and calculation contracts
- Keep raw extraction immutable alongside corrected fields, page/row trace, correction reason and revision.
- Original source bytes stay local or are reattached; missing bytes produce an honest reattach state.
- Reconciliation compares independently stated account totals with detailed rows in the correct currency.
- A document-level verified flag cannot override unexplained missing rows or total mismatch.

## Implementation slices
1. Correct current copy before introducing unimplemented controls.
2. Add a source pane and editable extraction grid with keyboard access.
3. Model correction revisions and re-run parser/normalizer/reconciliation with a change summary.
4. Integrate resolved rows into the matched-import transaction with stable links.

## Acceptance criteria
- [ ] An ambiguous row can be corrected with a documented source rather than recreated as an unrelated holding.
- [ ] Headers/subtotals remain non-holdings; balance-only context is distinguished from positions.
- [ ] Missing-row mismatch persists after bulk value confirmation.
- [ ] One-cent per-row rounding tolerance remains visible and is not enlarged to hide errors.
- [ ] A missing local PDF can be reattached without uploading private contents or overwriting unrelated data.

## Focused validation
- Synthetic rotated/wrapped table and ambiguous-money fixtures through the real pipeline.
- Tests for correction/reparse, conflicting totals, source unavailability and reattachment.
- Browser: source navigation, edit/undo and readiness refresh.
For implementation, also follow repository-required typecheck, full tests, extraction eval, production build and a relevant browser check. Do not claim these passed from this planning work.

## Dependencies and sequencing
- [R09](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/blob/docs/advisor-roadmap-2026-10-22/docs/roadmap/R09-matched-import-updates.md)
- [R11](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/blob/docs/advisor-roadmap-2026-10-22/docs/roadmap/R11-data-quality-exception-queue.md)
R23a means the export/restore slice of recommendation 23; R23b means its multi-engagement isolation slice. A dependency on another plan means its required contract/slice must exist, not that all later extensions must ship first.

## Likely touchpoints
- `src/app/statement-workbench/page.tsx`
- `src/ingestion`
- `src/components/import`
- `src/engines/importCompleteness.ts`
- `src/store/useStore.ts`
Paths labelled proposed do not exist yet; confirm exact locations against the implementation branch.

## Migration and rollout
Ship source excerpts and inline correction before full PDF-region highlighting; keep original extraction recoverable.

## Success evidence
Time and assistance needed to resolve a deliberately ambiguous row.
Capture actual evidence in the issue/PR; no usability results are assumed.

## Out of scope / boundary
No silent balancing entry, blanket acknowledgement bypass or third-party PDF committed to the repository.

All work follows the shared implementation rules in [IMPLEMENTATION_GUIDE.md](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/blob/docs/advisor-roadmap-2026-10-22/docs/roadmap/IMPLEMENTATION_GUIDE.md). PR #34 stays a separate review checkpoint; no feature is closed by saving this plan.

## Client-data privacy prerequisite

Follow [PII_PROTECTION.md](PII_PROTECTION.md), issue #59, for typed minimum-data projections, source/identity handling, authorization, encrypted persistence/exports, logging and retention. Complete the controls relevant to this slice before real client information is processed; the public demo remains synthetic-only. UI masking or pseudonymous IDs alone do not satisfy the gate. Keep the existing acceptance criteria and shared calculation safeguards.
