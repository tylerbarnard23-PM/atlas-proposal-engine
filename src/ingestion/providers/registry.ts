import type { IngestionProvider } from "../types/ingestionTypes";
import { CsvIngestionProvider } from "./CsvIngestionProvider";
import { ExcelIngestionProvider } from "./ExcelIngestionProvider";
import { ImageOcrIngestionProvider } from "./ImageOcrIngestionProvider";
import { ManualEntryProvider } from "./ManualEntryProvider";
import { OfxQfxIngestionProvider } from "./OfxQfxIngestionProvider";
import { PastedTextIngestionProvider } from "./PastedTextIngestionProvider";
import { PdfTextIngestionProvider } from "./PdfTextIngestionProvider";
import type { SourceType } from "@/domain/types";

const ALL: IngestionProvider[] = [
  ManualEntryProvider,
  CsvIngestionProvider,
  ExcelIngestionProvider,
  PastedTextIngestionProvider,
  PdfTextIngestionProvider,
  ImageOcrIngestionProvider,
  OfxQfxIngestionProvider,
];

export function ingestionProviders(): IngestionProvider[] {
  return ALL;
}

export function ingestionProviderFor(sourceType: SourceType): IngestionProvider | undefined {
  return ALL.find((p) => p.supportedSourceTypes.includes(sourceType));
}
