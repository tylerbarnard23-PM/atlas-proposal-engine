import type { Insight, Holding } from "@/domain/types";
import type { NormalizedHolding } from "./normalizationEngine";
import { groupBy, sumBy } from "@/utils/numbers";
import { safeId, todayIso } from "@/utils/formatting";

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

  // Concentration (single issuer)
  for (const h of investible) {
    const v = h.reportingMarketValue || 0;
    const pct = (v / total) * 100;
    if (pct >= CONCENTRATION_PCT) {
      out.push({
        id: safeId("insight"),
        category: "concentration",
        severity: pct >= 12 ? "critical" : "warning",
        title: `${h.assetName} represents ${pct.toFixed(1)}% of investible assets`,
        detail: `Single-issuer concentration above ${CONCENTRATION_PCT}% of investible assets. Consider trimming to manage idiosyncratic risk.`,
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

  // Data quality flags
  for (const h of investible) {
    for (const issue of h.dataQuality) {
      if (issue.severity !== "info") {
        out.push({
          id: safeId("insight"),
          category: "data_quality",
          severity: issue.severity,
          title: `${h.assetName}: ${issue.message}`,
          detail: `${issue.code}`,
          relatedHoldingIds: [h.id],
          generatedAt: now,
        });
      }
    }
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
