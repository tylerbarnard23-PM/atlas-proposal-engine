# D5 — Demo walkthrough: from scope to an approved, PDF-ready proposal

Prepared and rehearsed 17 November 2026 on the released build (`main` at `b2eb2de`, local production build), with the synthetic Blackwell sample workspace, the scripted demo Copilot (no model, no key) and the app's own PDF route (real Chromium). No real client data, no paid call. This is an engineering demonstration, **not a usability study**: nothing here measures how advisors perform. The protocol for that is [R25_USABILITY_PROTOCOL.md](R25_USABILITY_PROTOCOL.md); its scorecard is empty.

Live demo: <https://atlas-proposal-engine.vercel.app/> (a fresh browser starts on the sample workspace; click "Restore sample data" in Settings to return to it).

## The story in one line

An advisor chooses which accounts the proposal is about, sizes a change, approves it explicitly, freezes a version, and issues a sample PDF from that version. Until every readiness check passes, the product refuses to approve a version or issue a final PDF, and says why.

## Steps (about five minutes)

| # | Page | Do this | What the advisor sees |
|---|---|---|---|
| 0 | **Review & present** | Open it first, on the fresh sample. | **Blocked:** "4 items left before the final PDF", readiness 16/20, and the reasons (4 holding values not confirmed, 1 out-of-date value, no approved recommendation in the PDF, exchange rates 201 days old). The Approve control is inactive; clicking it creates nothing. PDF Preview says "Final PDF: approve a version first". |
| 0b | **Proposal Copilot** | Choose "Is this proposal ready to send? What's blocking the PDF?" and Ask. | The scripted demo (labelled "Scripted demo · no model") lists the same four blockers from the engine's results and reports "6 figures checked against this run's engine results … all matched". |
| 1 | **Allocation desk** | Account scope → Edit accounts; keep only *Taxable Brokerage* and *Traditional IRA*. | The weights now describe USD 5,010,977.50, not the household's USD 19,236,541.91; the other twelve accounts are context only. |
| 2 | **Recommendations** | Edit "Trim concentrated Apple position…", enter an explicit action amount of 200,000, Save. | The card previews the effect of that one action and stays **Not approved** (the app notes it is in no draft). The app asks for an explicit size before it will approve a sale. |
| 3 | **Recommendations**, then **Allocation desk** → Approved changes | Press Approve on that card. | Only now is it approved. The desk's proposed column shows equity 87.3% (−USD 200,000) and cash 7.7% (+USD 200,000); proposed cash in Taxable Brokerage goes USD 184,200 → 384,200. Approval changes the proposal, not the observed holdings, which stay unchanged. |
| 4 | **Exchange rates**, **Accounts & Assets**, then **Review & present** | Confirm the rates; confirm the flagged holdings; add a note; Approve version 1. | Readiness 20/20, "Ready for final generation". Version 1 freezes the values and dates, rates, the one approved action, scope and results, with a fingerprint; later edits never change it. |
| 5 | **Open meeting view**, then **Issue final PDF** | Open the read-only meeting view; issue the final PDF. | The meeting view states "read-only meeting view, not an issued document" and shows the same content and fingerprint. The PDF (23 pages) says "Issued … from approved version 1 … Figures are as approved; nothing was refreshed", names the firm (Harbor & Pine Wealth Partners), lists the approved action ($200,000.00, Applied, Included), and carries the Stratovell sample notice. |

The scripted Copilot's drafting step is not part of this path: on the sample workspace every tradeable finding already has a recommendation, so it says "I didn't draft new ones". The drafting and the explicit **Add** step are covered by the D4 smoke and tests, and by the one real-Claude run below.

## Rehearsal evidence (three fresh profiles, one per run)

Each run used a new browser profile and host (`walk-N.localhost`) on the local production build, the sample workspace, and the same script. The runs were scripted with a browser driver; fingerprints differ between runs because they include approval times.

| Check | Run 1 | Run 2 | Run 3 |
| --- | --- | --- | --- |
| Blocked at start: banner, readiness | 4 items, 16/20 | 4 items, 16/20 | 4 items, 16/20 |
| Approve control clicked while blocked | no version created | no version created | no version created |
| Scope weights after choosing 2 accounts | USD 5,010,977.50 | USD 5,010,977.50 | USD 5,010,977.50 |
| Action unapproved after sizing it | yes | yes | yes |
| After Approve: equity / cash proposed | 87.3% / 7.7% | 87.3% / 7.7% | 87.3% / 7.7% |
| Readiness before approving a version | 20/20 | 20/20 | 20/20 |
| Version 1 fingerprint | `99d183b472f53d86` | `782039c9d871f8e7` | `dbcba3c2178e81c0` |
| Meeting view: version, fingerprint, action, firm, no "Atlas" | all | all | all |
| Final PDF (Chromium) | 200, 561 KB | 200, 561 KB | 200, 561 KB |

PDFs from runs 2 and 3, read as extracted text: 23 pages; the issue line and fingerprint; the approved action at USD 200,000.00; "Investment scope" for the two chosen accounts and "Household context outside the investment scope" for the others; the Stratovell sample notice on the cover and on 19 of 23 pages (continuation pages carry none, see [#94](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/94)); no "Atlas".

## Keyboard evidence (1360 px, synthetic sample)

Readiness was cleared with the mouse in setup; the steps below were done with the keyboard only.

| Check | Result |
| --- | --- |
| First 14 Tab stops (sidebar links) | all showed a visible focus ring |
| Copilot: Ctrl+Enter | asks the scripted demo; the answer appears |
| Allocation desk: Edit accounts → scope checkboxes → Space | reached by Tab; Space toggles the scope |
| Recommendations: Enter on "Approve" | approves (1 approved) |
| Review: Enter on "Approve version" | version 1 created |
| Review: after approving, "Open meeting view" and "Issue final PDF" | each one Tab stop further on |
| Tab stops to the page's own first control | 20 (Approve version), 23 (Edit accounts), 26 (first Approve): the whole sidebar comes first, with no skip link ([#93](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/93)); **a skip link was added after this rehearsal** (one Tab plus Enter reaches the page; see [D5_MOBILE_NAV_SKIP_LINK.md](D5_MOBILE_NAV_SKIP_LINK.md)) |

Not tested: screen readers, high-zoom or high-contrast modes, colour-only cues, error announcements, touch. No accessibility conformance or certification is claimed.

## Viewport evidence (Chrome; 375 px uses mobile emulation)

Twelve routes (dashboard, client profile, accounts, exchange rates, allocation desk, recommendations, Copilot, proposal builder, PDF preview, review, settings, meeting view) at 375, 768 and 1360 px:

- **No page-level horizontal scroll** and no off-screen elements outside scrollable regions at any width.
- **Navigation was missing below 768 px** at the time of this rehearsal: the sidebar is hidden and there was no menu control, so at 375 px no page showed navigation links ([#92](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/92)). A menu drawer was added afterwards ([D5_MOBILE_NAV_SKIP_LINK.md](D5_MOBILE_NAV_SKIP_LINK.md)). In-page buttons still link onward.
- The meeting view fits the screen at 375 and 768 px (PR #91); the Review page's controls and the PDF Preview page were not re-measured in detail.
- Not tested: a physical phone, Safari, Firefox, landscape, browser zoom beyond the default.

## What is and isn't evidenced about the agent

- **Public demo and this walkthrough:** scripted, no model, no key. The page says so.
- **One real-Claude run (owner-operated, 16 November 2026):** one question on a synthetic USD 100,000 account, a dedicated Console workspace with a spend limit, 4 provider requests, about USD 0.07 estimated, model `claude-opus-5-5` with no fallback, 28 figures checked against the engines. The preview alone added nothing; one explicit Add created one unapproved action. Detail: [LOCAL_CLAUDE_SETUP.md](LOCAL_CLAUDE_SETUP.md).
- **Not performed:** the 27-trial agent evaluation, the real-model browser checks, any usability study with advisors, any competitor comparison. The budget for the evaluation is not approved.

## Limits to state when showing it

- Synthetic and fictional data only; every PDF is marked SAMPLE; this is a demonstration, not an investment adviser, not production software and not compliance-reviewed.
- The workspace lives in the browser; there are no accounts, database or audit trail. An approved version is a local record, not a tamper-proof book of record.
- Holding values come from statements and advisor entry; Stratovell does not reprice securities. Exchange rates are ECB reference rates or entered by hand, and old ones block a final PDF until refreshed or confirmed.
- Readiness is a checklist, not a compliance review.
- The name is preliminary-screened only: not trademark or legal clearance; counsel's clearance and the announcement gate remain.

## Re-running it

1. Open the live demo (or `npm run build && npm run start`) in a fresh browser profile on an isolated origin such as `walk-1.localhost`.
2. Follow the steps above. Fingerprints and times will differ.
3. Record failures, assistance and surprises honestly in the R25 scorecard only for sessions that actually happened.
