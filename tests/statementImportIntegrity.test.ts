import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExtractionResult } from "@/domain/types";
import { FICTIONAL_STATEMENT_LINES, ISSUE_29_LINES, textPdf } from "./fixtures/syntheticStatementPdf";
import { readPdfInNode } from "@/ingestion/pdf/readPdfNode";
import { parseStatementPdf } from "@/ingestion/documents/parseStatementPdf";
import { extractionToWorkspace } from "@/ingestion/documents/toWorkspace";
import { detectAssetClass } from "@/ingestion/normalizers/detectAssetClass";
import { dataTasks } from "@/engines/dataTasks";
import { holdingsNeedingReview } from "@/engines/complianceEngine";

// Issues #104 (statement date) and #105 (municipal bond as equity), found
// while rehearsing the demo's import chapter. Every statement here runs the
// real pipeline: synthetic PDF bytes → pdf.js → layout lines →
// parseStatementPdf → extractionToWorkspace. Synthetic data only.

const storage = vi.hoisted(() => {
  const data = new Map<string, string>();
  const s = {
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() {
      return data.size;
    },
  };
  (globalThis as { window?: unknown }).window = { localStorage: s };
  return s;
});

const NAME = "Blackwell Taxable Brokerage - FICTIONAL statement 2026-04-30";
const IMPORT_DAY = new Date("2026-11-20T12:00:00Z");
const extract = async (lines: string[], name = NAME) => parseStatementPdf(await readPdfInNode(textPdf(lines, { fontSize: 9, leading: 16 })), name);
const toWorkspace = (r: ExtractionResult) => extractionToWorkspace(r, { fileName: `${NAME}.pdf`, reportingCurrency: "USD", country: "US" });

/** The statement with its date line replaced (or removed, with null). */
const withDateLine = (line: string | null) =>
  FICTIONAL_STATEMENT_LINES.flatMap((l) => (l.startsWith("Statement Date:") ? (line === null ? [] : [line]) : [l]));

/** The statement's header and total around other holding rows. */
const withRows = (rows: string[]) => [...FICTIONAL_STATEMENT_LINES.slice(0, 9), ...rows];

function atImportDay<T>(fn: () => T): T {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(IMPORT_DAY);
  try {
    return fn();
  } finally {
    vi.useRealTimers();
  }
}

afterEach(() => vi.useRealTimers());

const SOURCE = [
  { name: "Apple Inc.", id: "AAPL", type: "ticker", qty: 4_200, price: 224.18, value: 941_556, cls: "equity" },
  { name: "Microsoft Corporation", id: "MSFT", type: "ticker", qty: 1_850, price: 462.73, value: 856_050.5, cls: "equity" },
  { name: "Vanguard Total Stock Market ETF", id: "VTI", type: "ticker", qty: 3_200, price: 286.42, value: 916_544, cls: "equity" },
  { name: "Berkshire Hathaway Class B", id: "BRK.B", type: "ticker", qty: 1_100, price: 471.05, value: 518_155, cls: "equity" },
  { name: "MA State General Obligation 4.0% 2031", id: "574208ZK4", type: "cusip", qty: 250_000, price: 100.42, value: 251_050, cls: "fixed_income" },
  { name: "Cash & Money Market", id: "CASH", type: "ticker", qty: 184_200, price: 1, value: 184_200, cls: "cash" },
];

describe("the fictional six-position statement (#104, #105)", () => {
  it("keeps every name, identifier, quantity, price (bond per 100), value and currency, and matches the stated total", async () => {
    const r = await extract(FICTIONAL_STATEMENT_LINES);
    expect(r.documentKind).toBe("statement_table");
    expect(r.reconciliation).toMatchObject({ status: "matched", currency: "USD", netWorthStated: 3_667_555.5, netWorthExtracted: 3_667_555.5 });
    const ws = atImportDay(() => toWorkspace(r));
    expect(ws.holdings.map((h) => ({ name: h.assetName, id: h.identifier?.value, type: h.identifier?.type, qty: h.quantity, price: h.price, value: h.nativeMarketValue, currency: h.currency }))).toEqual(
      SOURCE.map(({ name, id, type, qty, price, value }) => ({ name, id, type, qty, price, value, currency: "USD" }))
    );
    expect(ws.holdings.reduce((s, h) => s + h.nativeMarketValue, 0)).toBeCloseTo(3_667_555.5, 6);
    expect(ws.holdings.some((h) => h.dataQuality.some((d) => d.code === "QUANTITY_VALUE_MISMATCH"))).toBe(false);
    // Every value arrives unconfirmed and needs the advisor's review.
    expect(ws.holdings.every((h) => h.advisorVerification === "unverified")).toBe(true);
    expect(holdingsNeedingReview(ws.holdings)).toHaveLength(6);
  });

  it("reads the stated date and keeps it on the document, the account and every holding, separate from the import time", async () => {
    const r = await extract(FICTIONAL_STATEMENT_LINES);
    expect(r.asOfDate).toBe("2026-04-30");
    expect(r.accounts[0].statementDate).toBe("2026-04-30");
    const ws = atImportDay(() => toWorkspace(r));
    expect(ws.sourceDocument.statementDate).toBe("2026-04-30");
    expect(ws.accounts[0].asOf).toBe("2026-04-30");
    expect(ws.holdings.map((h) => [h.valuationDate, h.valuationSource.kind, h.valuationSource.asOf])).toEqual(SOURCE.map(() => ["2026-04-30", "statement", "2026-04-30"]));
    // The import's own timestamps record when it was imported, not the valuation date.
    expect(ws.sourceDocument.uploadedAt.slice(0, 10)).toBe("2026-11-20");
    expect(ws.holdings.every((h) => h.createdAt.slice(0, 10) === "2026-11-20")).toBe(true);
  });

  it("classifies the municipal bond as fixed income and the other rows as before", async () => {
    const r = await extract(FICTIONAL_STATEMENT_LINES);
    const ws = atImportDay(() => toWorkspace(r));
    expect(ws.holdings.map((h) => [h.assetName, h.assetClass])).toEqual(SOURCE.map((s) => [s.name, s.cls]));
  });

  it("freshness uses the statement's date: the April 30 values are out of date on November 20, not on May 10", async () => {
    const r = await extract(FICTIONAL_STATEMENT_LINES);
    const ws = atImportDay(() => toWorkspace(r));
    const staleOn = (day: string) => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(day));
      try {
        return dataTasks(ws.holdings).find((t) => t.kind === "stale_value")?.openIds.length ?? 0;
      } finally {
        vi.useRealTimers();
      }
    };
    expect(staleOn("2026-11-20T12:00:00Z")).toBe(6);
    expect(staleOn("2026-05-10T12:00:00Z")).toBe(0);
  });
});

describe("the import preview shows what is saved", () => {
  it("each row's date and class in the preview are the ones the workspace receives", async () => {
    const r = await extract(FICTIONAL_STATEMENT_LINES);
    const React = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { ImportResult } = await import("@/components/import/PdfImport");
    const html = renderToStaticMarkup(React.createElement(ImportResult, { result: r, fileName: `${NAME}.pdf`, onLoad: () => undefined }));
    const cells = [...html.matchAll(/<tr class="border-t[^"]*">(.*?)<\/tr>/g)].map((m) => [...m[1].matchAll(/<td[^>]*>(.*?)<\/td>/g)].map((c) => c[1].replace(/<[^>]+>/g, "")));
    expect(cells.map((c) => [c[0], c[3], c[4]])).toEqual(
      SOURCE.map((s) => [s.name.replace("&", "&amp;"), s.cls === "equity" ? "Equity" : s.cls === "cash" ? "Cash &amp; Equivalents" : "Fixed Income", "Apr 30, 2026"])
    );
    expect(html).toContain("As of Apr 30, 2026");
  });

  it("a row with no date or class is shown as needing review, never blank or assumed", async () => {
    const r = await extract(withDateLine(null).map((l) => l.replace("MA State General Obligation 4.0% 2031", "MA State Obligation 4.0% 2031      ")));
    const React = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { ImportResult } = await import("@/components/import/PdfImport");
    const html = renderToStaticMarkup(React.createElement(ImportResult, { result: r, fileName: "x.pdf", onLoad: () => undefined }));
    expect(html).toContain("Not stated");
    expect(html).toContain("Unclassified: needs review");
    expect(html).not.toContain("balance only");
  });
});

describe("statement dates are read only from a clear label (#104)", () => {
  it.each([
    ["Statement Date: April 30, 2026", "2026-04-30"],
    ["Statement date: Apr 30, 2026", "2026-04-30"],
    ["As of April 30, 2026", "2026-04-30"],
    ["As of: 30 April 2026", "2026-04-30"],
    ["Valuation Date: 2026-04-30", "2026-04-30"],
    ["Statement Date: 04/30/2026", "2026-04-30"],
    ["Statement Date: 30/04/2026", "2026-04-30"],
    ["Positions as of Apr. 30, 2026", "2026-04-30"],
  ])("%s → %s", async (line, iso) => {
    const r = await extract(withDateLine(line));
    expect(r.asOfDate).toBe(iso);
    const ws = atImportDay(() => toWorkspace(r));
    expect(ws.holdings.every((h) => h.valuationDate === iso)).toBe(true);
  });

  it.each([
    ["no date at all", null, /states no date/i],
    ["a date that reads two ways", "Statement Date: 04/05/2026", /April 5 or May 4/],
    ["an impossible date", "Statement Date: February 30, 2026", /couldn't be read as a date/i],
    ["an unreadable date", "Statement Date: Q2 2026", /couldn't be read as a date/i],
  ])("%s stays unknown, is explained and visibly needs review, never today", async (_label, line, why) => {
    const r = await extract(withDateLine(line));
    expect(r.asOfDate).toBeUndefined();
    expect(r.accounts[0].statementDate).toBeUndefined();
    expect(r.warnings.some((w) => w.severity !== "info" && why.test(w.message))).toBe(true);
    const ws = atImportDay(() => toWorkspace(r));
    expect(ws.sourceDocument.statementDate).toBeUndefined();
    expect(ws.accounts[0].asOf).toBeUndefined();
    for (const h of ws.holdings) {
      expect(h.valuationDate).toBeUndefined();
      expect(h.valuationSource.asOf).toBeUndefined();
      expect(h.dataQuality.some((d) => d.code === "MISSING_VALUATION_DATE" && d.severity === "warning")).toBe(true);
    }
    // Undated values are listed as out of date until the advisor records a date.
    expect(atImportDay(() => dataTasks(ws.holdings).find((t) => t.kind === "stale_value")?.openIds)).toHaveLength(6);
  });

  it("two labelled dates that disagree leave the date unknown", async () => {
    const lines = withDateLine("Statement Date: April 30, 2026");
    lines.splice(6, 0, "As of: March 31, 2026");
    const r = await extract(lines);
    expect(r.asOfDate).toBeUndefined();
    expect(r.warnings.some((w) => /April 30, 2026 and March 31, 2026|2026-04-30 and 2026-03-31/.test(w.message))).toBe(true);
  });

  it("the same date stated twice is that date", async () => {
    const lines = withDateLine("Statement Date: April 30, 2026");
    lines.splice(6, 0, "Valuation date: 2026-04-30");
    expect((await extract(lines)).asOfDate).toBe("2026-04-30");
  });

  it("a date that isn't labelled as the statement's own is not used", async () => {
    // A trade or settlement date in prose is not the statement's valuation date.
    const r = await extract(withDateLine("Last trade settled on April 28, 2026; dividends paid May 15, 2026."));
    expect(r.asOfDate).toBeUndefined();
  });

  it("the issue #29 statement keeps its own stated date", async () => {
    const r = parseStatementPdf(await readPdfInNode(textPdf(ISSUE_29_LINES)), "QA");
    expect(r.asOfDate).toBe("2026-10-21");
  });

  it("a holding's own valuation date is more specific than the statement's and is kept", () => {
    const result: ExtractionResult = {
      ok: true,
      extractionMethod: "pdf-layout-table",
      extractionMs: 1,
      warnings: [],
      asOfDate: "2026-04-30",
      accounts: [
        {
          id: "ea1",
          accountName: "A",
          statementDate: "2026-04-30",
          fields: {},
          warnings: [],
          confidence: "medium",
          holdings: [
            { id: "eh1", assetName: "Private fund", marketValue: 100, currency: "USD", valuationDate: "2026-03-31", fields: {}, warnings: [], confidence: "medium", sourceTrace: { sourceType: "pdf_text" }, status: "extracted" },
            { id: "eh2", assetName: "Listed", symbol: "ABC", quantity: 1, price: 100, marketValue: 100, currency: "USD", fields: {}, warnings: [], confidence: "medium", sourceTrace: { sourceType: "pdf_text" }, status: "extracted" },
          ],
        },
      ],
    };
    const ws = atImportDay(() => extractionToWorkspace(result, { fileName: "x.pdf", reportingCurrency: "USD" }));
    expect(ws.holdings.map((h) => [h.valuationDate, h.valuationSource.asOf])).toEqual([
      ["2026-03-31", "2026-03-31"],
      ["2026-04-30", "2026-04-30"],
    ]);
    expect(ws.accounts[0].asOf).toBe("2026-04-30");
  });

  it("other imports with no date are no longer dated the import day", () => {
    const result: ExtractionResult = {
      ok: true,
      extractionMethod: "papaparse",
      extractionMs: 1,
      warnings: [],
      accounts: [{ id: "ea1", accountName: "CSV", fields: {}, warnings: [], confidence: "medium", holdings: [{ id: "eh1", assetName: "MICROSOFT CORP", symbol: "MSFT", quantity: 10, price: 400, marketValue: 4_000, currency: "USD", fields: {}, warnings: [], confidence: "medium", sourceTrace: { sourceType: "csv" }, status: "extracted" }] }],
    };
    const ws = atImportDay(() => extractionToWorkspace(result, { fileName: "positions.csv", reportingCurrency: "USD", sourceType: "csv" }));
    expect(ws.holdings[0].valuationDate).toBeUndefined();
    expect(ws.holdings[0].dataQuality.some((d) => d.code === "MISSING_VALUATION_DATE")).toBe(true);
  });
});

describe("asset classes need clear evidence (#105)", () => {
  const row = (name: string, id: string, qty: string, price: string, value: string) =>
    `${name.padEnd(39)}${id.padEnd(12)}${qty.padEnd(10)}${price.padEnd(12)}${value}`;
  const one = async (r: string) => {
    const result = await extract(withRows([r]));
    return atImportDay(() => toWorkspace(result)).holdings[0];
  };

  it("a CUSIP alone is not evidence of a bond or of a share: the row stays unclassified for review", async () => {
    const h = await one(row("Northwind Holdings Class A", "66987V109", "500", "USD 50.00", "USD 25,000.00"));
    expect(h.identifier?.type).toBe("cusip");
    expect(h.assetClass).toBe("custom");
    expect(h.dataQuality.some((d) => d.code === "MISSING_ASSET_CLASS")).toBe(true);
  });

  it("a row priced per 100 of face value isn't assumed to be a share", async () => {
    const h = await one(row("Northwind Capital 5.25% 2029", "NWC29", "100000", "USD 99.50", "USD 99,500.00"));
    expect(h).toMatchObject({ quantity: 100_000, price: 99.5, nativeMarketValue: 99_500 });
    expect(h.assetClass).toBe("custom");
  });

  it("a bare GO is not evidence; the whole phrase General Obligation is", () => {
    expect(detectAssetClass("NY CITY GO 5% 2030")).toBeUndefined();
    expect(detectAssetClass("GOGO INC")).toBeUndefined();
    expect(detectAssetClass("GOOD WORKS GROWTH ETF")).toBe("equity");
    expect(detectAssetClass("MA State General Obligation 4.0% 2031")).toBe("fixed_income");
  });

  it("a ticker with a share count is still a listed equity, and named bonds stay fixed income", async () => {
    expect((await one(row("Gogo Inc.", "GOGO", "100", "USD 12.00", "USD 1,200.00"))).assetClass).toBe("equity");
    const ust = await one(row("US Treasury 4.25% 2032 QA", "UST32", "250000", "USD 100.42", "USD 251,050.00"));
    expect(ust).toMatchObject({ assetClass: "fixed_income", quantity: 250_000, price: 100.42, nativeMarketValue: 251_050 });
  });
});

describe("dates and classes survive confirmation, backup and reload", () => {
  beforeEach(() => {
    vi.resetModules();
    storage.clear();
  });

  async function load() {
    const store = await import("@/store/useStore");
    const backup = await import("@/engines/workspaceBackup");
    const { DISCLOSURE_LIBRARY } = await import("@/domain/disclosureLibrary");
    return { ...store, ...backup, DISCLOSURE_LIBRARY };
  }

  it("confirming keeps the statement date; confirming an undated value leaves it undated", async () => {
    const m = await load();
    const dated = atImportDay(() => toWorkspace(r1));
    const undated = atImportDay(() => toWorkspace(r2));
    m.useAtlasStore.getState().loadImportedEngagement(dated);
    m.useAtlasStore.getState().addImportedToEngagement(undated);
    const ids = m.useAtlasStore.getState().holdings.map((h) => h.id);
    atImportDay(() => m.useAtlasStore.getState().setHoldingsVerification(ids, "advisor_approved"));
    const hs = m.useAtlasStore.getState().holdings;
    expect(hs.filter((h) => h.accountId === dated.accounts[0].id).map((h) => h.valuationDate)).toEqual(SOURCE.map(() => "2026-04-30"));
    expect(hs.filter((h) => h.accountId === undated.accounts[0].id).every((h) => h.valuationDate === undefined && h.valuationSource.asOf === undefined)).toBe(true);
  });

  it("export, restore and reload keep the dates and classes exactly", async () => {
    const m = await load();
    m.useAtlasStore.getState().loadImportedEngagement(atImportDay(() => toWorkspace(r1)));
    m.useAtlasStore.getState().addImportedToEngagement(atImportDay(() => toWorkspace(r2)));
    const before = m.useAtlasStore.getState();
    const pick = (s: typeof before) => ({
      accounts: s.accounts.map((a) => [a.name, a.asOf ?? null]),
      holdings: s.holdings.map((h) => [h.assetName, h.assetClass, h.valuationDate ?? null, h.valuationSource.asOf ?? null, h.advisorVerification]),
      documents: s.sourceDocuments.map((d) => [d.statementDate ?? null]),
    });
    const ids = { disclosureIds: m.DISCLOSURE_LIBRARY.map((d) => d.id) };
    const exported = m.exportBackup(before, IMPORT_DAY, ids);
    if (!exported.ok) throw new Error(exported.errors.join("; "));
    const parsed = m.parseBackup(exported.text, ids);
    if (!parsed.ok) throw new Error(parsed.errors.join("; "));
    m.useAtlasStore.getState().startNewClient();
    expect(m.useAtlasStore.getState().restoreWorkspace(m.restoredState(parsed.backup, { advisor: before.advisor, disclosures: m.DISCLOSURE_LIBRARY }, { replaceFirm: false }))).toEqual({ ok: true });
    const restored = m.useAtlasStore.getState();
    expect(pick(restored)).toEqual(pick(before));
    vi.resetModules();
    const m2 = await load();
    await m2.useAtlasStore.persist.rehydrate();
    expect(pick(m2.useAtlasStore.getState())).toEqual(pick(before));
    expect(pick(before).holdings.find((h) => h[0] === "MA State General Obligation 4.0% 2031")?.[1]).toBe("fixed_income");
  });

  let r1: ExtractionResult;
  let r2: ExtractionResult;
  beforeEach(async () => {
    r1 = await extract(FICTIONAL_STATEMENT_LINES);
    r2 = await extract(withDateLine(null), "Undated");
  });
});
