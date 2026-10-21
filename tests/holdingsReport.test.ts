import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readPdfInNode } from "@/ingestion/pdf/readPdfNode";
import { parseStatementPdf } from "@/ingestion/documents/parseStatementPdf";
import { extractionToWorkspace } from "@/ingestion/documents/toWorkspace";
import { placedTextPdf } from "./fixtures/syntheticStatementPdf";
import {
  SYNTHETIC_REPORT_PAGES,
  SYNTHETIC_REPORT_POSITIONS,
  SYNTHETIC_REPORT_STATED_TOTAL,
  syntheticReportPdf,
} from "./fixtures/syntheticHoldingsReport";

// Holdings reports laid out as rotated tables (issue #29, second regression).
// Every test runs the real pipeline from PDF bytes: pdf.js → rotation-aware
// positions → layout → parseStatementPdf → extractionToWorkspace.

const extract = async (bytes: Uint8Array) => parseStatementPdf(await readPdfInNode(bytes), "Report");
const positions = (r: Awaited<ReturnType<typeof extract>>) => r.accounts.flatMap((a) => a.holdings);

describe("synthetic rotated holdings report", () => {
  it("reads rotated pages as rows, not columns", async () => {
    const pdf = await readPdfInNode(syntheticReportPdf());
    expect(pdf.pages[2].some((l) => /^EXAMPLE BANK DEPOSIT ACCOUNT\s+50,000\.00/.test(l))).toBe(true);
  });

  it("extracts exactly the detailed positions, by the market-value column", async () => {
    const r = await extract(syntheticReportPdf());
    expect(r.documentKind).toBe("holdings_report");
    expect(
      positions(r).map((h) => ({ name: h.assetName, quantity: h.quantity, price: h.price, costBasis: h.costBasis, marketValue: h.marketValue }))
    ).toEqual(SYNTHETIC_REPORT_POSITIONS.map(({ name, quantity, price, costBasis, marketValue }) => ({ name, quantity, price, costBasis, marketValue })));
  });

  it("excludes headings, the summary table, subtotals, repeated totals, footnotes and the blended summary", async () => {
    const names = positions(await extract(syntheticReportPdf())).map((h) => h.assetName ?? "");
    expect(names.some((n) => /total|summary|^[A-C] |^\(1\)|client investment|blended|balanced mutual funds$/i.test(n))).toBe(false);
    // The balanced fund appears only as its three unbundled slices, never as the blended line.
    expect(names.filter((n) => n.startsWith("SAMPLE BALANCED FUND"))).toHaveLength(3);
  });

  it("keeps section, date, currency, page and the unbundled-fund note", async () => {
    const ps = positions(await extract(syntheticReportPdf()));
    expect(ps.map((h) => h.assetClass)).toEqual(["cash", "cash", "fixed_income", "fixed_income", "fixed_income", "fixed_income", "equity", "equity", "equity", "equity"]);
    expect(ps.every((h) => h.currency === "USD" && h.valuationDate === "2026-06-30")).toBe(true);
    expect(ps.map((h) => h.sourceTrace.page)).toEqual([3, 3, 3, 3, 3, 4, 4, 4, 4, 4]);
    expect(ps.filter((h) => /unbundled/i.test(h.notes ?? "")).map((h) => h.marketValue)).toEqual([1_100.4, 2_200.81, 8_000.2]);
    expect(ps.every((h) => !h.symbol && !h.identifier)).toBe(true); // none in the document; none invented
  });

  it("reconciles with the stated total within a justified rounding tolerance, without a balancing line", async () => {
    const r = await extract(syntheticReportPdf());
    expect(r.reconciliation).toMatchObject({ status: "matched", assetsStated: SYNTHETIC_REPORT_STATED_TOTAL, currency: "USD" });
    expect(r.reconciliation!.netWorthExtracted).toBeCloseTo(739_501.07, 2);
    // 10 rows each rounded to the cent: at most 10 × $0.005.
    expect(r.reconciliation!.tolerance).toBeCloseTo(0.05, 9);
    expect(positions(r)).toHaveLength(SYNTHETIC_REPORT_POSITIONS.length);
  });

  it("a missing position is a mismatch, not a forced match", async () => {
    const pages = structuredClone(SYNTHETIC_REPORT_PAGES);
    // Drop the outside holding's numbers (the $500,000 row).
    pages[3].items = pages[3].items.filter((i) => !(i.y === 204));
    const r = await extract(placedTextPdf(pages));
    expect(r.reconciliation).toMatchObject({ status: "mismatch", assetsStated: SYNTHETIC_REPORT_STATED_TOTAL });
    expect(r.reconciliation!.netWorthExtracted).toBeCloseTo(239_501.07, 2);
    expect(positions(r).some((h) => h.marketValue === 500_000 || /balanc(ing|e) /i.test(h.assetName ?? ""))).toBe(false);
  });

  it("loads into the workspace with the document's values", async () => {
    const ws = extractionToWorkspace(await extract(syntheticReportPdf()), { fileName: "report.pdf", reportingCurrency: "USD" });
    expect(ws.holdings.reduce((s, h) => s + h.nativeMarketValue, 0)).toBeCloseTo(739_501.07, 2);
    expect(ws.holdings.find((h) => h.assetName === "EXAMPLE 529 GROWTH FUND")).toMatchObject({ quantity: 743.36, price: undefined, costBasis: undefined });
  });
});

// The real report: run when the PDF is available locally. It's a third-party
// sample and isn't committed; put it at tests/fixtures/private/ (git-ignored)
// or point ATLAS_PRIVATE_FIXTURES at its folder.
const REAL = join(process.env.ATLAS_PRIVATE_FIXTURES ?? "tests/fixtures/private", "Portfolio_Holdings_Report_Sample.pdf");
const realIt = existsSync(REAL) ? it : it.skip;

// Market values of the 68 detailed positions, in document order, transcribed
// from the report's pages 3–9 and checked against its section totals.
const REAL_VALUES = [
  179478.88, 6681.39, 17544.77, 6648.41,
  137466.25, 98301.6, 109286.33, 141244.03, 9366.33, 138366.6,
  842904.37, 84605.63, 87819.25, 54454.33, 145660.14, 179291, 141865.56, 170657.5, 66780.33, 170199.83, 180365.17, 170453.13, 46427.51, 109980.67, 107224.78, 160878.5,
  68827, 145258.42, 81848.83, 56461.66, 160566.38, 27372.81, 116941.5, 153732.17, 157782.63, 146100.14, 122498.11, 17091.92, 51228.95, 3.13, 14507.75, 680.17,
  82749.57, 34.44, 134327.82, 557.52,
  4489684.7, 29368.3, 19015.96, 17410.64, 247823.43, 121961, 54480, 10519.87, 24645.7, 7788.56,
  221555.27, 10966.92, 43818.1,
  17474.67, 12351.49, 23138.12, 10018.6,
  1718.88, 4326.11, 2182.68, 17091.46, 158330.07,
];

describe("real holdings report (local PDF)", () => {
  realIt("extracts the 68 detailed positions and reconciles to the stated $10,648,193.73", async () => {
    const r = await extract(new Uint8Array(readFileSync(REAL)));
    const ps = positions(r);
    expect(ps.map((h) => h.marketValue)).toEqual(REAL_VALUES);
    expect(r.reconciliation).toMatchObject({ status: "matched", assetsStated: 10_648_193.73, currency: "USD" });
    expect(r.reconciliation!.netWorthExtracted).toBeCloseTo(10_648_193.74, 2); // one cent of per-row rounding
    expect(r.reconciliation!.tolerance).toBeCloseTo(68 * 0.005, 9);
    expect(ps.some((h) => /cost basis|income \(\$\)|unrealized|gain\/loss|total|summary/i.test(h.assetName ?? ""))).toBe(false);
  });

  realIt("keeps names, quantities, prices, dates and pages; treats 0.00 price/cost as unavailable", async () => {
    const ps = positions(await extract(new Uint8Array(readFileSync(REAL))));
    const by = (name: string) => ps.find((h) => h.assetName?.startsWith(name))!;
    expect(by("UBS BANK USA DEPOSIT ACCOUNT")).toMatchObject({ quantity: 179_478.88, price: 1, marketValue: 179_478.88, assetClass: "cash" });
    expect(by("GOOGLE INC CL A")).toMatchObject({ quantity: 100, price: 1_219.61, marketValue: 121_961, assetClass: "equity" });
    expect(by("XX XXXXX - JACQUELINE BIANCO")).toMatchObject({ marketValue: 4_489_684.7, quantity: undefined });
    expect(by("XX XXXXX - JACQUELINE BIANCO").assetName).toContain("LCC");
    expect(by("COLLEGE AMERICA 529 AMERICAN")).toMatchObject({ quantity: 842.95, price: undefined, costBasis: undefined, marketValue: 29_368.3 });
    expect(by("JOHN HANCOCK ANNUITY")).toMatchObject({ marketValue: 158_330.07, assetClass: "insurance" });
    expect(ps.every((h) => h.valuationDate === "2014-03-06" && h.currency === "USD" && h.sourceTrace.page! >= 3 && h.sourceTrace.page! <= 9)).toBe(true);
    // Balanced funds: unbundled slices only, never the blended summary lines.
    expect(ps.filter((h) => h.assetName?.startsWith("FIRST EAGLE GLOBAL FUND")).map((h) => h.marketValue)).toEqual([6681.39, 3.13, 34.44, 10519.87, 12351.49, 1718.88]);
    expect(ps.some((h) => h.marketValue === 31_309.2 || h.marketValue === 277_675.42)).toBe(false);
  });
});
