import type { ExtractedAccount } from "@/domain/types";
import { parsePastedText } from "./parsePastedText";

export async function parseImageOcr(buffer: Buffer, accountHint?: string): Promise<{ account: ExtractedAccount; rawText: string; confidence: number }> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  try {
    const result = await worker.recognize(buffer);
    const text = result.data.text;
    const confidence = result.data.confidence ?? 0;
    const account = parsePastedText(text, accountHint);
    if (confidence < 70) {
      account.warnings.push({
        code: "LOW_OCR_CONFIDENCE",
        severity: "warning",
        message: `OCR confidence ${confidence.toFixed(0)} — review extracted rows.`,
      });
    }
    return { account, rawText: text, confidence };
  } finally {
    await worker.terminate();
  }
}
