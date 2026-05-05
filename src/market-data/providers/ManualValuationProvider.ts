import type { MarketDataProvider } from "../types/marketDataTypes";
import { normalizeQuote } from "../normalize/normalizeQuote";

export const ManualValuationProvider: MarketDataProvider = {
  id: "manual",
  name: "Manual Valuation",
  sourceType: "manual",
  attributionLine: "Advisor-entered or sponsor-reported value",
  supportedAssetTypes: [
    "private_equity",
    "private_credit",
    "hedge_fund",
    "venture_investment",
    "business_equity",
    "real_estate",
    "collectible",
    "annuity",
    "insurance_policy",
    "structured_note",
    "loan_receivable",
    "mortgage_liability",
    "credit_liability",
    "custom",
  ],
  supportedIdentifiers: ["internal", "custom", "none"],
  requiresApiKey: false,
  async fetchQuote(req) {
    // Manual provider does not fetch — it returns ok:false so caller falls back.
    // It exists in the registry primarily for traceability/UI labeling.
    return normalizeQuote({
      ok: false,
      providerId: "manual",
      providerName: "Manual Valuation",
      identifier: req.identifier,
      warning: "Asset is manually valued. Refresh requires advisor entry.",
      quoteType: "manual",
    });
  },
};
