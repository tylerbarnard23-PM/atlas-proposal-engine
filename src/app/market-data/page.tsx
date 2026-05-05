"use client";

import * as React from "react";
import { useAtlasStore } from "@/store/useStore";
import { ClientOnly } from "@/components/layout/ClientOnly";
import { PageHeader, SectionDivider } from "@/components/ui/Section";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useNormalizedHoldings } from "@/hooks/useNormalizedHoldings";
import { holdingsEligibleForEnrichment } from "@/engines/marketDataEngine";
import { formatCurrency, formatDateTime } from "@/utils/formatting";
import { QuoteTypeBadge } from "@/components/ui/SourceTag";

interface ProviderStatus {
  id: string;
  name: string;
  sourceType: string;
  requiresApiKey: boolean;
  hasApiKey: boolean;
  attributionLine?: string;
}

export default function MarketDataPage() {
  return (
    <ClientOnly>
      <Inner />
    </ClientOnly>
  );
}

function Inner() {
  const { holdings, reportingCurrency } = useNormalizedHoldings();
  const md = useAtlasStore((s) => s.marketDataByIdentifier);
  const apply = useAtlasStore((s) => s.applyMarketDataResults);
  const setFx = useAtlasStore((s) => s.setFxRates);
  const fxRates = useAtlasStore((s) => s.fxRates);
  const [busy, setBusy] = React.useState(false);
  const [providers, setProviders] = React.useState<ProviderStatus[]>([]);

  React.useEffect(() => {
    fetch("/api/market-data/providers")
      .then((r) => (r.ok ? r.json() : { providers: [] }))
      .then((d) => setProviders(d.providers ?? []))
      .catch(() => setProviders([]));
  }, []);

  const eligible = holdingsEligibleForEnrichment(holdings);

  async function refreshAll() {
    setBusy(true);
    try {
      const r = await fetch("/api/market-data/refresh", {
        method: "POST",
        body: JSON.stringify({ holdings: eligible }),
      });
      const data = await r.json();
      apply(data.results ?? []);
    } finally {
      setBusy(false);
    }
  }

  async function refreshFx() {
    setBusy(true);
    try {
      const r = await fetch("/api/market-data/fx?base=USD&quotes=EUR,GBP,CHF,JPY,CAD,AUD,SGD,HKD,MXN");
      const data = await r.json();
      if (Array.isArray(data.rates) && data.rates.length > 0) setFx(data.rates);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Market Data"
        title="Provider status & holdings enrichment"
        description="The platform routes quotes through configured providers, falling back to free sources, then to manual or mock values. Every result is timestamped and labeled."
        actions={
          <>
            <Button variant="secondary" onClick={refreshFx} loading={busy}>
              Refresh FX
            </Button>
            <Button onClick={refreshAll} loading={busy}>
              Refresh quotes
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {providers.map((p) => (
          <Card key={p.id}>
            <CardBody>
              <div className="flex items-center justify-between gap-2">
                <div className="text-[13px] font-medium text-ink-900">{p.name}</div>
                <Badge
                  tone={
                    p.requiresApiKey
                      ? p.hasApiKey
                        ? "positive"
                        : "warning"
                      : "navy"
                  }
                >
                  {p.requiresApiKey ? (p.hasApiKey ? "Configured" : "Key required") : "No key needed"}
                </Badge>
              </div>
              <div className="text-2xs text-ink-500 mt-1.5">{p.sourceType}</div>
              {p.attributionLine && <div className="text-2xs text-ink-500 mt-2 leading-relaxed">{p.attributionLine}</div>}
            </CardBody>
          </Card>
        ))}
      </div>

      <SectionDivider>FX Reference Rates</SectionDivider>
      <Card className="mb-6">
        <CardBody>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-ink-500">
                  <th className="text-left px-3 py-2 font-medium">Base</th>
                  <th className="text-left px-3 py-2 font-medium">Quote</th>
                  <th className="text-right px-3 py-2 font-medium">Rate</th>
                  <th className="text-left px-3 py-2 font-medium">As of</th>
                  <th className="text-left px-3 py-2 font-medium">Source</th>
                </tr>
              </thead>
              <tbody>
                {fxRates.map((f, i) => (
                  <tr key={i} className="border-t border-ink-100 tabular">
                    <td className="px-3 py-1.5">{f.base}</td>
                    <td className="px-3 py-1.5">{f.quote}</td>
                    <td className="px-3 py-1.5 text-right">{f.rate.toFixed(4)}</td>
                    <td className="px-3 py-1.5">{new Date(f.asOf).toLocaleDateString()}</td>
                    <td className="px-3 py-1.5">
                      <Badge tone="navy">{f.source}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      <SectionDivider>Quote Coverage</SectionDivider>

      <Card>
        <CardHeader>
          <CardTitle>Holdings Eligible for External Enrichment ({eligible.length})</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-ink-500">
                  <th className="text-left px-3 py-2 font-medium">Holding</th>
                  <th className="text-left px-3 py-2 font-medium">Identifier</th>
                  <th className="text-right px-3 py-2 font-medium">Stored value</th>
                  <th className="text-right px-3 py-2 font-medium">Last quote</th>
                  <th className="text-left px-3 py-2 font-medium">Provider</th>
                  <th className="text-left px-3 py-2 font-medium">As of</th>
                  <th className="text-left px-3 py-2 font-medium">Type</th>
                </tr>
              </thead>
              <tbody>
                {eligible.map((h) => {
                  const key = `${h.identifier?.type ?? ""}:${h.identifier?.value ?? ""}`;
                  const q = md[key];
                  return (
                    <tr key={h.id} className="border-t border-ink-100">
                      <td className="px-3 py-2">
                        <div className="text-ink-900 font-medium">{h.assetName}</div>
                        <div className="text-2xs text-ink-500">{h.currency}</div>
                      </td>
                      <td className="px-3 py-2 text-ink-700">{h.identifier?.value ?? "—"}</td>
                      <td className="px-3 py-2 text-right tabular">
                        {formatCurrency(h.nativeMarketValue, h.currency, { compact: true })}
                      </td>
                      <td className="px-3 py-2 text-right tabular">
                        {q?.price != null ? formatCurrency(q.price, q.currency ?? h.currency) : "—"}
                      </td>
                      <td className="px-3 py-2 text-ink-700">{q?.providerName ?? "—"}</td>
                      <td className="px-3 py-2 text-ink-700">{q?.asOf ? formatDateTime(q.asOf) : "—"}</td>
                      <td className="px-3 py-2">{q?.quoteType ? <QuoteTypeBadge type={q.quoteType} /> : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      <p className="text-2xs text-ink-500 mt-3 leading-relaxed">
        Reporting currency: {reportingCurrency}. External quotes are fetched server-side; API keys (if any) never leave the server. Mock values are returned as a last-resort fallback and are clearly labeled.
      </p>
    </>
  );
}
