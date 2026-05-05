import type { DataQualityIssue, ExtractedHolding } from "@/domain/types";

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
  if (
    h.quantity != null &&
    h.price != null &&
    h.marketValue != null &&
    Math.abs(h.quantity * h.price - h.marketValue) / Math.max(1, Math.abs(h.marketValue)) > 0.05
  ) {
    out.push({ code: "QUANTITY_VALUE_MISMATCH", severity: "warning", message: "Quantity × price differs from market value." });
  }
  if (!h.currency) {
    out.push({ code: "MISSING_CURRENCY", severity: "warning", message: "Currency not detected." });
  }
  return out;
}
