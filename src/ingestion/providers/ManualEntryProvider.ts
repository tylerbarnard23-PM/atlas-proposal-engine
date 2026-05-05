import type { IngestionProvider } from "../types/ingestionTypes";
import { safeId } from "@/utils/formatting";

export const ManualEntryProvider: IngestionProvider = {
  name: "Manual Entry",
  supportedSourceTypes: ["manual"],
  async extract() {
    return {
      ok: true,
      accounts: [
        {
          id: safeId("ea"),
          accountName: "Manual Entry",
          holdings: [],
          fields: {},
          warnings: [],
          confidence: "high",
        },
      ],
      warnings: [],
      extractionMethod: "manual",
      extractionMs: 0,
    };
  },
};
