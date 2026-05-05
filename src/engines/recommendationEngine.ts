import type { Insight, Recommendation } from "@/domain/types";
import { safeId, todayIso } from "@/utils/formatting";

export function recommendationFromInsight(insight: Insight): Recommendation {
  const now = todayIso();
  const base: Recommendation = {
    id: safeId("rec"),
    title: insight.title,
    type: "custom",
    relatedHoldingId: insight.relatedHoldingIds?.[0],
    relatedAccountId: insight.relatedAccountIds?.[0],
    currency: "USD",
    rationale: insight.detail,
    priority: insight.severity === "critical" ? "high" : insight.severity === "warning" ? "medium" : "low",
    status: "draft",
    includeInPdf: false,
    approvedByAdvisor: false,
    createdAt: now,
    updatedAt: now,
  };
  switch (insight.category) {
    case "concentration":
      return { ...base, type: "reduce_concentration", title: `Reduce concentration: ${insight.title}` };
    case "fees":
      return { ...base, type: "replace_high_fee_fund", title: `Replace high-fee position: ${insight.title}` };
    case "currency":
      return { ...base, type: "currency_hedge" };
    case "liquidity":
      return { ...base, type: "raise_cash" };
    case "valuation":
      return { ...base, type: "review_private_valuation" };
    case "data_quality":
      return { ...base, type: "review_source_data" };
    default:
      return base;
  }
}
