import { describe, expect, it } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Account, FxRate, Holding, Insight, Recommendation } from "@/domain/types";
import { applyRecommendationsToProposed, DEFAULT_PROPOSAL_SECTIONS, type FxContext } from "@/engines/proposalEngine";
import { normalizeHoldings } from "@/engines/normalizationEngine";
import {
  amountsInReporting,
  changeRecommendationCurrency,
  describeAmounts,
  isMaterialEdit,
  migrateRecommendationCurrency,
  newRecommendation,
  openCurrencyReviews,
  recommendationsInOtherCurrencies,
  resolveCurrencyReview,
  withApprovalRule,
} from "@/engines/recommendationAmounts";
import { recommendationFromInsight } from "@/engines/recommendationEngine";
import { describeFormEffect, describeRecEffect } from "@/components/recommendations/recEffect";
import { evaluateWorkspaceReadiness } from "@/engines/complianceEngine";
import { CopilotContext, executeTool } from "@/copilot/tools";
import { ProposalPdfTemplate } from "@/pdf/templates/ProposalPdfTemplate";
import { SEED_HOLDINGS } from "@/data/seedHoldings";
import { SEED_FX_RATES } from "@/data/seedFxRates";
import { SEED_ACCOUNTS } from "@/data/seedAccounts";
import { SEED_ADVISOR, SEED_CLIENT } from "@/data/seedClient";
import { SEED_RECOMMENDATIONS } from "@/data/seedRecommendations";
import { DISCLOSURE_LIBRARY } from "@/domain/disclosureLibrary";

// Issue #24: a recommendation's money amounts are denominated in its own
// currency and converted into the reporting currency exactly once, with the
// rate, source and as-of date shown. Nothing is ever relabelled.

const RATES: FxRate[] = [
  { base: "USD", quote: "EUR", rate: 0.8, asOf: "2026-10-20T00:00:00Z", source: "ECB" },
  { base: "CHF", quote: "USD", rate: 1.25, asOf: "2026-10-19T00:00:00Z", source: "Manual" },
];
const fx = (reportingCurrency: string, rates = RATES): FxContext => ({ reportingCurrency, rates });

const NOW = "2026-10-21T00:00:00.000Z";
const ACCOUNT: Account = { id: "a1", name: "Brokerage", type: "brokerage", baseCurrency: "USD", createdAt: NOW, updatedAt: NOW } as Account;
const holding = (id: string, assetClass: Holding["assetClass"], value: number): Holding =>
  ({
    id,
    accountId: "a1",
    assetName: id === "h_eq" ? "Example Equity" : "Cash",
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
  }) as unknown as Holding;
const HOLDINGS = [holding("h_eq", "equity", 1_000_000), holding("h_cash", "cash", 100_000)];

const rec = (patch: Partial<Recommendation> = {}): Recommendation => ({
  id: "r1",
  title: "Trim Example Equity",
  type: "sell",
  relatedHoldingId: "h_eq",
  relatedAccountId: "a1",
  actionAmount: 100_000,
  actionAmountUnit: "amount",
  currency: "USD",
  rationale: "Test.",
  priority: "medium",
  status: "approved",
  includeInPdf: true,
  approvedByAdvisor: true,
  createdAt: NOW,
  updatedAt: NOW,
  ...patch,
});

const proposedNative = (recs: Recommendation[], reporting = "EUR", rates = RATES) => {
  const normalized = normalizeHoldings(HOLDINGS, rates, reporting);
  const p = applyRecommendationsToProposed(normalized, recs, [ACCOUNT], fx(reporting, rates));
  const by = (id: string) => p.holdings.find((h) => h.id === id)!;
  return { equity: Math.round(by("h_eq").nativeMarketValue * 100) / 100, cash: Math.round(by("h_cash").nativeMarketValue * 100) / 100, unresolved: p.unresolved };
};

describe("the #24 reproduction", () => {
  it("switching the output currency doesn't change an approved recommendation's effect", () => {
    const maritime = SEED_RECOMMENDATIONS.find((r) => r.proposedValue != null)!;
    expect(maritime.currency).toBe("USD");
    for (const reporting of ["USD", "EUR"]) {
      const normalized = normalizeHoldings(SEED_HOLDINGS, SEED_FX_RATES, reporting);
      const p = applyRecommendationsToProposed(normalized, [{ ...maritime, approvedByAdvisor: true }], SEED_ACCOUNTS, { reportingCurrency: reporting, rates: SEED_FX_RATES });
      // USD 181,760 stays USD 181,760 (it was applied as EUR 181,760 = USD 197,210).
      expect(p.holdings.find((h) => h.id === maritime.relatedHoldingId)!.nativeMarketValue).toBeCloseTo(181_760, 2);
    }
  });
});

describe("conversion: entered currency into the reporting currency, exactly once", () => {
  it("the engine converts a USD amount with EUR reporting once (not zero times, not twice)", () => {
    // USD 1,000,000 equity = EUR 800,000. Selling USD 100,000 = EUR 80,000.
    // Unconverted it would be EUR 100,000 (native 875,000); converted twice EUR 64,000 (native 920,000).
    expect(proposedNative([rec()])).toMatchObject({ equity: 900_000, cash: 200_000, unresolved: [] });
  });

  it("reports the rate, source, as-of date and how it was found, and says rates aren't frozen", () => {
    const direct = amountsInReporting(rec(), fx("EUR"));
    expect(direct).toMatchObject({ ok: true, conversion: { from: "USD", to: "EUR", rate: 0.8, source: "ECB", asOf: "2026-10-20T00:00:00Z", path: "direct" } });
    if (!direct.ok) throw new Error("expected a conversion");
    expect(direct.amounts.actionAmount).toBe(80_000);
    expect(describeAmounts(rec(), fx("EUR"))).toBe(
      "USD 100,000.00 ≈ EUR 80,000.00 at 0.8000 EUR per USD (ECB, as of 2026-10-20; current workspace rate, recalculated when rates change)"
    );
    const inverse = amountsInReporting(rec({ currency: "EUR" }), fx("USD"));
    expect(inverse).toMatchObject({ ok: true, conversion: { rate: 1.25, path: "inverse", source: "ECB" } });
    const cross = amountsInReporting(rec({ currency: "CHF" }), fx("EUR"));
    expect(cross).toMatchObject({ ok: true, conversion: { rate: 1, path: "cross", asOf: "2026-10-19T00:00:00Z" } });
    expect(describeAmounts(rec({ currency: "CHF" }), fx("EUR"))).toMatch(/cross rate via USD/);
  });

  it("no conversion line when the recommendation is already in the reporting currency", () => {
    const same = amountsInReporting(rec(), fx("USD"));
    expect(same.ok && same.conversion).toBeUndefined();
    expect(same.ok && same.amounts.actionAmount).toBe(100_000);
    expect(describeAmounts(rec(), fx("USD"))).toBeNull();
  });

  it("a missing rate leaves the recommendation unapplied and unresolved; never 1:1", () => {
    const out = proposedNative([rec({ currency: "GBP" })]);
    expect(out).toMatchObject({ equity: 1_000_000, cash: 100_000 });
    expect(out.unresolved).toEqual([expect.objectContaining({ recommendationId: "r1", currency: "GBP", reportingCurrency: "EUR" })]);
    expect(amountsInReporting(rec({ currency: "GBP" }), fx("EUR"))).toMatchObject({ ok: false, currency: "GBP" });
  });

  it("a percent amount stays a percentage and needs no rate; proposedValue stays monetary", () => {
    // 10% of EUR 800,000, in a currency with no rate: still applies.
    expect(proposedNative([rec({ currency: "GBP", actionAmount: 10, actionAmountUnit: "percent" })])).toMatchObject({ equity: 900_000, unresolved: [] });
    // proposedValue USD 500,000 with a percent action amount: the target is converted (EUR 400,000).
    expect(proposedNative([rec({ actionAmount: 10, actionAmountUnit: "percent", proposedValue: 500_000 })])).toMatchObject({ equity: 500_000 });
    // ...and a proposedValue in a currency with no rate is unresolved, even with a percent action amount.
    expect(proposedNative([rec({ currency: "GBP", actionAmount: 10, actionAmountUnit: "percent", proposedValue: 500_000 })]).unresolved).toHaveLength(1);
  });

  it("the recommendation card and the edit form show the converted effect once, in the reporting currency", () => {
    const linked = normalizeHoldings(HOLDINGS, RATES, "EUR")[0];
    const card = describeRecEffect(rec(), linked, fx("EUR"));
    expect(card.label).toContain("€800.0K → €720.0K (−€80.0K)");
    expect(card.amounts).toBe(describeAmounts(rec(), fx("EUR")));
    const form = describeFormEffect(rec(), linked, fx("EUR"));
    expect(form.currentValue).toBe("€800,000.00");
    expect(form.hint).toContain("€800.0K → €720.0K");
    // A missing rate is said, not guessed.
    expect(describeRecEffect(rec({ currency: "GBP" }), linked, fx("EUR")).label).toMatch(/no GBP\/EUR rate/);
  });

  it("the Copilot simulates in the reporting currency and sees each recommendation's own currency and converted amount", () => {
    const snapshot = {
      client: { ...SEED_CLIENT, proposalOutputCurrency: "EUR" },
      advisor: SEED_ADVISOR,
      accounts: [ACCOUNT],
      holdings: HOLDINGS,
      fxRates: RATES,
      recommendations: [rec()],
      disclosures: DISCLOSURE_LIBRARY,
    };
    const ctx = new CopilotContext(snapshot as never);
    const sim = JSON.parse(executeTool(ctx, "simulate_recommendation", { holding_id: "h_eq", type: "sell", action_amount: 80_000 }).content);
    expect(sim).toMatchObject({ before: 800_000, after: 720_000, currency: "EUR" });
    const o = JSON.parse(executeTool(ctx, "get_portfolio_overview", {}).content);
    expect(o.existing_recommendations[0]).toMatchObject({ currency: "USD", action_amount: 100_000, action_amount_in_reporting: 80_000, rate_used: { rate: 0.8, source: "ECB" } });
  });

  it("the PDF applies the converted amount once and shows the rate used", () => {
    const html = renderToStaticMarkup(
      React.createElement(ProposalPdfTemplate, {
        client: { ...SEED_CLIENT, proposalOutputCurrency: "EUR" },
        advisor: SEED_ADVISOR,
        accounts: [ACCOUNT],
        holdings: HOLDINGS,
        recommendations: [rec()],
        sections: DEFAULT_PROPOSAL_SECTIONS,
        disclosures: DISCLOSURE_LIBRARY,
        fxRates: RATES,
        proposal: { id: "p" } as never,
        variant: "draft",
      })
    );
    const text = html.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
    expect(text).toContain("USD 100,000.00 ≈ EUR 80,000.00 at 0.8000 EUR per USD (ECB, as of 2026-10-20; current workspace rate, recalculated when rates change)");
    // Proposed equity EUR 720,000 (not 700,000 unconverted, or 736,000 converted twice).
    expect(text).toMatch(/After Proposed portfolio €880\.0K .* Equity 81\.8% €720\.0K Cash & Equivalents 18\.2% €160\.0K/);
  });
});

describe("defaults and explicit currency changes", () => {
  it("new, insight-generated and Copilot recommendations take the reporting currency", () => {
    expect(newRecommendation("CHF").currency).toBe("CHF");
    const insight = { id: "i", title: "Concentration", detail: "d", category: "concentration", severity: "warning", relatedHoldingIds: ["h_eq"] } as unknown as Insight;
    expect(recommendationFromInsight(insight, "EUR").currency).toBe("EUR");
    const ctx = new CopilotContext({ client: { ...SEED_CLIENT, proposalOutputCurrency: "EUR" }, advisor: SEED_ADVISOR, accounts: [ACCOUNT], holdings: HOLDINGS, fxRates: RATES, recommendations: [], disclosures: DISCLOSURE_LIBRARY } as never);
    const draft = JSON.parse(executeTool(ctx, "draft_recommendation", { type: "request_updated_statement", title: "Get statement", priority: "low", rationale: "Testing defaults." }).content);
    expect(ctx.drafts[0].currency).toBe("EUR");
    expect(draft).toBeTruthy();
  });

  it("changing a recommendation's currency needs an explicit choice; the label never changes alone", () => {
    const r = rec({ proposedValue: 500_000, actionAmount: undefined });
    // Convert: preserves economic value, at the shown rate.
    const converted = changeRecommendationCurrency(r, "EUR", "convert", fx("USD"));
    expect(converted).toMatchObject({ ok: true, rec: { currency: "EUR", proposedValue: 400_000 }, conversion: { rate: 0.8, source: "ECB" } });
    // Replace: amounts cleared, to be re-entered.
    const replaced = changeRecommendationCurrency(r, "EUR", "replace", fx("USD"));
    expect(replaced).toMatchObject({ ok: true, rec: { currency: "EUR", proposedValue: undefined, actionAmount: undefined } });
    // Convert without a rate is refused.
    expect(changeRecommendationCurrency(r, "GBP", "convert", fx("USD"))).toMatchObject({ ok: false });
    // A percent-only recommendation has no money: the currency just changes.
    expect(changeRecommendationCurrency(rec({ actionAmount: 10, actionAmountUnit: "percent" }), "GBP", "relabel", fx("USD"))).toMatchObject({ ok: true, rec: { currency: "GBP", actionAmount: 10 } });
    // ...but a relabel of money amounts is refused.
    expect(changeRecommendationCurrency(r, "EUR", "relabel", fx("USD"))).toMatchObject({ ok: false });
  });

  it("material edits clear the approval; approving or unapproving alone doesn't count", () => {
    const approved = rec();
    for (const patch of [{ actionAmount: 50_000 }, { actionAmountUnit: "percent" as const }, { proposedValue: 1 }, { currency: "EUR" }, { relatedHoldingId: "h_cash" }, { type: "reduce" as const }]) {
      expect(isMaterialEdit(approved, { ...approved, ...patch })).toBe(true);
      expect(withApprovalRule(approved, { ...approved, ...patch })).toMatchObject({ approvedByAdvisor: false, status: "needs_review" });
    }
    expect(isMaterialEdit(approved, { ...approved, title: "Renamed", rationale: "New words" })).toBe(false);
    expect(withApprovalRule(approved, { ...approved, approvedByAdvisor: false })).toMatchObject({ approvedByAdvisor: false });
    const draft = rec({ approvedByAdvisor: false, status: "draft" });
    expect(withApprovalRule(draft, { ...draft, actionAmount: 1, approvedByAdvisor: true, status: "approved" })).toMatchObject({ approvedByAdvisor: true });
  });

  it("the store applies the approval rule on every save", async () => {
    const { useAtlasStore } = await import("@/store/useStore");
    const s = useAtlasStore.getState();
    s.upsertRecommendation(rec({ id: "r_store" }));
    s.upsertRecommendation({ ...useAtlasStore.getState().recommendations.find((r) => r.id === "r_store")!, actionAmount: 1 });
    expect(useAtlasStore.getState().recommendations.find((r) => r.id === "r_store")).toMatchObject({ approvedByAdvisor: false, status: "needs_review" });
  });

  it("the Client Profile change lists recommendations whose amounts stay in another currency", () => {
    const recs = [rec(), rec({ id: "r2", actionAmount: 10, actionAmountUnit: "percent" }), rec({ id: "r3", currency: "EUR" })];
    expect(recommendationsInOtherCurrencies(recs, "EUR").map((r) => r.id)).toEqual(["r1"]);
  });
});

describe("saved-workspace migration (v5)", () => {
  const v4 = (clientCurrency: string, recs: Partial<Recommendation>[]) => ({
    client: { ...SEED_CLIENT, proposalOutputCurrency: clientCurrency, reportingCountry: "DE" },
    proposal: { id: "p", outputCurrency: "USD", outputCountry: "US", sections: DEFAULT_PROPOSAL_SECTIONS, disclosureIds: [] },
    advisor: SEED_ADVISOR,
    recommendations: recs.map((p, i) => rec({ id: `m${i}`, ...p })),
  });

  it("preserves the currency each amount was being calculated in, and keeps a differing old label as evidence", async () => {
    const { migrateAtlasState } = await import("@/store/useStore");
    const old = v4("EUR", [{ currency: "USD" }, { currency: "USD", actionAmount: 10, actionAmountUnit: "percent" }, { currency: "EUR" }, { currency: "USD", actionAmount: undefined, type: "hold" }]);
    // Before: the engine calculated every amount as EUR, whatever the label.
    const next = migrateAtlasState(structuredClone(old), 4);
    const [money, percent, same, advisory] = next.recommendations;
    expect(money).toMatchObject({ currency: "EUR", actionAmount: 100_000, currencyReview: { legacyLabel: "USD", calculatedIn: "EUR", status: "open" } });
    expect(percent.currency).toBe("EUR");
    expect(percent.currencyReview).toBeUndefined();
    expect(same.currencyReview).toBeUndefined();
    expect(advisory.currencyReview).toBeUndefined();
    // The effect is unchanged: EUR 100,000 off EUR 800,000 → native USD 875,000, exactly what the old engine did.
    expect(proposedNative([money])).toMatchObject({ equity: 875_000 });
    // Output currency and country now come from the client.
    expect("outputCurrency" in next.proposal).toBe(false);
    expect("outputCountry" in next.proposal).toBe(false);
  });

  it("is idempotent and leaves the sample workspace without flags", async () => {
    const { migrateAtlasState } = await import("@/store/useStore");
    const once = migrateAtlasState(structuredClone(v4("EUR", [{ currency: "USD" }])), 4);
    const twice = migrateAtlasState(structuredClone(once), 4);
    expect(twice.recommendations).toEqual(once.recommendations);
    const sample = migrateAtlasState(structuredClone({ client: SEED_CLIENT, proposal: { id: "p", outputCurrency: "USD", outputCountry: "US" }, advisor: SEED_ADVISOR, recommendations: SEED_RECOMMENDATIONS }), 4);
    expect(sample.recommendations.some((r) => r.currencyReview)).toBe(false);
    expect(migrateRecommendationCurrency(rec({ currency: "USD" }), "USD", NOW).currencyReview).toBeUndefined();
  });

  it("resolving a flag preserves the economic amount, or changes it explicitly", () => {
    const flagged = migrateRecommendationCurrency(rec({ currency: "USD" }), "EUR", NOW);
    // Keep: same amount, same effect, approval stands.
    const kept = resolveCurrencyReview(flagged, "keep", fx("EUR"), NOW);
    expect(kept).toMatchObject({ ok: true, rec: { currency: "EUR", actionAmount: 100_000, approvedByAdvisor: true, currencyReview: { status: "kept", legacyLabel: "USD" } } });
    if (!kept.ok) throw new Error("expected keep to succeed");
    expect(proposedNative([kept.rec])).toMatchObject({ equity: 875_000 });
    // Treat as the legacy label: an explicit economic change, shown first; approval cleared.
    const legacy = resolveCurrencyReview(flagged, "legacy", fx("EUR"), NOW);
    expect(legacy).toMatchObject({ ok: true, rec: { currency: "USD", actionAmount: 100_000, approvedByAdvisor: false, status: "needs_review", currencyReview: { status: "changed" } }, effect: { from: "EUR 100,000.00", to: "USD 100,000.00 ≈ EUR 80,000.00" } });
    if (!legacy.ok) throw new Error("expected legacy to succeed");
    expect(proposedNative([{ ...legacy.rec, approvedByAdvisor: true }])).toMatchObject({ equity: 900_000 });
    // Not possible without a rate for the legacy currency.
    expect(resolveCurrencyReview(migrateRecommendationCurrency(rec({ currency: "GBP" }), "EUR", NOW), "legacy", fx("EUR"), NOW)).toMatchObject({ ok: false });
  });
});

describe("open currency flags block final output", () => {
  const ws = (recommendations: Recommendation[], holdings = SEED_HOLDINGS) => ({
    client: SEED_CLIENT,
    advisor: SEED_ADVISOR,
    accounts: SEED_ACCOUNTS,
    holdings,
    recommendations,
    disclosures: DISCLOSURE_LIBRARY,
    fxRates: SEED_FX_RATES,
    sourceDocuments: [],
  });
  const flagged = (patch: Partial<Recommendation> = {}) =>
    ({ ...migrateRecommendationCurrency({ ...SEED_RECOMMENDATIONS[1], currency: "EUR", actionAmount: 1000, actionAmountUnit: "amount" }, "USD", NOW), approvedByAdvisor: true, includeInPdf: true, ...patch });

  it("an approved, included recommendation with an open flag fails readiness; confirming holdings doesn't clear it", () => {
    const confirmed = SEED_HOLDINGS.map((h) => ({ ...h, advisorVerification: "advisor_approved" as const }));
    const check = evaluateWorkspaceReadiness(ws([flagged()], confirmed)).find((c) => c.code === "recommendation_currency")!;
    expect(check.passed).toBe(false);
    expect(check.detail).toContain(SEED_RECOMMENDATIONS[1].title);
    expect(openCurrencyReviews([flagged()])).toHaveLength(1);
  });

  it("unapproved, excluded-from-PDF or resolved recommendations don't block", () => {
    const kept = resolveCurrencyReview(flagged(), "keep", fx("USD", SEED_FX_RATES), NOW);
    if (!kept.ok) throw new Error("expected keep to succeed");
    for (const r of [flagged({ approvedByAdvisor: false }), flagged({ includeInPdf: false }), kept.rec]) {
      expect(evaluateWorkspaceReadiness(ws([r])).find((c) => c.code === "recommendation_currency")!.passed).toBe(true);
    }
  });

  it("the final-PDF route refuses it", async () => {
    const { POST } = await import("@/app/api/proposals/[id]/generate-pdf/route");
    const holdings = SEED_HOLDINGS.map((h) => ({ ...h, advisorVerification: "advisor_approved" as const }));
    const state = { ...ws([flagged()], holdings), sections: [], proposal: { id: "p1" } };
    const res = await POST(new Request("http://localhost/api/proposals/p1/generate-pdf?variant=final", { method: "POST", body: JSON.stringify({ state }) }), {
      params: Promise.resolve({ id: "p1" }),
    });
    expect(res.status).toBe(422);
    expect((await res.json()).failing).toContain("Recommendation currencies confirmed");
  });
});

describe("output currency and country come from the client", () => {
  it("the PDF uses the client's settings even if a stale proposal field arrives", () => {
    const html = renderToStaticMarkup(
      React.createElement(ProposalPdfTemplate, {
        client: { ...SEED_CLIENT, proposalOutputCurrency: "EUR", reportingCountry: "DE" },
        advisor: SEED_ADVISOR,
        accounts: SEED_ACCOUNTS,
        holdings: SEED_HOLDINGS,
        recommendations: [],
        sections: DEFAULT_PROPOSAL_SECTIONS,
        disclosures: DISCLOSURE_LIBRARY,
        fxRates: SEED_FX_RATES,
        proposal: { id: "p", outputCurrency: "USD", outputCountry: "US" } as never,
        variant: "draft",
      })
    );
    expect(html).toMatch(/Reporting currency<\/dt><dd>EUR/);
  });

  it("new proposals carry no output currency or country of their own", async () => {
    const { buildProposal } = await import("@/engines/proposalEngine");
    const p = buildProposal({ clientId: "c", advisorId: "a", recommendationIds: [], assumptionIds: [], disclosureIds: [] });
    expect("outputCurrency" in p).toBe(false);
    expect("outputCountry" in p).toBe(false);
  });
});
