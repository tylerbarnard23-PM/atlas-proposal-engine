import { describe, expect, it } from "vitest";
import type { Account, FxRate, Holding, Recommendation, SourceDocument } from "@/domain/types";
import { normalizeHoldings } from "@/engines/normalizationEngine";
import { applyRecommendationsToProposed, type FxContext } from "@/engines/proposalEngine";
import { previewRecommendation } from "@/engines/recommendationPreview";
import { migrateRecommendationCurrency } from "@/engines/recommendationAmounts";
import { summarizePreview } from "@/components/recommendations/recEffect";
import { CopilotContext, executeTool } from "@/copilot/tools";
import { SEED_ADVISOR, SEED_CLIENT } from "@/data/seedClient";
import { DISCLOSURE_LIBRARY } from "@/domain/disclosureLibrary";

// Issue #33: the editor's preview (and each saved card) runs the complete
// proposal engine in isolation: actual cash offsets, household debt funding,
// missing rates and shortfalls, at full currency precision. Nothing is
// inferred by negating the position change, and nothing is saved.

const NOW = "2026-10-21T00:00:00.000Z";
const RATES: FxRate[] = [{ base: "USD", quote: "EUR", rate: 0.8, asOf: "2026-10-20T00:00:00Z", source: "ECB" }];
const fx = (reportingCurrency = "USD", rates = RATES): FxContext => ({ reportingCurrency, rates });

const account = (id: string, name: string, baseCurrency = "USD"): Account => ({ id, name, type: "brokerage", baseCurrency, createdAt: NOW, updatedAt: NOW }) as Account;
const ACCOUNTS = [account("brk", "Brokerage"), account("bank", "Bank"), account("loan", "Mortgage"), account("ubs", "UBS")];

const holding = (id: string, accountId: string, assetClass: Holding["assetClass"], value: number, patch: Partial<Holding> = {}): Holding =>
  ({
    id,
    accountId,
    assetName: id,
    assetClass,
    currency: "USD",
    nativeMarketValue: value,
    valuationDate: "2026-10-20",
    valuationSource: { kind: "statement", asOf: "2026-10-20", confidence: "high" },
    quoteType: "manual",
    priceFreshness: "manual",
    dataQuality: [],
    advisorVerification: "advisor_approved",
    sourceTrace: { sourceType: "manual" },
    createdAt: NOW,
    updatedAt: NOW,
    ...patch,
  }) as unknown as Holding;

const HOLDINGS = [
  holding("ubs_cash", "ubs", "cash", 179_478.88, { assetName: "UBS BANK USA DEPOSIT ACCOUNT" }),
  holding("sec", "brk", "equity", 100_000, { assetName: "Example Equity" }),
  holding("brk_cash", "brk", "cash", 10_000, { assetName: "Brokerage cash" }),
  holding("bank_cash", "bank", "cash", 50_000, { assetName: "Bank cash" }),
  holding("mortgage", "loan", "liability", -200_000, { assetName: "Mortgage", isLiability: true }),
];

const rec = (patch: Partial<Recommendation> = {}): Recommendation => ({
  id: "r1",
  title: "Test",
  type: "sell",
  relatedHoldingId: "sec",
  relatedAccountId: "brk",
  currency: "USD",
  rationale: "",
  priority: "medium",
  status: "draft",
  includeInPdf: false,
  approvedByAdvisor: false,
  createdAt: NOW,
  updatedAt: NOW,
  ...patch,
});

const preview = (r: Recommendation, opts: { recommendations?: Recommendation[]; reporting?: string; rates?: FxRate[]; holdings?: Holding[]; sourceDocuments?: SourceDocument[] } = {}) => {
  const reporting = opts.reporting ?? "USD";
  const rates = opts.rates ?? RATES;
  return previewRecommendation({
    rec: r,
    holdings: normalizeHoldings(opts.holdings ?? HOLDINGS, rates, reporting),
    recommendations: opts.recommendations ?? [],
    accounts: ACCOUNTS,
    fx: fx(reporting, rates),
    sourceDocuments: opts.sourceDocuments ?? [],
  });
};

describe("the screenshot case: a USD 3 reduction of a cash holding", () => {
  it.each(["reduce", "sell", "raise_cash"] as const)("%s: cash 179,478.88 → 179,475.88, change −3.00, and no invented cash credit", (type) => {
    const p = preview(rec({ type, relatedHoldingId: "ubs_cash", relatedAccountId: "ubs", actionAmount: 3, actionAmountUnit: "amount" }));
    expect(p.state).toBe("simulated");
    expect(p.standalone!.position).toMatchObject({ before: 179_478.88, after: 179_475.88, change: -3 });
    expect(p.standalone!.position!.pctChange).toBeCloseTo((-3 / 179_478.88) * 100, 10);
    expect(p.standalone!.cash).toEqual([]); // the position is the cash; nothing else moves
    const s = summarizePreview(p);
    expect(s.position).toBe("UBS BANK USA DEPOSIT ACCOUNT: $179,478.88 → $179,475.88 (−$3.00, −0.0017%)");
    expect(s.cash).toBe("No other cash moves: this is a cash position.");
    expect(JSON.stringify(s)).not.toMatch(/credit|\+\$3\.00/);
  });
});

describe("actual cash and funding from the engine", () => {
  it("a security sale credits the account's own cash line", () => {
    const p = preview(rec({ actionAmount: 40_000, actionAmountUnit: "amount" }));
    expect(p.standalone!.position).toMatchObject({ before: 100_000, after: 60_000, change: -40_000, pctChange: -40 });
    expect(p.standalone!.cash).toEqual([expect.objectContaining({ holdingId: "brk_cash", accountName: "Brokerage", before: 10_000, after: 50_000, change: 40_000, synthetic: false })]);
  });

  it("a purchase larger than the account's cash shows the shortfall", () => {
    const p = preview(rec({ type: "buy", actionAmount: 30_000, actionAmountUnit: "amount" }));
    expect(p.standalone!.position).toMatchObject({ after: 130_000, change: 30_000 });
    expect(p.standalone!.cash).toEqual([expect.objectContaining({ holdingId: "brk_cash", before: 10_000, after: -20_000 })]);
    expect(p.standalone!.shortfalls).toEqual([expect.objectContaining({ accountId: "brk", shortfall: 20_000 })]);
    expect(p.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "shortfall", blocksFinal: true })]));
  });

  it("a debt paydown draws household cash, largest balance first, and shows what's left unfunded", () => {
    const p = preview(rec({ type: "pay_down_debt", relatedHoldingId: "mortgage", relatedAccountId: "loan", actionAmount: 70_000, actionAmountUnit: "amount" }));
    expect(p.standalone!.position).toMatchObject({ before: -200_000, after: -130_000, change: 70_000 });
    // UBS 179,478.88 is the largest source and covers it all.
    expect(p.standalone!.cash).toEqual([expect.objectContaining({ holdingId: "ubs_cash", before: 179_478.88, after: 109_478.88, change: -70_000 })]);
    // Paid down to zero, never past it: 200,000 of a 250,000 request, from UBS (all of it) then the bank.
    const capped = preview(rec({ type: "pay_down_debt", relatedHoldingId: "mortgage", relatedAccountId: "loan", actionAmount: 250_000, actionAmountUnit: "amount" }));
    expect(capped.standalone!.position).toMatchObject({ after: 0, change: 200_000 });
    expect(capped.standalone!.cash.map((c) => [c.holdingId, Math.round(c.after * 100) / 100])).toEqual([["ubs_cash", 0], ["bank_cash", 29_478.88]]);
    expect(capped.standalone!.shortfalls).toEqual([]);
    // A debt larger than all household cash (179,478.88 + 50,000 + 10,000 = 239,478.88): the rest lands on the loan account as a shortfall.
    const bigDebt = HOLDINGS.map((h) => (h.id === "mortgage" ? { ...h, nativeMarketValue: -300_000 } : h));
    const big = preview(rec({ type: "pay_down_debt", relatedHoldingId: "mortgage", relatedAccountId: "loan", actionAmount: 300_000, actionAmountUnit: "amount" }), { holdings: bigDebt });
    expect(big.standalone!.position).toMatchObject({ before: -300_000, after: 0, change: 300_000 });
    const byId = Object.fromEntries(big.standalone!.cash.map((c) => [c.holdingId, c]));
    expect(byId.ubs_cash.after).toBeCloseTo(0, 6);
    expect(byId.bank_cash.after).toBeCloseTo(0, 6);
    expect(byId.brk_cash.after).toBeCloseTo(0, 6);
    expect(byId.synth_cash_loan).toMatchObject({ synthetic: true, accountName: "Mortgage", before: 0 });
    expect(byId.synth_cash_loan.after).toBeCloseTo(239_478.88 - 300_000, 6);
    expect(big.standalone!.shortfalls).toEqual([expect.objectContaining({ accountId: "loan" })]);
    expect(big.standalone!.shortfalls[0].shortfall).toBeCloseTo(60_521.12, 6);
  });

  it("a sale under one dollar still moves its cash (no sub-dollar cash is dropped)", () => {
    const p = preview(rec({ actionAmount: 0.5, actionAmountUnit: "amount" }));
    expect(p.standalone!.cash).toEqual([expect.objectContaining({ holdingId: "brk_cash", change: 0.5 })]);
  });
});

describe("amount, percentage and target", () => {
  it("a percentage is a share of the position; a target takes precedence and the action amount is marked ignored", () => {
    expect(preview(rec({ actionAmount: 25, actionAmountUnit: "percent" })).standalone!.position).toMatchObject({ after: 75_000 });
    const target = preview(rec({ actionAmount: 40_000, actionAmountUnit: "amount", proposedValue: 80_000 }));
    expect(target.targetOverridesAction).toBe(true);
    expect(target.standalone!.position).toMatchObject({ after: 80_000, change: -20_000 });
    expect(preview(rec({ proposedValue: 80_000 })).targetOverridesAction).toBe(false);
  });

  it("converts a cross-currency amount exactly once", () => {
    // EUR reporting at 0.8: USD 40,000 = EUR 32,000. Position EUR 80,000 → 48,000.
    const p = preview(rec({ actionAmount: 40_000, actionAmountUnit: "amount" }), { reporting: "EUR" });
    expect(p.standalone!.position).toMatchObject({ before: 80_000, after: 48_000, change: -32_000 });
    expect(p.standalone!.cash[0]).toMatchObject({ before: 8_000, after: 40_000 });
    expect(p.amounts).toContain("USD 40,000.00 ≈ EUR 32,000.00 at 0.8000 EUR per USD (ECB, as of 2026-10-20");
  });

  it("missing rates: for the recommendation, the holding, or the account's cash", () => {
    const recRate = preview(rec({ currency: "GBP", actionAmount: 1_000, actionAmountUnit: "amount" }));
    expect(recRate.state).toBe("cannot_apply");
    expect(recRate.standalone).toMatchObject({ applied: false, cash: [] });
    expect(recRate.warnings).toEqual([expect.objectContaining({ kind: "missing_rate", message: expect.stringMatching(/GBP\/USD/) })]);

    const chfHolding = [...HOLDINGS.filter((h) => h.id !== "sec"), holding("sec", "brk", "equity", 100_000, { currency: "CHF" })];
    const unvalued = preview(rec({ actionAmount: 1_000, actionAmountUnit: "amount" }), { holdings: chfHolding });
    expect(unvalued.state).toBe("cannot_apply");
    expect(unvalued.warnings).toEqual([expect.objectContaining({ kind: "unvalued", message: expect.stringMatching(/CHF\/USD/) })]);

    const jpyCash = [...HOLDINGS.filter((h) => h.id !== "brk_cash"), holding("brk_cash", "brk", "cash", 1_000_000, { currency: "JPY" })];
    const cashRate = preview(rec({ actionAmount: 1_000, actionAmountUnit: "amount" }), { holdings: jpyCash });
    expect(cashRate.state).toBe("cannot_apply");
    expect(cashRate.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "missing_rate", message: expect.stringMatching(/JPY/) })]));
  });
});

describe("standalone versus combined", () => {
  const saved = rec({ actionAmount: 40_000, actionAmountUnit: "amount", approvedByAdvisor: true, status: "approved" });

  it("editing an approved recommendation replaces it in the combined result, never applies it twice", () => {
    const edited = { ...saved, actionAmount: 20_000 };
    const p = preview(edited, { recommendations: [saved] });
    expect(p.standalone!.position).toMatchObject({ after: 80_000 });
    // No other approved recommendation touches it: no combined result to show.
    expect(p.combined).toBeNull();
  });

  it("with other approved recommendations on the same position, the combined result is separate and labelled", () => {
    const other = rec({ id: "r2", title: "Earlier trim", actionAmount: 10_000, actionAmountUnit: "amount", approvedByAdvisor: true, status: "approved" });
    const p = preview(saved, { recommendations: [saved, other] });
    expect(p.standalone!.position).toMatchObject({ before: 100_000, after: 60_000 });
    expect(p.combined).toMatchObject({ others: [{ id: "r2", title: "Earlier trim" }], position: { before: 100_000, after: 50_000, change: -50_000 }, thisChange: -40_000 });
    expect(p.combined!.cash).toEqual([expect.objectContaining({ holdingId: "brk_cash", before: 10_000, after: 60_000 })]);
    expect(summarizePreview(p).combined).toMatch(/^With 1 other approved recommendation: Example Equity: \$100,000\.00 → \$50,000\.00/);
  });

  it("another approved recommendation in the same account (different position) also shows combined cash", () => {
    const other = rec({ id: "r3", title: "Buy more", type: "buy", relatedHoldingId: "brk_cash", actionAmount: 1, actionAmountUnit: "amount", approvedByAdvisor: true, status: "approved" });
    const buy = rec({ id: "r4", type: "buy", actionAmount: 15_000, actionAmountUnit: "amount" });
    const p = preview(buy, { recommendations: [other] });
    expect(p.combined?.others.map((o) => o.id)).toEqual(["r3"]);
  });
});

describe("states, warnings and isolation", () => {
  it("advisory-only, missing holding, allocation-neutral and zero current value", () => {
    expect(preview(rec({ relatedHoldingId: undefined })).state).toBe("advisory");
    expect(preview(rec({ relatedHoldingId: "gone" })).state).toBe("missing_holding");
    const neutral = preview(rec({ type: "replace_high_fee_fund", actionAmount: 5_000, actionAmountUnit: "amount" }));
    expect(neutral).toMatchObject({ state: "no_change", allocationNeutral: true });
    const zero = preview(rec({ type: "buy", relatedHoldingId: "z", actionAmount: 100, actionAmountUnit: "amount" }), { holdings: [...HOLDINGS, holding("z", "brk", "equity", 0)] });
    expect(zero.standalone!.position).toMatchObject({ before: 0, after: 100, pctChange: null });
    expect(summarizePreview(zero).position).toContain("(+$100.00, N/A)");
  });

  it("keeps migration-review and incomplete-import warnings, with what blocks final output", () => {
    const flagged = migrateRecommendationCurrency(rec({ currency: "EUR", actionAmount: 1_000, actionAmountUnit: "amount", approvedByAdvisor: true, includeInPdf: true }), "USD", NOW);
    const doc = { id: "sd1", fileName: "partial.pdf", sourceType: "pdf_text", uploadedAt: NOW, extractionStatus: "extracted", importCompleteness: { status: "incomplete", reason: "total_mismatch", stated: 2, extracted: 1, currency: "USD", unreadableRows: 0 } } as SourceDocument;
    const imported = HOLDINGS.map((h) => (h.id === "sec" ? { ...h, sourceTrace: { sourceType: "pdf_text" as const, sourceDocumentId: "sd1" } } : h));
    const p = preview(flagged, { holdings: imported, sourceDocuments: [doc] });
    expect(p.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "currency_review", blocksFinal: true }),
        expect.objectContaining({ kind: "incomplete_import", blocksFinal: true, message: expect.stringContaining("partial.pdf") }),
      ])
    );
    // Still simulated: the warnings don't stop the preview.
    expect(p.state).toBe("simulated");
  });

  it("never mutates its inputs", () => {
    const deepFreeze = <T,>(o: T): T => {
      if (o && typeof o === "object") {
        Object.values(o).forEach(deepFreeze);
        Object.freeze(o);
      }
      return o;
    };
    const holdings = deepFreeze(normalizeHoldings(HOLDINGS, RATES, "USD"));
    const recs = deepFreeze([rec({ id: "r2", actionAmount: 1, actionAmountUnit: "amount", approvedByAdvisor: true })]);
    const before = JSON.stringify({ holdings, recs });
    previewRecommendation({ rec: deepFreeze(rec({ actionAmount: 40_000, actionAmountUnit: "amount" })), holdings, recommendations: recs, accounts: deepFreeze(ACCOUNTS), fx: fx(), sourceDocuments: [] });
    expect(JSON.stringify({ holdings, recs })).toBe(before);
  });

  it("matches what the proposal engine applies for the saved recommendation", () => {
    const r = rec({ actionAmount: 40_000, actionAmountUnit: "amount", approvedByAdvisor: true });
    const engine = applyRecommendationsToProposed(normalizeHoldings(HOLDINGS, RATES, "USD"), [r], ACCOUNTS, fx());
    const p = preview(r, { recommendations: [r] });
    expect(p.standalone!.position!.after).toBe(engine.holdings.find((h) => h.id === "sec")!.reportingMarketValue);
    expect(p.standalone!.cash[0].after).toBe(engine.holdings.find((h) => h.id === "brk_cash")!.reportingMarketValue);
  });
});

describe("the Copilot simulates with the same engine", () => {
  it("reports actual cash movements, not a negated position change", () => {
    const ctx = new CopilotContext({ client: SEED_CLIENT, advisor: SEED_ADVISOR, accounts: ACCOUNTS, holdings: HOLDINGS, fxRates: RATES, recommendations: [], disclosures: DISCLOSURE_LIBRARY } as never);
    const cash = JSON.parse(executeTool(ctx, "simulate_recommendation", { holding_id: "ubs_cash", type: "reduce", action_amount: 3 }).content);
    expect(cash).toMatchObject({ before: 179_478.88, after: 179_475.88, delta: -3, cash_movements: [] });
    const paydown = JSON.parse(executeTool(ctx, "simulate_recommendation", { holding_id: "mortgage", type: "pay_down_debt", action_amount: 70_000 }).content);
    expect(paydown.cash_movements).toEqual([expect.objectContaining({ holding: "UBS BANK USA DEPOSIT ACCOUNT", account: "UBS", change: -70_000 })]);
  });
});
