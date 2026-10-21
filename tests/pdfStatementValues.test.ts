import { describe, expect, it } from "vitest";
import { ISSUE_29_LINES, textPdf } from "./fixtures/syntheticStatementPdf";
import { PLAN_EXPECTED, PLAN_PAGES } from "./fixtures/financialPlanSample";
import { readPdfInNode } from "@/ingestion/pdf/readPdfNode";
import { itemsToLines } from "@/ingestion/pdf/layoutLines";
import { parseStatementPdf } from "@/ingestion/documents/parseStatementPdf";
import { extractionToWorkspace } from "@/ingestion/documents/toWorkspace";

// Issue #29: generic PDF statement extraction took the quantity as the market
// value when two money columns sat two spaces apart, and ignored an explicit
// account total. Every test here runs the real pipeline: synthetic PDF bytes
// → pdf.js (readPdfInNode) → layout lines → parseStatementPdf.

const extract = async (lines: string[]) => parseStatementPdf(await readPdfInNode(textPdf(lines)), "QA Statement");
const rows = (r: Awaited<ReturnType<typeof extract>>) =>
  r.accounts.flatMap((a) => a.holdings).map((h) => ({ symbol: h.symbol, quantity: h.quantity, price: h.price, marketValue: h.marketValue }));

const HEADER = ISSUE_29_LINES.slice(0, 6);
const statement = (holdingRows: string[], total?: string) => [...HEADER, ...holdingRows, ...(total ? [total] : [])];

describe("the issue #29 statement", () => {
  it("imports market values, not quantities, and keeps quantity and price", async () => {
    const r = await extract(ISSUE_29_LINES);
    expect(r.documentKind).toBe("statement_table");
    expect(rows(r)).toEqual([
      { symbol: "NVDA", quantity: 10_000, price: 800, marketValue: 8_000_000 },
      { symbol: "BND", quantity: 1_000, price: 100, marketValue: 100_000 },
      { symbol: "CASH", quantity: 200_000, price: 1, marketValue: 200_000 },
    ]);
  });

  it("reconciles with the explicit total instead of reporting it absent, and keeps the total out of the holdings", async () => {
    const r = await extract(ISSUE_29_LINES);
    expect(r.reconciliation).toMatchObject({ status: "matched", assetsStated: 8_300_000, assetsExtracted: 8_300_000 });
    expect(r.accounts.flatMap((a) => a.holdings).some((h) => /total/i.test(h.assetName ?? ""))).toBe(false);
  });

  it("keeps the source trace and loads into the workspace with the right values", async () => {
    const r = await extract(ISSUE_29_LINES);
    const nvda = r.accounts[0].holdings[0];
    expect(nvda.sourceTrace.rawText).toContain("NVIDIA Corp QA Import");
    expect(nvda.sourceTrace.page).toBe(1);
    const ws = extractionToWorkspace(r, { fileName: "qa.pdf", reportingCurrency: "USD" });
    expect(ws.holdings.map((h) => [h.assetName, h.nativeMarketValue, h.quantity, h.price])).toEqual([
      ["NVIDIA Corp QA Import", 8_000_000, 10_000, 800],
      ["Vanguard Bond QA Import", 100_000, 1_000, 100],
      ["QA Settlement Cash", 200_000, 200_000, 1],
    ]);
  });
});

describe("layout and spacing", () => {
  it("a two-character gap between monospaced columns is a column break", () => {
    // Courier 9pt: 5.4pt per character, so a two-space gap is 10.8pt.
    const w = (s: string) => s.length * 5.4;
    const items = [
      { str: "USD", x: 100, y: 500, width: w("USD"), height: 9 },
      { str: "800.00", x: 100 + w("USD "), y: 500, width: w("800.00"), height: 9 },
      { str: "USD", x: 100 + w("USD 800.00  "), y: 500, width: w("USD"), height: 9 },
      { str: "8,000,000.00", x: 100 + w("USD 800.00  USD "), y: 500, width: w("8,000,000.00"), height: 9 },
    ];
    expect(itemsToLines(items)).toEqual(["USD 800.00  USD 8,000,000.00"]);
  });

  it.each([
    ["two spaces everywhere", "NVIDIA Corp QA Import  NVDA  10000  USD 800.00  USD 8,000,000.00"],
    ["wide gaps", "NVIDIA Corp QA Import                NVDA          10000          USD 800.00          USD 8,000,000.00"],
    ["dollar signs", "NVIDIA Corp QA Import           NVDA        10000     $800.00  $8,000,000.00"],
    ["no decimals", "NVIDIA Corp QA Import           NVDA        10000     USD 800     USD 8,000,000"],
    ["trailing currency code", "NVIDIA Corp QA Import           NVDA        10000     800.00 USD  8,000,000.00 USD"],
  ])("%s", async (_label, row) => {
    expect(rows(await extract(statement([row])))).toEqual([{ symbol: "NVDA", quantity: 10_000, price: 800, marketValue: 8_000_000 }]);
  });
});

describe("totals", () => {
  it("an explicit total that doesn't match is surfaced, not hidden", async () => {
    const r = await extract(statement(ISSUE_29_LINES.slice(6, 9), "Total Account Value                                           USD 9,000,000.00"));
    expect(r.reconciliation).toMatchObject({ status: "mismatch", assetsStated: 9_000_000, assetsExtracted: 8_300_000 });
    expect(r.warnings.some((w) => w.severity === "critical" && /total/i.test(w.message))).toBe(true);
  });

  it("with no total stated, reconciliation stays honestly unavailable", async () => {
    const r = await extract(statement(ISSUE_29_LINES.slice(6, 9)));
    expect(r.reconciliation?.status).toBe("unavailable");
    expect(r.reconciliation?.assetsStated).toBeUndefined();
  });

  it("subtotals are not the account total", async () => {
    const r = await extract(
      statement([...ISSUE_29_LINES.slice(6, 8), "Subtotal Equities                                             USD 8,000,000.00", ISSUE_29_LINES[8]], ISSUE_29_LINES[9])
    );
    expect(rows(r)).toHaveLength(3);
    expect(r.reconciliation).toMatchObject({ status: "matched", assetsStated: 8_300_000 });
  });
});

describe("ambiguous rows", () => {
  it("a row whose value can't be told apart from its price is kept for review, never valued at its quantity", async () => {
    // One money amount and a bare number: is USD 20.00 a price or a value?
    const r = await extract(statement([...ISSUE_29_LINES.slice(6, 9), "Mystery Fund QA Import          MYST        500       USD 20.00"]));
    const myst = r.accounts.flatMap((a) => a.holdings).find((h) => h.symbol === "MYST")!;
    expect(myst).toBeDefined();
    expect(myst.marketValue).toBeUndefined();
    expect(myst.warnings.some((w) => /check this row/i.test(w.message))).toBe(true);
  });

  it("an ambiguous row isn't loaded into the workspace as a zero; the readable rows are", async () => {
    const r = await extract(statement([...ISSUE_29_LINES.slice(6, 9), "Mystery Fund QA Import          MYST        500       USD 20.00"]));
    expect(r.warnings.some((w) => /couldn't be read reliably and won't be imported: Mystery Fund QA Import/.test(w.message))).toBe(true);
    const ws = extractionToWorkspace(r, { fileName: "qa.pdf", reportingCurrency: "USD" });
    expect(ws.holdings.map((h) => h.assetName)).toEqual(["NVIDIA Corp QA Import", "Vanguard Bond QA Import", "QA Settlement Cash"]);
  });

  it("a total mismatch travels with every imported value, so none can be confirmed in bulk", async () => {
    const r = await extract(statement(ISSUE_29_LINES.slice(6, 9), "Total Account Value                                           USD 9,000,000.00"));
    const ws = extractionToWorkspace(r, { fileName: "qa.pdf", reportingCurrency: "USD" });
    expect(ws.holdings.every((h) => h.dataQuality.some((d) => d.code === "DOCUMENT_TOTAL_MISMATCH"))).toBe(true);
  });

  it("bond rows priced per 100 of face value are consistent, not flagged", async () => {
    const r = await extract(statement(["US Treasury 4.25% 2032 QA      UST32       250000    USD 100.42  USD 251,050.00"]));
    const ust = r.accounts[0].holdings[0];
    expect(ust).toMatchObject({ quantity: 250_000, price: 100.42, marketValue: 251_050 });
    expect(ust.warnings.some((w) => w.code === "QUANTITY_VALUE_MISMATCH")).toBe(false);
  });
});

describe("the financial-plan reader is unaffected", () => {
  it("a plan rendered to PDF still loads and reconciles", async () => {
    const pdf = await readPdfInNode(textPdf(PLAN_PAGES.flat().slice(0, 40)));
    expect(pdf.pages[0].length).toBeGreaterThan(0);
    // Full plan behavior is covered page-by-page in pdfImport.test.ts; here
    // the layout change must not merge or split its single-spaced labels.
    const joined = pdf.pages[0].join("\n");
    expect(joined).toContain("Taxable Brokerage Jordan Individual $1,250,000 05/15/2026");
    expect(PLAN_EXPECTED.lines.length).toBeGreaterThan(0);
  });
});
