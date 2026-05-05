import type { IngestionProvider } from "../types/ingestionTypes";
import { parseImageOcr } from "../parsers/parseImageOcr";

export const ImageOcrIngestionProvider: IngestionProvider = {
  name: "Image / Screenshot OCR",
  supportedSourceTypes: ["image_screenshot", "pdf_scanned"],
  async extract(input) {
    const start = Date.now();
    const buf = Buffer.from(input.contentBase64 ?? "", "base64");
    const { account, rawText, confidence } = await parseImageOcr(buf, input.fileName);
    return {
      ok: account.holdings.length > 0,
      accounts: [account],
      warnings: account.warnings,
      rawText: rawText.slice(0, 8000),
      extractionMethod: `tesseract.js (confidence ${confidence.toFixed(0)})`,
      extractionMs: Date.now() - start,
    };
  },
};
