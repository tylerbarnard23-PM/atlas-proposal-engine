import type { MarketDataResult } from "@/domain/types";

export interface FreshnessVerdict {
  fresh: boolean;
  ageMs: number;
  ageMinutes: number;
  warning?: string;
}

export function evaluateFreshness(result: MarketDataResult, nowMs = Date.now()): FreshnessVerdict {
  const ts = result.asOf ? Date.parse(result.asOf) : Date.parse(result.fetchedAt);
  const age = Math.max(0, nowMs - ts);
  const minutes = age / 60_000;
  if (result.quoteType === "real_time" && minutes > 5) {
    return { fresh: false, ageMs: age, ageMinutes: minutes, warning: "Quote labeled real-time but older than 5 minutes." };
  }
  if (result.quoteType === "delayed" && minutes > 60) {
    return { fresh: false, ageMs: age, ageMinutes: minutes, warning: "Delayed quote older than 60 minutes." };
  }
  if (result.quoteType === "eod" && minutes > 60 * 24 * 2) {
    return { fresh: false, ageMs: age, ageMinutes: minutes, warning: "End-of-day quote older than 2 days." };
  }
  return { fresh: true, ageMs: age, ageMinutes: minutes };
}
