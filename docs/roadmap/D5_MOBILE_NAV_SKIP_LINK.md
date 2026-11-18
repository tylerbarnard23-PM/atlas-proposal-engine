# D5: mobile navigation and skip link (#92, #93)

18 November 2026. Branch `feat/mobile-nav-skip-link`, from `main` at `fe90ae9`. Interface change only: the workstation shell (`src/components/layout/`). No financial logic, persisted state, store or backup version, dependency, model setting, PDF template, meeting-view code or technical identity changed. Synthetic data; no key, no paid call.

## What was wrong (reproduced first, on an unmodified production build of `main`)

Chrome, fresh isolated profile, the Dashboard and Accounts & Assets pages.

| Check | 375 px | 768 px | 1360 px |
| --- | --- | --- | --- |
| Primary navigation reachable | **No.** The sidebar is `hidden md:flex` and nothing replaces it; none of the 16 pages is reachable from the shell (5 links visible at 375 px were in-page content links) | yes (sidebar) | yes |
| Menu button | none | n/a | n/a |
| Skip link | none | none | none |
| Tab stops before the page's first control | 2 (no navigation to cross, but no way to navigate either) | 19 | 19 |
| First Tab lands on | the readiness pill | the Stratovell logo link | the Stratovell logo link |

## What changed

- **`navFocus.ts` (new):** the rules, free of React and the DOM so they are unit-tested: the 768 px breakpoint (Tailwind `md`), the focus target after each way of closing (`closeFocusTarget`), the Tab/Shift+Tab wrap (`trapTarget`), the focusable selector, `isActiveRoute`.
- **`Sidebar.tsx`:** the link list is now one `NavLinks` component (same `NAV` definitions, icons, groups, readiness badges and styling), used by both the desktop sidebar and the drawer. It gains `aria-label="Primary"` on the `<nav>` and `aria-current="page"` on the current page. The desktop sidebar is otherwise unchanged.
- **`MobileNav.tsx` (new):** below 768 px a menu button in the top bar (`aria-label`, `aria-haspopup="dialog"`, `aria-expanded`) opens a modal drawer (`role="dialog"`, `aria-modal`, rendered in a portal so the top bar's blur does not clip it). Behaviour:
  - focus moves to the drawer's Close button on open and is contained (Tab and Shift+Tab wrap);
  - **Escape, the Close button and a backdrop click** close it and return focus to the menu button;
  - **choosing a page** (including the current one), **a route change** (browser Back) and **growing to 768 px or wider** close it and move focus to the main content, because the menu button is hidden or the user has moved on;
  - the page behind does not scroll while it is open, and scrolling is restored on every close;
  - the drawer and the menu button carry `md:hidden`, so neither can appear at desktop widths.
- **`AppShell.tsx`:** a **"Skip to main content"** link is the first element in the workstation. Visually hidden until focused, then a visible navy pill with a gold focus ring. Activating it focuses `<main id="main-content" tabIndex={-1}>`.
- **Unchanged by design:** the standalone meeting view (`/meeting/…`), `/proposal-pdf` and `/proposal-print` still bypass the shell, so they get no menu button, skip link or sidebar. The PDF and print output is untouched.

## Verification

- **Unit and markup tests** (`tests/mobileNav.test.ts`, 15 tests; the unit environment has no DOM and no dependency was added): the breakpoint, the close-focus table, the focus-wrap cases (first, last, outside, single stop, none), active-route rules; the sidebar, the shared link list and the drawer all render the same pages in the same order; the dialog markup (modal, labelled, Close button, `md:hidden`); the closed menu button (collapsed, no `aria-controls`); the skip link precedes the sidebar and top bar and targets a focusable `<main>`; the meeting, PDF and print routes render with no chrome; no meeting-view or PDF-template file references the new code.
- **Keyboard and viewport rehearsal** (production build, Chrome, fresh profile, isolated `*.localhost` origin; mouse used only for the backdrop):
  - **375 px:** the menu button is present and collapsed; the skip link is the first Tab stop (then the menu button); Enter on the menu button opens the drawer with focus on Close, 16 page links plus the brand and Close (18 stops), the current page marked; **25 Tab and 25 Shift+Tab presses never left the drawer**; Escape closed it with focus on the menu button; choosing "Allocation desk" navigated, closed the drawer and put focus on the main content; a backdrop click closed it with focus on the menu button; browser Back with the drawer open closed it and restored page scrolling. The same results at 600 px.
  - **Resizing with the drawer open:** 375 → 1360 px and 375 → 768 px both closed it, restored scrolling, showed the sidebar and put focus on the main content (the next Tab reached the page's first control); back to 375 px the menu button reappeared and the drawer stayed closed.
  - **768 and 1360 px:** no menu button; the sidebar is unchanged; **Tab, Enter** on the skip link reaches the first control in the page (previously 19 Tab stops, now one Tab plus Enter); the skip link is on screen when focused.
  - **Meeting view:** no menu button, skip link or sidebar.
  - **Core workflow regression** on the same build (blocked 16/20 → scoped to USD 5,010,977.50 → explicit approval, equity 91.3% → 87.3%, cash 3.7% → 7.7% → 20/20 → approved version → meeting view → final PDF): same figures; the 23-page final PDF carries the version's fingerprint, the approved action at USD 200,000.00 and the Stratovell notice on the cover and 19 of 23 pages (#94 unchanged), with no "Atlas".
- **Required checks** (local, on Next.js 16.4.5 after syncing `node_modules` to the lockfile; the lockfile and `package.json` are unchanged): `npm run typecheck` passes; `TZ=UTC npx vitest run` **781 passed, 0 skipped locally** (44 files; the two private-PDF tests skip in CI, which reports its own counts); `TZ=UTC npm run eval` recall 100.0%, label 100.0%, currency 87.5%; `npm run build` passes (its first attempt stopped on a Next.js upgrade-recommendation message printed in the build output, which was not acted on; the unchanged retry built). The keyboard rehearsal above was run on the 16.4.5 build, after an earlier identical run on a 16.4.2 install.

## Limits (not claimed)

- Chrome only (headless); 375 px was not tested on a physical phone, Safari or Firefox; no touch gesture, swipe or orientation testing.
- Keyboard behaviour was driven by a script, not a person; **no screen-reader testing**, so announcements of the dialog, the current page and the focus moves are by design, not observed. No zoom, high-contrast or colour-only-cue testing. **No accessibility conformance or certification is claimed.**
- The drawer has no open/close animation (so nothing to disable for reduced-motion preferences), and the page behind is hidden from assistive technology by `aria-modal` rather than `inert`.
- The skip link skips the navigation and top bar only; pages still have many Tab stops of their own.
- **Still open:** at 375 px the top bar truncates the household name, and the Accounts & Assets exchange-rate banner wraps one word per line ([#97](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/97)). The sample notice is still absent from PDF continuation pages ([#94](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/94)), kept separate.
- The R25 scorecard stays empty; no advisor study has been run, and this change makes no usability claim.

## Carried correction: the "unnumbered" advisory

[NEXTJS_16.4.5_SECURITY_PATCH.md](NEXTJS_16.4.5_SECURITY_PATCH.md) called one item "unnumbered". It is **GHSA-vvgp-ww4w-46vf** (CVE-2026-119350, medium, `>= 16.4.0, <= 16.4.4`, patched in 16.4.5): shared shell cache poisoning in self-hosted apps. That document now carries the ID; the conclusion (Cache Components is not enabled, so it does not apply) is unchanged.
