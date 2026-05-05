import type {
  Holding,
  MarketDataResult,
  MarketDataRequest,
  AssetIdentifier,
  ConfidenceLevel,
} from "@/domain/types";
import { providerRegistry } from "@/market-data/providers/registry";
import { getCachedQuote, setCachedQuote } from "@/market-data/cache/marketDataCache";

export interface MarketDataEngineOptions {
  preferredProviderId?: string;
  forceRefresh?: boolean;
}

// Server-side resolver: tries configured providers in order, falls back to mock.
export async function resolveQuote(
  req: MarketDataRequest,
  opts: MarketDataEngineOptions = {}
): Promise<MarketDataResult> {
  const cacheKey = quoteCacheKey(req.identifier);
  if (!opts.forceRefresh) {
    const cached = getCachedQuote(cacheKey);
    if (cached) return cached;
  }
  const providers = providerRegistry({ preferredProviderId: opts.preferredProviderId });
  for (const provider of providers) {
    if (!provider.supportedIdentifiers.includes(req.identifier.type)) continue;
    if (req.assetType && !provider.supportedAssetTypes.includes(req.assetType)) continue;
    if (provider.requiresApiKey && !provider.hasApiKey?.()) continue;
    try {
      const result = await provider.fetchQuote(req);
      if (result.ok) {
        setCachedQuote(cacheKey, result);
        return result;
      }
    } catch (err) {
      // Provider raised — try the next one.
      continue;
    }
  }
  // Fallback: mock provider always returns something.
  const mock = providers.find((p) => p.id === "mock");
  if (!mock) throw new Error("No mock provider registered");
  const result = await mock.fetchQuote(req);
  setCachedQuote(cacheKey, result);
  return result;
}

export function quoteCacheKey(id: AssetIdentifier): string {
  return `${id.type}:${id.value}`;
}

export function classifyConfidence(result: MarketDataResult): ConfidenceLevel {
  if (result.isMock) return "low";
  if (result.quoteType === "real_time") return "high";
  if (result.quoteType === "delayed" || result.quoteType === "eod") return "high";
  if (result.quoteType === "reference") return "medium";
  return "medium";
}

export function holdingsEligibleForEnrichment(holdings: Holding[]): Holding[] {
  return holdings.filter((h) => {
    if (!h.identifier) return false;
    if (h.identifier.type === "internal" || h.identifier.type === "none" || h.identifier.type === "wallet_address" || h.identifier.type === "custom") return false;
    if (h.assetClass === "private_equity" || h.assetClass === "private_credit" || h.assetClass === "real_estate" || h.assetClass === "business" || h.assetClass === "collectible") return false;
    return true;
  });
}
