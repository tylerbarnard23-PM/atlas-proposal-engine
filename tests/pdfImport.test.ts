import { describe, expect, it } from "vitest";
import { itemsToLines, squash } from "@/ingestion/pdf/layoutLines";
import { isFinancialPlan, parseFinancialPlan, reconcile } from "@/ingestion/documents/financialPlan";
import { parseStatementPdf } from "@/ingestion/documents/parseStatementPdf";
import { extractionToWorkspace } from "@/ingestion/documents/toWorkspace";
import { PLAN_EXPECTED, PLAN_PAGES, PLAN_PDF } from "./fixtures/financialPlanSample";

describe("layout lines", () => {
  it("groups fragments by baseline, orders them left to right, and keeps column gaps", () => {
    const lines = itemsToLines([
      { str: "$2,197,920", x: 400, y: 700, width: 50, height: 10 },
      { str: "Intel 401(k)", x: 50, y: 700.8, width: 60, height: 10 },
      { str: "Header", x: 50, y: 760, width: 40, height: 10 },
    ]);
    expect(lines).toEqual(["Header", "Intel 401(k)  $2,197,920"]);
    expect(squash(lines[1])).toBe("Intel 401(k) $2,197,920");
  });
});

describe("financial plan reader", () => {
  const result = parseStatementPdf(PLAN_PDF, "plan");

  it("recognizes the document as a financial plan", () => {
    expect(isFinancialPlan(PLAN_PDF)).toBe(true);
    expect(result.documentKind).toBe("financial_plan_lifeview");
    expect(result.clientNameDetected).toBe(PLAN_EXPECTED.clientName);
    expect(result.asOfDate).toBe(PLAN_EXPECTED.asOfDate);
  });

  it("reads every Balance Sheet line, including the page that omits the ASSETS heading", () => {
    const got = result.accounts.map((a) => [a.accountName, a.holdings[0].marketValue]);
    expect(got).toEqual(PLAN_EXPECTED.lines.map((l) => [l.name, l.value]));
  });

  it("reconciles to the plan's own totals", () => {
    expect(result.reconciliation).toMatchObject({
      status: "matched",
      assetsExtracted: PLAN_EXPECTED.assets,
      liabilitiesExtracted: PLAN_EXPECTED.liabilities,
      netWorthExtracted: PLAN_EXPECTED.netWorth,
    });
  });

  it("classifies lines and picks up as-of dates from the Resource Summary", () => {
    for (const exp of PLAN_EXPECTED.lines) {
      const acct = result.accounts.find((a) => a.accountName === exp.name)!;
      expect(acct.accountType, exp.name).toBe(exp.accountType);
      expect(acct.holdings[0].assetClass, exp.name).toBe(exp.assetClass);
      if ("asOf" in exp) expect(acct.holdings[0].valuationDate, exp.name).toBe(exp.asOf);
    }
  });

  it("doesn't take a loan's start date as its valuation date", () => {
    const mortgage = result.accounts.find((a) => a.accountName === "Home Mortgage")!;
    expect(mortgage.holdings[0].valuationDate).toBe(PLAN_EXPECTED.asOfDate);
  });

  it("flags accounts imported as a single balance", () => {
    const brokerage = result.accounts.find((a) => a.accountName === "Taxable Brokerage")!;
    expect(brokerage.holdings[0].warnings.some((w) => /only this account's balance/.test(w.message))).toBe(true);
  });

  it("reports a mismatch when a line is missing", () => {
    const pages = PLAN_PAGES.map((p) => p.filter((l) => !l.startsWith("Everyday Checking  $")));
    const plan = parseFinancialPlan({ pageCount: pages.length, pages });
    const rec = reconcile(plan.lines, plan.stated);
    expect(rec.status).toBe("mismatch");
    expect(rec.assetsStated! - rec.assetsExtracted).toBe(85_000);
  });
});

describe("generic PDF reader", () => {
  it("ignores profile fields and prose, keeping only rows with currency amounts", () => {
    const pdf = {
      pageCount: 1,
      pages: [[
        "Retirement Age:  67",
        "Child 1  -50",
        "Employment Income:  400000",
        "Symbol  Description  Quantity  Market Value",
        "AAPL  Apple Inc.  100  $22,418.00",
        "MSFT  Microsoft Corporation  50  $23,136.50",
        "Total  $45,554.50",
      ]],
    };
    const result = parseStatementPdf(pdf, "Brokerage");
    expect(result.documentKind).toBe("statement_table");
    expect(result.accounts[0].holdings.map((h) => [h.symbol, h.marketValue])).toEqual([
      ["AAPL", 22418],
      ["MSFT", 23136.5],
    ]);
  });

  it("explains a scanned PDF instead of returning junk", () => {
    const result = parseStatementPdf({ pageCount: 3, pages: [[], [""], ["  "]] });
    expect(result.ok).toBe(false);
    expect(result.warnings[0].message).toMatch(/scan/);
  });
});

describe("loading into the workspace", () => {
  const result = parseStatementPdf(PLAN_PDF, "plan");
  const imported = extractionToWorkspace(result, { fileName: "plan.pdf", reportingCurrency: "USD", country: "US" });

  it("creates one account per line, with every value unconfirmed", () => {
    expect(imported.accounts).toHaveLength(PLAN_EXPECTED.lines.length);
    expect(imported.holdings).toHaveLength(PLAN_EXPECTED.lines.length);
    expect(imported.holdings.every((h) => h.advisorVerification === "unverified")).toBe(true);
    expect(imported.clientName).toBe(PLAN_EXPECTED.clientName);
  });

  it("keeps liabilities negative and flagged, in liability accounts", () => {
    const loans = imported.holdings.filter((h) => h.isLiability);
    expect(loans.map((h) => h.nativeMarketValue).sort()).toEqual([-410_000, -60_000]);
    for (const h of loans) expect(imported.accounts.find((a) => a.id === h.accountId)?.isLiabilityAccount).toBe(true);
  });

  it("links every holding to the source document for the audit trail", () => {
    expect(imported.holdings.every((h) => h.sourceTrace?.sourceDocumentId === imported.sourceDocument.id)).toBe(true);
    expect(imported.sourceDocument.extractionConfidence).toBe("high");
  });

  it("loads as a new client and keeps the firm", async () => {
    const { useAtlasStore } = await import("@/store/useStore");
    const s = useAtlasStore.getState();
    s.setAdvisor({ firmName: "Cedar Ridge Advisors" });
    s.loadImportedEngagement(imported);
    const after = useAtlasStore.getState();
    expect(after.advisor.firmName).toBe("Cedar Ridge Advisors");
    expect(after.client.fullName).toBe(PLAN_EXPECTED.clientName);
    expect(after.accounts).toHaveLength(PLAN_EXPECTED.lines.length);
    expect(after.recommendations).toHaveLength(0);
    expect(after.sourceDocuments[0].id).toBe(imported.sourceDocument.id);
  });
});
