import type { FxRate } from "@/domain/types";

export function normalizeFxRate(partial: Partial<FxRate> & { base: FxRate["base"]; quote: FxRate["quote"]; rate: number }): FxRate {
  return {
    base: partial.base,
    quote: partial.quote,
    rate: partial.rate,
    asOf: partial.asOf ?? new Date().toISOString(),
    source: partial.source ?? "Frankfurter",
  };
}
