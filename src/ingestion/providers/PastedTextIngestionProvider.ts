import type { IngestionProvider } from "../types/ingestionTypes";
import { parsePastedText } from "../parsers/parsePastedText";

export const PastedTextIngestionProvider: IngestionProvider = {
  name: "Pasted Text",
  supportedSourceTypes: ["pasted_text"],
  async extract(input) {
    const start = Date.now();
    const account = parsePastedText(input.text ?? "", input.fileName);
    return {
      ok: account.holdings.length > 0,
      accounts: [account],
      warnings: [],
      rawText: (input.text ?? "").slice(0, 4000),
      extractionMethod: "heuristic",
      extractionMs: Date.now() - start,
    };
  },
};
