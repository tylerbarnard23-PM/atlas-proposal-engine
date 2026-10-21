import { itemsToLines, toDisplay, type PdfText, type PositionedText } from "./layoutLines";

// Server/test counterpart of readPdfInBrowser. Uses the same pdf.js version
// (its Node build), so the server, the tests and the browser all see
// identical text: different pdf.js versions split and decode text
// differently (e.g. "BalanceSheet" vs "Balance Sheet").
export async function readPdfInNode(buffer: Buffer | Uint8Array): Promise<PdfText> {
  // Loading the worker module registers it on globalThis.pdfjsWorker, so pdf.js
  // runs it in-process instead of looking for a worker file on disk (which a
  // bundled server build doesn't have).
  await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: new Uint8Array(buffer), disableAutoFetch: true, useSystemFonts: false });
  const pages: string[][] = [];
  const positioned: PositionedText[][] = [];
  try {
    const doc = await task.promise;
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      // Positions as displayed, honoring the page's rotation.
      const viewport = page.getViewport({ scale: 1 });
      const items: PositionedText[] = [];
      for (const it of content.items) {
        if (!("str" in it)) continue;
        items.push(toDisplay(it, viewport));
      }
      pages.push(itemsToLines(items));
      positioned.push(items);
      page.cleanup();
    }
  } finally {
    await task.destroy();
  }
  return { pageCount: pages.length, pages, items: positioned };
}
