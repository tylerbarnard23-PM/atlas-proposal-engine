// TEMPORARY CI diagnostic for PR #60 (removed in the following commit): times
// each stage of the final-PDF route when readiness passes, under fake and real Date.
import { describe, expect, it, vi } from "vitest";
import type { Account, FxRate, Holding, Recommendation } from "@/domain/types";
import { confirmStaleRates } from "@/engines/fxPolicy";
import { SEED_ADVISOR, SEED_CLIENT } from "@/data/seedClient";
import { DISCLOSURE_LIBRARY } from "@/domain/disclosureLibrary";

const T0 = performance.now();
let tag = "";
const log = (m: string) => console.log(`PROBE[${tag}] +${Math.round(performance.now() - T0)}ms ${m} (Date=${new Date(Date.now()).toISOString()})`);

vi.mock("puppeteer-core", async (orig) => {
  const real = ((await orig()) as { default: { launch: (o: Record<string, unknown>) => Promise<any> } }).default;
  const wrap = (obj: any, name: string) => {
    const f = obj[name].bind(obj);
    obj[name] = async (...a: unknown[]) => {
      log(`${name} start`);
      try {
        const r = await f(...a);
        log(`${name} done`);
        return r;
      } catch (e) {
        log(`${name} threw ${(e as Error).message}`);
        throw e;
      }
    };
  };
  return {
    default: {
      launch: async (o: Record<string, unknown>) => {
        log(`launch start ${o.executablePath} headless=${String(o.headless)}`);
        const b = await real.launch({ ...o, dumpio: true });
        log(`launch done ${await b.version()}`);
        const newPage = b.newPage.bind(b);
        b.newPage = async () => {
          const p = await newPage();
          log("newPage done");
          wrap(p, "emulateMediaType");
          wrap(p, "setContent");
          wrap(p, "pdf");
          return p;
        };
        wrap(b, "close");
        return b;
      },
    },
  };
});

const OLD = "2026-04-30T00:00:00Z";
const NOW = new Date("2026-10-22T12:00:00Z");
const ACCOUNTS = [{ id: "a1", name: "A1", type: "brokerage", baseCurrency: "USD", createdAt: OLD, updatedAt: OLD } as Account];
const h = (id: string, currency: string, v: number) =>
  ({ id, accountId: "a1", assetName: id, assetClass: "equity", currency, nativeMarketValue: v, valuationDate: "2026-10-20", valuationSource: { kind: "statement", asOf: "2026-10-20", confidence: "high" }, quoteType: "manual", priceFreshness: "manual", dataQuality: [], advisorVerification: "advisor_approved", sourceTrace: { sourceType: "manual" }, createdAt: OLD, updatedAt: OLD }) as unknown as Holding;
const holdings = [h("usd_eq", "USD", 1000), h("eur_eq", "EUR", 1000)];
const fxRates: FxRate[] = [{ base: "EUR", quote: "USD", rate: 1.1, asOf: OLD, source: "ECB" }];
const rec = { id: "r1", title: "Trim", type: "reduce", rationale: "x", relatedHoldingId: "usd_eq", currency: "USD", actionAmount: 1, actionAmountUnit: "amount", approvedByAdvisor: true, includeInPdf: true, status: "approved", createdAt: OLD, updatedAt: OLD } as unknown as Recommendation;

async function run(name: string, fake: boolean) {
  tag = name;
  if (fake) {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  }
  const now = fake ? NOW : new Date();
  try {
    log(`chrome candidates: ${["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"].filter((p) => require("node:fs").existsSync(p)).join(", ")}`);
    log("import start");
    const { POST } = await import("@/app/api/proposals/[id]/generate-pdf/route");
    log("import done");
    const fxConfirmation = confirmStaleRates({ holdings, accounts: ACCOUNTS, recommendations: [rec], fxRates, reportingCurrency: "USD", now });
    const state = { client: SEED_CLIENT, advisor: SEED_ADVISOR, accounts: ACCOUNTS, holdings, recommendations: [rec], disclosures: DISCLOSURE_LIBRARY, fxRates, sourceDocuments: [], sections: [], proposal: { id: "p1" }, fxConfirmation };
    log("POST start");
    const res = await POST(new Request("http://localhost/api/proposals/p1/generate-pdf?variant=final", { method: "POST", body: JSON.stringify({ state }) }), { params: Promise.resolve({ id: "p1" }) });
    log(`POST done ${res.status} ${res.headers.get("content-type")} ${res.status === 422 ? JSON.stringify(await res.json()) : ""}`);
    expect(res.status).toBeGreaterThan(0);
  } finally {
    vi.useRealTimers();
  }
}

describe("CI probe: final-PDF route stages", () => {
  it("fake Date (as the failing test)", () => run("fake", true), 45_000);
  it("real Date", () => run("real", false), 45_000);
});
