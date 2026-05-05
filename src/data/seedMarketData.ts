import type { MarketDataResult } from "@/domain/types";

// Pre-seeded snapshots so the Market Data page renders coherently when no API keys are configured.
export const SEED_MARKET_QUOTES: MarketDataResult[] = [
  {
    ok: true,
    providerId: "mock",
    providerName: "Mock Market Data",
    identifier: { type: "ticker", value: "AAPL" },
    price: 224.18,
    currency: "USD",
    asOf: "2026-04-30T20:00:00Z",
    quoteType: "eod",
    fetchedAt: "2026-05-04T11:55:00Z",
    isMock: true,
  },
  {
    ok: true,
    providerId: "mock",
    providerName: "Mock Market Data",
    identifier: { type: "ticker", value: "MSFT" },
    price: 462.73,
    currency: "USD",
    asOf: "2026-04-30T20:00:00Z",
    quoteType: "eod",
    fetchedAt: "2026-05-04T11:55:00Z",
    isMock: true,
  },
  {
    ok: true,
    providerId: "mock",
    providerName: "Mock Market Data",
    identifier: { type: "ticker", value: "VTI" },
    price: 286.42,
    currency: "USD",
    asOf: "2026-04-30T20:00:00Z",
    quoteType: "eod",
    fetchedAt: "2026-05-04T11:55:00Z",
    isMock: true,
  },
];
