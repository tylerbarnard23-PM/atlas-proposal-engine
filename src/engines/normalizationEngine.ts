import type { Holding, FxRate, CurrencyCode } from "@/domain/types";
import { resolveFxRate } from "./currencyEngine";
import { resolveValuation } from "./valuationEngine";
import { evaluateHoldingQuality } from "./dataQualityEngine";

// A holding is either valued in the reporting currency with an explicit rate,
// or unvalued: its native amount is known but there is no usable rate.
export type HoldingValuation =
  | {
      status: "valued";
      /** The resolved valuation amount and its currency (an approved value's own currency, else the holding's). */
      currency: CurrencyCode;
      amount: number;
      rate: number;
      rateAsOf: string;
      rateSource: string;
      /** The stored rates used (none when no conversion was needed). */
      rateLegs: FxRate[];
    }
  | {
      status: "unvalued";
      reason: "missing_fx_rate";
      currency: CurrencyCode;
      amount: number;
      reportingCurrency: CurrencyCode;
    };

export interface NormalizedHolding extends Holding {
  /** Null when the holding couldn't be valued; never a native amount or zero. */
  reportingMarketValue: number | null;
  valuation: HoldingValuation;
}

// Values every holding against the *current* FX inputs. Any reporting value a
// holding arrives with (a cached client-side figure) is ignored, so an old
// value can't hide a rate that has since gone missing.
export function normalizeHoldings(
  holdings: Holding[],
  rates: FxRate[],
  reportingCurrency: CurrencyCode
): NormalizedHolding[] {
  return holdings.map((h) => {
    const resolved = resolveValuation(h);
    const fx = resolveFxRate(rates, resolved.currency, reportingCurrency);
    const quality = h.dataQuality.length > 0 ? h.dataQuality : evaluateHoldingQuality(h);
    const valuation: HoldingValuation = fx
      ? { status: "valued", currency: resolved.currency, amount: resolved.amount, rate: fx.rate, rateAsOf: fx.asOf, rateSource: fx.source, rateLegs: fx.legs }
      : { status: "unvalued", reason: "missing_fx_rate", currency: resolved.currency, amount: resolved.amount, reportingCurrency };
    return {
      ...h,
      dataQuality: quality,
      reportingMarketValue: fx ? resolved.amount * fx.rate : null,
      valuation,
    };
  });
}

export const isUnvalued = (h: { valuation?: HoldingValuation }) => h.valuation?.status === "unvalued";
