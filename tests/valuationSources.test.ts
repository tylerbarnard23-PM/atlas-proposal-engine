import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import type { Disclosure, Holding, Proposal, ProposalSection, Recommendation, SourceDocument } from "@/domain/types";

// R18 slice 1 (#51): Atlas doesn't present security quotes in the ordinary
// journey, and the Dashboard and PDF describe the source of each value the
// valuation resolver actually uses, with its own recorded date. Nothing here
// changes a calculation, approval, readiness check or stored field.

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

const NOW = new Date("2026-10-23T12:00:00Z");

async function load() {
  return {
    ...(await import("@/store/useStore")),
    ...(await import("@/engines/workspaceBackup")),
    ...(await import("@/engines/valuationProvenance")),
    ...(await import("@/engines/normalizationEngine")),
    ...(await import("@/engines/valuationTotals")),
    ...(await import("@/engines/proposalEngine")),
    ...(await import("@/engines/complianceEngine")),
    ...(await import("@/domain/disclosureLibrary")),
    ...(await import("@/pdf/templates/ProposalPdfTemplate")),
  };
}
type M = Awaited<ReturnType<typeof load>>;

beforeEach(() => {
  vi.resetModules();
  storage.clear();
});
afterEach(() => vi.unstubAllGlobals());

const approveAll = (recs: Recommendation[]) => recs.map((r) => ({ ...r, approvedByAdvisor: true, includeInPdf: true, status: "approved" as const }));

function readiness(m: M, s: ReturnType<M["useAtlasStore"]["getState"]>, patch: Partial<Parameters<M["evaluateWorkspaceReadiness"]>[0]> = {}) {
  return m.evaluateWorkspaceReadiness({
    client: s.client, advisor: s.advisor, accounts: s.accounts, holdings: s.holdings, recommendations: s.recommendations,
    disclosures: s.disclosures, fxRates: s.fxRates, sourceDocuments: s.sourceDocuments, fxConfirmation: s.fxConfirmation, now: NOW, ...patch,
  });
}
const gates = (checks: { code: string; passed: boolean; detail?: string }[]) => checks.map((c) => [c.code, c.passed, c.detail ?? null]);

function pdfText(m: M, s: ReturnType<M["useAtlasStore"]["getState"]>, patch: { holdings?: Holding[]; sections?: ProposalSection[]; disclosures?: Disclosure[]; recommendations?: Recommendation[]; timeZone?: string } = {}) {
  const html = renderToStaticMarkup(
    React.createElement(m.ProposalPdfTemplate, {
      client: s.client, advisor: s.advisor, accounts: s.accounts, holdings: patch.holdings ?? s.holdings,
      recommendations: patch.recommendations ?? approveAll(s.recommendations), sections: patch.sections ?? s.proposalSections,
      disclosures: patch.disclosures ?? s.disclosures, fxRates: s.fxRates, proposal: { id: "p", title: "Proposal" } as Proposal,
      variant: "draft", now: NOW.toISOString(), timeZone: patch.timeZone ?? "UTC",
    })
  );
  return html.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
}

// Holdings that cover every value basis. The approved value was locked from a
// legacy provider quote although the holding itself now shows a statement.
function variety(m: M): Holding[] {
  const base = m.useAtlasStore.getState().holdings;
  const at = (id: string) => base.find((h) => h.id === id)!;
  return base.map((h) => {
    switch (h.id) {
      case "h_aapl":
        return {
          ...h,
          advisorVerification: "locked_for_proposal",
          proposalApprovedValue: {
            amount: 950_000,
            currency: "USD",
            source: { kind: "market_data", providerId: "finnhub", providerName: "Finnhub", asOf: "2026-06-30" },
            lockedAt: "2026-07-01T10:00:00.000Z",
          },
        } as Holding;
      case "h_msft":
        // Locked from a source that recorded no date: the holding's own date isn't borrowed.
        return { ...h, advisorVerification: "locked_for_proposal", proposalApprovedValue: { amount: at("h_msft").nativeMarketValue, currency: "USD", source: { kind: "statement" } } } as Holding;
      case "h_vti":
        return { ...h, valuationSource: { kind: "advisor_override", asOf: "2026-10-15T09:00:00.000Z", confidence: "high", note: "Corrected by advisor" }, advisorVerification: "advisor_reviewed" } as Holding;
      case "h_brk":
        // Legacy: market data accepted by the advisor, provider and date not recorded.
        return { ...h, marketDataSource: { kind: "market_data" }, advisorVerification: "advisor_approved" } as Holding;
      case "h_qqqm":
        return { ...h, valuationSource: { kind: "mock", providerName: "Mock Market Data" }, quoteType: "mock", priceFreshness: "mock", advisorVerification: "unverified" } as Holding;
      default:
        return h;
    }
  });
}

// ---------------------------------------------------------------------------

const ROOT = join(__dirname, "..", "src");
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? (p.includes(join("app", "api")) ? [] : files(p)) : /\.(ts|tsx)$/.test(f) ? [p] : [];
  });
}

describe("the ordinary journey makes no security-quote requests", () => {
  it("no page or component calls a quote, fundamentals or provider-status route, or writes the quote cache", () => {
    const ui = [...files(join(ROOT, "app")), ...files(join(ROOT, "components")), ...files(join(ROOT, "hooks"))];
    const forbidden = ["/api/market-data/refresh", "/api/market-data/quote", "/api/market-data/fundamentals", "/api/market-data/providers", "resolveQuote", "holdingsEligibleForEnrichment", "applyMarketDataResults", "setMarketData", "marketDataByIdentifier"];
    const hits = ui.flatMap((f) => {
      const src = readFileSync(f, "utf8");
      return forbidden.filter((w) => src.includes(w)).map((w) => `${f.slice(ROOT.length + 1)}: ${w}`);
    });
    expect(hits).toEqual([]);
    // The FX route is the one market-data request the pages make.
    expect(ui.some((f) => readFileSync(f, "utf8").includes("/api/market-data/fx"))).toBe(true);
  });

  it("the page at /market-data is named Exchange rates, and its address is kept", () => {
    const nav = readFileSync(join(ROOT, "components", "layout", "Sidebar.tsx"), "utf8");
    expect(nav).toMatch(/label: "Exchange rates", href: "\/market-data"/);
    expect(nav).not.toMatch(/"Market Data"/);
    const page = readFileSync(join(ROOT, "app", "market-data", "page.tsx"), "utf8");
    expect(page).toMatch(/title="Exchange rates"/);
    expect(page).toContain("FxRatesPanel");
    expect(page).not.toMatch(/Refresh quotes|Quote Coverage|Key required/);
  });

  it("building the PDF makes no network request", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (u: string) => {
      calls.push(String(u));
      throw new Error("offline");
    });
    const m = await load();
    expect(pdfText(m, m.useAtlasStore.getState()).length).toBeGreaterThan(1000);
    expect(calls).toEqual([]);
  });
});

describe("dollar proposals work without unit prices or identifiers", () => {
  it("gives the same proposed values, funding and readiness, and an honest PDF", async () => {
    const m = await load();
    const s = m.useAtlasStore.getState();
    const recs = approveAll(s.recommendations);
    const bare = s.holdings.map((h) => ({ ...h, quantity: undefined, price: undefined, identifier: undefined }));
    const fx = { reportingCurrency: s.client.proposalOutputCurrency, rates: s.fxRates, now: NOW };
    const proposed = (hs: Holding[]) => m.applyRecommendationsToProposed(m.normalizeHoldings(hs, s.fxRates, fx.reportingCurrency), recs, s.accounts, fx).holdings.map((h) => [h.id, h.reportingMarketValue]);
    expect(proposed(bare)).toEqual(proposed(s.holdings));
    expect(gates(readiness(m, s, { holdings: bare, recommendations: recs }))).toEqual(gates(readiness(m, s, { recommendations: recs })));
    const text = pdfText(m, s, { holdings: bare, recommendations: recs });
    expect(text).toContain("Statement value");
    expect(text).not.toMatch(/NaN|undefined/);
  });
});

describe("value sources and dates are represented honestly", () => {
  it("describes the value the resolver uses, with that value's own recorded date", async () => {
    const m = await load();
    const hs = variety(m);
    const p = (id: string) => m.valueProvenance(hs.find((h) => h.id === id)!);

    expect(p("h_aapl")).toMatchObject({ basis: "approved", label: "Approved value", date: "2026-06-30", approvedAt: "2026-07-01T10:00:00.000Z" });
    expect(p("h_aapl").detail).toMatch(/Finnhub/);
    expect(p("h_aapl").detail).toMatch(/market data/i);
    // The holding's own (different) source stays visible.
    expect(p("h_aapl").holdingSource).toMatch(/^Statement value/);
    // The holding's own source gets the same date rule: a mock or legacy
    // market-data label without a date of its own doesn't borrow the statement date.
    const lockedMock = { ...hs.find((h) => h.id === "h_qqqm")!, advisorVerification: "locked_for_proposal", proposalApprovedValue: { amount: 1, currency: "USD", source: { kind: "statement", asOf: "2026-04-30" } } } as Holding;
    expect(m.valueProvenance(lockedMock).holdingSource).toBe("Mock / placeholder value, date not recorded");
    const lockedLegacy = { ...lockedMock, valuationSource: { kind: "market_data", providerName: "Finnhub" } } as Holding;
    expect(m.valueProvenance(lockedLegacy).holdingSource).toBe("Recorded market data (legacy), date not recorded");

    // No recorded date on the approved value: the statement date isn't borrowed.
    expect(p("h_msft")).toMatchObject({ basis: "approved", date: null });
    expect(hs.find((h) => h.id === "h_msft")!.valuationDate).toBe("2026-04-30");

    // An override is dated when it was entered, not with the statement date it replaced.
    expect(p("h_vti")).toMatchObject({ basis: "override", label: "Advisor override", date: "2026-10-15" });

    // Unknown provenance isn't presented as known or verified.
    expect(p("h_brk")).toMatchObject({ basis: "legacy_market_data", date: null });
    expect(p("h_brk").detail).toMatch(/provider not recorded/);

    // A mock label without a date of its own isn't given the statement date.
    expect(p("h_qqqm")).toMatchObject({ basis: "mock", review: "Not yet reviewed", date: null });
    expect(p("h_qqqm").label).toMatch(/Mock/);
    expect(p("h_pe_cgp4")).toMatchObject({ basis: "manual" });
    expect(p("h_shop_cad")).toMatchObject({ basis: "statement", date: "2026-04-30", review: expect.any(String) });
  });

  it("counts each basis and notes mixed and missing dates", async () => {
    const m = await load();
    const hs = variety(m);
    const counts = m.provenanceCounts(hs);
    expect(counts).toMatchObject({ approved: 2, override: 1, legacy_market_data: 1, mock: 1 });
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(hs.length);
    const dates = m.valueDateSummary(hs);
    expect(dates).toMatchObject({ earliest: "2026-01-31", latest: "2026-10-15", undated: 3, mixed: true });
    const note = m.describeValueDates(dates)!;
    expect(note).toMatch(/different dates/);
    expect(note).toMatch(/Jan 31, 2026/);
    expect(note).toMatch(/Oct 15, 2026/);
    expect(note).toMatch(/3 values have no recorded date/);
    // A single shared date isn't a limitation worth a note.
    const one = m.useAtlasStore.getState().holdings.filter((h) => h.valuationDate === "2026-04-30");
    expect(m.describeValueDates(m.valueDateSummary(one))).toBeNull();
  });

  it("the PDF shows each holding's basis and date, the legacy provider as evidence, and no provider claims", async () => {
    const m = await load();
    const s = m.useAtlasStore.getState();
    const text = pdfText(m, s, { holdings: variety(m) });
    expect(text).toMatch(/Apple Inc\. Approved value[^|]*Finnhub/);
    expect(text).toContain("Jun 30, 2026");
    expect(text).toContain("approved Jul 1, 2026");
    expect(text).toContain("Advisor override");
    expect(text).toContain("provider not recorded");
    expect(text).toContain("Not recorded");
    expect(text).toMatch(/Mock \/ placeholder value/);
    expect(text).toMatch(/different dates/);
    for (const claim of [
      "configured providers",
      "public market data references",
      "Public market quotes used in this proposal",
      "Alpha Vantage",
      "Twelve Data",
      "FRED",
      "CoinGecko",
      "free-tier market data providers",
      "Public market prices were obtained from third-party providers",
      "stale price labels and should be refreshed",
    ]) {
      expect(text, claim).not.toContain(claim);
    }
    // The accurate FX disclosures are kept.
    expect(text).toContain("Exchange rates used in this proposal");
    expect(text).toContain("Exchange rates used: ECB reference rates, each listed with its date below.");
  });

  it("the approval date is the lock instant in the advisor's time zone; the source's calendar date never moves", async () => {
    const m = await load();
    const s = m.useAtlasStore.getState();
    const lockedAt = (at: string) => variety(m).map((h) => (h.id === "h_aapl" ? { ...h, proposalApprovedValue: { ...h.proposalApprovedValue!, lockedAt: at } } : h));
    const cases: [string, string, string][] = [
      // An evening lock in New York is already the next day in UTC and Kiritimati.
      ["2026-10-24T01:30:00Z", "America/New_York", "Oct 23, 2026"],
      ["2026-10-24T01:30:00Z", "UTC", "Oct 24, 2026"],
      ["2026-10-24T01:30:00Z", "Pacific/Kiritimati", "Oct 24, 2026"],
      // A morning lock in UTC is already the next day in Kiritimati (UTC+14).
      ["2026-10-23T10:30:00Z", "America/New_York", "Oct 23, 2026"],
      ["2026-10-23T10:30:00Z", "UTC", "Oct 23, 2026"],
      ["2026-10-23T10:30:00Z", "Pacific/Kiritimati", "Oct 24, 2026"],
    ];
    for (const [at, timeZone, day] of cases) {
      const text = pdfText(m, s, { holdings: lockedAt(at), timeZone });
      const row = text.slice(text.indexOf(" Apple Inc. Approved value"), text.indexOf(" Microsoft Corporation Approved value"));
      expect(row, `${at} in ${timeZone}`).toContain(`Jun 30, 2026; approved ${day}`);
    }
  });

  it("section titles come from their keys, so saved labels need no migration; selections are kept", async () => {
    const m = await load();
    const s = m.useAtlasStore.getState();
    const saved = s.proposalSections.map((x) =>
      x.key === "market_data_sources" ? { ...x, label: "Market Data & Valuation Sources" } : x.key === "appendix_market_data" ? { ...x, label: "Appendix — Market Data Sources", enabled: false } : x
    );
    expect(m.DEFAULT_PROPOSAL_SECTIONS.map((x) => [x.key, x.enabled, !!x.required])).toEqual(s.proposalSections.map((x) => [x.key, x.enabled, !!x.required]));
    expect(m.sectionLabel(saved.find((x) => x.key === "market_data_sources")!)).toBe("Valuation Sources & Dates");
    expect(m.sectionLabel({ key: "custom_x", label: "My section", enabled: true })).toBe("My section");
    const text = pdfText(m, s, { sections: saved });
    expect(text).toContain("Valuation Sources & Dates");
    expect(text).not.toContain("Market Data & Valuation Sources");
    // Turned off by the advisor: still off.
    expect(text).not.toContain("Valuation & Exchange-Rate Sources");
    expect(pdfText(m, s)).toContain("Appendix — Valuation & Exchange-Rate Sources");
  });

  it("the required source disclosures cover legacy market-data and mock values, which may be present", async () => {
    const m = await load();
    const body = (id: string) => m.DISCLOSURE_LIBRARY.find((d) => d.id === id)!;
    expect(body("data_source").required && body("market_data_disclaimer").required).toBe(true);
    // The optional mock disclosure isn't in the proposal by default, so the required ones must say it.
    expect(body("mock_fallback").required).toBe(false);
    expect(body("data_source").body).toMatch(/earlier market-data records/);
    expect(body("market_data_disclaimer").body).toMatch(/mock or placeholder values/i);
    expect(body("market_data_disclaimer").body).toMatch(/earlier market-data record/);
  });

  it("a saved copy of an old disclosure is shown with the app's current text", async () => {
    const m = await load();
    const s = m.useAtlasStore.getState();
    const old = s.disclosures.map((d) =>
      d.id === "market_data_disclaimer" ? { ...d, body: "Public market prices were obtained from third-party providers and may be delayed." } : d
    );
    const text = pdfText(m, s, { disclosures: old });
    expect(text).not.toContain("Public market prices were obtained from third-party providers");
    expect(text).toContain(m.currentDisclosure(old.find((d) => d.id === "market_data_disclaimer")!).body);
    // Unknown (not in the library) disclosures keep their saved text.
    expect(m.currentDisclosure({ ...old[0], id: "custom_d", body: "Kept" }).body).toBe("Kept");
  });
});

describe("blocking checks are unchanged", () => {
  it("a missing exchange rate still blocks, with or without identifiers", async () => {
    const m = await load();
    const s = m.useAtlasStore.getState();
    const nok = s.holdings.map((h, i) => (i === 0 ? { ...h, currency: "NOK" as Holding["currency"], identifier: undefined } : h));
    const valued = readiness(m, s, { holdings: nok }).find((c) => c.code === "holdings_valued")!;
    expect(valued).toMatchObject({ passed: false, detail: "1 not valued: NOK/USD rate missing" });
  });

  it("an incomplete import still blocks", async () => {
    const m = await load();
    const s = m.useAtlasStore.getState();
    const doc: SourceDocument = {
      id: "sd_qa",
      fileName: "qa.pdf",
      sourceType: "pdf_text",
      sizeBytes: 1000,
      uploadedAt: "2026-10-20T10:00:00.000Z",
      extractionStatus: "extracted",
      importCompleteness: { status: "incomplete", reason: "total_mismatch", stated: 9_000_000, extracted: 8_300_000, currency: "USD", unreadableRows: 0 },
    } as SourceDocument;
    const imported = { ...s.holdings[0], id: "h_qa", sourceTrace: { sourceDocumentId: "sd_qa" } } as Holding;
    const check = readiness(m, s, { holdings: [...s.holdings, imported], sourceDocuments: [doc] }).find((c) => c.code === "imports_complete")!;
    expect(check).toMatchObject({ passed: false, detail: "qa.pdf: imported rows add up to USD 8,300,000.00 but the document states USD 9,000,000.00" });
  });

  it("a legacy mock value still needs review, and is labelled wherever it is shown", async () => {
    const m = await load();
    const s = m.useAtlasStore.getState();
    const hs = variety(m);
    const checks = readiness(m, s, { holdings: hs });
    expect(checks.find((c) => c.code === "market_data")).toMatchObject({ passed: false, detail: "1 placeholder value(s) not yet reviewed" });
    expect(gates(checks)).toEqual(gates(m.evaluateWorkspaceReadiness({ client: s.client, advisor: s.advisor, accounts: s.accounts, holdings: hs, recommendations: s.recommendations, disclosures: s.disclosures, fxRates: s.fxRates, sourceDocuments: s.sourceDocuments, fxConfirmation: s.fxConfirmation, now: NOW })));
  });
});

describe("financial results and backup/restore are equivalent", () => {
  it("a mock quote in the cache never reaches a value, a basis or a gate", async () => {
    const m = await load();
    m.useAtlasStore.setState({ holdings: variety(m) });
    const before = m.useAtlasStore.getState();
    const snapshot = (st: typeof before) => ({
      values: m.normalizeHoldings(st.holdings, st.fxRates, st.client.proposalOutputCurrency).map((h) => [h.id, h.reportingMarketValue]),
      basis: st.holdings.map((h) => m.valueProvenance(h)),
      gates: gates(readiness(m, st)),
    });
    const was = snapshot(before);
    const aapl = before.holdings.find((h) => h.id === "h_aapl")!;
    m.useAtlasStore.getState().applyMarketDataResults([
      { holdingId: aapl.id, result: { ok: true, providerId: "mock", providerName: "Mock Market Data", identifier: aapl.identifier!, price: 1, currency: "USD", asOf: NOW.toISOString(), quoteType: "mock", isMock: true } as never },
    ]);
    expect(snapshot(m.useAtlasStore.getState())).toEqual(was);
  });

  it("legacy values survive a backup round trip with the same results and descriptions", async () => {
    const m = await load();
    m.useAtlasStore.setState({ holdings: variety(m), recommendations: approveAll(m.useAtlasStore.getState().recommendations) });
    const st = m.useAtlasStore.getState();
    const outcomes = (w: { holdings: Holding[]; recommendations: Recommendation[] }) => {
      const hs = m.normalizeHoldings(w.holdings, st.fxRates, st.client.proposalOutputCurrency);
      const fx = { reportingCurrency: st.client.proposalOutputCurrency, rates: st.fxRates, now: NOW };
      return {
        summary: m.valuationSummary(hs),
        proposed: m.applyRecommendationsToProposed(hs, w.recommendations.filter((r) => r.approvedByAdvisor), st.accounts, fx).holdings.map((h) => [h.id, h.reportingMarketValue]),
        basis: w.holdings.map((h) => m.valueProvenance(h)),
        gates: gates(readiness(m, st, { holdings: w.holdings, recommendations: w.recommendations })),
      };
    };
    const text = m.serializeBackup(m.createBackup(st, NOW));
    const parsed = m.parseBackup(text, { disclosureIds: m.DISCLOSURE_LIBRARY.map((d) => d.id) });
    if (!parsed.ok) throw new Error(parsed.errors.join("; "));
    const restored = m.restoredState(parsed.backup, { advisor: st.advisor, disclosures: st.disclosures }, { replaceFirm: false });
    expect(JSON.parse(JSON.stringify(restored.holdings))).toEqual(JSON.parse(JSON.stringify(st.holdings)));
    expect(outcomes(restored)).toEqual(outcomes(st));
  });

  it("a backup written before this change, with the old omission notes, still restores", async () => {
    const m = await load();
    const backup = JSON.parse(m.serializeBackup(m.createBackup(m.useAtlasStore.getState(), NOW)));
    backup.omitted = backup.omitted.map((o: string) => (o.startsWith("The legacy security-quote cache") ? "The market-data quote cache is not included; refresh it in Market Data. Holdings keep their own market-data source." : o));
    expect(m.parseBackup(JSON.stringify(backup), { disclosureIds: m.DISCLOSURE_LIBRARY.map((d) => d.id) }).ok).toBe(true);
  });
});
