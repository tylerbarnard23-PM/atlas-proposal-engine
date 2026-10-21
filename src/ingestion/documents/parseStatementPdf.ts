import type { CurrencyCode, DataQualityIssue, DocumentKind, ExtractedAccount, ExtractionResult, Reconciliation } from "@/domain/types";
import type { PdfText } from "../pdf/layoutLines";
import { moneyAmounts, parsePastedText } from "../parsers/parsePastedText";
import { detectCurrency } from "../normalizers/detectCurrency";
import { isFinancialPlan, parseFinancialPlan, planToAccounts, reconcile } from "./financialPlan";
import { extractHoldingsTable, type HoldingsTable } from "./holdingsTable";
import { ASSET_CLASS_LABELS } from "@/domain/assetTaxonomy";
import { safeId } from "@/utils/formatting";

// Requires an explicit currency marker next to a number, so profile fields
// ("Retirement Age: 67") and prose don't become holdings.
const CURRENCY_AMOUNT = /(?:[$€£¥]\s?\(?-?\d|\b(?:USD|EUR|GBP|CHF|CAD|JPY|AUD|SGD|HKD)\s*-?\d|\d\s?(?:USD|EUR|GBP|CHF|CAD|JPY|AUD|SGD|HKD)\b)/;
// Any total line: never a holding.
const TOTAL_ROW = /^\s*(?:(?:sub|grand|account|portfolio)[\s-]*)?total\b/i;
// The statement's own account total, e.g. "Total Account Value  USD 8,300,000.00"
// or "Grand Total". The whole label must say so: "Total Equities" and
// "Subtotal Equities" are section sums, not the account total.
const ACCOUNT_TOTAL = /^(?:total(?:\s+(?:account|portfolio|market|holdings|assets))?(?:\s+value)?|grand\s+total|(?:account|portfolio)\s+total(?:\s+value)?)$/i;

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
    const reconciliation: Reconciliation = { ...reconcile(plan.lines, plan.stated), currency: "USD" };
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

  // A holdings report laid out as a positioned table (right-aligned columns
  // under stacked headers): read by column geometry, not spacing.
  const table = extractHoldingsTable(pdf);
  if (table) return holdingsReport(pdf, table, start, fileName);

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
  const totals = statedTotals(pdf);
  const stated = totals[totals.length - 1];
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
  let reconciliation: Reconciliation;
  const tolerance = Math.max(1, Math.abs(stated?.amount ?? 0) * 1e-6);
  const currency = (stated?.currency ?? (currencies.size === 1 ? [...currencies][0] : undefined)) as CurrencyCode | undefined;
  const base = { assetsExtracted, liabilitiesExtracted: 0, netWorthExtracted, tolerance, currency };
  if (!stated) {
    reconciliation = { status: "unavailable", ...base };
  } else if (conflicting(totals)) {
    reconciliation = { status: "mismatch", assetsStated: stated.amount, netWorthStated: stated.amount, ...base };
    warnings.push(conflictWarning(totals.map((t) => t.amount), currency));
    markMismatch(account);
  } else if (currencies.size > 1 || (stated.currency && !currencies.has(stated.currency))) {
    reconciliation = { status: "unavailable", ...base };
    warnings.push({
      code: "CUSTOM_REQUIRES_REVIEW",
      severity: "warning",
      message: `The statement's total (${stated.currency} ${stated.amount.toLocaleString("en-US")}) is in a different currency from its holdings, so it couldn't be checked.`,
    });
  } else {
    const matched = Math.abs(stated.amount - netWorthExtracted) <= tolerance;
    reconciliation = { status: matched ? "matched" : "mismatch", assetsStated: stated.amount, netWorthStated: stated.amount, ...base };
    if (!matched) {
      warnings.push(mismatchWarning(netWorthExtracted, stated.amount, currency));
      markMismatch(account);
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

// A holdings report read as a positioned table. Its stated portfolio total is
// checked with a tolerance of half a cent per row: each row is rounded to the
// cent on its own while the total is rounded once, so n rows can honestly
// differ from the total by up to n × $0.005. A larger gap is a mismatch;
// nothing is added to force a match.
function holdingsReport(pdf: PdfText, table: HoldingsTable, start: number, fileName?: string): ExtractionResult {
  const currency = table.currency ?? "USD";
  const holdings = table.holdings;
  const valued = holdings.filter((h) => h.marketValue != null);
  const netWorthExtracted = round2(valued.reduce((s, h) => s + h.marketValue!, 0));
  const assetsExtracted = round2(valued.reduce((s, h) => s + Math.max(0, h.marketValue!), 0));
  const tolerance = valued.length * 0.005;
  const portfolio = table.totals.filter((t) => t.kind === "portfolio");
  const account: ExtractedAccount = {
    id: safeId("ea"),
    // The report doesn't say which account holds each position; none is invented.
    accountName: fileName ? `${fileName} (consolidated)` : "Consolidated holdings report",
    currency,
    statementDate: table.asOfDate,
    holdings,
    fields: {},
    warnings: [],
    confidence: "medium",
  };
  const warnings: DataQualityIssue[] = [
    {
      code: "CUSTOM_REQUIRES_REVIEW",
      severity: "info",
      message:
        "This report consolidates holdings without saying which account holds each position, so they're imported into one account. Balanced funds appear as their unbundled asset-class slices, as the report shows them.",
    },
  ];
  const review = holdings.filter((h) => h.status === "needs_review");
  if (review.length > 0) {
    warnings.push({
      code: "CUSTOM_REQUIRES_REVIEW",
      severity: "warning",
      message: `${review.length} value row${review.length === 1 ? " has" : "s have"} no readable security name; check ${review.length === 1 ? "it" : "them"} against the report.`,
    });
  }

  let reconciliation: Reconciliation;
  const base = { assetsExtracted, liabilitiesExtracted: 0, netWorthExtracted, tolerance, currency };
  if (portfolio.length === 0) {
    reconciliation = { status: "unavailable", ...base };
    warnings.push({ code: "CUSTOM_REQUIRES_REVIEW", severity: "warning", message: "The report states no portfolio total, so the import can't be checked for missing rows." });
  } else {
    const stated = portfolio[portfolio.length - 1].amount;
    const conflict = conflicting(portfolio);
    // Compared in cents, so floating-point noise can't tip a boundary case.
    const matched = !conflict && Math.round(Math.abs(stated - netWorthExtracted) * 100) <= Math.round(tolerance * 100);
    reconciliation = { status: matched ? "matched" : "mismatch", assetsStated: stated, netWorthStated: stated, ...base };
    if (conflict) warnings.push(conflictWarning(portfolio.map((t) => t.amount), currency));
    else if (!matched) warnings.push(mismatchWarning(netWorthExtracted, stated, currency));
    if (!matched) markMismatch(account);
  }

  return {
    ok: true,
    accounts: [account],
    warnings,
    extractionMethod: "pdf-positioned-table",
    extractionMs: Date.now() - start,
    documentKind: "holdings_report",
    asOfDate: table.asOfDate,
    pageCount: pdf.pageCount,
    reconciliation,
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// The statement's account totals, in order: lines whose label is an account
// or portfolio total, with a money amount; a line's last amount is its total.
function statedTotals(pdf: PdfText): { amount: number; currency?: string }[] {
  const found: { amount: number; currency?: string }[] = [];
  for (const line of pdf.pages.flat()) {
    const cells = line.split(/ {2,}/).map((c) => c.trim()).filter(Boolean);
    if (cells.length < 2 || !ACCOUNT_TOTAL.test(cells[0])) continue;
    const amounts = cells.slice(1).flatMap((c) => moneyAmounts(c) ?? []);
    if (amounts.length > 0) found.push({ amount: amounts[amounts.length - 1], currency: detectCurrency(line) });
  }
  return found;
}

// A document that states its total more than once must state the same total.
const conflicting = (totals: { amount: number }[]) => new Set(totals.map((t) => t.amount.toFixed(2))).size > 1;

const fmt = (n: number, currency?: string) =>
  `${currency ? `${currency} ` : ""}${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function conflictWarning(amounts: number[], currency?: string): DataQualityIssue {
  const distinct = [...new Set(amounts.map((a) => a.toFixed(2)))].map(Number);
  return {
    code: "CUSTOM_REQUIRES_REVIEW",
    severity: "critical",
    message: `The document states conflicting totals (${distinct.map((a) => fmt(a, currency)).join(" and ")}), so the import can't be checked against it. Review every value against the document.`,
  };
}

function mismatchWarning(extracted: number, stated: number, currency?: string): DataQualityIssue {
  return {
    code: "CUSTOM_REQUIRES_REVIEW",
    severity: "critical",
    message: `The imported rows add up to ${fmt(extracted, currency)} but the document's total is ${fmt(stated, currency)}. Some rows may be missing or misread: check every value against the document before it's used.`,
  };
}

// Each imported value carries the mismatch, so it can't be confirmed in bulk.
function markMismatch(account: ExtractedAccount) {
  for (const h of account.holdings) {
    h.warnings = [
      ...h.warnings,
      { code: "DOCUMENT_TOTAL_MISMATCH", severity: "warning", message: "The document's total doesn't match the imported rows; check this value against the document." },
    ];
  }
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
