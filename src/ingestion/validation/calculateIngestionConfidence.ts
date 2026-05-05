import type { ConfidenceLevel, ExtractedHolding } from "@/domain/types";

export function calculateHoldingConfidence(h: ExtractedHolding): ConfidenceLevel {
  let score = 0;
  if (h.symbol || h.identifier) score += 2;
  if (h.assetName) score += 1;
  if (h.quantity != null) score += 1;
  if (h.price != null) score += 1;
  if (h.marketValue != null) score += 1;
  if (h.currency) score += 1;
  if (h.assetClass) score += 1;
  if (h.warnings.length > 0) score -= h.warnings.filter((w) => w.severity === "warning").length;
  if (score >= 6) return "high";
  if (score >= 3) return "medium";
  return "low";
}
