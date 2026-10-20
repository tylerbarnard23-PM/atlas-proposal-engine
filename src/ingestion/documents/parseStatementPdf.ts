import type { DataQualityIssue, ExtractionResult } from "@/domain/types";
import type { PdfText } from "../pdf/layoutLines";
import { parsePastedText } from "../parsers/parsePastedText";
import { isFinancialPlan, parseFinancialPlan, planToAccounts, reconcile } from "./financialPlan";

// Requires an explicit currency marker next to a number, so profile fields
// ("Retirement Age: 67") and prose don't become holdings.
const CURRENCY_AMOUNT = /(?:[$€£¥]\s?\(?-?\d|\b(?:USD|EUR|GBP|CHF|CAD|JPY|AUD|SGD|HKD)\s?-?\d)/;
const TOTAL_ROW = /^\s*(sub)?total\b/i;

// Turns the text of a PDF into an extraction result: a recognized document
// type gets its dedicated reader, anything else the generic table reader.
export function parseStatementPdf(pdf: PdfText, fileName?: string): ExtractionResult {
  const start = Date.now();
  if (pdf.pages.every((p) => p.join("").trim().length < 20)) {
    return empty(pdf, start, "This PDF has no selectable text, so it's probably a scan. Use the Screenshot / Image tab to read it with OCR.");
  }

  if (isFinancialPlan(pdf)) {
    const plan = parseFinancialPlan(pdf);
    const reconciliation = reconcile(plan.lines, plan.stated);
    const accounts = planToAccounts(plan, reconciliation);
    const warnings: DataQualityIssue[] = [
      {
        code: "CUSTOM_REQUIRES_REVIEW",
        severity: "info",
        message: "This is a financial plan, not an account statement: values are as of the dates shown and some are estimates. Confirm each value before using it in a proposal.",
      },
    ];
    if (reconciliation.status === "mismatch") {
      warnings.push({ code: "CUSTOM_REQUIRES_REVIEW", severity: "critical", message: "The extracted lines don't add up to the totals stated in the plan. Some lines may be missing or misread." });
    }
    return {
      ok: accounts.length > 0,
      accounts,
      warnings,
      extractionMethod: "financial-plan-balance-sheet",
      extractionMs: Date.now() - start,
      documentKind: "financial_plan_lifeview",
      documentTitle: plan.title,
      clientNameDetected: plan.clientName,
      asOfDate: plan.asOfDate,
      pageCount: pdf.pageCount,
      reconciliation,
    };
  }

  // Generic: run the table parser per page, keep only rows with a currency amount.
  const account = parsePastedText(pdf.pages.map((p) => p.join("\n")).join("\n"), fileName);
  account.holdings = account.holdings.filter((h) => {
    const raw = h.fields._line?.raw ?? "";
    return CURRENCY_AMOUNT.test(raw) && !TOTAL_ROW.test(raw) && (h.marketValue ?? 0) !== 0;
  });
  if (account.holdings.length === 0) {
    return empty(pdf, start, `Read ${pdf.pageCount} page(s) but found no holdings table with currency amounts. If this is a statement in a layout Atlas doesn't know yet, try pasting the holdings table into the Paste tab.`);
  }
  return {
    ok: true,
    accounts: [account],
    warnings: [],
    extractionMethod: "pdf-layout-table",
    extractionMs: Date.now() - start,
    documentKind: "statement_table",
    pageCount: pdf.pageCount,
    reconciliation: {
      status: "unavailable",
      assetsExtracted: account.holdings.reduce((s, h) => s + Math.max(0, h.marketValue ?? 0), 0),
      liabilitiesExtracted: 0,
      netWorthExtracted: account.holdings.reduce((s, h) => s + (h.marketValue ?? 0), 0),
      tolerance: 1,
    },
  };
}

function empty(pdf: PdfText, start: number, message: string): ExtractionResult {
  return {
    ok: false,
    accounts: [],
    warnings: [{ code: "LOW_OCR_CONFIDENCE", severity: "warning", message }],
    extractionMethod: "pdf-layout",
    extractionMs: Date.now() - start,
    pageCount: pdf.pageCount,
  };
}
