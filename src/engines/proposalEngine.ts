import type { Holding, Proposal, ProposalSection, Recommendation } from "@/domain/types";
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

// Apply approved recommendations to produce the proposed holdings view.
// Hierarchy of intent for any single recommendation:
//   1. Explicit proposedValue → set the holding to that value.
//   2. Recommendation type → infer effect (sell zeroes, reduce subtracts, etc.).
//   3. actionAmount when type implies signed delta.
// Multiple recs on the same holding compose in order. Recs with no
// relatedHoldingId are advisory-only and don't shift the proposed allocation.
export function applyRecommendationsToProposed(
  current: Holding[],
  approvedRecommendations: Recommendation[]
): Holding[] {
  const byHolding = new Map<string, Recommendation[]>();
  for (const rec of approvedRecommendations) {
    if (!rec.relatedHoldingId) continue;
    const arr = byHolding.get(rec.relatedHoldingId) ?? [];
    arr.push(rec);
    byHolding.set(rec.relatedHoldingId, arr);
  }

  return current.map((h) => {
    const recs = byHolding.get(h.id);
    if (!recs?.length) return h;
    let value = h.reportingMarketValue ?? h.nativeMarketValue;

    for (const rec of recs) {
      if (rec.proposedValue != null) {
        value = rec.proposedValue;
        continue;
      }
      const amount = rec.actionAmount != null ? Math.abs(rec.actionAmount) : null;
      switch (rec.type) {
        case "sell":
        case "raise_cash":
          value = 0;
          break;
        case "reduce":
        case "reduce_concentration":
          value = amount != null ? Math.max(0, value - amount) : value * 0.5;
          break;
        case "pay_down_debt":
          // Paying down debt reduces a liability balance (stored as negative)
          // toward zero; for an asset holding, treat as no-op.
          if (h.isLiability) {
            value = amount != null ? Math.min(0, value + amount) : value * 0.5;
          }
          break;
        case "increase":
        case "buy":
          if (amount != null) value += amount;
          break;
        case "rebalance":
          // Signed delta when actionAmount is provided (positive = add, negative = trim).
          if (rec.actionAmount != null) value += rec.actionAmount;
          break;
        case "tax_loss_harvest":
        case "replace_high_fee_fund":
        case "improve_asset_location":
          // Net-flat on allocation: same exposure, different vehicle/lot.
          break;
        // hold, transfer, consolidate_accounts, currency_hedge, custom, review_*,
        // and other advisory types leave allocation unchanged unless an
        // explicit proposedValue is provided.
      }
    }

    return { ...h, reportingMarketValue: value, nativeMarketValue: value };
  });
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
