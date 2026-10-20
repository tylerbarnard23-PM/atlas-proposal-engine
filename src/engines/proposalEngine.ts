import type { Account, Holding, Proposal, ProposalSection, Recommendation } from "@/domain/types";
import { sumBy } from "@/utils/numbers";

export const DEFAULT_PROPOSAL_SECTIONS: ProposalSection[] = [
  { key: "executive_summary", label: "Executive Summary", enabled: true, required: true },
  { key: "client_profile", label: "Client Profile", enabled: true },
  { key: "current_portfolio", label: "Current Portfolio", enabled: true, required: true },
  { key: "proposed_portfolio", label: "Proposed Portfolio", enabled: true },
  { key: "recommendations", label: "Advisor Recommendations", enabled: true, required: true },
  { key: "before_after_allocation", label: "Before / After Allocation", enabled: true },
  { key: "currency_exposure", label: "Currency Exposure", enabled: true },
  { key: "country_exposure", label: "Country Exposure", enabled: true },
  { key: "risk_review", label: "Risk Review", enabled: true },
  { key: "liquidity", label: "Liquidity Profile", enabled: true },
  { key: "fee_analysis", label: "Fee Analysis", enabled: true },
  { key: "income_analysis", label: "Income Analysis", enabled: true },
  { key: "tax_considerations", label: "Tax Considerations", enabled: true },
  { key: "implementation", label: "Implementation Plan", enabled: true },
  { key: "data_sources", label: "Data Sources & Quality", enabled: true, required: true },
  { key: "market_data_sources", label: "Market Data & Valuation Sources", enabled: true, required: true },
  { key: "assumptions", label: "Assumptions", enabled: true, required: true },
  { key: "disclosures", label: "Disclosures", enabled: true, required: true },
  { key: "appendix_holdings", label: "Appendix — Holdings", enabled: true },
  { key: "appendix_accounts", label: "Appendix — Accounts", enabled: true },
  { key: "appendix_market_data", label: "Appendix — Market Data Sources", enabled: true },
  { key: "appendix_compliance", label: "Appendix — Compliance Checklist", enabled: false },
];

// Compute the post-rec value for a single holding given its current value,
// the recommendation, and whether the holding is a liability. Pure function:
// no cash flow side-effects, no mutation. Used by both the engine
// (applyRecommendationsToProposed) and the UI (per-rec effect summary on
// recommendation cards) so the two stay in sync.
export function applyRecToValue(value: number, rec: Recommendation, isLiability: boolean): number {
  if (rec.proposedValue != null) return rec.proposedValue;

  // Resolve the effective dollar magnitude, honoring the % vs. $ unit.
  let amount: number | null = null;
  if (rec.actionAmount != null) {
    const raw = Math.abs(rec.actionAmount);
    amount = rec.actionAmountUnit === "percent" ? Math.abs(value) * (raw / 100) : raw;
  }
  // Signed equivalent for types that need direction (rebalance).
  const signedAmount =
    rec.actionAmount != null
      ? rec.actionAmountUnit === "percent"
        ? Math.abs(value) * (rec.actionAmount / 100)
        : rec.actionAmount
      : null;

  switch (rec.type) {
    case "sell":
    case "raise_cash":
      // With an action amount (dollars or %), treat as a partial sale —
      // matches natural advisor language like "sell 40% of AAPL". Without
      // an amount, fully exit the position.
      return amount != null ? Math.max(0, value - amount) : 0;
    case "reduce":
    case "reduce_concentration":
      return amount != null ? Math.max(0, value - amount) : value * 0.5;
    case "pay_down_debt":
      if (isLiability) return amount != null ? Math.min(0, value + amount) : value * 0.5;
      return value;
    case "increase":
    case "buy":
      return amount != null ? value + amount : value;
    case "rebalance":
      return signedAmount != null ? value + signedAmount : value;
    case "tax_loss_harvest":
    case "replace_high_fee_fund":
    case "improve_asset_location":
      // Net-flat on allocation: same exposure, different vehicle/lot.
      return value;
    default:
      return value;
  }
}

// Apply approved recommendations to produce the proposed holdings view.
// Hierarchy of intent for any single recommendation:
//   1. Explicit proposedValue → set the holding to that value.
//   2. Recommendation type → infer effect (sell zeroes, reduce subtracts, etc.).
//   3. actionAmount (with optional percent unit) when type implies signed delta.
// Multiple recs on the same holding compose in order. Recs with no
// relatedHoldingId are advisory-only and don't shift the proposed allocation.
//
// Cash flow: every value change on an asset holding produces an offsetting
// cash flow in the same account (sale → cash credit, purchase → cash debit).
// Pay-down-debt on a liability uses cash from that account to retire debt.
// Net cash deltas are applied to the account's existing cash holding when one
// exists; otherwise a synthetic "Net Proposed Cash" line is added so the
// proposed total equals the current total (modulo external cash flows).
export function applyRecommendationsToProposed(
  current: Holding[],
  approvedRecommendations: Recommendation[],
  accounts: Account[] = []
): Holding[] {
  const accountById = new Map(accounts.map((a) => [a.id, a] as const));
  const byHolding = new Map<string, Recommendation[]>();
  for (const rec of approvedRecommendations) {
    if (!rec.relatedHoldingId) continue;
    const arr = byHolding.get(rec.relatedHoldingId) ?? [];
    arr.push(rec);
    byHolding.set(rec.relatedHoldingId, arr);
  }

  // First pass: compute new values for each touched holding and record the
  // resulting cash impact per account.
  const newValueById = new Map<string, number>();
  const cashByAccount = new Map<string, number>();
  const bump = (acctId: string, delta: number) =>
    cashByAccount.set(acctId, (cashByAccount.get(acctId) ?? 0) + delta);

  for (const h of current) {
    const recs = byHolding.get(h.id);
    if (!recs?.length) continue;
    let value = h.reportingMarketValue ?? h.nativeMarketValue;

    for (const rec of recs) {
      const before = value;
      value = applyRecToValue(value, rec, !!h.isLiability);

      // Record the cash side of this rec.
      const change = value - before;
      if (h.isLiability) {
        // change is positive when paying down debt (moving toward 0). Cash
        // leaves the account by the same magnitude.
        if (change > 0) bump(h.accountId, -change);
      } else if (h.assetClass !== "cash") {
        // Asset trades produce cash in the opposite direction.
        if (change !== 0) bump(h.accountId, -change);
      }
    }

    newValueById.set(h.id, value);
  }

  // Second pass: write the new values into a result list.
  const result: Holding[] = current.map((h) => {
    const newVal = newValueById.get(h.id);
    return newVal === undefined
      ? h
      : { ...h, reportingMarketValue: newVal, nativeMarketValue: newVal };
  });

  // Third pass: apply each account's net cash delta.
  for (const [accountId, delta] of cashByAccount) {
    if (Math.abs(delta) < 1) continue; // ignore sub-dollar noise
    const account = accountById.get(accountId);
    const cashIdx = result.findIndex(
      (h) => h.accountId === accountId && h.assetClass === "cash" && !h.isLiability
    );
    if (cashIdx >= 0) {
      const existing = result[cashIdx];
      const updated: Holding = {
        ...existing,
        reportingMarketValue: (existing.reportingMarketValue ?? existing.nativeMarketValue) + delta,
        nativeMarketValue: existing.nativeMarketValue + delta,
        valuationSource: {
          ...existing.valuationSource,
          note: [existing.valuationSource.note, "Adjusted by proposed actions"]
            .filter(Boolean)
            .join(" · "),
        },
        advisorNotes: [existing.advisorNotes, "Includes proposed-action cash flow"]
          .filter(Boolean)
          .join("\n"),
      };
      result[cashIdx] = updated;
    } else {
      const fallbackCurrency = account?.baseCurrency ?? "USD";
      result.push({
        id: `synth_cash_${accountId}`,
        accountId,
        assetName: "Net Proposed Cash",
        assetClass: "cash",
        subAssetClass: "cash_equivalents",
        country: account?.country,
        currency: fallbackCurrency,
        nativeMarketValue: delta,
        reportingMarketValue: delta,
        liquidity: "cash",
        valuationDate: new Date().toISOString().slice(0, 10),
        valuationSource: {
          kind: "advisor_entered",
          asOf: new Date().toISOString(),
          confidence: "high",
          note: "Synthetic cash position: net of proposed actions in this account",
        },
        quoteType: "advisor_entered",
        priceFreshness: "manual",
        advisorVerification: "advisor_reviewed",
        dataQuality: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  }

  return result;
}

export interface CashShortfall {
  accountId: string;
  accountName: string;
  shortfall: number; // positive amount of cash missing, in the reporting currency
}

// Accounts whose cash would go negative after the approved recommendations,
// i.e. purchases (or debt paydowns) larger than the cash available in that
// account. The proposal must not present negative cash as an allocation.
export function proposedCashShortfalls(
  current: Holding[],
  approvedRecommendations: Recommendation[],
  accounts: Account[] = []
): CashShortfall[] {
  const proposed = applyRecommendationsToProposed(current, approvedRecommendations, accounts);
  const cashByAccount = new Map<string, number>();
  for (const h of proposed) {
    if (h.isLiability || h.assetClass !== "cash") continue;
    cashByAccount.set(h.accountId, (cashByAccount.get(h.accountId) ?? 0) + (h.reportingMarketValue ?? h.nativeMarketValue));
  }
  const names = new Map(accounts.map((a) => [a.id, a.name] as const));
  return [...cashByAccount]
    .filter(([, cash]) => cash < -0.5)
    .map(([accountId, cash]) => ({ accountId, accountName: names.get(accountId) ?? accountId, shortfall: -cash }));
}

export function netWorth(holdings: Holding[]): { gross: number; liabilities: number; net: number } {
  const assets = sumBy(holdings.filter((h) => !h.isLiability), (h) => h.reportingMarketValue ?? h.nativeMarketValue);
  const liabilities = sumBy(holdings.filter((h) => h.isLiability), (h) => h.reportingMarketValue ?? h.nativeMarketValue);
  return { gross: assets, liabilities: Math.abs(liabilities), net: assets + liabilities };
}

export function buildProposal(opts: {
  clientId: string;
  advisorId: string;
  outputCurrency: string;
  outputCountry: string;
  recommendationIds: string[];
  assumptionIds: string[];
  disclosureIds: string[];
  title?: string;
}): Proposal {
  const now = new Date().toISOString();
  return {
    id: `prop_${Math.random().toString(36).slice(2, 10)}`,
    clientId: opts.clientId,
    advisorId: opts.advisorId,
    title: opts.title ?? "Family Wealth Proposal",
    outputCurrency: opts.outputCurrency,
    outputCountry: opts.outputCountry,
    createdAt: now,
    updatedAt: now,
    approvalStatus: "draft",
    sections: DEFAULT_PROPOSAL_SECTIONS,
    recommendationIds: opts.recommendationIds,
    assumptionIds: opts.assumptionIds,
    disclosureIds: opts.disclosureIds,
  };
}
