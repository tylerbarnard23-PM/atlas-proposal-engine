import type { CurrencyCode, Holding } from "@/domain/types";

export interface ResolvedValuation {
  amount: number;
  /** The currency `amount` is in: an approved value's own, else the holding's. */
  currency: CurrencyCode;
  source: Holding["valuationSource"];
  fromApprovedValue: boolean;
  fromMarketData: boolean;
  fromAdvisorOverride: boolean;
}

// Returns the value that should be used for proposal output, applying the
// hierarchy: locked approved → advisor override → market data (if accepted) →
// statement value → manual valuation. Never silently overwrites advisor input.
export function resolveValuation(holding: Holding): ResolvedValuation {
  if (holding.proposalApprovedValue) {
    return {
      amount: holding.proposalApprovedValue.amount,
      currency: holding.proposalApprovedValue.currency,
      source: holding.proposalApprovedValue.source,
      fromApprovedValue: true,
      fromMarketData: false,
      fromAdvisorOverride: false,
    };
  }
  if (holding.valuationSource.kind === "advisor_override") {
    return {
      amount: holding.nativeMarketValue,
      currency: holding.currency,
      source: holding.valuationSource,
      fromApprovedValue: false,
      fromMarketData: false,
      fromAdvisorOverride: true,
    };
  }
  if (holding.marketDataSource && holding.advisorVerification === "advisor_approved") {
    return {
      amount: holding.nativeMarketValue,
      currency: holding.currency,
      source: holding.marketDataSource,
      fromApprovedValue: false,
      fromMarketData: true,
      fromAdvisorOverride: false,
    };
  }
  return {
    amount: holding.nativeMarketValue,
    currency: holding.currency,
    source: holding.valuationSource,
    fromApprovedValue: false,
    fromMarketData: false,
    fromAdvisorOverride: false,
  };
}
