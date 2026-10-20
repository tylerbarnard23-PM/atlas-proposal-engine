"use client";

import * as React from "react";
import Link from "next/link";
import { useAtlasStore } from "@/store/useStore";
import { ClientOnly } from "@/components/layout/ClientOnly";
import { PageHeader } from "@/components/ui/Section";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import type { ExtractedHolding, SourceDocument } from "@/domain/types";
import { formatDateTime } from "@/utils/formatting";

export default function StatementWorkbenchPage() {
  return (
    <ClientOnly>
      <Inner />
    </ClientOnly>
  );
}

function Inner() {
  const docs = useAtlasStore((s) => s.sourceDocuments);
  const [activeId, setActiveId] = React.useState<string | null>(docs[0]?.id ?? null);
  const update = useAtlasStore((s) => s.updateSourceDocument);
  const active = docs.find((d) => d.id === activeId) ?? null;

  return (
    <>
      <PageHeader
        eyebrow="Statement Intelligence Workbench"
        title="Source review & field mapping"
        description="Review extracted statements, validate fields, mark advisor-verified rows, and stage approved holdings before they enter the proposal."
        actions={
          <Link href="/import-center">
            <Button>Add a source</Button>
          </Link>
        }
      />

      {docs.length === 0 ? (
        <EmptyState
          title="No source documents yet"
          description="Use the Import Center to upload CSV, Excel, PDF, screenshot, or pasted statements. Extracted rows will land here for review."
          action={
            <Link href="/import-center">
              <Button>Open Import Center</Button>
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5">
          <Card>
            <CardHeader><CardTitle>Sources</CardTitle></CardHeader>
            <CardBody className="p-0!">
              <ul className="divide-y divide-ink-100">
                {docs.map((d) => (
                  <li
                    key={d.id}
                    className={`p-4 cursor-pointer hover:bg-slatey-50 ${activeId === d.id ? "bg-slatey-100" : ""}`}
                    onClick={() => setActiveId(d.id)}
                  >
                    <div className="text-[13px] font-medium text-ink-900 truncate">{d.fileName}</div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <Badge tone="navy">{d.sourceType}</Badge>
                      <Badge tone={d.extractionStatus === "verified" ? "positive" : "warning"}>
                        {d.extractionStatus.replace("_", " ")}
                      </Badge>
                    </div>
                    <div className="text-2xs text-ink-500 mt-1">{formatDateTime(d.uploadedAt)}</div>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>

          <div>
            {active ? <SourcePanel doc={active} onUpdate={(p) => update(active.id, p)} /> : null}
          </div>
        </div>
      )}
    </>
  );
}

function SourcePanel({ doc, onUpdate }: { doc: SourceDocument; onUpdate: (p: Partial<SourceDocument>) => void }) {
  const ex = doc.extraction;
  const allHoldings: ExtractedHolding[] = ex?.accounts.flatMap((a) => a.holdings) ?? [];
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{doc.fileName}</CardTitle>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => onUpdate({ extractionStatus: "verified", advisorVerified: true })}>
              Mark verified
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onUpdate({ extractionStatus: "excluded" })}>
              Exclude
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardBody className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[13px]">
          <Field label="Source type" value={doc.sourceType} />
          <Field label="Method" value={doc.extractionMethod ?? "—"} />
          <Field label="Status" value={doc.extractionStatus.replace("_", " ")} />
          <Field label="Pages" value={doc.pageCount ? String(doc.pageCount) : "—"} />
        </div>

        {ex && (
          <div>
            <div className="text-2xs uppercase tracking-widest text-ink-500 mb-2">Extracted Holdings ({allHoldings.length})</div>
            <div className="overflow-x-auto rounded-md border border-ink-100">
              <table className="w-full text-[12px]">
                <thead className="bg-slatey-50">
                  <tr className="text-ink-500">
                    <th className="text-left px-3 py-1.5 font-medium">Symbol</th>
                    <th className="text-left px-3 py-1.5 font-medium">Name</th>
                    <th className="text-right px-3 py-1.5 font-medium">Qty</th>
                    <th className="text-right px-3 py-1.5 font-medium">Price</th>
                    <th className="text-right px-3 py-1.5 font-medium">Value</th>
                    <th className="text-left px-3 py-1.5 font-medium">Currency</th>
                    <th className="text-left px-3 py-1.5 font-medium">Confidence</th>
                    <th className="text-left px-3 py-1.5 font-medium">Warnings</th>
                  </tr>
                </thead>
                <tbody>
                  {allHoldings.map((h) => (
                    <tr key={h.id} className="border-t border-ink-100">
                      <td className="px-3 py-2 font-medium text-ink-900">{h.symbol ?? h.identifier?.value ?? "—"}</td>
                      <td className="px-3 py-2 text-ink-700 max-w-[260px] truncate">{h.assetName ?? "—"}</td>
                      <td className="px-3 py-2 text-right tabular">{h.quantity ?? "—"}</td>
                      <td className="px-3 py-2 text-right tabular">{h.price ?? "—"}</td>
                      <td className="px-3 py-2 text-right tabular font-medium">{h.marketValue ?? "—"}</td>
                      <td className="px-3 py-2">{h.currency ?? "—"}</td>
                      <td className="px-3 py-2">
                        <Badge tone={h.confidence === "high" ? "positive" : h.confidence === "low" ? "warning" : "neutral"}>
                          {h.confidence}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-ink-500">
                        {h.warnings.length > 0 ? `${h.warnings.length}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {doc.rawTextSample && (
          <div>
            <div className="text-2xs uppercase tracking-widest text-ink-500 mb-1.5">Raw text sample</div>
            <pre className="text-[11px] bg-slatey-50 border border-ink-100 rounded-md p-3 max-h-72 overflow-auto whitespace-pre-wrap">
              {doc.rawTextSample}
            </pre>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-2xs uppercase tracking-widest text-ink-500">{label}</div>
      <div className="text-[13px] text-ink-900">{value}</div>
    </div>
  );
}
