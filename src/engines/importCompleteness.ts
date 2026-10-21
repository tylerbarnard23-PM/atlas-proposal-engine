import type { CurrencyCode, Holding, ImportCompleteness, SourceDocument } from "@/domain/types";

// Whether an imported document was imported completely. A PDF whose rows
// don't add up to the total it states, whose total can't be found, or that
// had rows too unclear to import is incomplete (or of unknown completeness).
// The condition is stored with the source document at import time, so it
// survives reloads, and it's a property of the document, not of the rows:
// confirming the rows that did import doesn't make the missing ones appear.

export interface ImportIssue {
  kind: "total_mismatch" | "unreadable_rows" | "no_stated_total";
  documentId: string;
  fileName: string;
  /** The document's own total, and what the imported rows add up to. */
  stated?: number;
  extracted?: number;
  currency?: CurrencyCode;
  /** Rows left out because they couldn't be read (unreadable_rows). */
  rows?: number;
}

// Documents whose completeness can be checked against a stated total.
const TOTALLED_KINDS = new Set(["statement_table", "holdings_report"]);

/** Completeness of a freshly extracted document, recorded on its SourceDocument. */
export function completenessOf(doc: Pick<SourceDocument, "extraction">): ImportCompleteness | undefined {
  const x = doc.extraction;
  if (!x || !x.ok) return undefined;
  const rec = x.reconciliation;
  const unreadableRows = x.accounts.flatMap((a) => a.holdings).filter((h) => h.status === "needs_review" && h.marketValue == null).length;
  const totalled = !!x.documentKind && TOTALLED_KINDS.has(x.documentKind);
  const base = {
    stated: rec?.netWorthStated ?? rec?.assetsStated,
    extracted: rec?.netWorthExtracted,
    currency: rec?.currency,
    unreadableRows,
  };
  if (rec?.status === "mismatch") return { status: "incomplete", reason: "total_mismatch", ...base };
  if (unreadableRows > 0) return { status: "incomplete", reason: "unreadable_rows", ...base };
  if (totalled && rec?.status !== "matched") return { status: "unknown", reason: "no_stated_total", ...base };
  return { status: "complete", ...base };
}

/** The stored condition, or (for documents imported before it was stored) the one derived from the extraction. */
const recorded = (doc: SourceDocument) => doc.importCompleteness ?? completenessOf(doc);

/**
 * Open import issues: documents not imported completely that still have
 * holdings in the workspace. Removing every holding an import produced
 * removes its issue; confirming those holdings doesn't.
 */
export function importIssues(docs: SourceDocument[], holdings: Pick<Holding, "sourceTrace">[]): ImportIssue[] {
  const inUse = new Set(holdings.map((h) => h.sourceTrace?.sourceDocumentId).filter(Boolean));
  const issues: ImportIssue[] = [];
  for (const doc of docs) {
    if (!inUse.has(doc.id)) continue;
    const c = recorded(doc);
    if (!c || c.status === "complete") continue;
    const common = { documentId: doc.id, fileName: doc.fileName, stated: c.stated, extracted: c.extracted, currency: c.currency };
    if (c.reason === "total_mismatch") issues.push({ kind: "total_mismatch", ...common });
    if (c.unreadableRows > 0) issues.push({ kind: "unreadable_rows", ...common, rows: c.unreadableRows });
    if (c.reason === "no_stated_total") issues.push({ kind: "no_stated_total", ...common });
  }
  return issues;
}

/** Ids of holdings that came from a document with an open import issue. */
export function holdingsFromIncompleteImports(docs: SourceDocument[], holdings: Pick<Holding, "id" | "sourceTrace">[]): Set<string> {
  const docIds = new Set(importIssues(docs, holdings).map((i) => i.documentId));
  return new Set(holdings.filter((h) => h.sourceTrace?.sourceDocumentId && docIds.has(h.sourceTrace.sourceDocumentId)).map((h) => h.id));
}

const money = (n: number | undefined, currency?: string) =>
  n === undefined ? "n/a" : `${currency ? `${currency} ` : ""}${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** One line per issue, for readiness details, notices and the Copilot. */
export function describeImportIssue(i: ImportIssue): string {
  switch (i.kind) {
    case "total_mismatch":
      return `${i.fileName}: imported rows add up to ${money(i.extracted, i.currency)} but the document states ${money(i.stated, i.currency)}`;
    case "unreadable_rows":
      return `${i.fileName}: ${i.rows} row${i.rows === 1 ? "" : "s"} couldn't be read and weren't imported`;
    case "no_stated_total":
      return `${i.fileName}: no stated total to check the import against, so completeness is unknown`;
  }
}

/**
 * The part of a source document readiness needs, for sending to the server
 * (the PDF route) without the full extraction.
 */
export function forReadiness(doc: SourceDocument): SourceDocument {
  return { id: doc.id, fileName: doc.fileName, sourceType: doc.sourceType, uploadedAt: doc.uploadedAt, extractionStatus: doc.extractionStatus, importCompleteness: recorded(doc) };
}
