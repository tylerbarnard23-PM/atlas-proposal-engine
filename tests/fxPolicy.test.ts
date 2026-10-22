import { afterEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Account, FxRate, Holding, Recommendation, SourceDocument } from "@/domain/types";
import { resolveFxRate } from "@/engines/currencyEngine";
import {
  FX_CONFIRMATION_DAYS,
  STALE_FX_DAYS,
  confirmStaleRates,
  currenciesToRequest,
  fxAgeDays,
  fxFreshness,
  fxPairKey,
  fxRatesInUse,
  mergeFxRefresh,
} from "@/engines/fxPolicy";
import { evaluateWorkspaceReadiness } from "@/engines/complianceEngine";
import { describeAmounts } from "@/engines/recommendationAmounts";
import { CopilotContext, executeTool } from "@/copilot/tools";
import { ProposalPdfTemplate } from "@/pdf/templates/ProposalPdfTemplate";
import { DEFAULT_PROPOSAL_SECTIONS } from "@/engines/proposalEngine";
import { SEED_ADVISOR, SEED_CLIENT } from "@/data/seedClient";
import { DISCLOSURE_LIBRARY } from "@/domain/disclosureLibrary";

// Issue #26: FX refresh merges instead of replacing, freshness is computed
// from dates with an injected clock, and stale rates actually used by the
// proposal need a refresh or an explicit, expiring confirmation.

const NOW = new Date("2026-10-22T12:00:00Z");
const OLD = "2026-04-30T00:00:00Z";
const FRESH = "2026-10-21T00:00:00Z";
const rate = (base: string, quote: string, value: number, asOf = OLD, source: FxRate["source"] = "ECB", extra: Partial<FxRate> = {}): FxRate => ({ base, quote, rate: value, asOf, source, ...extra });

const acct = (id: string, baseCurrency = "USD"): Account => ({ id, name: id, type: "brokerage", baseCurrency, createdAt: OLD, updatedAt: OLD }) as Account;
const holding = (id: string, currency: string, value: number, extra: Partial<Holding> = {}): Holding =>
  ({
    id,
    accountId: "a1",
    assetName: id,
    assetClass: "equity",
    currency,
    nativeMarketValue: value,
    valuationDate: "2026-10-20",
    valuationSource: { kind: "statement", asOf: "2026-10-20", confidence: "high" },
    quoteType: "manual",
    priceFreshness: "manual",
    dataQuality: [],
    advisorVerification: "advisor_approved",
    sourceTrace: { sourceType: "manual" },
    createdAt: OLD,
    updatedAt: OLD,
    ...extra,
  }) as unknown as Holding;
const rec = (patch: Partial<Recommendation>): Recommendation => ({
  id: "r1",
  title: "Rec",
  type: "sell",
  currency: "USD",
  rationale: "",
  priority: "medium",
  status: "approved",
  includeInPdf: true,
  approvedByAdvisor: true,
  createdAt: OLD,
  updatedAt: OLD,
  ...patch,
});

const ws = (patch: Partial<{ holdings: Holding[]; accounts: Account[]; recommendations: Recommendation[]; fxRates: FxRate[]; reportingCurrency: string }> = {}) => ({
  holdings: [holding("usd_eq", "USD", 1_000), holding("eur_eq", "EUR", 1_000)],
  accounts: [acct("a1")],
  recommendations: [] as Recommendation[],
  fxRates: [rate("EUR", "USD", 1.1), rate("GBP", "USD", 1.3), rate("CHF", "USD", 1.2)],
  reportingCurrency: "USD",
  ...patch,
});

afterEach(() => vi.useRealTimers());

describe("refresh merges by pair instead of replacing", () => {
  const existing = [rate("EUR", "USD", 1.085), rate("GBP", "USD", 1.262), rate("JPY", "USD", 0.0064), rate("CHF", "USD", 1.118, "2026-09-01T00:00:00Z", "Manual"), rate("SEK", "USD", 0.095, "2026-10-01T00:00:00Z", "Mock")];
  const response = {
    ok: true as const,
    provider: "Frankfurter (ECB reference rates)",
    base: "USD",
    requested: ["EUR", "GBP", "JPY", "CHF", "SEK"],
    rates: [rate("USD", "EUR", 0.9, FRESH), rate("USD", "GBP", 0.78, FRESH), rate("USD", "CHF", 0.88, FRESH), rate("USD", "SEK", 10.4, FRESH)],
  };

  it("replaces both orientations of a returned pair and retains unreturned pairs with their original date and source", () => {
    const { rates, record } = mergeFxRefresh(existing, response, NOW);
    const byKey = (k: string) => rates.filter((r) => fxPairKey(r.base, r.quote) === k);
    // EUR: the stale EUR→USD copy is gone; only the fresh USD→EUR remains.
    expect(byKey("EUR/USD")).toEqual([expect.objectContaining({ base: "USD", quote: "EUR", rate: 0.9, asOf: FRESH, source: "ECB", refreshedAt: NOW.toISOString() })]);
    expect(byKey("EUR/USD")[0].notInLastRefresh).toBeUndefined();
    // JPY wasn't returned: kept exactly as it was, labelled.
    expect(byKey("JPY/USD")).toEqual([{ ...existing[2], notInLastRefresh: true }]);
    expect(record).toMatchObject({ ok: true, at: NOW.toISOString(), updated: ["EUR/USD", "GBP/USD", "SEK/USD"], retained: ["JPY/USD"], manualKept: ["CHF/USD"] });
  });

  it("keeps manual provenance; a provider quote replaces mock data", () => {
    const { rates } = mergeFxRefresh(existing, response, NOW);
    expect(rates.find((r) => fxPairKey(r.base, r.quote) === "CHF/USD")).toEqual(existing[3]);
    expect(rates.filter((r) => fxPairKey(r.base, r.quote) === "SEK/USD")).toEqual([expect.objectContaining({ source: "ECB", asOf: FRESH })]);
  });

  it("a failed refresh changes no rate and reports the failure", () => {
    const { rates, record } = mergeFxRefresh(existing, { ok: false, provider: "Frankfurter (ECB reference rates)", base: "USD", requested: ["EUR"], error: "HTTP 503" }, NOW);
    expect(rates).toEqual(existing);
    expect(record).toMatchObject({ ok: false, error: "HTTP 503", updated: [], retained: [] });
  });

  it("ignores unusable returned quotes instead of storing them", () => {
    const { rates, record } = mergeFxRefresh(existing, { ...response, rates: [rate("USD", "EUR", 0, FRESH), rate("USD", "GBP", Number.NaN, FRESH)] }, NOW);
    expect(rates.find((r) => fxPairKey(r.base, r.quote) === "EUR/USD")).toMatchObject({ rate: 1.085, notInLastRefresh: true });
    expect(record.updated).toEqual([]);
  });

  it("the FX route requests the given currencies and reports a provider failure", async () => {
    const { GET } = await import("@/app/api/market-data/fx/route");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ amount: 1, base: "USD", date: "2026-10-21", rates: { EUR: 0.9 } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const ok = await (await GET(new Request("http://localhost/api/market-data/fx?base=USD&quotes=EUR,SEK,bad!"))).json();
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain("to=EUR,SEK");
    expect(ok).toMatchObject({ ok: true, requested: ["EUR", "SEK"], rates: [{ base: "USD", quote: "EUR", rate: 0.9, asOf: "2026-10-21T00:00:00.000Z", source: "ECB" }] });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })));
    const failed = await GET(new Request("http://localhost/api/market-data/fx?base=USD&quotes=EUR"));
    expect(failed.status).toBe(502);
    expect(await failed.json()).toMatchObject({ ok: false, error: "HTTP 503" });
    vi.unstubAllGlobals();
  });
});

describe("resolving rates consistently, with the legs used", () => {
  it("a newer inverse quote beats a stale direct one", () => {
    const r = resolveFxRate([rate("EUR", "USD", 1.085, OLD), rate("USD", "EUR", 0.9, FRESH)], "EUR", "USD")!;
    expect(r.rate).toBeCloseTo(1 / 0.9, 12);
    expect(r).toMatchObject({ path: "inverse", asOf: FRESH, legs: [expect.objectContaining({ base: "USD", quote: "EUR", asOf: FRESH })] });
  });

  it("a cross rate through USD records both legs and is as old as the older one", () => {
    const r = resolveFxRate([rate("USD", "CHF", 0.8, FRESH), rate("EUR", "USD", 1.1, OLD)], "CHF", "EUR")!;
    expect(r.rate).toBeCloseTo((1 / 0.8) / 1.1, 12);
    expect(r.path).toBe("cross");
    expect(r.asOf).toBe(OLD);
    expect(r.legs.map((l) => fxPairKey(l.base, l.quote))).toEqual(["CHF/USD", "EUR/USD"]);
  });
});

describe("currencies to request versus rates actually used", () => {
  it("requests holding, approved-valuation, account/cash, recommendation and reporting currencies", () => {
    const input = ws({
      reportingCurrency: "EUR",
      holdings: [holding("sek", "SEK", 1), holding("ap", "USD", 1, { proposalApprovedValue: { amount: 1, currency: "NOK", source: { kind: "statement", asOf: OLD, confidence: "high" } } as Holding["proposalApprovedValue"] }), holding("cash", "HKD", 1, { assetClass: "cash" })],
      accounts: [acct("a1", "DKK")],
      recommendations: [rec({ currency: "JPY", actionAmount: 1, actionAmountUnit: "amount" })],
    });
    expect(currenciesToRequest(input)).toEqual(["DKK", "EUR", "HKD", "JPY", "NOK", "SEK", "USD"]);
  });

  it("only legs used by a valuation, an approved conversion or a cash offset are in use", () => {
    const input = ws({
      holdings: [holding("eur_eq", "EUR", 1_000), holding("chf_cash", "CHF", 500, { assetClass: "cash", accountId: "a2" })],
      accounts: [acct("a1"), acct("a2", "CHF")],
      fxRates: [rate("EUR", "USD", 1.1), rate("GBP", "USD", 1.3), rate("CHF", "USD", 1.2), rate("JPY", "USD", 0.0064)],
      recommendations: [rec({ currency: "GBP", relatedHoldingId: "eur_eq", actionAmount: 10, actionAmountUnit: "amount" })],
    });
    const keys = fxRatesInUse(input).map((u) => u.key);
    expect(keys).toEqual(["CHF/USD", "EUR/USD", "GBP/USD"]);
    expect(fxRatesInUse(input).find((u) => u.key === "GBP/USD")!.uses.map((u) => u.label)).toEqual(["Recommendation: Rec (GBP amount)"]);
  });
});

describe("approved valuation currencies", () => {
  it("a holding valued by an approved value in another currency uses that currency's rate, not the holding's", () => {
    const approvedNok = holding("ap", "USD", 1_000, { proposalApprovedValue: { amount: 9_000, currency: "NOK", source: { kind: "statement", asOf: OLD, confidence: "high" } } as Holding["proposalApprovedValue"] });
    const input = ws({ holdings: [approvedNok], fxRates: [rate("NOK", "USD", 0.09, OLD), rate("EUR", "USD", 1.1, OLD)] });
    expect(fxRatesInUse(input).map((u) => u.key)).toEqual(["NOK/USD"]);
    expect(fxFreshness({ ...input, now: NOW }).attention.map((l) => l.key)).toEqual(["NOK/USD"]);
  });
});

describe("freshness from dates, with an injected clock", () => {
  it(`is a named ${STALE_FX_DAYS}-day product policy, measured in UTC calendar days`, () => {
    expect(STALE_FX_DAYS).toBe(7);
    expect(fxAgeDays("2026-10-14T23:30:00Z", new Date("2026-10-21T23:59:59Z"))).toBe(7);
    expect(fxAgeDays("2026-10-14T00:00:00Z", new Date("2026-10-22T00:00:00Z"))).toBe(8);
    expect(fxAgeDays("2026-10-14", new Date("2026-10-14T23:59:59Z"))).toBe(0);
  });

  it("current through day 7, stale from day 8", () => {
    const input = (asOf: string) => ws({ fxRates: [rate("EUR", "USD", 1.1, asOf)] });
    const day7 = fxFreshness({ ...input("2026-10-15T00:00:00Z"), now: NOW });
    const day8 = fxFreshness({ ...input("2026-10-14T00:00:00Z"), now: NOW });
    expect(day7).toMatchObject({ current: true, attention: [] });
    expect(day8.current).toBe(false);
    expect(day8.attention).toEqual([expect.objectContaining({ key: "EUR/USD", ageDays: 8, stale: true })]);
  });

  it("mock data dated today is never current; manual data keeps its label and ages normally", () => {
    const mock = fxFreshness({ ...ws({ fxRates: [rate("EUR", "USD", 1.1, NOW.toISOString(), "Mock")] }), now: NOW });
    expect(mock.attention).toEqual([expect.objectContaining({ unverified: true, ageDays: 0 })]);
    const manual = fxFreshness({ ...ws({ fxRates: [rate("EUR", "USD", 1.1, FRESH, "Manual")] }), now: NOW });
    expect(manual).toMatchObject({ current: true });
    expect(manual.inUse[0]).toMatchObject({ source: "Manual", manual: true, stale: false });
  });

  it("an unused stale rate doesn't need attention", () => {
    const f = fxFreshness({ ...ws({ fxRates: [rate("EUR", "USD", 1.1, FRESH), rate("JPY", "USD", 0.0064, OLD)] }), now: NOW });
    expect(f.current).toBe(true);
  });
});

describe("explicit confirmation", () => {
  const stale = () => ws();
  const base = () => ({
    client: SEED_CLIENT,
    advisor: SEED_ADVISOR,
    accounts: stale().accounts,
    holdings: stale().holdings.map((h): Holding => ({ ...h, advisorVerification: "advisor_approved" })),
    recommendations: [rec({ relatedHoldingId: "usd_eq", actionAmount: 1, actionAmountUnit: "amount" })],
    disclosures: DISCLOSURE_LIBRARY,
    fxRates: stale().fxRates,
    sourceDocuments: [] as SourceDocument[],
  });
  const check = (inputs: ReturnType<typeof base> & { fxConfirmation?: unknown; now?: Date }) =>
    evaluateWorkspaceReadiness(inputs as never).find((c) => c.code === "fx_current")!;

  it("stale rates in use fail 'Exchange rates current'; a confirmation records pairs, oldest date, time and fingerprint", () => {
    const failing = check({ ...base(), now: NOW });
    expect(failing).toMatchObject({ label: "Exchange rates current", passed: false });
    expect(failing.detail).toContain("EUR/USD 175 days old (2026-04-30, ECB)");
    const c = confirmStaleRates({ ...stale(), now: NOW })!;
    expect(c).toMatchObject({ pairs: ["EUR/USD"], oldestRateDate: "2026-04-30", confirmedAt: NOW.toISOString(), expiresAt: "2026-10-29T12:00:00.000Z" });
    expect(c.fingerprint).toMatch(/^[0-9a-f]{16}$/);
    expect(check({ ...base(), fxConfirmation: c, now: NOW })).toMatchObject({ passed: true });
  });

  it(`expires exactly ${FX_CONFIRMATION_DAYS} days (168 hours) after it was given`, () => {
    const c = confirmStaleRates({ ...stale(), now: NOW })!;
    expect(check({ ...base(), fxConfirmation: c, now: new Date(Date.parse(c.expiresAt) - 1) }).passed).toBe(true);
    const expired = check({ ...base(), fxConfirmation: c, now: new Date(c.expiresAt) });
    expect(expired.passed).toBe(false);
    expect(expired.detail).toMatch(/confirmation expired/);
  });

  it("is invalidated when a covered rate changes or when the rates' use changes", () => {
    const c = confirmStaleRates({ ...stale(), now: NOW })!;
    const changedRate = check({ ...base(), fxRates: [rate("EUR", "USD", 1.2), ...base().fxRates.slice(1)], fxConfirmation: c, now: NOW });
    expect(changedRate.passed).toBe(false);
    expect(changedRate.detail).toMatch(/rates or their use changed/);
    const newUse = check({ ...base(), holdings: [...base().holdings, holding("gbp_eq", "GBP", 1)], fxConfirmation: c, now: NOW });
    expect(newUse.passed).toBe(false);
    const sameUseMoreValue = check({ ...base(), holdings: base().holdings.map((h) => ({ ...h, nativeMarketValue: h.nativeMarketValue * 2 })), fxConfirmation: c, now: NOW });
    expect(sameUseMoreValue.passed).toBe(true);
  });

  it("never bypasses missing rates, incomplete imports or other gates", () => {
    const c = confirmStaleRates({ ...stale(), now: NOW })!;
    const missing = evaluateWorkspaceReadiness({ ...base(), holdings: [...base().holdings, holding("aud_eq", "AUD", 1)], fxConfirmation: c, now: NOW } as never);
    expect(missing.find((x) => x.code === "holdings_valued")!.passed).toBe(false);
    const doc = { id: "sd", fileName: "partial.pdf", sourceType: "pdf_text", uploadedAt: OLD, extractionStatus: "extracted", importCompleteness: { status: "incomplete", reason: "total_mismatch", unreadableRows: 0 } } as SourceDocument;
    const incomplete = evaluateWorkspaceReadiness({ ...base(), holdings: base().holdings.map((h) => ({ ...h, sourceTrace: { sourceType: "pdf_text" as const, sourceDocumentId: "sd" } })), sourceDocuments: [doc], fxConfirmation: c, now: NOW } as never);
    expect(incomplete.find((x) => x.code === "imports_complete")!.passed).toBe(false);
    expect(incomplete.find((x) => x.code === "fx_current")!.passed).toBe(true);
  });

  it("the final-PDF route refuses stale rates without a valid confirmation, using the server clock", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const { POST } = await import("@/app/api/proposals/[id]/generate-pdf/route");
    const post = async (extra: object) => {
      const state = { ...base(), sections: [], proposal: { id: "p1" }, ...extra };
      const res = await POST(new Request("http://localhost/api/proposals/p1/generate-pdf?variant=final", { method: "POST", body: JSON.stringify({ state }) }), { params: Promise.resolve({ id: "p1" }) });
      return res.status === 422 ? ((await res.json()).failing as string[]) : [];
    };
    expect(await post({})).toContain("Exchange rates current");
    const c = confirmStaleRates({ ...stale(), now: NOW })!;
    expect(await post({ fxConfirmation: c })).not.toContain("Exchange rates current");
    // A confirmation the client claims is still valid, but whose fingerprint doesn't match, is refused.
    expect(await post({ fxConfirmation: { ...c, fingerprint: "0000000000000000" } })).toContain("Exchange rates current");
  });
});

describe("honest status in the outputs", () => {
  it("recommendation conversions show a stale rate's age when given the current date", () => {
    const r = rec({ currency: "EUR", actionAmount: 100, actionAmountUnit: "amount" });
    expect(describeAmounts(r, { reportingCurrency: "USD", rates: [rate("EUR", "USD", 1.1)], now: NOW })).toContain("as of 2026-04-30, 175 days old, older than the 7-day policy;");
    expect(describeAmounts(r, { reportingCurrency: "USD", rates: [rate("EUR", "USD", 1.1, FRESH)], now: NOW })).not.toMatch(/days old/);
  });

  it("the PDF lists the rates actually used, with dates, sources and the confirmation", () => {
    const input = ws({
      reportingCurrency: "EUR",
      holdings: [holding("chf_eq", "CHF", 1_000), holding("eur_eq", "EUR", 1_000)],
      fxRates: [rate("USD", "CHF", 0.8, FRESH), rate("EUR", "USD", 1.1, OLD), rate("JPY", "USD", 0.0064, OLD)],
    });
    const c = confirmStaleRates({ ...input, now: NOW })!;
    const html = renderToStaticMarkup(
      React.createElement(ProposalPdfTemplate, {
        client: { ...SEED_CLIENT, proposalOutputCurrency: "EUR" },
        advisor: SEED_ADVISOR,
        accounts: input.accounts,
        holdings: input.holdings,
        recommendations: [],
        sections: DEFAULT_PROPOSAL_SECTIONS,
        disclosures: DISCLOSURE_LIBRARY,
        fxRates: input.fxRates,
        proposal: { id: "p" } as never,
        variant: "draft",
        fxConfirmation: c,
        now: NOW.toISOString(),
      })
    );
    const text = html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
    expect(text).toContain("Exchange rates used in this proposal");
    expect(text).toMatch(/USD\/CHF 0\.8000 2026-10-21 ECB 1 day current/);
    expect(text).toMatch(/EUR\/USD 1\.1000 2026-04-30 ECB 175 days stale/);
    expect(text).not.toContain("JPY/USD");
    expect(text).toContain("CHF → EUR is a cross rate through USD");
    expect(text).toContain("Rates older than 7 days (EUR/USD, oldest 2026-04-30) were confirmed by the advisor on 2026-10-22 12:00 UTC; the confirmation expires 2026-10-29 12:00 UTC.");
  });

  it("the Copilot reports freshness but staleness alone doesn't block a draft", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const s = ws();
    const ctx = new CopilotContext({ client: SEED_CLIENT, advisor: SEED_ADVISOR, accounts: s.accounts, holdings: s.holdings, fxRates: s.fxRates, recommendations: [], disclosures: DISCLOSURE_LIBRARY } as never);
    const o = JSON.parse(executeTool(ctx, "get_portfolio_overview", {}).content);
    expect(o.fx_freshness).toMatchObject({ policy_days: 7, current: false, stale_in_use: [expect.objectContaining({ pair: "EUR/USD", age_days: 175 })] });
    const draft = executeTool(ctx, "draft_recommendation", { holding_id: "eur_eq", type: "sell", action_amount: 100, title: "Trim", priority: "medium", rationale: "Testing a trade draft." });
    expect(draft.isError).toBe(false);
  });
});

describe("saved workspaces", () => {
  it("v6 migration removes the obsolete isStale flag and keeps every rate", async () => {
    const { migrateAtlasState } = await import("@/store/useStore");
    const old = { client: SEED_CLIENT, fxRates: [{ ...rate("EUR", "USD", 1.1), isStale: true }, rate("GBP", "USD", 1.3)] };
    const next = migrateAtlasState(structuredClone(old), 5);
    expect(next.fxRates).toEqual([rate("EUR", "USD", 1.1), rate("GBP", "USD", 1.3)]);
    expect(migrateAtlasState(structuredClone(next), 5).fxRates).toEqual(next.fxRates);
  });

  it("refresh results and confirmations are kept in the saved store", async () => {
    const { useAtlasStore } = await import("@/store/useStore");
    const s = useAtlasStore.getState();
    const merged = mergeFxRefresh(s.fxRates, { ok: true, provider: "Frankfurter (ECB reference rates)", base: "USD", requested: ["EUR"], rates: [rate("USD", "EUR", 0.9, FRESH)] }, NOW);
    s.applyFxRefresh(merged);
    const c = { confirmedAt: NOW.toISOString(), expiresAt: "2026-10-29T12:00:00.000Z", pairs: ["GBP/USD"], oldestRateDate: "2026-04-30", fingerprint: "abcdabcdabcdabcd", reportingCurrency: "USD" };
    s.setFxConfirmation(c);
    const saved = JSON.parse(JSON.stringify(useAtlasStore.getState()));
    expect(saved.fxRefresh).toMatchObject({ ok: true, updated: ["EUR/USD"] });
    expect(saved.fxConfirmation).toEqual(c);
    expect(saved.fxRates.filter((r: FxRate) => fxPairKey(r.base, r.quote) === "EUR/USD")).toEqual([expect.objectContaining({ rate: 0.9 })]);
  });
});
