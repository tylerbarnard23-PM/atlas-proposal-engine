# Implementing the accepted advisor roadmap

Read [ROADMAP.md](../../ROADMAP.md) and the selected R01–R25 plan before coding. All 25 directions were accepted by Tyler on 22 October 2026. This document coordinates their implementation and does not report any feature as complete.

## Active delivery plan — 24 October 2026

Use [DEMO_DELIVERY_PLAN.md](DEMO_DELIVERY_PLAN.md) and the [Claude command playbook](CLAUDE_COMMANDS.md). The active handoff is intentionally short; archived release notes are not automatic startup context. D1 is released as `0381db1` (PR #72). The active sequence is D2 funded alternatives → [D2a model/manager proposals](MODEL_AND_MANAGER_PROPOSALS.md) → D3 presentation → D4 agent evidence → D5 publication; do not repeat D1. Original R01–R25 plans remain full backlog/contract references; implement their package minimums together rather than completing all feature dependencies serially. Provider deletion, advanced analytics and real-client infrastructure do not precede the synthetic demo.

Claude Code Desktop currently uses Opus 5.5 with effort as the available control: High for financial/domain/migration/agent boundary design, Medium for bounded implementation and release, Low for save/status/docs. Carry one coherent task through implementation, focused tests, self-review, final validation, docs and PR; do not stop for repeated routine design confirmations or create planning/release-only PRs. Owner merge/spend/privacy/name authority and real financial gates remain.

## Authority and working boundaries

The owner selected the complete numbered roadmap. Do not ask again whether those directions should be planned or implemented. Use the active delivery package, detailed contracts and session context for routine choices. Record concise design decisions in the same implementation issue/PR and proceed; no separate approval-only design stage is required inside the accepted scope. Surface a concrete unresolved decision when it materially changes financial meaning, requires a paid/new external service or changes the selected scope; continue independent work while that decision is resolved.

The roadmap save recorded plans only. PR #34 has since been reviewed, fixed and merged (`4e6da18`); its follow-up (R08) builds on it. Existing merge/deployment approval requirements remain in effect. No new branding name, provider purchase, live-model enablement or trade execution is selected.

## Accepted valuation boundary

Follow [VALUATION_SCOPE.md](VALUATION_SCOPE.md), approved on 22 October 2026. Core inputs are statement/imported account or explicit advisor-approved values with currency/date/provenance. Keep FX and all financial/import/review safeguards. Security pricing and research enrichment are optional future work; no quote key or successful quote lookup may be required for a supported dollar/percentage proposal. Removing optional providers must preserve accepted quote-derived values and legacy evidence, not silently revert or erase them.

R23a backup/restore is merged (PR #66, `e56335e`); every later stored-schema change needs a matching backup migration step. R18's core input contract and retirement audit precede provider removal; R19a brings only the accepted input/FX-basis record into P1 after R02/R23a. Full R19 snapshots still follow scenario/funding/intent contracts. Candidate FX review is planned but must not become a dependency on optional security repricing or delay construction once required core contracts exist. R14–R16 expose supported/unknown coverage first. No application/provider setting changes in this planning save.

## Shared implementation rules

1. Current holdings are observed data; editable scenarios, proposed-only positions, target models and approved snapshots are separate records. Previewing never mutates current holdings.
2. Extend the deterministic proposal/valuation engines and PR #34's shared preview. One scenario evaluator serves working views, cards, Copilot, readiness, PDF and handoffs; no separate UI math.
3. Money has a currency and valuation/source date. Unknown values, costs, classifications, tax basis and ownership stay explicit. No 1:1 FX fallback, zero standing in for missing data, invented balancing row or silently assumed transfer.
4. Preserve incomplete-import, missing-valuation, currency-review, approval and funding protections. An approved change to scope/readiness semantics needs explicit UI/server regression evidence, not an incidental bypass.
5. Preserve existing browser keys, ID references, saved values, firm branding and working links. R23a export/restore precedes persisted-schema changes; migrations are versioned, idempotent and recoverable.
6. Freeze reproducible approved versions before protected sharing. Local storage alone is not identity assurance, tamper-proof records or production readiness.
7. Keep synthetic data/sample markings and public scripted Copilot mode. No private PDFs or keys in git; no live model enabled on the unauthenticated public demo.
8. New or changed economic intent requires review; client acknowledgement and implementation completion are separate from advisor approval.
9. Each coherent delivery package uses one focused branch/PR (or a justified contract/migration split). Test meaningful financial/state behavior first, iterate with focused checks, self-review and batch blocking fixes, then run required full checks once on the final application code after including its docs. Re-run after later runtime changes; metadata-only edits need no local application rerun. Documentation-only updates require link/coverage/privacy checks. Do not skip automatic CI.
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
| Model/strategy/sleeve proposal | R03/R04; D2a/#73 | Versioned definitions, target versus funded grouping, known minimums, fee/exposure coverage and no sleeve/component double counting; proposal-only authority |
| Proposed instruments and linked groups | R04 | Stable IDs, supported identity data, atomic replacement behavior and migration of advisory legacy swaps |
| Funding ledger | R06 | Reserves, selected cash lines, ownership/transfer prerequisites, external flows and missing FX |
| Exposure/cost/tax/risk evidence | R14–R17 | Supported methods, source date, unknown versus zero, estimated versus verified |
| Accepted valuation / FX revision | R18, R19a | Statement/approved value, actual source date, preserved legacy evidence, mixed-date limitations, explicit input/rate revision; optional quote coverage never required |
| Candidate FX transaction | R18/#26 | Canonical pair/orientation, retained provenance, candidate dataset revision, stale confirmation fingerprint/expiry; later security repricing separately deferred |
| Approved snapshot | R19 | Reproducible inputs, output/version identity, explanation of all numerical changes, history semantics |
| Presentation/sharing/handoff | R20/R21/R24 | Snapshot-only output, private-field exclusion, access/expiry/revocation and separate acknowledgement/completion |

Use the existing engines and clearly typed input/output contracts; the UI must not compute a competing financial result. Decide one representation for current/scenario/snapshot records before extending dependent forms. Proposed names in plans are design concepts, not a mandate for a particular TypeScript class structure.

## Migration sequence

1. R23a adds schema-validated export/restore before substantial persisted-schema changes.
2. Preserve the current v7 workspace/backup and every supported legacy version as migration fixtures; keep their actual currency/approval behavior. Existing PR #34 tests (merged) remain a baseline.
3. Add the minimum scope, objective and explicit-intent contracts; do not silently reinterpret legacy monetary instructions.
4. Migrate recommendations into an editable legacy scenario with equivalent effects. Flag ambiguous intent for restatement, without rewriting the historical evidence.
5. Capture the R19a accepted input/FX-basis record after the minimum R02/R18 contracts; this is not final approval. Add proposed positions, funding and model targets against the scenario without requiring security quotes.
6. Introduce the bounded approved snapshot in D3 with round-trip/reference tests. Full multi-engagement isolation is later R23b, not a synthetic demo prerequisite; current single-workspace/backup behavior stays explicit.
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
- Historical statement quantities repriced at today's prices are only an indicative estimate, not proof of today's account holdings. Never invent a common source date or let mock data fill real-client gaps.
- A dollar allocation needs an accepted value and funding, not a live security price. Share estimates need evidenced unit-price conventions and stay unavailable when unsupported.
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

Use focused tests while iterating, then the full final application checks after code and its docs settle; do not repeat a local build for PR metadata alone or poll CI repeatedly. Blockers are wrong money/funding, approval/authority/privacy failures, data loss/broken restore or a critical broken/inaccessible task; log nonblocking cosmetics/enrichment to the relevant later slice.

Documentation-only roadmap saves need coverage, link, dependency, privacy and preserved-checkpoint checks. Do not claim a new app test/build run for a documentation change. A planning checklist is not passed acceptance evidence.

## Status model

Planned → In progress → In review → Implemented → Validated. Record the PR/commit and actual checks. Some stages may coincide for a small task, but plan acceptance alone does not cross them. Close the corresponding feature issue only when its scope is delivered, not when a planning PR references it.

Update ROADMAP.md, the issue and CLAUDE_HANDOFF.md at each stopping point. Report exact heads and deployment association. Do not treat a stale Vercel alias or an older successful check as evidence for the latest head.

## Next-session prompt

Use [CLAUDE_COMMANDS.md](CLAUDE_COMMANDS.md), starting with D1 at High effort on Opus 5.5. Read the latest checkpoint and selected package/contracts only; verify actual GitHub/local state and any in-flight work. The previous standalone R11-first and broad P0–P5 sequencing is superseded. Do not execute all packages or delete providers merely because they are in the backlog.

Each command completes inspect/design/code/test/self-review/save/PR for one coherent task. Keep docs in it, report actual heads/checks, stop for Codex review and merge only when owner-authorized. Save WIP precisely if session budget ends; do not create an unrelated tiny task or another release-checkpoint PR.

## Agent changes require separate evidence

For R22 / #54 follow [AGENT_EVALUATION.md](AGENT_EVALUATION.md). Keep provider SDK details behind a minimal adapter while shared deterministic tools enforce authority and financial correctness. Offline loop tests run in CI; synthetic paid live-model evaluations are opt-in with explicit budgets; browser tests distinguish fake-provider integration from real-model evidence. Provider/model/prompt/tool changes need relevant live regression evidence before release. Preserve requested versus actual model provenance, privacy-safe traces, bounded retries and draft deduplication. Additional providers are experimental until evaluated and approved under #59. Do not imply Claude Code/Desktop is an Atlas installation dependency or a subscription includes API credit.
