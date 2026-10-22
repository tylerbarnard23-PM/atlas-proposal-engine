# R21 — Present approved proposals digitally and share fixed versions

Accepted for planning: 22 October 2026. **Status: Planned; not implemented by this document.**
Tracking issue: #16. Parent roadmap: #36. Original review recommendation: **21 of 25**.
Phase: P4 local presentation; P5 protected sharing. Relative scope: L; no calendar estimate is committed.
Canonical plan: [R21-client-presentation-and-sharing.md](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/blob/docs/advisor-roadmap-2026-10-22/docs/roadmap/R21-client-presentation-and-sharing.md).

## Advisor problem
PDF is the primary deliverable and there is no version-bound interactive client view.

## Outcome
The advisor can present a concise approved proposal and later share that exact version with controlled access.

## Advisor workflow
1. Open a read-only meeting presentation of goals, current/proposed, changes, costs and trade-offs.
2. Select the approved snapshot and export the matching PDF.
3. In a later stage, share a protected/revocable version and record acknowledgement of that specific version.

## Data and calculation contracts
- Presentation reads a snapshot, never live mutable browser state; private notes and unrelated engagements are excluded.
- Client acknowledgement is distinct from advisor approval, a signed agreement and trading authorization.
- Remote sharing requires server-owned authenticated data, authorization on each resource, revocation/expiry and retention decisions before real data use.
- Changing a proposal creates a new version/link identity rather than silently changing what was acknowledged.

## Implementation slices
1. Deliver local presentation navigation and accessible current/proposed comparison first.
2. Create a short architecture decision for identity, storage, access, link expiry/revocation and event retention.
3. Implement and test protected sharing only after those prerequisites exist.
4. Add version-specific acknowledgement and advisor-visible history; defer e-signature vendor integration.

## Acceptance criteria
- [ ] Meeting view, PDF and acknowledged version use identical inputs/figures.
- [ ] A revoked/expired link cannot read the snapshot; another engagement is inaccessible.
- [ ] No link exposes the advisor's whole workspace, hidden notes or service credentials.
- [ ] Acknowledging old version A does not approve new version B.
- [ ] Anonymous/sample presentation remains clearly a demo.

## Focused validation
- Presentation/PDF parity and version navigation tests.
- Before sharing: authorization, resource isolation, expiry/revocation and private-field serialization tests.
- Browser: meeting flow and explicit version acknowledgement.
For implementation, also follow repository-required typecheck, full tests, extraction eval, production build and a relevant browser check. Do not claim these passed from this planning work.

## Dependencies and sequencing
- [R19](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/blob/docs/advisor-roadmap-2026-10-22/docs/roadmap/R19-approved-proposal-snapshots.md)
- [R20](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/blob/docs/advisor-roadmap-2026-10-22/docs/roadmap/R20-proposal-templates-and-disclosures.md)
- [R23b](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/blob/docs/advisor-roadmap-2026-10-22/docs/roadmap/R23-engagement-backup-and-switching.md) — required slice only
R23a means the export/restore slice of recommendation 23; R23b means its multi-engagement isolation slice. A dependency on another plan means its required contract/slice must exist, not that all later extensions must ship first.

## Likely touchpoints
- `src/app/proposal-builder/page.tsx`
- `src/app/pdf-preview/page.tsx`
- `src/pdf/templates/ProposalPdfTemplate.tsx`
- `proposed server snapshot/access layer`
Paths labelled proposed do not exist yet; confirm exact locations against the implementation branch.

## Migration and rollout
Stage A works locally with synthetic data. Stage B is blocked until the explicit server/access design and tests are complete.

## Success evidence
Client comprehension and accurate identification of the version received.
Capture actual evidence in the issue/PR; no usability results are assumed.

## Out of scope / boundary
No public raw snapshot URLs, implied e-signature equivalence or automatic trading permission.

All work follows the shared implementation rules in [IMPLEMENTATION_GUIDE.md](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/blob/docs/advisor-roadmap-2026-10-22/docs/roadmap/IMPLEMENTATION_GUIDE.md). PR #34 stays a separate review checkpoint; no feature is closed by saving this plan.

## Client-data privacy prerequisite

Follow [PII_PROTECTION.md](PII_PROTECTION.md), issue #59, for typed minimum-data projections, source/identity handling, authorization, encrypted persistence/exports, logging and retention. Complete the controls relevant to this slice before real client information is processed; the public demo remains synthetic-only. UI masking or pseudonymous IDs alone do not satisfy the gate. Keep the existing acceptance criteria and shared calculation safeguards.
