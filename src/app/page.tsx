"use client";

import * as React from "react";
import { useAtlasStore } from "@/store/useStore";
import { useNormalizedHoldings } from "@/hooks/useNormalizedHoldings";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { KpiCard } from "@/components/ui/KpiCard";
import { PageHeader, SectionDivider } from "@/components/ui/Section";
import { AllocationBars } from "@/components/charts/AllocationBars";
import { AllocationDonut } from "@/components/charts/AllocationDonut";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ClientOnly } from "@/components/layout/ClientOnly";
import { formatCurrency, formatPercent } from "@/utils/formatting";
import { ASSET_CLASS_LABELS } from "@/domain/assetTaxonomy";
import { netWorth } from "@/engines/proposalEngine";
import { dataQualityScore } from "@/engines/dataQualityEngine";
import { evaluateWorkspaceReadiness } from "@/engines/complianceEngine";
import { ReadinessChecklist } from "@/components/proposal/ReadinessChecklist";
import { ReadinessBanner } from "@/components/proposal/ReadinessBanner";
import { summarizeAllocation } from "@/engines/insightEngine";
import Link from "next/link";
import { ArrowRight, ShieldCheck, FileSignature } from "lucide-react";

export default function DashboardPage() {
  return (
    <ClientOnly>
      <DashboardInner />
    </ClientOnly>
  );
}

function DashboardInner() {
  const client = useAtlasStore((s) => s.client);
  const advisor = useAtlasStore((s) => s.advisor);
  const accounts = useAtlasStore((s) => s.accounts);
  const recommendations = useAtlasStore((s) => s.recommendations);
  const disclosures = useAtlasStore((s) => s.disclosures);
  const fxRates = useAtlasStore((s) => s.fxRates);
  const sourceDocuments = useAtlasStore((s) => s.sourceDocuments);
  const { holdings, insights, reportingCurrency } = useNormalizedHoldings();

  const nw = netWorth(holdings);
  const allByClass = summarizeAllocation(holdings, (h) => ASSET_CLASS_LABELS[h.assetClass] ?? "Other").slice(0, 8);
  const allByCountry = summarizeAllocation(holdings, (h) => h.country ?? "Unknown").slice(0, 6);
  const allByCurrency = summarizeAllocation(holdings, (h) => h.currency).slice(0, 6);

  const issues = holdings.flatMap((h) => h.dataQuality);
  const dq = dataQualityScore(issues);
  const stale = holdings.filter((h) => h.priceFreshness === "stale").length;
  const mockCount = holdings.filter((h) => h.valuationSource.kind === "mock").length;
  const manualCount = holdings.filter((h) => h.valuationSource.kind === "manual_valuation").length;
  const enrichedCount = holdings.filter((h) => h.marketDataSource).length;
  const unverifiedCount = holdings.filter((h) => h.advisorVerification === "unverified").length;
  const currencies = new Set(holdings.map((h) => h.currency)).size;
  const countries = new Set(holdings.map((h) => h.country).filter(Boolean)).size;
  const classes = new Set(holdings.map((h) => h.assetClass)).size;

  const readiness = evaluateWorkspaceReadiness({ client, advisor, accounts, holdings, recommendations, disclosures, fxRates });
  const readyCount = readiness.filter((r) => r.passed).length;

  return (
    <>
      <PageHeader
        eyebrow="Engagement Dashboard"
        title={client.householdName ?? client.fullName}
        description={`${client.investmentObjective}`}
        actions={
          <>
            <Link href="/import-center">
              <Button variant="secondary" iconRight={<ArrowRight className="h-4 w-4" />}>Add data</Button>
            </Link>
            <Link href="/proposal-builder">
              <Button iconRight={<ArrowRight className="h-4 w-4" />}>Open proposal</Button>
            </Link>
          </>
        }
      />

      <ReadinessBanner checks={readiness} className="mb-6" />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <KpiCard
          label="Net Worth"
          value={formatCurrency(nw.net, reportingCurrency, { compact: true })}
          hint={`Gross ${formatCurrency(nw.gross, reportingCurrency, { compact: true })} · Liabilities ${formatCurrency(nw.liabilities, reportingCurrency, { compact: true })}`}
          tone="navy"
        />
        <KpiCard
          label="Accounts under review"
          value={accounts.length}
          hint={`${holdings.length} holdings · ${classes} asset classes`}
        />
        <KpiCard
          label="Currencies / Countries"
          value={`${currencies} / ${countries}`}
          hint={`Reporting in ${reportingCurrency}`}
        />
        <KpiCard
          label="Data quality score"
          value={`${dq}`}
          hint={`${issues.length} flag(s) across portfolio`}
          tone={dq >= 90 ? "positive" : dq >= 70 ? "warning" : "negative"}
        />
      </div>

      <SectionDivider>Portfolio Picture</SectionDivider>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Asset Allocation</CardTitle>
              <Badge tone="navy">By Asset Class</Badge>
            </div>
          </CardHeader>
          <CardBody>
            <AllocationBars rows={allByClass} currency={reportingCurrency} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Currency Exposure</CardTitle>
          </CardHeader>
          <CardBody>
            <AllocationDonut data={allByCurrency} currency={reportingCurrency} />
            <div className="mt-2 grid grid-cols-2 gap-y-1 text-[12px]">
              {allByCurrency.map((c) => (
                <React.Fragment key={c.label}>
                  <div className="text-ink-700">{c.label}</div>
                  <div className="text-right text-ink-500 tabular">{formatPercent(c.pct, 1)}</div>
                </React.Fragment>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader>
            <CardTitle>Country Exposure</CardTitle>
          </CardHeader>
          <CardBody>
            <AllocationBars rows={allByCountry} currency={reportingCurrency} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Valuation Sources</CardTitle>
          </CardHeader>
          <CardBody>
            <SourceLine label="External market data" value={enrichedCount} count={holdings.length} />
            <SourceLine label="Manual valuations" value={manualCount} count={holdings.length} />
            <SourceLine label="Mock / fallback" value={mockCount} count={holdings.length} />
            <SourceLine label="Stale prices" value={stale} count={holdings.length} tone={stale ? "warning" : "default"} />
            <SourceLine label="Unverified by advisor" value={unverifiedCount} count={holdings.length} tone={unverifiedCount ? "warning" : "default"} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Proposal Readiness</CardTitle>
              <Badge tone={readyCount === readiness.length ? "positive" : "warning"}>
                {readyCount}/{readiness.length}
              </Badge>
            </div>
          </CardHeader>
          <CardBody>
            {/* Outstanding items first, so what blocks the PDF is visible without scrolling. */}
            <ReadinessChecklist
              compact
              checks={[...readiness.filter((r) => !r.passed), ...readiness.filter((r) => r.passed)].slice(0, 6)}
            />
            <div className="mt-3 flex gap-2">
              <Link href="/proposal-builder">
                <Button size="sm" variant="secondary" iconLeft={<FileSignature className="h-3.5 w-3.5" />}>Open builder</Button>
              </Link>
              <Link href="/pdf-preview">
                <Button size="sm" iconLeft={<ShieldCheck className="h-3.5 w-3.5" />}>Preview PDF</Button>
              </Link>
            </div>
          </CardBody>
        </Card>
      </div>

      <SectionDivider>Advisor Review Queue</SectionDivider>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader>
            <CardTitle>Active Insights</CardTitle>
          </CardHeader>
          <CardBody>
            {insights.slice(0, 5).map((i) => (
              <div key={i.id} className="border-b border-ink-100 last:border-b-0 py-2 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[13px] font-medium text-ink-900 truncate">{i.title}</div>
                  <Badge tone={i.severity === "critical" ? "negative" : i.severity === "warning" ? "warning" : "neutral"}>
                    {i.severity}
                  </Badge>
                </div>
                <div className="text-2xs text-ink-500 mt-0.5">{i.category}</div>
              </div>
            ))}
            {insights.length === 0 && <div className="text-sm text-ink-500">No insights generated.</div>}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pending Recommendations</CardTitle>
          </CardHeader>
          <CardBody>
            {recommendations.slice(0, 5).map((r) => (
              <div key={r.id} className="border-b border-ink-100 last:border-b-0 py-2 first:pt-0 last:pb-0">
                <div className="text-[13px] font-medium text-ink-900 truncate">{r.title}</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge
                    tone={
                      r.status === "approved"
                        ? "positive"
                        : r.status === "needs_review"
                        ? "warning"
                        : "neutral"
                    }
                  >
                    {r.status.replace("_", " ")}
                  </Badge>
                  <span className="text-2xs text-ink-500">{r.priority} priority</span>
                </div>
              </div>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Source Documents</CardTitle>
          </CardHeader>
          <CardBody>
            {sourceDocuments.length === 0 && (
              <div className="text-sm text-ink-500">
                No source documents uploaded yet. Visit the Import Center to add CSV, Excel, PDF, or screenshot data.
              </div>
            )}
            {sourceDocuments.slice(0, 5).map((d) => (
              <div key={d.id} className="border-b border-ink-100 last:border-b-0 py-2 first:pt-0 last:pb-0">
                <div className="text-[13px] font-medium text-ink-900 truncate">{d.fileName}</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge tone="neutral">{d.sourceType}</Badge>
                  <Badge tone={d.extractionStatus === "verified" ? "positive" : "navy"}>
                    {d.extractionStatus.replace("_", " ")}
                  </Badge>
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>
    </>
  );
}

function SourceLine({
  label,
  value,
  count,
  tone = "default",
}: {
  label: string;
  value: number;
  count: number;
  tone?: "default" | "warning";
}) {
  const pct = count > 0 ? (value / count) * 100 : 0;
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-ink-100 last:border-b-0">
      <div className="flex items-center gap-2">
        <span
          className={`inline-block h-2 w-2 rounded-full ${tone === "warning" ? "bg-warning-500" : "bg-navy-500"}`}
        />
        <span className="text-[13px] text-ink-700">{label}</span>
      </div>
      <div className="text-[13px] tabular text-ink-700">
        <span className="font-medium">{value}</span>
        <span className="text-ink-400"> / {count}</span>
        <span className="text-ink-400 text-2xs ml-2">{pct.toFixed(0)}%</span>
      </div>
    </div>
  );
}
