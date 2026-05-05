import type { AssetClass, AssetType, SubAssetClass } from "./types";

export const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
  equity: "Equity",
  fixed_income: "Fixed Income",
  cash: "Cash & Equivalents",
  commodity: "Commodity",
  real_estate: "Real Estate",
  alternatives: "Alternatives",
  crypto: "Digital Assets",
  private_equity: "Private Equity",
  private_credit: "Private Credit",
  hedge_fund: "Hedge Fund",
  venture: "Venture",
  business: "Business Interest",
  collectible: "Collectible",
  insurance: "Insurance",
  structured_product: "Structured Product",
  liability: "Liability",
  custom: "Custom Asset",
};

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  stock: "Stock",
  etf: "ETF",
  mutual_fund: "Mutual Fund",
  bond: "Bond",
  treasury: "Treasury",
  municipal_bond: "Municipal Bond",
  corporate_bond: "Corporate Bond",
  sovereign_bond: "Sovereign Bond",
  cd: "Certificate of Deposit",
  cash: "Cash",
  currency: "Currency Position",
  option: "Option",
  future: "Future",
  structured_note: "Structured Note",
  annuity: "Annuity",
  insurance_policy: "Insurance Policy",
  crypto: "Cryptocurrency",
  stablecoin: "Stablecoin",
  commodity: "Commodity",
  precious_metal: "Precious Metal",
  real_estate: "Direct Real Estate",
  reit: "REIT",
  private_equity: "Private Equity",
  private_credit: "Private Credit",
  hedge_fund: "Hedge Fund",
  venture_investment: "Venture Investment",
  business_equity: "Business Equity",
  collectible: "Collectible",
  loan_receivable: "Loan Receivable",
  mortgage_liability: "Mortgage Liability",
  credit_liability: "Credit Liability",
  custom: "Custom",
};

export const SUB_ASSET_CLASS_LABELS: Record<SubAssetClass, string> = {
  us_large_cap: "US Large Cap",
  us_mid_cap: "US Mid Cap",
  us_small_cap: "US Small Cap",
  intl_developed: "International Developed",
  emerging_markets: "Emerging Markets",
  global_equity: "Global Equity",
  us_treasury: "US Treasury",
  us_corporate_bond: "US Corporate Bond",
  us_municipal: "US Municipal",
  intl_sovereign: "International Sovereign",
  high_yield: "High Yield",
  money_market: "Money Market",
  cash_equivalents: "Cash Equivalents",
  gold: "Gold",
  broad_commodity: "Broad Commodity",
  direct_real_estate: "Direct Real Estate",
  reit: "REIT",
  private_equity_fund: "Private Equity Fund",
  private_credit_fund: "Private Credit Fund",
  hedge_fund: "Hedge Fund",
  venture_capital: "Venture Capital",
  operating_business: "Operating Business",
  collectible: "Collectible",
  btc: "Bitcoin",
  eth: "Ethereum",
  stablecoin: "Stablecoin",
  crypto_other: "Crypto Other",
  annuity: "Annuity",
  life_insurance: "Life Insurance",
  structured_note: "Structured Note",
  mortgage: "Mortgage",
  consumer_debt: "Consumer Debt",
  business_debt: "Business Debt",
  custom: "Custom",
  unclassified: "Unclassified",
};

export function classifyAssetByType(type?: AssetType): AssetClass {
  if (!type) return "custom";
  switch (type) {
    case "stock":
    case "etf":
    case "mutual_fund":
      return "equity";
    case "bond":
    case "treasury":
    case "municipal_bond":
    case "corporate_bond":
    case "sovereign_bond":
    case "cd":
      return "fixed_income";
    case "cash":
    case "currency":
      return "cash";
    case "option":
    case "future":
    case "structured_note":
      return "structured_product";
    case "annuity":
    case "insurance_policy":
      return "insurance";
    case "crypto":
    case "stablecoin":
      return "crypto";
    case "commodity":
    case "precious_metal":
      return "commodity";
    case "real_estate":
    case "reit":
      return "real_estate";
    case "private_equity":
      return "private_equity";
    case "private_credit":
      return "private_credit";
    case "hedge_fund":
      return "hedge_fund";
    case "venture_investment":
      return "venture";
    case "business_equity":
      return "business";
    case "collectible":
      return "collectible";
    case "loan_receivable":
      return "fixed_income";
    case "mortgage_liability":
    case "credit_liability":
      return "liability";
    default:
      return "custom";
  }
}
