import type { IngestionProvider } from "../types/ingestionTypes";
import { parseExcelBuffer } from "../parsers/parseExcel";

export const ExcelIngestionProvider: IngestionProvider = {
  name: "Excel",
  supportedSourceTypes: ["excel"],
  async extract(input) {
    const start = Date.now();
    const buf = Buffer.from(input.contentBase64 ?? "", "base64");
    const { accounts } = parseExcelBuffer(buf, input.fileName);
    return {
      ok: accounts.length > 0,
      accounts,
      warnings: [],
      extractionMethod: "xlsx",
      extractionMs: Date.now() - start,
    };
  },
};
