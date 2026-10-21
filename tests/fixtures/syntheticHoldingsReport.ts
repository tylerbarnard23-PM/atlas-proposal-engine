import { placedTextPdf, type PlacedText } from "./syntheticStatementPdf";

// A synthetic "client review" holdings report, written from scratch with
// fictional names and numbers. It reproduces the structure of the real report
// behind issue #29's second regression (not committed: third-party sample):
// - landscape pages stored as portrait with /Rotate 90 and rotated text;
// - right-aligned numeric columns under stacked, multi-line headers;
// - bold section headings ("Cash", "US", "International") and totals;
// - wrapped security names, a name-only line whose numbers sit on the next
//   line, annotation lines ("Client investment: …"), footnote markers;
// - "*" rows: a balanced fund unbundled across asset classes, with no quantity;
// - a summary table before the details and a "Blended Investment Summary" of
//   the balanced fund after them, neither of which are positions;
// - "Total Portfolio" stated more than once, one cent below the sum of the
//   rows (each row is rounded to the cent).

// Column right edges (display x), as in the real report.
const COL = { quantity: 222, avg: 262, price: 316, cost: 374, value: 445, gain: 515, pct: 749 };
const NAME_X = 36;

type Cells = Partial<Record<keyof typeof COL, string>>;

function header(y: number, section: string): PlacedText[] {
  // Labels set small enough to fit their columns, as in the real report.
  const r = (text: string, x: number, yy: number): PlacedText => ({ text, x, y: yy, align: "right", size: 6 });
  return [
    r("Purchase", COL.avg, y),
    r("Price on", COL.price, y),
    r("price ($) /", COL.avg, y + 9),
    r("06/30/2026", COL.price, y + 9),
    r("Unrealized", COL.gain, y + 9),
    r("% of", COL.pct, y + 9),
    { text: section, x: NAME_X, y: y + 18, bold: true },
    r("Quantity", COL.quantity, y + 18),
    r("Avg Price", COL.avg, y + 18),
    r("($)", COL.price, y + 18),
    r("Cost basis ($)", COL.cost, y + 18),
    r("Market value ($)", COL.value, y + 18),
    r("gain/loss ($)", COL.gain, y + 18),
    r("portfolio", COL.pct, y + 18),
  ];
}

function row(y: number, name: string | null, cells: Cells, bold = false): PlacedText[] {
  const out: PlacedText[] = name ? [{ text: name, x: NAME_X, y, bold }] : [];
  for (const [k, v] of Object.entries(cells)) if (v) out.push({ text: v, x: COL[k as keyof typeof COL], y, align: "right", bold });
  return out;
}

const text = (t: string, y: number, bold = false, x = NAME_X): PlacedText => ({ text: t, x, y, bold });
const pageFooter = (n: number): PlacedText[] => [text(`Report created on: July 01, 2026   - SAMPLE -   Page ${n} of 7`, 520, false, 36)];

const SUMMARY_TOTAL: Cells = { cost: "$650,000.00", value: "$739,501.06", gain: "$89,501.06", pct: "100%" };

export const SYNTHETIC_REPORT_PAGES: { rotate: 90; items: PlacedText[] }[] = [
  // 1. Cover.
  { rotate: 90, items: [text("Client Review", 60, true), text("as of June 30, 2026", 80), text("Prepared for Example Household", 100), ...pageFooter(1)] },
  // 2. Summary table: not positions.
  {
    rotate: 90,
    items: [
      text("Portfolio holdings", 40, true),
      text("Summary of Portfolio Holdings", 60, true),
      { text: "Cost basis ($)", x: COL.cost, y: 100, align: "right", size: 6 },
      { text: "Value on 06/30/2026 ($)", x: COL.value, y: 100, align: "right", size: 6 },
      ...row(115, "A Cash", { cost: "51,000.00", value: "51,100.40" }),
      ...row(127, "B Fixed Income", { cost: "142,000.00", value: "146,034.14" }),
      ...row(139, "C Equity", { cost: "457,000.00", value: "542,366.53" }),
      ...row(151, "Total Portfolio", { cost: "$650,000.00", value: "$739,501.06" }, true),
      ...pageFooter(2),
    ],
  },
  // 3. Details: portfolio total, Cash, Fixed Income US.
  {
    rotate: 90,
    items: [
      text("Portfolio holdings - as of June 30, 2026 (continued)", 30),
      text("Details of portfolio holdings", 45, true),
      { text: "Cost basis ($)", x: COL.cost, y: 70, align: "right", size: 6 },
      { text: "Market value ($)", x: COL.value, y: 70, align: "right", size: 6 },
      { text: "gain/loss ($)", x: COL.gain, y: 70, align: "right", size: 6 },
      ...row(82, "Total Portfolio", SUMMARY_TOTAL, true),
      ...header(100, "Cash"),
      text("Cash", 132, true),
      ...row(144, "EXAMPLE BANK DEPOSIT ACCOUNT", { quantity: "50,000.00", avg: "1.00", price: "1.00", cost: "50,000.00", value: "50,000.00", gain: "0.00", pct: "6.76%" }),
      ...row(156, "* SAMPLE BALANCED FUND", { price: "1.00", cost: "1,000.00", value: "1,100.40", gain: "100.40", pct: "0.15%" }),
      text("CLASS C", 165),
      ...row(178, "Total Cash", { cost: "$51,000.00", value: "$51,100.40", gain: "$100.40", pct: "6.91%" }, true),
      ...header(200, "Fixed Income"),
      text("US", 232, true),
      ...row(244, "CITY OF EXAMPLE GO BOND", { quantity: "100,000.00", avg: "101.00", price: "102.50", cost: "101,000.00", value: "103,333.33", gain: "2,333.33", pct: "13.97%" }),
      text("BE/R/ 4.000 061530 DTD 010120", 253),
      ...row(266, "EXAMPLE INCOME FUND", { quantity: "2,000.00", avg: "10.00", price: "10.50", cost: "20,000.00", value: "21,000.00", gain: "1,000.00", pct: "2.84%" }),
      text("CLASS A", 275),
      text("Client investment: $18,000.00", 284),
      text("Investment return: $3,000.00 (16.7%)", 293),
      ...row(306, "* SAMPLE BALANCED FUND", { cost: "2,000.00", value: "2,200.81", gain: "200.81", pct: "0.30%" }),
      text("CLASS C", 315),
      ...row(328, "Total US", { cost: "$123,000.00", value: "$126,534.14", gain: "$3,534.14", pct: "17.11%" }, true),
      ...pageFooter(3),
    ],
  },
  // 4. Fixed Income International, Equity US (repeated header on a new page).
  {
    rotate: 90,
    items: [
      text("Portfolio holdings - as of June 30, 2026 (continued)", 30),
      ...header(50, "Fixed Income"),
      text("International", 82, true),
      ...row(94, "EXAMPLE GLOBAL BOND FUND", { quantity: "1,500.00", avg: "12.67", price: "13.00", cost: "19,000.00", value: "19,500.00", gain: "500.00", pct: "2.64%" }),
      text("CLASS C", 103),
      ...row(116, "Total International", { cost: "$19,000.00", value: "$19,500.00", gain: "$500.00", pct: "2.64%" }, true),
      ...row(128, "Total Fixed Income", { cost: "$142,000.00", value: "$146,034.14", gain: "$4,034.14", pct: "19.75%" }, true),
      ...header(150, "Equity"),
      text("US", 182, true),
      text("OUTSIDE HOLDING - EXAMPLE TRUST", 194),
      ...row(204, null, { cost: "430,000.00", value: "500,000.00", gain: "70,000.00", pct: "67.61%" }),
      text("LLC", 213),
      text("(1)", 226),
      ...row(238, "EXAMPLE TECH INC CL A", { quantity: "100.00", avg: "200.00", price: "250.00", cost: "20,000.00", value: "25,000.00", gain: "5,000.00", pct: "3.38%" }),
      text("[Outside Account @XX XXXX]", 247),
      ...row(260, "EXAMPLE 529 GROWTH FUND", { quantity: "743.36", avg: "1.00", price: "0.00", cost: "0.00", value: "9,366.33", gain: "0.00", pct: "1.27%" }),
      text("Client investment: $0.00", 269),
      ...row(282, "* SAMPLE BALANCED FUND", { cost: "7,000.00", value: "8,000.20", gain: "1,000.20", pct: "1.08%" }),
      text("CLASS C", 291),
      ...row(304, "Total US", { cost: "$457,000.00", value: "$542,366.53", gain: "$85,366.53", pct: "73.34%" }, true),
      ...row(316, "Total Equity", { cost: "$457,000.00", value: "$542,366.53", gain: "$85,366.53", pct: "73.34%" }, true),
      ...pageFooter(4),
    ],
  },
  // 5. Closing total and footnotes.
  {
    rotate: 90,
    items: [
      text("Portfolio holdings - as of June 30, 2026 (continued)", 30),
      { text: "Cost basis ($)", x: COL.cost, y: 60, align: "right", size: 6 },
      { text: "Market value ($)", x: COL.value, y: 60, align: "right", size: 6 },
      ...row(72, "Total Portfolio", SUMMARY_TOTAL, true),
      text("* Balanced mutual funds are displayed in unbundled view", 90),
      text("(1)", 102),
      text("Assets held at other financial institutions are included in this report.", 114),
      ...pageFooter(5),
    ],
  },
  // 6. Blended summary of the balanced fund: not an additional position.
  {
    rotate: 90,
    items: [
      text("Portfolio holdings - as of June 30, 2026 (continued)", 30),
      text("Blended Investment Summary", 45, true),
      ...header(60, "Balanced mutual funds"),
      ...row(100, "SAMPLE BALANCED FUND CLASS C", { quantity: "1,000.00", avg: "10.00", price: "11.30", cost: "10,000.00", value: "11,301.41", gain: "1,301.41", pct: "1.53%" }),
      ...row(112, "Total Balanced mutual funds", { cost: "$10,000.00", value: "$11,301.41", gain: "$1,301.41", pct: "1.53%" }, true),
      ...pageFooter(6),
    ],
  },
  // 7. Disclosures.
  {
    rotate: 90,
    items: [text("Important information about this report", 40, true), text("Market value includes accrued interest.", 60), ...pageFooter(7)],
  },
];

export const syntheticReportPdf = () => placedTextPdf(SYNTHETIC_REPORT_PAGES);

/** The detailed positions, as the report states them (balanced-fund slices included). */
export const SYNTHETIC_REPORT_POSITIONS = [
  { name: "EXAMPLE BANK DEPOSIT ACCOUNT", section: "Cash", quantity: 50_000, price: 1, costBasis: 50_000, marketValue: 50_000 },
  { name: "SAMPLE BALANCED FUND CLASS C", section: "Cash", quantity: undefined, price: 1, costBasis: 1_000, marketValue: 1_100.4, unbundled: true },
  { name: "CITY OF EXAMPLE GO BOND BE/R/ 4.000 061530 DTD 010120", section: "Fixed Income", quantity: 100_000, price: 102.5, costBasis: 101_000, marketValue: 103_333.33 },
  { name: "EXAMPLE INCOME FUND CLASS A", section: "Fixed Income", quantity: 2_000, price: 10.5, costBasis: 20_000, marketValue: 21_000 },
  { name: "SAMPLE BALANCED FUND CLASS C", section: "Fixed Income", quantity: undefined, price: undefined, costBasis: 2_000, marketValue: 2_200.81, unbundled: true },
  { name: "EXAMPLE GLOBAL BOND FUND CLASS C", section: "Fixed Income", quantity: 1_500, price: 13, costBasis: 19_000, marketValue: 19_500 },
  { name: "OUTSIDE HOLDING - EXAMPLE TRUST LLC", section: "Equity", quantity: undefined, price: undefined, costBasis: 430_000, marketValue: 500_000 },
  { name: "EXAMPLE TECH INC CL A", section: "Equity", quantity: 100, price: 250, costBasis: 20_000, marketValue: 25_000 },
  // Price and cost basis shown as 0.00 mean "not available", not zero.
  { name: "EXAMPLE 529 GROWTH FUND", section: "Equity", quantity: 743.36, price: undefined, costBasis: undefined, marketValue: 9_366.33 },
  { name: "SAMPLE BALANCED FUND CLASS C", section: "Equity", quantity: undefined, price: undefined, costBasis: 7_000, marketValue: 8_000.2, unbundled: true },
];
export const SYNTHETIC_REPORT_STATED_TOTAL = 739_501.06; // rows sum to 739,501.07
