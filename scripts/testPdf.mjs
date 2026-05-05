// Smoke-test: posts a minimal engagement state to the PDF endpoint and writes
// the returned bytes to scripts/out/. Verifies the response is a real PDF.
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const port = process.env.PORT ?? "3030";
const proposalId = "prop_blackwell_test";
const today = new Date().toISOString();

const sections = [
  "executive_summary","client_profile","current_portfolio","proposed_portfolio",
  "recommendations","before_after_allocation","currency_exposure","country_exposure",
  "risk_review","liquidity","fee_analysis","income_analysis","tax_considerations",
  "implementation","data_sources","market_data_sources","assumptions","disclosures",
  "appendix_holdings","appendix_accounts","appendix_market_data",
].map((key) => ({ key, label: key, enabled: true }));

const client = {
  id: "cli_blackwell",
  fullName: "Jonathan & Helena Blackwell",
  householdName: "Blackwell Family Office",
  countryOfResidence: "US",
  taxResidency: "US",
  reportingCountry: "US",
  baseCurrency: "USD",
  proposalOutputCurrency: "USD",
  locale: "en-US",
  riskTolerance: "growth",
  investmentObjective: "Multi-generational capital preservation with measured growth.",
  timeHorizonYears: 25,
  liquidityNeeds: "moderate",
  incomeNeeds: "modest",
  taxSensitivity: "high",
};

const advisor = {
  id: "adv_atlas",
  name: "Margaret S. Whitfield, CFA, CFP®",
  email: "mwhitfield@atlas-advisors.example",
  firmName: "Atlas Private Wealth Advisors",
};

const accounts = [
  { id: "acc_brokerage", name: "Taxable Brokerage", type: "brokerage", institution: "Fidelity", baseCurrency: "USD", country: "US", asOf: "2026-04-30", createdAt: today, updatedAt: today },
  { id: "acc_pe", name: "Cambridge Growth Partners IV — LP", type: "private_equity_account", institution: "CGP", baseCurrency: "USD", country: "US", asOf: "2026-03-31", createdAt: today, updatedAt: today },
];

const holdings = [
  { id: "h_aapl", accountId: "acc_brokerage", assetName: "Apple Inc.", identifier: { type: "ticker", value: "AAPL" }, assetType: "stock", assetClass: "equity", country: "US", currency: "USD", quantity: 4200, price: 224.18, nativeMarketValue: 4200 * 224.18, reportingMarketValue: 4200 * 224.18, valuationDate: "2026-04-30", valuationSource: { kind: "statement", asOf: "2026-04-30", confidence: "high" }, quoteType: "eod", priceFreshness: "eod", advisorVerification: "advisor_reviewed", dataQuality: [], createdAt: today, updatedAt: today },
  { id: "h_msft", accountId: "acc_brokerage", assetName: "Microsoft Corporation", identifier: { type: "ticker", value: "MSFT" }, assetType: "stock", assetClass: "equity", country: "US", currency: "USD", quantity: 1850, price: 462.73, nativeMarketValue: 1850 * 462.73, reportingMarketValue: 1850 * 462.73, valuationDate: "2026-04-30", valuationSource: { kind: "statement", asOf: "2026-04-30", confidence: "high" }, quoteType: "eod", priceFreshness: "eod", advisorVerification: "advisor_reviewed", dataQuality: [], createdAt: today, updatedAt: today },
  { id: "h_pe", accountId: "acc_pe", assetName: "Cambridge Growth Partners IV", identifier: { type: "internal", value: "CGP-IV-019" }, assetType: "private_equity", assetClass: "private_equity", country: "US", currency: "USD", quantity: 1, nativeMarketValue: 2_350_000, reportingMarketValue: 2_350_000, valuationDate: "2026-03-31", valuationSource: { kind: "manual_valuation", asOf: "2026-03-31", confidence: "low", note: "Sponsor-reported NAV" }, quoteType: "manual", priceFreshness: "manual", advisorVerification: "advisor_reviewed", dataQuality: [], createdAt: today, updatedAt: today },
];

const recommendations = [
  { id: "rec_trim_aapl", title: "Trim concentrated Apple position", type: "reduce_concentration", relatedHoldingId: "h_aapl", currency: "USD", rationale: "AAPL exceeds household single-issuer concentration threshold.", clientBenefit: "Lower single-stock risk.", riskTradeoff: "Capital gains realization in taxable account.", priority: "high", status: "approved", includeInPdf: true, approvedByAdvisor: true, createdAt: today, updatedAt: today },
];

const disclosures = [
  { id: "general_risk", category: "general", title: "General Investment Risk", body: "All investments involve risk, including potential loss of principal.", required: true },
  { id: "no_guarantee", category: "no_guarantee", title: "No Guarantee of Outcomes", body: "Recommendations reflect advisor judgment based on currently available information.", required: true },
  { id: "tax_legal", category: "tax_legal", title: "Not Tax, Legal, or Accounting Advice", body: "This proposal does not constitute tax, legal, or accounting advice.", required: true },
  { id: "data_source", category: "data_source", title: "Data Sources", body: "Holdings information sourced from client-provided statements and free-tier providers.", required: true },
  { id: "valuation_disclaimer", category: "valuation", title: "Valuation", body: "Privately held investments are valued using advisor-entered estimates.", required: true },
  { id: "fx_disclaimer", category: "fx", title: "FX Rates", body: "Reference rates only; not transaction rates.", required: true },
  { id: "advisor_approval", category: "advisor_approval", title: "Advisor Approval", body: "Recommendations included have been reviewed and approved by the advisor of record.", required: true },
];

const proposal = {
  id: proposalId,
  clientId: client.id,
  advisorId: advisor.id,
  title: "Blackwell Family Office — 2026 Wealth Proposal",
  outputCurrency: "USD",
  outputCountry: "US",
  createdAt: today,
  updatedAt: today,
  approvalStatus: "draft",
  sections,
  recommendationIds: recommendations.map((r) => r.id),
  assumptionIds: [],
  disclosureIds: disclosures.map((d) => d.id),
  notes: "This proposal restates the household's strategic priorities and identifies advisor-approved actions for the coming quarter.",
};

const body = {
  state: { client, advisor, accounts, holdings, recommendations, sections, disclosures, proposal },
};

const url = `http://127.0.0.1:${port}/api/proposals/${proposalId}/generate-pdf?variant=draft`;
console.log(`POST ${url}`);
const t0 = Date.now();
const res = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const elapsed = Date.now() - t0;
if (!res.ok) {
  console.error(`HTTP ${res.status}`);
  console.error(await res.text());
  process.exit(1);
}
const buf = Buffer.from(await res.arrayBuffer());
const outDir = join(repoRoot, "scripts", "out");
mkdirSync(outDir, { recursive: true });
const filename = res.headers.get("X-Filename") ?? "test-proposal.pdf";
const outPath = join(outDir, filename);
writeFileSync(outPath, buf);
console.log(`Wrote ${buf.length.toLocaleString()} bytes -> ${outPath} (${elapsed} ms)`);
const isPdf = buf.subarray(0, 4).toString("ascii") === "%PDF";
console.log(`PDF magic bytes present: ${isPdf}`);
if (!isPdf) process.exit(1);
