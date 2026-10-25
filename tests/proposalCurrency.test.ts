import { describe, expect, it } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Account, FxRate, Holding, Proposal, Recommendation } from "@/domain/types";
import { applyRecommendationsToProposed, cashShortfallsOf, DEFAULT_PROPOSAL_SECTIONS, type FxContext } from "@/engines/proposalEngine";
import { evaluateWorkspaceReadiness } from "@/engines/complianceEngine";
import { normalizeHoldings } from "@/engines/normalizationEngine";
import { ProposalPdfTemplate } from "@/pdf/templates/ProposalPdfTemplate";
import { SEED_HOLDINGS } from "@/data/seedHoldings";
import { SEED_FX_RATES } from "@/data/seedFxRates";
import { SEED_ACCOUNTS } from "@/data/seedAccounts";
import { SEED_ADVISOR, SEED_CLIENT } from "@/data/seedClient";
import { DISCLOSURE_LIBRARY } from "@/domain/disclosureLibrary";

// Currency contract for proposed holdings (see proposalEngine.ts): native
// values stay in each holding's currency, reporting values in the proposal's
// reporting currency, recommendation amounts are in the reporting currency,
// and a missing FX rate is reported, never assumed to be 1:1.
// Fixture: USD reporting, CHF 1 = USD 1.25.

const CHF_USD: FxRate = { base: "CHF", quote: "USD", rate: 1.25, asOf: "2026-10-20", source: "Manual" };
const USD: FxContext = { reportingCurrency: "USD", rates: [CHF_USD] };

const rec = (patch: Partial<Recommendation>): Recommendation => ({
  id: "r1",
  title: "t",
  type: "sell",
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
  id: "sec",
  accountId: "acct_ch",
  assetName: "Swiss security",
  assetClass: "equity",
  currency: "CHF",
  nativeMarketValue: 1_000,
  reportingMarketValue: 1_250,
  valuationSource: { kind: "statement", asOf: "2026-10-01", confidence: "high" },
  dataQuality: [],
  advisorVerification: "advisor_reviewed",
  createdAt: "",
  updatedAt: "",
  ...patch,
});

const account = (patch: Partial<Account> = {}): Account => ({
  id: "acct_ch",
  name: "Zurich custody",
  type: "brokerage",
  baseCurrency: "CHF",
  createdAt: "",
  updatedAt: "",
  ...patch,
});

const security = holding({});
const cash = (native: number) =>
  holding({ id: "cash", assetName: "CHF cash", assetClass: "cash", nativeMarketValue: native, reportingMarketValue: native * 1.25 });
const byId = (hs: Holding[], id: string) => hs.find((h) => h.id === id)!;
const total = (hs: Holding[], key: "nativeMarketValue" | "reportingMarketValue") => hs.reduce((s, h) => s + (h[key] ?? 0), 0);

describe("proposed holdings keep native and reporting currencies apart", () => {
  it("sell USD 400 of a CHF 1,000 security with CHF 100 cash", () => {
    const { holdings, unresolved } = applyRecommendationsToProposed(
      [security, cash(100)],
      [rec({ relatedHoldingId: "sec", actionAmount: 400 })],
      [account()],
      USD
    );
    expect(unresolved).toEqual([]);
    expect(byId(holdings, "sec").nativeMarketValue).toBeCloseTo(680, 9); // CHF
    expect(byId(holdings, "sec").reportingMarketValue).toBeCloseTo(850, 9); // USD
    expect(byId(holdings, "cash").nativeMarketValue).toBeCloseTo(420, 9); // CHF
    expect(byId(holdings, "cash").reportingMarketValue).toBeCloseTo(525, 9); // USD
    expect(total(holdings, "nativeMarketValue")).toBeCloseTo(1_100, 9); // CHF
    expect(total(holdings, "reportingMarketValue")).toBeCloseTo(1_375, 9); // USD
  });

  it("a purchase debits the account's cash in its own currency", () => {
    const { holdings } = applyRecommendationsToProposed(
      [security, cash(400)],
      [rec({ type: "buy", relatedHoldingId: "sec", actionAmount: 250 })],
      [account()],
      USD
    );
    expect(byId(holdings, "sec").nativeMarketValue).toBeCloseTo(1_200, 9); // CHF 1,000 + USD 250 / 1.25
    expect(byId(holdings, "sec").reportingMarketValue).toBeCloseTo(1_500, 9);
    expect(byId(holdings, "cash").nativeMarketValue).toBeCloseTo(200, 9); // CHF 400 − CHF 200
    expect(byId(holdings, "cash").reportingMarketValue).toBeCloseTo(250, 9);
    expect(total(holdings, "reportingMarketValue")).toBeCloseTo(1_750, 9);
  });

  it("a purchase larger than the cash is still a shortfall, in the reporting currency", () => {
    const { holdings } = applyRecommendationsToProposed(
      [security, cash(100)],
      [rec({ type: "buy", relatedHoldingId: "sec", actionAmount: 250 })],
      [account()],
      USD
    );
    expect(byId(holdings, "cash").nativeMarketValue).toBeCloseTo(-100, 9); // CHF 100 − CHF 200
    expect(cashShortfallsOf(holdings, [account()], USD)).toEqual([{ accountId: "acct_ch", accountName: "Zurich custody", shortfall: 125 }]);
  });

  it("creates a cash line in the account's base currency when none exists", () => {
    const { holdings } = applyRecommendationsToProposed([security], [rec({ relatedHoldingId: "sec", actionAmount: 400 })], [account()], USD);
    const synth = byId(holdings, "synth_cash_acct_ch");
    expect(synth.currency).toBe("CHF");
    expect(synth.nativeMarketValue).toBeCloseTo(320, 9); // USD 400 / 1.25
    expect(synth.reportingMarketValue).toBeCloseTo(400, 9);
    expect(total(holdings, "reportingMarketValue")).toBeCloseTo(1_250, 9);
  });

  it("a new cash line for an unknown account is in the reporting currency, not USD by default", () => {
    const eur: FxContext = { reportingCurrency: "EUR", rates: [{ base: "CHF", quote: "EUR", rate: 1.1, asOf: "2026-10-20", source: "Manual" }] };
    const sec = holding({ reportingMarketValue: 1_100 });
    // EUR 110: the amount is entered in the reporting currency (#24).
    const { holdings } = applyRecommendationsToProposed([sec], [rec({ relatedHoldingId: "sec", actionAmount: 110, currency: "EUR" })], [], eur);
    // The holding's own CHF cash currency isn't known (no account, no cash line),
    // so the offset lands in a reporting-currency line.
    const synth = byId(holdings, "synth_cash_acct_ch");
    expect(synth.currency).toBe("EUR");
    expect(synth.nativeMarketValue).toBeCloseTo(110, 9);
    expect(byId(holdings, "sec").nativeMarketValue).toBeCloseTo(900, 9); // (1,100 − 110) / 1.1
  });

  it("a percentage sale is a share of the holding, independent of currency", () => {
    const { holdings } = applyRecommendationsToProposed(
      [security, cash(100)],
      [rec({ relatedHoldingId: "sec", actionAmount: 20, actionAmountUnit: "percent" })],
      [account()],
      USD
    );
    expect(byId(holdings, "sec").nativeMarketValue).toBeCloseTo(800, 9);
    expect(byId(holdings, "cash").nativeMarketValue).toBeCloseTo(300, 9);
  });

  it("uses an inverse rate when only USD→CHF is supplied", () => {
    const inverse: FxContext = { reportingCurrency: "USD", rates: [{ base: "USD", quote: "CHF", rate: 0.8, asOf: "2026-10-20", source: "Manual" }] };
    const { holdings, unresolved } = applyRecommendationsToProposed(
      [security, cash(100)],
      [rec({ relatedHoldingId: "sec", actionAmount: 400 })],
      [account()],
      inverse
    );
    expect(unresolved).toEqual([]);
    expect(byId(holdings, "sec").nativeMarketValue).toBeCloseTo(680, 9);
    expect(byId(holdings, "cash").nativeMarketValue).toBeCloseTo(420, 9);
  });

  it("a CHF loan paid down from USD cash moves each line in its own currency", () => {
    const loan = holding({ id: "loan", accountId: "acct_loan", assetName: "CHF mortgage", assetClass: "liability", isLiability: true, nativeMarketValue: -1_000, reportingMarketValue: -1_250 });
    const usdCash = holding({ id: "usd_cash", accountId: "acct_us", assetName: "USD cash", assetClass: "cash", currency: "USD", nativeMarketValue: 2_000, reportingMarketValue: 2_000 });
    const { holdings, unresolved } = applyRecommendationsToProposed(
      [loan, usdCash],
      [rec({ type: "pay_down_debt", relatedHoldingId: "loan", actionAmount: 500 })],
      [account({ id: "acct_loan", name: "Mortgage" }), account({ id: "acct_us", name: "US cash", baseCurrency: "USD" })],
      USD
    );
    expect(unresolved).toEqual([]);
    expect(byId(holdings, "loan").reportingMarketValue).toBeCloseTo(-750, 9);
    expect(byId(holdings, "loan").nativeMarketValue).toBeCloseTo(-600, 9); // CHF
    expect(byId(holdings, "usd_cash").nativeMarketValue).toBeCloseTo(1_500, 9); // USD funds the paydown
    expect(holdings.some((h) => h.id.startsWith("synth_cash"))).toBe(false);
  });
});

describe("review findings: native-only cash and allocation-neutral actions", () => {
  it("funds a paydown from CHF cash that has no reporting value, converting it explicitly", () => {
    const loan = holding({ id: "loan", accountId: "acct_loan", assetName: "USD loan", assetClass: "liability", currency: "USD", isLiability: true, nativeMarketValue: -1_000, reportingMarketValue: -1_000 });
    const chfCash = holding({ id: "chf_cash", accountId: "acct_ch", assetName: "CHF cash", assetClass: "cash", nativeMarketValue: 100, reportingMarketValue: undefined });
    const accounts = [account({ id: "acct_loan", name: "Loan", baseCurrency: "USD" }), account()];
    const { holdings, unresolved } = applyRecommendationsToProposed(
      [loan, chfCash],
      [rec({ type: "pay_down_debt", relatedHoldingId: "loan", actionAmount: 125 })],
      accounts,
      USD
    );
    expect(unresolved).toEqual([]);
    expect(byId(holdings, "loan").reportingMarketValue).toBeCloseTo(-875, 9);
    expect(byId(holdings, "chf_cash").nativeMarketValue).toBeCloseTo(0, 9);
    expect(byId(holdings, "chf_cash").reportingMarketValue).toBeCloseTo(0, 9);
    expect(holdings.some((h) => h.id.startsWith("synth_cash"))).toBe(false);
    expect(cashShortfallsOf(holdings, accounts, USD)).toEqual([]);
  });

  it("values native-only cash with the FX context when checking for shortfalls", () => {
    // CHF -100 with no reporting value is USD 125 short, not "100".
    const overdrawn = holding({ id: "chf_cash", assetClass: "cash", nativeMarketValue: -100, reportingMarketValue: undefined });
    expect(cashShortfallsOf([overdrawn], [account()], USD)).toEqual([{ accountId: "acct_ch", accountName: "Zurich custody", shortfall: 125 }]);
  });

  it("an allocation-neutral recommendation needs no exchange rate", () => {
    const usdSecurity = holding({ currency: "USD", nativeMarketValue: 1_000, reportingMarketValue: 1_000 });
    const before = [usdSecurity, cash(100)];
    const result = applyRecommendationsToProposed(before, [rec({ type: "hold", relatedHoldingId: "sec" })], [account()], {
      reportingCurrency: "USD",
      rates: [],
    });
    expect(result).toEqual({ holdings: before, unresolved: [], blocked: [] });
  });

  it("sale proceeds in an account with no cash line still fund a paydown", () => {
    const loan = holding({ id: "loan", accountId: "acct_loan", assetName: "USD loan", assetClass: "liability", currency: "USD", isLiability: true, nativeMarketValue: -1_000, reportingMarketValue: -1_000 });
    const accounts = [account({ id: "acct_loan", name: "Loan", baseCurrency: "USD" }), account()];
    const { holdings, unresolved } = applyRecommendationsToProposed(
      [loan, security],
      [rec({ id: "sale", relatedHoldingId: "sec", actionAmount: 400 }), rec({ id: "pay", type: "pay_down_debt", relatedHoldingId: "loan", actionAmount: 400 })],
      accounts,
      USD
    );
    expect(unresolved).toEqual([]);
    expect(byId(holdings, "loan").reportingMarketValue).toBeCloseTo(-600, 9);
    // USD 400 of proceeds raised and spent in the Zurich account: no cash left, no shortfall.
    expect(holdings.find((h) => h.id === "synth_cash_acct_loan")).toBeUndefined();
    expect(cashShortfallsOf(holdings, accounts, USD)).toEqual([]);
  });

  it("a genuine trade in the same setup still reports the missing cash-offset rate", () => {
    const usdSecurity = holding({ currency: "USD", nativeMarketValue: 1_000, reportingMarketValue: 1_000 });
    const result = applyRecommendationsToProposed([usdSecurity, cash(100)], [rec({ relatedHoldingId: "sec", actionAmount: 400 })], [account()], {
      reportingCurrency: "USD",
      rates: [],
    });
    expect(result.unresolved.map((u) => u.currency)).toEqual(["CHF"]);
  });
});

describe("a missing FX rate is reported, never assumed to be 1:1", () => {
  it("leaves the recommendation unapplied and lists it as unresolved", () => {
    const before = [security, cash(100)];
    const result = applyRecommendationsToProposed(
      before,
      [rec({ id: "r_sell", relatedHoldingId: "sec", actionAmount: 400 })],
      [account()],
      { reportingCurrency: "USD", rates: [] }
    );
    expect(result.holdings).toEqual(before);
    expect(result.unresolved).toEqual([
      {
        recommendationId: "r_sell",
        holdingId: "sec",
        accountId: "acct_ch",
        currency: "CHF",
        reportingCurrency: "USD",
        reason: "No CHF/USD exchange rate, so this recommendation was not applied.",
      },
    ]);
  });

  it("also when only the cash offset's currency is missing", () => {
    const usdSecurity = holding({ currency: "USD", nativeMarketValue: 1_000, reportingMarketValue: 1_000 });
    const result = applyRecommendationsToProposed(
      [usdSecurity, cash(100)],
      [rec({ relatedHoldingId: "sec", actionAmount: 400 })],
      [account()],
      { reportingCurrency: "USD", rates: [] }
    );
    expect(result.unresolved.map((u) => u.currency)).toEqual(["CHF"]);
    expect(byId(result.holdings, "sec").nativeMarketValue).toBe(1_000);
  });

  it("fails the readiness gate and is called out in the proposal", () => {
    const holdings = normalizeHoldings(SEED_HOLDINGS, SEED_FX_RATES, "USD");
    const foreign = holdings.find((h) => h.currency !== "USD" && !h.isLiability && h.assetClass !== "cash")!;
    expect(foreign).toBeDefined();
    const sale = rec({ id: "r_foreign", relatedHoldingId: foreign.id, actionAmount: 1_000 });
    const ws = { client: SEED_CLIENT, advisor: SEED_ADVISOR, accounts: SEED_ACCOUNTS, holdings, recommendations: [sale], disclosures: DISCLOSURE_LIBRARY };

    const withRates = evaluateWorkspaceReadiness({ sourceDocuments: [], ...ws, fxRates: SEED_FX_RATES });
    expect(withRates.find((c) => c.code === "fx_available")?.passed).toBe(true);

    const noRates = evaluateWorkspaceReadiness({ sourceDocuments: [], ...ws, fxRates: [] });
    const check = noRates.find((c) => c.code === "fx_available")!;
    expect(check.passed).toBe(false);
    expect(check.detail).toContain(`${foreign.currency}/USD`);

    const html = renderToStaticMarkup(
      React.createElement(ProposalPdfTemplate, {
        ...ws,
        fxRates: [],
        sections: DEFAULT_PROPOSAL_SECTIONS,
        proposal: { id: "p" } as Proposal,
        variant: "draft",
      })
    );
    expect(html).toContain("Proposed actions not applied");
    // The Proposed column says why nothing moved, not "no allocation impact".
    expect(html).toContain("No approved recommendation could be applied. 1 not applied: exchange rate missing");
    expect(html).not.toContain("had no allocation impact");
  });
});

describe("the proposal uses the currency the holdings were normalized into", () => {
  it("follows the Client Profile output currency even if proposal.outputCurrency is stale", () => {
    const client = { ...SEED_CLIENT, proposalOutputCurrency: "EUR" };
    const holdings = normalizeHoldings(SEED_HOLDINGS, SEED_FX_RATES, "EUR");
    const foreign = holdings.find((h) => h.currency !== "EUR" && !h.isLiability && h.assetClass !== "cash")!;
    const html = renderToStaticMarkup(
      React.createElement(ProposalPdfTemplate, {
        client,
        advisor: SEED_ADVISOR,
        accounts: SEED_ACCOUNTS,
        holdings,
        recommendations: [rec({ relatedHoldingId: foreign.id, actionAmount: 1_000 })],
        disclosures: DISCLOSURE_LIBRARY,
        fxRates: SEED_FX_RATES,
        sections: DEFAULT_PROPOSAL_SECTIONS,
        proposal: { id: "p" } as Proposal, // not updated when the client setting changed
        variant: "draft",
      })
    );
    expect(html).not.toContain("Proposed actions not applied");
    expect(html).toContain("€");
  });
});
