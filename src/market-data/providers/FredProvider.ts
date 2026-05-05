import type { MarketDataProvider } from "../types/marketDataTypes";
import { normalizeQuote } from "../normalize/normalizeQuote";

const ENV_KEY = "FRED_API_KEY";

// FRED (St. Louis Fed) is a macro / time-series source. Identifier is the FRED series id (e.g. "DGS10").

export const FredProvider: MarketDataProvider = {
  id: "fred",
  name: "FRED (St. Louis Fed)",
  sourceType: "official",
  attributionLine: "Federal Reserve Economic Data (FRED), St. Louis Fed.",
  supportedAssetTypes: ["custom"],
  supportedIdentifiers: ["custom", "ticker"],
  requiresApiKey: true,
  hasApiKey: () => !!process.env[ENV_KEY],
  async fetchQuote(req) {
    const key = process.env[ENV_KEY];
    if (!key) {
      return normalizeQuote({
        ok: false,
        providerId: "fred",
        providerName: "FRED",
        identifier: req.identifier,
        warning: "FRED_API_KEY not configured.",
      });
    }
    try {
      const seriesId = encodeURIComponent(req.identifier.value);
      const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${key}&file_type=json&sort_order=desc&limit=1`;
      const res = await fetch(url, { next: { revalidate: 3600 } } as RequestInit);
      if (!res.ok) {
        return normalizeQuote({
          ok: false,
          providerId: "fred",
          providerName: "FRED",
          identifier: req.identifier,
          warning: `HTTP ${res.status}`,
        });
      }
      const data = (await res.json()) as { observations?: { date: string; value: string }[] };
      const obs = data.observations?.[0];
      if (!obs || obs.value === ".") {
        return normalizeQuote({
          ok: false,
          providerId: "fred",
          providerName: "FRED",
          identifier: req.identifier,
          warning: "No observation available.",
        });
      }
      return normalizeQuote({
        providerId: "fred",
        providerName: "FRED (St. Louis Fed)",
        identifier: req.identifier,
        price: parseFloat(obs.value),
        currency: "USD",
        asOf: new Date(obs.date + "T00:00:00Z").toISOString(),
        quoteType: "reference",
      });
    } catch (err) {
      return normalizeQuote({
        ok: false,
        providerId: "fred",
        providerName: "FRED",
        identifier: req.identifier,
        warning: (err as Error).message,
      });
    }
  },
};
