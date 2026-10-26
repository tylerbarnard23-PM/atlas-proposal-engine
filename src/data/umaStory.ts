import type { Account, AssetClass, Holding, ModelRevision, StrategyRevision } from "@/domain/types";

// D2a synthetic acceptance fixtures (MODEL_AND_MANAGER_PROPOSALS.md). A
// separate USD 100,000 supported account, so the D1/D2 60/30/10 story stays
// as it is. The managers, strategies and models are invented examples, not
// verified offerings; minimums, fees and mixes are illustrative inputs.

const CREATED = "2026-10-26T00:00:00Z";
const STATEMENT = "2026-09-30";

export const UMA_ACCOUNT: Account = {
  id: "acc_uma_story",
  name: "Managed Account Story (synthetic)",
  type: "brokerage",
  baseCurrency: "USD",
  country: "US",
  asOf: STATEMENT,
  createdAt: CREATED,
  updatedAt: CREATED,
};

export const UMA_CASH: Holding = {
  id: "h_uma_cash",
  accountId: UMA_ACCOUNT.id,
  assetName: "Cash awaiting allocation",
  assetType: "cash",
  assetClass: "cash",
  country: "US",
  currency: "USD",
  nativeMarketValue: 100_000,
  liquidity: "cash",
  valuationDate: STATEMENT,
  valuationSource: { kind: "statement", asOf: STATEMENT, confidence: "high", note: "Synthetic D2a story" },
  quoteType: "manual",
  priceFreshness: "manual",
  dataQuality: [],
  advisorVerification: "advisor_reviewed",
  createdAt: CREATED,
  updatedAt: CREATED,
};

const mix = (weights: Partial<Record<AssetClass, number>>) => ({ weights, source: "Synthetic example (advisor-entered)", asOf: STATEMENT });

export const UMA_STRATEGIES: StrategyRevision[] = [
  {
    id: "str_equity_a",
    revision: 1,
    manager: "Equity Manager A",
    name: "Core Equity",
    strategyType: "Separately managed account",
    currency: "USD",
    minimum: 25_000,
    fees: [{ kind: "manager", rateBps: 45, basis: "assets in the sleeve" }],
    mix: mix({ equity: 100 }),
    provenance: "synthetic",
    createdAt: CREATED,
  },
  {
    id: "str_fixed_b",
    revision: 1,
    manager: "Fixed Income Manager B",
    name: "Core Bond",
    strategyType: "Separately managed account",
    currency: "USD",
    minimum: 25_000,
    fees: [{ kind: "manager", rateBps: 30, basis: "assets in the sleeve" }],
    mix: mix({ fixed_income: 100 }),
    provenance: "synthetic",
    createdAt: CREATED,
  },
  {
    id: "str_etf_c",
    revision: 1,
    manager: "ETF Model C",
    name: "Balanced ETF Model",
    strategyType: "ETF model",
    currency: "USD",
    // Not supplied: needs the advisor's recorded review before a final PDF.
    minimum: null,
    fees: [
      { kind: "platform", rateBps: 10, basis: "assets in the sleeve" },
      { kind: "instrument", rateBps: 8, basis: "underlying ETF assets" },
    ],
    mix: mix({ equity: 50, fixed_income: 50 }),
    provenance: "synthetic",
    createdAt: CREATED,
  },
];

export const UMA_STRATEGY_MODEL: ModelRevision = {
  id: "mdl_uma_core",
  revision: 1,
  name: "Core managed allocation (synthetic)",
  kind: "strategy",
  strategyWeights: [
    { strategyId: "str_equity_a", strategyRevision: 1, weight: 40 },
    { strategyId: "str_fixed_b", strategyRevision: 1, weight: 35 },
    { strategyId: "str_etf_c", strategyRevision: 1, weight: 20 },
  ],
  cashWeight: 5,
  provenance: "synthetic",
  createdAt: CREATED,
};

export const BALANCED_MODEL: ModelRevision = {
  id: "mdl_balanced",
  revision: 1,
  name: "Balanced asset-class model (synthetic)",
  kind: "asset_class",
  assetWeights: { equity: 60, fixed_income: 35, cash: 5 },
  provenance: "synthetic",
  createdAt: CREATED,
};

export const UMA_MODELS: ModelRevision[] = [UMA_STRATEGY_MODEL, BALANCED_MODEL];
