import { describe, expect, it } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProposalPdfTemplate } from "@/pdf/templates/ProposalPdfTemplate";
import { normalizeHoldings, type NormalizedHolding } from "@/engines/normalizationEngine";
import { DEFAULT_PROPOSAL_SECTIONS } from "@/engines/proposalEngine";
import { ASSET_CLASS_LABELS } from "@/domain/assetTaxonomy";
import type { Proposal, Recommendation } from "@/domain/types";
import { SEED_HOLDINGS } from "@/data/seedHoldings";
import { SEED_FX_RATES } from "@/data/seedFxRates";
import { SEED_ACCOUNTS } from "@/data/seedAccounts";
import { SEED_ADVISOR, SEED_CLIENT } from "@/data/seedClient";
import { DISCLOSURE_LIBRARY } from "@/domain/disclosureLibrary";

// End-to-end check of the proposal's Before / After page: render the real
// template with approved recommendations and read the numbers back out of the
// markup, so a regression anywhere between the engine and the chart shows up.

const holdings = normalizeHoldings(SEED_HOLDINGS, SEED_FX_RATES, "USD");
const USD_FX = { reportingCurrency: "USD", rates: SEED_FX_RATES };
const bySymbol = (s: string) => holdings.find((h) => h.identifier?.value === s)!;

function rec(patch: Partial<Recommendation>): Recommendation {
  return {
    id: `r_${Math.random().toString(36).slice(2)}`,
    title: "Test recommendation",
    type: "custom",
    currency: "USD",
    rationale: "Test",
    priority: "medium",
    status: "approved",
    includeInPdf: true,
    approvedByAdvisor: true,
    createdAt: "2026-10-20",
    updatedAt: "2026-10-20",
    ...patch,
  };
}

interface Side {
  total: number;
  rows: Map<string, { pct: number; value: number }>;
}

const money = (s: string) => {
  const m = s.match(/^\$?(-?[\d.,]+)([KMB]?)$/);
  if (!m) throw new Error(`Unparseable amount ${s}`);
  const mult = { "": 1, K: 1e3, M: 1e6, B: 1e9 }[m[2] as "" | "K" | "M" | "B"];
  return Number(m[1].replace(/,/g, "")) * mult;
};

function renderBeforeAfter(recommendations: Recommendation[], hs: NormalizedHolding[] = holdings) {
  const html = renderToStaticMarkup(
    React.createElement(ProposalPdfTemplate, {
      client: SEED_CLIENT,
      advisor: SEED_ADVISOR,
      accounts: SEED_ACCOUNTS,
      holdings: hs,
      recommendations,
      sections: DEFAULT_PROPOSAL_SECTIONS,
      disclosures: DISCLOSURE_LIBRARY,
      fxRates: SEED_FX_RATES,
      proposal: { id: "p_test" } as Proposal,
      variant: "final",
    })
  );
  const start = html.indexOf("Before / After Allocation");
  expect(start).toBeGreaterThan(-1);
  const text = html.slice(start).replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
  const labels = Object.values(ASSET_CLASS_LABELS).map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  // Each side lists "Label 12.3% $4.5M" rows after its "Before Current portfolio"/"After Proposed portfolio" total.
  const rowRe = new RegExp(`(${labels.join("|")}) (-?[\\d.]+)% (\\$?-?[\\d.,]+[KMB]?)`, "g");
  const side = (marker: string, until: string): Side => {
    const seg = text.slice(text.indexOf(marker), text.indexOf(until, text.indexOf(marker) + marker.length));
    const total = money(seg.slice(marker.length).trim().split(" ")[0]);
    const rows = new Map<string, { pct: number; value: number }>();
    for (const m of seg.matchAll(rowRe)) rows.set(m[1], { pct: Number(m[2]), value: money(m[3]) });
    return { total, rows };
  };
  return { current: side("Current portfolio", "Proposed portfolio"), proposed: side("Proposed portfolio", "approved recommendation"), text };
}

const near = (a: number, b: number, tol: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);
// Charts show compact amounts ($4.92M, $748.72K), so compare within display rounding.
const TOL = 10_000;

describe("Before / After allocation in the proposal", () => {
  it("matches current exactly when no recommendation is approved", () => {
    const { current, proposed, text } = renderBeforeAfter([rec({ approvedByAdvisor: false, relatedHoldingId: bySymbol("AAPL").id, type: "sell" })]);
    expect(proposed.total).toBe(current.total);
    for (const [label, row] of current.rows) expect(proposed.rows.get(label)).toEqual(row);
    expect(text).toContain("Approve a recommendation with a linked holding");
  });

  it("moves a partial sale from the asset class into cash, keeping the total", () => {
    const aapl = bySymbol("AAPL");
    const sold = aapl.reportingMarketValue * 0.5;
    const { current, proposed } = renderBeforeAfter([
      rec({ type: "sell", relatedHoldingId: aapl.id, actionAmount: 50, actionAmountUnit: "percent" }),
    ]);
    near(proposed.total, current.total, TOL);
    near(proposed.rows.get("Equity")!.value, current.rows.get("Equity")!.value - sold, TOL);
    near(proposed.rows.get("Cash & Equivalents")!.value, current.rows.get("Cash & Equivalents")!.value + sold, TOL);
    expect(proposed.rows.get("Equity")!.pct).toBeLessThan(current.rows.get("Equity")!.pct);
  });

  it("converts a sale of a non-USD holding at its reporting-currency value", () => {
    const nestle = holdings.find((h) => h.currency === "CHF" && h.assetClass === "equity")!;
    const { current, proposed } = renderBeforeAfter([rec({ type: "sell", relatedHoldingId: nestle.id })]);
    near(proposed.rows.get("Equity")!.value, current.rows.get("Equity")!.value - nestle.reportingMarketValue, TOL);
    near(proposed.rows.get("Cash & Equivalents")!.value, current.rows.get("Cash & Equivalents")!.value + nestle.reportingMarketValue, TOL);
    near(proposed.total, current.total, TOL);
  });

  it("ignores advisory-only recommendations", () => {
    const { current, proposed } = renderBeforeAfter([rec({ type: "review_source_data" })]);
    expect(proposed.total).toBe(current.total);
    expect(proposed.rows.get("Equity")).toEqual(current.rows.get("Equity"));
  });

  it("treats a fee-fund replacement as allocation-neutral", () => {
    const fund = holdings.find((h) => (h.expenseRatioPct ?? 0) > 1)!;
    const { current, proposed } = renderBeforeAfter([rec({ type: "replace_high_fee_fund", relatedHoldingId: fund.id })]);
    for (const [label, row] of current.rows) expect(proposed.rows.get(label)).toEqual(row);
  });

  it("pays down debt from cash: investible assets fall by the payment", () => {
    const mortgage = holdings.find((h) => h.isLiability)!;
    const payment = 100_000;
    const { current, proposed } = renderBeforeAfter([
      rec({ type: "pay_down_debt", relatedHoldingId: mortgage.id, actionAmount: payment }),
    ]);
    near(proposed.total, current.total - payment, TOL);
  });

  it("composes several approved recommendations", () => {
    const aapl = bySymbol("AAPL");
    const msft = bySymbol("MSFT");
    const { current, proposed } = renderBeforeAfter([
      rec({ type: "reduce", relatedHoldingId: aapl.id, actionAmount: 200_000 }),
      rec({ type: "sell", relatedHoldingId: msft.id, actionAmount: 100_000 }),
    ]);
    near(proposed.rows.get("Equity")!.value, current.rows.get("Equity")!.value - 300_000, TOL);
    near(proposed.rows.get("Cash & Equivalents")!.value, current.rows.get("Cash & Equivalents")!.value + 300_000, TOL);
    near(proposed.total, current.total, TOL);
  });
});

describe("unfunded purchases", () => {
  const vti = bySymbol("VTI");
  const tooBig = rec({ type: "buy", relatedHoldingId: vti.id, actionAmount: 2_000_000 });

  it("calls out the shortfall on the Before / After page", () => {
    const { text } = renderBeforeAfter([tooBig]);
    expect(text).toContain("Unfunded proposed purchases");
    expect(text).toMatch(/short \$1\.\d+M/);
  });

  it("blocks the final PDF through the readiness check", async () => {
    const { evaluateWorkspaceReadiness } = await import("@/engines/complianceEngine");
    const checks = evaluateWorkspaceReadiness({
      client: SEED_CLIENT,
      advisor: SEED_ADVISOR,
      accounts: SEED_ACCOUNTS,
      holdings,
      recommendations: [tooBig],
      disclosures: DISCLOSURE_LIBRARY,
      fxRates: SEED_FX_RATES,
    });
    const funded = checks.find((c) => c.code === "trades_funded")!;
    expect(funded.passed).toBe(false);
    expect(funded.detail).toMatch(/short/);
  });

  it("passes once the purchase fits the available cash", async () => {
    const { evaluateWorkspaceReadiness } = await import("@/engines/complianceEngine");
    const checks = evaluateWorkspaceReadiness({
      client: SEED_CLIENT,
      advisor: SEED_ADVISOR,
      accounts: SEED_ACCOUNTS,
      holdings,
      recommendations: [rec({ type: "buy", relatedHoldingId: vti.id, actionAmount: 100_000 })],
      disclosures: DISCLOSURE_LIBRARY,
      fxRates: SEED_FX_RATES,
    });
    expect(checks.find((c) => c.code === "trades_funded")!.passed).toBe(true);
  });
});

describe("debt paydown funding", () => {
  const mortgage = holdings.find((h) => h.isLiability)!;
  const householdCash = holdings.filter((h) => !h.isLiability && h.assetClass === "cash").reduce((s, h) => s + h.reportingMarketValue, 0);

  it("draws a paydown from household cash in other accounts, not the loan account", async () => {
    const { proposedCashShortfalls } = await import("@/engines/proposalEngine");
    const paydown = rec({ type: "pay_down_debt", relatedHoldingId: mortgage.id, actionAmount: Math.floor(householdCash / 2) });
    expect(proposedCashShortfalls(holdings, [paydown], SEED_ACCOUNTS, USD_FX)).toEqual([]);
  });

  it("flags a shortfall only when household cash can't cover the paydown", async () => {
    const { proposedCashShortfalls } = await import("@/engines/proposalEngine");
    const paydown = rec({ type: "pay_down_debt", relatedHoldingId: mortgage.id, actionAmount: Math.round(householdCash + 50_000) });
    const shortfalls = proposedCashShortfalls(holdings, [paydown], SEED_ACCOUNTS, USD_FX);
    expect(shortfalls).toHaveLength(1);
    near(shortfalls[0].shortfall, 50_000, 1);
  });

  it("lets 'Approve all' on the sample recommendations produce a funded proposal", async () => {
    const { SEED_RECOMMENDATIONS } = await import("@/data/seedRecommendations");
    const { evaluateWorkspaceReadiness } = await import("@/engines/complianceEngine");
    const allApproved = SEED_RECOMMENDATIONS.map((r) => ({ ...r, approvedByAdvisor: true, includeInPdf: true }));
    const checks = evaluateWorkspaceReadiness({
      client: SEED_CLIENT,
      advisor: SEED_ADVISOR,
      accounts: SEED_ACCOUNTS,
      holdings,
      recommendations: allApproved,
      disclosures: DISCLOSURE_LIBRARY,
      fxRates: SEED_FX_RATES,
    });
    expect(checks.find((c) => c.code === "trades_funded")?.passed).toBe(true);
    const { proposed, current } = renderBeforeAfter(allApproved);
    expect(proposed.rows.get("Cash & Equivalents")!.value).toBeGreaterThanOrEqual(0);
    expect(proposed.total).toBeLessThanOrEqual(current.total);
  });
});
