# R23 — Back up engagements and preserve multiple clients safely

Accepted for planning: 22 October 2026. **Status: Planned.** Slice R23a (versioned export and validated, previewed, all-or-nothing restore) is complete: PR #66 merged as `e56335e` on 23 October 2026. R23b (multi-engagement storage and switching) is not started; #55 stays open.
Tracking issue: #55. Parent roadmap: #36. Original review recommendation: **23 of 25**.
Phase: P0 backup; P1/P2 client isolation. Relative scope: L staged; no calendar estimate is committed.
Canonical plan: [R23-engagement-backup-and-switching.md](R23-engagement-backup-and-switching.md).

## Delivery routing — 24 October 2026

**R23a already released; R23b after the demo.** Follow [DEMO_DELIVERY_PLAN.md](DEMO_DELIVERY_PLAN.md) and [CLAUDE_COMMANDS.md](CLAUDE_COMMANDS.md); their package order supersedes the original phase queue. Minimum scope: R23a backup/restore is already released and must support every later schema migration. Later scope: R23b multi-engagement storage, isolation, switching and archiving. This does not implement or complete the full R-plan. Dependencies below mean the minimum required contract, not every advanced feature of the referenced plan. Preserve all financial, backup and privacy safeguards.


## Advisor problem
Reload persistence is useful, but starting another client clears the engagement and there is no backup/client list flow.

## Outcome
Advisors can recover work and switch engagements without mixing or losing data.

## Advisor workflow
1. Export the current engagement with a visible schema version and last-saved state.
2. Validate and preview a restore into a new engagement, with explicit replacement only when chosen.
3. Select/archive engagements while firm settings remain shared and client data isolated.

## Data and calculation contracts
- R23a export/restore is the early migration checkpoint; R23b is multi-engagement storage and switching.
- Export includes holdings, accounts, recommendations, scenarios, source metadata and relevant history; excludes API keys and private source bytes by default.
- Use validation, size/schema checks and reference integrity before any replacement; failure is atomic.
- Preserve existing storage key and perform an idempotent migration; browser snapshots are not a secure multi-user backend.

## Implementation slices
1. Ship versioned engagement export and non-destructive import/restore first.
2. Define firm-level versus engagement-level ownership and migrate the current workspace into one engagement.
3. Add client/proposal selection, archive/restore and scoped state queries.
4. Test migrations alongside each later scenario/snapshot schema change.

## Acceptance criteria
- [ ] Malformed, oversized or cross-linked backup cannot partially replace current work.
- [ ] An exported engagement restores all supported IDs/links and clearly identifies unavailable PDF bytes.
- [ ] Opening a second client preserves the first and never shows its holdings/notes accidentally.
- [ ] Firm branding persists while proposal approval and history stay per engagement.
- [ ] Existing saved workspaces and production links continue to work through migration and later naming changes.

## Focused validation
- Round-trip current/legacy backup, migration twice, unsupported future schema and corrupt references.
- Browser: two clients, switching, archive/restore, reload and cancelled replacement.
- No API secret is serialized; private source bytes are explicitly handled.
For implementation, also follow repository-required typecheck, full tests, extraction eval, production build and a relevant browser check. Do not claim these passed from this planning work.

## Dependencies and sequencing
- No feature dependency; it can be the first bounded task after the current checkpoint.
R23a means the export/restore slice of recommendation 23; R23b means its multi-engagement isolation slice. A dependency on another plan means its required contract/slice must exist, not that all later extensions must ship first.

## Likely touchpoints
- `src/store/useStore.ts`
- `src/domain/types.ts`
- `src/app/settings/page.tsx`
- `src/app/client-profile/page.tsx`
- `src/components/layout`
Paths labelled proposed do not exist yet; confirm exact locations against the implementation branch.

## Migration and rollout
R23a precedes migrations for scenarios/import changes. R23b introduces client isolation before multi-client presentation/sharing.

## Success evidence
Successful recovery and zero cross-engagement data leakage in task tests.
Capture actual evidence in the issue/PR; no usability results are assumed.

## Out of scope / boundary
No silent cloud sync, institutional retention claim or real-client hosting authorization.

All work follows the shared implementation rules in [IMPLEMENTATION_GUIDE.md](IMPLEMENTATION_GUIDE.md). PR #34 stays a separate review checkpoint; no feature is closed by saving this plan.

## Client-data privacy prerequisite

Follow [PII_PROTECTION.md](PII_PROTECTION.md), issue #59, for typed minimum-data projections, source/identity handling, authorization, encrypted persistence/exports, logging and retention. Complete the controls relevant to this slice before real client information is processed; the public demo remains synthetic-only. UI masking or pseudonymous IDs alone do not satisfy the gate. Keep the existing acceptance criteria and shared calculation safeguards.
