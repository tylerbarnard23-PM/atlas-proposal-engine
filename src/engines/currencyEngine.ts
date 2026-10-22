import type { CurrencyCode, FxRate } from "@/domain/types";

export interface FxResolveResult {
  rate: number;
  /** The oldest date among the legs used (a cross rate is only as current as its older leg). */
  asOf: string;
  /** The source of the oldest leg. */
  source: FxRate["source"];
  /** How the rate was found: the pair itself (either orientation), or two pairs via USD. */
  path: "same" | "direct" | "inverse" | "cross";
  /** The stored rates actually used, so freshness checks and disclosures describe the real calculation. */
  legs: FxRate[];
}

// Only a finite, positive rate is a usable rate. Zero, negative, NaN or
// infinite entries are ignored as if absent, so they can't produce a value.
export const usableFxRate = (r: FxRate | undefined): r is FxRate => !!r && Number.isFinite(r.rate) && r.rate > 0;

const time = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : Number.NEGATIVE_INFINITY;
};

// One economic pair, stored in either orientation. The newest quote wins, so
// a stale direct copy can't override a newer reverse one; on the same date
// the requested orientation is preferred.
function pairRate(rates: FxRate[], base: CurrencyCode, quote: CurrencyCode): { rate: number; leg: FxRate } | null {
  let best: FxRate | null = null;
  for (const r of rates) {
    if (!((r.base === base && r.quote === quote) || (r.base === quote && r.quote === base))) continue;
    if (!best || time(r.asOf) > time(best.asOf) || (time(r.asOf) === time(best.asOf) && r.base === base && best.base !== base)) best = r;
  }
  if (!best) return null;
  return { rate: best.base === base ? best.rate : 1 / best.rate, leg: best };
}

export function resolveFxRate(allRates: FxRate[], base: CurrencyCode, quote: CurrencyCode): FxResolveResult | null {
  if (base === quote) return { rate: 1, asOf: new Date().toISOString(), source: "Manual", path: "same", legs: [] };
  const rates = allRates.filter(usableFxRate);
  const pair = pairRate(rates, base, quote);
  if (pair) {
    return { rate: pair.rate, asOf: pair.leg.asOf, source: pair.leg.source, path: pair.leg.base === base ? "direct" : "inverse", legs: [pair.leg] };
  }
  // Two pairs through USD.
  if (base === "USD" || quote === "USD") return null;
  const toUsd = pairRate(rates, base, "USD");
  const fromUsd = pairRate(rates, "USD", quote);
  if (!toUsd || !fromUsd) return null;
  const older = time(toUsd.leg.asOf) <= time(fromUsd.leg.asOf) ? toUsd.leg : fromUsd.leg;
  return { rate: toUsd.rate * fromUsd.rate, asOf: older.asOf, source: older.source, path: "cross", legs: [toUsd.leg, fromUsd.leg] };
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
