import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { FxRate, Holding, Proposal, Recommendation } from "@/domain/types";
import { normalizeHoldings } from "@/engines/normalizationEngine";
import { resolveFxRate } from "@/engines/currencyEngine";
import { resolveValuation } from "@/engines/valuationEngine";
import { describeUnvalued, formatTotal, valuationSummary, valuationTotal } from "@/engines/valuationTotals";
import { applyRecommendationsToProposed, DEFAULT_PROPOSAL_SECTIONS } from "@/engines/proposalEngine";
import { generateInsights, summarizeAllocation } from "@/engines/insightEngine";
import { evaluateWorkspaceReadiness } from "@/engines/complianceEngine";
import { ProposalPdfTemplate } from "@/pdf/templates/ProposalPdfTemplate";
import { CopilotContext, executeTool } from "@/copilot/tools";
import { runDemoCopilot } from "@/copilot/demo";
import { ASSET_CLASS_LABELS } from "@/domain/assetTaxonomy";
import { SEED_HOLDINGS } from "@/data/seedHoldings";
import { SEED_FX_RATES } from "@/data/seedFxRates";
import { SEED_ACCOUNTS } from "@/data/seedAccounts";
import { SEED_ADVISOR, SEED_CLIENT } from "@/data/seedClient";
import { SEED_RECOMMENDATIONS } from "@/data/seedRecommendations";
import { DISCLOSURE_LIBRARY } from "@/domain/disclosureLibrary";
import { formatCalendarDate } from "@/utils/formatting";
import baseline from "./fixtures/sampleValuationBaseline.json";

// Issue #23: a holding whose currency has no rate to the reporting currency
// is *unvalued*. It is never converted at 1:1, never counted as zero, and
// never hidden inside a total presented as complete.

const CHF_USD: FxRate = { base: "CHF", quote: "USD", rate: 1.25, asOf: "2026-10-20", source: "Manual" };

const holding = (patch: Partial<Holding>): Holding => ({
  id: "h",
  accountId: "a1",
  assetName: "Holding",
  assetClass: "equity",
  currency: "USD",
  nativeMarketValue: 500,
  valuationSource: { kind: "statement", asOf: "2026-10-01", confidence: "high" },
  dataQuality: [],
  advisorVerification: "advisor_reviewed",
  createdAt: "",
  updatedAt: "",
  ...patch,
});
const usd500 = holding({ id: "usd", nativeMarketValue: 500 });
const chf1000 = holding({ id: "chf", currency: "CHF", nativeMarketValue: 1_000 });

// The seed workspace with every CHF rate removed: its one CHF holding is unvalued.
const NO_CHF = SEED_FX_RATES.filter((r) => r.base !== "CHF" && r.quote !== "CHF");
const seedChf = SEED_HOLDINGS.find((h) => h.currency === "CHF")!;

describe("conversion", () => {
  it("a missing rate leaves the holding unvalued, never converted at 1:1", () => {
    const [h] = normalizeHoldings([chf1000], [], "USD");
    expect(h.reportingMarketValue).toBeNull();
    expect(h.valuation).toEqual({ status: "unvalued", reason: "missing_fx_rate", currency: "CHF", amount: 1_000, reportingCurrency: "USD" });
  });

  it("converts with a direct, an inverse or a USD-bridged rate", () => {
    expect(normalizeHoldings([chf1000], [CHF_USD], "USD")[0].reportingMarketValue).toBeCloseTo(1_250, 9);
    expect(normalizeHoldings([chf1000], [{ ...CHF_USD, base: "USD", quote: "CHF", rate: 0.8 }], "USD")[0].reportingMarketValue).toBeCloseTo(1_250, 9);
    const bridged = normalizeHoldings([chf1000], [CHF_USD, { base: "USD", quote: "EUR", rate: 0.9, asOf: "2026-10-20", source: "Manual" }], "EUR");
    expect(bridged[0].reportingMarketValue).toBeCloseTo(1_125, 9);
    expect(bridged[0].valuation).toMatchObject({ status: "valued", currency: "CHF", amount: 1_000 });
  });

  it.each([0, -1.25, Number.NaN, Number.POSITIVE_INFINITY])("rejects a rate of %s", (rate) => {
    expect(resolveFxRate([{ ...CHF_USD, rate }], "CHF", "USD")).toBeNull();
    expect(normalizeHoldings([chf1000], [{ ...CHF_USD, rate }], "USD")[0].reportingMarketValue).toBeNull();
  });

  it("an invalid direct rate doesn't block a valid inverse one", () => {
    const rates = [{ ...CHF_USD, rate: 0 }, { ...CHF_USD, base: "USD", quote: "CHF", rate: 0.8 }];
    expect(resolveFxRate(rates, "CHF", "USD")?.rate).toBeCloseTo(1.25, 9);
  });

  it("converts a locked approved value from its own currency", () => {
    const h = holding({
      currency: "CHF",
      nativeMarketValue: 1_000,
      proposalApprovedValue: { amount: 800, currency: "EUR", source: { kind: "advisor_override" } },
    });
    expect(resolveValuation(h)).toMatchObject({ amount: 800, currency: "EUR" });
    const eurUsd: FxRate = { base: "EUR", quote: "USD", rate: 1.1, asOf: "2026-10-20", source: "Manual" };
    expect(normalizeHoldings([h], [eurUsd], "USD")[0].reportingMarketValue).toBeCloseTo(880, 9);
    // The holding's own CHF rate is irrelevant; the EUR one is what's needed.
    expect(normalizeHoldings([h], [CHF_USD], "USD")[0].valuation).toMatchObject({ status: "unvalued", currency: "EUR", amount: 800 });
  });

  it("recomputes from the current rates: an old cached reporting value can't hide a missing rate", () => {
    const cached = { ...chf1000, reportingMarketValue: 1_250 };
    expect(normalizeHoldings([cached], [], "USD")[0].reportingMarketValue).toBeNull();
  });
});

describe("totals", () => {
  const norm = (hs: Holding[], rates: FxRate[] = []) => normalizeHoldings(hs, rates, "USD");

  it("complete when every holding is valued", () => {
    expect(valuationTotal(norm([usd500, chf1000], [CHF_USD]))).toMatchObject({ status: "complete", value: 1_750, valuedCount: 2, unvaluedCount: 0 });
  });

  it("partial: a valued subtotal, with the unvalued native amounts listed, never 1,500", () => {
    const t = valuationTotal(norm([usd500, chf1000]));
    expect(t).toMatchObject({ status: "partial", value: 500, valuedCount: 1, unvaluedCount: 1 });
    expect(t.unvaluedAssets).toEqual([{ currency: "CHF", amount: 1_000, count: 1 }]);
    expect(formatTotal(t, "USD")).toBe("$500.00");
  });

  it("unavailable when nothing can be valued: no reporting-currency zero", () => {
    const t = valuationTotal(norm([chf1000]));
    expect(t).toMatchObject({ status: "unavailable", value: null });
    expect(formatTotal(t, "USD")).toBe("Unavailable");
  });

  it("keeps unvalued assets and liabilities apart so they can't cancel out; liabilities stay signed", () => {
    const loan = holding({ id: "loan", currency: "CHF", isLiability: true, assetClass: "liability", nativeMarketValue: -1_000 });
    const s = valuationSummary(norm([usd500, chf1000, loan]));
    expect(s.complete).toBe(false);
    expect(s.assets).toMatchObject({ status: "partial", value: 500 });
    expect(s.liabilities).toMatchObject({ status: "unavailable", value: null });
    expect(s.net).toMatchObject({ status: "partial", value: 500 });
    expect(s.assets.unvaluedAssets).toEqual([{ currency: "CHF", amount: 1_000, count: 1 }]);
    expect(s.liabilities.unvaluedLiabilities).toEqual([{ currency: "CHF", amount: -1_000, count: 1 }]);
    const note = describeUnvalued(s, "USD");
    expect(note).toContain("1 asset (CHF 1,000.00)");
    expect(note).toContain("1 liability (−CHF 1,000.00)");
    expect(note).not.toMatch(/CHF 0/);
  });

  it("reports coverage as holding counts, never as a monetary percentage", () => {
    const s = valuationSummary(norm([usd500, chf1000]));
    expect(s).toMatchObject({ holdingsValued: 1, holdingsTotal: 2 });
    expect(describeUnvalued(s, "USD")).not.toMatch(/%/);
  });

  it("allocation describes the valued subset only", () => {
    const rows = summarizeAllocation(norm([usd500, chf1000]), (h) => h.currency);
    expect(rows).toEqual([{ label: "USD", value: 500, pct: 100 }]);
  });
});

describe("incomplete valuation suppresses portfolio-wide conclusions", () => {
  const holdings = normalizeHoldings(SEED_HOLDINGS, NO_CHF, "USD");
  const insights = generateInsights({ holdings, reportingCurrency: "USD" });

  it("no concentration, currency, country, liquidity or cash-drag conclusions", () => {
    const categories = new Set(insights.map((i) => i.category));
    for (const c of ["concentration", "currency", "country", "liquidity"]) expect(categories.has(c as never)).toBe(false);
  });

  it("keeps data-quality findings and individual holding facts, and adds the unvalued task", () => {
    const task = insights.find((i) => i.task?.kind === "missing_fx_rate")!;
    expect(task.title).toBe("1 holding can't be valued in USD");
    expect(task.task!.openIds).toEqual([seedChf.id]);
    expect(insights.some((i) => i.category === "fees" || i.category === "valuation")).toBe(true);
  });

  it("with every rate present, the same workspace still draws its conclusions", () => {
    const full = generateInsights({ holdings: normalizeHoldings(SEED_HOLDINGS, SEED_FX_RATES, "USD"), reportingCurrency: "USD" });
    expect(full.some((i) => i.category === "concentration")).toBe(true);
    expect(full.some((i) => i.task?.kind === "missing_fx_rate")).toBe(false);
  });
});

describe("readiness", () => {
  const ws = { client: SEED_CLIENT, advisor: SEED_ADVISOR, accounts: SEED_ACCOUNTS, recommendations: [] as Recommendation[], disclosures: DISCLOSURE_LIBRARY };

  it("holdings_valued fails while a holding is unvalued, independently of fx_available", () => {
    const checks = evaluateWorkspaceReadiness({ sourceDocuments: [], ...ws, holdings: SEED_HOLDINGS, fxRates: NO_CHF });
    const valued = checks.find((c) => c.code === "holdings_valued")!;
    expect(valued.passed).toBe(false);
    expect(valued.detail).toContain("CHF/USD");
    expect(checks.find((c) => c.code === "fx_available")?.passed).toBe(true); // no proposed trades
    expect(evaluateWorkspaceReadiness({ sourceDocuments: [], ...ws, holdings: SEED_HOLDINGS, fxRates: SEED_FX_RATES }).find((c) => c.code === "holdings_valued")?.passed).toBe(true);
  });

  it("re-normalizes: holdings sent with a cached reporting value still fail without the rate", () => {
    const cached = normalizeHoldings(SEED_HOLDINGS, SEED_FX_RATES, "USD"); // valued with the CHF rate
    expect(evaluateWorkspaceReadiness({ sourceDocuments: [], ...ws, holdings: cached, fxRates: NO_CHF }).find((c) => c.code === "holdings_valued")?.passed).toBe(false);
  });

  it("the final-PDF route blocks on the same logic, not on cached client values", async () => {
    const { POST } = await import("@/app/api/proposals/[id]/generate-pdf/route");
    const holdings = normalizeHoldings(SEED_HOLDINGS, SEED_FX_RATES, "USD").map((h) => ({ ...h, advisorVerification: "advisor_approved" as const }));
    const recommendations = SEED_RECOMMENDATIONS.map((r) => ({ ...r, approvedByAdvisor: true, includeInPdf: true }));
    const state = { ...ws, holdings, recommendations, sections: [], proposal: { id: "p1" }, fxRates: NO_CHF };
    const res = await POST(new Request("http://localhost/api/proposals/p1/generate-pdf?variant=final", { method: "POST", body: JSON.stringify({ state }) }), {
      params: Promise.resolve({ id: "p1" }),
    });
    expect(res.status).toBe(422);
    expect((await res.json()).failing).toContain("All holdings valued in the reporting currency");
  });
});

describe("Copilot", () => {
  const snapshot = (fxRates: FxRate[]) => ({
    client: SEED_CLIENT,
    advisor: SEED_ADVISOR,
    accounts: SEED_ACCOUNTS,
    holdings: SEED_HOLDINGS,
    recommendations: [],
    disclosures: DISCLOSURE_LIBRARY,
    fxRates,
  });
  const run = (ctx: CopilotContext, name: string, input: Record<string, unknown> = {}) => {
    const r = executeTool(ctx, name, input);
    return { ...r, json: r.isError ? null : JSON.parse(r.content) };
  };

  it("the overview says valuation is incomplete and gives no portfolio weights", () => {
    const o = run(new CopilotContext(snapshot(NO_CHF) as never), "get_portfolio_overview").json;
    expect(o.valuation).toMatchObject({ complete: false, holdings_valued: SEED_HOLDINGS.length - 1, holdings_total: SEED_HOLDINGS.length });
    expect(o.valuation.unvalued).toEqual([expect.objectContaining({ holding_id: seedChf.id, currency: "CHF", reason: "missing_fx_rate" })]);
    expect(o.net_worth.status).toBe("partial");
    expect(o.top_holdings.every((h: { pct_of_investible: number | null }) => h.pct_of_investible === null)).toBe(true);
    expect(o.allocation_by_asset_class.every((a: { pct: number | null }) => a.pct === null)).toBe(true);
  });

  it("refuses allocation-changing drafts while valuation is incomplete; advisory drafts still work", () => {
    const ctx = new CopilotContext(snapshot(NO_CHF) as never);
    const usd = SEED_HOLDINGS.find((h) => h.currency === "USD" && !h.isLiability && h.assetClass === "equity")!;
    const sim = run(ctx, "simulate_recommendation", { holding_id: usd.id, type: "sell", action_amount: 1_000 }).json;
    expect(sim.pct_of_investible_before).toBeNull();
    const trade = run(ctx, "draft_recommendation", { holding_id: usd.id, type: "sell", action_amount: 1_000, title: "Sell some", priority: "medium", rationale: "Testing a trade draft." });
    expect(trade.isError).toBe(true);
    expect(trade.content).toMatch(/valuation is incomplete/i);
    const advisory = run(ctx, "draft_recommendation", { type: "request_updated_statement", title: "Get CHF rate", priority: "high", rationale: "Add the missing CHF rate." });
    expect(advisory.isError).toBe(false);
  });

  it("the unvalued holding itself reports no reporting value", () => {
    const h = run(new CopilotContext(snapshot(NO_CHF) as never), "get_holding", { holding_id: seedChf.id }).json;
    expect(h.reporting_value).toBeNull();
    expect(h.valuation_status).toBe("unvalued");
  });

  it("the demo planner drafts no trims and says why", () => {
    const res = runDemoCopilot(snapshot(NO_CHF) as never, "Draft recommendations for this client");
    expect(res.drafts.filter((d) => d.type === "reduce_concentration")).toEqual([]);
    expect(res.answer).toMatch(/can't be valued|not valued/i);
    expect(res.answer).not.toMatch(/net worth \$/i);
  });
});

describe("the proposal PDF", () => {
  const render = (holdings: Holding[], fxRates: FxRate[], client = SEED_CLIENT) =>
    renderToStaticMarkup(
      React.createElement(ProposalPdfTemplate, {
        client,
        advisor: SEED_ADVISOR,
        accounts: SEED_ACCOUNTS,
        holdings,
        recommendations: [],
        sections: DEFAULT_PROPOSAL_SECTIONS,
        disclosures: DISCLOSURE_LIBRARY,
        fxRates,
        proposal: { id: "p" } as Proposal,
        variant: "draft",
      })
    ).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

  it("labels incomplete totals, the valued-subset charts and the unvalued row", () => {
    // Holdings arrive with cached reporting values; the template must not trust them.
    const text = render(normalizeHoldings(SEED_HOLDINGS, SEED_FX_RATES, "USD"), NO_CHF);
    expect(text).toContain("Valuation incomplete");
    expect(text).toContain("Not valued in USD");
    expect(text).toContain("valued holdings only");
    expect(text).toContain(`${seedChf.assetName}`);
  });

  it("shows Unavailable, not $0, when nothing can be valued", () => {
    const text = render([chf1000], [], { ...SEED_CLIENT });
    expect(text).toContain("Unavailable");
    expect(text).not.toMatch(/Net Worth \$0/);
  });
});

describe("no silent native or zero fallbacks for reporting values", () => {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
    });
  it.each([
    [/reportingMarketValue\s*\?\?\s*[\w.]*nativeMarketValue/, "reportingMarketValue ?? nativeMarketValue"],
    [/reportingMarketValue\s*\|\|\s*0/, "reportingMarketValue || 0"],
    [/reportingMarketValue\s*\?\?\s*0/, "reportingMarketValue ?? 0"],
  ])("%s", (pattern) => {
    const hits = files("src").filter((f) => pattern.test(readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });
});

describe("review findings: unvalued state through the proposal, and liabilities", () => {
  const EUR_USD: FxRate = { base: "EUR", quote: "USD", rate: 1.1, asOf: "2026-10-20", source: "Manual" };
  const usdAccount = { id: "a1", name: "Custody", type: "brokerage" as const, baseCurrency: "USD", createdAt: "", updatedAt: "" };
  const approvedEur = holding({
    id: "sec",
    currency: "CHF",
    nativeMarketValue: 1_000,
    proposalApprovedValue: { amount: 800, currency: "EUR", source: { kind: "advisor_override" } },
  });
  const sale = (patch: Partial<Recommendation> = {}): Recommendation => ({
    id: "r_sale", title: "Sell", type: "sell", relatedHoldingId: "sec", actionAmount: 100, currency: "USD", rationale: "",
    priority: "medium", status: "approved", includeInPdf: true, approvedByAdvisor: true, createdAt: "", updatedAt: "", ...patch,
  });

  it("an explicitly unvalued holding stays unvalued: the sale is unapplied, no cash, unresolved names EUR/USD", () => {
    const fx = { reportingCurrency: "USD", rates: [CHF_USD] }; // EUR/USD missing
    const normalized = normalizeHoldings([approvedEur], fx.rates, "USD");
    const { holdings, unresolved } = applyRecommendationsToProposed(normalized, [sale()], [usdAccount], fx);
    const sec = holdings.find((h) => h.id === "sec")!;
    expect(sec.reportingMarketValue).toBeNull(); // not recovered as CHF 1,000 × 1.25
    expect(holdings).toHaveLength(1); // no synthetic cash
    expect(unresolved).toEqual([expect.objectContaining({ recommendationId: "r_sale", holdingId: "sec", currency: "EUR", reportingCurrency: "USD" })]);
    expect(valuationSummary(holdings).complete).toBe(false);
  });

  it("an approved value needs its own currency's rate, not the holding's, and stays consistent on re-valuation", () => {
    const fx = { reportingCurrency: "USD", rates: [EUR_USD] }; // CHF/USD missing, EUR/USD present
    const normalized = normalizeHoldings([approvedEur], fx.rates, "USD");
    expect(normalized[0].reportingMarketValue).toBeCloseTo(880, 9);
    const { holdings, unresolved } = applyRecommendationsToProposed(normalized, [sale()], [usdAccount], fx);
    expect(unresolved).toEqual([]);
    const sec = holdings.find((h) => h.id === "sec")!;
    expect(sec.reportingMarketValue).toBeCloseTo(780, 9);
    expect(sec.proposalApprovedValue?.amount).toBeCloseTo(780 / 1.1, 9); // the approved value moves, in EUR
    expect(sec.proposalApprovedValue?.currency).toBe("EUR");
    // Re-valuing the proposed holding gives the same figure.
    expect(normalizeHoldings([sec], fx.rates, "USD")[0].reportingMarketValue).toBeCloseTo(780, 9);
    expect(holdings.find((h) => h.id === "synth_cash_a1")?.reportingMarketValue).toBeCloseTo(100, 9);
    expect(valuationSummary(holdings).complete).toBe(true);
  });

  it("an unvalued cash line is never a funding source or an offset target", () => {
    const fx = { reportingCurrency: "USD", rates: [] as FxRate[] };
    const usdSec = holding({ id: "sec", nativeMarketValue: 1_000 });
    const chfCash = holding({ id: "cash", assetClass: "cash", currency: "CHF", nativeMarketValue: 100 });
    const normalized = normalizeHoldings([usdSec, chfCash], fx.rates, "USD");
    const { holdings, unresolved } = applyRecommendationsToProposed(normalized, [sale()], [usdAccount], fx);
    expect(unresolved.map((u) => u.currency)).toEqual(["CHF"]);
    expect(holdings.find((h) => h.id === "cash")!.reportingMarketValue).toBeNull();
  });

  // Cash lines with a locked approved value: offsets move the approved
  // value in its own currency, so re-valuing gives the same figure.
  describe("cash with an approved value receives and pays out in its own valuation currency", () => {
    const usdSec = holding({ id: "sec", nativeMarketValue: 1_000 });
    const approvedCash = (currency: string, amount: number) =>
      holding({ id: "cash", assetClass: "cash", nativeMarketValue: 150, proposalApprovedValue: { amount, currency, source: { kind: "advisor_override" } } });
    const roundTrip = (holdings: Holding[], recs: Recommendation[], rates: FxRate[], accounts = [usdAccount]) => {
      const fx = { reportingCurrency: "USD", rates };
      const proposed = applyRecommendationsToProposed(normalizeHoldings(holdings, rates, "USD"), recs, accounts, fx);
      return { ...proposed, renormalized: normalizeHoldings(proposed.holdings, rates, "USD") };
    };
    const cashOf = (hs: Holding[]) => hs.find((h) => h.id === "cash")!;

    it("USD cash approved at USD 200 + USD 100 proceeds = USD 300, before and after re-normalizing", () => {
      const r = roundTrip([usdSec, approvedCash("USD", 200)], [sale()], []);
      expect(r.unresolved).toEqual([]);
      expect(cashOf(r.holdings).reportingMarketValue).toBeCloseTo(300, 9);
      expect(cashOf(r.holdings).proposalApprovedValue?.amount).toBeCloseTo(300, 9);
      expect(cashOf(r.renormalized).reportingMarketValue).toBeCloseTo(300, 9);
    });

    it("USD cash approved at EUR 200 (EUR/USD 1.10) + USD 100 = USD 320; approved EUR grows by 100 / 1.10", () => {
      const r = roundTrip([usdSec, approvedCash("EUR", 200)], [sale()], [EUR_USD]);
      expect(r.unresolved).toEqual([]);
      expect(cashOf(r.holdings).reportingMarketValue).toBeCloseTo(320, 9);
      expect(cashOf(r.holdings).proposalApprovedValue?.amount).toBeCloseTo(200 + 100 / 1.1, 9);
      expect(cashOf(r.holdings).proposalApprovedValue?.currency).toBe("EUR");
      expect(cashOf(r.renormalized).reportingMarketValue).toBeCloseTo(320, 9);
    });

    it("debits work the same way: a purchase spends approved-value cash in its own currency", () => {
      const r = roundTrip([usdSec, approvedCash("EUR", 200)], [sale({ type: "buy" })], [EUR_USD]);
      expect(cashOf(r.holdings).reportingMarketValue).toBeCloseTo(120, 9);
      expect(cashOf(r.holdings).proposalApprovedValue?.amount).toBeCloseTo(200 - 100 / 1.1, 9);
      expect(cashOf(r.renormalized).reportingMarketValue).toBeCloseTo(120, 9);
    });

    it("debt funding draws approved-value cash in its own currency", () => {
      const loan = holding({ id: "loan", accountId: "a_loan", assetName: "Loan", assetClass: "liability", isLiability: true, nativeMarketValue: -1_000 });
      const accounts = [usdAccount, { ...usdAccount, id: "a_loan", name: "Loan" }];
      const r = roundTrip([loan, approvedCash("EUR", 200)], [sale({ type: "pay_down_debt", relatedHoldingId: "loan", actionAmount: 110 })], [EUR_USD], accounts);
      expect(r.unresolved).toEqual([]);
      expect(r.holdings.find((h) => h.id === "loan")!.reportingMarketValue).toBeCloseTo(-890, 9);
      expect(cashOf(r.holdings).reportingMarketValue).toBeCloseTo(110, 9);
      expect(cashOf(r.holdings).proposalApprovedValue?.amount).toBeCloseTo(100, 9);
      expect(cashOf(r.renormalized).reportingMarketValue).toBeCloseTo(110, 9);
      expect(r.holdings.some((h) => h.id.startsWith("synth_cash"))).toBe(false);
    });

    it("approved-value cash without its own rate is unvalued: not an offset target, not a funding source", () => {
      const r = roundTrip([usdSec, approvedCash("EUR", 200)], [sale()], []); // EUR/USD missing
      expect(r.unresolved.map((u) => u.currency)).toEqual(["EUR"]);
      expect(cashOf(r.holdings).reportingMarketValue).toBeNull();
      expect(cashOf(r.holdings).proposalApprovedValue?.amount).toBe(200);
    });
  });

  // Seed workspace, fully valued, plus a loan in SEK, which has no rate.
  const sekLoan = holding({ id: "sek_loan", accountId: SEED_ACCOUNTS[0].id, assetName: "SEK bridge loan", assetClass: "liability", isLiability: true, currency: "SEK", nativeMarketValue: -500_000 });
  const withLoan = [...SEED_HOLDINGS, sekLoan];

  it("an unvalued liability pauses portfolio-wide conclusions and is listed in Data to complete", () => {
    const insights = generateInsights({ holdings: normalizeHoldings(withLoan, SEED_FX_RATES, "USD"), reportingCurrency: "USD" });
    const categories = new Set(insights.map((i) => i.category));
    for (const c of ["concentration", "currency", "country", "liquidity"]) expect(categories.has(c as never)).toBe(false);
    expect(insights.find((i) => i.task?.kind === "missing_fx_rate")?.task?.openIds).toEqual(["sek_loan"]);
  });

  it("readiness and the Copilot agree with Insights about the liability", () => {
    const checks = evaluateWorkspaceReadiness({ sourceDocuments: [], client: SEED_CLIENT, advisor: SEED_ADVISOR, accounts: SEED_ACCOUNTS, holdings: withLoan, recommendations: [], disclosures: DISCLOSURE_LIBRARY, fxRates: SEED_FX_RATES });
    const valued = checks.find((c) => c.code === "holdings_valued")!;
    expect(valued.passed).toBe(false);
    expect(valued.detail).toContain("SEK/USD");
    const ctx = new CopilotContext({ client: SEED_CLIENT, advisor: SEED_ADVISOR, accounts: SEED_ACCOUNTS, holdings: withLoan, recommendations: [], disclosures: DISCLOSURE_LIBRARY, fxRates: SEED_FX_RATES } as never);
    const o = JSON.parse(executeTool(ctx, "get_portfolio_overview", {}).content);
    expect(o.valuation.complete).toBe(false);
    expect(o.valuation.unvalued).toEqual([expect.objectContaining({ holding_id: "sek_loan", is_liability: true, currency: "SEK" })]);
    expect(o.top_holdings.every((h: { pct_of_investible: number | null }) => h.pct_of_investible === null)).toBe(true);
    const usd = SEED_HOLDINGS.find((h) => h.currency === "USD" && !h.isLiability && h.assetClass === "equity")!;
    expect(executeTool(ctx, "draft_recommendation", { holding_id: usd.id, type: "sell", action_amount: 1_000, title: "Sell some", priority: "medium", rationale: "Testing a trade draft." }).isError).toBe(true);
  });

  it("a liability-only workspace still reports the missing rate", () => {
    const insights = generateInsights({ holdings: normalizeHoldings([sekLoan], [], "USD"), reportingCurrency: "USD" });
    const task = insights.find((i) => i.task?.kind === "missing_fx_rate");
    expect(task?.title).toBe("1 holding can't be valued in USD");
    expect(task?.task?.openIds).toEqual(["sek_loan"]);
  });

  it("once valuation is complete, concentration is measured against assets, not net of liabilities", () => {
    const a = holding({ id: "a", assetName: "Alpha Corp", identifier: { type: "ticker", value: "ALP" }, assetType: "stock", nativeMarketValue: 600 });
    const b = holding({ id: "b", assetName: "Beta Corp", identifier: { type: "ticker", value: "BET" }, assetType: "stock", nativeMarketValue: 400 });
    const loan = holding({ id: "loan", assetName: "Loan", assetClass: "liability", isLiability: true, nativeMarketValue: -900 });
    const insights = generateInsights({ holdings: normalizeHoldings([a, b, loan], [], "USD"), reportingCurrency: "USD" });
    expect(insights.find((i) => i.relatedHoldingIds?.[0] === "a")?.title).toBe("Alpha Corp represents 60.0% of investible assets");
  });
});

describe("the sample workspace is unchanged when every rate is present", () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-21T12:00:00Z")); // the baseline's capture date
  });
  afterAll(() => vi.useRealTimers());

  it("matches the baseline captured on main before #23", () => {
    const holdings = normalizeHoldings(SEED_HOLDINGS, SEED_FX_RATES, "USD");
    const approved = SEED_RECOMMENDATIONS.map((r) => ({ ...r, approvedByAdvisor: true, includeInPdf: true, status: "approved" as const }));
    const proposed = applyRecommendationsToProposed(holdings, approved, SEED_ACCOUNTS, { reportingCurrency: "USD", rates: SEED_FX_RATES });
    const s = valuationSummary(holdings);
    expect(s.complete).toBe(true);
    expect({ gross: s.assets.value, liabilities: Math.abs(s.liabilities.value!), net: s.net.value }).toEqual(baseline.netWorth);
    expect(Object.fromEntries(holdings.map((h) => [h.id, Math.round(h.reportingMarketValue! * 100) / 100]))).toEqual(baseline.reporting);
    expect(summarizeAllocation(holdings, (h) => ASSET_CLASS_LABELS[h.assetClass] ?? "Other").map((r) => [r.label, Math.round(r.value * 100) / 100])).toEqual(baseline.allocationByClass);
    // #26 adds one intended insight: the sample's reference rates (2026-04-30)
    // are older than the 7-day FX policy on the capture date. Every other title is unchanged.
    const titles = generateInsights({ holdings, reportingCurrency: "USD" }).map((i) => i.title).sort();
    const fxTask = "5 holdings are valued with exchange rates older than 7 days";
    expect(titles).toContain(fxTask);
    expect(titles.filter((t) => t !== fxTask)).toEqual(baseline.insightTitles);
    const readiness = evaluateWorkspaceReadiness({ sourceDocuments: [], client: SEED_CLIENT, advisor: SEED_ADVISOR, accounts: SEED_ACCOUNTS, holdings, recommendations: approved, disclosures: DISCLOSURE_LIBRARY, fxRates: SEED_FX_RATES });
    // The checks added since (holdings_valued here, imports_complete in #29,
    // recommendation_currency in #24, recommendation_links in the PR #66 review) pass; every pre-existing check is unchanged.
    const added = ["holdings_valued", "imports_complete", "recommendation_currency", "recommendation_links", "funding_reserves", "approved_alternative", "strategy_terms"]; // D2: funding_reserves and approved_alternative; D2a: strategy_terms
    expect(readiness.filter((c) => added.includes(c.code)).every((c) => c.passed)).toBe(true);
    // #26: "Exchange rates current" intentionally fails for the sample's stale rates in use.
    expect(readiness.find((c) => c.code === "fx_current")).toEqual({
      code: "fx_current",
      label: "Exchange rates current",
      passed: false,
      detail:
        "CAD/USD 174 days old (2026-04-30, ECB); CHF/USD 174 days old (2026-04-30, ECB); EUR/USD 174 days old (2026-04-30, ECB); GBP/USD 174 days old (2026-04-30, ECB); JPY/USD 174 days old (2026-04-30, ECB). Refresh in Exchange rates or confirm them (policy: 7 days).",
    });
    // R18 slice 2 / R11 (#51, #46) rewords this detail; its code and result are the baseline's.
    const reworded = (r: (string | boolean | null)[]) => (r[2] === "1 out-of-date price(s)" ? [r[0], r[1], "1 out-of-date value(s) not yet reviewed"] : r);
    expect(readiness.filter((c) => ![...added, "fx_current"].includes(c.code)).map((c) => [c.code, c.passed, c.detail ?? null])).toEqual(baseline.readiness.map(reworded));
    expect(Object.fromEntries(proposed.holdings.map((h) => [h.id, Math.round((h.reportingMarketValue ?? 0) * 100) / 100]))).toEqual(baseline.proposedReporting);
    const html = renderToStaticMarkup(
      React.createElement(ProposalPdfTemplate, {
        client: SEED_CLIENT, advisor: SEED_ADVISOR, accounts: SEED_ACCOUNTS, holdings, recommendations: approved,
        sections: DEFAULT_PROPOSAL_SECTIONS, disclosures: DISCLOSURE_LIBRARY, fxRates: SEED_FX_RATES,
        proposal: { id: "p" } as Proposal, variant: "final",
      })
    );
    const text = html.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
    // #26 adds one block to the Assumptions page: the rates actually used. The
    // rest of the document is unchanged from the baseline.
    const block =
      " Exchange rates used in this proposal Rate Value As of Source Age Status CAD/USD 0.7320 2026-04-30 ECB 174 days stale CHF/USD 1.1180 2026-04-30 ECB 174 days stale EUR/USD 1.0850 2026-04-30 ECB 174 days stale GBP/USD 1.2620 2026-04-30 ECB 174 days stale JPY/USD 0.006380 2026-04-30 ECB 174 days stale Reference rates, not transaction rates. A rate is treated as current for 7 days after its date, an initial product policy rather than an industry or regulatory standard. Not confirmed: CAD/USD, CHF/USD, EUR/USD, GBP/USD, JPY/USD are older than 7 days or unverified, and the advisor hasn&#x27;t confirmed them.";
    expect(text.split(block)).toHaveLength(2);
    // The PR #60 review: the Assumptions bullet names the sources of the rates
    // actually used (all ECB in the sample) instead of a blanket claim.
    const before = " Reporting currency: USD . FX rates are ECB reference rates (sourced via Frankfurter where applicable).";
    const after = " Reporting currency: USD . Exchange rates used: ECB reference rates, each listed with its date below.";
    expect(text.split(after)).toHaveLength(2);
    // R18 slice 1 (#51) rewrites how value sources are described, and nothing
    // else: the Key Findings source line, the Data Sources table, the
    // Valuation Sources & Dates page, one Assumptions bullet, three disclosure
    // texts and the A3 appendix. Those regions are cut from both documents;
    // every other word must still match the baseline.
    const cut = (t: string, regions: [string, string][]) =>
      regions.reduce((acc, [start, end], i) => {
        const from = acc.indexOf(start);
        expect(from, start).toBeGreaterThanOrEqual(0);
        expect(acc.indexOf(start, from + 1), start).toBe(-1);
        const to = acc.indexOf(end, from + start.length);
        expect(to, end).toBeGreaterThan(from);
        return `${acc.slice(0, from)} [R18 region ${i}]${acc.slice(to)}`;
      }, t);
    const PAGE_END = " SAMPLE generated by Atlas";
    const oldRegions: [string, string][] = [
      [" 0 of 25 holdings have public market data references", " 6 advisor-approved recommendation(s)"],
      [" Holding Source kind Provider As of Confidence", PAGE_END],
      [" 12 Market Data & Valuation Sources", PAGE_END],
      [" Public market values reflect end-of-day", " Manually valued or sponsor-reported"],
      [" Holdings information was sourced from", " Information obtained from third-party sources"],
      [" Market Data Public market prices", " Delayed and EOD Quotes"],
      [" Where market data was unavailable from configured providers", " FX Rates"],
      [" A3 Appendix — Market Data Sources", PAGE_END],
      // D3 (R16 minimum): costs and income state their coverage instead of
      // counting missing data as zero; the tax page says no tax analysis is included.
      [" Estimated weighted expense ratio", " Concentration risk count"],
      [" Income and expense estimates are derived", PAGE_END],
      [" Income and expense ratio figures are estimates", " The proposal does not model"],
      [" Tax considerations", " The advisor will coordinate"],
    ];
    const newRegions: [string, string][] = [
      [" Values used: 18 statement values and 7 manual valuations.", " 6 advisor-approved recommendation(s)"],
      [" Holding Value used Recorded source Date Review", PAGE_END],
      [" 12 Valuation Sources & Dates", PAGE_END],
      [" Holding values are the statement, advisor-entered, override or approved values", " Manually valued or sponsor-reported"],
      [" Holdings information was sourced from", " Information obtained from third-party sources"],
      [" Market Prices Security values in this proposal", " Delayed and EOD Quotes"],
      [" Mock or placeholder values may appear", " FX Rates"],
      [" A3 Appendix — Valuation & Exchange-Rate Sources", PAGE_END],
      [" Weighted expense ratio, current", " Concentration risk count"],
      [" Expense ratios and income use only", PAGE_END],
      [" Income and expense ratio figures use only", " The proposal does not model"],
      [" Tax considerations", " The advisor will coordinate"],
    ];
    const current = text.replace(block, "").replace(after, before);
    expect(cut(current, newRegions)).toBe(cut(baseline.pdfText, oldRegions));
    // The rewritten page lists every holding with the basis and date its value has.
    const page = current.slice(current.indexOf(" 12 Valuation Sources & Dates"));
    let at = 0;
    for (const h of SEED_HOLDINGS) {
      const row = ` ${h.assetName} ${h.identifier?.value ?? "—"} ${h.valuationSource.kind === "statement" ? "Statement value" : "Manual valuation"} ${formatCalendarDate(h.valuationDate)} `;
      const i = page.indexOf(row, at);
      expect(i, row).toBeGreaterThan(at - 1);
      at = i;
    }
    // The page's currency and reporting-value columns are cut from the text
    // comparison above with the rest of the page, so compare them here.
    const pairs = (t: string) => [...t.matchAll(/ ([A-Z]{3}) (-?\$[\d.,]+[KM]?|Not valued in USD) /g)].map((x) => `${x[1]} ${x[2]}`);
    const oldPage = baseline.pdfText.slice(baseline.pdfText.indexOf(" 12 Market Data & Valuation Sources"), baseline.pdfText.indexOf(" Harbor", baseline.pdfText.indexOf(" 12 Market Data & Valuation Sources")));
    const newPage = page.slice(0, page.indexOf(" Harbor"));
    expect(pairs(newPage)).toHaveLength(SEED_HOLDINGS.length);
    expect(pairs(newPage)).toEqual(pairs(oldPage));
  });
});
