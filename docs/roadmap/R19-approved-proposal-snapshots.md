# R19 — Freeze approved proposal snapshots and clarify approval

Accepted for planning: 22 October 2026. **Status: Planned; not implemented by this document.**
Tracking issue: #52. Parent roadmap: #36. Original review recommendation: **19 of 25**.
Phase: P3 foundation; P4 delivery. Relative scope: L; no calendar estimate is committed.
Canonical plan: [R19-approved-proposal-snapshots.md](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/blob/docs/advisor-roadmap-2026-10-22/docs/roadmap/R19-approved-proposal-snapshots.md).

## Advisor problem
Current calculations follow changing workspace inputs and approval/prose controls can leave the final economic package unclear.

## Outcome
Each approved proposal has one reproducible set of inputs, changes, explanations and generated outputs.

## Advisor workflow
1. Review all financial actions, funding, task/advisory items and blockers for a scenario revision.
2. Approve the complete economic package; show the role of prose inclusion separately.
3. Generate output from that snapshot; later edits create a new draft/revision for review.

## Data and calculation contracts
- Snapshot captures scope, current/proposed holdings, input/FX revisions, classifications, actions, funding, methods, disclosures, notes and identity/date/version.
- One shared evaluator and readiness result underpins screen, PDF and exports.
- Every action affecting numbers retains a concise client-visible explanation even if long prose is excluded.
- Local append-only snapshots are reproducible application records, not tamper-proof institutional books-and-records compliance.

## Implementation slices
1. Create the version-history child of #18 and define snapshot schema/serialization.
2. Implement review-package comparison and snapshot creation only when shared checks pass.
3. Make final PDF generation consume a selected snapshot; preserve existing server recomputation/gates.
4. Add revision history, superseding/new-draft flow and visible version identity.

## Acceptance criteria
- [ ] Refreshing prices/FX or editing a current holding cannot rewrite a saved approved version.
- [ ] All final outputs for one snapshot agree on values and inputs.
- [ ] Approval, client acknowledgement and implementation status are distinct.
- [ ] Excluded long prose does not hide a numerical change from the review package.
- [ ] A material change invalidates the draft approval and retains the old snapshot.

## Focused validation
- Round-trip snapshot/render determinism and old-version stability after workspace edits.
- Route checks: stale/changed revision, missing FX, incomplete import and unresolved currency review.
- Browser: approve → output → edit → compare versions; current records remain separate.
For implementation, also follow repository-required typecheck, full tests, extraction eval, production build and a relevant browser check. Do not claim these passed from this planning work.

## Dependencies and sequencing
- [R02](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/blob/docs/advisor-roadmap-2026-10-22/docs/roadmap/R02-proposal-scope.md)
- [R05](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/blob/docs/advisor-roadmap-2026-10-22/docs/roadmap/R05-draft-scenarios.md)
- [R06](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/blob/docs/advisor-roadmap-2026-10-22/docs/roadmap/R06-funding-and-cash-controls.md)
- [R07](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/blob/docs/advisor-roadmap-2026-10-22/docs/roadmap/R07-explicit-recommendation-intent.md)
- [R18](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/blob/docs/advisor-roadmap-2026-10-22/docs/roadmap/R18-valuation-and-fx-review.md)
R23a means the export/restore slice of recommendation 23; R23b means its multi-engagement isolation slice. A dependency on another plan means its required contract/slice must exist, not that all later extensions must ship first.

## Likely touchpoints
- `src/domain/types.ts`
- `src/store/useStore.ts`
- `src/engines/complianceEngine.ts`
- `src/app/proposal-builder/page.tsx`
- `src/app/api/proposals/[id]/generate-pdf/route.ts`
- `src/pdf/templates/ProposalPdfTemplate.tsx`
Paths labelled proposed do not exist yet; confirm exact locations against the implementation branch.

## Migration and rollout
Introduce versioned local snapshots before any share link; preserve prior PDF-history entries as legacy, with their evidence limitations visible.

## Success evidence
Advisors can identify precisely which version was approved and what changed since.
Capture actual evidence in the issue/PR; no usability results are assumed.

## Out of scope / boundary
No claim of cryptographic immutability, identity assurance or regulatory retention from browser storage alone.

All work follows the shared implementation rules in [IMPLEMENTATION_GUIDE.md](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/blob/docs/advisor-roadmap-2026-10-22/docs/roadmap/IMPLEMENTATION_GUIDE.md). PR #34 stays a separate review checkpoint; no feature is closed by saving this plan.

## Client-data privacy prerequisite

Follow [PII_PROTECTION.md](PII_PROTECTION.md), issue #59, for typed minimum-data projections, source/identity handling, authorization, encrypted persistence/exports, logging and retention. Complete the controls relevant to this slice before real client information is processed; the public demo remains synthetic-only. UI masking or pseudonymous IDs alone do not satisfy the gate. Keep the existing acceptance criteria and shared calculation safeguards.
