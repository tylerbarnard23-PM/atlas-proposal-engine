# Handoff

## #28 calendar dates — 22 October 2026 (PR #63, in review, not merged)

Branch `fix/calendar-date-display` from main `04d4396` (the merge of release-checkpoint PR #62, pinned to `c1825d0`; CI passed on main). This is a presentation-only fix: no stored value changes and no migration. #61 and other roadmap work are not part of it.

- **Two kinds of date, chosen by what a field means,** never by the shape of its string (`src/utils/formatting.ts`):
  - **Calendar dates** (`Holding.valuationDate`, `ValuationSource.asOf`, `FxRate.asOf`, statement dates): `formatCalendarDate` shows the stored day in every time zone. A legacy value such as `2026-04-30T00:00:00Z` is read as its UTC date, which is how every writer encodes the day.
  - **Timestamps** (`dismissedAt`, `rejectedAt`, `resolvedAt`, uploads, job times, quote times): `formatTimestampDate` and `formatDateTime`, in the viewer's zone or a given `timeZone`.
  - **Removed:** `formatDate`, which handled both kinds.
- **PDF.** Valuation as-of dates are calendar dates. The prepared date (from the document's `now`) and "Approved by advisor on" use the advisor's `timeZone`, which the PDF Preview page sends to the route. The route validates it and otherwise uses the server's zone. So a UTC server's PDF matches the in-app preview.
- **Date inputs.** Defaults and the Data-to-complete maximum now use the viewer's day (`localCalendarDay`), not the UTC day.
- **Unchanged:** FX ages and `utcDate`, confirmation fingerprints and exact expiry, financial values, and saved data.
- **Tests:** 15 in `tests/calendarDates.test.ts`, written first (13 of 14 failed before the fix). They cover:
  - UTC, New York, Los Angeles, Tokyo and Auckland;
  - US and EU daylight-saving dates, and the year boundary;
  - timestamps in the viewer's or a stated zone;
  - date inputs, and FX ages unchanged;
  - preview and PDF agreement;
  - the whole sample proposal reading identically in New York, Tokyo and UTC (`main`'s code differed in 25 dates in New York);
  - the route's time-zone handling and fallback.
  - The UTC sample baseline is unchanged.
- **Validation:**
  - typecheck;
  - 337 of 337 tests locally (19 files); in CI without the private UBS PDF, 2 are skipped;
  - eval unchanged;
  - build.
- **Browser (America/New_York):**
  - **Local `next start`:** Accounts & Assets shows "Valuation date Apr 30, 2026" and "Statement · Apr 30, 2026". The Assumptions FX table shows rates stored as UTC midnight as Apr 30. The in-app PDF template and a server draft PDF, inspected visually, show "Jun 30, 2026" and "Mar 6, 2014" with no day-early dates.
  - **Vercel preview of `a3e4e14`:** this runs a UTC server, which covers the cross-zone case. The UTC-rendered draft PDF's Data Sources & Quality table (inspected visually: Apr 30 and Apr 15, 2026) matched the New York browser's preview row for row, and both read "Prepared October 22, 2026".
  - Saved workspaces were read only and unchanged.
- **Limitation.** A few writers store "now" as a UTC day or instant in calendar fields: an advisor override's `asOf`, the value-review confirmation, the proposal's synthetic cash line, and a new account's `asOf`. They show the UTC day of that moment, the same everywhere. Stored values aren't rewritten.

## Release checkpoint — 22 October 2026: PR #60 (#26) merged and live

- **Merge.** PR #60 was merged pinned to its reviewed head `8002f0fff4983102e683d42330a16d88985b40a7` as merge commit `e54d56e3d381a65715bedcf686bf7d59935591bf` (parents `618e670` and `8002f0f`).
  - Before merging, the head was verified unchanged, the PR was mergeable and clean, and both checks passed on that exact commit: "Typecheck, test, build" (run 39819188922) and the Vercel preview. `main` has no branch protection, so those checks are the only gate.
  - Issue #26 closed as completed at 2026-10-22 17:49 UTC.
- **CI on `main`** for `e54d56e` (run 39825985206) passed: typecheck; 18 test files, **320 tests passed and 2 skipped** (322; the 2 need the private UBS PDF, which CI doesn't have); extraction eval 2 of 2 (recall 100%, label 100%, currency 87.5%, 0 wrong, 0 spurious); build.
- **Production.** Deployment `dpl_4ZURnzB83QauhERhtkhihvQZNtRF`, built from `main` at `e54d56e`, is READY and aliased to https://atlas-proposal-engine.vercel.app.
- **Live smoke test** in the in-app browser on production, with a synthetic workspace. This origin's existing saved workspace (store v6, 25 holdings, 6 recommendations, 10 rates) was backed up and restored byte-identical afterwards. Synthetic workspace: USD reporting; a USD holding with an approved recommendation; CHF 1,000 on a stale ECB CHF/USD rate (2026-04-30); VND on a Manual VND/USD rate; a stored ARS/USD pair.
  - **Dashboard and Market Data loaded:** net worth $12.19K (10,000 + 1,000 × 1.2 + 25,000,000 × 0.0000395), readiness 15/16, the stale-rate notice, and the rates table with CHF/USD stale and in use, VND/USD Manual and current, ARS/USD not in use.
  - **Direct final-PDF request** (otherwise-ready data, stale and unconfirmed): 422 with exactly "Exchange rates current".
  - **Confirming after time on the page.** With the page clock 3 min 5 s ahead (beyond the 2-minute tolerance) and no event, Confirm was valid at once: the panel read "Confirmed…", readiness was 16/16 and the final PDF wasn't locked.
  - **Withdraw:** 15/16, with "CHF/USD 175 days old (2026-04-30, ECB)… confirm them", final locked.
  - **Expired** (VND holding removed first, so only CHF/USD was in use): at expiry − 3 s, 16/16; 4.5 s later, with no edit, 15/16 with "confirmation expired 2026-10-29 17:52 UTC", final locked.
    - With the VND holding still in use, a 7-day jump correctly read "no longer applies", because the Manual VND/USD rate had turned 8 days old.
  - **Draft PDF** (confirmation given at real time): 200 `application/pdf`, 253,205 bytes, `%PDF-1.4`, generated in memory (no file saved). The Assumptions page reads "Exchange rates used: ECB reference rates and advisor-entered (manual) rates, each listed with its date below." It lists CHF/USD 1.2000 (2026-04-30, ECB, 175 days, stale) and VND/USD 0.00003950 (2026-10-21, Manual, 1 day, current) but not the unused ARS/USD, plus the policy wording and the confirmation with its expiry.
  - **FX refresh through the real production route** (the provider request was made by Vercel's server with normal TLS):
    - "updated 9 pairs (AUD/USD, CAD/USD, CHF/USD, EUR/USD, GBP/USD, HKD/USD, JPY/USD, MXN/USD, SGD/USD). Not returned, kept with their own dates: ARS/USD. Manual rates kept: USD/VND."
    - ARS/USD kept its own 2026-04-30 date and the "not in last refresh" label, and Manual VND/USD was unchanged.
    - CHF/USD became 0.8220 dated 2026-10-22 and current; the notice cleared and readiness was 16/16.
  - **Not performed:**
    - a final PDF was not generated on production (not requested; the 422 gate was checked);
    - the PDF was inspected on the Assumptions page only.
  - **Observation:** the refresh summary names a manual pair by its sorted key ("USD/VND") while the table shows the stored orientation ("VND/USD"); logged as [#61](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/61). Cosmetic; no value is affected.
- **R18 (#51)** stays Planned: #26 was its P0 slice. The reviewable candidate refresh remains.
- **Next:** #28 (dates shown a day early west of UTC), separately. Now in review as PR #63 (see the top). This checkpoint was recorded by PR #62, merged as `04d4396`.

## #26 FX refresh and stale-rate policy — 22 October 2026 (PR #60, merged `e54d56e`, live)

Branch `fix/fx-refresh-staleness` from main `618e670`. Implements #26's accepted policy (comment 6325161797) and the owner's refinements. R18's later candidate-refresh workflow and #28 are not part of it.

- **Refresh merges by pair** (`src/engines/fxPolicy.ts` `mergeFxRefresh`):
  - EUR/USD and USD/EUR are one pair, so a returned rate replaces both orientations.
  - Pairs the provider didn't return keep their own date and source, labelled "not in last refresh".
  - Manual rates are never replaced.
  - A failed refresh changes nothing and is reported, with the cause.
  - The route (`/api/market-data/fx`) returns explicit success or failure (502). It requests the workspace's currencies (holding, approved-valuation, account, recommendation, reporting), the defaults and every stored pair.
- **Resolution** (`resolveFxRate`): the newest quote wins in either orientation, and the stored legs used are recorded, including both legs of a cross rate via USD. "In use" means legs that value a holding, convert an approved recommendation, or write proposal cash/native moves (`fxRatesInUse`). Stored but unused rates don't count.
- **Freshness**: UTC calendar-day age with an injected clock (`fxAge.ts`). `STALE_FX_DAYS = 7` is an initial product policy, not an institutional or regulatory standard: current through day 7, stale from day 8. Mock data is never current.
- **Readiness**: the shared check "Exchange rates current" is enforced in the UI, Copilot readiness and the final-PDF route; the route uses the server clock and recomputes the fingerprint.
- **Confirmation**: records the covered pairs (the stale or unverified ones), oldest rate date, time, the reporting currency and a fingerprint of **every leg in use** (current legs too, since a cross rate depends on both), their uses and which legs needed confirming. It lapses as soon as any of those change, including a current leg turning stale; unused rates don't affect it. It expires exactly 7 days (168 h) after `confirmedAt`. A record with unreadable times, a `confirmedAt` more than 2 minutes (`CLOCK_SKEW_MS`) ahead of the evaluating clock, or an `expiresAt` other than `confirmedAt` + 7 days is **invalid**. It doesn't bypass missing rates, incomplete imports or any other gate.
- **Time in the browser**: one shared clock (`src/engines/fxClock.ts`, `src/hooks/useFxNow.ts`) ticks at the next UTC midnight or confirmation deadline, and when the user returns to the page (focus / visibility); it keeps no timer without subscribers. Readiness, notices, data tasks, conversions, the Market Data panel and the PDF preview all evaluate at it.
- **Status shown**: Market Data (age, source, in use / stale / manual / unverified / not-in-last-refresh, refresh summary, confirm and withdraw); dashboard and Accounts notice; a "Data to complete" stale-rate task linking to Market Data; stale age on recommendation conversions; the PDF names the sources of the rates actually used (e.g. "ECB reference rates and advisor-entered (manual) rates", or "No currency conversion was needed") and its Assumptions page lists those rates, cross rates and the confirmation; Copilot `fx_freshness` (drafting isn't blocked by staleness).
- **Store v6**: drops only the obsolete `isStale` flag. Rates, dates, sources and all other data are kept.
- **Sample**: monetary values, proposed values and the rest of the PDF match the stored baseline. Four differences are intentional and asserted, not recaptured: the sample's 2026-04-30 rates make "Exchange rates current" fail, add one stale-rate task, add the rates-used block to the PDF, and the Assumptions bullet now reads "Exchange rates used: ECB reference rates, each listed with its date below."

**Review fixes (commit `c11ce20`)**, tests first in `tests/fxReview.test.ts` (16):
- Finding 1 reproduced on `ad3ea98` (EUR reporting, CHF 1,000, stale CHF/USD 1.2, current USD/EUR 0.9 changed to 0.8: EUR 1,080 → 960 and the confirmation stayed valid). Now `changed`, also for direct and inverse current legs and a new use; an unused rate changing leaves it valid.
- Finding 2: the clock's boundary, expiry without workspace edits (server readiness agrees at the same instant), the day-7/day-8 midnight and return-to-page refresh, with no timer left after unsubscribing.
- Finding 3 reproduced on `ad3ea98` (invalid `expiresAt`, a 2099 `expiresAt` and a future `confirmedAt` were all valid). Now invalid, at the policy and the final-PDF route (422), with the exact 7-day boundary and the missing-rate gate kept.
- Also found and fixed: a current leg turning stale after confirmation isn't covered by it; a stored `USD/USD` identity rate is no longer reported as "not returned" by a refresh.
- CI: see "CI timeout: cause and fix" below (the earlier "first import" explanation was wrong).

**Shared-clock follow-up (on `7afdd86`):**
- **Bug (reproduced first).** The page subscribes to the clock at 12:00 and the user confirms at 12:10, with no midnight, focus or edit in between.
  - The confirm action recorded `confirmedAt` with `new Date()` (12:10), but the status was still evaluated at the clock's snapshot (12:00), so the confirmation read as future-dated (`invalid`).
  - Its recovery deadline (12:08) had already passed in real time, so the next scheduled update was midnight.
- **Fix:**
  - Confirming goes through one store action, `confirmFxRates()`, which takes its time from `fxClock.now()`. That call catches the shared clock up and returns the current instant, so the record and the status share one instant. FxRatesPanel uses the action; a refresh also takes its time from `fxClock.now()`.
  - The clock now schedules from the time on screen, so a deadline that has passed in real time but isn't shown yet ticks at once.
  - The singleton `fxClock` moved to `src/engines/fxClock.ts`, and the deadline rule to `fxDeadline` in `fxPolicy`.
  - The future-time validation and the 2-minute tolerance are unchanged.
- **Tests (`tests/fxReview.test.ts`, written first; both failed).**
  - The store's confirm action, called 10 minutes after the clock was subscribed, is valid at once in the panel, notice and readiness, with exactly one clock notification.
  - Withdrawing and confirming again 15 minutes later works.
  - The exact expiry still fires by time alone, and no timer is left afterwards.
  - Separately, a deadline already passed in real time but not by the snapshot ticks at once.

**CI timeout: cause and fix (after `790ab58`, run 39813520266).**
- **What failed.** The fxPolicy test "the final-PDF route refuses stale rates without a valid confirmation" timed out:
  - at 5 s on `b976bf3`, `c11ce20` and `6dcdefd`;
  - at 30 s on `790ab58`;
  - it passed in 2.3 s on `ad3ea98`.
- **Where it stalled.** Its valid-confirmation request passed every readiness check, so the route went on to resolve the runner's Chrome, launch it and print a real PDF; it was the only route test that got that far. A temporary diagnostic commit (`df6028f`, run 39818495413, removed in the next commit) timed each stage on CI:
  - route import: 91 ms;
  - readiness and template render: ~0.2 s;
  - **launching `/usr/bin/google-chrome`: 25.3 s.** Chrome printed nothing for 14 s, then D-Bus errors, and DevTools was listening at 19 s;
  - page, content, PDF and close: ~3.4 s;
  - total: 200 `application/pdf` at 28.9 s.
  - The same route run straight afterwards took 0.5 s (launch 0.22 s).
- **Conclusion.** The cost is Chrome's first, cold start on a busy CI runner, not the import (my earlier "cold import" explanation and its 30 s timeout were wrong).
- **Fake `Date`.** `Date` stayed frozen at `NOW` through every stage and the PDF still completed, so fake time doesn't block this path. Chrome's 19 s start happens in its own process, before puppeteer connects. The probe always ran the fake-`Date` case first, so the order wasn't swapped.
- **Fix.**
  - The readiness-focused route tests in `fxPolicy.test.ts` and `fxReview.test.ts` replace only the Chromium boundary: `puppeteer-core` and the host-browser lookup, in `tests/support/fakeChromium.ts`. They keep the real route, request parsing, server-clock readiness and template rendering.
  - The 30 s timeouts are removed; the route tests now take 60–110 ms.
- **What the tests now assert.**
  - Missing, malformed (not a record, or unreadable time), changed (forged fingerprint, or the covered rate itself) and expired (server clock) confirmations each return 422 with only "Exchange rates current" failing.
  - A valid confirmation alongside another failure (an unvalued holding, or no approved recommendation) returns 422 for that check only.
  - Nothing refused launches a browser.
  - With every check passing, the route renders the proposal (including the rates-used block and the confirmation) and reaches the browser boundary, returning 200 `application/pdf` and closing the browser.
- **Checks on the fix.**
  - The focused files passed 10 runs in a row.
  - With the route's readiness gate bypassed, both route tests fail.
  - The store test restores the store, its clock subscription and its deadline even if an assertion fails.
- **Real PDF generation** stays covered separately:
  - the recorded local smoke (draft PDFs generated through the local route and inspected visually);
  - the diagnostic CI run (real Chrome, 200 `application/pdf`);
  - the same probe run locally on this code, under both fake and real `Date`.

**Validation (run on the branch):**

| Check | Result |
|---|---|
| typecheck | pass |
| tests | 322 of 322 passed with the private UBS PDF (18 files); without it, as in CI, 2 are skipped |
| eval | unchanged: recall 100%, label 100%, currency 87.5%, 0 wrong, 0 spurious |
| build | pass |
| new tests | 24 in `tests/fxPolicy.test.ts` and 18 in `tests/fxReview.test.ts`, written first |

**Browser** (local `next start`, synthetic workspace; the browser's own workspace was restored afterwards):
- A v5 save with `isStale: true` migrated to v6 without it, keeping all rates.
- Market Data showed stale, in-use, unused and manual states. The dashboard notice, readiness (15/16) and the per-holding stale-rate tasks appeared, and the recommendation conversion showed "175 days old".
- Confirmation was stored. The server route returned 200 with it and 422 ("Exchange rates current" only) without it or with an expired one. The expired and changed states displayed.
- A real failed refresh: the preview server process couldn't verify the provider's TLS certificate (`UNABLE_TO_VERIFY_LEAF_SIGNATURE`; a local environment issue). Nothing changed and the failure was shown.
- A successful refresh used a real provider response fetched from a shell (22 Oct 2026) and fed to the page:
  - USD/EUR and USD/SEK replaced the stale reverse copies;
  - manual VND was kept;
  - ARS was not returned and was labelled;
  - readiness went to 16/16 and the notice cleared.
- A draft PDF generated by the local server route (Chromium) was inspected visually: the Assumptions page lists CHF/USD (stale, 175 days) and USD/EUR (current), not the unused JPY rate, with the cross-rate note, the policy wording and the confirmation with its expiry.
- Review fixes (`c11ce20`, synthetic EUR workspace):
  - **Changed cross rate:** after confirming CHF/USD, USD/EUR was changed 0.9 → 0.8. The dashboard showed EUR 960 and "no longer applies"; the server route then failed "Exchange rates current" (before the change it passed).
  - **Expiry by time alone:** only the page's `Date.now` was shifted to 3 s before expiry. The panel read "Confirmed…" and, 4.5 s later with no event or edit, "The earlier confirmation expired 2026-10-29 16:03 UTC"; the dashboard notice and readiness item agreed. Stored data was byte-identical.
  - **Midnight:** at 2026-10-29 23:59:57Z USD/EUR (dated 2026-10-22) was 7 days old and current; after midnight, 8 days and stale, and listed for attention. Triggered by `visibilitychange` then the midnight timer, no edits.
  - **Shared-clock follow-up (local `next start`, page time advanced with no event or timer; the 102-holding workspace was restored byte-identical afterwards).**
    - **Confirm after 10 minutes on the page.** Clicking Confirm 10 minutes after mount was valid at once. The panel read "Confirmed 2026-10-22 16:30 UTC…", the dashboard had no notice, readiness was 15/16 (the failing check was the synthetic workspace's missing recommendation), and the PDF preview listed "Exchange rates current" without a warning. The DOM made 0 mutations in 3 s idle, so there was no render loop.
    - **Withdraw and confirm again.** After 5 more minutes on the page, this was also valid at once.
    - **Expiry.** A confirmation made 3 minutes after mount expired exactly at its deadline by time alone ("Confirmed…" at −3 s, "expired" after it).
    - **Midnight and return from the background.** A `visibilitychange` to 2026-10-28 23:59:57Z showed USD/EUR (dated 2026-10-21) at 7 days, current and still confirmed. After midnight it was 8 days, stale, and the confirmation no longer applied. Stored data was unchanged.
    - **Listeners.** Window `focus` and document `visibilitychange` listeners netted to 0 over five page changes.
  - **PDF:** with an ECB and a Manual rate in use, the Assumptions page read "Exchange rates used: ECB reference rates and advisor-entered (manual) rates, each listed with its date below." and listed the Manual GBP/USD rate.

**Limitations:**
- **Provider redirect.** The provider host redirects (`api.frankfurter.app` → `api.frankfurter.dev`), and `fetch` follows it.
- **Real route and TLS.** This machine's AVG Web/Mail Shield intercepts HTTPS: the provider's certificate is issued locally by "AVG Web/Mail Shield Root", trusted only through `NODE_EXTRA_CA_CERTS` in the shell (hence the preview server's `UNABLE_TO_VERIFY_LEAF_SIGNATURE`). The actual route handler, run in-process from that shell, returned 200 with five ECB rates dated 2026-10-22 and omitted VND, but over the intercepted connection, not normal TLS verification. **On the Vercel preview** for `c11ce20` (opened in the in-app browser, which has a Vercel sign-in; the Vercel MCP access tools returned 403), the deployed route made the provider request with normal TLS (this evidence is for `c11ce20`; later commits change the clock, tests and docs, not the route or provider): `GET /api/market-data/fx` returned 200 with five ECB rates dated 2026-10-22 (VND omitted), and Market Data → Refresh FX updated all 9 sample pairs and cleared the stale-rate notice. The preview origin's workspace was restored afterwards.
- **Sample rates.** They are illustrative, labelled ECB and dated 2026-04-30, so the public sample fails "Exchange rates current" until FX is refreshed or the rates are confirmed. This is intentional.
- **Manual rates.** No UI to enter or remove manual rates (pre-existing). A manual rate is only replaced by editing stored data.
- **Confirmation trust.** The confirmation lives in browser storage with the rest of the workspace. The server checks its fingerprint and expiry, but the state is client-supplied, not a tamper-proof record (#59, R19).
- **Clock skew.** The server and browser evaluate at their own clocks; a confirmation up to 2 minutes ahead of the server's clock is accepted.
- **Out of scope.** Rate dates use UTC date labels here; general date display is #28. Candidate refresh with review before applying is R18 (#51).
- **Migration order.** R23a export/restore was planned before persisted-schema changes. The v6 step only removes an unused optional flag and was explicitly requested.

## Agent planning addition — 22 October 2026

R22 / issue #54 now includes [AGENT_EVALUATION.md](roadmap/AGENT_EVALUATION.md): Claude-first provider adapter/configuration, optional separately evaluated providers, offline orchestration tests, paid opt-in synthetic live evaluations and browser acceptance. Atlas users do not need Claude Desktop/Code; the current no-key demo remains scripted and the live implementation remains Anthropic-specific until changed. Evaluate cheaper models before changing the default. No paid calls, runtime changes or additional provider approval occur in this save. Preserve #59 and #26 then #28 sequencing; foundational agent tests may precede later contextual features. Do not substitute parser/demo/tool tests for proof of live-agent behavior.

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

_Section last updated: 2026-10-22, when PR #60 was merged (`e54d56e`); #28 is in review as PR #63. Newer checkpoints at the top supersede older next-step notes._

> The roadmap checkpoint and PII prerequisite (#59) at the top of this file and the #33 section below are both current; neither replaces the other.

## Working agreements
- Every bug, idea or parked item gets a GitHub issue; a PR closes its issue.
- Design or UX changes: propose first, with numbered decisions, and build after they're answered.
- Write failing tests first. Run typecheck, full tests, the extraction eval, the production build and focused browser checks before asking for review.
- Merge and deploy only on the owner's explicit approval. After a push, report the Vercel preview URL; after a merge, confirm the production deploy at https://atlas-proposal-engine.vercel.app.
- Never put the Anthropic API key on the public Vercel site. The live Copilot is local only.
- Don't commit third-party PDFs. The UBS holdings-report sample goes in `tests/fixtures/private/`, which is git-ignored; its tests skip when it's absent.

## Production
Current production is `e54d56e` (PR #60, #26); see the release checkpoint at the top. Before that: `4e6da18` (PR #34). Earlier release: `9d44d9f` (merge of PR #31, pinned to head `3a1482f`, CI green on that commit), deployment `dpl_4V9aw12vvUreEQq3xYLKdFJaUzEz`. Smoke-tested on the live site, 2026-10-21:
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
| #26 / #60 (merged `e54d56e`) | FX refresh merges by pair; rates aged from their dates; stale rates in use need a refresh or an expiring confirmation (see the top). |

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
2. ~~**#26 (FX refresh, retained rates, stale-rate policy)**~~: merged in PR #60 as `e54d56e` and live (see the release checkpoint at the top). The accepted direction is recorded on #26 (comment 6325161797). Refinements (all implemented):
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
3. **#28** (dates shown a day early west of UTC): in review as PR #63 (see the top); merge only on approval. Kept separate from #26.
4. Backlog enhancements (#11–#19) stay parked until chosen.
