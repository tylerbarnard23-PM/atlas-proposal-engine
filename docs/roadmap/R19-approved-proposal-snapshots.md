# R19 — Freeze approved proposal snapshots and clarify approval

Accepted for planning: 22 October 2026. **Status: Planned; not implemented by this document.** **D3 minimum in review (PR #81):** approved versions freeze the bounded economic package with later-edit isolation and version-gated final issuance. Advanced version navigation, retention and institutional records guarantees remain later.
Tracking issue: #52. Parent roadmap: #36. Original review recommendation: **19 of 25**.
Phase: P1 accepted input basis (R19a); P3/P4 full approved snapshots. Relative scope: L; no calendar estimate is committed.
Canonical plan: [R19-approved-proposal-snapshots.md](R19-approved-proposal-snapshots.md).

## Delivery routing — 24 October 2026

**D1/D3 — minimum slices only.** Follow [DEMO_DELIVERY_PLAN.md](DEMO_DELIVERY_PLAN.md) and [CLAUDE_COMMANDS.md](CLAUDE_COMMANDS.md); their package order supersedes the original phase queue. Minimum scope: Input/FX-basis record in D1; complete bounded approved economic snapshot and later-edit isolation in D3. Later scope: Advanced version navigation/retention and institutional audit/records guarantees. This does not implement or complete the full R-plan. Dependencies below mean the minimum required contract, not every advanced feature of the referenced plan. Preserve all financial, backup and privacy safeguards.


## Approved D2a contract routing — 24 October 2026

The bounded [model and manager proposal slice](MODEL_AND_MANAGER_PROPOSALS.md), #73, follows D2 and precedes D3. Reuse this plan's minimum scenario/funding/exposure/fee/snapshot contracts as applicable. Keep strategy sleeves separate from underlying asset-class exposure and owned positions, disclose unknown data, preserve model revisions and use shared funding/reserve/approval gates. Full enrichment and UMA operations remain later; this note claims no implementation.

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
1. P1 R19a: after R23a and minimum R02/R18 input contracts, define/store a versioned accepted valuation-basis record (values, identities, source dates/provenance and exact FX/input revision). Preserve mixed dates and legacy evidence; this record is not advisor approval. Do not wait for full scenarios/funding or optional security feeds.
2. P3/P4: create the version-history child of #18 and define the complete approved snapshot schema/serialization after the existing scenario/funding/intent dependencies.
3. Implement review-package comparison and snapshot creation only when shared checks pass.
4. Make final PDF generation consume a selected snapshot; preserve existing server recomputation/gates.
5. Add revision history, superseding/new-draft flow and visible version identity.

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

## Approved valuation scope adjustment — 22 October 2026

Follow [VALUATION_SCOPE.md](VALUATION_SCOPE.md). R19a preserves the accepted valuation/input basis early; it must not be presented as a fully approved proposal, tamper-proof audit log or completed R19. Store the actual per-value source dates and FX revision, not a fake common statement date. An optional quote failure or retiring an adapter cannot change that record. A changed accepted input creates a new draft revision and follows material-change review.

Full approved snapshots still require R02/R05/R06/R07 and the core R18 accepted-value/FX contract, not optional repricing or the later candidate-FX UI. Round-trip the basis record through storage/backup and prove its values stay reproducible after quote-cache or FX refreshes; distinguish historical reproduction from issuing a new final deliverable under current readiness checks.

## Dependencies and sequencing
- **R19a only:** R23a recoverability and minimum R02/R18 accepted-input contracts; no full R05/R06 dependency.
- **Full approved package:** the following existing dependencies remain; R18 means its core accepted-value/FX contract, not optional providers or every later refresh extension.
- [R02](R02-proposal-scope.md)
- [R05](R05-draft-scenarios.md)
- [R06](R06-funding-and-cash-controls.md)
- [R07](R07-explicit-recommendation-intent.md)
- [R18](R18-valuation-and-fx-review.md)
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

All work follows the shared implementation rules in [IMPLEMENTATION_GUIDE.md](IMPLEMENTATION_GUIDE.md). PR #34 stays a separate review checkpoint; no feature is closed by saving this plan.

## Client-data privacy prerequisite

Follow [PII_PROTECTION.md](PII_PROTECTION.md), issue #59, for typed minimum-data projections, source/identity handling, authorization, encrypted persistence/exports, logging and retention. Complete the controls relevant to this slice before real client information is processed; the public demo remains synthetic-only. UI masking or pseudonymous IDs alone do not satisfy the gate. Keep the existing acceptance criteria and shared calculation safeguards.
