# D5: production verification and desktop recording package

18 November 2026. Production at `main` = `1f5a856ce0290bb1f52ecee5c9d218f7afc6305c` (PR #99, the sample notice on every physical PDF page, [#94](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/94)). Synthetic Blackwell sample workspace, scripted demo Copilot (no model, no key), the live site's own PDF route. No real client data, no paid call, no code change. This is an engineering demonstration, **not a usability study**: the R25 scorecard stays empty.

## 1. Production verification of `1f5a856`

**Deployment association.** Main CI [run 44366280151](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/actions/runs/44366280151) for `1f5a856` completed with success; the commit's `Vercel` status is success ("Deployment has completed"); GitHub records **Production deployment 7891943189** for that SHA (created 18:08:16 UTC, status success). **Limitation (unchanged):** the Vercel API is unreadable from this account and its permissions were not changed, so I did not read which build the production alias serves. The page checks below ran against `https://atlas-proposal-engine.vercel.app`, and the PDFs themselves show the fixed behaviour (before the fix the same route left the notice off 4 pages of every output).

**Method.** Chrome (headless), two fresh browser profiles on the live site, driven by a script, not a person. Run 1: the walkthrough below, then the approved-version final PDF and the meeting view's browser-printed output. Draft: a separate fresh profile, "Generate draft PDF" in PDF Preview on the default sample. Each PDF was read page by page with pdf.js and sample pages were rendered and looked at.

| Output | Pages | Complete notice | Bottom 0.6in band holds only the notice (non-cover pages) | Notice size | Body text in the band |
| --- | --- | --- | --- | --- | --- |
| Draft PDF (PDF Preview, 200) | 21 | **21 / 21** | 20 / 20 | 7 pt | none |
| Final PDF from approved version 1 (route, 200) | 23 | **23 / 23** | 22 / 22 | 7 pt | none |
| Meeting view, browser-printed | 23 | **23 / 23** | 22 / 22 | 7 pt | none |
| Final PDF, second run (capture run) | 23 | **23 / 23** | not repeated | | |

- **Legibility and edges:** the notice is centred in the reserved margin, 7 pt, inside the page edges on every page (no text within 18 pt of a side edge or 4 pt of the bottom). Pages inspected as rendered images: final PDF pages 1 (cover), 14 and 20; draft page 12; meeting print page 14: the notice sits clear of the table or content above it, with nothing clipped or overlapping.
- **Financial content (final PDF):** in-scope accounts Taxable Brokerage $3.67M and Traditional IRA $1.34M (the $5,010,977.50 scope, with the other accounts under "Household context outside the investment scope"), the approved action "Trim concentrated Apple position to 5% of liquid portfolio" at USD 200,000.00, equity 87.3% and cash 7.7%, all as on screen.
- **Branding and attribution:** the advisor firm "Harbor & Pine Wealth Partners" and advisor on the cover; the Stratovell sample notice on every page; 0 occurrences of "Atlas".
- **Approved-version fingerprint:** the final PDF and the printed meeting view carry the same fingerprint as the review page and the meeting screen (run 1 `e2133e29041c3aaf`; capture run `f19d2551b1347f67`), "Approved version 1", and "Figures are as approved; nothing was refreshed". The draft carries the DRAFT mark and no fingerprint.
- **Remaining limitations (unchanged by #99):** the section footer's "Page N" counts sections, not physical pages, and appears only on a section's last page (final PDF: footers on 18 of 23 pages, "Page 1" to "Page 18"); the large "SAMPLE" watermark is still centred per section, so on a long section it is cut by the page edge or the margin (clipped and faint; it never covers the notice text). No accessibility conformance claim.
- **Not checked:** Safari or Firefox, a person doing it, other browsers' print engines, accessibility.

Result: **every check passed**; nothing to fix, so the rehearsal went ahead.

## 2. Rehearsal (existing walkthrough, once on production, then once more for captures)

Steps follow [D5_DEMO_WALKTHROUGH.md](D5_DEMO_WALKTHROUGH.md). Both runs, on fresh profiles, matched each other and the earlier rehearsals:

| Step | Observed (both runs) |
| --- | --- |
| Blocked readiness | "4 items left before the final PDF", readiness 16/20; clicking Approve version creates 0 versions; PDF Preview says "Final PDF: approve a version first" |
| Scripted Copilot | "Scripted demo · no model" answers with the same four blockers |
| Scope | 2 of 14 accounts: weights of $5,010,977.50 (was $19,236,541.91) |
| Sized change | the Apple trim set to 200,000 stays **Not approved**, in no draft |
| Explicit approval | only then approved: equity 91.3% → 87.3%, cash 3.7% → 7.7%, proposed cash in Taxable Brokerage $184,200 → $384,200; 0 draft, 1 approved change |
| Approved version | after confirming rates and flagged holdings: 20/20, "Ready for final generation", version 1 (one action frozen, fingerprint on the page) |
| Meeting view and PDF | "Viewing approved version 1", "not an issued document", same fingerprint, firm, action, 0 "Atlas"; final PDF 200, 23 pages, 484,476 and 484,487 bytes |

Fingerprints differ between runs because they include approval times.

## 3. Captures (desktop, 1440×900, saved in [`docs/demo-captures/`](../demo-captures/))

Taken from the second production run, synthetic data only. Browser captures are screen images of the live site; the PDF captures are pages rendered from the PDF the route issued.

| File | Shows |
| --- | --- |
| `01-review-blocked.png` | Review & present, blocked: 4 items, 16/20, Approve inactive |
| `02-copilot-blocked-answer.png` | Scripted Copilot listing the blockers ("Scripted demo · no model") |
| `03-allocation-scope.png` | Allocation desk, account scope narrowed to 2 of 14 |
| `04-recommendation-sized-unapproved.png` | The Apple trim sized at 200,000, still Not approved |
| `05-desk-approved-changes.png` | Approved changes view: equity 87.3%, cash 7.7%, proposed cash $184,200 → $384,200 |
| `06-review-ready.png` | Review & present: 20/20, ready for final generation |
| `07-meeting-view.png` | Read-only meeting view of approved version 1 with fingerprint |
| `08-final-pdf-cover.png` | Final PDF cover (issue line, fingerprint, sample notice) |
| `09-final-pdf-continuation-page-14.png` | Final PDF continuation page with the notice in the reserved margin |
| `10-draft-pdf-continuation-page-12.png` | Draft PDF continuation page, same notice |

## 4. Recording-ready narration outline (about five minutes)

Say these things, in this order. The numbers are what the sample shows; fingerprints and times will differ.

0. **Opening (15 s).** "Stratovell is a demonstration. Everything you will see is fictional data, the assistant is a scripted demo with no AI model, and every PDF is marked SAMPLE." Keep the "Scripted demo · no model" label and the sample notice on screen.
1. **Blocked first (45 s).** Open *Review & present*. "The proposal isn't ready: 16 of 20 checks, four things left, and the approve button does nothing." Open *Proposal Copilot*, ask "Is this proposal ready to send? What's blocking the PDF?": the scripted answer lists the same blockers and "figures checked against the engine".
2. **Scope (30 s).** *Allocation desk* → Edit accounts → keep Taxable Brokerage and Traditional IRA. "The weights now describe $5.0 million, not the household's $19.2 million; the rest is context."
3. **Sized change (45 s).** *Recommendations* → edit the Apple trim, size it at $200,000, Save. "It previews the effect but is not approved, and it's in no draft."
4. **Explicit approval (45 s).** Approve it. *Allocation desk* → Approved changes: equity 91.3% to 87.3%, cash 3.7% to 7.7%. "Approval changes the proposal, not the holdings."
5. **Clear the remaining checks and approve a version (45 s).** Confirm exchange rates and the flagged holdings; *Review & present* now says 20 of 20; add a note; Approve version 1. "The version freezes values, dates, rates, the approved action and scope, with a fingerprint."
6. **Meeting view and PDF (60 s).** Open the meeting view ("read-only, not an issued document", same fingerprint). Issue the final PDF; scroll it. "Every page carries the sample notice, including continuation pages; the cover says it was issued from approved version 1."
7. **Close (15 s), limits.** Say aloud: fictional data; a demonstration, not an investment adviser; the workspace lives in the browser; readiness is a checklist, not a compliance review; not trademark or legal clearance for the name. **Do not say:** that advisors tested it, that it saves time or matches competitors, that it is secure, compliant or production-ready, that the assistant is AI-driven in this demo, or that the PDF page numbers count pages (they count sections).

## 5. Capture checklist (for the owner)

Before recording:
- [ ] Use a fresh Chrome profile or window with no personal tabs, bookmarks or extensions showing; desktop width at least 1360 px; browser zoom 100%.
- [ ] Open the live demo. The site starts on the sample workspace; if the workspace was changed, Settings → "Restore sample data".
- [ ] Confirm the title bar reads Stratovell, the Copilot says "Scripted demo · no model", and the firm is Harbor & Pine Wealth Partners.
- [ ] No real client data, no API key, no live-AI control (the hosted site shows none).
- [ ] Rehearse the steps in section 4 once; the checks to see on screen are in the table in section 2.

While recording:
- [ ] Capture the full screen at 1080p or better; leave each key state (blocked, scope, sized, approved, version, meeting view, PDF) up for a few seconds.
- [ ] Open the downloaded PDF and scroll through at least one continuation page to show the notice.
- [ ] Read the opening and closing limits aloud.

After recording:
- [ ] Check the recording for any fingerprint or time that disagrees with what was said, and for anything personal in the browser chrome.
- [ ] Trim, add captions that repeat "Fictional data. Scripted demo." and add nothing about advisors, time saved or competitors.
- [ ] **Do not publish or announce** until the owner's gates are cleared (counsel's clearance of the Stratovell name, #35, and the announcement gate).

## 6. Remaining manual steps

1. The owner records and edits the video (nothing here records it).
2. Counsel's clearance of the name and the announcement gate, before any publication.
3. R25 study with consented advisors; the scorecard is filled only from real sessions.
4. Deferred: mobile ([#92](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/92), [#93](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/93), [#97](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/97); draft PR #98 parked); the section-footer numbering and the watermark placement are known limitations.
