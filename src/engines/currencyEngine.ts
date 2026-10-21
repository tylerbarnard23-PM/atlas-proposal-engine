import type { CurrencyCode, FxRate } from "@/domain/types";

export interface FxResolveResult {
  rate: number;
  asOf: string;
  source: FxRate["source"];
  isStale?: boolean;
}

// Only a finite, positive rate is a usable rate. Zero, negative, NaN or
// infinite entries are ignored as if absent, so they can't produce a value.
const usable = (r: FxRate | undefined): r is FxRate => !!r && Number.isFinite(r.rate) && r.rate > 0;

export function resolveFxRate(
  allRates: FxRate[],
  base: CurrencyCode,
  quote: CurrencyCode
): FxResolveResult | null {
  if (base === quote) {
    return { rate: 1, asOf: new Date().toISOString(), source: "Manual" };
  }
  const rates = allRates.filter(usable);
  const direct = rates.find((r) => r.base === base && r.quote === quote);
  if (direct) return { rate: direct.rate, asOf: direct.asOf, source: direct.source, isStale: direct.isStale };
  const inverse = rates.find((r) => r.base === quote && r.quote === base);
  if (inverse && inverse.rate > 0) {
    return { rate: 1 / inverse.rate, asOf: inverse.asOf, source: inverse.source, isStale: inverse.isStale };
  }
  // Try via USD as bridge
  const baseToUsd = rates.find((r) => r.base === base && r.quote === "USD");
  const usdToQuote = rates.find((r) => r.base === "USD" && r.quote === quote);
  if (baseToUsd && usdToQuote) {
    return {
      rate: baseToUsd.rate * usdToQuote.rate,
      asOf: baseToUsd.asOf < usdToQuote.asOf ? baseToUsd.asOf : usdToQuote.asOf,
      source: baseToUsd.source,
    };
  }
  const baseToUsd2 = rates.find((r) => r.base === base && r.quote === "USD");
  const quoteToUsd = rates.find((r) => r.base === quote && r.quote === "USD");
  if (baseToUsd2 && quoteToUsd && quoteToUsd.rate > 0) {
    return {
      rate: baseToUsd2.rate / quoteToUsd.rate,
      asOf: baseToUsd2.asOf,
      source: baseToUsd2.source,
    };
  }
  return null;
}

// Converts with an explicit rate, or returns null when there isn't one. A
// missing rate is never treated as 1:1.
export function convert(
  amount: number,
  base: CurrencyCode,
  quote: CurrencyCode,
  rates: FxRate[]
): number | null {
  const r = resolveFxRate(rates, base, quote);
  return r ? amount * r.rate : null;
}
