"use client";

import * as React from "react";
import { useAtlasStore } from "@/store/useStore";
import { ClientOnly } from "@/components/layout/ClientOnly";
import { PageHeader, SectionDivider } from "@/components/ui/Section";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export default function AssumptionsDisclosuresPage() {
  return (
    <ClientOnly>
      <Inner />
    </ClientOnly>
  );
}

function Inner() {
  const disclosures = useAtlasStore((s) => s.disclosures);
  const fxRates = useAtlasStore((s) => s.fxRates);
  const client = useAtlasStore((s) => s.client);

  return (
    <>
      <PageHeader
        eyebrow="Compliance"
        title="Assumptions & Disclosures"
        description="The library of disclosures available to this engagement, plus the assumptions used in the proposal."
      />

      <SectionDivider>Assumptions</SectionDivider>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardHeader><CardTitle>FX Reference Rates</CardTitle></CardHeader>
          <CardBody>
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-ink-500 text-left">
                  <th className="py-1.5 font-medium">Pair</th>
                  <th className="py-1.5 font-medium text-right">Rate</th>
                  <th className="py-1.5 font-medium">As of</th>
                  <th className="py-1.5 font-medium">Source</th>
                </tr>
              </thead>
              <tbody>
                {fxRates.map((f, i) => (
                  <tr key={i} className="border-t border-ink-100">
                    <td className="py-1">{f.base}/{f.quote}</td>
                    <td className="py-1 text-right tabular">{f.rate.toFixed(4)}</td>
                    <td className="py-1">{new Date(f.asOf).toLocaleDateString()}</td>
                    <td className="py-1"><Badge tone="navy">{f.source}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-2xs text-ink-500 mt-3">
              Reference rates only. Not transaction rates. Reporting currency: {client.proposalOutputCurrency}.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader><CardTitle>Valuation Assumptions</CardTitle></CardHeader>
          <CardBody className="space-y-2 text-[13px]">
            <Row label="Public market quotes" value="EOD or delayed; labeled per holding" />
            <Row label="Manually valued assets" value="Sponsor or advisor estimates; periodic" />
            <Row label="FX conversion" value="Reference rates from ECB / Frankfurter" />
            <Row label="Mock fallback" value="Used only when no provider returns data" />
          </CardBody>
        </Card>
      </div>

      <SectionDivider>Disclosures</SectionDivider>

      <div className="space-y-3">
        {disclosures.map((d) => (
          <Card key={d.id}>
            <CardBody>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-ink-900">{d.title}</div>
                  <p className="text-[13px] text-ink-700 mt-1.5 leading-relaxed">{d.body}</p>
                </div>
                <div className="flex flex-col gap-2 items-end">
                  {d.required && <Badge tone="gold">Required</Badge>}
                  <Badge tone="neutral">{d.category}</Badge>
                </div>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-ink-100 py-1 last:border-b-0">
      <span className="text-ink-500">{label}</span>
      <span className="text-ink-900">{value}</span>
    </div>
  );
}
