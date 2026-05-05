import type { MarketDataResult } from "@/domain/types";

interface CacheEntry {
  value: MarketDataResult;
  cachedAt: number;
}

const QUOTE_CACHE = new Map<string, CacheEntry>();
const QUOTE_TTL_MS = 5 * 60_000; // 5 minutes

export function getCachedQuote(key: string): MarketDataResult | null {
  const entry = QUOTE_CACHE.get(key);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > QUOTE_TTL_MS) {
    QUOTE_CACHE.delete(key);
    return null;
  }
  return entry.value;
}

export function setCachedQuote(key: string, value: MarketDataResult) {
  QUOTE_CACHE.set(key, { value, cachedAt: Date.now() });
}

export function clearQuoteCache() {
  QUOTE_CACHE.clear();
}

export function cacheStats() {
  return {
    size: QUOTE_CACHE.size,
    ttlMs: QUOTE_TTL_MS,
  };
}
