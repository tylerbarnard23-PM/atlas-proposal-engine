"use client";

import { itemsToLines, type PdfText, type PositionedText } from "./layoutLines";

export const MAX_PDF_BYTES = 25 * 1024 * 1024;
export const MAX_PDF_PAGES = 300;

export class PdfReadError extends Error {
  constructor(
    message: string,
    readonly kind: "not_pdf" | "too_large" | "password" | "unreadable" | "too_many_pages"
  ) {
    super(message);
  }
}

// Reads a PDF entirely in the browser with pdf.js. The file never leaves the
// advisor's machine; only the extracted text is processed. pdf.js runs in a
// worker, and version 6+ never evaluates code from fonts (the vector behind
// CVE-2024-4367); scripting is off by default. PDFs are untrusted input.
export async function readPdfInBrowser(
  file: File,
  onProgress?: (page: number, total: number) => void
): Promise<PdfText> {
  if (file.type && file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    throw new PdfReadError("That file isn't a PDF.", "not_pdf");
  }
  if (file.size > MAX_PDF_BYTES) {
    throw new PdfReadError(`That PDF is ${(file.size / 1024 / 1024).toFixed(1)} MB; the limit is 25 MB.`, "too_large");
  }

  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

  const data = new Uint8Array(await file.arrayBuffer());
  if (!(data[0] === 0x25 && data[1] === 0x50 && data[2] === 0x44 && data[3] === 0x46)) {
    throw new PdfReadError("That file isn't a PDF (it doesn't start with a PDF header).", "not_pdf");
  }

  const task = pdfjs.getDocument({ data, disableAutoFetch: true });
  let doc;
  try {
    doc = await task.promise;
  } catch (e) {
    await task.destroy();
    const name = (e as { name?: string }).name;
    if (name === "PasswordException") throw new PdfReadError("That PDF is password-protected. Remove the password and try again.", "password");
    throw new PdfReadError("That PDF couldn't be read. It may be damaged.", "unreadable");
  }
  if (doc.numPages > MAX_PDF_PAGES) {
    await task.destroy();
    throw new PdfReadError(`That PDF has ${doc.numPages} pages; the limit is ${MAX_PDF_PAGES}.`, "too_many_pages");
  }

  const pages: string[][] = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      onProgress?.(n, doc.numPages);
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const items: PositionedText[] = [];
      for (const it of content.items) {
        if (!("str" in it)) continue;
        items.push({ str: it.str, x: it.transform[4], y: it.transform[5], width: it.width, height: it.height });
      }
      pages.push(itemsToLines(items));
      page.cleanup();
    }
  } finally {
    await task.destroy();
  }
  return { pageCount: pages.length, pages };
}
