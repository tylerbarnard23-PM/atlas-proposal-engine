import type { AccountType } from "./types";

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  brokerage: "Taxable Brokerage",
  ira_traditional: "IRA — Traditional",
  ira_roth: "IRA — Roth",
  "401k": "401(k)",
  pension: "Pension",
  trust: "Trust",
  joint: "Joint",
  individual: "Individual",
  bank_checking: "Bank — Checking",
  bank_savings: "Bank — Savings",
  custodial: "Custodial",
  corporate: "Corporate",
  foundation: "Foundation",
  endowment: "Endowment",
  insurance_policy_account: "Insurance Policy",
  annuity_account: "Annuity",
  crypto_wallet: "Crypto Wallet",
  real_estate_portfolio: "Real Estate Portfolio",
  private_equity_account: "Private Equity",
  private_credit_account: "Private Credit",
  hedge_fund_account: "Hedge Fund",
  business_ownership: "Business Ownership",
  liability_account: "Liability",
  custom: "Custom",
};

export const ACCOUNT_TYPE_GROUPS: { label: string; types: AccountType[] }[] = [
  {
    label: "Investment",
    types: ["brokerage", "ira_traditional", "ira_roth", "401k", "pension", "individual", "joint", "trust", "custodial", "corporate", "foundation", "endowment"],
  },
  {
    label: "Banking",
    types: ["bank_checking", "bank_savings"],
  },
  {
    label: "Alternative",
    types: ["crypto_wallet", "real_estate_portfolio", "private_equity_account", "private_credit_account", "hedge_fund_account", "business_ownership"],
  },
  {
    label: "Insurance & Annuity",
    types: ["insurance_policy_account", "annuity_account"],
  },
  {
    label: "Liabilities",
    types: ["liability_account"],
  },
  { label: "Other", types: ["custom"] },
];
