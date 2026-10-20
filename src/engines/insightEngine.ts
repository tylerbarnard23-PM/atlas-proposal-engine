import type { Insight, Holding } from "@/domain/types";
import type { NormalizedHolding } from "./normalizationEngine";
import { groupBy, sumBy } from "@/utils/numbers";
import { safeId, todayIso } from "@/utils/formatting";
import { CODES_COVERED_BY_TASKS, dataTasks, isBalanceOnly, MARKET_STALE_DAYS } from "./dataTasks";
import type { DataTaskKind } from "@/domain/types";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const TASK_TITLE: Record<DataTaskKind, (n: number) => string> = {
  balance_only: (n) => `${plural(n, "account has", "accounts have")} a total but no holdings inside`,
  missing_identifier: (n) => `${plural(n, "security has", "securities have")} no ticker or CUSIP`,
  stale_value: (n) => `${plural(n, "value is", "values are")} out of date`,
};
const TASK_WHY: Record<DataTaskKind, string> = {
  balance_only:
    "They show as \"Other / unclassified\" in the allocation charts, so the Before / After can't reflect what's inside them. Upload the account's positions, or keep it as one balance.",
  missing_identifier:
    "Without a ticker or CUSIP the price can't be refreshed from market data. Add one, or dismiss if the holding has none.",
  stale_value: `Market-priced values older than ${MARKET_STALE_DAYS} days, and property, business, insurance or private assets older than 12 months, may no longer be accurate. Update the value, refresh the price, or keep the date: the proposal shows each value's as-of date.`,
};

export interface InsightInputs {
  holdings: NormalizedHolding[];
  reportingCurrency: string;
}

const CONCENTRATION_PCT = 8; // single-issuer warning
const SINGLE_COUNTRY_NON_BASE_PCT = 30;
const SINGLE_CURRENCY_NON_BASE_PCT = 25;
const ILLIQUID_PCT = 25;
const HIGH_FEE_BPS = 80;
const CASH_DRAG_PCT = 12;

export function generateInsights({ holdings, reportingCurrency }: InsightInputs): Insight[] {
  const out: Insight[] = [];
  const investible = holdings.filter((h) => !h.isLiability);
  const total = sumBy(investible, (h) => h.reportingMarketValue || 0);
  if (total <= 0 || investible.length === 0) return out;
  const now = todayIso();

  // Concentration. Only positions with a single issuer or a single asset
  // behind them: not cash, not diversified funds, not a balance-only account
  // whose contents are unknown, not the client's own home.
  for (const h of investible) {
    const kind = concentrationKind(h);
    if (!kind) continue;
    const v = h.reportingMarketValue || 0;
    const pct = (v / total) * 100;
    if (pct >= CONCENTRATION_PCT) {
      out.push({
        id: safeId("insight"),
        category: "concentration",
        severity: pct >= 12 ? "critical" : "warning",
        title: `${h.assetName} represents ${pct.toFixed(1)}% of investible assets`,
        detail:
          kind === "issuer"
            ? `Single-issuer concentration above ${CONCENTRATION_PCT}% of investible assets. Consider trimming to manage idiosyncratic risk.`
            : `A single asset above ${CONCENTRATION_PCT}% of investible assets. Review how it fits the client's liquidity needs and risk tolerance.`,
        relatedHoldingIds: [h.id],
        context: [
          { label: "Position", value: h.assetName },
          { label: "Concentration", value: `${pct.toFixed(1)}%` },
          { label: "Currency", value: h.currency },
        ],
        generatedAt: now,
      });
    }
  }

  // Currency exposure
  const byCurrency = groupBy(investible, (h) => h.currency);
  for (const [cur, items] of Object.entries(byCurrency)) {
    if (cur === reportingCurrency) continue;
    const v = sumBy(items, (h) => h.reportingMarketValue || 0);
    const pct = (v / total) * 100;
    if (pct >= SINGLE_CURRENCY_NON_BASE_PCT) {
      out.push({
        id: safeId("insight"),
        category: "currency",
        severity: "warning",
        title: `${pct.toFixed(0)}% of assets denominated in ${cur}`,
        detail: `Non-base currency exposure to ${cur} above ${SINGLE_CURRENCY_NON_BASE_PCT}% threshold. Consider hedging or rebalancing currency mix.`,
        context: [
          { label: "Currency", value: cur },
          { label: "Exposure", value: `${pct.toFixed(1)}%` },
        ],
        generatedAt: now,
      });
    }
  }

  // Country exposure
  const byCountry = groupBy(investible, (h) => h.country || "—");
  for (const [country, items] of Object.entries(byCountry)) {
    if (country === "US" || country === "—") continue;
    const v = sumBy(items, (h) => h.reportingMarketValue || 0);
    const pct = (v / total) * 100;
    if (pct >= SINGLE_COUNTRY_NON_BASE_PCT) {
      out.push({
        id: safeId("insight"),
        category: "country",
        severity: "info",
        title: `Material exposure to ${country} (${pct.toFixed(0)}%)`,
        detail: `Cross-border tax, succession, and reporting considerations may apply.`,
        generatedAt: now,
      });
    }
  }

  // Illiquid exposure
  const illiquid = investible.filter((h) => h.liquidity === "illiquid" || h.liquidity === "lockup");
  const illiquidV = sumBy(illiquid, (h) => h.reportingMarketValue || 0);
  if (total > 0 && (illiquidV / total) * 100 >= ILLIQUID_PCT) {
    out.push({
      id: safeId("insight"),
      category: "liquidity",
      severity: "warning",
      title: `${((illiquidV / total) * 100).toFixed(0)}% in illiquid or lockup assets`,
      detail: `Confirm liquidity profile is consistent with stated needs and any near-term capital obligations.`,
      relatedHoldingIds: illiquid.map((h) => h.id),
      generatedAt: now,
    });
  }

  // Cash drag
  const cash = investible.filter((h) => h.assetClass === "cash");
  const cashV = sumBy(cash, (h) => h.reportingMarketValue || 0);
  if (total > 0 && (cashV / total) * 100 >= CASH_DRAG_PCT) {
    out.push({
      id: safeId("insight"),
      category: "liquidity",
      severity: "info",
      title: `Cash represents ${((cashV / total) * 100).toFixed(0)}% of investible assets`,
      detail: `Higher-than-target cash balance may dampen long-term return. Confirm intent.`,
      relatedHoldingIds: cash.map((h) => h.id),
      generatedAt: now,
    });
  }

  // High fee funds
  const highFee = investible.filter((h) => (h.expenseRatioPct ?? 0) * 100 >= HIGH_FEE_BPS);
  for (const h of highFee) {
    out.push({
      id: safeId("insight"),
      category: "fees",
      severity: "warning",
      title: `${h.assetName} has expense ratio of ${(h.expenseRatioPct ?? 0).toFixed(2)}%`,
      detail: `Expense ratio above ${HIGH_FEE_BPS} bps threshold. Consider whether a lower-cost alternative is appropriate.`,
      relatedHoldingIds: [h.id],
      generatedAt: now,
    });
  }

  // Manual / private valuations
  const manual = investible.filter((h) => h.valuationSource.kind === "manual_valuation");
  for (const h of manual) {
    out.push({
      id: safeId("insight"),
      category: "valuation",
      severity: "info",
      title: `${h.assetName} is manually valued`,
      detail: `Valuation date ${h.valuationDate ?? "n/a"} (${h.valuationSource.note ?? "advisor-entered"}). Refresh prior to client delivery.`,
      relatedHoldingIds: [h.id],
      generatedAt: now,
    });
  }

  // Data to complete: gaps the advisor can fix in place (see dataTasks).
  for (const t of dataTasks(investible)) {
    const n = t.openIds.length;
    out.push({
      id: safeId("insight"),
      category: "data_quality",
      severity: "warning",
      title: TASK_TITLE[t.kind](n),
      detail: TASK_WHY[t.kind],
      relatedHoldingIds: t.openIds,
      task: { kind: t.kind, openIds: t.openIds, doneIds: t.doneIds },
      generatedAt: now,
    });
  }

  // Other data-quality notes. The same issue on many holdings is one insight
  // listing them, not one each.
  const byIssue = new Map<string, { message: string; severity: Insight["severity"]; holdings: NormalizedHolding[] }>();
  for (const h of investible) {
    for (const issue of h.dataQuality) {
      if (issue.severity === "info") continue;
      if (CODES_COVERED_BY_TASKS.has(issue.code) || /only this account's balance/.test(issue.message)) continue;
      if (issue.code === "MISSING_ASSET_CLASS" && isBalanceOnly(h)) continue;
      const k = `${issue.code}|${issue.message}`;
      const entry = byIssue.get(k) ?? { message: issue.message, severity: issue.severity, holdings: [] };
      entry.holdings.push(h);
      byIssue.set(k, entry);
    }
  }
  for (const { message, severity, holdings: hs } of byIssue.values()) {
    const names = hs.map((h) => h.assetName);
    const shown = names.slice(0, 4).join(", ") + (names.length > 4 ? ` and ${names.length - 4} more` : "");
    out.push({
      id: safeId("insight"),
      category: "data_quality",
      severity,
      title: hs.length === 1 ? `${names[0]}: ${message}` : `${hs.length} holdings: ${message}`,
      detail:
        (hs.length === 1 ? "" : `Applies to ${shown}. `) +
        "In the value check on Accounts & Assets, click Details on each to correct it, or Confirm it if it's right.",
      relatedHoldingIds: hs.map((h) => h.id),
      generatedAt: now,
    });
  }

  return out;
}

export function summarizeAllocation(
  holdings: Holding[],
  group: (h: Holding) => string
): { label: string; value: number; pct: number }[] {
  const totals = new Map<string, number>();
  for (const h of holdings) {
    if (h.isLiability) continue;
    const key = group(h);
    totals.set(key, (totals.get(key) ?? 0) + (h.reportingMarketValue ?? h.nativeMarketValue));
  }
  const total = Array.from(totals.values()).reduce((a, b) => a + b, 0);
  return Array.from(totals.entries())
    .map(([label, value]) => ({ label, value, pct: total > 0 ? (value / total) * 100 : 0 }))
    .sort((a, b) => b.value - a.value);
}

// Insight ids are regenerated on every run; this key identifies "the same
// observation" across runs (category + the holdings or accounts it is about),
// ignoring the percentages in the title, which move with prices.
export function insightKey(i: Pick<Insight, "category" | "title" | "relatedHoldingIds" | "relatedAccountIds" | "task">): string {
  // A task's holdings change as they're resolved; the task itself doesn't.
  if (i.task) return `data_task:${i.task.kind}`;
  const subject = i.relatedHoldingIds?.join(",") || i.relatedAccountIds?.join(",") || i.title.replace(/[\d.,]+%?/g, "#");
  return `${i.category}:${subject}`;
}

const FUND_NAME = /\b(ETF|FUND|INDEX|TRUST SHARES|PORTFOLIO)\b/i;
const OWN_HOME = /primary|residence|\bhome\b|vacation/i;

// "issuer": a stock, bond or award tied to one company. "asset": one
// property, business or collectible. undefined: not a concentration
// question (cash, funds, unclassified balances, the family home).
export function concentrationKind(h: Pick<Holding, "assetClass" | "assetType" | "subAssetClass" | "assetName">): "issuer" | "asset" | undefined {
  if (["cash", "custom", "liability", "insurance"].includes(h.assetClass) || h.subAssetClass === "unclassified") return undefined;
  if (h.assetType === "etf" || h.assetType === "mutual_fund" || h.subAssetClass === "reit" || FUND_NAME.test(h.assetName)) return undefined;
  if (["real_estate", "business", "collectible", "private_equity", "private_credit", "hedge_fund", "venture"].includes(h.assetClass)) {
    if (h.assetClass === "real_estate" && OWN_HOME.test(h.assetName)) return undefined;
    return "asset";
  }
  return "issuer";
}
