import type { MarketDataProvider } from "../types/marketDataTypes";
import { normalizeQuote } from "../normalize/normalizeQuote";
import type { FxRate } from "@/domain/types";

// Frankfurter (https://www.frankfurter.app/) is a free, no-key API
// that sources its rates from the European Central Bank (ECB).
// We treat returned rates as ECB reference rates.

export const FrankfurterFxProvider: MarketDataProvider = {
  id: "frankfurter",
  name: "Frankfurter (ECB reference rates)",
  sourceType: "official",
  attributionLine: "Rates from frankfurter.app (sourced from the European Central Bank).",
  supportedAssetTypes: ["currency"],
  supportedIdentifiers: ["ticker", "custom"],
  requiresApiKey: false,
  async fetchQuote(req) {
    // Identifier convention: "EUR/USD" or "EURUSD" or "USD"->base USD pair.
    const value = req.identifier.value.toUpperCase().replace("/", "");
    const base = value.length >= 6 ? value.slice(0, 3) : "USD";
    const quote = value.length >= 6 ? value.slice(3, 6) : value;
    try {
      const url = `https://api.frankfurter.app/latest?from=${base}&to=${quote}`;
      const res = await fetch(url, { next: { revalidate: 3600 } } as RequestInit);
      if (!res.ok) {
        return normalizeQuote({
          ok: false,
          providerId: "frankfurter",
          providerName: "Frankfurter",
          identifier: req.identifier,
          warning: `HTTP ${res.status}`,
        });
      }
      const data = (await res.json()) as { rates: Record<string, number>; date: string };
      const rate = data.rates[quote];
      if (!rate) {
        return normalizeQuote({
          ok: false,
          providerId: "frankfurter",
          providerName: "Frankfurter",
          identifier: req.identifier,
          warning: "Rate not in response.",
        });
      }
      return normalizeQuote({
        providerId: "frankfurter",
        providerName: "Frankfurter (ECB reference rates)",
        identifier: req.identifier,
        price: rate,
        currency: quote,
        asOf: new Date(data.date + "T00:00:00Z").toISOString(),
        quoteType: "reference",
      });
    } catch (err) {
      return normalizeQuote({
        ok: false,
        providerId: "frankfurter",
        providerName: "Frankfurter",
        identifier: req.identifier,
        warning: (err as Error).message,
      });
    }
  },
};

// Fetch a full table of FX rates against a base currency.
export async function fetchFrankfurterRates(base: string, quotes: string[]): Promise<FxRate[]> {
  try {
    const url = `https://api.frankfurter.app/latest?from=${base}&to=${quotes.filter((q) => q !== base).join(",")}`;
    const res = await fetch(url, { next: { revalidate: 3600 } } as RequestInit);
    if (!res.ok) return [];
    const data = (await res.json()) as { rates: Record<string, number>; date: string };
    const asOf = new Date(data.date + "T00:00:00Z").toISOString();
    const rates: FxRate[] = [{ base, quote: base, rate: 1, asOf, source: "ECB" }];
    for (const [quote, rate] of Object.entries(data.rates)) {
      rates.push({ base, quote, rate, asOf, source: "ECB" });
    }
    return rates;
  } catch {
    return [];
  }
}
