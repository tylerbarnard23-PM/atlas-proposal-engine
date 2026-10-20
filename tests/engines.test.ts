import { describe, expect, it } from "vitest";
import type { Holding, Recommendation } from "@/domain/types";
import { applyRecToValue, applyRecommendationsToProposed, netWorth } from "@/engines/proposalEngine";
import { convert } from "@/engines/currencyEngine";
import { normalizeHoldings } from "@/engines/normalizationEngine";
import { generateInsights } from "@/engines/insightEngine";
import { evaluateReadiness, readinessOk } from "@/engines/complianceEngine";
import { SEED_HOLDINGS } from "@/data/seedHoldings";
import { SEED_FX_RATES } from "@/data/seedFxRates";
import { SEED_ACCOUNTS } from "@/data/seedAccounts";
import { SEED_ADVISOR, SEED_CLIENT } from "@/data/seedClient";
import { DISCLOSURE_LIBRARY } from "@/domain/disclosureLibrary";

const rec = (patch: Partial<Recommendation>): Recommendation => ({
  id: "r1",
  title: "t",
  type: "custom",
  currency: "USD",
  rationale: "",
  priority: "medium",
  status: "approved",
  includeInPdf: true,
  approvedByAdvisor: true,
  createdAt: "",
  updatedAt: "",
  ...patch,
});

const holding = (patch: Partial<Holding>): Holding => ({
  id: "h1",
  accountId: "a1",
  assetName: "Test",
  assetClass: "equity",
  currency: "USD",
  nativeMarketValue: 100_000,
  reportingMarketValue: 100_000,
  valuationSource: { kind: "advisor_entered", asOf: "2026-01-01", confidence: "high" },
  dataQuality: [],
  advisorVerification: "advisor_reviewed",
  createdAt: "",
  updatedAt: "",
  ...patch,
});

describe("applyRecToValue", () => {
  it("sells a dollar amount as a partial sale", () => {
    expect(applyRecToValue(100_000, rec({ type: "sell", actionAmount: 40_000 }), false)).toBe(60_000);
  });
  it("sells a percentage of the position", () => {
    expect(applyRecToValue(100_000, rec({ type: "sell", actionAmount: 25, actionAmountUnit: "percent" }), false)).toBe(75_000);
  });
  it("fully exits on a sell with no amount", () => {
    expect(applyRecToValue(100_000, rec({ type: "sell" }), false)).toBe(0);
  });
  it("never sells below zero", () => {
    expect(applyRecToValue(10_000, rec({ type: "reduce", actionAmount: 50_000 }), false)).toBe(0);
  });
  it("lets an explicit proposed value win over the action amount", () => {
    expect(applyRecToValue(100_000, rec({ type: "sell", actionAmount: 10_000, proposedValue: 5_000 }), false)).toBe(5_000);
  });
  it("treats fee-replacement and tax-loss swaps as allocation-neutral", () => {
    expect(applyRecToValue(100_000, rec({ type: "replace_high_fee_fund", actionAmount: 50_000 }), false)).toBe(100_000);
    expect(applyRecToValue(100_000, rec({ type: "tax_loss_harvest" }), false)).toBe(100_000);
  });
  it("pays down a liability toward zero, not past it", () => {
    expect(applyRecToValue(-200_000, rec({ type: "pay_down_debt", actionAmount: 50_000 }), true)).toBe(-150_000);
    expect(applyRecToValue(-20_000, rec({ type: "pay_down_debt", actionAmount: 50_000 }), true)).toBe(0);
  });
});

describe("applyRecommendationsToProposed", () => {
  it("credits sale proceeds to cash in the same account, keeping the total flat", () => {
    const stock = holding({ id: "stock" });
    const cash = holding({ id: "cash", assetClass: "cash", nativeMarketValue: 5_000, reportingMarketValue: 5_000 });
    const after = applyRecommendationsToProposed([stock, cash], [rec({ type: "sell", relatedHoldingId: "stock", actionAmount: 30_000 })]);
    expect(after.find((h) => h.id === "stock")?.reportingMarketValue).toBe(70_000);
    expect(after.find((h) => h.id === "cash")?.reportingMarketValue).toBe(35_000);
    expect(netWorth(after).net).toBe(netWorth([stock, cash]).net);
  });
  it("creates a synthetic cash line when the account has no cash holding", () => {
    const after = applyRecommendationsToProposed([holding({})], [rec({ type: "sell", relatedHoldingId: "h1", actionAmount: 1_000 })]);
    expect(after.some((h) => h.id === "synth_cash_a1" && h.reportingMarketValue === 1_000)).toBe(true);
  });
  it("ignores advisory-only recommendations", () => {
    const before = [holding({})];
    expect(applyRecommendationsToProposed(before, [rec({ type: "sell" })])).toEqual(before);
  });
});

describe("netWorth", () => {
  it("nets liabilities against assets", () => {
    const nw = netWorth([holding({}), holding({ id: "loan", isLiability: true, reportingMarketValue: -40_000, nativeMarketValue: -40_000 })]);
    expect(nw).toEqual({ gross: 100_000, liabilities: 40_000, net: 60_000 });
  });
});

describe("currency + normalization", () => {
  it("is the identity for same-currency conversion", () => {
    expect(convert(1234, "USD", "USD", SEED_FX_RATES)).toBe(1234);
  });
  it("normalizes every seed holding to a finite reporting value", () => {
    const normalized = normalizeHoldings(SEED_HOLDINGS, SEED_FX_RATES, "USD");
    expect(normalized).toHaveLength(SEED_HOLDINGS.length);
    for (const h of normalized) expect(Number.isFinite(h.reportingMarketValue)).toBe(true);
  });
});

describe("insight engine", () => {
  it("flags single-issuer concentration above the threshold", () => {
    const big = holding({ id: "big", nativeMarketValue: 900_000, reportingMarketValue: 900_000 });
    const rest = Array.from({ length: 9 }, (_, i) => holding({ id: `s${i}`, nativeMarketValue: 10_000, reportingMarketValue: 10_000 }));
    const insights = generateInsights({ holdings: normalizeHoldings([big, ...rest], SEED_FX_RATES, "USD"), reportingCurrency: "USD" });
    const conc = insights.filter((i) => i.category === "concentration");
    expect(conc).toHaveLength(1);
    expect(conc[0].severity).toBe("critical");
    expect(conc[0].relatedHoldingIds).toEqual(["big"]);
  });
  it("returns nothing for an empty portfolio", () => {
    expect(generateInsights({ holdings: [], reportingCurrency: "USD" })).toEqual([]);
  });
});

describe("compliance readiness", () => {
  const base = {
    client: SEED_CLIENT,
    advisor: SEED_ADVISOR,
    accounts: SEED_ACCOUNTS,
    holdings: SEED_HOLDINGS,
    disclosures: DISCLOSURE_LIBRARY.filter((d) => d.required),
    unverifiedHoldingsCount: 0,
    staleValuationsCount: 0,
    marketDataIssuesCount: 0,
    insightsReviewedCount: 0,
    totalInsightsCount: 0,
  };
  it("blocks the PDF until an approved recommendation is included", () => {
    const checks = evaluateReadiness({ ...base, recommendations: [rec({ approvedByAdvisor: false })] });
    expect(readinessOk(checks)).toBe(false);
    expect(checks.find((c) => c.code === "approved_recs")?.passed).toBe(false);
  });
  it("passes when every input is clean", () => {
    expect(readinessOk(evaluateReadiness({ ...base, recommendations: [rec({})] }))).toBe(true);
  });
  it("reports unverified holdings with a count", () => {
    const checks = evaluateReadiness({ ...base, recommendations: [rec({})], unverifiedHoldingsCount: 3 });
    expect(checks.find((c) => c.code === "unverified_holdings")?.detail).toBe("3 holding(s) await advisor review");
  });
});
