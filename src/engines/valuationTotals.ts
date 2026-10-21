import type { CurrencyCode, Holding } from "@/domain/types";
import type { HoldingValuation } from "./normalizationEngine";
import { getCurrencyConfig } from "@/domain/currencyConfigs";
import { formatCurrency } from "@/utils/formatting";

// Totals in the reporting currency that never pass off missing values as
// known ones. A holding without a reporting value (no usable FX rate) is
// excluded from the sum and listed by its native amount instead:
// - "complete": every holding is valued.
// - "partial": the value covers the valued holdings only.
// - "unavailable": nothing could be valued; the value is null, not zero.
// Unvalued assets and liabilities are kept apart so their native amounts
// can't cancel out, and no monetary coverage percentage is ever computed:
// the denominator is unknown.

export type TotalStatus = "complete" | "partial" | "unavailable";

export interface NativeAmount {
  currency: CurrencyCode;
  /** Signed native amount (liabilities are negative). */
  amount: number;
  count: number;
}

export interface ValuedTotal {
  status: TotalStatus;
  value: number | null;
  valuedCount: number;
  unvaluedCount: number;
  unvaluedAssets: NativeAmount[];
  unvaluedLiabilities: NativeAmount[];
}

export interface ValuationSummary {
  assets: ValuedTotal;
  liabilities: ValuedTotal;
  net: ValuedTotal;
  /** True when every holding is valued. */
  complete: boolean;
  holdingsValued: number;
  holdingsTotal: number;
}

type Valuable = Pick<Holding, "isLiability" | "currency" | "nativeMarketValue"> & {
  reportingMarketValue?: number | null;
  valuation?: HoldingValuation;
};

/** A holding's reporting value, or null when it isn't valued. */
export const reportingValue = (h: Valuable): number | null =>
  typeof h.reportingMarketValue === "number" && Number.isFinite(h.reportingMarketValue) ? h.reportingMarketValue : null;

function addNative(list: NativeAmount[], currency: CurrencyCode, amount: number) {
  const row = list.find((r) => r.currency === currency);
  if (row) {
    row.amount += amount;
    row.count++;
  } else list.push({ currency, amount, count: 1 });
}

export function valuationTotal(holdings: Valuable[]): ValuedTotal {
  let value = 0;
  let valuedCount = 0;
  const unvaluedAssets: NativeAmount[] = [];
  const unvaluedLiabilities: NativeAmount[] = [];
  for (const h of holdings) {
    const v = reportingValue(h);
    if (v != null) {
      value += v;
      valuedCount++;
      continue;
    }
    const currency = h.valuation?.currency ?? h.currency;
    const amount = h.valuation?.amount ?? h.nativeMarketValue;
    addNative(h.isLiability ? unvaluedLiabilities : unvaluedAssets, currency, amount);
  }
  const unvaluedCount = holdings.length - valuedCount;
  const status: TotalStatus = unvaluedCount === 0 ? "complete" : valuedCount === 0 ? "unavailable" : "partial";
  return { status, value: status === "unavailable" ? null : value, valuedCount, unvaluedCount, unvaluedAssets, unvaluedLiabilities };
}

export function valuationSummary(holdings: Valuable[]): ValuationSummary {
  const assets = valuationTotal(holdings.filter((h) => !h.isLiability));
  const liabilities = valuationTotal(holdings.filter((h) => h.isLiability));
  const net = valuationTotal(holdings);
  return {
    assets,
    liabilities,
    net,
    complete: net.status === "complete",
    holdingsValued: net.valuedCount,
    holdingsTotal: holdings.length,
  };
}

/** The total's value, or "Unavailable" when nothing could be valued. */
export function formatTotal(t: ValuedTotal, reportingCurrency: CurrencyCode, opts: { compact?: boolean } = {}): string {
  return t.value == null ? "Unavailable" : formatCurrency(t.value, reportingCurrency, opts);
}

/** "CHF 1,000.00" / "−CHF 1,000.00": the currency code, never a symbol that could pass for the reporting currency. */
export function formatNative(n: Pick<NativeAmount, "currency" | "amount">): string {
  const decimals = getCurrencyConfig(n.currency).decimals;
  const abs = Math.abs(n.amount).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return `${n.amount < 0 ? "−" : ""}${n.currency} ${abs}`;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The currencies that have no usable rate to the reporting currency. */
export function missingPairs(t: Pick<ValuedTotal, "unvaluedAssets" | "unvaluedLiabilities">, reportingCurrency: CurrencyCode): string[] {
  return [...new Set([...t.unvaluedAssets, ...t.unvaluedLiabilities].map((n) => `${n.currency}/${reportingCurrency}`))];
}

/**
 * What a partial or unavailable total leaves out, e.g. "Excludes 1 asset
 * (CHF 1,000.00) and 1 liability (−CHF 1,000.00) not valued in USD: no
 * CHF/USD rate." Null when everything is valued.
 */
export function describeUnvalued(t: ValuedTotal | ValuationSummary, reportingCurrency: CurrencyCode): string | null {
  const total = "net" in t ? t.net : t;
  if (total.unvaluedCount === 0) return null;
  const part = (list: NativeAmount[], one: string, many: string) => {
    const count = list.reduce((s, n) => s + n.count, 0);
    return count ? `${plural(count, one, many)} (${list.map(formatNative).join("; ")})` : null;
  };
  const parts = [part(total.unvaluedAssets, "asset", "assets"), part(total.unvaluedLiabilities, "liability", "liabilities")].filter(Boolean);
  const pairs = missingPairs(total, reportingCurrency);
  return `Excludes ${parts.join(" and ")} not valued in ${reportingCurrency}: no ${pairs.join(", ")} rate.`;
}

/** "12 of 14 holdings valued": coverage by count, never by money. */
export function coverageLabel(s: ValuationSummary): string {
  return `${s.holdingsValued} of ${plural(s.holdingsTotal, "holding", "holdings")} valued`;
}
