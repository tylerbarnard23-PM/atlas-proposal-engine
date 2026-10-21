import type { CurrencyCode, FxRate } from "@/domain/types";

export interface FxResolveResult {
  rate: number;
  asOf: string;
  source: FxRate["source"];
  isStale?: boolean;
  /** How the rate was found: a stored pair, its inverse, or two pairs via USD. */
  path: "same" | "direct" | "inverse" | "cross";
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
    return { rate: 1, asOf: new Date().toISOString(), source: "Manual", path: "same" };
  }
  const rates = allRates.filter(usable);
  const direct = rates.find((r) => r.base === base && r.quote === quote);
  if (direct) return { rate: direct.rate, asOf: direct.asOf, source: direct.source, isStale: direct.isStale, path: "direct" };
  const inverse = rates.find((r) => r.base === quote && r.quote === base);
  if (inverse && inverse.rate > 0) {
    return { rate: 1 / inverse.rate, asOf: inverse.asOf, source: inverse.source, isStale: inverse.isStale, path: "inverse" };
  }
  // Try via USD as bridge
  const baseToUsd = rates.find((r) => r.base === base && r.quote === "USD");
  const usdToQuote = rates.find((r) => r.base === "USD" && r.quote === quote);
  if (baseToUsd && usdToQuote) {
    return {
      rate: baseToUsd.rate * usdToQuote.rate,
      asOf: baseToUsd.asOf < usdToQuote.asOf ? baseToUsd.asOf : usdToQuote.asOf,
      source: baseToUsd.source,
      path: "cross",
    };
  }
  const baseToUsd2 = rates.find((r) => r.base === base && r.quote === "USD");
  const quoteToUsd = rates.find((r) => r.base === quote && r.quote === "USD");
  if (baseToUsd2 && quoteToUsd && quoteToUsd.rate > 0) {
    return {
      rate: baseToUsd2.rate / quoteToUsd.rate,
      // A cross rate is only as current as the older of its two legs.
      asOf: baseToUsd2.asOf < quoteToUsd.asOf ? baseToUsd2.asOf : quoteToUsd.asOf,
      source: baseToUsd2.source,
      path: "cross",
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
