import type { Account, AssetClass, ExtractedHolding, ExtractionResult, Holding, SourceDocument, SourceType } from "@/domain/types";
import { safeId, todayIso } from "@/utils/formatting";

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
      const asOf = eh.valuationDate ?? ea.statementDate ?? result.asOfDate ?? now.slice(0, 10);
      const value = eh.marketValue ?? (eh.quantity ?? 0) * (eh.price ?? 0);
      holdings.push({
        id: safeId("h"),
        accountId,
        assetName: eh.assetName ?? eh.symbol ?? "Unnamed asset",
        identifier: eh.identifier,
        assetType: eh.assetType,
        assetClass: eh.assetClass ?? fallbackAssetClass(eh),
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
        advisorNotes: warnings(eh, opts.reportingCurrency).map((w) => w.message).join(" ") || undefined,
        dataQuality: warnings(eh, opts.reportingCurrency),
        advisorVerification: "unverified",
        sourceTrace: { ...eh.sourceTrace, sourceDocumentId: sourceDocument.id },
        createdAt: now,
        updatedAt: now,
      });
    }
  }
  return { clientName: result.clientNameDetected, accounts, holdings, sourceDocument };
}

// A row with a ticker and a share count is almost always a listed security;
// a bare balance (a plan's "Brokerage account") stays unclassified until the
// advisor says what's in it.
function fallbackAssetClass(eh: ExtractedHolding): AssetClass {
  return eh.symbol && eh.quantity != null ? "equity" : "custom";
}

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
