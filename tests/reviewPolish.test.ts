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

describe("data to complete", () => {
  const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10);
  const balanceMsg = "The plan gives only this account's balance, not the holdings inside it.";
  const h = (over: Record<string, unknown>) =>
    ({
      id: "h", accountId: "a", assetName: "X", assetClass: "equity", currency: "USD", nativeMarketValue: 100, reportingMarketValue: 100,
      valuationDate: daysAgo(1), valuationSource: { kind: "statement" }, dataQuality: [], identifier: { type: "ticker", value: "X" },
      ...over,
    }) as never;

  it("balance-only accounts are one task listing them; 'keep as one balance' marks them done", async () => {
    const { dataTasks } = await import("@/engines/dataTasks");
    const dq = [{ code: "CUSTOM_REQUIRES_REVIEW", severity: "warning", message: balanceMsg }];
    const tasks = dataTasks([
      h({ id: "a1", assetClass: "custom", identifier: undefined, dataQuality: dq }),
      h({ id: "a2", assetClass: "custom", identifier: undefined, dataQuality: dq, dataAcks: { keepAsBalance: true } }),
    ]);
    expect(tasks).toEqual([{ kind: "balance_only", openIds: ["a1"], doneIds: ["a2"] }]);
  });

  it("asks for a ticker only for listed securities", async () => {
    const { needsIdentifier } = await import("@/engines/dataTasks");
    expect(needsIdentifier(h({ identifier: undefined }))).toBe(true);
    for (const assetClass of ["insurance", "real_estate", "business", "cash", "collectible", "custom"]) {
      expect(needsIdentifier(h({ assetClass, identifier: undefined }))).toBe(false);
    }
  });

  it("stale after 35 days if market-priced, 12 months if privately valued; 'use this date' holds until the date changes", async () => {
    const { isStaleValue, dataTasks } = await import("@/engines/dataTasks");
    expect(isStaleValue(h({ valuationDate: daysAgo(40) }))).toBe(true);
    expect(isStaleValue(h({ assetClass: "real_estate", valuationDate: daysAgo(200) }))).toBe(false);
    expect(isStaleValue(h({ assetClass: "insurance", valuationDate: daysAgo(400) }))).toBe(true);
    const date = daysAgo(40);
    expect(dataTasks([h({ valuationDate: date, dataAcks: { acceptedValuationDate: date } })])).toEqual([]);
    expect(dataTasks([h({ valuationDate: date, dataAcks: { acceptedValuationDate: daysAgo(90) } })])[0].openIds).toEqual(["h"]);
  });

  it("task insights keep one key as holdings are resolved, so a dismissal sticks", async () => {
    const { generateInsights, insightKey } = await import("@/engines/insightEngine");
    const stale = (id: string) => h({ id, valuationDate: daysAgo(60) });
    const a = generateInsights({ holdings: [stale("x"), stale("y")], reportingCurrency: "USD" }).find((i) => i.task)!;
    const b = generateInsights({ holdings: [stale("x")], reportingCurrency: "USD" }).find((i) => i.task)!;
    expect(a.title).toBe("2 values are out of date");
    expect(insightKey(a)).toBe(insightKey(b));
  });

  it("other data-quality issues on many holdings are one insight listing them", async () => {
    const { generateInsights } = await import("@/engines/insightEngine");
    const dq = [{ code: "QUANTITY_VALUE_MISMATCH", severity: "warning", message: "Quantity × price differs from market value." }];
    const out = generateInsights({ holdings: [h({ id: "a", assetName: "AAA", dataQuality: dq }), h({ id: "b", assetName: "BBB", dataQuality: dq })], reportingCurrency: "USD" });
    const dqi = out.filter((i) => i.category === "data_quality" && !i.task);
    expect(dqi).toHaveLength(1);
    expect(dqi[0].title).toBe("2 holdings: Quantity × price differs from market value.");
    expect(dqi[0].detail).toMatch(/AAA, BBB/);
  });
});
