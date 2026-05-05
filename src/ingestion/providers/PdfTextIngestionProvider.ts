import type { IngestionProvider } from "../types/ingestionTypes";
import { parsePdfBuffer } from "../parsers/parsePdfText";

export const PdfTextIngestionProvider: IngestionProvider = {
  name: "PDF (text)",
  supportedSourceTypes: ["pdf_text"],
  async extract(input) {
    const start = Date.now();
    const buf = Buffer.from(input.contentBase64 ?? "", "base64");
    const { account, rawText, pages } = await parsePdfBuffer(buf, input.fileName);
    return {
      ok: account.holdings.length > 0,
      accounts: [account],
      warnings: account.holdings.length === 0
        ? [{ code: "LOW_OCR_CONFIDENCE", severity: "warning", message: `Extracted PDF text but no holdings detected across ${pages} page(s). Try OCR for scanned documents.` }]
        : [],
      rawText: rawText.slice(0, 8000),
      extractionMethod: "pdf-parse",
      extractionMs: Date.now() - start,
    };
  },
};
