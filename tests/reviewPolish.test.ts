import { describe, expect, it } from "vitest";
import { concentrationKind, insightKey } from "@/engines/insightEngine";
import { recommendationFromInsight } from "@/engines/recommendationEngine";
import type { Insight } from "@/domain/types";

describe("concentration applies only to single issuers or single assets", () => {
  it.each([
    [{ assetName: "Apple Inc", assetClass: "equity", assetType: "stock" }, "issuer"],
    [{ assetName: "Restricted Stock - Apple Inc", assetClass: "equity", assetType: "stock" }, "issuer"],
    [{ assetName: "Golden Harvest Properties", assetClass: "business", assetType: "business_equity" }, "asset"],
    [{ assetName: "Rental Property - Miami", assetClass: "real_estate" }, "asset"],
    // Not a concentration question:
    [{ assetName: "Brokerage Account - Self Directed", assetClass: "custom", subAssetClass: "unclassified" }, undefined],
    [{ assetName: "Private Bank Account", assetClass: "cash" }, undefined],
    [{ assetName: "Primary House - New York, NY", assetClass: "real_estate" }, undefined],
    [{ assetName: "Vanguard Total Stock Market ETF", assetClass: "equity" }, undefined],
    [{ assetName: "FXAIX", assetClass: "equity", assetType: "mutual_fund" }, undefined],
    [{ assetName: "Whole Life", assetClass: "insurance" }, undefined],
  ] as const)("%o → %s", (h, kind) => expect(concentrationKind(h as never)).toBe(kind));
});

describe("converting an insight twice", () => {
  const insight = (pct: string, id: string): Insight => ({
    id,
    category: "concentration",
    severity: "warning",
    title: `Apple Inc represents ${pct}% of investible assets`,
    detail: "",
    relatedHoldingIds: ["h_aapl"],
    generatedAt: "2026-10-20",
  });

  it("gives the same observation the same key across runs, even as the percentage moves", () => {
    expect(insightKey(insight("9.1", "insight_a"))).toBe(insightKey(insight("9.4", "insight_b")));
    expect(recommendationFromInsight(insight("9.1", "insight_a")).sourceInsightKey).toBe("concentration:h_aapl");
  });

  it("keys holding-less insights by their title without numbers", () => {
    const a = { category: "liquidity" as const, title: "31% of assets are illiquid" };
    const b = { category: "liquidity" as const, title: "33.5% of assets are illiquid" };
    expect(insightKey(a)).toBe(insightKey(b));
  });
});
