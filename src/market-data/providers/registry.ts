import type { MarketDataProvider } from "../types/marketDataTypes";
import { AlphaVantageProvider } from "./AlphaVantageProvider";
import { CoinGeckoProvider } from "./CoinGeckoProvider";
import { EcbFxProvider } from "./EcbFxProvider";
import { FinnhubProvider } from "./FinnhubProvider";
import { FrankfurterFxProvider } from "./FrankfurterFxProvider";
import { FredProvider } from "./FredProvider";
import { ManualValuationProvider } from "./ManualValuationProvider";
import { MockMarketDataProvider } from "./MockMarketDataProvider";
import { SecEdgarProvider } from "./SecEdgarProvider";
import { TwelveDataProvider } from "./TwelveDataProvider";

const ALL: MarketDataProvider[] = [
  // Real / free / no-key first
  FrankfurterFxProvider,
  EcbFxProvider,
  CoinGeckoProvider,
  SecEdgarProvider,
  // Real / key-required
  AlphaVantageProvider,
  FinnhubProvider,
  TwelveDataProvider,
  FredProvider,
  // Manual + mock fallbacks last
  ManualValuationProvider,
  MockMarketDataProvider,
];

export interface RegistryOptions {
  preferredProviderId?: string;
}

export function providerRegistry(opts: RegistryOptions = {}): MarketDataProvider[] {
  if (!opts.preferredProviderId) return ALL;
  const preferred = ALL.find((p) => p.id === opts.preferredProviderId);
  if (!preferred) return ALL;
  return [preferred, ...ALL.filter((p) => p.id !== opts.preferredProviderId)];
}

export function listProviders(): MarketDataProvider[] {
  return ALL;
}
