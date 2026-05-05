import type { Holding, FxRate, CurrencyCode } from "@/domain/types";
import { convert } from "./currencyEngine";
import { resolveValuation } from "./valuationEngine";
import { evaluateHoldingQuality } from "./dataQualityEngine";

export interface NormalizedHolding extends Holding {
  reportingMarketValue: number;
}

export function normalizeHoldings(
  holdings: Holding[],
  rates: FxRate[],
  reportingCurrency: CurrencyCode
): NormalizedHolding[] {
  return holdings.map((h) => {
    const resolved = resolveValuation(h);
    const reporting = convert(resolved.amount, h.currency, reportingCurrency, rates);
    const quality = h.dataQuality.length > 0 ? h.dataQuality : evaluateHoldingQuality(h);
    return {
      ...h,
      dataQuality: quality,
      reportingMarketValue: reporting,
    };
  });
}
