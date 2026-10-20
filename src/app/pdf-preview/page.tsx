"use client";

import * as React from "react";
import { useAtlasStore } from "@/store/useStore";
import { ClientOnly } from "@/components/layout/ClientOnly";
import { PageHeader } from "@/components/ui/Section";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useNormalizedHoldings } from "@/hooks/useNormalizedHoldings";
import { evaluateReadiness, readinessOk } from "@/engines/complianceEngine";
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
  const pdfHistory = useAtlasStore((s) => s.pdfHistory);
  const recordPdfJob = useAtlasStore((s) => s.recordPdfJob);
  const { holdings } = useNormalizedHoldings();

  const stale = holdings.filter((h) => h.priceFreshness === "stale").length;
  const mock = holdings.filter((h) => h.valuationSource.kind === "mock").length;
  const unverified = holdings.filter((h) => h.advisorVerification === "unverified").length;
  const checks = evaluateReadiness({
    client,
    advisor,
    accounts,
    holdings,
    recommendations: recs,
    disclosures: disclosures.filter((d) => d.required),
    unverifiedHoldingsCount: unverified,
    staleValuationsCount: stale,
    marketDataIssuesCount: mock,
    insightsReviewedCount: 0,
    totalInsightsCount: 0,
  });
  const ready = readinessOk(checks);

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
          },
        }),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(err || `HTTP ${res.status}`);
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
              <ul className="space-y-1.5">
                {checks.map((c) => (
                  <li key={c.code} className="flex items-start gap-2 text-[13px]">
                    <span className={c.passed ? "text-positive-500" : "text-warning-500"}>{c.passed ? "●" : "○"}</span>
                    <span className="text-ink-800 flex-1">{c.label}</span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>

          <Card>
            <CardHeader><CardTitle>Generate</CardTitle></CardHeader>
            <CardBody className="space-y-2.5">
              <Button onClick={() => generate("draft")} loading={busy === "draft"} variant="secondary">
                Generate draft PDF
              </Button>
              <Button onClick={() => generate("final")} loading={busy === "final"} disabled={!ready}>
                Generate final PDF
              </Button>
              {!ready && (
                <p className="text-2xs text-ink-500">
                  Final PDF is gated by the readiness checklist. Draft PDFs include unresolved warnings and a DRAFT watermark.
                </p>
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
