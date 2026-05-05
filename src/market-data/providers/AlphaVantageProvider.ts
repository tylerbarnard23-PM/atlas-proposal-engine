import type { MarketDataProvider } from "../types/marketDataTypes";
import { normalizeQuote } from "../normalize/normalizeQuote";

const ENV_KEY = "ALPHA_VANTAGE_API_KEY";

export const AlphaVantageProvider: MarketDataProvider = {
  id: "alpha_vantage",
  name: "Alpha Vantage",
  sourceType: "aggregator",
  attributionLine: "Quotes via Alpha Vantage (alphavantage.co).",
  supportedAssetTypes: [
    "stock",
    "etf",
    "mutual_fund",
    "currency",
    "crypto",
    "commodity",
    "precious_metal",
  ],
  supportedIdentifiers: ["ticker"],
  requiresApiKey: true,
  hasApiKey: () => !!process.env[ENV_KEY],
  async fetchQuote(req) {
    const key = process.env[ENV_KEY];
    if (!key) {
      return normalizeQuote({
        ok: false,
        providerId: "alpha_vantage",
        providerName: "Alpha Vantage",
        identifier: req.identifier,
        warning: "ALPHA_VANTAGE_API_KEY not configured.",
      });
    }
    try {
      const symbol = encodeURIComponent(req.identifier.value);
      const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${key}`;
      const res = await fetch(url, { next: { revalidate: 60 } } as RequestInit);
      if (!res.ok) {
        return normalizeQuote({
          ok: false,
          providerId: "alpha_vantage",
          providerName: "Alpha Vantage",
          identifier: req.identifier,
          warning: `HTTP ${res.status}`,
        });
      }
      const data = (await res.json()) as { "Global Quote"?: Record<string, string>; Note?: string };
      if (data.Note) {
        return normalizeQuote({
          ok: false,
          providerId: "alpha_vantage",
          providerName: "Alpha Vantage",
          identifier: req.identifier,
          warning: data.Note,
        });
      }
      const q = data["Global Quote"];
      if (!q || !q["05. price"]) {
        return normalizeQuote({
          ok: false,
          providerId: "alpha_vantage",
          providerName: "Alpha Vantage",
          identifier: req.identifier,
          warning: "Empty Global Quote.",
        });
      }
      return normalizeQuote({
        providerId: "alpha_vantage",
        providerName: "Alpha Vantage",
        identifier: req.identifier,
        price: parseFloat(q["05. price"]),
        currency: req.preferredCurrency ?? "USD",
        change: parseFloat(q["09. change"] ?? "NaN"),
        changePercent: parseFloat((q["10. change percent"] ?? "0").replace("%", "")),
        previousClose: parseFloat(q["08. previous close"] ?? "NaN"),
        open: parseFloat(q["02. open"] ?? "NaN"),
        high: parseFloat(q["03. high"] ?? "NaN"),
        low: parseFloat(q["04. low"] ?? "NaN"),
        volume: parseFloat(q["06. volume"] ?? "NaN"),
        asOf: q["07. latest trading day"] ? new Date(q["07. latest trading day"] + "T20:00:00Z").toISOString() : undefined,
        quoteType: "eod",
      });
    } catch (err) {
      return normalizeQuote({
        ok: false,
        providerId: "alpha_vantage",
        providerName: "Alpha Vantage",
        identifier: req.identifier,
        warning: (err as Error).message,
      });
    }
  },
};
