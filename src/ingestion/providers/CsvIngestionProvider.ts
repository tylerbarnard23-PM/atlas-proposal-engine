import type { IngestionProvider } from "../types/ingestionTypes";
import { parseCsvText } from "../parsers/parseCsv";

export const CsvIngestionProvider: IngestionProvider = {
  name: "CSV",
  supportedSourceTypes: ["csv"],
  async extract(input) {
    const start = Date.now();
    const text = input.text ?? (input.contentBase64 ? Buffer.from(input.contentBase64, "base64").toString("utf8") : "");
    const { account, warnings } = parseCsvText(text, input.fileName);
    return {
      ok: true,
      accounts: [account],
      warnings,
      extractionMethod: "papaparse",
      extractionMs: Date.now() - start,
      rawText: text.slice(0, 4000),
    };
  },
};
