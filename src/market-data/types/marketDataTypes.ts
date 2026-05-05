import type {
  AssetIdentifier,
  AssetType,
  ConfidenceLevel,
  CurrencyCode,
  FundamentalsRequest,
  FundamentalsResult,
  HistoricalDataRequest,
  HistoricalDataResult,
  IdentifierType,
  MarketDataRequest,
  MarketDataResult,
  QuoteType,
} from "@/domain/types";

export interface MarketDataProvider {
  id: string;
  name: string;
  sourceType: "official" | "exchange" | "aggregator" | "manual" | "mock";
  attributionLine?: string;
  supportedAssetTypes: AssetType[];
  supportedIdentifiers: IdentifierType[];
  requiresApiKey: boolean;
  hasApiKey?: () => boolean;
  fetchQuote(input: MarketDataRequest): Promise<MarketDataResult>;
  fetchHistory?(input: HistoricalDataRequest): Promise<HistoricalDataResult>;
  fetchFundamentals?(input: FundamentalsRequest): Promise<FundamentalsResult>;
}

export type {
  AssetIdentifier,
  AssetType,
  ConfidenceLevel,
  CurrencyCode,
  FundamentalsRequest,
  FundamentalsResult,
  HistoricalDataRequest,
  HistoricalDataResult,
  MarketDataRequest,
  MarketDataResult,
  QuoteType,
};
