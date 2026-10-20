import type {
  AccountType,
  AssetClass,
  AssetType,
  DataQualityIssue,
  ExtractedAccount,
  ExtractedHolding,
  Liquidity,
  Reconciliation,
  SubAssetClass,
} from "@/domain/types";
import { safeId } from "@/utils/formatting";
import { squash, type PdfText } from "../pdf/layoutLines";

// Reader for planning-software reports laid out like a LifeView financial
// plan: a "Balance Sheet" section listing each asset and liability under a
// category heading, with the report's own totals, plus a "Resource Summary"
// with account types and as-of dates. A plan lists account-level balances,
// not the securities inside each account, so each line becomes one account
// holding one balance.

export interface PlanLine {
  section: "asset" | "liability";
  category: string;
  name: string;
  value: number; // negative for liabilities
  page: number;
  raw: string;
}

export interface ParsedPlan {
  title?: string;
  clientName?: string;
  preparedBy?: string;
  asOfDate?: string; // ISO
  lines: PlanLine[];
  stated: { assets?: number; liabilities?: number; netWorth?: number };
  accountDetails: Map<string, { typeText?: string; asOf?: string }>;
}

const AMOUNT = String.raw`\(?-?\$[\d,]+(?:\.\d+)?\)?`;
const ITEM = new RegExp(`^(.+?)((?: ${AMOUNT}){2,})$`); // name + per-owner columns + total
const CATEGORY = new RegExp(`^(.+?) (${AMOUNT})$`);
const TOTAL = new RegExp(`^Total (Assets|Liabilities|Net Worth)((?: ${AMOUNT})+)$`);

export function money(s: string): number {
  const neg = s.includes("(") || s.includes("-");
  const n = Number(s.replace(/[^\d.]/g, ""));
  return neg ? -n : n;
}

function lastAmount(columns: string): number {
  const all = columns.trim().split(" ");
  return money(all[all.length - 1]);
}

export function isFinancialPlan(pdf: PdfText): boolean {
  const pages = pdf.pages.map((p) => p.map(squash).join("\n"));
  const hasBalanceSheet = pages.some((p) => /The Balance Sheet shows/i.test(p) || (/\bASSETS\b/.test(p) && /Total Net Worth/i.test(p)));
  const isPlan = pages.slice(0, 12).some((p) => /Financial Plan|LifeView|Resource Summary|Monte Carlo/i.test(p));
  return hasBalanceSheet && isPlan;
}

function isoDate(mdy: string): string | undefined {
  const m = mdy.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[1]}-${m[2]}` : undefined;
}

export function parseFinancialPlan(pdf: PdfText): ParsedPlan {
  const lines: PlanLine[] = [];
  const stated: ParsedPlan["stated"] = {};
  let clientName: string | undefined;
  let preparedBy: string | undefined;
  let asOfDate: string | undefined;
  let title: string | undefined;
  // A section often continues onto the next page without repeating its
  // "ASSETS" heading, so section and category carry across pages.
  let section: PlanLine["section"] | null = null;
  let category = "";

  pdf.pages.forEach((pageLines, idx) => {
    const page = pageLines.map(squash).filter(Boolean);
    for (const l of page) {
      const p = l.match(/^Prepared for ?: ?(.+?) Prepared by ?: ?(.+)$/i);
      if (p && !clientName) {
        clientName = p[1].trim();
        preparedBy = p[2].trim();
      }
      // The report date sits in each page footer: "06/18/2024 Page 24 of 79".
      if (!asOfDate && /^\d{2}\/\d{2}\/\d{4}( Page \d+ of \d+)?$/.test(l)) asOfDate = isoDate(l);
      if (!title && /Financial Plan$/i.test(l)) title = l;
    }

    // Balance Sheet pages carry a "Balance Sheet" label (some PDF text layers
    // decode it as "BalanceSheet"); the first one also has the "The Balance
    // Sheet shows…" heading. An exact-line match skips the table of contents.
    const isBalanceSheet = page.some((l) => /^Balance ?Sheet$|The Balance Sheet shows/i.test(l));
    if (!isBalanceSheet) return;
    for (const l of page) {
      if (/^ASSETS\b/.test(l)) { section = "asset"; continue; }
      if (/^LIABILITIES\b/.test(l)) { section = "liability"; continue; }
      const t = l.match(TOTAL);
      if (t) {
        const v = lastAmount(t[2]);
        if (t[1] === "Assets") stated.assets = v;
        if (t[1] === "Liabilities") stated.liabilities = -Math.abs(v);
        if (t[1] === "Net Worth") stated.netWorth = v;
        continue;
      }
      if (!section) continue;
      const item = l.match(ITEM);
      if (item) {
        const value = lastAmount(item[2]);
        lines.push({
          section,
          category,
          name: item[1].trim(),
          value: section === "liability" ? -Math.abs(value) : value,
          page: idx + 1,
          raw: l,
        });
        continue;
      }
      const cat = l.match(CATEGORY);
      if (cat) category = cat[1].trim();
    }
  });

  // A section can continue onto the next page and repeat its category line;
  // de-duplicate lines that appear twice.
  const seen = new Set<string>();
  const unique = lines.filter((l) => {
    const key = `${l.section}|${l.name}|${l.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { title, clientName, preparedBy, asOfDate, lines: unique, stated, accountDetails: resourceDetails(pdf, unique) };
}

// Pulls each line's account type and as-of date from the Resource Summary,
// where a row reads "<name> <owner> <account type> $<value> <mm/dd/yyyy>".
function resourceDetails(pdf: PdfText, lines: PlanLine[]): ParsedPlan["accountDetails"] {
  const summary = pdf.pages
    .filter((p) => p.some((l) => /^Resource Summary/i.test(squash(l))))
    .map((p) => p.map(squash).join(" "))
    .join(" ");
  const out: ParsedPlan["accountDetails"] = new Map();
  if (!summary) return out;
  for (const l of lines) {
    // Liability rows carry the loan's start date, not a valuation date.
    if (l.section === "liability") continue;
    const name = l.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const m = summary.match(new RegExp(`${name} (.{0,60}?) ?\\$[\\d,]+ (\\d{2}/\\d{2}/\\d{4})`));
    if (m) out.set(l.name, { typeText: m[1].trim() || undefined, asOf: isoDate(m[2]) });
  }
  return out;
}

export function reconcile(lines: PlanLine[], stated: ParsedPlan["stated"], tolerance = 1): Reconciliation {
  const assetsExtracted = lines.filter((l) => l.section === "asset").reduce((s, l) => s + l.value, 0);
  const liabilitiesExtracted = lines.filter((l) => l.section === "liability").reduce((s, l) => s + l.value, 0);
  const netWorthExtracted = assetsExtracted + liabilitiesExtracted;
  const pairs: [number | undefined, number][] = [
    [stated.assets, assetsExtracted],
    [stated.liabilities, liabilitiesExtracted],
    [stated.netWorth, netWorthExtracted],
  ];
  const comparable = pairs.filter(([s]) => s !== undefined);
  const status: Reconciliation["status"] =
    comparable.length === 0
      ? "unavailable"
      : comparable.every(([s, e]) => Math.abs((s as number) - e) <= tolerance)
      ? "matched"
      : "mismatch";
  return {
    status,
    assetsStated: stated.assets,
    assetsExtracted,
    liabilitiesStated: stated.liabilities,
    liabilitiesExtracted,
    netWorthStated: stated.netWorth,
    netWorthExtracted,
    tolerance,
  };
}

interface Classification {
  accountType: AccountType;
  assetClass: AssetClass;
  subAssetClass?: SubAssetClass;
  assetType?: AssetType;
  liquidity: Liquidity;
  breakdownMissing?: boolean;
  note?: string;
}

// Maps a plan line to the app's taxonomy from its category and name.
export function classifyPlanLine(l: PlanLine, typeText = ""): Classification {
  const n = `${l.name} ${typeText}`.toLowerCase();
  const cat = l.category.toLowerCase();
  if (l.section === "liability") {
    const mortgage = /mortgage|heloc/.test(n) || /mortgage/.test(cat);
    return {
      accountType: "liability_account",
      assetClass: "liability",
      subAssetClass: mortgage ? "mortgage" : "consumer_debt",
      assetType: mortgage ? "mortgage_liability" : "credit_liability",
      liquidity: "illiquid",
    };
  }
  if (/checking/.test(n)) return { accountType: "bank_checking", assetClass: "cash", subAssetClass: "cash_equivalents", assetType: "cash", liquidity: "cash" };
  if (/savings|money market/.test(n)) return { accountType: "bank_savings", assetClass: "cash", subAssetClass: "cash_equivalents", assetType: "cash", liquidity: "cash" };
  if (/roth/.test(n)) return { accountType: "ira_roth", assetClass: "custom", subAssetClass: "unclassified", liquidity: "daily", breakdownMissing: true };
  if (/\bira\b/.test(n)) return { accountType: "ira_traditional", assetClass: "custom", subAssetClass: "unclassified", liquidity: "daily", breakdownMissing: true };
  if (/401\(k\)|403\(b\)|457|pension|retirement/.test(n) || /retirement/.test(cat)) {
    return { accountType: /pension/.test(n) ? "pension" : "401k", assetClass: "custom", subAssetClass: "unclassified", liquidity: "daily", breakdownMissing: true };
  }
  if (/annuity/.test(n) || /annuity/.test(cat)) return { accountType: "annuity_account", assetClass: "insurance", subAssetClass: "annuity", assetType: "annuity", liquidity: "monthly" };
  if (/whole life|variable life|universal life|life insurance/.test(n) || /insurance/.test(cat)) {
    return { accountType: "insurance_policy_account", assetClass: "insurance", subAssetClass: "life_insurance", assetType: "insurance_policy", liquidity: "monthly", note: "Cash value of a life insurance policy." };
  }
  if (/restricted stock|rsu/.test(n)) return { accountType: "custom", assetClass: "equity", assetType: "stock", liquidity: "lockup", note: "Equity award; value depends on vesting and the current share price." };
  if (/stock option/.test(n)) return { accountType: "custom", assetClass: "equity", assetType: "option", liquidity: "lockup", note: "Equity award; value depends on vesting, strike and the current share price." };
  if (/collectible|painting|art\b|vintage|first edition/.test(n)) return { accountType: "custom", assetClass: "collectible", subAssetClass: "collectible", assetType: "collectible", liquidity: "illiquid" };
  if (/house|home|condo|residence|property|real estate|land|parking/.test(n) || /property|real estate/.test(cat)) {
    return { accountType: "real_estate_portfolio", assetClass: "real_estate", subAssetClass: "direct_real_estate", assetType: "real_estate", liquidity: "illiquid" };
  }
  if (/business/.test(cat) || /llc|inc\b|partners|properties|holdings/.test(n)) {
    return { accountType: "business_ownership", assetClass: "business", subAssetClass: "operating_business", assetType: "business_equity", liquidity: "illiquid" };
  }
  if (/brokerage|investment account|managed/.test(n)) return { accountType: "brokerage", assetClass: "custom", subAssetClass: "unclassified", liquidity: "daily", breakdownMissing: true };
  return { accountType: "custom", assetClass: "custom", subAssetClass: "unclassified", liquidity: "daily", breakdownMissing: true };
}

const issue = (message: string, severity: DataQualityIssue["severity"] = "warning"): DataQualityIssue => ({
  code: "CUSTOM_REQUIRES_REVIEW",
  severity,
  message,
});

// Turns a parsed plan into extracted accounts: one account per plan line.
export function planToAccounts(plan: ParsedPlan, reconciliation: Reconciliation): ExtractedAccount[] {
  const confidence = reconciliation.status === "matched" ? "high" : "medium";
  return plan.lines.map((l) => {
    const detail = plan.accountDetails.get(l.name);
    const c = classifyPlanLine(l, detail?.typeText);
    const warnings: DataQualityIssue[] = [];
    if (c.breakdownMissing) warnings.push(issue("The plan gives only this account's balance, not the holdings inside it. Add the positions from a custodial statement for an accurate allocation."));
    if (c.note) warnings.push(issue(c.note, "info"));
    const holding: ExtractedHolding = {
      id: safeId("eh"),
      assetName: l.name,
      marketValue: l.value,
      currency: "USD",
      assetClass: c.assetClass,
      subAssetClass: c.subAssetClass,
      assetType: c.assetType,
      liquidity: c.liquidity,
      valuationDate: detail?.asOf ?? plan.asOfDate,
      isLiability: l.section === "liability",
      notes: l.category ? `${l.category} (from the plan's Balance Sheet)` : undefined,
      fields: { _line: { fieldName: "_line", raw: l.raw, confidence } },
      warnings,
      confidence,
      sourceTrace: { sourceType: "pdf_text", page: l.page, rawText: l.raw, extractionMethod: "financial-plan-balance-sheet", extractionConfidence: confidence },
      status: "extracted",
    };
    return {
      id: safeId("ea"),
      accountName: l.name,
      accountType: c.accountType,
      statementDate: detail?.asOf ?? plan.asOfDate,
      clientNameDetected: plan.clientName,
      currency: "USD",
      holdings: [holding],
      fields: {},
      warnings: [],
      confidence,
    };
  });
}
