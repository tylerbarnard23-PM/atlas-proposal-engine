# D5: the sample notice on every physical PDF page (#94)

18 November 2026. Branch `fix/pdf-sample-notices`, from `main` at `fe90ae9`. Print output only: no financial logic, persisted state, store or backup version, dependency, model setting, template markup or technical identity changed. Synthetic data; no key, no paid call. Contract-impact note posted before the first edit: [#94](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/94#issuecomment-6983851136).

## The fault (reproduced with real Chromium PDFs)

Each section of the document is one `.pdf-page` box printed with zero page margins. The sample notice and the footer were positioned at the bottom of that box, so when a section overflows, Chromium splits the box across physical pages and only the section's **last** physical page got the notice. On the earlier pages the content ran to the paper's bottom edge, and nothing reserved space for a notice.

| Output (fixed or rehearsed synthetic inputs) | Pages | Pages without the notice |
| --- | --- | --- |
| Draft PDF, sample workspace, fixed clock (regression-test inputs) | 22 | 12, 14, 17, 19 |
| Final PDF, same inputs | 22 | 12, 14, 17, 19 |
| Approved-version final PDF through the real route (walkthrough on a production build) | 23 | 2, 14, 16, 20 |
| Meeting view printed by the browser (same approved version) | 23 | 2, 14, 16, 20 |

## The fix (print CSS only, in the shared `PDF_BASE_CSS`)

- **`@page` margin box:** every physical page reserves a 0.6in bottom margin (`PDF_NOTICE_BAND_IN`). Its `@bottom-center` box holds the complete `PDF_SAMPLE_NOTICE`, so the notice is drawn on every page in space that content can't use. It is 7pt (was 6.5pt), centred, and indented 0.55in from each side. There is also a 0.35in top margin, so a continued section doesn't start at the paper's edge.
- **Cover:** a named `cover` page with no margin and no margin box. It stays full-bleed and pixel-identical, and it already carries the complete notice in its disclaimer.
- **Section boxes in print:** the padding is reduced by the margins, so the first page of every section has exactly the same content area as before. The section footer moves to just above the notice band. The old in-box notice is hidden in print only, because the margin box replaces it.
- **Screen is unchanged:** every new rule is inside `@page` or `@media print`. The meeting view and the PDF preview iframe still show the in-box notice.
- **`src/pdf/printOptions.ts`:** the route's existing `page.pdf` options moved to one module (values unchanged), so the regression test prints exactly as the route does.

## Verification

- **Regression test** (`tests/pdfPageNotice.test.ts`, 9 tests). It prints the committed synthetic sample with a fixed clock in the installed Chromium, using the route's options, and reads **each physical page** with pdf.js. For draft and final:
  - the document has continuation pages (more pages than sections), so the check covers them;
  - **every** page contains the complete notice;
  - on every page after the cover, the bottom 0.6in band holds the complete notice and nothing else, at no less than 6.5pt and inside the page edges;
  - the cover keeps its own complete notice.

  Against the old CSS the per-page checks failed on pages 12, 14, 17 and 19. The large decorative watermark is excluded from the band check by size: Chromium clips it at the page area (checked visually), but pdf.js still reports its glyph origins. The test skips only if no Chromium is installed; GitHub's Ubuntu runner has Chrome.
- **Before/after on fixed inputs** (draft and final, 22 pages each):
  - **Page count:** unchanged, 22 → 22.
  - **Extracted text:** compared item by item with the notice removed. Draft (1,381 items) and final (1,380 items) have **no net change**: every item appears as often after as before.
  - **What moved:** three runs per document. Two table break points moved, taking the repeated column header and the section footer with them, and one row ("Nestlé SA") moved relative to the footer. This is legitimate pagination: continuation pages now have 0.35in top and 0.6in bottom margins, so a split table breaks a few rows earlier. No baseline was rewritten.
  - **Visual:** the cover is pixel-identical. On other pages the content is in the same position, the faint watermark sits about 9pt higher (its box is shorter in print), and the footer and notice have swapped places at the bottom. Continuation pages 13, 15, 18 and 20 start below the new top margin and now end with the footer and the notice. Inspected as rendered images.
- **Approved-version final PDF through the real route** (local production build, fresh profile, walkthrough):
  - **Workflow:** same figures as before (16/20 → scope → explicit approval, equity 91.3% → 87.3%, cash 3.7% → 7.7% → 20/20 → version 1).
  - **PDF:** 23 pages, notice on **23/23**, and the bottom band holds only the notice on all 22 non-cover pages.
  - **Content:** fingerprint, "Approved version 1", the approved action, the firm name, and 0 "Atlas".
  - **Before/after:** the item diff against the pre-fix run differs only in run-specific values (issue and approval time, fingerprint, note, FX confirmation time); 1,336 items each.
- **Meeting view:**
  - **On screen:** the text is identical before and after once run-specific values are normalised, and the fingerprint is shown.
  - **Printed by the browser:** 23 pages, notice on 23/23, band-only on 22/22, with the same fingerprint as the screen and the route PDF.
- **Required checks:** see the PR.

## Limits

- Chrome only. The real route was exercised locally and was not checked on production (that follows a merge). Production renders with serverless Chromium (`@sparticuz/chromium-min` v148). CSS page margin boxes shipped in Chromium 131, so that build is expected to draw the notice, but it was not run here; a production page-by-page check after merge is required.
- The section footer's page number still counts sections, not physical pages, and appears only on a section's last page. This is unchanged and was not in this issue's scope.
- The watermark is still centred on each section box, so on a long section it sits across a page break. It is clipped at the page area and is decorative; also unchanged.
- No accessibility conformance or screen-reader claim for the PDF.
