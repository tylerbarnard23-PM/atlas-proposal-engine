"use client";

import * as React from "react";
import { useAtlasStore } from "@/store/useStore";
import { ClientOnly } from "@/components/layout/ClientOnly";
import { useNormalizedHoldings } from "@/hooks/useNormalizedHoldings";
import { PageHeader, SectionDivider } from "@/components/ui/Section";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Drawer } from "@/components/ui/Drawer";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select } from "@/components/ui/Input";
import { HoldingsTable } from "@/components/tables/HoldingsTable";
import { ACCOUNT_TYPE_LABELS } from "@/domain/accountTaxonomy";
import { ASSET_CLASS_LABELS } from "@/domain/assetTaxonomy";
import type { Holding } from "@/domain/types";
import { formatCurrency, formatDate } from "@/utils/formatting";
import { QuoteTypeBadge, ValuationSourceLine } from "@/components/ui/SourceTag";

export default function AccountsAssetsPage() {
  return (
    <ClientOnly>
      <Inner />
    </ClientOnly>
  );
}

function Inner() {
  const accounts = useAtlasStore((s) => s.accounts);
  const upsertHolding = useAtlasStore((s) => s.upsertHolding);
  const removeHolding = useAtlasStore((s) => s.removeHolding);
  const { holdings, reportingCurrency } = useNormalizedHoldings();
  const [active, setActive] = React.useState<Holding | null>(null);

  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Accounts & Assets"
        description="The full normalized view of every account and holding. Click any row to drill into source, valuation, and advisor controls."
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {accounts.map((a) => {
          const acctValue = holdings
            .filter((h) => h.accountId === a.id)
            .reduce((acc, h) => acc + (h.reportingMarketValue ?? h.nativeMarketValue ?? 0), 0);
          return (
            <Card key={a.id}>
              <CardBody>
                <div className="text-2xs uppercase tracking-widest text-ink-500">{ACCOUNT_TYPE_LABELS[a.type]}</div>
                <div className="text-[13px] font-medium text-ink-900 mt-0.5 truncate">{a.name}</div>
                <div className="text-2xs text-ink-500 mt-0.5 truncate">{a.institution ?? "—"}</div>
                <div className="font-serif text-lg tabular text-ink-900 mt-1.5">{formatCurrency(acctValue, reportingCurrency, { compact: true })}</div>
                <div className="text-2xs text-ink-500">{a.baseCurrency} · {a.country ?? "—"}</div>
              </CardBody>
            </Card>
          );
        })}
      </div>

      <SectionDivider>All Holdings</SectionDivider>

      <HoldingsTable
        holdings={holdings}
        accounts={accounts}
        reportingCurrency={reportingCurrency}
        onRowClick={(h) => setActive(h)}
      />

      <Drawer open={!!active} onClose={() => setActive(null)} title="Holding Detail" width="max-w-2xl">
        {active && (
          <HoldingDetail
            holding={active}
            onSave={(patch) => {
              const updated: Holding = { ...active, ...patch, updatedAt: new Date().toISOString() };
              upsertHolding(updated);
              setActive(updated);
            }}
            onRemove={() => {
              if (confirm("Remove this holding?")) {
                removeHolding(active.id);
                setActive(null);
              }
            }}
          />
        )}
      </Drawer>
    </>
  );
}

function HoldingDetail({
  holding,
  onSave,
  onRemove,
}: {
  holding: Holding;
  onSave: (patch: Partial<Holding>) => void;
  onRemove: () => void;
}) {
  const [override, setOverride] = React.useState(holding.nativeMarketValue);
  const [notes, setNotes] = React.useState(holding.advisorNotes ?? "");
  return (
    <div className="space-y-5">
      <div>
        <div className="text-2xs uppercase tracking-widest text-ink-500">{ASSET_CLASS_LABELS[holding.assetClass]}</div>
        <h3 className="font-serif text-2xl text-ink-900 leading-tight">{holding.assetName}</h3>
        <div className="flex items-center gap-2 mt-1.5">
          {holding.identifier && <Badge tone="navy">{holding.identifier.type}: {holding.identifier.value}</Badge>}
          <Badge tone="neutral">{holding.currency}</Badge>
          {holding.country && <Badge tone="neutral">{holding.country}</Badge>}
          <QuoteTypeBadge type={holding.quoteType ?? "manual"} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-[13px]">
        <Stat label="Quantity" value={holding.quantity != null ? holding.quantity.toLocaleString() : "—"} />
        <Stat label="Price" value={holding.price != null ? formatCurrency(holding.price, holding.currency) : "—"} />
        <Stat label="Native value" value={formatCurrency(holding.nativeMarketValue, holding.currency)} />
        <Stat label="Reporting value" value={formatCurrency(holding.reportingMarketValue ?? holding.nativeMarketValue, "USD")} />
        <Stat label="Cost basis" value={holding.costBasis != null ? formatCurrency(holding.costBasis, holding.currency) : "—"} />
        <Stat label="Liquidity" value={holding.liquidity ?? "—"} />
        <Stat label="Valuation date" value={formatDate(holding.valuationDate)} />
        <Stat label="Verification" value={holding.advisorVerification.replace("_", " ")} />
      </div>

      <div className="border-t border-ink-100 pt-4">
        <div className="text-2xs uppercase tracking-widest text-ink-500 mb-1.5">Valuation Source</div>
        <ValuationSourceLine source={holding.valuationSource} />
        {holding.valuationSource.note && <div className="text-2xs text-ink-500 mt-0.5">{holding.valuationSource.note}</div>}
      </div>

      <div className="border-t border-ink-100 pt-4 space-y-3">
        <Label>Advisor override (native value)</Label>
        <Input value={override} onChange={(e) => setOverride(Number(e.target.value))} />
        <Label>Advisor notes</Label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() =>
              onSave({
                nativeMarketValue: override,
                advisorNotes: notes,
                valuationSource: { kind: "advisor_override", asOf: new Date().toISOString(), confidence: "high" },
                quoteType: "advisor_entered",
                priceFreshness: "manual",
                advisorVerification: "advisor_reviewed",
              })
            }
          >
            Save advisor override
          </Button>
          <Button
            variant="secondary"
            onClick={() => onSave({ advisorVerification: "advisor_approved" })}
          >
            Mark advisor approved
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              onSave({
                advisorVerification: "locked_for_proposal",
                proposalApprovedValue: {
                  amount: holding.nativeMarketValue,
                  currency: holding.currency,
                  source: holding.valuationSource,
                  lockedAt: new Date().toISOString(),
                },
              })
            }
          >
            Lock for proposal
          </Button>
          <Button variant="ghost" onClick={onRemove}>Remove holding</Button>
        </div>
      </div>

      {holding.dataQuality.length > 0 && (
        <div className="border-t border-ink-100 pt-4">
          <div className="text-2xs uppercase tracking-widest text-ink-500 mb-1.5">Data Quality Flags</div>
          <ul className="space-y-1.5">
            {holding.dataQuality.map((d, i) => (
              <li key={i} className="text-[13px] flex items-start gap-2">
                <Badge tone={d.severity === "critical" ? "negative" : d.severity === "warning" ? "warning" : "neutral"}>{d.severity}</Badge>
                <span>{d.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-2xs uppercase tracking-widest text-ink-500">{label}</div>
      <div className="text-ink-900 tabular">{value}</div>
    </div>
  );
}
