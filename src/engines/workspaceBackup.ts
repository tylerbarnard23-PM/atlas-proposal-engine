import { z } from "zod";
import type { AdvisorProfile, Disclosure, Holding, SourceDocument } from "@/domain/types";
import { checkLogoDataUrl, isValidAccentColor } from "@/domain/branding";
import { normalizeHoldings } from "./normalizationEngine";
import { valuationSummary } from "./valuationTotals";
import { fxFreshness } from "./fxPolicy";
import { completenessOf } from "./importCompleteness";
import { localCalendarDay } from "@/utils/formatting";

// Workspace backup and restore (R23a, #55)
// ----------------------------------------
// A versioned, browser-local file of the current engagement. Export writes an
// explicit allowlist of supported fields; restore validates the whole file
// (size, version, types, enums, values, unique IDs, references) before
// anything is written, previews it, and replaces the workspace only when the
// advisor confirms. The file is NOT encrypted: it is for the synthetic demo;
// real client data needs the protections in #59 first.
//
// Ownership: everything under `engagement` belongs to this client. `firm`
// (the advisor profile and branding) is shared and is kept on restore unless
// the advisor explicitly chooses the backup's.

export const BACKUP_FORMAT = "atlas-workspace-backup";
export const BACKUP_SCHEMA_VERSION = 1;
/** The saved-workspace schema (store version) the records follow. */
export const BACKUP_WORKSPACE_VERSION = 6;
export const BACKUP_MAX_BYTES = 5 * 1024 * 1024;

export const BACKUP_NOTICE =
  "Not encrypted: this file holds the engagement's client and portfolio data in plain text. Use it with synthetic (demo) data only; real client data needs encrypted storage and the other protections in issue #59 first.";

export const BACKUP_OMISSIONS = [
  "Original source files (PDF, CSV and other uploads) are not included: Atlas never stores them. Each document's name, dates, completeness and reconciliation are kept.",
  "Extracted rows and raw text of imported documents (Statement Workbench row review) are not included. The imported holdings, with their own source trace, are.",
  "The market-data quote cache is not included; refresh it in Market Data. Holdings keep their own market-data source.",
  "Generated insights are not included; they're recalculated.",
  "The disclosure library comes from the app, not the file; the proposal's selected disclosures are kept.",
  "Credentials and API keys are never part of a workspace or a backup.",
];

// ---------------------------------------------------------------------------
// Schemas. One definition per record serves both directions: strict for
// restore (unknown fields are rejected), and as the export allowlist.
// ---------------------------------------------------------------------------

const text = (max = 20_000) => z.string().max(max);
const id = z.string().min(1).max(200);
const currency = z.string().regex(/^[A-Z]{3}$/, "Expected a three-letter currency code");
const country = z.string().min(1).max(64);
const finite = z.number().finite();
const date = z.string().max(64).refine((v) => Number.isFinite(Date.parse(v)), "Expected a valid date");
const confidence = z.enum(["high", "medium", "low", "unknown"]);
const sourceType = z.enum(["manual", "csv", "excel", "pdf_text", "pdf_scanned", "image_screenshot", "pasted_text", "ofx_qfx", "api_feed", "custom"]);
const severity = z.enum(["info", "warning", "critical"]);
const assetClass = z.enum([
  "equity", "fixed_income", "cash", "commodity", "real_estate", "alternatives", "crypto", "private_equity", "private_credit",
  "hedge_fund", "venture", "business", "collectible", "insurance", "structured_product", "liability", "custom",
]);
const subAssetClass = z.enum([
  "us_large_cap", "us_mid_cap", "us_small_cap", "intl_developed", "emerging_markets", "global_equity", "us_treasury", "us_corporate_bond",
  "us_municipal", "intl_sovereign", "high_yield", "money_market", "cash_equivalents", "gold", "broad_commodity", "direct_real_estate", "reit",
  "private_equity_fund", "private_credit_fund", "hedge_fund", "venture_capital", "operating_business", "collectible", "btc", "eth",
  "stablecoin", "crypto_other", "annuity", "life_insurance", "structured_note", "mortgage", "consumer_debt", "business_debt", "custom", "unclassified",
]);
const assetType = z.enum([
  "stock", "etf", "mutual_fund", "bond", "treasury", "municipal_bond", "corporate_bond", "sovereign_bond", "cd", "cash", "currency", "option",
  "future", "structured_note", "annuity", "insurance_policy", "crypto", "stablecoin", "commodity", "precious_metal", "real_estate", "reit",
  "private_equity", "private_credit", "hedge_fund", "venture_investment", "business_equity", "collectible", "loan_receivable",
  "mortgage_liability", "credit_liability", "custom",
]);
const accountType = z.enum([
  "brokerage", "ira_traditional", "ira_roth", "401k", "pension", "trust", "joint", "individual", "bank_checking", "bank_savings", "custodial",
  "corporate", "foundation", "endowment", "insurance_policy_account", "annuity_account", "crypto_wallet", "real_estate_portfolio",
  "private_equity_account", "private_credit_account", "hedge_fund_account", "business_ownership", "liability_account", "custom",
]);
const liquidity = z.enum(["cash", "daily", "weekly", "monthly", "quarterly", "lockup", "illiquid"]);
const recommendationType = z.enum([
  "buy", "sell", "hold", "reduce", "increase", "rebalance", "transfer", "consolidate_accounts", "tax_loss_harvest", "improve_asset_location",
  "currency_hedge", "replace_high_fee_fund", "increase_diversification", "reduce_concentration", "raise_cash", "add_income_strategy",
  "add_downside_protection", "add_insurance_coverage", "adjust_risk_level", "refinance_liability", "pay_down_debt", "review_private_valuation",
  "review_source_data", "refresh_market_data", "request_updated_statement", "custom",
]);
const dataQualityCode = z.enum([
  "MISSING_IDENTIFIER", "MISSING_ASSET_CLASS", "MISSING_CURRENCY", "MISSING_VALUATION_DATE", "STALE_VALUATION", "MISSING_COST_BASIS",
  "MISSING_LIQUIDITY", "MISSING_TAX_TREATMENT", "MANUALLY_VALUED", "CUSTOM_REQUIRES_REVIEW", "FX_MISSING_OR_STALE", "SOURCE_NOT_VERIFIED",
  "LOW_OCR_CONFIDENCE", "STATEMENT_DATE_STALE", "ADVISOR_EDITED_VALUE", "QUANTITY_VALUE_MISMATCH", "MARKET_DATA_UNAVAILABLE",
  "MARKET_PRICE_STALE", "MOCK_PRICE_USED", "EXTERNAL_PRICE_DIFFERS_MATERIALLY", "ADVISOR_APPROVED_VALUE_MISSING", "DUPLICATE_HOLDING",
  "LIABILITY_AS_ASSET", "NEGATIVE_VALUE_REVIEW", "DOCUMENT_TOTAL_MISMATCH",
]);

function schemas(strict: boolean) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const obj = <T extends z.ZodRawShape>(shape: T) => (strict ? z.object(shape).strict() : z.object(shape));

  const identifier = obj({
    type: z.enum(["ticker", "cusip", "isin", "sedol", "figi", "lei", "internal", "wallet_address", "custom", "none"]),
    value: text(500),
    exchange: text(100).optional(),
  });
  const sourceTrace = obj({
    sourceDocumentId: id.optional(),
    sourceType,
    page: z.number().int().nonnegative().optional(),
    rawText: text().optional(),
    extractionMethod: text(200).optional(),
    extractionConfidence: confidence.optional(),
    extractedAt: date.optional(),
    extractedFieldName: text(200).optional(),
  });
  const valuationSource = obj({
    kind: z.enum(["statement", "advisor_entered", "advisor_override", "market_data", "manual_valuation", "mock"]),
    providerId: text(200).optional(),
    providerName: text(200).optional(),
    asOf: date.optional(),
    confidence: confidence.optional(),
    note: text().optional(),
  });
  const dataQualityIssue = obj({ code: dataQualityCode, severity, message: text(), fieldHint: text(200).optional() });
  const holding = obj({
    id,
    accountId: id,
    assetName: text(1_000),
    identifier: identifier.optional(),
    assetType: assetType.optional(),
    assetClass,
    subAssetClass: subAssetClass.optional(),
    country: country.optional(),
    region: text(200).optional(),
    currency,
    exchange: text(100).optional(),
    quantity: finite.optional(),
    price: finite.optional(),
    nativeMarketValue: finite,
    costBasis: finite.optional(),
    unrealizedGainLoss: finite.optional(),
    incomeYieldPct: finite.optional(),
    expenseRatioPct: finite.optional(),
    liquidity: liquidity.optional(),
    valuationDate: date.optional(),
    valuationSource,
    marketDataSource: valuationSource.optional(),
    quoteType: z.enum(["real_time", "delayed", "eod", "reference", "manual", "ocr_extracted", "advisor_entered", "mock"]).optional(),
    priceFreshness: z.enum(["live", "delayed", "eod", "stale", "manual", "mock"]).optional(),
    riskRating: z.enum(["low", "moderate", "elevated", "high"]).optional(),
    taxTreatment: text(500).optional(),
    restrictions: text().optional(),
    advisorNotes: text().optional(),
    dataQuality: z.array(dataQualityIssue).max(200),
    sourceTrace: sourceTrace.optional(),
    advisorVerification: z.enum(["unverified", "advisor_reviewed", "advisor_approved", "locked_for_proposal", "rejected"]),
    dataAcks: obj({ keepAsBalance: z.boolean().optional(), acceptedValuationDate: date.optional() }).optional(),
    proposalApprovedValue: obj({ amount: finite, currency, source: valuationSource, lockedAt: date.optional(), lockedBy: text(200).optional() }).optional(),
    isLiability: z.boolean().optional(),
    createdAt: date,
    updatedAt: date,
  });
  const account = obj({
    id,
    name: text(500),
    type: accountType,
    institution: text(500).optional(),
    accountNumberMasked: text(100).optional(),
    custodian: text(500).optional(),
    baseCurrency: currency,
    country: country.optional(),
    registration: text(500).optional(),
    asOf: date.optional(),
    notes: text().optional(),
    isLiabilityAccount: z.boolean().optional(),
    createdAt: date,
    updatedAt: date,
  });
  const client = obj({
    id,
    fullName: text(500),
    preferredName: text(500).optional(),
    householdName: text(500).optional(),
    countryOfResidence: country,
    taxResidency: country,
    reportingCountry: country,
    baseCurrency: currency,
    proposalOutputCurrency: currency,
    locale: text(35),
    riskTolerance: z.enum(["conservative", "moderate", "growth", "aggressive"]),
    investmentObjective: text(),
    timeHorizonYears: finite,
    liquidityNeeds: z.enum(["low", "moderate", "high"]),
    incomeNeeds: z.enum(["none", "modest", "significant"]),
    taxSensitivity: z.enum(["low", "moderate", "high"]),
    esgPreferences: text().optional(),
    restrictedSecurities: z.array(text(200)).max(500).optional(),
    specialInstructions: text().optional(),
    advisorDiscoveryNotes: text().optional(),
  });
  const advisor = obj({
    id,
    name: text(500),
    email: text(500),
    firmName: text(500),
    logoDataUrl: z
      .string()
      .optional()
      .superRefine((v, ctx) => {
        if (v === undefined) return;
        const check = checkLogoDataUrl(v);
        if (!check.ok) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Firm logo: ${check.reason}` });
      }),
    accentColor: z.string().optional().refine((v) => v === undefined || isValidAccentColor(v), "Firm accent color must be a six-digit hex value"),
    phone: text(100).optional(),
    licenseNumbers: z.array(text(200)).max(100).optional(),
    jurisdictions: z.array(country).max(100).optional(),
  });
  const recommendation = obj({
    id,
    title: text(1_000),
    type: recommendationType,
    relatedAccountId: id.optional(),
    relatedHoldingId: id.optional(),
    currentValue: finite.optional(),
    proposedValue: finite.optional(),
    actionAmount: finite.optional(),
    actionAmountUnit: z.enum(["amount", "percent"]).optional(),
    currency,
    currencyReview: obj({
      legacyLabel: currency,
      calculatedIn: currency,
      status: z.enum(["open", "kept", "changed"]),
      migratedAt: date,
      resolvedAt: date.optional(),
    }).optional(),
    rationale: text(),
    clientBenefit: text().optional(),
    riskTradeoff: text().optional(),
    taxNote: text().optional(),
    complianceNote: text().optional(),
    implementationStep: text().optional(),
    priority: z.enum(["low", "medium", "high"]),
    status: z.enum(["draft", "needs_review", "approved", "excluded", "implemented"]),
    includeInPdf: z.boolean(),
    approvedByAdvisor: z.boolean(),
    sourceInsightKey: text(500).optional(),
    rejectionReason: text().optional(),
    rejectedAt: date.optional(),
    createdAt: date,
    updatedAt: date,
  });
  const fxRate = obj({
    base: currency,
    quote: currency,
    rate: finite.positive(),
    asOf: date,
    source: z.enum(["ECB", "Frankfurter", "Mock", "Manual"]),
    refreshedAt: date.optional(),
    notInLastRefresh: z.boolean().optional(),
  });
  const fxRefresh = obj({
    at: date,
    ok: z.boolean(),
    provider: text(200),
    error: text(2_000).optional(),
    requested: z.array(currency).max(500),
    updated: z.array(text(20)).max(500),
    retained: z.array(text(20)).max(500),
    manualKept: z.array(text(20)).max(500),
  });
  // A record, re-evaluated against its fingerprint and lifetime after restore
  // (engines/fxPolicy); the times are checked there, not trusted here.
  const fxConfirmation = obj({
    confirmedAt: text(64),
    expiresAt: text(64),
    pairs: z.array(text(20)).max(500),
    oldestRateDate: text(64),
    fingerprint: text(64),
    reportingCurrency: currency,
  });
  const reconciliation = obj({
    status: z.enum(["matched", "mismatch", "unavailable"]),
    assetsStated: finite.optional(),
    assetsExtracted: finite,
    liabilitiesStated: finite.optional(),
    liabilitiesExtracted: finite,
    netWorthStated: finite.optional(),
    netWorthExtracted: finite,
    tolerance: finite,
    currency: currency.optional(),
  });
  // Metadata and an extraction summary only: never the extracted rows, raw
  // text or the file itself.
  const sourceDocument = obj({
    id,
    fileName: text(1_000),
    sourceType,
    sizeBytes: finite.nonnegative().optional(),
    uploadedAt: date,
    institution: text(500).optional(),
    accountNumberMasked: text(100).optional(),
    statementDate: date.optional(),
    extractionStatus: z.enum([
      "uploaded", "extracting", "extracted", "needs_review", "market_data_pending", "market_data_enriched", "partially_reviewed",
      "verified", "saved_to_proposal", "excluded", "failed",
    ]),
    extractionConfidence: confidence.optional(),
    extractionMethod: text(200).optional(),
    pageCount: z.number().int().nonnegative().optional(),
    notes: text().optional(),
    extraction: obj({
      ok: z.boolean(),
      extractionMethod: text(200),
      extractionMs: finite,
      documentKind: z.enum(["financial_plan_lifeview", "statement_table", "holdings_report", "generated_proposal"]).optional(),
      asOfDate: date.optional(),
      pageCount: z.number().int().nonnegative().optional(),
      detectedInstitution: text(500).optional(),
      reconciliation: reconciliation.optional(),
    }).optional(),
    importCompleteness: obj({
      status: z.enum(["complete", "incomplete", "unknown"]),
      reason: z.enum(["total_mismatch", "unreadable_rows", "no_stated_total"]).optional(),
      stated: finite.optional(),
      extracted: finite.optional(),
      currency: currency.optional(),
      unreadableRows: z.number().int().nonnegative(),
    }).optional(),
    marketDataEnriched: z.boolean().optional(),
    advisorVerified: z.boolean().optional(),
  });
  const section = obj({ key: text(100), label: text(200), enabled: z.boolean(), required: z.boolean().optional() });
  const proposal = obj({
    id,
    clientId: id,
    advisorId: id,
    title: text(1_000),
    createdAt: date,
    updatedAt: date,
    approvalStatus: z.enum(["draft", "in_review", "advisor_approved", "delivered"]),
    sections: z.array(section).max(100),
    recommendationIds: z.array(id).max(10_000),
    assumptionIds: z.array(id).max(10_000),
    disclosureIds: z.array(id).max(1_000),
    notes: text().optional(),
  });
  const dismissedInsight = obj({ key: text(500), title: text(1_000), reason: text().optional(), dismissedAt: date });
  const pdfJob = obj({
    id,
    proposalId: id,
    variant: z.enum(["draft", "final"]),
    startedAt: date,
    completedAt: date.optional(),
    status: z.enum(["pending", "running", "succeeded", "failed"]),
    filename: text(500).optional(),
    errorMessage: text(2_000).optional(),
    warnings: z.array(text(2_000)).max(100).optional(),
  });
  const engagement = obj({
    client,
    accounts: z.array(account).max(5_000),
    holdings: z.array(holding).max(50_000),
    recommendations: z.array(recommendation).max(10_000),
    fxRates: z.array(fxRate).max(1_000),
    fxRefresh: fxRefresh.nullable(),
    fxConfirmation: fxConfirmation.nullable(),
    sourceDocuments: z.array(sourceDocument).max(1_000),
    proposal,
    proposalSections: z.array(section).max(100),
    dismissedInsights: z.array(dismissedInsight).max(10_000),
    pdfHistory: z.array(pdfJob).max(100),
  });
  const envelope = obj({
    format: z.literal(BACKUP_FORMAT),
    schemaVersion: z.literal(BACKUP_SCHEMA_VERSION),
    workspaceVersion: z.literal(BACKUP_WORKSPACE_VERSION),
    exportedAt: date,
    notice: text(2_000),
    omitted: z.array(text(2_000)).max(50),
    engagement,
    firm: obj({ advisor }),
  });
  return { envelope, engagement, advisor };
}

const STRICT = schemas(true);
const ALLOW = schemas(false);

export type WorkspaceBackup = z.infer<typeof STRICT.envelope>;
export type BackupEngagement = WorkspaceBackup["engagement"];

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/** Keeps only the fields a schema names, at every depth (the export allowlist). */
function allowlisted(schema: z.ZodTypeAny, value: unknown): unknown {
  if (value === undefined || value === null) return value;
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) return allowlisted(schema.unwrap(), value);
  if (schema instanceof z.ZodEffects) return allowlisted(schema.innerType(), value);
  if (schema instanceof z.ZodArray) return Array.isArray(value) ? value.map((v) => allowlisted(schema.element, v)) : value;
  if (schema instanceof z.ZodObject) {
    if (typeof value !== "object") return value;
    const out: Record<string, unknown> = {};
    for (const [k, s] of Object.entries(schema.shape as Record<string, z.ZodTypeAny>)) {
      const v = (value as Record<string, unknown>)[k];
      if (v !== undefined) out[k] = allowlisted(s, v);
    }
    return out;
  }
  return value;
}

/** What a workspace holds (the store's data, without its actions). */
export interface WorkspaceData {
  client: BackupEngagement["client"];
  advisor: AdvisorProfile;
  accounts: BackupEngagement["accounts"];
  holdings: Holding[];
  fxRates: BackupEngagement["fxRates"];
  recommendations: BackupEngagement["recommendations"];
  sourceDocuments: SourceDocument[];
  proposal: BackupEngagement["proposal"];
  proposalSections: BackupEngagement["proposalSections"];
  dismissedInsights: BackupEngagement["dismissedInsights"];
  pdfHistory: BackupEngagement["pdfHistory"];
  fxRefresh: BackupEngagement["fxRefresh"];
  fxConfirmation: BackupEngagement["fxConfirmation"];
}

/** The backup of a workspace at `now`. */
export function createBackup(state: WorkspaceData, now: Date): WorkspaceBackup {
  const sourceDocuments = state.sourceDocuments.map((d) => ({
    ...d,
    // Frozen here: the restored document has no extracted rows to derive it
    // from, and an incomplete import must keep blocking the final PDF.
    importCompleteness: d.importCompleteness ?? completenessOf(d),
  }));
  const engagement = {
    client: state.client,
    accounts: state.accounts,
    holdings: state.holdings,
    recommendations: state.recommendations,
    fxRates: state.fxRates,
    fxRefresh: state.fxRefresh ?? null,
    fxConfirmation: state.fxConfirmation ?? null,
    sourceDocuments,
    proposal: state.proposal,
    proposalSections: state.proposalSections,
    dismissedInsights: state.dismissedInsights,
    // A running or pending job was orphaned by a closed tab (as in the v2 migration).
    pdfHistory: state.pdfHistory.filter((j) => j.status === "succeeded" || j.status === "failed"),
  };
  return {
    format: BACKUP_FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    workspaceVersion: BACKUP_WORKSPACE_VERSION,
    exportedAt: now.toISOString(),
    notice: BACKUP_NOTICE,
    omitted: BACKUP_OMISSIONS,
    engagement: allowlisted(ALLOW.engagement, engagement) as BackupEngagement,
    firm: { advisor: allowlisted(ALLOW.advisor, state.advisor) as WorkspaceBackup["firm"]["advisor"] },
  };
}

export const serializeBackup = (b: WorkspaceBackup) => JSON.stringify(b, null, 2);

/** A generic name: no client identity, the viewer's local date. */
export const backupFileName = (now: Date = new Date()) => `atlas-workspace-backup-${localCalendarDay(now)}.json`;

// ---------------------------------------------------------------------------
// Restore: validate everything first
// ---------------------------------------------------------------------------

export type ParsedBackup = { ok: true; backup: WorkspaceBackup } | { ok: false; errors: string[] };

const byteLength = (s: string) => new TextEncoder().encode(s).length;

export function parseBackup(text: string, opts: { disclosureIds: string[] }): ParsedBackup {
  if (byteLength(text) > BACKUP_MAX_BYTES) return { ok: false, errors: [`The file is larger than ${BACKUP_MAX_BYTES / 1024 / 1024} MB, so it isn't an Atlas workspace backup.`] };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, errors: ["The file isn't valid JSON, so it can't be an Atlas workspace backup."] };
  }
  const head = raw as Record<string, unknown> | null;
  if (!head || typeof head !== "object" || head.format !== BACKUP_FORMAT) return { ok: false, errors: ["This is not an Atlas workspace backup."] };
  const newer =
    (typeof head.schemaVersion === "number" && head.schemaVersion > BACKUP_SCHEMA_VERSION) ||
    (typeof head.workspaceVersion === "number" && head.workspaceVersion > BACKUP_WORKSPACE_VERSION);
  if (newer) return { ok: false, errors: ["This backup was made by a newer version of Atlas. Nothing was restored."] };
  if (head.schemaVersion !== BACKUP_SCHEMA_VERSION || head.workspaceVersion !== BACKUP_WORKSPACE_VERSION) {
    return { ok: false, errors: [`This backup's version (${String(head.schemaVersion)}/${String(head.workspaceVersion)}) is not supported. Nothing was restored.`] };
  }
  const parsed = STRICT.envelope.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.slice(0, 20).map((i) => `${i.path.join(".") || "file"}: ${i.message}`) };
  }
  const errors = referenceErrors(parsed.data.engagement, new Set(opts.disclosureIds));
  return errors.length > 0 ? { ok: false, errors: errors.slice(0, 20) } : { ok: true, backup: parsed.data };
}

function referenceErrors(e: BackupEngagement, disclosureIds: Set<string>): string[] {
  const errors: string[] = [];
  const unique = (label: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const x of ids) {
      if (seen.has(x)) errors.push(`Duplicate ${label} ${x}.`);
      seen.add(x);
    }
    return seen;
  };
  const accounts = unique("account ID", e.accounts.map((a) => a.id));
  const holdings = unique("holding ID", e.holdings.map((h) => h.id));
  const recs = unique("recommendation ID", e.recommendations.map((r) => r.id));
  const docs = unique("source document ID", e.sourceDocuments.map((d) => d.id));
  unique("PDF job ID", e.pdfHistory.map((j) => j.id));
  unique("dismissed insight", e.dismissedInsights.map((d) => d.key));
  for (const h of e.holdings) {
    if (!accounts.has(h.accountId)) errors.push(`Holding ${h.id} refers to account ${h.accountId}, which isn't in the backup.`);
    const doc = h.sourceTrace?.sourceDocumentId;
    if (doc && !docs.has(doc)) errors.push(`Holding ${h.id} refers to source document ${doc}, which isn't in the backup.`);
  }
  for (const r of e.recommendations) {
    if (r.relatedHoldingId && !holdings.has(r.relatedHoldingId)) errors.push(`Recommendation ${r.id} refers to holding ${r.relatedHoldingId}, which isn't in the backup.`);
    if (r.relatedAccountId && !accounts.has(r.relatedAccountId)) errors.push(`Recommendation ${r.id} refers to account ${r.relatedAccountId}, which isn't in the backup.`);
  }
  const p = e.proposal;
  if (p.clientId !== e.client.id) errors.push(`The proposal belongs to client ${p.clientId}, not the backup's client ${e.client.id}.`);
  for (const r of p.recommendationIds) if (!recs.has(r)) errors.push(`The proposal lists recommendation ${r}, which isn't in the backup.`);
  for (const d of p.disclosureIds) if (!disclosureIds.has(d)) errors.push(`The proposal includes disclosure ${d}, which this version of Atlas doesn't have.`);
  for (const j of e.pdfHistory) if (j.proposalId !== p.id) errors.push(`PDF job ${j.id} belongs to proposal ${j.proposalId}, not this proposal.`);
  return errors;
}

// ---------------------------------------------------------------------------
// Restore: the workspace it becomes, and its preview
// ---------------------------------------------------------------------------

export interface RestoredWorkspace extends WorkspaceData {
  disclosures: Disclosure[];
  insights: [];
  marketDataByIdentifier: Record<string, never>;
}

/**
 * The workspace a validated backup becomes. Firm settings are shared: the
 * current ones are kept (and the proposal linked to them) unless the advisor
 * chose the backup's. The disclosure library is the app's; required
 * disclosures are always in the proposal.
 */
export function restoredState(
  backup: WorkspaceBackup,
  current: { advisor: AdvisorProfile; disclosures: Disclosure[] },
  opts: { replaceFirm: boolean }
): RestoredWorkspace {
  const e = structuredClone(backup.engagement);
  const advisor = opts.replaceFirm ? (structuredClone(backup.firm.advisor) as AdvisorProfile) : current.advisor;
  const disclosureIds = new Set(e.proposal.disclosureIds);
  for (const d of current.disclosures) if (d.required) disclosureIds.add(d.id);
  return {
    client: e.client,
    advisor,
    accounts: e.accounts,
    holdings: e.holdings as Holding[],
    fxRates: e.fxRates,
    recommendations: e.recommendations,
    sourceDocuments: e.sourceDocuments.map((d) => ({ ...d, extraction: d.extraction ? { ...d.extraction, accounts: [], warnings: [] } : undefined })) as SourceDocument[],
    proposal: { ...e.proposal, advisorId: advisor.id, disclosureIds: [...disclosureIds] },
    proposalSections: e.proposalSections,
    dismissedInsights: e.dismissedInsights,
    pdfHistory: e.pdfHistory,
    fxRefresh: e.fxRefresh,
    fxConfirmation: e.fxConfirmation,
    disclosures: current.disclosures,
    insights: [],
    marketDataByIdentifier: {},
  };
}

export interface BackupPreview {
  incoming: {
    clientName: string;
    householdName?: string;
    reportingCurrency: string;
    exportedAt: string;
    accounts: number;
    holdings: number;
    recommendations: number;
    approvedRecommendations: number;
    sourceDocuments: number;
    sourceFilesNotIncluded: string[];
    valuation: ReturnType<typeof valuationSummary>;
    /** The FX confirmation as it stands now (re-evaluated, never renewed). */
    fxConfirmation: "none" | "valid" | "expired" | "changed" | "invalid";
  };
  current: { clientName: string; accounts: number; holdings: number; recommendations: number; sourceDocuments: number; pdfHistory: number };
  firm: { keptFirmName: string; backupFirmName: string; differs: boolean };
  omitted: string[];
}

export function backupPreview(backup: WorkspaceBackup, current: WorkspaceData, now: Date): BackupPreview {
  const e = backup.engagement;
  const reporting = e.client.proposalOutputCurrency;
  const holdings = normalizeHoldings(e.holdings as Holding[], e.fxRates, reporting);
  const fx = fxFreshness({ holdings: e.holdings as Holding[], accounts: e.accounts, recommendations: e.recommendations, fxRates: e.fxRates, reportingCurrency: reporting, confirmation: e.fxConfirmation, now });
  const name = (c: { fullName: string; householdName?: string }) => c.fullName || c.householdName || "Unnamed client";
  return {
    incoming: {
      clientName: name(e.client),
      householdName: e.client.householdName,
      reportingCurrency: reporting,
      exportedAt: backup.exportedAt,
      accounts: e.accounts.length,
      holdings: e.holdings.length,
      recommendations: e.recommendations.length,
      approvedRecommendations: e.recommendations.filter((r) => r.approvedByAdvisor).length,
      sourceDocuments: e.sourceDocuments.length,
      sourceFilesNotIncluded: e.sourceDocuments.map((d) => d.fileName),
      valuation: valuationSummary(holdings),
      fxConfirmation: e.fxConfirmation ? fx.confirmation.state : "none",
    },
    current: {
      clientName: name(current.client),
      accounts: current.accounts.length,
      holdings: current.holdings.length,
      recommendations: current.recommendations.length,
      sourceDocuments: current.sourceDocuments.length,
      pdfHistory: current.pdfHistory.length,
    },
    firm: { keptFirmName: current.advisor.firmName, backupFirmName: backup.firm.advisor.firmName, differs: JSON.stringify(current.advisor) !== JSON.stringify(backup.firm.advisor) },
    omitted: backup.omitted,
  };
}
