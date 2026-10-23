# R18 — Use accepted valuations and review FX changes; defer security repricing

Accepted for planning: 22 October 2026. **Status: Planned.** The P0 slices are complete: #26 (PR #60, merged `e54d56e`) and #28 (PR #63, merged `23db797`), 22 October 2026. The reviewable candidate refresh and the rest of this plan are not implemented.
Tracking issue: #51. Parent roadmap: #36. Original review recommendation: **18 of 25**.
Phase: P0 fixes complete; P1 core valuation scope; later candidate FX review. Relative scope: M staged; no calendar estimate is committed.
Canonical plan: [R18-valuation-and-fx-review.md](R18-valuation-and-fx-review.md).

## Advisor problem
The provider/enrichment surface is broader than the core advisor task needs. Optional pricing can distract from accepting source values and constructing a funded proposal; FX changes still need transparent review.

## Outcome
The advisor completes a proposal from accepted source values without security-provider setup, while necessary FX and any later candidate changes remain explicit and reviewable.

## Advisor workflow
1. Review accepted statement/imported account or advisor-approved values, with currency, source and actual date; mixed dates remain visible.
2. Supply/review the FX actually needed and resolve material data exceptions, without configuring optional security feeds.
3. Construct the funded proposal using those accepted inputs.
4. In a later FX slice, inspect candidate-versus-current effects before Apply or Cancel. Security repricing remains separately deferred.

## Data and calculation contracts
- Follow [VALUATION_SCOPE.md](VALUATION_SCOPE.md). Security pricing is not required for supported dollar/percentage proposals; accepted dated values do not become fresh by acknowledgement.
- Retain #26's accepted pair-orientation merge, dynamic in-use currencies (including approved valuation currencies), provenance and expiration rules.
- Seven calendar days is the initial product policy, not an institutional/regulatory standard; use a named constant.
- A confirmation binds the covered rate fingerprint and time and expires on policy deadline or changed rates.
- Preserve accepted quote-derived values when retiring their source; do not invent an original statement value or provenance. Mock/generated prices remain synthetic-only.
- Apply a later candidate FX refresh atomically with an input revision; never rewrite an approved snapshot.
- Date-only labels follow #28; source timestamps and confirmation times retain instant semantics.

## Implementation slices
1. Preserve completed PR #34, #26/PR #60 and #28/PR #63 behavior; this scope adjustment does not undo those fixes.
2. After R23a review/merge and before any schema migration, audit quote/cache/acceptance/Copilot/PDF consumers. Define accepted source values and review semantics with R11/R02; retain FX separately.
3. Remove quote/provider setup from the daily proposal path and disable optional enrichment first. Prove no-key/quote-services-unavailable flows and equivalent saved financial results. Then retire unused adapters/routes/dependencies/configuration with safe links and backups; never delete the FX layer wholesale.
4. Coordinate with R19a's P1 input/FX-basis record. Core input contracts and construction must not wait for full snapshot UX or optional providers.
5. Later, add candidate FX results and current-versus-candidate comparison, showing changed recommendation effects/approval consequences before atomic apply. Preserve concurrency/revision and confirmation rules.
6. Only after observed need and explicit coverage/licensing/cost/privacy decisions, consider one optional security-price provider. Candidate repricing must state quantity/price limitations and preserve historical approved versions. No integration is selected here.

## Acceptance criteria
- [ ] A reconciled USD statement supports dollar/percentage proposals without quote keys or quote services; optional lookup failure alone adds no blocker.
- [ ] Existing accepted amounts, IDs, dates/provenance, review flags and economic approvals survive retirement and backup/restore; no mock recovery or automatic statement reversion.
- [ ] Mixed-date inputs and dated-value acknowledgements are explicit; no newly invented common date or freshness claim.
- [ ] Missing values/required FX, incomplete imports, unresolved reviews and shortfalls still block where applicable, in UI and server.
- [ ] Partial response retains unreturned rates with original dates/source; failure changes nothing and is visible.
- [ ] Newer reverse-orientation data cannot lose to a stale direct copy.
- [ ] Manual data remains manual and mock/fallback never becomes freshly provider-verified.
- [ ] In-use stale-rate confirmation expires on time or relevant dataset change.
- [ ] Dates match across browser/server time zones; approved historical snapshots remain unchanged.

## Focused validation
- Use the no-quote, mixed-date, legacy-value, mock isolation and backup/restore matrix in [VALUATION_SCOPE.md](VALUATION_SCOPE.md).
- All accepted #26 regressions, injected-clock boundaries and #28 non-UTC rendering cases.
- Integration: candidate apply/cancel, concurrent input revision and changed recommendation conversion.
- Browser/PDF: updated/retained/failed summary and rate-use disclosure.
For implementation, also follow repository-required typecheck, full tests, extraction eval, production build and a relevant browser check. Do not claim these passed from this planning work.

## Dependencies and sequencing
- [R23a](R23-engagement-backup-and-switching.md) review/merge before schema migrations and provider retirement that could affect saved work.
- Coordinate minimum [R02](R02-proposal-scope.md)/[R11](R11-data-quality-exception-queue.md) input semantics; R19a consumes this accepted-basis contract rather than making all of R19 a dependency.
- PR #34
- #26
- #28
R23a means the export/restore slice of recommendation 23; R23b means its multi-engagement isolation slice. A dependency on another plan means its required contract/slice must exist, not that all later extensions must ship first.

## Likely touchpoints
- `src/app/market-data/page.tsx`
- `src/engines/currencyEngine.ts`
- `src/engines/normalizationEngine.ts`
- `src/engines/complianceEngine.ts`
- `src/utils/formatting.ts`
- `src/pdf/templates/ProposalPdfTemplate.tsx`
Paths labelled proposed do not exist yet; confirm exact locations against the implementation branch.

## Migration and rollout
Use the audit → disable optional UI/fetches → prove equivalence/recovery → retire unused code sequence in [VALUATION_SCOPE.md](VALUATION_SCOPE.md). Foundational FX/date fixes stay. Preserve accepted quote-derived values and uncertain legacy evidence; any stored-schema change needs an idempotent migration and matching backup upgrade. Candidate FX review follows as a bounded slice; security repricing is deferred.

## Success evidence
Advisors finish the proposal without provider setup and understand the accepted source/date basis. Later FX changes are understood before applying.
Capture actual evidence in the issue/PR; no usability results are assumed.

## Out of scope / boundary
No mandatory security repricing, broad research/filings/macro platform, automatic provider subscription, silent stale acceptance or actual transaction FX quotation. No runtime code or provider setting changes in this planning save.

All work follows the shared implementation rules in [IMPLEMENTATION_GUIDE.md](IMPLEMENTATION_GUIDE.md). PR #34 stays a separate review checkpoint; no feature is closed by saving this plan.
