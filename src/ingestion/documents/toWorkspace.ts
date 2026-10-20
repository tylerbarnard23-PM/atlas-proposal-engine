import type { Account, ExtractionResult, Holding, SourceDocument } from "@/domain/types";
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
  opts: { fileName: string; sizeBytes?: number; reportingCurrency: string; country?: string }
): ImportedWorkspace {
  const now = todayIso();
  const sourceDocument: SourceDocument = {
    id: safeId("sd"),
    fileName: opts.fileName,
    sourceType: "pdf_text",
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
      type: ea.accountType ?? "custom",
      institution: result.detectedInstitution,
      baseCurrency: ea.currency ?? opts.reportingCurrency,
      country: opts.country,
      asOf: ea.statementDate ?? result.asOfDate,
      isLiabilityAccount,
      notes: result.documentKind === "financial_plan_lifeview" ? "Imported from a financial plan's Balance Sheet." : undefined,
      createdAt: now,
      updatedAt: now,
    };
    accounts.push(account);
    for (const eh of ea.holdings) {
      if (eh.status === "excluded") continue;
      const asOf = eh.valuationDate ?? ea.statementDate ?? result.asOfDate ?? now.slice(0, 10);
      const value = eh.marketValue ?? (eh.quantity ?? 0) * (eh.price ?? 0);
      holdings.push({
        id: safeId("h"),
        accountId: account.id,
        assetName: eh.assetName ?? eh.symbol ?? "Unnamed asset",
        identifier: eh.identifier,
        assetType: eh.assetType,
        assetClass: eh.assetClass ?? "custom",
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
        advisorNotes: eh.warnings.map((w) => w.message).join(" ") || undefined,
        dataQuality: eh.warnings,
        advisorVerification: "unverified",
        sourceTrace: { ...eh.sourceTrace, sourceDocumentId: sourceDocument.id },
        createdAt: now,
        updatedAt: now,
      });
    }
  }
  return { clientName: result.clientNameDetected, accounts, holdings, sourceDocument };
}
