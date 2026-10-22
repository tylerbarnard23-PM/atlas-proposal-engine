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

// Fetch a table of FX rates against a base currency. Success or failure is
// explicit: a failed request returns an error, never an empty "success" or
// fallback data, so the caller can keep its existing rates and say so.
export async function fetchFrankfurterRates(
  base: string,
  quotes: string[]
): Promise<{ ok: true; rates: FxRate[] } | { ok: false; error: string }> {
  const to = quotes.filter((q) => q !== base);
  if (to.length === 0) return { ok: true, rates: [] };
  try {
    const url = `https://api.frankfurter.app/latest?from=${base}&to=${to.join(",")}`;
    const res = await fetch(url, { next: { revalidate: 3600 } } as RequestInit);
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const data = (await res.json()) as { rates?: Record<string, number>; date?: string };
    if (!data.rates || !data.date || !Number.isFinite(Date.parse(data.date))) return { ok: false, error: "Unexpected response from the rate provider." };
    // The provider's own date for the rates (ECB publication date), not the fetch time.
    const asOf = new Date(data.date + "T00:00:00Z").toISOString();
    const rates: FxRate[] = [];
    for (const [quote, rate] of Object.entries(data.rates)) {
      if (Number.isFinite(rate) && rate > 0) rates.push({ base, quote, rate, asOf, source: "ECB" });
    }
    return { ok: true, rates };
  } catch (err) {
    // Node's fetch reports "fetch failed" with the real reason (DNS, TLS, refused) in `cause`.
    const e = err as Error & { cause?: { code?: string; message?: string } };
    const cause = e.cause?.code ?? e.cause?.message;
    return { ok: false, error: `${e.message || "Network error"}${cause ? ` (${cause})` : ""}` };
  }
}
