// Atlas Proposal Engine — universal financial domain model.
// This is intentionally exhaustive. Every value in the system traces to a source.

export type CurrencyCode =
  | "USD"
  | "CAD"
  | "GBP"
  | "EUR"
  | "CHF"
  | "JPY"
  | "AUD"
  | "SGD"
  | "HKD"
  | "MXN"
  | string;

export type CountryCode =
  | "US"
  | "CA"
  | "GB"
  | "DE"
  | "FR"
  | "CH"
  | "JP"
  | "AU"
  | "SG"
  | "HK"
  | "MX"
  | string;

export type AssetClass =
  | "equity"
  | "fixed_income"
  | "cash"
  | "commodity"
  | "real_estate"
  | "alternatives"
  | "crypto"
  | "private_equity"
  | "private_credit"
  | "hedge_fund"
  | "venture"
  | "business"
  | "collectible"
  | "insurance"
  | "structured_product"
  | "liability"
  | "custom";

export type SubAssetClass =
  | "us_large_cap"
  | "us_mid_cap"
  | "us_small_cap"
  | "intl_developed"
  | "emerging_markets"
  | "global_equity"
  | "us_treasury"
  | "us_corporate_bond"
  | "us_municipal"
  | "intl_sovereign"
  | "high_yield"
  | "money_market"
  | "cash_equivalents"
  | "gold"
  | "broad_commodity"
  | "direct_real_estate"
  | "reit"
  | "private_equity_fund"
  | "private_credit_fund"
  | "hedge_fund"
  | "venture_capital"
  | "operating_business"
  | "collectible"
  | "btc"
  | "eth"
  | "stablecoin"
  | "crypto_other"
  | "annuity"
  | "life_insurance"
  | "structured_note"
  | "mortgage"
  | "consumer_debt"
  | "business_debt"
  | "custom"
  | "unclassified";

export type AssetType =
  | "stock"
  | "etf"
  | "mutual_fund"
  | "bond"
  | "treasury"
  | "municipal_bond"
  | "corporate_bond"
  | "sovereign_bond"
  | "cd"
  | "cash"
  | "currency"
  | "option"
  | "future"
  | "structured_note"
  | "annuity"
  | "insurance_policy"
  | "crypto"
  | "stablecoin"
  | "commodity"
  | "precious_metal"
  | "real_estate"
  | "reit"
  | "private_equity"
  | "private_credit"
  | "hedge_fund"
  | "venture_investment"
  | "business_equity"
  | "collectible"
  | "loan_receivable"
  | "mortgage_liability"
  | "credit_liability"
  | "custom";

export type IdentifierType =
  | "ticker"
  | "cusip"
  | "isin"
  | "sedol"
  | "figi"
  | "lei"
  | "internal"
  | "wallet_address"
  | "custom"
  | "none";

export interface AssetIdentifier {
  type: IdentifierType;
  value: string;
  exchange?: string;
}

export type AccountType =
  | "brokerage"
  | "ira_traditional"
  | "ira_roth"
  | "401k"
  | "pension"
  | "trust"
  | "joint"
  | "individual"
  | "bank_checking"
  | "bank_savings"
  | "custodial"
  | "corporate"
  | "foundation"
  | "endowment"
  | "insurance_policy_account"
  | "annuity_account"
  | "crypto_wallet"
  | "real_estate_portfolio"
  | "private_equity_account"
  | "private_credit_account"
  | "hedge_fund_account"
  | "business_ownership"
  | "liability_account"
  | "custom";

export type Liquidity = "cash" | "daily" | "weekly" | "monthly" | "quarterly" | "lockup" | "illiquid";

export type AdvisorVerificationStatus =
  | "unverified"
  | "advisor_reviewed"
  | "advisor_approved"
  | "locked_for_proposal"
  | "rejected";

export type QuoteType =
  | "real_time"
  | "delayed"
  | "eod"
  | "reference"
  | "manual"
  | "ocr_extracted"
  | "advisor_entered"
  | "mock";

export type ConfidenceLevel = "high" | "medium" | "low" | "unknown";

export type SourceType =
  | "manual"
  | "csv"
  | "excel"
  | "pdf_text"
  | "pdf_scanned"
  | "image_screenshot"
  | "pasted_text"
  | "ofx_qfx"
  | "api_feed"
  | "custom";

export interface SourceTrace {
  sourceDocumentId?: string;
  sourceType: SourceType;
  page?: number;
  rawText?: string;
  extractionMethod?: string;
  extractionConfidence?: ConfidenceLevel;
  extractedAt?: string;
  extractedFieldName?: string;
}

export interface ValuationSource {
  kind: "statement" | "advisor_entered" | "advisor_override" | "market_data" | "manual_valuation" | "mock";
  providerId?: string;
  providerName?: string;
  asOf?: string;
  confidence?: ConfidenceLevel;
  note?: string;
}

export interface ProposalApprovedValue {
  amount: number;
  currency: CurrencyCode;
  source: ValuationSource;
  lockedAt?: string;
  lockedBy?: string;
}

export interface FxRate {
  base: CurrencyCode;
  quote: CurrencyCode;
  rate: number;
  asOf: string;
  source: "ECB" | "Frankfurter" | "Mock" | "Manual";
  isStale?: boolean;
}

export interface MarketDataResult {
  ok: boolean;
  providerId: string;
  providerName: string;
  identifier: AssetIdentifier;
  price?: number;
  currency?: CurrencyCode;
  asOf?: string;
  quoteType?: QuoteType;
  change?: number;
  changePercent?: number;
  high?: number;
  low?: number;
  open?: number;
  previousClose?: number;
  volume?: number;
  warning?: string;
  isMock?: boolean;
  fetchedAt: string;
  raw?: unknown;
}

export interface MarketDataRequest {
  identifier: AssetIdentifier;
  assetType?: AssetType;
  preferredCurrency?: CurrencyCode;
}

export interface HistoricalDataPoint {
  date: string;
  close: number;
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
}

export interface HistoricalDataResult {
  ok: boolean;
  providerId: string;
  identifier: AssetIdentifier;
  points: HistoricalDataPoint[];
  warning?: string;
}

export interface HistoricalDataRequest {
  identifier: AssetIdentifier;
  range: "1M" | "3M" | "6M" | "1Y" | "3Y" | "5Y" | "MAX";
}

export interface FundamentalsResult {
  ok: boolean;
  providerId: string;
  identifier: AssetIdentifier;
  name?: string;
  sector?: string;
  industry?: string;
  country?: CountryCode;
  marketCap?: number;
  peRatio?: number;
  dividendYield?: number;
  expenseRatio?: number;
  beta?: number;
  asOf?: string;
  warning?: string;
  raw?: unknown;
}

export interface FundamentalsRequest {
  identifier: AssetIdentifier;
}

export interface DataQualityIssue {
  code:
    | "MISSING_IDENTIFIER"
    | "MISSING_ASSET_CLASS"
    | "MISSING_CURRENCY"
    | "MISSING_VALUATION_DATE"
    | "STALE_VALUATION"
    | "MISSING_COST_BASIS"
    | "MISSING_LIQUIDITY"
    | "MISSING_TAX_TREATMENT"
    | "MANUALLY_VALUED"
    | "CUSTOM_REQUIRES_REVIEW"
    | "FX_MISSING_OR_STALE"
    | "SOURCE_NOT_VERIFIED"
    | "LOW_OCR_CONFIDENCE"
    | "STATEMENT_DATE_STALE"
    | "ADVISOR_EDITED_VALUE"
    | "QUANTITY_VALUE_MISMATCH"
    | "MARKET_DATA_UNAVAILABLE"
    | "MARKET_PRICE_STALE"
    | "MOCK_PRICE_USED"
    | "EXTERNAL_PRICE_DIFFERS_MATERIALLY"
    | "ADVISOR_APPROVED_VALUE_MISSING"
    | "DUPLICATE_HOLDING"
    | "LIABILITY_AS_ASSET"
    | "NEGATIVE_VALUE_REVIEW";
  severity: "info" | "warning" | "critical";
  message: string;
  fieldHint?: string;
}

export interface RiskFlag {
  code: string;
  severity: "info" | "warning" | "critical";
  title: string;
  detail: string;
  relatedHoldingIds?: string[];
  relatedAccountIds?: string[];
}

export interface InsightContextValue {
  label: string;
  value: string;
}

export interface Insight {
  id: string;
  category:
    | "concentration"
    | "currency"
    | "country"
    | "liquidity"
    | "fees"
    | "income"
    | "risk"
    | "tax"
    | "data_quality"
    | "valuation"
    | "compliance";
  severity: "info" | "warning" | "critical";
  title: string;
  detail: string;
  relatedHoldingIds?: string[];
  relatedAccountIds?: string[];
  context?: InsightContextValue[];
  /** A "Data to complete" item: which holdings are still open and which are done. */
  task?: { kind: DataTaskKind; openIds: string[]; doneIds: string[] };
  generatedAt: string;
}

export type DataTaskKind = "balance_only" | "missing_identifier" | "stale_value";

export type RecommendationType =
  | "buy"
  | "sell"
  | "hold"
  | "reduce"
  | "increase"
  | "rebalance"
  | "transfer"
  | "consolidate_accounts"
  | "tax_loss_harvest"
  | "improve_asset_location"
  | "currency_hedge"
  | "replace_high_fee_fund"
  | "increase_diversification"
  | "reduce_concentration"
  | "raise_cash"
  | "add_income_strategy"
  | "add_downside_protection"
  | "add_insurance_coverage"
  | "adjust_risk_level"
  | "refinance_liability"
  | "pay_down_debt"
  | "review_private_valuation"
  | "review_source_data"
  | "refresh_market_data"
  | "request_updated_statement"
  | "custom";

export type RecommendationStatus =
  | "draft"
  | "needs_review"
  | "approved"
  | "excluded"
  | "implemented";

export interface Recommendation {
  id: string;
  title: string;
  type: RecommendationType;
  relatedAccountId?: string;
  relatedHoldingId?: string;
  currentValue?: number;
  proposedValue?: number;
  actionAmount?: number;
  actionAmountUnit?: "amount" | "percent";
  currency: CurrencyCode;
  rationale: string;
  clientBenefit?: string;
  riskTradeoff?: string;
  taxNote?: string;
  complianceNote?: string;
  implementationStep?: string;
  priority: "low" | "medium" | "high";
  status: RecommendationStatus;
  includeInPdf: boolean;
  approvedByAdvisor: boolean;
  /** Set when converted from an insight, so the same insight isn't added twice. */
  sourceInsightKey?: string;
  /** Why the advisor rejected it (status "excluded"). */
  rejectionReason?: string;
  rejectedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/** An insight the advisor reviewed and set aside; keyed by insightKey(). */
export interface DismissedInsight {
  key: string;
  title: string;
  reason?: string;
  dismissedAt: string;
}

export interface ComplianceCheck {
  code: string;
  label: string;
  passed: boolean;
  detail?: string;
}

export interface SuitabilityCheck {
  code: string;
  label: string;
  outcome: "ok" | "review" | "fail";
  detail?: string;
}

export interface Assumption {
  id: string;
  label: string;
  value: string;
  category: "fx" | "valuation" | "market_data" | "performance" | "tax" | "general";
  note?: string;
}

export interface Disclosure {
  id: string;
  jurisdiction?: CountryCode | "GLOBAL";
  category:
    | "general"
    | "no_guarantee"
    | "tax_legal"
    | "data_source"
    | "valuation"
    | "market_data"
    | "delayed_quote"
    | "mock_fallback"
    | "fx"
    | "alternatives"
    | "illiquid"
    | "crypto"
    | "cross_border"
    | "advisor_approval"
    | "ocr_extraction"
    | "statement_data"
    | "fees"
    | "conflicts"
    | "not_an_offer"
    | "client_information"
    | "held_away";
  title: string;
  body: string;
  required: boolean;
}

export interface ExtractedField {
  fieldName: string;
  raw: string;
  normalized?: string | number;
  confidence: ConfidenceLevel;
  warning?: string;
}

export interface ExtractedHolding {
  id: string;
  accountHint?: string;
  symbol?: string;
  identifier?: AssetIdentifier;
  assetName?: string;
  quantity?: number;
  price?: number;
  marketValue?: number;
  currency?: CurrencyCode;
  costBasis?: number;
  unrealizedGainLoss?: number;
  yieldPct?: number;
  expenseRatio?: number;
  assetClass?: AssetClass;
  subAssetClass?: SubAssetClass;
  assetType?: AssetType;
  liquidity?: Liquidity;
  // As-of date of this value when the document states one (ISO yyyy-mm-dd).
  valuationDate?: string;
  isLiability?: boolean;
  notes?: string;
  fields: Record<string, ExtractedField>;
  warnings: DataQualityIssue[];
  confidence: ConfidenceLevel;
  sourceTrace: SourceTrace;
  status:
    | "extracted"
    | "needs_review"
    | "advisor_reviewed"
    | "approved"
    | "excluded"
    | "saved_to_proposal";
}

export interface ExtractedAccount {
  id: string;
  accountName?: string;
  accountType?: AccountType;
  institution?: string;
  accountNumberMasked?: string;
  statementDate?: string;
  clientNameDetected?: string;
  currency?: CurrencyCode;
  cashBalance?: number;
  holdings: ExtractedHolding[];
  fields: Record<string, ExtractedField>;
  warnings: DataQualityIssue[];
  confidence: ConfidenceLevel;
}

export interface ExtractionResult {
  ok: boolean;
  accounts: ExtractedAccount[];
  warnings: DataQualityIssue[];
  rawText?: string;
  detectedInstitution?: string;
  extractionMethod: string;
  extractionMs: number;
  // What kind of document this was recognized as (e.g. a financial plan).
  documentKind?: DocumentKind;
  documentTitle?: string;
  clientNameDetected?: string;
  asOfDate?: string;
  pageCount?: number;
  reconciliation?: Reconciliation;
}

export type DocumentKind = "financial_plan_lifeview" | "statement_table" | "generated_proposal";

// Extracted totals checked against the totals the document itself states.
export interface Reconciliation {
  status: "matched" | "mismatch" | "unavailable";
  assetsStated?: number;
  assetsExtracted: number;
  liabilitiesStated?: number;
  liabilitiesExtracted: number;
  netWorthStated?: number;
  netWorthExtracted: number;
  // Differences up to this many currency units count as a match (rounding).
  tolerance: number;
}

export interface SourceDocument {
  id: string;
  fileName: string;
  sourceType: SourceType;
  sizeBytes?: number;
  uploadedAt: string;
  institution?: string;
  accountNumberMasked?: string;
  statementDate?: string;
  extractionStatus:
    | "uploaded"
    | "extracting"
    | "extracted"
    | "needs_review"
    | "market_data_pending"
    | "market_data_enriched"
    | "partially_reviewed"
    | "verified"
    | "saved_to_proposal"
    | "excluded"
    | "failed";
  extractionConfidence?: ConfidenceLevel;
  extractionMethod?: string;
  pageCount?: number;
  notes?: string;
  rawTextSample?: string;
  extraction?: ExtractionResult;
  marketDataEnriched?: boolean;
  advisorVerified?: boolean;
}

export interface Holding {
  id: string;
  accountId: string;
  assetName: string;
  identifier?: AssetIdentifier;
  assetType?: AssetType;
  assetClass: AssetClass;
  subAssetClass?: SubAssetClass;
  country?: CountryCode;
  region?: string;
  currency: CurrencyCode;
  exchange?: string;
  quantity?: number;
  price?: number;
  nativeMarketValue: number;
  // computed display value in proposal output currency, set by engines:
  reportingMarketValue?: number;
  costBasis?: number;
  unrealizedGainLoss?: number;
  incomeYieldPct?: number;
  expenseRatioPct?: number;
  liquidity?: Liquidity;
  valuationDate?: string;
  valuationSource: ValuationSource;
  marketDataSource?: ValuationSource;
  quoteType?: QuoteType;
  priceFreshness?: "live" | "delayed" | "eod" | "stale" | "manual" | "mock";
  riskRating?: "low" | "moderate" | "elevated" | "high";
  taxTreatment?: string;
  restrictions?: string;
  advisorNotes?: string;
  dataQuality: DataQualityIssue[];
  sourceTrace?: SourceTrace;
  advisorVerification: AdvisorVerificationStatus;
  /** Advisor decisions that settle a "Data to complete" item. */
  dataAcks?: {
    /** Keep a balance-only account as one balance (no positions to add). */
    keepAsBalance?: boolean;
    /** Keep the value as of this date; void once the valuation date changes. */
    acceptedValuationDate?: string;
  };
  proposalApprovedValue?: ProposalApprovedValue;
  isLiability?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  institution?: string;
  accountNumberMasked?: string;
  custodian?: string;
  baseCurrency: CurrencyCode;
  country?: CountryCode;
  registration?: string;
  asOf?: string;
  notes?: string;
  isLiabilityAccount?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Household {
  id: string;
  name: string;
  primaryClientId: string;
  memberClientIds: string[];
  reportingCurrency: CurrencyCode;
  reportingCountry: CountryCode;
}

export interface AdvisorProfile {
  id: string;
  name: string;
  email: string;
  firmName: string;
  // Logo as a validated PNG/JPEG/WebP data URL (see domain/branding.ts). Never a
  // remote URL: the PDF renderer would fetch it server-side.
  logoDataUrl?: string;
  // Six-digit hex accent for section labels and highlights in the proposal.
  accentColor?: string;
  phone?: string;
  licenseNumbers?: string[];
  jurisdictions?: CountryCode[];
}

export interface ClientProfile {
  id: string;
  fullName: string;
  preferredName?: string;
  householdName?: string;
  countryOfResidence: CountryCode;
  taxResidency: CountryCode;
  reportingCountry: CountryCode;
  baseCurrency: CurrencyCode;
  proposalOutputCurrency: CurrencyCode;
  locale: string;
  riskTolerance: "conservative" | "moderate" | "growth" | "aggressive";
  investmentObjective: string;
  timeHorizonYears: number;
  liquidityNeeds: "low" | "moderate" | "high";
  incomeNeeds: "none" | "modest" | "significant";
  taxSensitivity: "low" | "moderate" | "high";
  esgPreferences?: string;
  restrictedSecurities?: string[];
  specialInstructions?: string;
  advisorDiscoveryNotes?: string;
}

export type ProposalApprovalStatus =
  | "draft"
  | "in_review"
  | "advisor_approved"
  | "delivered";

export interface ProposalSection {
  key: string;
  label: string;
  enabled: boolean;
  required?: boolean;
}

export interface Proposal {
  id: string;
  clientId: string;
  advisorId: string;
  title: string;
  outputCurrency: CurrencyCode;
  outputCountry: CountryCode;
  createdAt: string;
  updatedAt: string;
  approvalStatus: ProposalApprovalStatus;
  sections: ProposalSection[];
  recommendationIds: string[];
  assumptionIds: string[];
  disclosureIds: string[];
  notes?: string;
}

export interface PdfGenerationJob {
  id: string;
  proposalId: string;
  variant: "draft" | "final";
  startedAt: string;
  completedAt?: string;
  status: "pending" | "running" | "succeeded" | "failed";
  filename?: string;
  errorMessage?: string;
  warnings?: string[];
}

export interface CountryConfig {
  code: CountryCode;
  name: string;
  defaultCurrency: CurrencyCode;
  region: string;
  notes?: string;
  crossBorderReviewSuggested?: boolean;
}

export interface CurrencyConfig {
  code: CurrencyCode;
  symbol: string;
  name: string;
  decimals: number;
  group: "major" | "regional" | "custom";
}
