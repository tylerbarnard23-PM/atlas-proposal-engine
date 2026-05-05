import type { ExtractionResult, SourceType } from "@/domain/types";

export interface IngestionInput {
  sourceType: SourceType;
  fileName?: string;
  // For text-based ingestion
  text?: string;
  // For binary uploads, base64 encoded
  contentBase64?: string;
  contentType?: string;
}

export interface IngestionProvider {
  name: string;
  supportedSourceTypes: SourceType[];
  extract(input: IngestionInput): Promise<ExtractionResult>;
}

export interface ColumnMapping {
  symbol?: string;
  name?: string;
  quantity?: string;
  price?: string;
  marketValue?: string;
  costBasis?: string;
  currency?: string;
  cusip?: string;
  isin?: string;
  account?: string;
  assetClass?: string;
}
