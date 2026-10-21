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
    const checks = evaluateWorkspaceReadiness({ ...ws, holdings: SEED_HOLDINGS, fxRates: NO_CHF });
    const valued = checks.find((c) => c.code === "holdings_valued")!;
    expect(valued.passed).toBe(false);
    expect(valued.detail).toContain("CHF/USD");
    expect(checks.find((c) => c.code === "fx_available")?.passed).toBe(true); // no proposed trades
    expect(evaluateWorkspaceReadiness({ ...ws, holdings: SEED_HOLDINGS, fxRates: SEED_FX_RATES }).find((c) => c.code === "holdings_valued")?.passed).toBe(true);
  });

  it("re-normalizes: holdings sent with a cached reporting value still fail without the rate", () => {
    const cached = normalizeHoldings(SEED_HOLDINGS, SEED_FX_RATES, "USD"); // valued with the CHF rate
    expect(evaluateWorkspaceReadiness({ ...ws, holdings: cached, fxRates: NO_CHF }).find((c) => c.code === "holdings_valued")?.passed).toBe(false);
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
        proposal: { id: "p", outputCurrency: "USD" } as Proposal,
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
    const checks = evaluateWorkspaceReadiness({ client: SEED_CLIENT, advisor: SEED_ADVISOR, accounts: SEED_ACCOUNTS, holdings: withLoan, recommendations: [], disclosures: DISCLOSURE_LIBRARY, fxRates: SEED_FX_RATES });
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
    expect(generateInsights({ holdings, reportingCurrency: "USD" }).map((i) => i.title).sort()).toEqual(baseline.insightTitles);
    const readiness = evaluateWorkspaceReadiness({ client: SEED_CLIENT, advisor: SEED_ADVISOR, accounts: SEED_ACCOUNTS, holdings, recommendations: approved, disclosures: DISCLOSURE_LIBRARY, fxRates: SEED_FX_RATES });
    // The new check passes; every pre-existing check is unchanged.
    expect(readiness.find((c) => c.code === "holdings_valued")?.passed).toBe(true);
    expect(readiness.filter((c) => c.code !== "holdings_valued").map((c) => [c.code, c.passed, c.detail ?? null])).toEqual(baseline.readiness);
    expect(Object.fromEntries(proposed.holdings.map((h) => [h.id, Math.round((h.reportingMarketValue ?? 0) * 100) / 100]))).toEqual(baseline.proposedReporting);
    const html = renderToStaticMarkup(
      React.createElement(ProposalPdfTemplate, {
        client: SEED_CLIENT, advisor: SEED_ADVISOR, accounts: SEED_ACCOUNTS, holdings, recommendations: approved,
        sections: DEFAULT_PROPOSAL_SECTIONS, disclosures: DISCLOSURE_LIBRARY, fxRates: SEED_FX_RATES,
        proposal: { id: "p", outputCurrency: "USD" } as Proposal, variant: "final",
      })
    );
    const text = html.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
    expect(text).toBe(baseline.pdfText);
  });
});
