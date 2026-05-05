import type { MarketDataResult, QuoteType } from "@/domain/types";

export function normalizeQuote(partial: Partial<MarketDataResult> & { providerId: string; providerName: string; identifier: MarketDataResult["identifier"] }): MarketDataResult {
  const now = new Date().toISOString();
  return {
    ok: partial.ok ?? true,
    providerId: partial.providerId,
    providerName: partial.providerName,
    identifier: partial.identifier,
    price: partial.price,
    currency: partial.currency,
    asOf: partial.asOf ?? now,
    quoteType: (partial.quoteType ?? "eod") as QuoteType,
    change: partial.change,
    changePercent: partial.changePercent,
    high: partial.high,
    low: partial.low,
    open: partial.open,
    previousClose: partial.previousClose,
    volume: partial.volume,
    warning: partial.warning,
    isMock: partial.isMock ?? false,
    fetchedAt: now,
    raw: partial.raw,
  };
}
