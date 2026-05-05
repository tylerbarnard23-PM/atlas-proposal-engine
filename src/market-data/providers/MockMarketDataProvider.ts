import type { MarketDataProvider } from "../types/marketDataTypes";
import { normalizeQuote } from "../normalize/normalizeQuote";

// Stable, deterministic mock prices keyed off the identifier so the UI is coherent across renders.
function deterministicPrice(symbol: string): number {
  let hash = 0;
  for (let i = 0; i < symbol.length; i++) hash = (hash * 31 + symbol.charCodeAt(i)) & 0xffffffff;
  const base = (Math.abs(hash) % 90000) / 100; // 0 - 900
  return Math.max(1, base + 50);
}

export const MockMarketDataProvider: MarketDataProvider = {
  id: "mock",
  name: "Mock Market Data (offline)",
  sourceType: "mock",
  attributionLine: "Atlas Proposal Engine — local fallback values",
  supportedAssetTypes: [
    "stock",
    "etf",
    "mutual_fund",
    "bond",
    "treasury",
    "municipal_bond",
    "corporate_bond",
    "sovereign_bond",
    "crypto",
    "stablecoin",
    "currency",
    "commodity",
    "precious_metal",
    "reit",
    "structured_note",
    "annuity",
    "custom",
    "cd",
    "cash",
  ],
  supportedIdentifiers: ["ticker", "cusip", "isin", "sedol", "figi", "internal", "custom", "wallet_address", "lei", "none"],
  requiresApiKey: false,
  async fetchQuote(req) {
    return normalizeQuote({
      providerId: "mock",
      providerName: "Mock Market Data (offline)",
      identifier: req.identifier,
      price: deterministicPrice(req.identifier.value),
      currency: req.preferredCurrency ?? "USD",
      quoteType: "mock",
      isMock: true,
      asOf: new Date().toISOString(),
      warning: "Fallback value — no live provider configured for this identifier.",
    });
  },
};
