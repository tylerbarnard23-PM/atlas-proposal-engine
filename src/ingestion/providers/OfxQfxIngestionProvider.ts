import type { IngestionProvider } from "../types/ingestionTypes";
import { parseOfxText } from "../parsers/parseOfxQfx";

export const OfxQfxIngestionProvider: IngestionProvider = {
  name: "OFX / QFX",
  supportedSourceTypes: ["ofx_qfx"],
  async extract(input) {
    const start = Date.now();
    const text = input.text ?? (input.contentBase64 ? Buffer.from(input.contentBase64, "base64").toString("utf8") : "");
    const account = parseOfxText(text, input.fileName);
    return {
      ok: account.holdings.length > 0,
      accounts: [account],
      warnings: [],
      rawText: text.slice(0, 4000),
      extractionMethod: "regex",
      extractionMs: Date.now() - start,
    };
  },
};
