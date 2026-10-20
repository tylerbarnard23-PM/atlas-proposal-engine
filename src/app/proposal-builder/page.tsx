"use client";

import * as React from "react";
import Link from "next/link";
import { useAtlasStore } from "@/store/useStore";
import { ClientOnly } from "@/components/layout/ClientOnly";
import { PageHeader, SectionDivider } from "@/components/ui/Section";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { useNormalizedHoldings } from "@/hooks/useNormalizedHoldings";
import { evaluateReadiness } from "@/engines/complianceEngine";
import { ChevronRight } from "lucide-react";

export default function ProposalBuilderPage() {
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
  const sections = useAtlasStore((s) => s.proposalSections);
  const toggleSection = useAtlasStore((s) => s.toggleSection);
  const setProposalNotes = useAtlasStore((s) => s.setProposalNotes);
  const disclosures = useAtlasStore((s) => s.disclosures);
  const { holdings } = useNormalizedHoldings();

  const stale = holdings.filter((h) => h.priceFreshness === "stale").length;
  const mock = holdings.filter((h) => h.valuationSource.kind === "mock").length;
  const unverified = holdings.filter((h) => h.advisorVerification === "unverified").length;
  const readiness = evaluateReadiness({
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

  return (
    <>
      <PageHeader
        eyebrow="Proposal Builder"
        title={proposal.title}
        description="Choose the sections that appear in the client deliverable, write the engagement note, and confirm advisor approval before generating the PDF."
        actions={
          <>
            <Link href="/pdf-preview">
              <Button variant="secondary" iconRight={<ChevronRight className="h-4 w-4" />}>Preview PDF</Button>
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <Card>
            <CardHeader><CardTitle>Sections</CardTitle></CardHeader>
            <CardBody className="p-0!">
              <ul className="divide-y divide-ink-100">
                {sections.map((s) => (
                  <li key={s.key} className="px-5 py-3 flex items-center justify-between">
                    <div>
                      <div className="text-[14px] text-ink-900 font-medium">{s.label}</div>
                      <div className="text-2xs text-ink-500 mt-0.5">{s.required ? "Required" : "Optional"}</div>
                    </div>
                    <label className="flex items-center gap-2 text-[12px] text-ink-700">
                      <input
                        type="checkbox"
                        checked={s.enabled}
                        onChange={() => toggleSection(s.key)}
                        disabled={s.required}
                      />
                      Include
                    </label>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>

          <Card>
            <CardHeader><CardTitle>Engagement Note (visible at the top of the executive summary)</CardTitle></CardHeader>
            <CardBody>
              <Label>Advisor note</Label>
              <Textarea
                rows={6}
                value={proposal.notes ?? ""}
                onChange={(e) => setProposalNotes(e.target.value)}
                placeholder="Frame the engagement, the client's stated priorities, and the spirit of the recommendations..."
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader><CardTitle>Approved Recommendations in PDF</CardTitle></CardHeader>
            <CardBody>
              <ul className="space-y-2">
                {recs.filter((r) => r.includeInPdf && r.approvedByAdvisor).map((r) => (
                  <li key={r.id} className="flex items-center justify-between text-[13px]">
                    <span className="text-ink-900">{r.title}</span>
                    <Badge tone="positive">Approved</Badge>
                  </li>
                ))}
                {recs.filter((r) => r.includeInPdf && r.approvedByAdvisor).length === 0 && (
                  <li className="text-sm text-ink-500">No approved recommendations marked for inclusion. Visit Recommendations to approve.</li>
                )}
              </ul>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader><CardTitle>Readiness Checklist</CardTitle></CardHeader>
            <CardBody>
              <ul className="space-y-2">
                {readiness.map((r) => (
                  <li key={r.code} className="flex items-start gap-2 text-[13px]">
                    <span className={r.passed ? "text-positive-500" : "text-warning-500"}>
                      {r.passed ? "●" : "○"}
                    </span>
                    <div className="flex-1">
                      <div className="text-ink-800">{r.label}</div>
                      {r.detail && <div className="text-2xs text-ink-500">{r.detail}</div>}
                    </div>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>

          <Card>
            <CardHeader><CardTitle>Output</CardTitle></CardHeader>
            <CardBody className="space-y-2 text-[13px]">
              <div className="flex justify-between"><span className="text-ink-500">Currency</span><span>{proposal.outputCurrency}</span></div>
              <div className="flex justify-between"><span className="text-ink-500">Country</span><span>{proposal.outputCountry}</span></div>
              <div className="flex justify-between"><span className="text-ink-500">Status</span><span className="capitalize">{proposal.approvalStatus.replace("_", " ")}</span></div>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
