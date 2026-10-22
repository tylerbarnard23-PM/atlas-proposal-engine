# Implementing the accepted advisor roadmap

Read [ROADMAP.md](../../ROADMAP.md) and the selected R01–R25 plan before coding. All 25 directions were accepted by Tyler on 22 October 2026. This document coordinates their implementation and does not report any feature as complete.

## Authority and working boundaries

The owner selected the complete numbered roadmap. Do not ask again whether those directions should be planned or implemented. Use the detailed plan and session context for routine choices. Surface a concrete unresolved decision when it materially changes financial meaning, requires a paid/new external service or changes the selected scope; continue independent work while that decision is resolved.

The roadmap save recorded plans only. PR #34 has since been reviewed, fixed and merged (`4e6da18`); its follow-up (R08) builds on it. Existing merge/deployment approval requirements remain in effect. No new branding name, provider purchase, live-model enablement or trade execution is selected.

## Shared implementation rules

1. Current holdings are observed data; editable scenarios, proposed-only positions, target models and approved snapshots are separate records. Previewing never mutates current holdings.
2. Extend the deterministic proposal/valuation engines and PR #34's shared preview. One scenario evaluator serves working views, cards, Copilot, readiness, PDF and handoffs; no separate UI math.
3. Money has a currency and valuation/source date. Unknown values, costs, classifications, tax basis and ownership stay explicit. No 1:1 FX fallback, zero standing in for missing data, invented balancing row or silently assumed transfer.
4. Preserve incomplete-import, missing-valuation, currency-review, approval and funding protections. An approved change to scope/readiness semantics needs explicit UI/server regression evidence, not an incidental bypass.
5. Preserve existing browser keys, ID references, saved values, firm branding and working links. R23a export/restore precedes persisted-schema changes; migrations are versioned, idempotent and recoverable.
6. Freeze reproducible approved versions before protected sharing. Local storage alone is not identity assurance, tamper-proof records or production readiness.
7. Keep synthetic data/sample markings and public scripted Copilot mode. No private PDFs or keys in git; no live model enabled on the unauthenticated public demo.
8. New or changed economic intent requires review; client acknowledgement and implementation completion are separate from advisor approval.
9. Each implementation uses a focused issue/branch/PR, tests meaningful financial/ingestion/state behavior first, runs the repository-required checks and a relevant browser flow. Documentation-only updates require link/coverage/privacy checks, not a new app test suite.
10. Update plan/issue status and handoff with actual evidence. An accepted plan is Planned, not Implemented. No blanket rewrite, merge, deployment or new external integration is implied by roadmap acceptance.


## PII protection gate

Read [PII_PROTECTION.md](PII_PROTECTION.md), issue #59, before changing a data serializer, raw-source retention, backup, snapshot, Copilot payload or share-link behavior. Keep real client data out of the public demo. Use explicit allowlist projections and pseudonymous client/account IDs; sensitive financial records remain confidential after pseudonymization.

Authentication/authorization, encrypted persistence with managed keys, safe logs/exports, approved vendor retention and demonstrated boundary tests are required before a real-client pilot. Database encryption alone does not stop an authorized but compromised application session from reading data. Browser encryption with an automatically available same-origin key does not solve XSS. Preserve data intentionally during migrations and do not silently erase existing saved work.

Direct uploads into Claude Desktop/Code are outside Atlas's redaction boundary and follow the actual Claude account/organization policy. No-training defaults must not be described as zero retention. No API/provider setting is changed by this documentation update.

## Coordinate the domain contracts

| Contract | Owning plans | Required decisions |
|---|---|---|
| Engagement and backup envelope | R23 | Firm versus client ownership, schema version, safe validation/restore, identity remapping |
| Client objectives and constraints | R12 | Unassessed state, reserve currency/timeframe, restrictions, private versus client-visible fields |
| Proposal scope | R02 | Included/held-away/context-only records, denominator, unknown coverage, revision |
| Scenario and action intent | R05/R07 | Baseline revision, membership versus approval, explicit full exit, conflicting actions/order |
| Proposed instruments and linked groups | R04 | Stable IDs, supported identity data, atomic replacement behavior and migration of advisory legacy swaps |
| Funding ledger | R06 | Reserves, selected cash lines, ownership/transfer prerequisites, external flows and missing FX |
| Exposure/cost/tax/risk evidence | R14–R17 | Supported methods, source date, unknown versus zero, estimated versus verified |
| Refresh transaction | R18/#26 | Canonical pair/orientation, retained provenance, candidate dataset revision, stale confirmation fingerprint/expiry |
| Approved snapshot | R19 | Reproducible inputs, output/version identity, explanation of all numerical changes, history semantics |
| Presentation/sharing/handoff | R20/R21/R24 | Snapshot-only output, private-field exclusion, access/expiry/revocation and separate acknowledgement/completion |

Use the existing engines and clearly typed input/output contracts; the UI must not compute a competing financial result. Decide one representation for current/scenario/snapshot records before extending dependent forms. Proposed names in plans are design concepts, not a mandate for a particular TypeScript class structure.

## Migration sequence

1. R23a adds schema-validated export/restore before substantial persisted-schema changes.
2. Preserve the current v5 workspace and its current currency/approval behavior as a migration fixture. Existing PR #34 tests (merged) remain a baseline.
3. Add the minimum scope, objective and explicit-intent contracts; do not silently reinterpret legacy monetary instructions.
4. Migrate recommendations into an editable legacy scenario with equivalent effects. Flag ambiguous intent for restatement, without rewriting the historical evidence.
5. Add proposed positions, funding and model targets against that scenario.
6. Introduce approved snapshots and multi-engagement boundaries with round-trip/reference tests.
7. Treat every later schema change as an explicit version migration. A cosmetic project rename cannot change storage keys or reset data.

Migrations need clear ownership, recoverability and idempotence. Reject an invalid imported backup before writing any of it. Unknown future schemas must not be coerced into the current one. Preserve source-document metadata even when original PDF bytes are unavailable.

## Readiness and approvals

The current readiness checks are data/output gates, not a claim of regulatory compliance. Preserve their meaning while the new scope/scenario model is introduced. Define which records are in scope for a final deliverable, show context/excluded unknowns, and add explicit UI/server regressions before changing any gate semantics.

Approval must identify the scenario/input revision reviewed. Financial changes omitted from long recommendation prose still need a concise explanation in the package. A refresh creates a reviewable new draft or input revision; it does not rewrite an approved snapshot. Client acknowledgement, signed legal agreements, transfers and executed trades are distinct events.

R21 Stage A is local presentation. Stage B remote sharing cannot be built as a raw public JSON URL. First record an architecture decision for server storage/ownership, authentication/authorization, private-field serialization, expiry/revocation and event retention. Test those boundaries before using anything beyond synthetic data. No hosting or provider change is selected by this roadmap.

## Financial and analytical honesty

- No missing FX is valued 1:1. Use a holding's approved valuation currency where applicable.
- Amounts retain their entered currency; percentages retain their named basis. Convert once and show source/date.
- Scenario totals reconcile to actual funding and explicit external flows. A balancing entry must not hide an infeasible proposal.
- Balance-only accounts and exposure estimates do not create extra owned holdings.
- Unknown costs, income, basis, risk coverage and ownership are not zero or permission.
- A fixed asset-class shock is an illustrative stress, not a historical backtest. A questionnaire is not a proprietary calibrated portfolio risk model.
- Projections require a documented dataset and methodology. Show uncertainty/unsupported coverage; do not fabricate probabilities.
- Only actual, applicable data support a savings or tax-impact claim. Preserve sample markings and explain estimates.

## Accepted FX policy to preserve

Keep #26's accepted direction/comment 6325161797 and #28 separate:
- Merge returned pairs in either orientation, keep unreturned pair dates/sources and report failure without changes.
- In-use currencies include holdings, account cash/base, recommendations, reporting and approved valuation currencies.
- Resolve newer data rather than allowing a stale direct pair to beat a fresh inverse.
- Seven calendar days is an initial named product policy. An explicit stale-rate confirmation also expires after its defined period and when covered rates change.
- Manual provenance stays manual; mock/fallback cannot become freshly provider-verified. Only successful provider data can be described as freshly refreshed.
- Check current rates through the shared UI/Copilot/PDF readiness path, and disclose the actual rates used.
- Calendar dates must not shift between local browser and server rendering. True timestamps retain their instant semantics.

## Verification expectations

For a meaningful financial, ingestion or state change, first reproduce the defect or pin a behavioral example. Use real parser/engine/store paths rather than tests mirroring helper code. Cover supported, missing/ambiguous and cancellation/reload paths. Existing private PDF tests may skip in CI; synthetic fixtures must carry core coverage.

Run required typecheck, full tests, extraction eval, production build and a focused browser flow for implementation. Inspect the generated PDF visually when its layout changes. Keep the sample baseline stable unless an intended behavior change is explicitly documented; do not recapture a baseline merely to hide a failure.

Documentation-only roadmap saves need coverage, link, dependency, privacy and preserved-checkpoint checks. Do not claim a new app test/build run for a documentation change. A planning checklist is not passed acceptance evidence.

## Status model

Planned → In progress → In review → Implemented → Validated. Record the PR/commit and actual checks. Some stages may coincide for a small task, but plan acceptance alone does not cross them. Close the corresponding feature issue only when its scope is delivered, not when a planning PR references it.

Update ROADMAP.md, the issue and CLAUDE_HANDOFF.md at each stopping point. Report exact heads and deployment association. Do not treat a stale Vercel alias or an older successful check as evidence for the latest head.

## Next-session prompt

```text
Read docs/CLAUDE_HANDOFF.md, ROADMAP.md and docs/roadmap/IMPLEMENTATION_GUIDE.md.
All 25 numbered enhancements are accepted; the saved work is planning, not implementation.

Confirm repository and working-tree state without discarding work. PR #34 is merged (4e6da18) and live; its checkpoint is resolved.

Next, follow existing #26's accepted policy/comment and R18's sequencing, with #28 kept separate. Use one bounded implementation branch/PR and the required validation. Before later schema migrations, deliver R23a backup/validated restore. Follow the selected plan's dependencies and preserve the existing engines, saved data, currencies, import safeguards and working links. Update the roadmap and handoff with actual evidence. Do not start all 25 at once or claim planned features are already delivered.
```
