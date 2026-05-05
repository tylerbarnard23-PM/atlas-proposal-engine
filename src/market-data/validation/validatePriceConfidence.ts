import type { ConfidenceLevel, MarketDataResult } from "@/domain/types";

export function priceConfidence(result: MarketDataResult): ConfidenceLevel {
  if (!result.ok) return "low";
  if (result.isMock) return "low";
  if (result.quoteType === "real_time" || result.quoteType === "eod" || result.quoteType === "delayed") return "high";
  if (result.quoteType === "reference") return "medium";
  return "medium";
}
