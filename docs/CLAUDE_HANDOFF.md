# Handoff

The state of the project for the next working session: what's done, how it was checked, what's known to be missing, and what comes next. Update it at the end of each piece of work.

_Last updated: 2026-10-21, on branch `fix/recommendation-currency` (issue #24, PR #31, not merged; review fix for percentage edits included)._

## Working agreements
- Every bug, idea or parked item gets a GitHub issue; a PR closes its issue.
- Design or UX changes: propose first, with numbered decisions, and build after they're answered.
- Write failing tests first. Run typecheck, full tests, the extraction eval, the production build and focused browser checks before asking for review.
- Merge and deploy only on the owner's explicit approval. After a push, report the Vercel preview URL; after a merge, confirm the production deploy at https://atlas-proposal-engine.vercel.app.
- Never put the Anthropic API key on the public Vercel site. The live Copilot is local only.
- Don't commit third-party PDFs. The UBS holdings-report sample goes in `tests/fixtures/private/`, which is git-ignored; its tests skip when it's absent.

## Production
`main` at `60f43bf` (merge of #30) is live, deployment `dpl_3xARP7M9…`. It was smoke-tested on 2026-10-21. On the live site: linked recommendation effects, and the final-PDF route refusing an incomplete import. On a local production build of the same commit: the UBS import (68 positions, $10,648,193.74, matched), LifeView (21 lines, matched), and the incomplete-import gate.

## Completed recently
| Issue / PR | What |
|---|---|
| #21 / #25 | Currency contract for the proposed portfolio: explicit FX, no 1:1 fallback, unresolved conversions reported. |
| #23 / #27 | Unvalued holdings stay unvalued through the proposal; totals say what they exclude; the final PDF is blocked. |
| #29 / #30 | PDF statements: values read correctly; account totals reconciled with their currency; positioned holdings reports (UBS sample) read by column geometry; import completeness persisted and enforced. |
| #24 / #31 (open) | Recommendation amounts keep their own currency (see below). |

## #24: recommendation currency (this branch)
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
| tests | 254 passed in 15 files (252 + 2 skipped in CI without the private PDF) |
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

## Next step
1. Review PR #31 (#24); merge only on approval, then confirm the production deploy.
2. Then #26 (FX refresh: merge and stale-rate policy), now more visible because recommendation conversions use current rates.
3. Then #28 (dates shown a day early west of UTC).
4. Backlog enhancements (#11–#19) stay parked until chosen.
