import type { DataQualityIssue, DocumentKind, ExtractionResult } from "@/domain/types";
import type { PdfText } from "../pdf/layoutLines";
import { moneyAmounts, parsePastedText } from "../parsers/parsePastedText";
import { detectCurrency } from "../normalizers/detectCurrency";
import { isFinancialPlan, parseFinancialPlan, planToAccounts, reconcile } from "./financialPlan";
import { ASSET_CLASS_LABELS } from "@/domain/assetTaxonomy";

// Requires an explicit currency marker next to a number, so profile fields
// ("Retirement Age: 67") and prose don't become holdings.
const CURRENCY_AMOUNT = /(?:[$€£¥]\s?\(?-?\d|\b(?:USD|EUR|GBP|CHF|CAD|JPY|AUD|SGD|HKD)\s*-?\d|\d\s?(?:USD|EUR|GBP|CHF|CAD|JPY|AUD|SGD|HKD)\b)/;
const TOTAL_ROW = /^\s*(sub)?total\b/i;
// The statement's own account total, e.g. "Total Account Value  USD 8,300,000.00".
// Subtotals ("Subtotal Equities") are section sums, not the account total.
const ACCOUNT_TOTAL = /^\s*(?:total(?:\s+(?:account|portfolio|market|holdings|assets))?(?:\s+value)?|grand\s+total|account\s+total|portfolio\s+total)\b/i;

// Turns the text of a PDF into an extraction result: a recognized document
// type gets its dedicated reader, anything else the generic table reader.
export function parseStatementPdf(pdf: PdfText, fileName?: string): ExtractionResult {
  const start = Date.now();
  if (pdf.pages.every((p) => p.join("").trim().length < 20)) {
    return empty(pdf, start, "This PDF has no selectable text, so it's probably a scan. Use the Screenshot / Image tab to read it with OCR.");
  }

  if (isGeneratedProposal(pdf)) {
    return empty(
      pdf,
      start,
      "This is a wealth proposal produced by this app, not a statement, so it has no holdings to import. " +
        "To load a client, import their original statement or financial plan (for example the LifeView plan PDF).",
      "generated_proposal"
    );
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
    // A row whose value couldn't be determined is kept for review, never
    // valued at a guess; other rows need a non-zero value.
    const reviewable = h.status === "needs_review" && h.marketValue == null;
    return CURRENCY_AMOUNT.test(raw) && !TOTAL_ROW.test(raw) && (reviewable || (h.marketValue ?? 0) !== 0) && !isAllocationLabel(h.assetName);
  });
  // Trace each row to the page it came from.
  for (const h of account.holdings) {
    const raw = h.fields._line?.raw ?? "";
    const page = pdf.pages.findIndex((lines) => lines.some((l) => l.trim() === raw));
    h.sourceTrace = { ...h.sourceTrace, sourceType: "pdf_text", extractionMethod: "pdf-layout-table", page: page >= 0 ? page + 1 : undefined };
  }
  if (account.holdings.length === 0) {
    return empty(pdf, start, `Read ${pdf.pageCount} page(s) but found no holdings table with currency amounts. If this is a statement in a layout Atlas doesn't know yet, try pasting the holdings table into the Paste tab.`);
  }

  const valued = account.holdings.filter((h) => h.marketValue != null);
  const assetsExtracted = valued.reduce((s, h) => s + Math.max(0, h.marketValue!), 0);
  const netWorthExtracted = valued.reduce((s, h) => s + h.marketValue!, 0);
  const stated = statedTotal(pdf);
  const currencies = new Set(valued.map((h) => h.currency ?? stated?.currency));
  const warnings: DataQualityIssue[] = [];
  const review = account.holdings.filter((h) => h.status === "needs_review");
  if (review.length > 0) {
    warnings.push({
      code: "CUSTOM_REQUIRES_REVIEW",
      severity: "warning",
      message: `${review.length} row${review.length === 1 ? "" : "s"} couldn't be read reliably and won't be imported: ${review.map((h) => h.assetName ?? h.symbol).join(", ")}. Check ${review.length === 1 ? "it" : "them"} against the statement and add by hand.`,
    });
  }

  // Reconcile with the statement's own total, in the same currency.
  let reconciliation: NonNullable<ExtractionResult["reconciliation"]>;
  const tolerance = Math.max(1, Math.abs(stated?.amount ?? 0) * 1e-6);
  if (!stated) {
    reconciliation = { status: "unavailable", assetsExtracted, liabilitiesExtracted: 0, netWorthExtracted, tolerance };
  } else if (currencies.size > 1 || (stated.currency && !currencies.has(stated.currency))) {
    reconciliation = { status: "unavailable", assetsExtracted, liabilitiesExtracted: 0, netWorthExtracted, tolerance };
    warnings.push({
      code: "CUSTOM_REQUIRES_REVIEW",
      severity: "warning",
      message: `The statement's total (${stated.currency} ${stated.amount.toLocaleString("en-US")}) is in a different currency from its holdings, so it couldn't be checked.`,
    });
  } else {
    const matched = Math.abs(stated.amount - netWorthExtracted) <= tolerance;
    reconciliation = {
      status: matched ? "matched" : "mismatch",
      assetsStated: stated.amount,
      assetsExtracted,
      liabilitiesExtracted: 0,
      netWorthStated: stated.amount,
      netWorthExtracted,
      tolerance,
    };
    if (!matched) {
      warnings.push({
        code: "CUSTOM_REQUIRES_REVIEW",
        severity: "critical",
        message: `The imported rows add up to ${netWorthExtracted.toLocaleString("en-US")} but the statement's total is ${stated.amount.toLocaleString("en-US")}. Some rows may be missing or misread: check every value against the statement before it's used.`,
      });
      // Each imported value carries the mismatch, so it can't be confirmed in bulk.
      for (const h of account.holdings) {
        h.warnings = [
          ...h.warnings,
          { code: "DOCUMENT_TOTAL_MISMATCH", severity: "warning", message: "The statement's total doesn't match the imported rows; check this value against the statement." },
        ];
      }
    }
  }

  return {
    ok: true,
    accounts: [account],
    warnings,
    extractionMethod: "pdf-layout-table",
    extractionMs: Date.now() - start,
    documentKind: "statement_table",
    pageCount: pdf.pageCount,
    reconciliation,
  };
}

// The statement's account total: the last total line (not a subtotal) with a
// money amount; its last amount is the total.
function statedTotal(pdf: PdfText): { amount: number; currency?: string } | null {
  let found: { amount: number; currency?: string } | null = null;
  for (const line of pdf.pages.flat()) {
    if (!ACCOUNT_TOTAL.test(line) || /^\s*sub/i.test(line)) continue;
    const cells = line.split(/ {2,}/).map((c) => c.trim()).filter(Boolean);
    const amounts = cells.flatMap((c) => moneyAmounts(c) ?? []);
    if (amounts.length > 0) found = { amount: amounts[amounts.length - 1], currency: detectCurrency(line) };
  }
  return found;
}

// Proposals generated by this app carry no product name (they're white-label),
// so recognize them by their own section titles.
export function isGeneratedProposal(pdf: PdfText): boolean {
  const squashed = pdf.pages.map((p) => p.join(" ").replace(/\s+/g, "").toUpperCase());
  return squashed.slice(0, 2).some((p) => p.includes("WEALTHPROPOSAL")) && squashed.some((p) => p.includes("BEFORE/AFTERALLOCATION"));
}

// A row named only "Real Estate" or "Cash & Equivalents" is an allocation
// summary line, not a holding.
const ALLOCATION_LABELS = new Set(
  [...Object.values(ASSET_CLASS_LABELS), "Other", "Unclassified", "Other / unclassified"].map((l) => l.toLowerCase())
);
function isAllocationLabel(name: string | undefined): boolean {
  return !!name && ALLOCATION_LABELS.has(name.trim().toLowerCase());
}

function empty(pdf: PdfText, start: number, message: string, documentKind?: DocumentKind): ExtractionResult {
  return {
    documentKind,
    ok: false,
    accounts: [],
    warnings: [{ code: "LOW_OCR_CONFIDENCE", severity: "warning", message }],
    extractionMethod: "pdf-layout",
    extractionMs: Date.now() - start,
    pageCount: pdf.pageCount,
  };
}
