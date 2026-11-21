import type { DataQualityIssue, Holding } from "@/domain/types";
import { isStale } from "@/utils/dates";
import { quantityPriceBasis, quotedPer100 } from "./quantityPrice";

const STATEMENT_FRESHNESS_DAYS = 35;

export function evaluateHoldingQuality(h: Holding): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];
  if (!h.identifier && h.assetClass !== "cash" && h.assetClass !== "real_estate" && h.assetClass !== "business" && h.assetClass !== "collectible" && h.assetClass !== "liability" && h.assetClass !== "private_equity" && h.assetClass !== "private_credit" && h.assetClass !== "hedge_fund") {
    issues.push({ code: "MISSING_IDENTIFIER", severity: "warning", message: "Holding has no ticker/CUSIP/ISIN identifier." });
  }
  if (!h.assetClass || h.assetClass === "custom") {
    issues.push({ code: "MISSING_ASSET_CLASS", severity: "warning", message: "Asset class not classified." });
  }
  if (!h.currency) {
    issues.push({ code: "MISSING_CURRENCY", severity: "critical", message: "Currency missing." });
  }
  if (!h.valuationDate) {
    issues.push({ code: "MISSING_VALUATION_DATE", severity: "warning", message: "No valuation date recorded." });
  } else if (isStale(h.valuationDate, STATEMENT_FRESHNESS_DAYS)) {
    issues.push({ code: "STALE_VALUATION", severity: "warning", message: "Valuation older than 35 days." });
  }
  if (h.costBasis == null && (h.assetClass === "equity" || h.assetClass === "fixed_income")) {
    issues.push({ code: "MISSING_COST_BASIS", severity: "info", message: "Cost basis not provided." });
  }
  if (!h.liquidity) {
    issues.push({ code: "MISSING_LIQUIDITY", severity: "info", message: "Liquidity not classified." });
  }
  if (h.valuationSource.kind === "manual_valuation") {
    issues.push({ code: "MANUALLY_VALUED", severity: "info", message: "Manually valued asset — review periodically." });
  }
  if (h.valuationSource.kind === "mock") {
    issues.push({ code: "MOCK_PRICE_USED", severity: "warning", message: "Mock/fallback price in use." });
  }
  if (h.priceFreshness === "stale") {
    issues.push({ code: "MARKET_PRICE_STALE", severity: "warning", message: "Market price flagged as stale." });
  }
  if (h.advisorVerification === "unverified") {
    issues.push({ code: "ADVISOR_APPROVED_VALUE_MISSING", severity: "info", message: "Holding not yet advisor-reviewed." });
  }
  // The import's convention (#46): a bond is priced per 100 of face value. Only
  // a fixed-income holding or a bond type may match that way; a share that
  // matches only per 100 is still a mismatch.
  const basis = quantityPriceBasis(h.quantity, h.price, h.nativeMarketValue, 0.02);
  if (basis === "mismatch" || (basis === "per_100" && !quotedPer100(h))) {
    issues.push({ code: "QUANTITY_VALUE_MISMATCH", severity: "warning", message: "Quantity × price differs from market value by more than 2%." });
  }
  return issues;
}

// Reported, but not penalized: an identifier helps identify or match an
// investment and isn't needed to value it or build a proposal (R18/R11).
// Matching on the code covers saved warnings from earlier versions and
// statement imports without rewriting them.
const UNPENALIZED = new Set<DataQualityIssue["code"]>(["MISSING_IDENTIFIER"]);

export function dataQualityScore(issues: DataQualityIssue[]): number {
  // 100 - weighted penalties
  let score = 100;
  for (const issue of issues) {
    if (UNPENALIZED.has(issue.code)) continue;
    if (issue.severity === "critical") score -= 12;
    else if (issue.severity === "warning") score -= 6;
    else score -= 2;
  }
  return Math.max(0, score);
}
