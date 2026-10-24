import type { Account, Holding } from "@/domain/types";

// The demo-first acceptance story (docs/roadmap/DEMO_DELIVERY_PLAN.md):
// synthetic data only. Household wealth 500,000 = a 400,000 home outside an
// investment account of 100,000 (Equity ETF A 60,000, Bond ETF A 30,000 and
// cash 10,000), each with an explicitly recorded date and classification.

const CREATED = "2026-10-01T12:00:00Z";
const STATEMENT = "2026-09-30";

export const STORY_ACCOUNTS: Account[] = [
  { id: "acc_story_invest", name: "Story — Investment Account", type: "brokerage", baseCurrency: "USD", country: "US", asOf: STATEMENT, createdAt: CREATED, updatedAt: CREATED },
  { id: "acc_story_home", name: "Story — Primary Residence", type: "real_estate_portfolio", baseCurrency: "USD", country: "US", asOf: "2026-06-30", createdAt: CREATED, updatedAt: CREATED },
];

const holding = (h: Pick<Holding, "id" | "accountId" | "assetName" | "assetClass" | "nativeMarketValue" | "valuationDate"> & Partial<Holding>): Holding => ({
  currency: "USD",
  country: "US",
  valuationSource: { kind: h.assetClass === "real_estate" ? "manual_valuation" : "statement", asOf: h.valuationDate, confidence: "high", note: "Synthetic acceptance story" },
  quoteType: "manual",
  priceFreshness: "manual",
  advisorVerification: "advisor_reviewed",
  dataQuality: [],
  createdAt: CREATED,
  updatedAt: CREATED,
  ...h,
});

export const STORY_HOLDINGS: Holding[] = [
  holding({ id: "h_story_equity", accountId: "acc_story_invest", assetName: "Equity ETF A", assetClass: "equity", assetType: "etf", nativeMarketValue: 60_000, valuationDate: STATEMENT, liquidity: "daily" }),
  holding({ id: "h_story_bond", accountId: "acc_story_invest", assetName: "Bond ETF A", assetClass: "fixed_income", assetType: "etf", nativeMarketValue: 30_000, valuationDate: STATEMENT, liquidity: "daily" }),
  holding({ id: "h_story_cash", accountId: "acc_story_invest", assetName: "Cash", assetClass: "cash", assetType: "cash", nativeMarketValue: 10_000, valuationDate: STATEMENT, liquidity: "cash" }),
  holding({ id: "h_story_home", accountId: "acc_story_home", assetName: "Primary residence", assetClass: "real_estate", assetType: "real_estate", nativeMarketValue: 400_000, valuationDate: "2026-06-30", liquidity: "illiquid" }),
];
