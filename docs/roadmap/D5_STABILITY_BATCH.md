# D5 — Stability batch: workspace reset investigation and meeting view on small screens

17 November 2026. Branch `fix/d5-stability-reset-meeting`, from `main` at `3c40cf7`. Synthetic data only (the seeded Blackwell sample), isolated `*.localhost` origins on a local production build, separate browser profiles; the owner's browser data was not opened. No paid call.

## 1. The unexplained workspace reset

### What was seen

On 17 November 2026, while checking PR #90, a scripted browser session found the saved sample workspace back at its defaults (no approved version, nothing approved, rates unconfirmed) between two Chrome launches that shared one test profile. The earlier sessions had approved a version and persisted it across launches. No app action that resets the workspace (Settings → reset or clear, Client Profile → restore the sample) was used.

Uncontrolled conditions at the time: one earlier scripted run had been **stopped while Chrome was blocked on a `confirm()` dialog**, which can leave a browser process on the profile; later runs reused that profile directory. The sequence was not recorded closely enough to say when the saved value disappeared.

### Where an app-side reset could come from

The store (`src/store/useStore.ts`) uses zustand's `persist` with `localStorage` (zustand 5.0.13). Hydration is synchronous at store creation. The paths that could replace a saved workspace are:

- an explicit reset (`resetSeed`, `clearAll`, `restoreWorkspace`), all user-initiated;
- hydration finding **no** saved value: the seed is in memory, and the first `set` (for example `setHasHydrated`) writes the seed back;
- hydration **failing** (unreadable JSON or a throwing migration): zustand reports the error, the seed stays in memory and the next `set` overwrites the saved value.

So a reset is either the saved value being absent when the app starts (browser or profile) or a hydration failure (app). The reproduction captures the saved value before any app script runs to tell these apart.

### Bounded reproduction

Harness (kept out of the repository; reproducible from this description): puppeteer-core with the installed Chrome, headless. For each trial, a **fresh profile directory**, one host `reset-trial-N.localhost:3001`, the same port throughout.

1. Setup session: confirm the exchange rates, confirm the flagged holdings, approve one recommendation, approve version 1 with the note `reset-trial-N`; record the saved value (length, SHA-256 prefix, version id, fingerprint, approvals). Close the browser gracefully (`browser.close()`).
2. Three cycles, each: relaunch with the same profile; an init script (`evaluateOnNewDocument`) reads `localStorage["atlas-proposal-engine"]` **before any page script runs**; open Review & present; read the saved value again **after hydration**; check that the UI lists version 1; visit the dashboard and the meeting view; close gracefully.

| Trial | Build | Version (fingerprint) | Relaunches kept | Saved value before app scripts vs after hydration |
| --- | --- | --- | --- | --- |
| 1 | `main` (`3c40cf7`) | `ver_cy19k7244xqb` (`62776e5e62505c3c`) | 3 of 3 | identical (76,414 chars, `3d62374d…`) each time |
| 2 | `main` | `ver_relpcfnw5kim` (`87b081ad60c6bf53`) | 3 of 3 | identical (`8635ad1d…`) each time |
| 3 | `main` | `ver_wu9l2sjy6719` (`ff5c03a516f2f933`) | 3 of 3 | identical (`c337dfca…`) each time |
| 4 | this branch (rehearsal) | `ver_654cru4dfj8q` (`cabf506e988afe40`) | 3 of 3 | identical each time |
| 5 | this branch, final code (rehearsal) | `ver_4t966xtunp8j` (`b123d6f66f7f3444`) | 3 of 3 | identical each time |

### Conclusion

**Not reproduced: in the bounded reproduction (trials 1–3 on `main`), 9 of 9 graceful relaunches kept the workspace byte-for-byte**, both as the browser handed it over and after the app hydrated, and the approved version stayed listed and viewable. The two rehearsals on this branch (trials 4–5) kept it in 6 of 6. **No persistence code was changed**, because no app defect was demonstrated.

Uncertainty: the original occurrence is unexplained. The most likely explanation is the browser or profile (a process left on the profile by the stopped run, or an unflushed write when it ended), but that is a hypothesis, not a finding: ungraceful termination was outside this bounded test and was not tried. If it recurs, record how the browser was closed and capture the saved value with the init script above before drawing conclusions.

## 2. Meeting view on small screens

### Problem (measured on `main`)

The meeting view (`/meeting/[id]`) renders the document at its printed width, 8.5in (816 CSS px).

- **375 px phone:** the page's layout width stretched to 817 px; the screen showed the left 375 px of the cover, and "Back to Review & present" sat off-screen to the right.
- **768 px:** 48 px of each page was cut off behind a horizontal page scroll.
- **1360 px:** fine.

### Change (screen only, `/meeting/[id]` only)

- `src/app/meeting/[id]/meetingFit.tsx`: `fitScale(width)` (816 px document; scale = available width ÷ 816, floor 0.3, never above 1) and a focusable region (`role="region"`, `aria-label="Approved version document"`, `tabindex="0"`) that scrolls sideways. The scale is a CSS variable used only by an `@media screen` rule (`zoom`, so the page also ends where the document ends). Print ignores it.
- `src/app/meeting/[id]/page.tsx`: the document is wrapped in that region; when the screen is narrower than the document, the banner shows a button whose label names the action it takes, **Actual size** or **Fit to screen**. The banner wraps on narrow screens.
- Unchanged: `ProposalPdfTemplate`, `pdfStyles`, the PDF route, the PDF Preview page, approved-version contents and fingerprints.

### Results (local production build, synthetic version 1 of trial 1)

| Viewport | Before | After |
| --- | --- | --- |
| 375 px (mobile emulation) | layout 817 px wide; cover cut at 375 px | layout 375 px; document scaled to 0.459 and fully visible; page ends at the document's end |
| 768 px | 48 px cut off | scaled to 0.941, no horizontal scroll |
| 1360 px | unscaled | unchanged, no button |

Keyboard at 375 px: Tab reaches **Actual size**, then **Back to Review & present**, then the document region. Enter switches to actual size (the region then scrolls; the page does not); the arrow keys scroll the focused region to its right edge; Space switches back to fit.

### Output unchanged (fixed inputs)

The same frozen approved version (`ver_cy19k7244xqb`) was posted to the PDF route on the `main` build and on this branch, with `timeZone: "UTC"`. Compared by page count, extracted text and a page-by-page pdf.js rendering, not raw bytes (creation metadata differs between runs).

| Output | Pages | Text | Pixels |
| --- | --- | --- | --- |
| Final PDF | 23 = 23 | identical once the "Issued …" time is normalised | differences only in that one line on pages 1 and 2 |
| Draft copy | 23 = 23 | identical once the "generated …" time is normalised | differences only in that one line on pages 1 and 2 |
| Meeting view printed (Letter, backgrounds) | 23 = 23 | identical | identical on every page |

Tests: `tests/meetingView.test.ts` (fit scale), and in `tests/approvedSnapshot.test.ts` a check that the wrapper contains the meeting document byte-for-byte, as a focusable region, with screen-only scaling.

## Not done

- Ungraceful browser termination was not tested (outside the bound).
- No production check yet; that follows a merge.
- The meeting view was checked in Chrome only (mobile emulation for 375 px), not on a physical phone or in Safari or Firefox. `zoom` is supported by current Chrome, Edge, Safari and Firefox (126+).
