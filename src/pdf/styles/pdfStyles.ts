// Inline CSS used by the proposal print template. Kept self-contained so it can be
// injected directly into the rendered HTML and rendered identically by Puppeteer.

export const PDF_BASE_CSS = `
  :root {
    --ink-900: #11151E;
    --ink-700: #2B3142;
    --ink-500: #566077;
    --ink-300: #A4ADBD;
    --ink-100: #E7EAEF;
    --ink-50: #F5F6F8;
    --navy-900: #0A1628;
    --navy-700: #172F52;
    --navy-500: #2A538E;
    --gold-500: #947629;
    --gold-300: #D2B45A;
    --positive: #2E7D4F;
    --negative: #9B2C2C;
    --paper: #FFFFFF;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: var(--paper); color: var(--ink-900); -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, "Helvetica Neue", Arial, sans-serif;
    font-size: 10.5pt;
    line-height: 1.5;
    font-feature-settings: "tnum";
  }
  .pdf-cover {
    height: 11in; width: 8.5in;
    padding: 0.9in 0.75in;
    background:
      radial-gradient(circle at 80% 0%, rgba(212,180,90,0.18), transparent 45%),
      linear-gradient(135deg, var(--navy-900) 0%, var(--navy-700) 60%, var(--navy-500) 100%);
    color: white;
    display: flex; flex-direction: column; justify-content: space-between;
    page-break-after: always;
    break-after: page;
    position: relative;
  }
  .pdf-cover::after {
    content: "";
    position: absolute; left: 0.75in; right: 0.75in; top: 4.4in;
    height: 1px; background: rgba(255,255,255,0.18);
  }
  .pdf-page {
    width: 8.5in; min-height: 11in;
    padding: 0.6in 0.55in 0.7in 0.55in;
    page-break-after: always;
    break-after: page;
    position: relative;
  }
  .pdf-page:last-child { page-break-after: auto; break-after: auto; }
  h1.pdf-title { font-family: Georgia, "Times New Roman", serif; font-weight: 400; font-size: 32pt; line-height: 1.1; margin: 0; letter-spacing: -0.01em; }
  h2.pdf-section { font-family: Georgia, "Times New Roman", serif; font-weight: 400; font-size: 22pt; line-height: 1.15; margin: 0 0 0.18in; color: var(--ink-900); }
  .pdf-eyebrow { font-size: 8pt; text-transform: uppercase; letter-spacing: 0.16em; color: var(--gold-500); font-weight: 600; }
  .pdf-eyebrow.on-dark { color: var(--gold-300); }
  .pdf-cover-eyebrow { color: rgba(255,255,255,0.7); font-size: 9pt; text-transform: uppercase; letter-spacing: 0.18em; font-weight: 600; }
  .pdf-cover-meta { font-size: 9pt; color: rgba(255,255,255,0.85); }
  .pdf-cover-firm { font-family: Georgia, "Times New Roman", serif; font-size: 14pt; color: rgba(255,255,255,0.92); letter-spacing: 0.02em; }
  .pdf-disclaimer { font-size: 7.5pt; color: rgba(255,255,255,0.65); line-height: 1.5; max-width: 4.5in; }
  .pdf-headerline { display:flex; justify-content: space-between; align-items: baseline; padding-bottom: 8pt; margin-bottom: 16pt; border-bottom: 1px solid var(--ink-100); }
  .pdf-headerline .left { font-family: Georgia, serif; font-size: 11pt; }
  .pdf-headerline .right { font-size: 8pt; color: var(--ink-500); text-transform: uppercase; letter-spacing: 0.14em; }
  .pdf-footer {
    position: absolute; left: 0.55in; right: 0.55in; bottom: 0.35in;
    display:flex; justify-content: space-between; font-size: 7.5pt; color: var(--ink-500);
    border-top: 1px solid var(--ink-100); padding-top: 6pt;
  }
  .pdf-grid-2 { display:grid; grid-template-columns: 1fr 1fr; gap: 16pt; }
  .pdf-grid-3 { display:grid; grid-template-columns: 1fr 1fr 1fr; gap: 12pt; }
  .pdf-grid-4 { display:grid; grid-template-columns: repeat(4, 1fr); gap: 12pt; }
  .pdf-card { border: 1px solid var(--ink-100); border-radius: 6pt; padding: 12pt; break-inside: avoid; page-break-inside: avoid; }
  .pdf-stat-label { font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.14em; color: var(--ink-500); }
  .pdf-stat-value { font-family: Georgia, serif; font-size: 18pt; line-height: 1; margin-top: 4pt; }
  .pdf-stat-hint { font-size: 8pt; color: var(--ink-500); margin-top: 4pt; }
  table.pdf-table { width: 100%; border-collapse: collapse; font-size: 9pt; }
  table.pdf-table th { text-align: left; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.14em; color: var(--ink-500); padding: 6pt 6pt; border-bottom: 1px solid var(--ink-100); font-weight: 600; }
  table.pdf-table td { padding: 6pt 6pt; border-bottom: 1px solid var(--ink-100); vertical-align: top; }
  table.pdf-table .right { text-align: right; }
  table.pdf-table tbody tr:nth-child(odd) td { background: #FAFBFD; }
  table.pdf-table tr { break-inside: avoid; page-break-inside: avoid; }
  .pdf-allocation-row { display:flex; align-items: center; gap: 8pt; padding: 4pt 0; border-bottom: 1px solid var(--ink-100); break-inside: avoid; }
  .pdf-allocation-row .label { width: 1.6in; font-size: 9pt; color: var(--ink-700); }
  .pdf-allocation-row .bar { flex:1; height: 6pt; background: var(--ink-50); border-radius: 4pt; overflow: hidden; }
  .pdf-allocation-row .bar-fill { height: 100%; background: var(--navy-700); }
  .pdf-allocation-row .pct { width: 0.55in; text-align: right; font-size: 9pt; color: var(--ink-700); }
  .pdf-allocation-row .val { width: 1in; text-align: right; font-size: 9pt; color: var(--ink-500); }
  .pdf-pill { display: inline-block; padding: 2pt 6pt; border-radius: 999pt; font-size: 7.5pt; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; }
  .pdf-pill.gold { background: #FAF6EC; color: var(--gold-500); border: 1px solid #E2CD8B; }
  .pdf-pill.navy { background: #EAF0F9; color: var(--navy-700); border: 1px solid #CFDCEE; }
  .pdf-pill.warn { background: #FBF5E8; color: #7B5B0F; border: 1px solid #E2CD8B; }
  .pdf-pill.neg  { background: #FBEFEF; color: var(--negative); border: 1px solid #F0C7C7; }
  .pdf-pill.pos  { background: #EFF8F1; color: var(--positive); border: 1px solid #B8DCC2; }
  .pdf-pill.neutral { background: #EEF0F4; color: var(--ink-700); border: 1px solid var(--ink-100); }
  .pdf-disclosure { font-size: 8pt; color: var(--ink-700); line-height: 1.55; margin-bottom: 9pt; break-inside: avoid; }
  .pdf-disclosure h4 { font-size: 9pt; margin: 0 0 3pt; color: var(--ink-900); font-weight: 600; }
  .pdf-rec { padding: 10pt 0; border-bottom: 1px solid var(--ink-100); break-inside: avoid; }
  .pdf-rec h4 { font-family: Georgia, serif; font-weight: 400; font-size: 13pt; margin: 0 0 4pt; color: var(--ink-900); }
  .pdf-rec p { margin: 4pt 0; }
  .pdf-rec .meta { font-size: 8pt; color: var(--ink-500); }
  .pdf-watermark {
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-28deg);
    font-family: Georgia, serif; font-size: 110pt; color: rgba(212,180,90,0.10); font-weight: 700; letter-spacing: 0.1em;
    z-index: 0; pointer-events: none; user-select: none;
  }
  .pdf-section-eyebrow {
    display:flex; justify-content: space-between; align-items: center; margin-bottom: 6pt;
  }
  .pdf-text { font-size: 10pt; color: var(--ink-700); line-height: 1.55; }
  .pdf-text p { margin: 0 0 8pt; }
  .pdf-kv { display:grid; grid-template-columns: 1.4in 1fr; gap: 4pt 12pt; font-size: 9pt; }
  .pdf-kv dt { color: var(--ink-500); }
  .pdf-kv dd { margin: 0; color: var(--ink-900); }
  .pdf-summary-box { background: #FAFBFD; border-left: 3pt solid var(--gold-500); padding: 12pt; margin-bottom: 14pt; font-size: 9.5pt; color: var(--ink-800); break-inside: avoid; page-break-inside: avoid; }
  .pdf-source-tag { font-size: 7.5pt; color: var(--ink-500); }
`;
