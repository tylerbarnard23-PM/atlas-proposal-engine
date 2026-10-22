// The final-PDF route's Chromium boundary, faked for readiness tests: the real
// route parses the request, evaluates readiness at the server clock and
// renders the template; only puppeteer (browser launch and printing) and the
// host browser lookup are replaced, so these tests need no browser, network
// or real PDF. Actual PDF generation is covered by the recorded smoke test.
//
// Use in a test file:
//   vi.mock("puppeteer-core", async () => (await import("./support/fakeChromium")).puppeteerModule);
//   vi.mock("@/pdf/chromiumPath", async () => (await import("./support/fakeChromium")).chromiumPathModule);

export const FAKE_PDF = new TextEncoder().encode("%PDF-1.7 fake");

/** What reached the boundary since the last reset(). */
export const chromium = {
  launches: 0,
  closed: 0,
  /** The printable HTML each page was given. */
  html: [] as string[],
  reset() {
    this.launches = 0;
    this.closed = 0;
    this.html = [];
  },
};

export const puppeteerModule = {
  default: {
    launch: async () => {
      chromium.launches++;
      return {
        newPage: async () => ({
          emulateMediaType: async () => undefined,
          setContent: async (html: string) => {
            chromium.html.push(html);
          },
          pdf: async () => FAKE_PDF,
        }),
        close: async () => {
          chromium.closed++;
        },
      };
    },
  },
};

export const chromiumPathModule = {
  resolveChromiumExecutable: () => "/fake/chromium",
  ChromiumNotFoundError: class ChromiumNotFoundError extends Error {},
};
