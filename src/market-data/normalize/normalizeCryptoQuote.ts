import type { MarketDataResult } from "@/domain/types";
import { normalizeQuote } from "./normalizeQuote";

export function normalizeCryptoQuote(args: { providerId: string; providerName: string; symbol: string; usd: number; asOf?: string }): MarketDataResult {
  return normalizeQuote({
    providerId: args.providerId,
    providerName: args.providerName,
    identifier: { type: "ticker", value: args.symbol },
    price: args.usd,
    currency: "USD",
    asOf: args.asOf,
    quoteType: "delayed",
  });
}
