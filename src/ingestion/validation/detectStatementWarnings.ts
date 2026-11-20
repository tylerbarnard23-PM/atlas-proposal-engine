import type { DataQualityIssue, ExtractedHolding } from "@/domain/types";
import { quantityPriceBasis } from "@/engines/quantityPrice";

export function detectStatementWarnings(h: ExtractedHolding): DataQualityIssue[] {
  const out: DataQualityIssue[] = [];
  if (!h.symbol && !h.identifier) {
    out.push({ code: "MISSING_IDENTIFIER", severity: "warning", message: "No symbol or identifier extracted." });
  }
  if (h.quantity == null) {
    out.push({ code: "MISSING_VALUATION_DATE", severity: "info", message: "Quantity not extracted.", fieldHint: "quantity" });
  }
  if (h.marketValue == null) {
    out.push({ code: "ADVISOR_APPROVED_VALUE_MISSING", severity: "warning", message: "Market value missing." });
  }
  // Bonds are priced per 100 of face value: 250,000 × 100.42 / 100 = 251,050.
  // The row's kind isn't known yet here, so either convention is accepted.
  if (quantityPriceBasis(h.quantity, h.price, h.marketValue, 0.05) === "mismatch") {
    out.push({ code: "QUANTITY_VALUE_MISMATCH", severity: "warning", message: "Quantity × price differs from market value." });
  }
  if (!h.currency) {
    out.push({ code: "MISSING_CURRENCY", severity: "warning", message: "Currency not detected." });
  }
  return out;
}
