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

describe("rejecting recommendations and dismissing insights", () => {
  it("a rejected recommendation is out of the proposal, skipped by Approve all, and can be reopened", async () => {
    const { useAtlasStore } = await import("@/store/useStore");
    const s = useAtlasStore.getState();
    s.resetSeed();
    const [first, ...rest] = useAtlasStore.getState().recommendations;
    s.rejectRecommendation(first.id, "Client declined");
    let r = useAtlasStore.getState().recommendations.find((x) => x.id === first.id)!;
    expect(r).toMatchObject({ status: "excluded", approvedByAdvisor: false, includeInPdf: false, rejectionReason: "Client declined" });

    const approved = s.approveAllRecommendations();
    expect(approved).toBe(rest.filter((x) => !x.approvedByAdvisor).length);
    r = useAtlasStore.getState().recommendations.find((x) => x.id === first.id)!;
    expect(r.approvedByAdvisor).toBe(false);

    s.reopenRecommendation(first.id);
    r = useAtlasStore.getState().recommendations.find((x) => x.id === first.id)!;
    expect(r.status).toBe("draft");
    expect(r.rejectionReason).toBeUndefined();
  });

  it("dismissing an insight is remembered by its stable key and can be restored", async () => {
    const { useAtlasStore } = await import("@/store/useStore");
    const s = useAtlasStore.getState();
    s.dismissInsight({ key: "concentration:h_aapl", title: "Apple Inc represents 9%", reason: "Client preference", dismissedAt: "2026-10-20" });
    s.dismissInsight({ key: "concentration:h_aapl", title: "Apple Inc represents 9.4%", dismissedAt: "2026-10-21" });
    expect(useAtlasStore.getState().dismissedInsights.filter((d) => d.key === "concentration:h_aapl")).toHaveLength(1);
    s.restoreInsight("concentration:h_aapl");
    expect(useAtlasStore.getState().dismissedInsights.some((d) => d.key === "concentration:h_aapl")).toBe(false);
  });
});

describe("data-quality insights", () => {
  it("the same issue on many holdings is one insight listing them", async () => {
    const { generateInsights } = await import("@/engines/insightEngine");
    const msg = "The plan gives only this account's balance, not the holdings inside it.";
    const h = (id: string, name: string) =>
      ({
        id, assetName: name, assetClass: "custom", currency: "USD", reportingMarketValue: 100, nativeMarketValue: 100,
        valuationSource: { kind: "statement" }, dataQuality: [{ code: "CUSTOM_REQUIRES_REVIEW", severity: "warning", message: msg }],
      }) as never;
    const out = generateInsights({ holdings: [h("a", "Intel 401(k)"), h("b", "Roth IRA"), h("c", "403(b)")], reportingCurrency: "USD" });
    const dq = out.filter((i) => i.category === "data_quality");
    expect(dq).toHaveLength(1);
    expect(dq[0].title).toBe(`3 holdings: ${msg}`);
    expect(dq[0].detail).toMatch(/Intel 401\(k\), Roth IRA, 403\(b\)/);
    expect(dq[0].relatedHoldingIds).toEqual(["a", "b", "c"]);
  });
});
