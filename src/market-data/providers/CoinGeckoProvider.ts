import type { MarketDataProvider } from "../types/marketDataTypes";
import { normalizeQuote } from "../normalize/normalizeQuote";

// CoinGecko free public API — keyless. We map common tickers to ids.

const TICKER_TO_ID: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  USDC: "usd-coin",
  USDT: "tether",
  SOL: "solana",
  ADA: "cardano",
  DOT: "polkadot",
  MATIC: "matic-network",
  LINK: "chainlink",
  XRP: "ripple",
  LTC: "litecoin",
  DOGE: "dogecoin",
  AVAX: "avalanche-2",
};

export const CoinGeckoProvider: MarketDataProvider = {
  id: "coingecko",
  name: "CoinGecko",
  sourceType: "aggregator",
  attributionLine: "Crypto market data via CoinGecko (free public API).",
  supportedAssetTypes: ["crypto", "stablecoin"],
  supportedIdentifiers: ["ticker", "custom"],
  requiresApiKey: false,
  async fetchQuote(req) {
    const sym = req.identifier.value.toUpperCase();
    const id = TICKER_TO_ID[sym] ?? sym.toLowerCase();
    try {
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=usd&include_last_updated_at=true`;
      const res = await fetch(url, { next: { revalidate: 60 } } as RequestInit);
      if (!res.ok) {
        return normalizeQuote({
          ok: false,
          providerId: "coingecko",
          providerName: "CoinGecko",
          identifier: req.identifier,
          warning: `HTTP ${res.status}`,
        });
      }
      const data = (await res.json()) as Record<string, { usd: number; last_updated_at?: number }>;
      const entry = data[id];
      if (!entry?.usd) {
        return normalizeQuote({
          ok: false,
          providerId: "coingecko",
          providerName: "CoinGecko",
          identifier: req.identifier,
          warning: "No price in response.",
        });
      }
      return normalizeQuote({
        providerId: "coingecko",
        providerName: "CoinGecko",
        identifier: req.identifier,
        price: entry.usd,
        currency: "USD",
        asOf: entry.last_updated_at ? new Date(entry.last_updated_at * 1000).toISOString() : new Date().toISOString(),
        quoteType: "delayed",
      });
    } catch (err) {
      return normalizeQuote({
        ok: false,
        providerId: "coingecko",
        providerName: "CoinGecko",
        identifier: req.identifier,
        warning: (err as Error).message,
      });
    }
  },
};
