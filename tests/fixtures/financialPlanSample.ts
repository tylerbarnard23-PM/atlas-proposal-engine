import type { PdfText } from "@/ingestion/pdf/layoutLines";

// A synthetic financial plan in the layout of planning-software reports
// (cover, Resource Summary, a Balance Sheet that continues onto a second page
// without repeating its ASSETS heading, stated totals, liabilities). Written
// from scratch: fictional people and numbers, no third-party text. Lines are
// what the layout reader produces (columns separated by two spaces).

const footer = (page: number) => [
  "See the disclosure section for assumptions and limitations.",
  "Prepared for : Jordan Example  Prepared by : Alex Planner",
  `05/31/2026  Page ${page} of 60`,
];

export const PLAN_PAGES: string[][] = [
  ["Jordan Example", "May 31, 2026", "Example Wealth Planning Financial Plan", "Prepared by:", "Alex Planner"],
  ["Table Of Contents", "Resource Summary 10 - 11", "Balance Sheet 24 - 25", "Monte Carlo Analysis 42 - 43"],
  [
    "Profile",
    "Retirement Age:  65",
    "Life Expectancy:  90",
    "Employment Income:  $250,000",
    ...footer(8),
  ],
  [
    "Resource Summary",
    "Investment Assets",
    "Description Owner Account Type Current Value As Of Date  Additions",
    "Taxable Brokerage Jordan Individual $1,250,000 05/15/2026",
    "Everyday Checking Jordan Account $85,000 05/20/2026",
    "Acme Corp 401(k) Jordan 401(k) $640,500 04/30/2026  $23,000",
    "Roth IRA Jordan Roth IRA - $122,400 04/30/2026",
    "Fixed Annuity Jordan Annuity $300,000 03/31/2026",
    "Other Assets",
    "Lake House - Tahoe, CA Jordan $950,000",
    "Collectible - Watch Collection Jordan  $75,000",
    "Liabilities",
    "Home Mortgage Home Mortgage $410,000 Jordan 4.25% $2,900 07/01/2019 ThirtyYears",
    ...footer(10),
  ],
  [
    "BalanceSheet",
    "The Balance Sheet shows the value of your assets, liabilities, and your net worth.",
    "ASSETS  Jordan  Total",
    "Retirement Assets  $762,900",
    "Acme Corp 401(k)  $640,500  $640,500",
    "Roth IRA  $122,400  $122,400",
    "Annuity Assets  $300,000",
    "Fixed Annuity  $300,000  $300,000",
    "Insurance Assets  $40,000",
    "Whole Life  $40,000  $40,000",
    "Investment Assets  $1,335,000",
    "Taxable Brokerage  $1,250,000  $1,250,000",
    "Everyday Checking  $85,000  $85,000",
    "Property  $1,025,000",
    "Lake House - Tahoe, CA  $950,000  $950,000",
    ...footer(24),
  ],
  [
    "BalanceSheet",
    "Property  $1,025,000",
    "Collectible - Watch Collection  $75,000  $75,000",
    "Business Assets  $500,000",
    "Example Ventures LLC  $500,000  $500,000",
    "Total Assets  $3,962,900  $3,962,900",
    "LIABILITIES  Jordan  Total",
    "Mortgage  ($410,000)",
    "Home Mortgage  ($410,000)  ($410,000)",
    "Note Payable  ($60,000)",
    "Auto Loan  ($60,000)  ($60,000)",
    "Total Liabilities  ($470,000)  ($470,000)",
    "Total Net Worth  $3,492,900  $3,492,900",
    ...footer(25),
  ],
];

export const PLAN_PDF: PdfText = { pageCount: PLAN_PAGES.length, pages: PLAN_PAGES };

export const PLAN_EXPECTED = {
  clientName: "Jordan Example",
  asOfDate: "2026-05-31",
  assets: 3_962_900,
  liabilities: -470_000,
  netWorth: 3_492_900,
  lines: [
    { name: "Acme Corp 401(k)", value: 640_500, assetClass: "custom", accountType: "401k", asOf: "2026-04-30" },
    { name: "Roth IRA", value: 122_400, assetClass: "custom", accountType: "ira_roth", asOf: "2026-04-30" },
    { name: "Fixed Annuity", value: 300_000, assetClass: "insurance", accountType: "annuity_account", asOf: "2026-03-31" },
    { name: "Whole Life", value: 40_000, assetClass: "insurance", accountType: "insurance_policy_account" },
    { name: "Taxable Brokerage", value: 1_250_000, assetClass: "custom", accountType: "brokerage", asOf: "2026-05-15" },
    { name: "Everyday Checking", value: 85_000, assetClass: "cash", accountType: "bank_checking", asOf: "2026-05-20" },
    { name: "Lake House - Tahoe, CA", value: 950_000, assetClass: "real_estate", accountType: "real_estate_portfolio" },
    { name: "Collectible - Watch Collection", value: 75_000, assetClass: "collectible", accountType: "custom" },
    { name: "Example Ventures LLC", value: 500_000, assetClass: "business", accountType: "business_ownership" },
    { name: "Home Mortgage", value: -410_000, assetClass: "liability", accountType: "liability_account" },
    { name: "Auto Loan", value: -60_000, assetClass: "liability", accountType: "liability_account" },
  ],
} as const;
