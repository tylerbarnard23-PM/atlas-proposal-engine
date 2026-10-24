# R20 — Create concise proposal templates and contextual disclosures

Accepted for planning: 22 October 2026. **Status: Planned; not implemented by this document.**
Tracking issue: #53. Parent roadmap: #36. Original review recommendation: **20 of 25**.
Phase: P4. Relative scope: M; no calendar estimate is committed.
Canonical plan: [R20-proposal-templates-and-disclosures.md](R20-proposal-templates-and-disclosures.md).

## Delivery routing — 24 October 2026

**D3 — minimum slices only.** Follow [DEMO_DELIVERY_PLAN.md](DEMO_DELIVERY_PLAN.md) and [CLAUDE_COMMANDS.md](CLAUDE_COMMANDS.md); their package order supersedes the original phase queue. Minimum scope: One concise presentation/PDF using the existing disclosure library and section keys. Later scope: Multiple templates, audience/locale variants and configurable disclosure administration. This does not implement or complete the full R-plan. Dependencies below mean the minimum required contract, not every advanced feature of the referenced plan. Preserve all financial, backup and privacy safeguards.


## Advisor problem
Many default-selected report sections and generic implementation text obscure the client's decision.

## Outcome
An advisor can create a clear decision brief or detailed review without repeatedly editing twenty-plus switches.

## Advisor workflow
1. Choose decision brief, standard proposal or detailed wealth review.
2. Preview objective, what changes, why, costs, trade-offs and next steps.
3. Inspect suggested disclosure modules, required content, branding and source appendix before generating.

## Data and calculation contracts
- Template structure/preferences are separate from immutable snapshot data.
- Required disclosures and sample/demo markings cannot be removed by a short template.
- Applicability suggestions are based on actual included assets/actions and record advisor review.
- Unknown analytics are labelled or omitted honestly; boilerplate cannot imply a completed tax/risk analysis.

## Implementation slices
1. Define three bounded section/content templates and saved firm defaults.
2. Build a visual contents preview using the same snapshot renderer.
3. Suggest applicable alternatives, digital assets, cross-border, extraction and stale-data disclosures.
4. Replace generic next steps with structured actions where available; link detail/appendices.

## Acceptance criteria
- [ ] The short brief explains the proposed decision without losing material caveats.
- [ ] Changing template does not alter numbers, approval or scope.
- [ ] Required disclosures, sample labels and private-note exclusions persist.
- [ ] A manual valuation or unknown fee is not hidden solely to shorten the document.
- [ ] Branding and saved preferences survive a new client.

## Focused validation
- Render snapshot under each template and compare invariant amounts/versions.
- Template/disclosure applicability and required-section regressions.
- Browser/visual PDF checks for overflow, readability, long names and multiple currencies.
For implementation, also follow repository-required typecheck, full tests, extraction eval, production build and a relevant browser check. Do not claim these passed from this planning work.

## Dependencies and sequencing
- [R19](R19-approved-proposal-snapshots.md)
R23a means the export/restore slice of recommendation 23; R23b means its multi-engagement isolation slice. A dependency on another plan means its required contract/slice must exist, not that all later extensions must ship first.

## Likely touchpoints
- `src/engines/proposalEngine.ts`
- `src/app/proposal-builder/page.tsx`
- `src/app/assumptions-disclosures/page.tsx`
- `src/app/firm-branding/page.tsx`
- `src/pdf/templates/ProposalPdfTemplate.tsx`
Paths labelled proposed do not exist yet; confirm exact locations against the implementation branch.

## Migration and rollout
Start with a short brief plus existing detailed output. Simplify branding copy and keep technical implementation notes in documentation.

## Success evidence
Time to prepare an understandable brief and client comprehension of changes/trade-offs.
Capture actual evidence in the issue/PR; no usability results are assumed.

## Out of scope / boundary
No claim that automatic disclosure selection constitutes legal/compliance approval.

All work follows the shared implementation rules in [IMPLEMENTATION_GUIDE.md](IMPLEMENTATION_GUIDE.md). PR #34 stays a separate review checkpoint; no feature is closed by saving this plan.
