# Handoff history — 20 November 2026

Superseded checkpoint notes moved out of [CLAUDE_HANDOFF.md](CLAUDE_HANDOFF.md) on 20 November 2026 (PR #110). Kept for lookup; don't load by default.

## PR #108 while in review (statement-import fixes)

- **Statement-import fixes — in review (20 November 2026):** [PR #108](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/pull/108) on `fix/import-statement-dates-bond-class`, from `main` `bb1ff9f`.
  - Found while rehearsing a statement-import chapter for the demo video (fictional statement, real UI, no provider).
  - **[#104](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/104):**
    - The generic PDF statement reader reads one clearly labelled date.
    - An impossible, unreadable or two-way date, or labelled dates that disagree, stay unknown with the reason.
    - The shared conversion no longer dates undated values the import day; a holding's own date wins.
    - Undated values are flagged "No date" (no bulk confirm) and listed as out of date. Import timestamps stay separate.
  - **[#105](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/105):**
    - "General Obligation" counts only as the whole phrase; a bare "GO" doesn't count.
    - Equity is assumed only for a ticker with a share count and a price that isn't per 100.
    - A row with only a CUSIP or ISIN, or priced per 100, stays unclassified with a review warning.
  - Preview, review and saved holdings agree. No store, backup, readiness or Copilot change. Impact note: [#104 comment](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/104#issuecomment-7042577807).
  - **Behaviour change for review:** CSV, Excel, paste, OCR and OFX imports with no stated date now arrive undated instead of dated today. Follow-ups: [#106](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/106) (those readers ignore a stated date) and [#107](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/107) (no control to set an imported holding's class).
  - Regressions were written first: 26 of 30 failed.
  - Local checks: typecheck, **844 passed / 0 skipped**, eval 100/100/87.5, build.
  - Real-UI re-rehearsal (local build, isolated profiles):
    - six positions, USD 3,667,555.50, Apr 30, 2026 on the account, every holding and the source document, after a reload too;
    - the bond is stored as fixed income; all six unconfirmed;
    - the undated or unclassified variant is flagged and stored unset;
    - 0 console errors, no `/api/` call.
  - **Review follow-up (commit `03c2344`, from the reviewed head `0664b40`):** the two confirmed date-reader findings are fixed.
    - A zero day or month (`00/05/2026`) no longer throws. Like other out-of-range values (`13/13`, `32/05`, `04/31`, `2026-00-10`), it leaves the date unknown with "couldn't be read as a date", and all six positions still import.
    - A labelled value in its own cell (`Statement Date:    04/05/2026`) is now read. If it is two-way, impossible or unreadable, it is reported, and a later `Valuation Date: 2026-04-30` is not chosen instead.
    - A bare header followed by a cell with no digit or month name (`As of    Market Value`) is still ignored.
    - Regressions were written first, for the helper and the real PDF pipeline: 17 of the 21 new tests failed.
    - Local checks: typecheck, **865 passed / 0 skipped**, eval 100/100/87.5, build.
    - Classification, #106, #107 and the removal of import-day dates are unchanged. No browser re-run: the preview's warning path is the same one already rehearsed.
