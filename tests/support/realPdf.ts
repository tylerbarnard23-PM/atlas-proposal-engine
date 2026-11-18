// Real-renderer PDF helpers for tests: print HTML with the installed Chromium
// and the route's own print options, then read each physical page with pdf.js.
// Synthetic data only. Used by tests/pdfPageNotice.test.ts.
import { resolveChromiumExecutable } from "@/pdf/chromiumPath";
import { PDF_PRINT_OPTIONS } from "@/pdf/printOptions";

export const chromiumExecutable = (): string | null => resolveChromiumExecutable();

/** Prints a complete HTML document to PDF exactly as the generate-pdf route does. */
export async function printHtmlToPdf(html: string, executablePath: string): Promise<Uint8Array> {
  const puppeteer = (await import("puppeteer-core")).default;
  const browser = await puppeteer.launch({ executablePath, headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox", "--font-render-hinting=none"] });
  try {
    const page = await browser.newPage();
    await page.emulateMediaType("print");
    await page.setContent(html, { waitUntil: "load", timeout: 60_000 });
    return new Uint8Array(await page.pdf({ ...PDF_PRINT_OPTIONS, margin: { ...PDF_PRINT_OPTIONS.margin } }));
  } finally {
    await browser.close().catch(() => {});
  }
}

export interface PdfTextItem {
  str: string;
  /** Left edge and baseline, in points from the page's bottom-left corner. */
  x: number;
  y: number;
  width: number;
  /** Font size in points. */
  size: number;
}

export interface PdfPage {
  number: number;
  width: number;
  height: number;
  items: PdfTextItem[];
}

/** Every physical page with its positioned text. */
export async function readPdfPages(data: Uint8Array): Promise<PdfPage[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: data.slice(), useSystemFonts: false });
  const doc = await task.promise;
  const pages: PdfPage[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const view = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items: PdfTextItem[] = [];
    for (const it of content.items) {
      if (!("str" in it) || !it.str.trim()) continue;
      const [a, b, , , e, f] = it.transform as number[];
      items.push({ str: it.str, x: e, y: f, width: it.width, size: Math.hypot(a, b) });
    }
    pages.push({ number: n, width: view.width, height: view.height, items });
  }
  await task.destroy();
  return pages;
}

/** Text compared without whitespace or ligature differences (pdf.js splits "fi" ligatures). */
export const squash = (s: string) => s.normalize("NFKC").replace(/\s+/g, "");
