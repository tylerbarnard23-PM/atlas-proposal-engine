// The ECB does not host a public JSON endpoint with the same ergonomics as Frankfurter.
// Frankfurter sources its rates from the ECB and we treat that as our canonical ECB-derived feed.
// This file exists to preserve the architectural separation requested in the spec and to make it
// easy to swap in a direct ECB SDMX integration later. For now it delegates to Frankfurter.

import { FrankfurterFxProvider } from "./FrankfurterFxProvider";
import type { MarketDataProvider } from "../types/marketDataTypes";

export const EcbFxProvider: MarketDataProvider = {
  ...FrankfurterFxProvider,
  id: "ecb",
  name: "ECB (via Frankfurter)",
  attributionLine: "European Central Bank reference rates (delivered through frankfurter.app).",
};
