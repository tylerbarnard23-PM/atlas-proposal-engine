# Accepted valuation scope: verified inputs before optional security pricing

Approved by Tyler Barnard on **22 October 2026** after reconsidering the competitor evidence and the cost of the existing valuation scope. Tracking: parent [#36](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/36), core scope/retirement [R18 / #51](R18-valuation-and-fx-review.md). This is a roadmap decision, not an implemented change. R01–R25 IDs remain unchanged.

## Product boundary

Atlas turns verified client holdings into a funded, explainable, advisor-reviewed proposal. Its core workflow accepts statement values, imported custodian/accounting-system values, or explicit advisor-approved valuations, with source, currency and date. It does not need a broad security-pricing or research platform to complete that workflow.

A statement is an observation as of its own date. Repricing its old quantities at today's prices produces an indicative estimate, not proof of today's actual account holdings. Keep source dates and mixed-date limitations visible; never silently call an old portfolio current. New custodian integrations are not selected by this decision: an imported file or documented manual input is enough for the initial workflow.

## Keep, defer and retire

| Area | Accepted direction |
|---|---|
| Statement and imported account values | Core. Reconcile them, retain evidence and original dates, and make the accepted valuation basis explicit. |
| Advisor-approved and private-asset values | Core. Preserve the original evidence where available and record an explicit override with its own currency/date/source. |
| FX, normalization and proposal math | Core. Keep missing-rate protection, correct native/reporting amounts, cash offsets, funding, shortfalls, confirmation expiry and shared UI/server checks. |
| Security quotes and automatic repricing | Optional future capability. No security-quote key, symbol match or provider coverage is required for a supported dollar/percentage allocation proposal. |
| Many interchangeable price providers | Remove from the ordinary journey, then retire unused dependencies after an audit. A later optional repricing slice starts with one suitable provider only after coverage, licensing, privacy and operating costs are reviewed. No vendor is selected here. |
| SEC filings, FRED macro series and similar research | Outside the core proposal journey. These are not interchangeable security-price feeds. Park research enrichment unless an observed advisor task justifies it. |
| Mock/generated prices | Synthetic demos and fixtures only, visibly marked. Never recover a missing real-client price by inventing a value or presenting fallback data as verified. |
| Historical risk, look-through and projections | Later, explicitly selected datasets and methods. No silent requirement to recreate a research platform before core allocation work. |

Keep the existing engines. No rebuild, removal of financial safeguards, provider purchase, live-AI enablement or production configuration change is authorized by this planning save.

## Core advisor journey and readiness

1. Import a statement or supported account file; reconcile positions to the source totals.
2. Review the values, source dates and unresolved data. Choose the investable scope while retaining household context and explicit exclusions.
3. Accept a documented valuation basis. Show source-date range/mixed dates rather than assigning every position a fictitious common observation date.
4. Enter dollar or percentage targets, add a genuine destination investment, and review actual funding and current/proposed effects.
5. Review the complete economic package, then approve and present the same revision on screen and in PDF.

An accepted dated value does not become fresh by acknowledgement. R11 defines suitability-of-date warnings/review separately from quote availability. Preserve missing/unusable values, incomplete imports, missing required FX, unresolved currency/link/intent reviews and funding gates. A failed optional quote lookup alone must not block an otherwise supported proposal based on accepted values. Any implementation change to readiness must prove agreement between UI and server; this document does not bypass today's gates. The existing seven-day FX policy and expiring confirmation are unchanged and must not be confused with a security-price requirement.

R04 must support a proposed-only investment with an explicit identity, currency, dollar allocation and funding without fetching its live price. A share-quantity estimate needs an evidenced unit price and instrument convention; without them, leave quantity unavailable while retaining the dollar proposal. Such estimates are indicative, not executable orders.

## Roadmap adjustments and sequence

1. **Preserve the release checkpoint first.** PR #66 is open at `d088dab657c802d18c8e34882f245603f31ab75e`; the final code/relinking changes still need Codex review before any owner-authorized merge. R23a backup/restore must land before stored-schema migrations. R23b, #61, #64 and naming #35 are not started by this change.
2. **R18: narrow the core and audit retirement.** Establish the accepted-value/source/date contract, inventory quote/cache consumers and prevent enrichment from being a mandatory step. After recoverability is proven, disable/remove quote setup from the daily flow before deleting unused adapters/routes/configuration. FX remains a first-class core capability. Candidate FX review/apply remains a bounded follow-up and must not hold up allocation construction after the core contracts exist.
3. **R11: focus exception review.** Separate material input problems from optional enrichment gaps; correct per-100 bond checks. Keep dated-value acknowledgement, unknown completeness and actual errors distinct. Preserve bulk-confirmation limits and original dates.
4. **R19a: bring forward the valuation-basis record.** In P1, after R23a and the minimum R02/R18 input contracts, record accepted values/provenance and the exact FX/input revision used by a draft. This limited slice is not scenario approval or the full immutable package. It must not wait for optional quotes or full R05/R06. Full approved snapshots remain R19's P3/P4 work and require their existing scenario/funding/intent contracts before final outputs or sharing use them.
5. **Prioritize construction.** Progress from R07/R12/R02 contracts through R05/R04/R06 to R03, then contextual R08 and guided R01. Security-provider breadth is not on that dependency chain. Preserve the engine-backed recommendation preview.
6. **Constrain R14–R16.** Deliver known classifications/estimates, transparent portfolio characteristics and evidenced fees/income with unknown coverage. Defer external look-through, historical quantitative analytics and automatic fee/yield enrichment until separately justified. No missing input becomes zero.
7. **R22/R25: prove the focused product.** Keep the agent tied to accepted engine inputs; it cannot choose a fabricated price or silently refresh the valuation basis. Test the complete advisor task without quote keys, and distinguish synthetic model evaluation from a real advisor study.

R18 owns retirement and optional repricing, R19 owns the input-basis record and approved versions, and each related plan owns its own acceptance checks. This cross-cutting contract is not a 26th enhancement. All changes remain Planned until implemented and validated.

## Safe retirement and existing workspaces

- Audit all consumers of the registry, quote cache, quote/fundamentals/refresh endpoints, provider statuses, acceptance controls, quality rules, Copilot tools, PDF and startup documentation. Do not delete the market-data directory wholesale: FX and essential valuation code live alongside enrichment.
- Preserve storage keys, holding/account/recommendation IDs, accepted amounts, currencies, approvals/review evidence and links. Preserve approved quote-derived values even when their originating adapter is retired. Do not automatically revert to a statement value: the original may not have been retained. Keep uncertain provenance labelled as legacy/unknown and require review when needed rather than inventing source history or changing money.
- Finish reviewable UI disablement before removing unused routes, packages, environment examples and provider configuration. Keep established links working or provide a documented redirect/recovery path. No automatic network lookup or mock fallback may replace a saved accepted value.
- Use recoverable, versioned, idempotent migrations only if the persisted contract changes, and supply the matching backup upgrade path. Round-trip existing workspace and backup fixtures with equivalent financial results and gates. Removing a provider alone is not an economic edit and must not clear approvals; a changed accepted basis/value follows the material-change review rules.
- A later optional reprice is a separate candidate: preserve the baseline, show coverage, source/date and effect, explicitly apply or cancel it, and reevaluate affected approvals. It cannot mutate a previously approved version. Document price basis, corporate-action/quantity limitations and unsupported instruments before claiming current portfolio valuation.

## Required evidence for implementation

| Scenario | Expected result |
|---|---|
| USD statement, no security API keys, all quote services unavailable | Import/reconciliation, dollar reallocation, funding, approval and output complete using accepted values. |
| CHF holding with explicit usable FX | Correct reporting amount and recommendation/cash effects, with rate provenance. |
| Same holding with missing required FX | Unvalued/unresolved and final output blocked; no 1:1 or zero fallback. |
| Accepted dated value, failed quote lookup | Source date and review stay visible; optional lookup failure creates no independent final-output blocker. |
| Incomplete import, missing amount, unresolved review or shortfall | Existing applicable gates still fail in UI and direct final-PDF requests. |
| Mock fallback or retired provider | No saved value silently replaced, re-dated or falsely verified. |
| Legacy approved value and backup/restore | IDs, amounts, provenance/review evidence, proposed effects and gate results survive unchanged. |
| Mixed source dates | App and PDF show the actual dates/basis and comparison limitation; no invented common source date. |
| Optional candidate reprice/FX change | Apply/cancel and approval consequences explicit; approved historical inputs/output remain reproducible. |
| R25 advisor task | Observe unassisted completion and comprehension without provider setup; report actual failures/help, not assumed improvement. |

Future implementation still requires the shared typecheck/test/eval/build/browser discipline, and PDF inspection when layout changes. No new application test run, user study or successful simplification is claimed by this documentation change.

## Competitor evidence and product judgment

The [dated competitor review](../research/2026-10-22-advisor-ux-review.md) remains historical evidence. Official pages rechecked for this scope decision show:
- [VRGL](https://www.vrglwealth.com/platform-statement-extraction) extracts statement market values and reconciles against statement summaries.
- [CapIntel](https://www.capintel.com/comparisons) combines statement imports with provider/client data streams and portfolio comparisons.
- [Koyfin](https://www.koyfin.com/features/client-portfolios/) supports imported statement positions/values and custodian/software integrations alongside analytics.
- [Morningstar Direct Advisory Suite](https://www.morningstar.com/business/products/direct-advisory-suite) spans research, planning and proposals, a broader product boundary.

These are vendor capability descriptions, not comparative usability results or proof that competitors never reprice holdings. The accepted product judgment is to deliver a complete, reliable advisor workflow before expanding optional data breadth. The [PII gate](PII_PROTECTION.md) / #59 and [agent evaluation requirements](AGENT_EVALUATION.md) continue to apply.
