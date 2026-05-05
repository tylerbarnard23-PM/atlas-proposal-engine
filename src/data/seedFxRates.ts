import type { FxRate } from "@/domain/types";

// Reference rates seeded for offline use; replaced live by Frankfurter when available.
export const SEED_FX_RATES: FxRate[] = [
  { base: "USD", quote: "USD", rate: 1, asOf: "2026-04-30T00:00:00Z", source: "ECB" },
  { base: "EUR", quote: "USD", rate: 1.085, asOf: "2026-04-30T00:00:00Z", source: "ECB" },
  { base: "GBP", quote: "USD", rate: 1.262, asOf: "2026-04-30T00:00:00Z", source: "ECB" },
  { base: "CHF", quote: "USD", rate: 1.118, asOf: "2026-04-30T00:00:00Z", source: "ECB" },
  { base: "JPY", quote: "USD", rate: 0.00638, asOf: "2026-04-30T00:00:00Z", source: "ECB" },
  { base: "CAD", quote: "USD", rate: 0.732, asOf: "2026-04-30T00:00:00Z", source: "ECB" },
  { base: "AUD", quote: "USD", rate: 0.661, asOf: "2026-04-30T00:00:00Z", source: "ECB" },
  { base: "SGD", quote: "USD", rate: 0.741, asOf: "2026-04-30T00:00:00Z", source: "ECB" },
  { base: "HKD", quote: "USD", rate: 0.128, asOf: "2026-04-30T00:00:00Z", source: "ECB" },
  { base: "MXN", quote: "USD", rate: 0.0584, asOf: "2026-04-30T00:00:00Z", source: "ECB" },
];
