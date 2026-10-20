"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, FileUp, Info, Loader2, XCircle } from "lucide-react";
import { useAtlasStore } from "@/store/useStore";
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ACCOUNT_TYPE_LABELS } from "@/domain/accountTaxonomy";
import { ASSET_CLASS_LABELS } from "@/domain/assetTaxonomy";
import type { ExtractionResult, Reconciliation } from "@/domain/types";
import { formatCurrency } from "@/utils/formatting";
import { PdfReadError, readPdfInBrowser } from "@/ingestion/pdf/readPdfBrowser";
import { parseStatementPdf } from "@/ingestion/documents/parseStatementPdf";
import { extractionToWorkspace } from "@/ingestion/documents/toWorkspace";
import { useImportTarget } from "./importTarget";

type State =
  | { step: "idle" }
  | { step: "reading"; page: number; total: number; fileName: string }
  | { step: "done"; result: ExtractionResult; file: File }
  | { step: "error"; message: string };

const KIND_LABEL: Record<string, string> = {
  financial_plan_lifeview: "Financial plan (LifeView-style)",
  statement_table: "Statement (holdings table)",
};

// Reads a PDF in the browser, recognizes the document, reconciles it against
// its own totals, and loads it into the workspace in one step. Nothing is
// uploaded: the 4.5 MB request limit of the hosting platform doesn't apply and
// the file stays on the advisor's machine.
export function PdfImport() {
  const router = useRouter();
  const client = useAtlasStore((s) => s.client);
  const loadImported = useAtlasStore((s) => s.loadImportedEngagement);
  const addImported = useAtlasStore((s) => s.addImportedToEngagement);
  const removeHolding = useAtlasStore((s) => s.removeHolding);
  const target = useImportTarget();
  const [state, setState] = React.useState<State>({ step: "idle" });
  const fileRef = React.useRef<HTMLInputElement>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setState({ step: "reading", page: 0, total: 0, fileName: file.name });
    try {
      const pdf = await readPdfInBrowser(file, (page, total) => setState({ step: "reading", page, total, fileName: file.name }));
      const result = parseStatementPdf(pdf, file.name.replace(/\.pdf$/i, ""));
      setState({ step: "done", result, file });
    } catch (e) {
      setState({ step: "error", message: e instanceof PdfReadError ? e.message : `Couldn't read that PDF: ${(e as Error).message}` });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function load(mode: "new" | "add" | "target") {
    if (state.step !== "done") return;
    const { result, file } = state;
    const imported = extractionToWorkspace(result, {
      fileName: file.name,
      sizeBytes: file.size,
      reportingCurrency: client.proposalOutputCurrency || "USD",
      country: client.reportingCountry,
      targetAccountId: mode === "target" ? target.account?.id : undefined,
    });
    if (mode === "target") {
      // A statement's positions replace the account's single imported balance.
      addImported(imported);
      if (target.replace && imported.holdings.length > 0) removeHolding(target.replace.id);
      router.push("/accounts-assets?review=1");
      return;
    }
    if (mode === "new") {
      const current = client.householdName || client.fullName;
      const ok = confirm(
        `Load "${imported.clientName ?? file.name}" as a new client?\n\n` +
          (current ? `This replaces the current client (${current}) and its accounts, holdings and recommendations. ` : "") +
          "Your firm & branding are kept."
      );
      if (!ok) return;
      loadImported(imported);
    } else {
      addImported(imported);
    }
    router.push("/accounts-assets?review=1");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>PDF statement or financial plan</CardTitle>
        <CardSubtitle>
          Read in your browser: the file isn&apos;t uploaded. Recognizes financial plans with a Balance Sheet (LifeView-style)
          and statements with a holdings table, and checks the result against the document&apos;s own totals.
        </CardSubtitle>
      </CardHeader>
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          <Button onClick={() => fileRef.current?.click()} disabled={state.step === "reading"} iconLeft={<FileUp className="h-4 w-4" />}>
            Choose PDF
          </Button>
          <span className="text-2xs text-ink-500">Up to 25 MB and 300 pages. Scanned PDFs: use the Screenshot / Image tab.</span>
        </div>

        {state.step === "reading" && (
          <div role="status" className="flex items-center gap-2 text-[13px] text-ink-700">
            <Loader2 className="h-4 w-4 animate-spin" />
            Reading {state.fileName}
            {state.total > 0 && ` · page ${state.page} of ${state.total}`}
          </div>
        )}

        {state.step === "error" && (
          <div role="alert" className="flex items-start gap-2 rounded-md bg-negative-50 ring-1 ring-inset ring-negative-500/30 px-3 py-2.5 text-[13px] text-negative-600">
            <XCircle className="h-4 w-4 mt-0.5 shrink-0" /> {state.message}
          </div>
        )}

        {state.step === "done" && (
          <ImportResult result={state.result} fileName={state.file.name} onLoad={load} targetName={target.account?.name} />
        )}
      </CardBody>
    </Card>
  );
}

function ImportResult({
  result,
  fileName,
  onLoad,
  targetName,
}: {
  result: ExtractionResult;
  fileName: string;
  onLoad: (mode: "new" | "add" | "target") => void;
  targetName?: string;
}) {
  const rows = result.accounts.flatMap((a) => a.holdings.map((h) => ({ a, h })));
  const isPlan = result.documentKind === "financial_plan_lifeview";
  const balanceOnly = rows.filter(({ h }) => h.warnings.some((w) => /only this account's balance/.test(w.message))).length;

  if (rows.length === 0) {
    return (
      <div role="alert" className="flex items-start gap-2 rounded-md bg-warning-50 ring-1 ring-inset ring-warning-500/30 px-3 py-2.5 text-[13px] text-ink-800">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-warning-500" />
        <div>
          <div className="font-medium">Nothing to import from {fileName}</div>
          <div className="text-ink-600">{result.warnings[0]?.message ?? "No holdings were found."}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-700">
        <Badge tone="navy">{KIND_LABEL[result.documentKind ?? ""] ?? "PDF"}</Badge>
        {result.clientNameDetected && <span>Client: <span className="font-medium text-ink-900">{result.clientNameDetected}</span></span>}
        {result.asOfDate && <span>· As of {result.asOfDate}</span>}
        {result.pageCount && <span>· {result.pageCount} pages</span>}
      </div>

      <ReconciliationBadge rec={result.reconciliation} lines={rows.length} />

      {result.warnings.map((w, i) => (
        <div key={i} className="flex items-start gap-2 text-[12px] text-ink-600">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-ink-400" /> {w.message}
        </div>
      ))}
      {balanceOnly > 0 && (
        <div className="flex items-start gap-2 text-[12px] text-ink-600">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-ink-400" />
          {balanceOnly} account{balanceOnly === 1 ? " is" : "s are"} imported as a single balance because the document doesn&apos;t list the holdings
          inside {balanceOnly === 1 ? "it" : "them"}. Add positions from a custodial statement later for an accurate allocation.
        </div>
      )}

      <div className="overflow-x-auto rounded-md ring-1 ring-ink-100">
        <table className="w-full text-[12px]">
          <thead className="bg-slatey-50 text-ink-500">
            <tr>
              <th className="text-left px-3 py-1.5 font-medium">Account / asset</th>
              <th className="text-left px-3 py-1.5 font-medium">Category</th>
              <th className="text-left px-3 py-1.5 font-medium">Account type</th>
              <th className="text-left px-3 py-1.5 font-medium">Asset class</th>
              <th className="text-left px-3 py-1.5 font-medium">As of</th>
              <th className="text-right px-3 py-1.5 font-medium">Value</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ a, h }) => (
              <tr key={h.id} className="border-t border-ink-100">
                <td className="px-3 py-1.5 text-ink-900">{h.assetName}</td>
                <td className="px-3 py-1.5 text-ink-600">{h.notes?.replace(/ \(from.*\)$/, "") ?? "—"}</td>
                <td className="px-3 py-1.5 text-ink-600">{a.accountType ? ACCOUNT_TYPE_LABELS[a.accountType] : "—"}</td>
                <td className="px-3 py-1.5 text-ink-600">{h.assetClass === "custom" ? "Other / unclassified (balance only)" : h.assetClass ? ASSET_CLASS_LABELS[h.assetClass] : "—"}</td>
                <td className="px-3 py-1.5 text-ink-600 tabular">{h.valuationDate ?? "—"}</td>
                <td className={`px-3 py-1.5 text-right tabular font-medium ${(h.marketValue ?? 0) < 0 ? "text-negative-600" : "text-ink-900"}`}>
                  {formatCurrency(h.marketValue ?? 0, h.currency ?? "USD")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {targetName && !isPlan && <Button onClick={() => onLoad("target")}>Add to {targetName}</Button>}
        <Button variant={targetName && !isPlan ? "secondary" : "primary"} onClick={() => onLoad(isPlan ? "new" : "add")}>
          {isPlan ? "Load as new client" : "Add to current client"}
        </Button>
        <Button variant="secondary" onClick={() => onLoad(isPlan ? "add" : "new")}>
          {isPlan ? "Add to current client instead" : "Load as new client instead"}
        </Button>
        <span className="text-2xs text-ink-500">
          Values arrive as &ldquo;not confirmed&rdquo;; you&apos;ll go straight to confirming them.
        </span>
      </div>
    </div>
  );
}

function ReconciliationBadge({ rec, lines }: { rec?: Reconciliation; lines: number }) {
  const fmt = (n?: number) => (n === undefined ? "n/a" : formatCurrency(n, "USD"));
  if (!rec || rec.status === "unavailable") {
    return (
      <div className="flex items-start gap-2 rounded-md bg-slatey-50 ring-1 ring-inset ring-ink-200 px-3 py-2 text-[13px] text-ink-700">
        <Info className="h-4 w-4 mt-0.5 shrink-0 text-ink-400" />
        {lines} line{lines === 1 ? "" : "s"} found. The document doesn&apos;t state totals to check against, so review each value carefully.
      </div>
    );
  }
  if (rec.status === "matched") {
    return (
      <div role="status" className="flex items-start gap-2 rounded-md bg-positive-50 ring-1 ring-inset ring-positive-500/40 px-3 py-2 text-[13px] text-ink-800">
        <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-positive-500" />
        <div>
          <span className="font-semibold text-positive-600">Matches the document&apos;s totals.</span> {lines} lines · assets{" "}
          {fmt(rec.assetsExtracted)} · liabilities {fmt(rec.liabilitiesExtracted)} · net worth {fmt(rec.netWorthExtracted)}
        </div>
      </div>
    );
  }
  return (
    <div role="alert" className="flex items-start gap-2 rounded-md bg-negative-50 ring-1 ring-inset ring-negative-500/30 px-3 py-2 text-[13px] text-ink-800">
      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-negative-500" />
      <div>
        <span className="font-semibold text-negative-600">Doesn&apos;t match the document&apos;s totals.</span> Extracted assets{" "}
        {fmt(rec.assetsExtracted)} vs stated {fmt(rec.assetsStated)}; liabilities {fmt(rec.liabilitiesExtracted)} vs{" "}
        {fmt(rec.liabilitiesStated)}. Some lines may be missing. You can still load it, then add the missing items by hand.
      </div>
    </div>
  );
}
