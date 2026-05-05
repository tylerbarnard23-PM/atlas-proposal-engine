import type { MarketDataProvider } from "../types/marketDataTypes";
import { normalizeQuote } from "../normalize/normalizeQuote";
import { normalizeFundamentals } from "../normalize/normalizeFundamentalData";

const ENV_KEY = "FINNHUB_API_KEY";

export const FinnhubProvider: MarketDataProvider = {
  id: "finnhub",
  name: "Finnhub",
  sourceType: "aggregator",
  attributionLine: "Quotes via Finnhub (finnhub.io).",
  supportedAssetTypes: ["stock", "etf"],
  supportedIdentifiers: ["ticker"],
  requiresApiKey: true,
  hasApiKey: () => !!process.env[ENV_KEY],
  async fetchQuote(req) {
    const key = process.env[ENV_KEY];
    if (!key) {
      return normalizeQuote({
        ok: false,
        providerId: "finnhub",
        providerName: "Finnhub",
        identifier: req.identifier,
        warning: "FINNHUB_API_KEY not configured.",
      });
    }
    try {
      const symbol = encodeURIComponent(req.identifier.value);
      const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${key}`;
      const res = await fetch(url, { next: { revalidate: 60 } } as RequestInit);
      if (!res.ok) {
        return normalizeQuote({
          ok: false,
          providerId: "finnhub",
          providerName: "Finnhub",
          identifier: req.identifier,
          warning: `HTTP ${res.status}`,
        });
      }
      const q = (await res.json()) as {
        c?: number;
        h?: number;
        l?: number;
        o?: number;
        pc?: number;
        t?: number;
      };
      if (!q || !q.c) {
        return normalizeQuote({
          ok: false,
          providerId: "finnhub",
          providerName: "Finnhub",
          identifier: req.identifier,
          warning: "No quote available.",
        });
      }
      return normalizeQuote({
        providerId: "finnhub",
        providerName: "Finnhub",
        identifier: req.identifier,
        price: q.c,
        previousClose: q.pc,
        open: q.o,
        high: q.h,
        low: q.l,
        currency: "USD",
        asOf: q.t ? new Date(q.t * 1000).toISOString() : new Date().toISOString(),
        quoteType: "delayed",
      });
    } catch (err) {
      return normalizeQuote({
        ok: false,
        providerId: "finnhub",
        providerName: "Finnhub",
        identifier: req.identifier,
        warning: (err as Error).message,
      });
    }
  },
  async fetchFundamentals(req) {
    const key = process.env[ENV_KEY];
    if (!key) {
      return normalizeFundamentals({
        ok: false,
        providerId: "finnhub",
        identifier: req.identifier,
        warning: "FINNHUB_API_KEY not configured.",
      });
    }
    try {
      const symbol = encodeURIComponent(req.identifier.value);
      const url = `https://finnhub.io/api/v1/stock/profile2?symbol=${symbol}&token=${key}`;
      const res = await fetch(url, { next: { revalidate: 24 * 3600 } } as RequestInit);
      if (!res.ok) {
        return normalizeFundamentals({
          ok: false,
          providerId: "finnhub",
          identifier: req.identifier,
          warning: `HTTP ${res.status}`,
        });
      }
      const p = (await res.json()) as {
        name?: string;
        finnhubIndustry?: string;
        country?: string;
        marketCapitalization?: number;
      };
      return normalizeFundamentals({
        ok: true,
        providerId: "finnhub",
        identifier: req.identifier,
        name: p.name,
        industry: p.finnhubIndustry,
        country: p.country,
        marketCap: p.marketCapitalization ? p.marketCapitalization * 1_000_000 : undefined,
      });
    } catch (err) {
      return normalizeFundamentals({
        ok: false,
        providerId: "finnhub",
        identifier: req.identifier,
        warning: (err as Error).message,
      });
    }
  },
};
