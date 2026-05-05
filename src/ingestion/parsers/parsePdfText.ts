import { parsePastedText } from "./parsePastedText";
import type { ExtractedAccount } from "@/domain/types";

// pdf-parse is CommonJS and pulls in test files at module load; we lazy-import.
export async function parsePdfBuffer(buffer: Buffer, accountHint?: string): Promise<{ account: ExtractedAccount; rawText: string; pages: number }> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse: (b: Buffer) => Promise<{ text: string; numpages: number }> = (await import("pdf-parse")).default as never;
  const data = await pdfParse(buffer);
  const account = parsePastedText(data.text, accountHint);
  return { account, rawText: data.text, pages: data.numpages };
}
