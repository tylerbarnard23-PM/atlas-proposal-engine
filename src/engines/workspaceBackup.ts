import { z } from "zod";
import type { AdvisorProfile, Disclosure, Holding, Recommendation, SourceDocument, WorkingDraft } from "@/domain/types";
import { checkLogoDataUrl, isValidAccentColor } from "@/domain/branding";
import { normalizeHoldings } from "./normalizationEngine";
import { valuationSummary } from "./valuationTotals";
import { fxFreshness } from "./fxPolicy";
import { completenessOf } from "./importCompleteness";
import { linksNeedingReview, unresolvedFundingOf, unresolvedRecommendationLinks } from "./recommendationLinks";
import { legacyWorkingDraft } from "./allocationDesk";
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
export const BACKUP_WORKSPACE_VERSION = 8;
/** Older workspace versions a backup may have, upgraded on restore. */
export const SUPPORTED_OLDER_WORKSPACE_VERSIONS = [6, 7] as const;
/** The application's backup limit (UTF-8 bytes of the file); it also bounds a file read before validation. */
export const BACKUP_MAX_BYTES = 20 * 1024 * 1024;

export const BACKUP_NOTICE =
  "Not encrypted: this file holds the engagement's client and portfolio data in plain text. Use it with synthetic (demo) data only; real client data needs encrypted storage and the other protections in issue #59 first.";

export const BACKUP_OMISSIONS = [
  "Original source files (PDF, CSV and other uploads) are not included: Atlas never stores them. Each document's name, dates, completeness and reconciliation are kept.",
  "Extracted rows and raw text of imported documents (Statement Workbench row review) are not included. The imported holdings, with their own source trace, are.",
  "The legacy security-quote cache is not included; Atlas no longer uses it. Each holding keeps its own recorded value source and date.",
  "Generated insights are not included; they're recalculated.",
  "The disclosure library comes from the app, not the file; the proposal's selected disclosures are kept.",
  "Credentials and API keys are never part of a workspace or a backup.",
];

// ---------------------------------------------------------------------------
// Schemas. One definition per record serves both directions: strict for
// restore (unknown fields are rejected), and as the export allowlist.
// ---------------------------------------------------------------------------

// Limits match what the app itself permits: free text and lists have no
// per-field cap (the app imposes none), so only the whole file's size bounds
// them. Currency codes, enums and finite numbers are what the app writes.
const text = () => z.string();
const id = z.string().min(1);
const currency = z.string().regex(/^[A-Z]{3}$/, "Expected a three-letter currency code");
const country = z.string().min(1);
const finite = z.number().finite();
/** A timestamp the app generates (toISOString): must be a valid date. */
const date = z.string().refine((v) => Number.isFinite(Date.parse(v)), "Expected a valid date");
/** A calendar date taken from a document or entered by the advisor: kept as given (as the app does). */
const dateText = z.string();
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
    value: text(),
    exchange: text().optional(),
  });
  const sourceTrace = obj({
    sourceDocumentId: id.optional(),
    sourceType,
    page: z.number().int().nonnegative().optional(),
    rawText: text().optional(),
    extractionMethod: text().optional(),
    extractionConfidence: confidence.optional(),
    extractedAt: date.optional(),
    extractedFieldName: text().optional(),
  });
  const valuationSource = obj({
    kind: z.enum(["statement", "advisor_entered", "advisor_override", "market_data", "manual_valuation", "mock"]),
    providerId: text().optional(),
    providerName: text().optional(),
    asOf: dateText.optional(),
    confidence: confidence.optional(),
    note: text().optional(),
  });
  const dataQualityIssue = obj({ code: dataQualityCode, severity, message: text(), fieldHint: text().optional() });
  const holding = obj({
    id,
    accountId: id,
    assetName: text(),
    identifier: identifier.optional(),
    assetType: assetType.optional(),
    assetClass,
    subAssetClass: subAssetClass.optional(),
    country: country.optional(),
    region: text().optional(),
    currency,
    exchange: text().optional(),
    quantity: finite.optional(),
    price: finite.optional(),
    nativeMarketValue: finite,
    costBasis: finite.optional(),
    unrealizedGainLoss: finite.optional(),
    incomeYieldPct: finite.optional(),
    expenseRatioPct: finite.optional(),
    liquidity: liquidity.optional(),
    valuationDate: dateText.optional(),
    valuationSource,
    marketDataSource: valuationSource.optional(),
    quoteType: z.enum(["real_time", "delayed", "eod", "reference", "manual", "ocr_extracted", "advisor_entered", "mock"]).optional(),
    priceFreshness: z.enum(["live", "delayed", "eod", "stale", "manual", "mock"]).optional(),
    riskRating: z.enum(["low", "moderate", "elevated", "high"]).optional(),
    taxTreatment: text().optional(),
    restrictions: text().optional(),
    advisorNotes: text().optional(),
    dataQuality: z.array(dataQualityIssue),
    sourceTrace: sourceTrace.optional(),
    advisorVerification: z.enum(["unverified", "advisor_reviewed", "advisor_approved", "locked_for_proposal", "rejected"]),
    dataAcks: obj({ keepAsBalance: z.boolean().optional(), acceptedValuationDate: dateText.optional() }).optional(),
    proposalApprovedValue: obj({ amount: finite, currency, source: valuationSource, lockedAt: date.optional(), lockedBy: text().optional() }).optional(),
    isLiability: z.boolean().optional(),
    createdAt: date,
    updatedAt: date,
  });
  const account = obj({
    id,
    name: text(),
    type: accountType,
    institution: text().optional(),
    accountNumberMasked: text().optional(),
    custodian: text().optional(),
    baseCurrency: currency,
    country: country.optional(),
    registration: text().optional(),
    asOf: dateText.optional(),
    notes: text().optional(),
    isLiabilityAccount: z.boolean().optional(),
    // v8 (D2): the account's eligible cash and its reserve, in that line's currency.
    funding: obj({ cashHoldingId: id, reserve: finite.min(0) }).optional(),
    createdAt: date,
    updatedAt: date,
  });
  const client = obj({
    id,
    fullName: text(),
    preferredName: text().optional(),
    householdName: text().optional(),
    countryOfResidence: country,
    taxResidency: country,
    reportingCountry: country,
    baseCurrency: currency,
    proposalOutputCurrency: currency,
    locale: text(),
    riskTolerance: z.enum(["conservative", "moderate", "growth", "aggressive"]),
    investmentObjective: text(),
    timeHorizonYears: finite,
    liquidityNeeds: z.enum(["low", "moderate", "high"]),
    incomeNeeds: z.enum(["none", "modest", "significant"]),
    taxSensitivity: z.enum(["low", "moderate", "high"]),
    esgPreferences: text().optional(),
    restrictedSecurities: z.array(text()).optional(),
    specialInstructions: text().optional(),
    advisorDiscoveryNotes: text().optional(),
  });
  const advisor = obj({
    id,
    name: text(),
    email: text(),
    firmName: text(),
    logoDataUrl: z
      .string()
      .optional()
      .superRefine((v, ctx) => {
        if (v === undefined) return;
        const check = checkLogoDataUrl(v);
        if (!check.ok) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Firm logo: ${check.reason}` });
      }),
    accentColor: z.string().optional().refine((v) => v === undefined || isValidAccentColor(v), "Firm accent color must be a six-digit hex value"),
    phone: text().optional(),
    licenseNumbers: z.array(text()).optional(),
    jurisdictions: z.array(country).optional(),
  });
  const recommendation = obj({
    id,
    title: text(),
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
    sourceInsightKey: text().optional(),
    rejectionReason: text().optional(),
    rejectedAt: date.optional(),
    // v8 (D2): a proposed-only investment, and linked-replacement legs.
    destination: obj({ id, name: text(), assetClass, accountId: id, currency }).optional(),
    linked: obj({ groupId: id, legs: z.number().int().min(1) }).optional(),
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
    provider: text(),
    error: text().optional(),
    requested: z.array(currency),
    updated: z.array(text()),
    retained: z.array(text()),
    manualKept: z.array(text()),
  });
  // A record, re-evaluated against its fingerprint and lifetime after restore
  // (engines/fxPolicy); the times are checked there, not trusted here.
  const fxConfirmation = obj({
    confirmedAt: text(),
    expiresAt: text(),
    pairs: z.array(text()),
    oldestRateDate: text(),
    fingerprint: text(),
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
    fileName: text(),
    sourceType,
    sizeBytes: finite.nonnegative().optional(),
    uploadedAt: date,
    institution: text().optional(),
    accountNumberMasked: text().optional(),
    statementDate: dateText.optional(),
    extractionStatus: z.enum([
      "uploaded", "extracting", "extracted", "needs_review", "market_data_pending", "market_data_enriched", "partially_reviewed",
      "verified", "saved_to_proposal", "excluded", "failed",
    ]),
    extractionConfidence: confidence.optional(),
    extractionMethod: text().optional(),
    pageCount: z.number().int().nonnegative().optional(),
    notes: text().optional(),
    extraction: obj({
      ok: z.boolean(),
      extractionMethod: text(),
      extractionMs: finite,
      documentKind: z.enum(["financial_plan_lifeview", "statement_table", "holdings_report", "generated_proposal"]).optional(),
      asOfDate: dateText.optional(),
      pageCount: z.number().int().nonnegative().optional(),
      detectedInstitution: text().optional(),
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
  const section = obj({ key: text(), label: text(), enabled: z.boolean(), required: z.boolean().optional() });
  const proposal = obj({
    id,
    clientId: id,
    advisorId: id,
    title: text(),
    createdAt: date,
    updatedAt: date,
    approvalStatus: z.enum(["draft", "in_review", "advisor_approved", "delivered"]),
    sections: z.array(section),
    recommendationIds: z.array(id),
    assumptionIds: z.array(id),
    disclosureIds: z.array(id),
    notes: text().optional(),
  });
  const dismissedInsight = obj({ key: text(), title: text(), reason: text().optional(), dismissedAt: date });
  const pdfJob = obj({
    id,
    proposalId: id,
    variant: z.enum(["draft", "final"]),
    startedAt: date,
    completedAt: date.optional(),
    status: z.enum(["pending", "running", "succeeded", "failed"]),
    filename: text().optional(),
    errorMessage: text().optional(),
    warnings: z.array(text()).optional(),
  });
  const engagement = obj({
    client,
    accounts: z.array(account),
    holdings: z.array(holding),
    recommendations: z.array(recommendation),
    fxRates: z.array(fxRate),
    fxRefresh: fxRefresh.nullable(),
    fxConfirmation: fxConfirmation.nullable(),
    sourceDocuments: z.array(sourceDocument),
    proposal,
    proposalSections: z.array(section),
    dismissedInsights: z.array(dismissedInsight),
    pdfHistory: z.array(pdfJob),
    // Recommendations whose holding or account was removed (engines/
    // recommendationLinks), recorded so restore can tell them from corruption.
    unresolvedLinks: z.array(obj({ recommendationId: id, holdingId: id.optional(), accountId: id.optional() })),
  });
  // v7 (D1): the working draft. Targets are percentages of the scope.
  const inputValue = obj({ holdingId: id, accountId: id, amount: finite, currency, sourceKind: text(), date: dateText.nullable() });
  const inputRate = obj({ base: currency, quote: currency, rate: finite, asOf: text(), source: text() });
  const workingDraft = obj({
    id,
    name: text(),
    scopeAccountIds: z.array(id).nullable(),
    memberIds: z.array(id),
    targets: z.record(assetClass, finite.min(0).max(100)),
    inputBasis: obj({ recordedAt: date, reportingCurrency: currency, fingerprint: text(), values: z.array(inputValue), rates: z.array(inputRate) }).nullable(),
    createdAt: date,
    updatedAt: date,
  });
  // v8 (D2): inactive alternatives, each a working draft of its own actions.
  const engagementV7 = engagement.extend({ workingDraft });
  // Removed or reclassified eligible cash and removed destination accounts
  // are declared like other removed links, so restore can tell them from corruption.
  const engagementV8 = engagementV7.extend({
    alternatives: z.array(workingDraft),
    unresolvedLinks: z.array(obj({ recommendationId: id, holdingId: id.optional(), accountId: id.optional(), destinationAccountId: id.optional() })),
    unresolvedFunding: z.array(obj({ accountId: id, cashHoldingId: id, reason: z.enum(["removed", "not_cash"]) })),
  });
  const envelopeOf = <E extends z.ZodTypeAny, V extends number>(e: E, version: V) =>
    obj({
      format: z.literal(BACKUP_FORMAT),
      schemaVersion: z.literal(BACKUP_SCHEMA_VERSION),
      workspaceVersion: z.literal(version),
      exportedAt: date,
      notice: text(),
      omitted: z.array(text()),
      engagement: e,
      firm: obj({ advisor }),
    });
  // Older envelopes validate their own records strictly, so a v6/v7 file can't carry v8 fields.
  const accountV7 = account.omit({ funding: true });
  const recommendationV7 = recommendation.omit({ destination: true, linked: true });
  const olderEngagement = engagement.extend({ accounts: z.array(accountV7), recommendations: z.array(recommendationV7) });
  return {
    envelope: envelopeOf(engagementV8, BACKUP_WORKSPACE_VERSION),
    envelopeV7: envelopeOf(olderEngagement.extend({ workingDraft }), 7),
    envelopeV6: envelopeOf(olderEngagement, 6),
    engagement: engagementV8,
    advisor,
  };
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
  workingDraft: WorkingDraft;
  alternatives: WorkingDraft[];
}

/** The backup of a workspace at `now`. */
export function createBackup(state: WorkspaceData, now: Date): WorkspaceBackup {
  const resolvable = (d: WorkingDraft): WorkingDraft => ({
    ...d,
    memberIds: d.memberIds.filter((id) => state.recommendations.some((r) => r.id === id)),
    scopeAccountIds: d.scopeAccountIds?.filter((id) => state.accounts.some((a) => a.id === id)) ?? null,
  });
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
    unresolvedLinks: unresolvedRecommendationLinks(state),
    unresolvedFunding: unresolvedFundingOf(state),
    // Only references that still resolve: a deleted recommendation or account
    // leaves the draft (in the app it is just ignored, so Undo can restore it).
    workingDraft: resolvable(state.workingDraft),
    alternatives: state.alternatives.map(resolvable),
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

/** An import's completeness as readiness sees it (stored, or derived for older imports). */
export const importCompletenessOf = (d: SourceDocument) => d.importCompleteness ?? completenessOf(d);

export type ExportedBackup = { ok: true; text: string; fileName: string; backup: WorkspaceBackup } | { ok: false; errors: string[] };

/**
 * The export contract: the exact text to download, checked by the same
 * validation a restore applies (including its UTF-8 size), so a file Atlas
 * writes can always be restored. Nothing is truncated or dropped to pass;
 * when it can't pass, the reasons say what to change. Never throws.
 */
export function exportBackup(state: WorkspaceData, now: Date, opts: { disclosureIds: string[] }): ExportedBackup {
  let backup: WorkspaceBackup;
  let text: string;
  try {
    backup = createBackup(state, now);
    text = serializeBackup(backup);
  } catch (err) {
    return { ok: false, errors: [`The backup couldn't be created (${(err as Error).message}). Nothing was exported or changed.`] };
  }
  const bytes = byteLength(text);
  if (bytes > BACKUP_MAX_BYTES) {
    return {
      ok: false,
      errors: [
        `The backup would be ${(bytes / 1024 / 1024).toFixed(1)} MB; the limit is ${BACKUP_MAX_BYTES / 1024 / 1024} MB. Shorten very long notes or remove records you no longer need, then export again. Nothing was exported or changed.`,
      ],
    };
  }
  const check = parseBackup(text, opts);
  if (!check.ok) {
    return { ok: false, errors: [...check.errors.map((e) => withRecordName(e, backup)), "Fix these in the workspace, then export again. Nothing was exported or changed."] };
  }
  return { ok: true, text, fileName: backupFileName(now), backup: check.backup };
}

// "engagement.holdings.3.nativeMarketValue: ..." -> names the record, so the advisor can find it.
function withRecordName(error: string, backup: WorkspaceBackup): string {
  const m = /^engagement\.(holdings|accounts|recommendations|sourceDocuments)\.(\d+)\./.exec(error);
  if (!m) return error;
  const list = backup.engagement[m[1] as "holdings"] as unknown as Record<string, unknown>[];
  const rec = list[Number(m[2])];
  const name = (rec?.assetName ?? rec?.name ?? rec?.title ?? rec?.fileName) as string | undefined;
  const kind = ({ holdings: "Holding", accounts: "Account", recommendations: "Recommendation", sourceDocuments: "Source document" } as Record<string, string>)[m[1]];
  return name ? `${kind} "${name}": ${error}` : error;
}

/** Reads and validates a chosen file; never throws (an unreadable file is reported). */
export async function readBackupFile(file: Pick<File, "size" | "name" | "text">, opts: { disclosureIds: string[] }): Promise<ParsedBackup> {
  if (file.size > BACKUP_MAX_BYTES) {
    return { ok: false, errors: [`${file.name} is larger than ${BACKUP_MAX_BYTES / 1024 / 1024} MB, so it isn't an Atlas workspace backup.`] };
  }
  let text: string;
  try {
    text = await file.text();
  } catch (err) {
    return { ok: false, errors: [`${file.name} couldn't be read (${(err as Error).message || "unknown error"}).`] };
  }
  return parseBackup(text, opts);
}

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
  const older = (SUPPORTED_OLDER_WORKSPACE_VERSIONS as readonly unknown[]).includes(head.workspaceVersion);
  if (head.schemaVersion !== BACKUP_SCHEMA_VERSION || (head.workspaceVersion !== BACKUP_WORKSPACE_VERSION && !older)) {
    return { ok: false, errors: [`This backup's version (${String(head.schemaVersion)}/${String(head.workspaceVersion)}) is not supported. Nothing was restored.`] };
  }
  const issues = (e: z.ZodError) => ({ ok: false as const, errors: e.issues.slice(0, 20).map((i) => `${i.path.join(".") || "file"}: ${i.message}`) });
  let backup: WorkspaceBackup;
  if (head.workspaceVersion === 6) {
    // A v6 backup is validated as v6 (unknown fields still rejected), then
    // upgraded like the store's v7 and v8 migrations: its draft holds the
    // approved recommendations in saved order, with no other alternatives.
    // Deterministic: dated by the export.
    const v6 = STRICT.envelopeV6.safeParse(raw);
    if (!v6.success) return issues(v6.error);
    const e = v6.data.engagement;
    backup = { ...v6.data, workspaceVersion: BACKUP_WORKSPACE_VERSION, engagement: { ...e, workingDraft: legacyWorkingDraft(e.recommendations as Recommendation[], v6.data.exportedAt), alternatives: [], unresolvedFunding: [] } } as WorkspaceBackup;
  } else if (head.workspaceVersion === 7) {
    // v7 → v8: no other alternatives, no funding rules or D2 actions yet.
    const v7 = STRICT.envelopeV7.safeParse(raw);
    if (!v7.success) return issues(v7.error);
    backup = { ...v7.data, workspaceVersion: BACKUP_WORKSPACE_VERSION, engagement: { ...v7.data.engagement, alternatives: [], unresolvedFunding: [] } } as WorkspaceBackup;
  } else {
    const parsed = STRICT.envelope.safeParse(raw);
    if (!parsed.success) return issues(parsed.error);
    backup = parsed.data;
  }
  const errors = referenceErrors(backup.engagement, new Set(opts.disclosureIds));
  return errors.length > 0 ? { ok: false, errors: errors.slice(0, 20) } : { ok: true, backup };
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
  // A recommendation's link either resolves or is recorded as unresolved
  // (its holding or account was removed in the app); anything else is corrupt.
  const recorded = new Map(e.unresolvedLinks.map((l) => [l.recommendationId, l]));
  unique("unresolved link for recommendation", e.unresolvedLinks.map((l) => l.recommendationId));
  for (const r of e.recommendations) {
    const l = recorded.get(r.id);
    const holdingMissing = !!r.relatedHoldingId && !holdings.has(r.relatedHoldingId);
    const accountMissing = !!r.relatedAccountId && !accounts.has(r.relatedAccountId);
    const destinationMissing = !!r.destination && !accounts.has(r.destination.accountId);
    if (holdingMissing && l?.holdingId !== r.relatedHoldingId) errors.push(`Recommendation ${r.id} refers to holding ${r.relatedHoldingId}, which isn't in the backup.`);
    if (accountMissing && l?.accountId !== r.relatedAccountId) errors.push(`Recommendation ${r.id} refers to account ${r.relatedAccountId}, which isn't in the backup.`);
    if (destinationMissing && l?.destinationAccountId !== r.destination!.accountId) errors.push(`Recommendation ${r.id} buys into account ${r.destination!.accountId}, which isn't in the backup.`);
    if (
      l &&
      ((l.holdingId && !holdingMissing) ||
        (l.accountId && !accountMissing) ||
        (l.destinationAccountId && !destinationMissing) ||
        (!l.holdingId && !l.accountId && !l.destinationAccountId))
    ) {
      errors.push(`The backup lists recommendation ${r.id}'s link as unresolved, but it isn't.`);
    }
  }
  for (const l of e.unresolvedLinks) if (!recs.has(l.recommendationId)) errors.push(`The backup lists an unresolved link for recommendation ${l.recommendationId}, which isn't in the backup.`);
  const p = e.proposal;
  if (p.clientId !== e.client.id) errors.push(`The proposal belongs to client ${p.clientId}, not the backup's client ${e.client.id}.`);
  for (const r of p.recommendationIds) if (!recs.has(r)) errors.push(`The proposal lists recommendation ${r}, which isn't in the backup.`);
  for (const d of p.disclosureIds) if (!disclosureIds.has(d)) errors.push(`The proposal includes disclosure ${d}, which this version of Atlas doesn't have.`);
  for (const j of e.pdfHistory) if (j.proposalId !== p.id) errors.push(`PDF job ${j.id} belongs to proposal ${j.proposalId}, not this proposal.`);
  const drafts = [e.workingDraft, ...e.alternatives];
  unique("alternative ID", drafts.map((x) => x.id));
  const owner = new Map<string, string>();
  for (const d of drafts) {
    const label = d === e.workingDraft ? "The working draft" : `Alternative ${d.name}`;
    unique(`member of ${d.name}`, d.memberIds);
    for (const m of d.memberIds) {
      if (!recs.has(m)) errors.push(`${label} includes recommendation ${m}, which isn't in the backup.`);
      else if (owner.has(m) && owner.get(m) !== d.id) errors.push(`Recommendation ${m} is in more than one alternative; each alternative's actions are its own.`);
      owner.set(m, d.id);
    }
    for (const a of d.scopeAccountIds ?? []) if (!accounts.has(a)) errors.push(`${label}'s scope includes account ${a}, which isn't in the backup.`);
  }
  // An eligible-cash rule either resolves or is declared unresolved, with the
  // reason the workspace itself gives (removed, or no longer a cash line).
  unique("unresolved funding for account", e.unresolvedFunding.map((f) => f.accountId));
  const declared = new Map(e.unresolvedFunding.map((f) => [f.accountId, f]));
  const actual = new Map(unresolvedFundingOf(e as Parameters<typeof unresolvedFundingOf>[0]).map((f) => [f.accountId, f]));
  for (const [accountId, f] of actual) {
    const d = declared.get(accountId);
    if (!d || d.cashHoldingId !== f.cashHoldingId || d.reason !== f.reason) {
      errors.push(
        f.reason === "removed"
          ? `Account ${accountId}'s eligible cash ${f.cashHoldingId} isn't in the backup.`
          : `Account ${accountId}'s eligible cash ${f.cashHoldingId} isn't a cash line in that account.`
      );
    }
  }
  for (const d of e.unresolvedFunding) if (!actual.has(d.accountId)) errors.push(`The backup lists account ${d.accountId}'s eligible cash as unresolved, but it isn't.`);
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
    workingDraft: e.workingDraft as WorkingDraft,
    alternatives: e.alternatives as WorkingDraft[],
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
    /** Recommendations whose holding or account was removed and that aren't rejected: the final PDF waits for their review. */
    recommendationsNeedingReview: number;
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
      recommendationsNeedingReview: linksNeedingReview({ recommendations: e.recommendations, holdings: e.holdings, accounts: e.accounts }).length,
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
