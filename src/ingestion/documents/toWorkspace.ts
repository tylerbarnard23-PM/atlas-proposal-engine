import type { Account, AssetClass, DataQualityIssue, ExtractedAccount, ExtractedHolding, ExtractionResult, Holding, SourceDocument, SourceType } from "@/domain/types";
import { safeId, todayIso } from "@/utils/formatting";
import { completenessOf } from "@/engines/importCompleteness";
import { detectIdentifierType } from "../normalizers/detectIdentifier";

export interface ImportedWorkspace {
  clientName?: string;
  accounts: Account[];
  holdings: Holding[];
  sourceDocument: SourceDocument;
}

// Converts an extraction into workspace records: one Account per extracted
// account, its holdings, and a SourceDocument for the audit trail. Every
// holding arrives unconfirmed: the advisor confirms each value before it can
// go into a final proposal.
export function extractionToWorkspace(
  result: ExtractionResult,
  opts: {
    fileName: string;
    sizeBytes?: number;
    reportingCurrency: string;
    country?: string;
    sourceType?: SourceType;
    /** Put every holding in this existing account instead of creating accounts. */
    targetAccountId?: string;
  }
): ImportedWorkspace {
  const now = todayIso();
  const sourceDocument: SourceDocument = {
    id: safeId("sd"),
    fileName: opts.fileName,
    sourceType: opts.sourceType ?? "pdf_text",
    sizeBytes: opts.sizeBytes,
    uploadedAt: now,
    statementDate: result.asOfDate,
    extractionStatus: "extracted",
    extractionMethod: result.extractionMethod,
    extractionConfidence: result.reconciliation?.status === "matched" ? "high" : "medium",
    pageCount: result.pageCount,
    extraction: { ...result, rawText: undefined },
  };
  sourceDocument.importCompleteness = completenessOf(sourceDocument);

  const accounts: Account[] = [];
  const holdings: Holding[] = [];
  for (const ea of result.accounts) {
    const isLiabilityAccount = ea.holdings.every((h) => h.isLiability);
    const account: Account = {
      id: safeId("acc"),
      name: ea.accountName ?? "Imported account",
      // A positions export with no recognizable account type is almost always
      // a brokerage account; a plan's balance-sheet line could be anything.
      type: ea.accountType ?? (opts.sourceType === "csv" || opts.sourceType === "excel" ? "brokerage" : "custom"),
      institution: result.detectedInstitution,
      baseCurrency: ea.currency ?? opts.reportingCurrency,
      country: opts.country,
      asOf: ea.statementDate ?? result.asOfDate,
      isLiabilityAccount,
      notes: result.documentKind === "financial_plan_lifeview" ? "Imported from a financial plan's Balance Sheet." : undefined,
      createdAt: now,
      updatedAt: now,
    };
    if (!opts.targetAccountId) accounts.push(account);
    const accountId = opts.targetAccountId ?? account.id;
    for (const eh of ea.holdings) {
      if (eh.status === "excluded") continue;
      // A row whose value couldn't be read is left for the advisor to add by
      // hand, never loaded as a zero or a guessed value.
      if (eh.status === "needs_review" && eh.marketValue == null) continue;
      // #104: unknown stays unknown; the import time is recorded separately (createdAt, uploadedAt).
      const asOf = importedValuationDate(result, ea, eh);
      const value = eh.marketValue ?? (eh.quantity ?? 0) * (eh.price ?? 0);
      const assetClass = importedAssetClass(eh);
      const issues = [
        ...warnings(eh, opts.reportingCurrency),
        ...(asOf ? [] : [UNDATED]),
        ...(isUnclassifiedPosition(eh) ? [UNCLASSIFIED] : []),
      ];
      holdings.push({
        id: safeId("h"),
        accountId,
        assetName: eh.assetName ?? eh.symbol ?? "Unnamed asset",
        identifier: eh.identifier,
        assetType: eh.assetType,
        assetClass,
        subAssetClass: eh.subAssetClass,
        currency: eh.currency ?? opts.reportingCurrency,
        // Plans and statements rarely state a country per line; default to the
        // client's reporting country so exposure reports aren't all "Unknown".
        country: opts.country,
        quantity: eh.quantity,
        price: eh.price,
        nativeMarketValue: eh.isLiability ? -Math.abs(value) : value,
        costBasis: eh.costBasis,
        liquidity: eh.liquidity,
        valuationDate: asOf,
        valuationSource: {
          kind: "statement",
          asOf,
          confidence: eh.confidence,
          note: eh.notes ?? `From ${opts.fileName}`,
        },
        quoteType: "manual",
        priceFreshness: "manual",
        isLiability: eh.isLiability,
        advisorNotes: issues.map((w) => w.message).join(" ") || undefined,
        dataQuality: issues,
        advisorVerification: "unverified",
        sourceTrace: { ...eh.sourceTrace, sourceDocumentId: sourceDocument.id },
        createdAt: now,
        updatedAt: now,
      });
    }
  }
  return { clientName: result.clientNameDetected, accounts, holdings, sourceDocument };
}

/**
 * The date an imported value is as of: the row's own date, else its
 * account's statement date, else the document's. Never the import day (#104):
 * with none stated it's undefined, and the holding is flagged for review.
 * The import preview shows the same date.
 */
export function importedValuationDate(result: Pick<ExtractionResult, "asOfDate">, ea: Pick<ExtractedAccount, "statementDate">, eh: Pick<ExtractedHolding, "valuationDate">): string | undefined {
  return eh.valuationDate ?? ea.statementDate ?? result.asOfDate;
}

/** The asset class an imported row is saved with; the import preview shows the same one (#105). */
export function importedAssetClass(eh: ExtractedHolding): AssetClass {
  return eh.assetClass ?? fallbackAssetClass(eh);
}

// A row with a ticker and a share count is almost always a listed share.
// Nothing else is assumed (#105): a CUSIP, ISIN or SEDOL identifies bonds and
// shares alike, and a price per 100 of face value is a bond's, not a share's,
// so without a word that says what the row is it stays unclassified. A bare
// balance (a plan's "Brokerage account") stays unclassified too, until the
// advisor says what's in it.
function fallbackAssetClass(eh: ExtractedHolding): AssetClass {
  const ticker = !!eh.symbol && detectIdentifierType(eh.symbol) === "ticker";
  return ticker && eh.quantity != null && !pricedPer100(eh) ? "equity" : "custom";
}

// Quantity × price matches the value only after dividing by 100 (face value
// priced per 100, as bonds are).
function pricedPer100(eh: ExtractedHolding): boolean {
  if (eh.quantity == null || eh.price == null || eh.marketValue == null) return false;
  const off = (gross: number) => Math.abs(gross - eh.marketValue!) / Math.max(1, Math.abs(eh.marketValue!));
  return off(eh.quantity * eh.price) > 0.02 && off((eh.quantity * eh.price) / 100) <= 0.02;
}

/** A security position (identifier or units) whose class the document doesn't state, as opposed to a single balance. */
export function isUnclassifiedPosition(eh: ExtractedHolding): boolean {
  return !eh.assetClass && importedAssetClass(eh) === "custom" && (!!eh.symbol || !!eh.identifier || eh.quantity != null);
}

const UNDATED: DataQualityIssue = {
  code: "MISSING_VALUATION_DATE",
  severity: "warning",
  message: "The document gives no date for this value, so it has none: check its date against the document.",
};

const UNCLASSIFIED: DataQualityIssue = {
  code: "MISSING_ASSET_CLASS",
  severity: "warning",
  message:
    "The document doesn't say what kind of investment this is (an identifier such as a CUSIP, or a price per 100 of face value, fits a bond or a share), so it's left unclassified rather than guessed. Check it against the document.",
};

// The currency falls back to the reporting currency, so say that rather than
// "not detected".
function warnings(eh: ExtractedHolding, reportingCurrency: string) {
  if (eh.currency) return eh.warnings;
  return eh.warnings.map((w) =>
    w.code === "MISSING_CURRENCY"
      ? { ...w, severity: "info" as const, message: `Currency not in the file; assumed ${reportingCurrency}.` }
      : w
  );
}
