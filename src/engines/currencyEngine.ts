import type { CurrencyCode, FxRate } from "@/domain/types";

export interface FxResolveResult {
  rate: number;
  asOf: string;
  source: FxRate["source"];
  isStale?: boolean;
}

export function resolveFxRate(
  rates: FxRate[],
  base: CurrencyCode,
  quote: CurrencyCode
): FxResolveResult | null {
  if (base === quote) {
    return { rate: 1, asOf: new Date().toISOString(), source: "Manual" };
  }
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

export function convert(
  amount: number,
  base: CurrencyCode,
  quote: CurrencyCode,
  rates: FxRate[]
): number {
  const r = resolveFxRate(rates, base, quote);
  if (!r) return amount;
  return amount * r.rate;
}
