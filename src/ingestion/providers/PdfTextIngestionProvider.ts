import type { IngestionProvider } from "../types/ingestionTypes";
import { readPdfInNode } from "../pdf/readPdfNode";
import { parseStatementPdf } from "../documents/parseStatementPdf";

// Server-side PDF path, for API callers. The Import Center reads PDFs in the
// browser instead (no upload size limit); both use the same layout-aware
// reader and document parsers, so results are identical.
export const PdfTextIngestionProvider: IngestionProvider = {
  name: "PDF (text)",
  supportedSourceTypes: ["pdf_text"],
  async extract(input) {
    const buf = Buffer.from(input.contentBase64 ?? "", "base64");
    const pdf = await readPdfInNode(buf);
    const result = parseStatementPdf(pdf, input.fileName);
    return { ...result, rawText: pdf.pages.flat().join("\n").slice(0, 8000) };
  },
};
