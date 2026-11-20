import { describe, expect, it } from "vitest";
import type { Holding } from "@/domain/types";
import { evaluateHoldingQuality } from "@/engines/dataQualityEngine";
import { normalizeHoldings } from "@/engines/normalizationEngine";
import { generateInsights } from "@/engines/insightEngine";
import { detectStatementWarnings } from "@/ingestion/validation/detectStatementWarnings";

// #46: the shared holding-quality check uses the same pricing convention as
// the import: a bond is priced per 100 of face value, so 250,000 face at
// 100.42 is USD 251,050, not 25,105,000. A genuine mismatch still warns.
// Synthetic data, through the real normalization and insight engines.

const base = (over: Partial<Holding>): Holding => ({
  id: "h",
  accountId: "acc",
  assetName: "Synthetic",
  assetClass: "equity",
  currency: "USD",
  nativeMarketValue: 0,
  valuationDate: new Date().toISOString().slice(0, 10),
  valuationSource: { kind: "statement", asOf: new Date().toISOString().slice(0, 10), confidence: "high" },
  identifier: { type: "ticker", value: "SYN" },
  liquidity: "daily",
  costBasis: 1,
  dataQuality: [],
  advisorVerification: "advisor_approved",
  createdAt: "2026-04-30T00:00:00Z",
  updatedAt: "2026-04-30T00:00:00Z",
  ...over,
});

const SHARE = base({ id: "h_share", assetName: "Synthetic Share Co", assetType: "stock", quantity: 1_000, price: 150, nativeMarketValue: 150_000 });
const BOND = base({
  id: "h_bond",
  assetName: "Synthetic State General Obligation 4.0% 2031",
  assetClass: "fixed_income",
  assetType: "municipal_bond",
  identifier: { type: "cusip", value: "000000AA0" },
  quantity: 250_000,
  price: 100.42,
  nativeMarketValue: 251_050,
});
const mismatch = (h: Holding) => evaluateHoldingQuality(h).some((i) => i.code === "QUANTITY_VALUE_MISMATCH");

describe("#46: quantity × price uses the per-100 convention for bonds", () => {
  it("ordinary share pricing matches per unit: no warning", () => {
    expect(mismatch(SHARE)).toBe(false);
  });

  it("a fixed-income holding priced per 100 of face value: no warning", () => {
    expect(mismatch(BOND)).toBe(false);
    // classified by asset type alone (a bond type with another class) as well
    expect(mismatch({ ...BOND, assetClass: "custom" })).toBe(false);
  });

  it("a genuine mismatch still warns, for a share and for a bond", () => {
    expect(mismatch({ ...SHARE, nativeMarketValue: 120_000 })).toBe(true);
    expect(mismatch({ ...BOND, nativeMarketValue: 200_000 })).toBe(true);
  });

  it("a share (or an unclassified row) that matches only per 100 still warns: per 100 is a bond's convention", () => {
    expect(mismatch({ ...SHARE, nativeMarketValue: 1_500 })).toBe(true);
    expect(mismatch({ ...BOND, assetClass: "custom", assetType: undefined })).toBe(true);
  });

  it("Insights no longer list the per-100 bond, and still list a genuine mismatch", () => {
    const insights = (hs: Holding[]) =>
      generateInsights({ holdings: normalizeHoldings(hs, [], "USD"), reportingCurrency: "USD" }).filter((i) => /Quantity × price/.test(i.title));
    expect(insights([SHARE, BOND])).toEqual([]);
    const bad = insights([SHARE, { ...BOND, nativeMarketValue: 200_000 }]);
    expect(bad).toHaveLength(1);
    expect(bad[0].relatedHoldingIds).toEqual(["h_bond"]);
  });

  it("the import's own check keeps its results (shared convention, its 5% tolerance)", () => {
    const row = { symbol: "SYN", quantity: 250_000, price: 100.42, marketValue: 251_050, currency: "USD", warnings: [] };
    expect(detectStatementWarnings(row as never).some((i) => i.code === "QUANTITY_VALUE_MISMATCH")).toBe(false);
    expect(detectStatementWarnings({ ...row, marketValue: 180_000 } as never).some((i) => i.code === "QUANTITY_VALUE_MISMATCH")).toBe(true);
    expect(detectStatementWarnings({ ...row, quantity: 1_000, price: 150, marketValue: 150_000 } as never).some((i) => i.code === "QUANTITY_VALUE_MISMATCH")).toBe(false);
  });
});
