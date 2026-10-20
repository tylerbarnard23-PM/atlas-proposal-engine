"use client";

import * as React from "react";
import { useAtlasStore } from "@/store/useStore";
import { ClientOnly } from "@/components/layout/ClientOnly";
import { PageHeader, SectionDivider } from "@/components/ui/Section";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

export default function SettingsPage() {
  return (
    <ClientOnly>
      <Inner />
    </ClientOnly>
  );
}

function Inner() {
  const reset = useAtlasStore((s) => s.resetSeed);
  const clearAll = useAtlasStore((s) => s.clearAll);
  const startNewClient = useAtlasStore((s) => s.startNewClient);
  const [providers, setProviders] = React.useState<{ id: string; name: string; requiresApiKey: boolean; hasApiKey: boolean }[]>([]);

  React.useEffect(() => {
    fetch("/api/market-data/providers")
      .then((r) => r.json())
      .then((d) => setProviders(d.providers ?? []))
      .catch(() => setProviders([]));
  }, []);

  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Settings"
        description="Local persistence, environment configuration, and provider keys are managed at the deployment level."
      />

      <SectionDivider>Persistence</SectionDivider>
      <Card className="mb-5">
        <CardBody className="space-y-3">
          <p className="text-sm text-ink-700">
            All advisor-entered data is persisted in the browser via <code className="text-2xs bg-slatey-100 rounded px-1 py-0.5">localStorage</code>. <em>Start a new client</em> clears the engagement but keeps your firm &amp; branding; <em>Reset everything</em> also clears the firm.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => { if (confirm("Reset the workspace to seeded sample data? Any in-progress edits will be replaced.")) reset(); }}>
              Restore sample data
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                if (
                  confirm(
                    "Start a new client?\n\nThis clears the client profile, accounts, holdings, recommendations, source documents and PDF history. Your firm & branding are kept. This can't be undone."
                  )
                ) {
                  startNewClient();
                }
              }}
            >
              Start a new client
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (
                  confirm(
                    "Reset everything?\n\nThis clears the client and your firm & branding (firm name, advisor, logo, accent color), plus all accounts, holdings, recommendations, source documents and PDF history. This can't be undone."
                  )
                ) {
                  clearAll();
                }
              }}
            >
              Reset everything
            </Button>
          </div>
        </CardBody>
      </Card>

      <SectionDivider>Market Data Providers</SectionDivider>
      <Card>
        <CardHeader><CardTitle>Configured providers</CardTitle></CardHeader>
        <CardBody>
          <ul className="divide-y divide-ink-100">
            {providers.map((p) => (
              <li key={p.id} className="py-3 flex items-center justify-between">
                <div>
                  <div className="text-[13px] text-ink-900">{p.name}</div>
                  <div className="text-2xs text-ink-500 capitalize">{p.id.replace(/_/g, " ")}</div>
                </div>
                <Badge tone={p.requiresApiKey ? (p.hasApiKey ? "positive" : "warning") : "navy"}>
                  {p.requiresApiKey ? (p.hasApiKey ? "Configured" : "Key required") : "No key needed"}
                </Badge>
              </li>
            ))}
          </ul>
          <p className="text-2xs text-ink-500 mt-4 leading-relaxed">
            API keys are read server-side from environment variables: <code>ALPHA_VANTAGE_API_KEY</code>, <code>FINNHUB_API_KEY</code>, <code>TWELVE_DATA_API_KEY</code>, <code>FRED_API_KEY</code>. Keys are never exposed to the browser.
          </p>
        </CardBody>
      </Card>
    </>
  );
}
