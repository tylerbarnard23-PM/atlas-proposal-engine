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

export function applyRecommendationsToProposed(
  current: Holding[],
  approvedRecommendations: Recommendation[]
): Holding[] {
  // Naive proposed view: use proposedValue when provided to override reportingMarketValue.
  return current.map((h) => {
    const rec = approvedRecommendations.find((r) => r.relatedHoldingId === h.id && r.proposedValue != null);
    if (!rec) return h;
    return {
      ...h,
      reportingMarketValue: rec.proposedValue,
      nativeMarketValue: rec.proposedValue!,
    };
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
