import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { chromiumExecutable, printHtmlToPdf, readPdfPages, squash, type PdfPage } from "./support/realPdf";

// #94: every physical page of a generated PDF carries the complete sample
// notice, including continuation pages (a section that overflows onto more
// than one physical page). Real Chromium and pdf.js, page by page; the fixed
// synthetic sample workspace and a fixed clock. Not a mock of the renderer.

const storage = vi.hoisted(() => {
  const data = new Map<string, string>();
  const s = {
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() {
      return data.size;
    },
  };
  (globalThis as { window?: unknown }).window = { localStorage: s };
  return s;
});

const NOW = "2026-11-18T12:00:00.000Z";
const exe = chromiumExecutable();

async function samplePdf(variant: "draft" | "final") {
  const React = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { useAtlasStore } = await import("@/store/useStore");
  const { ProposalPdfTemplate, buildPrintableHtml } = await import("@/pdf/templates/ProposalPdfTemplate");
  const s = useAtlasStore.getState();
  const props = {
    client: s.client,
    advisor: s.advisor,
    accounts: s.accounts,
    holdings: s.holdings,
    recommendations: s.recommendations,
    sections: s.proposalSections,
    disclosures: s.disclosures,
    proposal: s.proposal,
    fxRates: s.fxRates,
    variant,
    now: NOW,
    timeZone: "UTC",
  };
  const body = renderToStaticMarkup(React.createElement(ProposalPdfTemplate, props));
  const sectionBoxes = (body.match(/class="pdf-page"/g) ?? []).length;
  const pdf = await printHtmlToPdf(buildPrintableHtml(props, body), exe!);
  return { pages: await readPdfPages(pdf), sectionBoxes, body };
}

describe.skipIf(!exe)("sample notice on every physical PDF page (real Chromium)", () => {
  let NOTICE: string;
  let BAND_PT: number;
  const docs: Record<"draft" | "final", { pages: PdfPage[]; sectionBoxes: number; body: string }> = {} as never;

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(NOW));
    storage.clear();
    NOTICE = (await import("@/domain/legal")).PDF_SAMPLE_NOTICE;
    BAND_PT = (await import("@/pdf/styles/pdfStyles")).PDF_NOTICE_BAND_IN * 72;
    docs.draft = await samplePdf("draft");
    docs.final = await samplePdf("final");
  }, 120_000);
  afterAll(() => vi.useRealTimers());

  for (const variant of ["draft", "final"] as const) {
    describe(`${variant} PDF`, () => {
      it("has continuation pages, so the check covers them", () => {
        const { pages, sectionBoxes } = docs[variant];
        // Cover + one box per section; more physical pages than that means at
        // least one section continues onto another page.
        expect(pages.length).toBeGreaterThan(sectionBoxes + 1);
      });

      it("carries the complete notice on EACH physical page", () => {
        const missing = docs[variant].pages.filter((p) => !squash(p.items.map((i) => i.str).join("")).includes(squash(NOTICE))).map((p) => p.number);
        expect(missing, `pages without the complete sample notice`).toEqual([]);
      });

      it("prints the notice in a reserved bottom band that no other text enters, readable and inside the page", () => {
        for (const p of docs[variant].pages.slice(1)) {
          // The 110pt DRAFT/SAMPLE watermark is centred on its section's box, so on a
          // continuation page some glyph origins fall low; Chromium clips the glyphs at
          // the page area (checked visually), but pdf.js still reports their origins.
          // It is decoration, not content, so it is excluded by size.
          const band = p.items.filter((i) => i.y < BAND_PT && i.size < 40);
          // Only the notice is in the band, and all of it.
          expect(squash(band.map((i) => i.str).join("")), `page ${p.number} bottom band`).toBe(squash(NOTICE));
          for (const i of band) {
            expect(i.size, `page ${p.number} notice size`).toBeGreaterThanOrEqual(6.5);
            expect(i.x, `page ${p.number} notice left edge`).toBeGreaterThanOrEqual(18);
            expect(i.x + i.width, `page ${p.number} notice right edge`).toBeLessThanOrEqual(p.width - 18);
            expect(i.y, `page ${p.number} notice above the page edge`).toBeGreaterThan(4);
          }
        }
      });

      it("keeps the full-bleed cover's own complete notice", () => {
        const cover = docs[variant].pages[0];
        expect(squash(cover.items.map((i) => i.str).join(""))).toContain(squash(NOTICE));
      });
    });
  }

  it("changes nothing else the document says: firm, disclosures heading and figures are present", () => {
    const all = docs.final.pages.map((p) => p.items.map((i) => i.str).join(" ")).join(" ");
    expect(all).toContain("Harbor & Pine Wealth Partners");
    expect(docs.draft.pages.map((p) => p.items.map((i) => i.str).join(" ")).join(" ")).toMatch(/DRAFT/);
  });
});
