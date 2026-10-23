# R18 audit: valuation scope and provider retirement

Audited: 23 October 2026, on `main` at `a63de4a` (after PRs #66 and #67). Tracking issue: #51. Parent roadmap: #36.
**Status: R18 remains Planned.** This is implementation slice 2 of the [R18 plan](R18-valuation-and-fx-review.md): an audit of what exists, under the [approved valuation scope](VALUATION_SCOPE.md). It changes no code, providers, stored data or schema.

## Method

- Every reader and writer of the market-data layer was traced through `src/`: the provider registry, the quote resolver, routes, store actions, valuation resolution, readiness, data-quality rules, data tasks, Copilot tools, the PDF template and the startup docs.
- A focused read-only probe ran against the seed workspace from a scratchpad Vitest config. No repository file was added and the full suite was not rerun. It had 5 cases, all passed:
  1. **No keys, quote services unreachable.** All four quote keys were unset and every `fetch` rejected. Refreshing the 18 eligible holdings (of 25) returned 18 mock quotes. The only host contacted was CoinGecko, the one keyless quote provider. Afterwards the persisted quote cache grew from 3 to 18 entries. Every other store field was deep-equal, and all 17 readiness checks were identical.
  2. **No unit prices.** Quantity, price and identifier were stripped from every holding, and all 6 seed recommendations were approved. Proposed reporting values were identical, 4 holdings changed and trades stayed funded. The readiness checks were identical too.
  3. **Mixed source dates.** Holdings dated 31 January 2025 and 20 October 2026, all reviewed, pass the readiness checks. One unreviewed holding labelled stale and mock fails `unverified_holdings`, `stale_valuations` and `market_data` together.
  4. **Legacy quote-derived value.** The probe used a holding with `valuationSource.kind "market_data"`, `marketDataSource`, `quoteType "eod"`, advisor approval and a `proposalApprovedValue` sourced from a provider.
     - It round-trips through backup export and parse deep-equal, and the approved amount is used.
     - Without the approved value, the `marketDataSource` branch returns the same `nativeMarketValue` as the path without it. Only the source label differs.
  5. **Missing FX still blocks.** A NOK holding with no rate fails `holdings_valued` ("NOK/USD rate missing").

## What a quote refresh changes

The only user-facing caller is **Market Data → Refresh quotes** (`src/app/market-data/page.tsx`). It POSTs the eligible holdings (whole holding objects) to `/api/market-data/refresh`. That route calls `resolveQuote` for each one. `resolveQuote` tries the providers in order, skipping any that lack a key. If none returns a result, it **falls back to the mock provider and caches that result**.

| Changed | Not changed |
|---|---|
| The server's in-memory quote cache (`market-data/cache`) | Any holding field: `nativeMarketValue`, `valuationSource`, `marketDataSource`, `quoteType`, `priceFreshness`, `valuationDate` |
| The persisted client cache `marketDataByIdentifier` (`applyMarketDataResults`, keyed `type:value`) | `proposalApprovedValue`, `advisorVerification` and the review evidence |
| The Market Data page's "Last quote / Provider / As of / Type" columns | Recommendations, approvals, links and proposed results |
| | The 17 readiness checks, the final-PDF gate, Copilot answers and PDF content |
| | Backups: the cache is omitted, and a restore sets it to `{}` |

No code path writes a quote onto a holding: there is no "accept quote" control. Nothing in app code writes `marketDataSource`, or a `"market_data"` or `"mock"` valuation kind. Every app writer sets `priceFreshness: "manual"`:

- statement imports (`toWorkspace`);
- advisor entry in Accounts & Assets, Import Center and data tasks;
- overrides in Accounts & Assets and the value review table;
- synthetic proposed cash.

The persisted cache therefore affects one screen only. The mock fallback does not reach values, but it does put an invented "Last quote" beside real holdings on that screen.

## Evidence table

| Component / provider | Actual consumers | Financial effect | Decision | Migration / test implications |
|---|---|---|---|---|
| Accepted values: statement, imported, advisor-entered, override, `proposalApprovedValue` → `resolveValuation` → `normalizeHoldings` | Totals, allocation, proposal math, readiness (UI, Copilot, PDF route), Copilot tools, PDF | All amounts | **Keep (core)** | None. Probes 2–4 are the equivalence baseline for later slices |
| FX: `fetchFrankfurterRates` via `/api/market-data/fx`, `FxRatesPanel`, `fxPolicy`/`fxAge`/`fxClock` | Valuation, FX freshness and confirmation, readiness `fx_current`/`fx_available`/`holdings_valued` | Conversion of every non-reporting-currency amount | **Keep (core)** | Keep `FrankfurterFxProvider.ts` when the registry is retired. Never delete `src/market-data/` wholesale |
| `EcbFxProvider` (delegates to Frankfurter) | Registry only; never used by the FX route | None | Retire with the registry | None |
| Security quotes: Alpha Vantage, Finnhub, Twelve Data (key required); CoinGecko (keyless, crypto) | `resolveQuote` ← `/api/market-data/refresh` ← "Refresh quotes"; `/api/market-data/quote` has no caller | None: cache and one display only | **Disable in slice 1; retire in slice 3** | No npm packages involved (plain `fetch`). Remove the four `.env.example`/README keys at retirement. No test covers these paths today |
| Fundamentals/filings: SEC EDGAR, Finnhub `fetchFundamentals`, `normalizeFundamentalData` | `/api/market-data/fundamentals`, which has no caller. SEC EDGAR's `fetchQuote` always returns not-ok ("filings source, not a price source") | None | **Retire (slice 3)** | None |
| Macro: FRED | Registry only (custom/ticker identifiers); no consumer | None | **Retire (slice 3)** | Remove `FRED_API_KEY` from the docs |
| `ManualValuationProvider` | Registry only. The `manual_valuation` *kind* is data and stays | None | Retire the adapter; **keep the kind** | Seed has 7 `manual_valuation` holdings |
| Mock provider (`resolveQuote` fallback) and 3 seed mock quotes | Market Data page display | None to values. Displays invented prices beside real holdings | **Stop the real-client path in slice 1.** Synthetic seed only | Acceptance: no mock price is shown for, or applied to, a real workspace |
| Quote cache `marketDataByIdentifier` (persisted store v6) | Market Data page only; omitted from backups | None | **Stop writing in slice 1; keep the field** until a planned store migration | Dropping it needs store v7 plus a backup migration step. Not worth a migration of its own |
| `/api/market-data/providers` (key status) | Market Data provider cards ("Key required" badges); Settings provider list | None, but signals that provider setup is needed | **Remove from the daily path in slice 1**; retire the route in slice 3 | Settings should show the FX source only |
| `marketDataSource` field and its `resolveValuation` branch | Valuation label; Dashboard and PDF `enrichedCount` | None: the amount is always `nativeMarketValue` (probe 4) | **Keep for legacy data**; stop presenting it as "public market data" | Removing it from types or the backup schema would break restore of old backups |
| Valuation kinds `market_data`/`mock`, `quoteType`, `priceFreshness` enums (domain types and backup Zod schema) | Labels; readiness review reasons; data-quality rules; PDF | Indirect (review gating) | **Keep (legacy evidence)** | Never narrow the backup schema. Old backups must restore unchanged (probe 4) |
| Readiness `stale_valuations` ("Out-of-date prices checked") and `market_data` ("Placeholder prices checked") | `holdingsNeedingReview`: unreviewed holdings with `priceFreshness "stale"` / kind `"mock"` | Gate the final PDF, but only together with `unverified_holdings` (a strict subset) | **Keep the safeguard; reword in slice 2** (with R11) | Labels mention "prices". `priceFreshness "stale"` is a stored label, not date-derived, and app writers never set it. Wording changes only, no ID changes |
| Data quality `evaluateHoldingQuality`: `MISSING_IDENTIFIER`, `MOCK_PRICE_USED`, `MARKET_PRICE_STALE`, `QUANTITY_VALUE_MISMATCH` (2%, no bond ÷100), `STALE_VALUATION` (35 days) | `dataQualityScore` on the Dashboard and PDF; `normalizeHoldings` fills `dataQuality` only when empty | None. Not a gate | **Defer to R11 (#46)** | A missing identifier costs 6 points although no quote is needed. The bond tolerance is R11's correction |
| Data task `missing_identifier` ("Without a ticker or CUSIP the price can't be refreshed from market data") and `stale_value` ("refresh the price") | Insights / data-to-complete | None. Not a gate | **Reword or demote in slice 2** | Identifiers stay useful as matching evidence (R09); keep the field |
| Statement-import warnings `detectStatementWarnings` (quantity × price vs value, 5%, bond ÷100; missing identifier) | Statement Workbench review | None. Import evidence | **Keep** (reconciliation, not repricing) | Fires only when quantity, price and value were all extracted |
| Proposal engine (`applyRecommendationsToProposed`) | Before/after, funding, readiness | Dollar/percentage changes on `nativeMarketValue` or the approved value | **Keep** | Uses no quantity or price (probe 2) |
| Copilot `get_portfolio_overview` | Exposes `identifier` and `valuation {source, date, freshness}`; never fetches quotes | None | **Keep**; relabel freshness wording with slice 2 | Demo mode only; live AI is unchanged |
| PDF wording (`ProposalPdfTemplate`) | Client deliverable. "Market Data & Valuation Sources" and "Assumptions" are **required** sections; "Appendix — Market Data Sources" is on by default | None to amounts, but **the client-facing text misstates the source** | **Correct in slice 1** | See below. Keep section keys; persisted `proposal.sections` stores labels, so builder labels need key-based rendering or a later migration |
| Unused modules: `validation/detectStalePrices`, `validateMarketDataFreshness`, `validatePriceConfidence`, `normalize/normalizeCryptoQuote`, `normalizeFxRate` | None outside `src/market-data/` | None | **Retire (slice 3)** | Typecheck proves no importer |
| `.env.example` and README "Live market data" keys | Setup docs | None | Reword in slice 1 ("optional, not used by the proposal journey"); remove in slice 3 | Keep the `ANTHROPIC_API_KEY`/`COPILOT_MODE` guidance unchanged |

### The PDF misstatement (highest priority)

These statements are generated for every real workspace even though every app-written value comes from a statement or the advisor:

- **Market Data & Valuation Sources (required):** "Public market quotes used in this proposal are obtained from third-party providers…". The per-holding quote type falls back to "manual".
- **Assumptions (required):** "Public market values reflect end-of-day or delayed quotes from configured providers…".
- **Key Findings:** "N of M holdings have public market data references". N comes from `marketDataSource`, which is always 0 for app-written data.
- **Key Findings:** "…stale price labels and should be refreshed".
- **Appendix — Market Data Sources (on by default):** lists Alpha Vantage, Finnhub, Twelve Data, SEC EDGAR, FRED and CoinGecko as "configured" providers.

The Dashboard's "External market data" source line has the same problem.

## Unnecessary dependencies vs essential checks

**Nothing in the core journey requires quote coverage, an identifier, provider setup or quantity × price.** Probe 2 shows identical proposals and readiness without them. The unnecessary *signals* are:

- the "Refresh quotes" action and the coverage table;
- the "Key required" provider badges on Market Data and Settings;
- the identifier penalty in the data-quality score, and the identifier data task's repricing rationale;
- "price" wording on two readiness checks and the stale task;
- the PDF/Dashboard provider claims;
- the four quote keys presented as "live market data" in setup docs.

**Essential checks (unchanged by every slice):**

| Check | Why |
|---|---|
| `holdings_valued` | Missing FX |
| `imports_complete` | Import completeness |
| `unverified_holdings` | Value review |
| `fx_current` | FX age and confirmation |
| `fx_available` | Rates needed for proposed trades |
| `trades_funded` | Funding and shortfalls |
| `recommendation_currency` | Recommendation currencies confirmed |
| `recommendation_links` | Recommendations linked to current holdings and accounts |

The other readiness checks and the statement-import reconciliation warnings stay too.

## Legacy values and backups

- **Survival:** the persisted store and backup schema accept `market_data`/`mock` kinds, `marketDataSource`, `quoteType`, `priceFreshness` and a provider-sourced `proposalApprovedValue`. Probe 4 round-trips them deep-equal, with the same amount, source date, provider name, approval and lock.
- **What retiring adapters touches:** none of these fields, so no stored value, ID, approval or evidence is lost.
- **Rules for every later slice:**
  1. Never narrow the domain enums or the backup Zod schema.
  2. Never revert an accepted value to a statement value.
  3. Keep showing the recorded provider name and date as **historical evidence**, not as a configured feed.
  4. Treat provider removal as a non-economic change: no approval is cleared.

## Recommended slices

**Slice 1 (smallest; UI and wording only, no schema, store or engine change): "Stop presenting security quotes."**
1. On Market Data, remove "Refresh quotes", the quote-coverage table and the security-provider cards, keeping the FX panel. In Settings, show only the FX source. The routes and adapters stay in place but nothing calls them.
2. Correct the PDF and Dashboard text to describe the accepted value basis per holding. That covers source kind (statement / advisor-entered / override / approved), the recorded provider as historical evidence, and each holding's own as-of date. Limit the default appendix to the FX source actually used. Section keys stay unchanged.
3. Reword `.env.example`/README: quote keys are optional and unused by the proposal journey.
4. Add tests for acceptance cases A1–A6 below. This is a UX change, so a proposal with numbered decisions comes first.

**Slice 2 (with R11 #46): review semantics.**
- Reword `stale_valuations`/`market_data` to value review (same codes, same gating).
- Take the identifier penalty out of the score.
- Reword the identifier and stale tasks without repricing language.
- Decide date-based staleness, which belongs to R11, not to quote freshness.

**Slice 3: retire unused code.**
- **Remove:** `/api/market-data/quote`, `/refresh`, `/fundamentals` and `/providers`; the registry; `marketDataEngine.resolveQuote` and the server cache; the eight non-FX adapters, plus `EcbFxProvider`; the unused validation/normalize modules; and the four quote keys from the docs.
- **Keep:** `FrankfurterFxProvider`, the FX route, the domain enums, the backup schema and the store field.
- **Prove:** typecheck, the full suite, and a v6 workspace/backup fixture round-trip with equivalent results and gates.

**Slice 4 (only bundled with another planned store migration):** drop `marketDataByIdentifier` in a new store version with a matching backup migration step. Then later R18 slices 5–6, as planned: candidate FX review, then at most one optional price provider after the coverage, licensing, cost and privacy review.

### Acceptance cases (slice 1 tests; slice 3 re-runs them)

- **A1. No quote keys, unavailable quote services.** With every quote key unset and every non-FX host failing, the journey passes with unchanged results: import → accept → recommend → readiness → draft and final PDF. No request goes to a quote host. An FX refresh failure still keeps the stored rates.
- **A2. Dollar allocations without unit prices.** Holdings with no quantity, price or identifier give the same proposed values, funding and readiness. The PDF does not show quantity/price columns as missing errors.
- **A3. Mixed source dates.** Reviewed holdings with different valuation dates don't block. The PDF shows each holding's own as-of date and never implies one portfolio-wide pricing date.
- **A4. Preserved legacy accepted values.** A v6 workspace and backup with the probe-4 holding restores deep-equal, values at the approved amount and keeps its approval and dates. The PDF labels it with its recorded source as evidence, not a configured feed.
- **A5. Missing FX and incomplete imports still block.** `holdings_valued`, `imports_complete`, `fx_current` and `fx_available` fail exactly as today, and the final PDF route still returns 422.
- **A6. Mock prices never replace accepted values.** No path writes a quote onto a holding. No mock or fallback price is displayed beside a real workspace. A legacy `mock`-kind holding still fails review until the advisor reviews it.

## Unresolved decisions (owner)

1. **Market Data page:** rename it to "Exchange rates" (and decide the sidebar label), keeping `/market-data` working, or keep the name.
2. **PDF sections:** retitle `market_data_sources` and the appendix in place (same keys; builder labels resolved by key), or drop the appendix from the defaults. Also confirm the replacement wording for the Assumptions line.
3. **Legacy mock-kind values in a real workspace:** keep "review required" (today), or block the final PDF until each value is replaced or overridden.
4. **Retired routes:** whether they return 404, or 410 with a message, and whether a providers route survives for FX status only.
5. **Identifiers:** confirm with R11/R09 that they stay optional matching evidence with no score penalty.
6. **Quote cache field:** leave it ignored in store v6 indefinitely, or drop it with the next planned migration.
7. **Crypto:** confirm that crypto holdings are valued from statements or by the advisor, with no crypto price feed (CoinGecko is the only keyless quote host contacted today).

Not decided or started here: provider removal, valuation behavior changes, schema migrations, live AI, R23b, #61, #64 and #35.
