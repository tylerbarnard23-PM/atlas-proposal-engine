# Handoff

## PII planning addition — 22 October 2026

The owner asked how to secure client data. Issue #59 and [PII_PROTECTION.md](roadmap/PII_PROTECTION.md) now define a prerequisite across the roadmap. Keep all 25 original IDs intact. Start with data inventory, minimal/pseudonymous payloads and retention boundaries; require working identity/authorization, encrypted persistence/key management, safe logs/exports and verified egress/isolation tests before real client use. Public demo remains synthetic-only. These controls are planned, not implemented, and no production configuration changed.

## Checkpoint update — 22 October 2026: PR #34 merged and live

- **PR #34 (#33) merged** at reviewed head `c632b13` as merge commit `4e6da18` (`4e6da186a62e92b76d886e6e32e67af23410a688`). Before merging: the head was verified unchanged, the PR was mergeable/clean, and both checks (typecheck/test/build, Vercel preview) passed on that exact commit. `main` has no branch protection, so those checks are the only gate.
- **Production:** deployment `dpl_Ef4fRq6dTx6WXe9hCQYovk4rmKpT` for `4e6da18` is READY and aliased to https://atlas-proposal-engine.vercel.app.
- **Live smoke test** (synthetic workspace; the browser's own saved workspace was restored afterwards):
  - The dashboard loaded (sample: net worth $17.75M, readiness 12/15).
  - The recommendation editor showed current $100,000.00, proposed $80,000.00, change −$20,000.00, −20.00%.
  - For [A target 80,000, B sell 10%], both cards and the editor showed the combined result $72,000.00. The proposal page's Before/After showed Equity $72.0K and Cash $38.0K, matching.
  - The live draft-PDF route returned 200 `application/pdf` (233 KB, `%PDF-1.4`, SAMPLE_ filename). The PDF's pages weren't opened or inspected.
- **PR #32** was closed as superseded: its only commit (74aa628) is in main as 46c1230 with identical content.
- **Next:** #26, then #28, as below. PR #58 (this roadmap) is still open for review.

## Current roadmap checkpoint — 22 October 2026

Tyler accepted **all 25** recommendations for the advisor workflow roadmap. Detailed plans and tracking are in [ROADMAP.md](../ROADMAP.md), [IMPLEMENTATION_GUIDE.md](roadmap/IMPLEMENTATION_GUIDE.md) and epic [#36](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/36). All feature statuses remain **Planned** until implementation evidence is recorded.

- This save is documentation/issue planning only, on `docs/advisor-roadmap-2026-10-22`, based on main `1d6f0c0a67dac79c2a6a3bbe498fba79793a452c`.
- PR #31 is merged. PR #34 was reviewed and fixed (`c632b13`) and is merged as `4e6da18`; its precise preview is on main and is reused, not recreated, by R08.
- Next: existing #26, then #28 separately. Preserve #26's accepted policy and refinements. R23a backup/restore precedes the larger migrations.
- Naming #35 remains separate before LinkedIn publication and must preserve saved data and working links. No name change is made by this save.
- Four existing issues are expanded; 21 follow-up issues plus the parent roadmap issue track the selected work. #18 coordinates separate policy/tax/version tasks.
- The accepted roadmap supersedes the older instruction below to park #11–#19 until selected. The owner has now selected the complete roadmap.
- Routine choices within these accepted plans do not require asking again whether the scope was selected. Existing merge/deployment approval requirements remain.
- Do not replace this roadmap checkpoint with the older #31/#32 handoff when integrating PR #34; preserve both the #34 validation/limitations and the accepted roadmap.
- The roadmap save itself changed no application behavior and claimed no smoke test. The PR #34 merge, deployment and live smoke test are recorded in the update above.

The text below is retained historical context from the existing handoff. Its older branch/production/next-step statements are superseded by this checkpoint; consult current GitHub refs before work.

The state of the project for the next working session: what's done, how it was checked, what's known to be missing, and what comes next. Update it at the end of each piece of work.

_Section last updated: 2026-10-22, when PR #34 was merged (`4e6da18`). Order: #26, then #28._

> The roadmap checkpoint and PII prerequisite (#59) at the top of this file and the #33 section below are both current; neither replaces the other.

## Working agreements
- Every bug, idea or parked item gets a GitHub issue; a PR closes its issue.
- Design or UX changes: propose first, with numbered decisions, and build after they're answered.
- Write failing tests first. Run typecheck, full tests, the extraction eval, the production build and focused browser checks before asking for review.
- Merge and deploy only on the owner's explicit approval. After a push, report the Vercel preview URL; after a merge, confirm the production deploy at https://atlas-proposal-engine.vercel.app.
- Never put the Anthropic API key on the public Vercel site. The live Copilot is local only.
- Don't commit third-party PDFs. The UBS holdings-report sample goes in `tests/fixtures/private/`, which is git-ignored; its tests skip when it's absent.

## Production
Current production is `4e6da18` (PR #34); see the checkpoint update at the top. Earlier release: `9d44d9f` (merge of PR #31, pinned to head `3a1482f`, CI green on that commit), deployment `dpl_4V9aw12vvUreEQq3xYLKdFJaUzEz`. Smoke-tested on the live site, 2026-10-21:
- **Existing USD workspace** (a real v4 save in the browser): migrated to v5 with 25 holdings, 6 recommendations and no flags. The proposal's currency and country fields were dropped and effects were unchanged.
- **EUR reporting with USD-labelled amounts** (the same save set to EUR, plus a mixed recommendation): both money recommendations migrated to EUR with the "USD" label kept as an open review. Maritime's target is still calculated as EUR 181,760, as before the update.
- **Percentage-only edit** (10% → 20%) on the approved, included mixed recommendation: the approval cleared and the review stayed open. Re-approving left it open.
- **Final-PDF gate.** With every holding confirmed, the route returned 422 with exactly "Recommendation currencies confirmed". After "Keep EUR amounts" it returned 200, rendering a final PDF. The test workspace was then restored to the migrated sample.

The previous release, `60f43bf` (merge of #30), was smoke-tested the same day. On the live site: linked recommendation effects, and the import gate. On a local build of that commit: the UBS import (68 positions, $10,648,193.74, matched), LifeView (21 lines, matched), and the incomplete-import gate.

## Completed recently
| Issue / PR | What |
|---|---|
| #21 / #25 | Currency contract for the proposed portfolio: explicit FX, no 1:1 fallback, unresolved conversions reported. |
| #23 / #27 | Unvalued holdings stay unvalued through the proposal; totals say what they exclude; the final PDF is blocked. |
| #29 / #30 | PDF statements: values read correctly; account totals reconciled with their currency; positioned holdings reports (UBS sample) read by column geometry; import completeness persisted and enforced. |
| #24 / #31 (merged `9d44d9f`) | Recommendation amounts keep their own currency (see below). |
| #33 / #34 (merged `4e6da18`) | Live recommendation preview from the complete engine (see below). |

## #33: live recommendation preview (merged in PR #34)
- **Engine simulation.** `previewRecommendation` (`src/engines/recommendationPreview.ts`) runs the complete proposal engine in isolation on the current holdings and compares before and after. It covers actual cash offsets, household funding of debt paydowns, new cash lines, missing rates, unvalued holdings and shortfalls. Nothing is inferred by negating the position change: a cash position's own change moves no other cash.
- **Standalone and combined.** The standalone result is this recommendation alone. The combined result is the full proposal engine's own output with every other approved recommendation, separately labelled "in proposal order".
  - **Order.** The edited recommendation replaces its saved version *in place* by id (never applied twice, saved order kept); a new draft is appended, where saving would put it. Order matters: [A target 80,000, B sell 10%] on 100,000 ends at 72,000, and both cards, the editor and the proposal now agree.
  - **Relevance by effect.** The combined result appears when other approved recommendations change this position, its account's cash, or the cash this recommendation itself draws on (a paydown's household sources), alone or together with this one. This catches household funding of a mortgage paydown across accounts, in both directions. "This recommendation changes it by" is its marginal effect in proposal order.
  - **Shortfalls.** Combined shortfalls are shown and get a "With the other approved recommendations, …" warning that blocks the final PDF. Shortfall wording covers purchases and debt paydowns.
  - The preview never saves, approves or mutates anything.
- **Editor.** A prominent live preview shows the position, account, value date and reporting currency, with current value, proposed value, signed change and percentage change at full precision ("N/A" when the current value is zero). It also shows the cash lines that move, shortfalls, the entered amount with its conversion and rate, and warnings: missing rate, unvalued, incomplete import and currency review, each marked if it blocks the final PDF. A target value disables the action amount and marks it ignored.
- **Cards** show the same simulation (standalone, plus combined where relevant) at full precision.
- **Copilot.** `simulate_recommendation` uses the same simulation and returns `cash_movements` and `shortfalls` (it used to return an inferred `cash_effect_in_account`).
- **Engine fix.** Cash offsets under $1 were dropped as noise, so a 50-cent sale moved the position but not the cash. Now only floating-point noise under half a cent is ignored.
- **Validation:**

  | Check | Result |
  |---|---|
  | typecheck | pass |
  | tests | 280 of 280 passed locally (16 files) with the private UBS PDF present; without it, as in CI, 278 passed and 2 were skipped |
  | eval | unchanged |
  | build | pass |
  | sample baseline | unchanged |

- **Browser** (local production build), using the UBS screenshot case at USD 3:
  - "reduce" on the cash account gave $179,478.88 → $179,475.88, −$3.00 (−0.0017%), "No other cash moves".
  - A security sale credited the same account's cash.
  - A purchase above the account's cash showed the shortfall and that it blocks the final PDF, plus the combined result with another approved recommendation.
  - A paydown drew from the household account with the most cash.
  - A target disabled the action amount and marked it ignored.
  - A EUR conversion was applied once (EUR 20,240.55 ≈ USD 21,961.00).
  - Holdings and recommendations were unchanged while previewing; closing without saving saved nothing.
  - Editing an approved 10,000 sale to 20,000 previewed $101,961.00 (no double counting). After save and reload the card matched the preview, the approval was cleared, and the live holding was unchanged.
  - Migration-review and incomplete-import warnings showed in the preview and on the card.

- **Review fixes (2026-10-22, at `b95f6ce`).** Two defects were found: the combined result appended the previewed recommendation last instead of keeping saved order, and it missed household funding across accounts. Also, the shortfall wording called every shortfall an unfunded purchase.
  - **Tests first.** 8 regression tests were added; 7 failed against `b95f6ce` (6 new plus the updated combined label), while the no-false-combined and rendered screenshot-case guards passed. Every combined test compares with `applyRecommendationsToProposed`'s full output. The editor panel (`RecPreview`) is now rendered in tests.
  - **Browser** (local production build, synthetic workspaces, browser's own workspace restored afterwards):
    - Order case: both cards showed $72,000.00. Editing A's target to 85,000 previewed $76,500.00. After save and reload A stayed first, its approval was cleared, then it was re-approved. The proposal page showed Equity $76.5K and Cash $33.5K, matching.
    - Funding case (brokerage cash 600,000, bank 50,000, approved 550,000 mortgage paydown, purchase 150,000): the purchase card and editor showed the combined result with brokerage and bank → $0.00 and a $50,000.00 Mortgage shortfall. Edited to 100,000, saved and reloaded: no shortfall, and the paydown's own card also showed the combined funding. The proposal page showed Cash $0.0 and Equity $200.0K, matching.

## #24: recommendation currency (merged in PR #31)
- **Amount currency.** `Recommendation.currency` is the denomination of `proposedValue` (always monetary) and of `actionAmount` when its unit is `amount`. A `percent` amount stays a percentage.
- **One conversion.** `amountsInReporting` (in `src/engines/recommendationAmounts.ts`) converts once, at the workspace's current rates, and reports the rate, source, as-of date and path (direct, inverse, or cross via USD). `applyRecToValue` accepts only its output, a distinct type, so the engine, cards, form, Copilot and PDF can't skip the conversion or do it twice.
- **Missing rate.** The recommendation is left unapplied and reported as unresolved (the `fx_available` check, and the PDF's "not applied" block).
- **Changing a recommendation's currency** needs an explicit choice: convert the amounts at the shown rate, or enter replacement amounts. The label never changes alone.
- **Approval.** A material edit (any amount, including a percentage, its unit, `proposedValue`, currency, linked holding, type) clears an approval on every save path (`withApprovalRule` in the store).
- **Defaults.** New recommendations (manual, from insights, from the Copilot) start in the reporting currency.
- **Changing the output currency** in Client Profile confirms first, listing the recommendations whose amounts stay in their own currency.
- **Output currency and country** come only from the client. `Proposal.outputCurrency` and `outputCountry` are removed.
- **Migration v4 → v5.** Each recommendation takes the currency its amounts were being calculated in (the client's output currency), so every effect is unchanged. A differing old label is kept as `currencyReview` evidence, not proof of intent.
  - An open review on an approved recommendation included in the PDF fails the shared readiness check "Recommendation currencies confirmed", which the UI and the PDF route both enforce. Confirming holdings doesn't clear it.
  - The advisor resolves a flag on the recommendation's card, in one of three ways:
    1. keep the amounts as calculated (no economic change; approval stands);
    2. treat them as the old label's currency (an explicit change, shown with the rate first; approval cleared);
    3. edit the amounts.
  - **Resolution is separate from material-edit detection** (`confirmsMoneyCurrency`, fixed in review). An edit resolves an open review only when:
    - the currency itself changes (convert or replace);
    - every money amount still present is stated again; or
    - no money amount is left.

    A percentage-only edit is material (it clears approval) but leaves the review open, because a monetary target in the flagged currency is unchanged. Re-approving doesn't clear the review either.

**Validation:**

| Check | Result |
|---|---|
| typecheck | pass |
| tests | 254 of 254 passed locally (15 files) with the private UBS PDF present; without it, as in CI, 252 passed and 2 were skipped |
| eval | unchanged: recall 100%, 0 spurious |
| build | pass |
| sample baseline | unchanged (values, readiness, PDF text) |

**Browser** (local production build):
- A real v4 workspace migrated with no flags.
- A crafted EUR workspace with "USD" labels migrated with flags, and its effects were unchanged.
- The gate held with every holding confirmed, in the UI and the route (422).
- "Keep" and "Treat as USD" both resolved a flag.
- The form's convert flow preserved value (EUR 10,000 → USD 10,850 ≈ EUR 10,000).
- A material edit cleared the approval.
- **Review fix, mixed case.** The flagged recommendation had "USD" label, EUR reporting, 10% action and a 1,000 target.
  - Changing only 10% → 20% cleared the approval; the review stayed open and its panel stayed shown.
  - Re-approving it (included in the PDF) left the review open. Readiness and the route (422) still blocked, with every holding confirmed.
  - "Keep EUR amounts" then resolved it, keeping the amounts and approval.
- The Client Profile confirmation can be cancelled.
- Proposal Builder shows the client's currency and country.

## Known limitations
- **Prose isn't converted.** Rationale and other text may quote amounts in another currency. The card says so when a recommendation's currency differs from the reporting currency.
- **`Recommendation.currentValue`** is an unused snapshot (only the sample sets it). It isn't converted, migrated or shown.
- **Rates aren't frozen.** Converted amounts move with the workspace rates, as stated wherever they're shown. Rate staleness and refresh policy are #26.
- **Rounding.** Converting a recommendation's currency rounds amounts to the cent.
- **Re-approval.** A material edit clears the approval even when "Advisor approved" is still ticked in the form. Approve it again on the card.
- **Incomplete imports have no acknowledge path** (from #30). Resolve by re-importing a complete copy or removing that import's holdings.
- **PDF support is verified** on the issue #29 statement layouts, the UBS holdings-report layout and LifeView plans only.
- **Live-site import checks need a manual upload.** The automated browser couldn't put local files into the live page.
- **Preview (#33).**
  - The simulation reflects the engine's existing model. Unbundled cash slices from a holdings report count as account cash, and a paydown or purchase debit lands on the account's first cash line.
  - Relevance is judged at this position, its account's cash and the cash lines this recommendation moves. An approved recommendation that only changes some other account (with no effect on any of those) doesn't produce a combined result, by design.
  - "Changes it by" is the marginal effect in proposal order, not a standalone attribution; with order-dependent actions it differs from the standalone change (A: −20,000 alone, −18,000 marginal in the example).
  - Each card runs a few engine simulations (standalone, with and without others, and one per other approved recommendation to name them). Fine at sample sizes; not measured for very large workspaces.

## Next step
1. ~~#33 / PR #34~~: merged as `4e6da18` and live (see the checkpoint update at the top). PR #32 closed as superseded.
2. **#26 (FX refresh, retained rates, stale-rate policy):** planning only. The direction is accepted and recorded on #26 (comment 6325161797). Refinements:
   - **Seven calendar days** is an initial product policy, not an institutional standard. Use a named constant, and don't present it as a rule.
   - **A stale-rate confirmation expires** after a defined period (proposed: seven days from the confirmation) as well as when the rates in use change.
   - **Currencies in use** include approved valuation currencies (`proposalApprovedValue.currency`).
   - **Provenance.** Manual rates keep their provenance; mock or fallback data must never appear freshly provider-verified.

   Findings:
   - **Refresh replaces everything.** The Market Data refresh replaces the whole rate set, so a partial response drops pairs.
   - **Opposite orientations can coexist.** The provider returns USD→X pairs while the sample stores X→USD. The resolver prefers a direct pair, so a stale stored pair could beat a fresh inverse one.
   - **Fixed currency list.** The refresh asks for a fixed list and ignores currencies brought in by imports.
   - **Silent failure.** A failed refresh says nothing.
   - **Staleness isn't used.** `isStale` exists but nothing sets or uses it. The sample's rates are dated 2026-04-30.
   - **PDF.** The PDF names the rate source but not the rates or their dates.
3. Then #28 (dates shown a day early west of UTC). Keep it separate from #26.
4. Backlog enhancements (#11–#19) stay parked until chosen.
