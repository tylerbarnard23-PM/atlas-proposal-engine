import type { MarketDataProvider } from "../types/marketDataTypes";
import { normalizeQuote } from "../normalize/normalizeQuote";

const ENV_KEY = "TWELVE_DATA_API_KEY";

export const TwelveDataProvider: MarketDataProvider = {
  id: "twelve_data",
  name: "Twelve Data",
  sourceType: "aggregator",
  attributionLine: "Quotes via Twelve Data (twelvedata.com).",
  supportedAssetTypes: ["stock", "etf", "currency", "crypto", "commodity"],
  supportedIdentifiers: ["ticker"],
  requiresApiKey: true,
  hasApiKey: () => !!process.env[ENV_KEY],
  async fetchQuote(req) {
    const key = process.env[ENV_KEY];
    if (!key) {
      return normalizeQuote({
        ok: false,
        providerId: "twelve_data",
        providerName: "Twelve Data",
        identifier: req.identifier,
        warning: "TWELVE_DATA_API_KEY not configured.",
      });
    }
    try {
      const symbol = encodeURIComponent(req.identifier.value);
      const url = `https://api.twelvedata.com/quote?symbol=${symbol}&apikey=${key}`;
      const res = await fetch(url, { next: { revalidate: 60 } } as RequestInit);
      if (!res.ok) {
        return normalizeQuote({
          ok: false,
          providerId: "twelve_data",
          providerName: "Twelve Data",
          identifier: req.identifier,
          warning: `HTTP ${res.status}`,
        });
      }
      const q = (await res.json()) as {
        close?: string;
        currency?: string;
        datetime?: string;
        previous_close?: string;
        change?: string;
        percent_change?: string;
        status?: string;
        message?: string;
      };
      if (q.status === "error" || !q.close) {
        return normalizeQuote({
          ok: false,
          providerId: "twelve_data",
          providerName: "Twelve Data",
          identifier: req.identifier,
          warning: q.message ?? "No quote available.",
        });
      }
      return normalizeQuote({
        providerId: "twelve_data",
        providerName: "Twelve Data",
        identifier: req.identifier,
        price: parseFloat(q.close),
        previousClose: q.previous_close ? parseFloat(q.previous_close) : undefined,
        change: q.change ? parseFloat(q.change) : undefined,
        changePercent: q.percent_change ? parseFloat(q.percent_change) : undefined,
        currency: q.currency ?? "USD",
        asOf: q.datetime ? new Date(q.datetime + "Z").toISOString() : undefined,
        quoteType: "delayed",
      });
    } catch (err) {
      return normalizeQuote({
        ok: false,
        providerId: "twelve_data",
        providerName: "Twelve Data",
        identifier: req.identifier,
        warning: (err as Error).message,
      });
    }
  },
};
