"use client";

import * as React from "react";
import { useAtlasStore } from "@/store/useStore";
import { ClientOnly } from "@/components/layout/ClientOnly";
import { PageHeader } from "@/components/ui/Section";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useNormalizedHoldings } from "@/hooks/useNormalizedHoldings";
import { forReadiness } from "@/engines/importCompleteness";
import { evaluateWorkspaceReadiness, readinessOk } from "@/engines/complianceEngine";
import { ReadinessChecklist } from "@/components/proposal/ReadinessChecklist";
import { ReadinessBanner, nudgeReadiness } from "@/components/proposal/ReadinessBanner";
import { cn } from "@/utils/cn";
import { Lock } from "lucide-react";
import { formatDateTime } from "@/utils/formatting";
import { safeId, todayIso } from "@/utils/formatting";
import type { PdfGenerationJob } from "@/domain/types";

export default function PdfPreviewPage() {
  return (
    <ClientOnly>
      <Inner />
    </ClientOnly>
  );
}

function Inner() {
  const client = useAtlasStore((s) => s.client);
  const advisor = useAtlasStore((s) => s.advisor);
  const accounts = useAtlasStore((s) => s.accounts);
  const recs = useAtlasStore((s) => s.recommendations);
  const proposal = useAtlasStore((s) => s.proposal);
  const disclosures = useAtlasStore((s) => s.disclosures);
  const fxRates = useAtlasStore((s) => s.fxRates);
  const sourceDocuments = useAtlasStore((s) => s.sourceDocuments);
  const pdfHistory = useAtlasStore((s) => s.pdfHistory);
  const recordPdfJob = useAtlasStore((s) => s.recordPdfJob);
  const { holdings } = useNormalizedHoldings();

  const checks = evaluateWorkspaceReadiness({ client, advisor, accounts, holdings, recommendations: recs, disclosures, fxRates, sourceDocuments });
  const ready = readinessOk(checks);
  const failing = checks.filter((c) => !c.passed);

  const [busy, setBusy] = React.useState<null | "draft" | "final">(null);

  async function generate(variant: "draft" | "final") {
    setBusy(variant);
    const job: PdfGenerationJob = {
      id: safeId("pdf"),
      proposalId: proposal.id,
      variant,
      startedAt: todayIso(),
      status: "running",
    };
    recordPdfJob(job);
    try {
      const res = await fetch(`/api/proposals/${proposal.id}/generate-pdf?variant=${variant}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          state: {
            client,
            advisor,
            accounts,
            holdings,
            recommendations: recs,
            sections: proposal.sections,
            disclosures: disclosures.filter((d) => proposal.disclosureIds.includes(d.id)),
            proposal,
            fxRates,
            // What the server's readiness gate needs from each import, not the full extraction.
            sourceDocuments: sourceDocuments.map(forReadiness),
          },
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        let message = text;
        try {
          message = JSON.parse(text).error ?? text;
        } catch {}
        throw new Error(message || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const fileName = res.headers.get("X-Filename") ?? `proposal_${variant}.pdf`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      recordPdfJob({ ...job, status: "succeeded", completedAt: todayIso(), filename: fileName });
    } catch (err) {
      recordPdfJob({ ...job, status: "failed", completedAt: todayIso(), errorMessage: (err as Error).message });
      alert(`PDF generation failed: ${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Proposal Output"
        title="PDF Preview & Generation"
        description="Generate a draft (advisor working copy, watermarked) or a final client-ready PDF. The document is rendered server-side from a dedicated proposal template."
      />

      <ReadinessBanner
        checks={checks}
        className="mb-5"
        readyAction={
          <Button
            onClick={() => generate("final")}
            loading={busy === "final"}
            className="bg-positive-600 hover:bg-positive-500 active:bg-positive-600"
          >
            Generate final PDF
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-5">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Document Preview</CardTitle>
              <a
                href={`/proposal-pdf/${proposal.id}`}
                target="_blank"
                rel="noreferrer"
                className="text-[12px] text-navy-700 hover:underline"
              >
                Open template in new tab →
              </a>
            </div>
          </CardHeader>
          <CardBody className="p-0!">
            <iframe
              src={`/proposal-pdf/${proposal.id}?embed=1`}
              className="w-full h-[820px] bg-white border-t border-ink-100"
              title="PDF Preview"
            />
          </CardBody>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Readiness</CardTitle>
                <Badge tone={ready ? "positive" : "warning"}>
                  {checks.filter((c) => c.passed).length}/{checks.length}
                </Badge>
              </div>
            </CardHeader>
            <CardBody>
              <ReadinessChecklist checks={checks} />
            </CardBody>
          </Card>

          <Card className={cn(ready && "ring-2 ring-positive-500/50")}>
            <CardHeader><CardTitle>Generate</CardTitle></CardHeader>
            <CardBody className="space-y-2.5">
              <Button onClick={() => generate("draft")} loading={busy === "draft"} variant="secondary">
                Generate draft PDF
              </Button>
              {/* Not disabled when locked: clicking it shows what's left (scrolls to
                  the steps and lights up the pages in the sidebar) instead of doing nothing. */}
              <Button
                onClick={() => {
                  if (ready) return generate("final");
                  window.scrollTo({ top: 0, behavior: "smooth" });
                  nudgeReadiness();
                }}
                loading={busy === "final"}
                aria-disabled={!ready}
                iconLeft={ready ? undefined : <Lock className="h-4 w-4" />}
                className={cn(
                  ready
                    ? "bg-positive-600 hover:bg-positive-500 active:bg-positive-600"
                    : "bg-slatey-300 text-ink-700 hover:bg-slatey-300"
                )}
              >
                Generate final PDF
              </Button>
              {ready ? (
                <p className="text-2xs text-ink-500">All readiness checks pass. The final PDF is unlocked.</p>
              ) : (
                <div className="rounded-md bg-warning-50 ring-1 ring-inset ring-warning-500/30 px-3 py-2.5 text-[12px] text-ink-800">
                  <div className="flex items-center gap-1.5 font-semibold text-warning-600">
                    <Lock className="h-3.5 w-3.5" />
                    Final PDF locked: {failing.length} item{failing.length === 1 ? "" : "s"} to resolve
                  </div>
                  <p className="mt-1 text-ink-600">
                    Each item is done on another page: use the <span className="font-medium">Fix in…</span> links above or the
                    highlighted items in the left menu. Click <span className="font-medium">Generate final PDF</span> to see
                    where to go. You can generate a watermarked draft at any time.
                  </p>
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader><CardTitle>Recent generations</CardTitle></CardHeader>
            <CardBody className="p-0!">
              {pdfHistory.length === 0 ? (
                <div className="px-5 py-4 text-sm text-ink-500">No PDFs generated yet.</div>
              ) : (
                <ul className="divide-y divide-ink-100">
                  {pdfHistory.slice(0, 5).map((j) => (
                    <li key={j.id} className="px-5 py-2 flex items-center justify-between text-[12px]">
                      <span>{j.filename ?? j.variant} · {formatDateTime(j.completedAt ?? j.startedAt)}</span>
                      <Badge tone={j.status === "succeeded" ? "positive" : j.status === "failed" ? "negative" : "warning"}>
                        {j.status}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
