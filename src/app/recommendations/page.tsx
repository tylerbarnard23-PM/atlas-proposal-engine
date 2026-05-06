"use client";

import * as React from "react";
import Link from "next/link";
import { Lightbulb, Plus } from "lucide-react";
import { useAtlasStore } from "@/store/useStore";
import { ClientOnly } from "@/components/layout/ClientOnly";
import { PageHeader } from "@/components/ui/Section";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select, Textarea } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { Drawer } from "@/components/ui/Drawer";
import type { Recommendation, RecommendationStatus, RecommendationType } from "@/domain/types";
import { safeId, todayIso } from "@/utils/formatting";

const TYPES: RecommendationType[] = [
  "buy", "sell", "hold", "reduce", "increase", "rebalance", "transfer",
  "consolidate_accounts", "tax_loss_harvest", "improve_asset_location",
  "currency_hedge", "replace_high_fee_fund", "increase_diversification",
  "reduce_concentration", "raise_cash", "add_income_strategy",
  "add_downside_protection", "add_insurance_coverage", "adjust_risk_level",
  "refinance_liability", "pay_down_debt", "review_private_valuation",
  "review_source_data", "refresh_market_data", "request_updated_statement",
  "custom",
];

const STATUSES: RecommendationStatus[] = ["draft", "needs_review", "approved", "excluded", "implemented"];

export default function RecommendationsPage() {
  return (
    <ClientOnly>
      <Inner />
    </ClientOnly>
  );
}

function Inner() {
  const recs = useAtlasStore((s) => s.recommendations);
  const upsert = useAtlasStore((s) => s.upsertRecommendation);
  const remove = useAtlasStore((s) => s.removeRecommendation);
  const [editing, setEditing] = React.useState<Recommendation | null>(null);

  function newRec() {
    setEditing({
      id: safeId("rec"),
      title: "",
      type: "custom",
      currency: "USD",
      rationale: "",
      priority: "medium",
      status: "draft",
      includeInPdf: false,
      approvedByAdvisor: false,
      createdAt: todayIso(),
      updatedAt: todayIso(),
    });
  }

  return (
    <>
      <PageHeader
        eyebrow="Advisor Recommendations"
        title="Recommendation Builder"
        description="Only advisor-approved recommendations marked Include in PDF appear in the final client proposal."
        actions={
          <>
            <Link href="/insights">
              <Button variant="secondary" iconLeft={<Lightbulb className="h-4 w-4" />}>
                Browse insights
              </Button>
            </Link>
            <Button onClick={newRec} iconLeft={<Plus className="h-4 w-4" />}>
              New recommendation
            </Button>
          </>
        }
      />

      {recs.length === 0 ? (
        <EmptyState
          title="No recommendations yet"
          description="Two ways to add one: write a recommendation directly, or open Insights and convert any rules-based observation into a draft you can edit and approve."
          action={
            <div className="flex flex-wrap gap-2 justify-center">
              <Button onClick={newRec} iconLeft={<Plus className="h-4 w-4" />}>
                Write a recommendation
              </Button>
              <Link href="/insights">
                <Button variant="secondary" iconLeft={<Lightbulb className="h-4 w-4" />}>
                  Browse insights
                </Button>
              </Link>
            </div>
          }
        />
      ) : (
        <div className="space-y-3">
          {recs.map((r) => (
            <Card key={r.id}>
              <CardBody>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge tone="navy">{r.type.replace(/_/g, " ")}</Badge>
                      <Badge tone={r.status === "approved" ? "positive" : r.status === "needs_review" ? "warning" : "neutral"}>
                        {r.status.replace("_", " ")}
                      </Badge>
                      <Badge tone="neutral">{r.priority} priority</Badge>
                      {r.includeInPdf && <Badge tone="gold">In PDF</Badge>}
                    </div>
                    <h4 className="font-serif text-lg text-ink-900 mt-1.5">{r.title}</h4>
                    <p className="text-sm text-ink-600 mt-1 leading-relaxed">{r.rationale}</p>
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    <Button size="sm" variant="secondary" onClick={() => setEditing(r)}>Edit</Button>
                    <Button
                      size="sm"
                      variant={r.approvedByAdvisor ? "secondary" : "primary"}
                      onClick={() =>
                        upsert({
                          ...r,
                          approvedByAdvisor: !r.approvedByAdvisor,
                          status: !r.approvedByAdvisor ? "approved" : r.status,
                          includeInPdf: !r.approvedByAdvisor ? true : r.includeInPdf,
                        })
                      }
                    >
                      {r.approvedByAdvisor ? "Unapprove" : "Approve"}
                    </Button>
                  </div>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <Drawer open={!!editing} onClose={() => setEditing(null)} title="Edit recommendation">
        {editing && (
          <RecForm
            value={editing}
            onChange={(p) => setEditing({ ...editing, ...p })}
            onSave={() => {
              upsert({ ...editing!, updatedAt: todayIso() });
              setEditing(null);
            }}
            onRemove={() => {
              remove(editing.id);
              setEditing(null);
            }}
          />
        )}
      </Drawer>
    </>
  );
}

function RecForm({
  value,
  onChange,
  onSave,
  onRemove,
}: {
  value: Recommendation;
  onChange: (p: Partial<Recommendation>) => void;
  onSave: () => void;
  onRemove: () => void;
}) {
  const holdings = useAtlasStore((s) => s.holdings);
  const accounts = useAtlasStore((s) => s.accounts);
  const accountById = React.useMemo(
    () => Object.fromEntries(accounts.map((a) => [a.id, a])),
    [accounts]
  );
  const linkedHolding = holdings.find((h) => h.id === value.relatedHoldingId);
  const currentValue = linkedHolding
    ? linkedHolding.reportingMarketValue ?? linkedHolding.nativeMarketValue
    : undefined;

  // Hint sentence describing what the engine will do with this rec given its
  // type + amount + linked holding. Helps advisors understand the proposed view.
  const effectHint = React.useMemo(() => {
    if (!value.relatedHoldingId) {
      return "Without a linked holding, this recommendation will appear in the proposal text but won't shift the Before / After allocation.";
    }
    if (value.proposedValue != null) {
      return `Proposed view will set this holding's value to ${value.proposedValue.toLocaleString()}.`;
    }
    const amt = value.actionAmount != null ? Math.abs(value.actionAmount).toLocaleString() : null;
    switch (value.type) {
      case "sell":
      case "raise_cash":
        return "Proposed view will zero out this holding.";
      case "reduce":
      case "reduce_concentration":
        return amt
          ? `Proposed view will reduce this holding by ${amt}.`
          : "No action amount set — proposed view will halve this holding.";
      case "increase":
      case "buy":
        return amt
          ? `Proposed view will increase this holding by ${amt}.`
          : "Set an action amount to shift the Before / After allocation.";
      case "rebalance":
        return value.actionAmount != null
          ? `Proposed view will adjust this holding by ${value.actionAmount.toLocaleString()} (signed).`
          : "Set a signed action amount (positive = add, negative = trim).";
      case "tax_loss_harvest":
      case "replace_high_fee_fund":
      case "improve_asset_location":
        return "Net-flat on allocation — same exposure, different vehicle/lot.";
      default:
        return "Allocation unchanged unless you set a proposed value.";
    }
  }, [value.type, value.actionAmount, value.proposedValue, value.relatedHoldingId]);

  return (
    <div className="space-y-3">
      <Label>Title</Label>
      <Input value={value.title} onChange={(e) => onChange({ title: e.target.value })} />
      <Label>Type</Label>
      <Select value={value.type} onChange={(e) => onChange({ type: e.target.value as RecommendationType })}>
        {TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
      </Select>
      <Label>Status</Label>
      <Select value={value.status} onChange={(e) => onChange({ status: e.target.value as RecommendationStatus })}>
        {STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
      </Select>
      <Label>Priority</Label>
      <Select value={value.priority} onChange={(e) => onChange({ priority: e.target.value as Recommendation["priority"] })}>
        <option value="low">Low</option>
        <option value="medium">Medium</option>
        <option value="high">High</option>
      </Select>
      <Label>Currency</Label>
      <Input value={value.currency} onChange={(e) => onChange({ currency: e.target.value })} />

      <div className="border-t border-ink-100 pt-3">
        <Label>Linked holding</Label>
        <Select
          value={value.relatedHoldingId ?? ""}
          onChange={(e) => onChange({ relatedHoldingId: e.target.value || undefined })}
        >
          <option value="">— None (advisory only) —</option>
          {holdings.map((h) => {
            const acct = accountById[h.accountId];
            return (
              <option key={h.id} value={h.id}>
                {h.assetName} {h.identifier ? `(${h.identifier.value})` : ""} · {acct?.name ?? "—"}
              </option>
            );
          })}
        </Select>
        {linkedHolding && currentValue != null && (
          <div className="text-2xs text-ink-500 mt-1.5">
            Current value: {currentValue.toLocaleString()} {linkedHolding.currency}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 mt-3">
          <div>
            <Label>Action amount (optional)</Label>
            <Input
              type="number"
              value={value.actionAmount ?? ""}
              onChange={(e) =>
                onChange({ actionAmount: e.target.value === "" ? undefined : Number(e.target.value) })
              }
              placeholder={value.type === "rebalance" ? "Signed (negative trims)" : "e.g. 50000"}
              disabled={!value.relatedHoldingId && value.type !== "buy"}
            />
          </div>
          <div>
            <Label>Proposed value (override)</Label>
            <Input
              type="number"
              value={value.proposedValue ?? ""}
              onChange={(e) =>
                onChange({ proposedValue: e.target.value === "" ? undefined : Number(e.target.value) })
              }
              placeholder="e.g. 0 to fully sell"
              disabled={!value.relatedHoldingId}
            />
          </div>
        </div>

        <div className="text-2xs text-ink-600 bg-slatey-50 border border-ink-100 rounded p-2 mt-2 leading-relaxed">
          <span className="font-semibold text-ink-800">Effect on Before / After:</span> {effectHint}
        </div>
      </div>

      <Label>Rationale</Label>
      <Textarea rows={4} value={value.rationale} onChange={(e) => onChange({ rationale: e.target.value })} />
      <Label>Client benefit</Label>
      <Textarea rows={2} value={value.clientBenefit ?? ""} onChange={(e) => onChange({ clientBenefit: e.target.value })} />
      <Label>Risk / tradeoff</Label>
      <Textarea rows={2} value={value.riskTradeoff ?? ""} onChange={(e) => onChange({ riskTradeoff: e.target.value })} />
      <Label>Tax note</Label>
      <Textarea rows={2} value={value.taxNote ?? ""} onChange={(e) => onChange({ taxNote: e.target.value })} />
      <Label>Implementation step</Label>
      <Textarea rows={2} value={value.implementationStep ?? ""} onChange={(e) => onChange({ implementationStep: e.target.value })} />
      <label className="flex items-center gap-2 text-[13px]">
        <input
          type="checkbox"
          checked={value.includeInPdf}
          onChange={(e) => onChange({ includeInPdf: e.target.checked })}
        />
        Include in client PDF
      </label>
      <label className="flex items-center gap-2 text-[13px]">
        <input
          type="checkbox"
          checked={value.approvedByAdvisor}
          onChange={(e) => onChange({ approvedByAdvisor: e.target.checked })}
        />
        Advisor approved
      </label>
      <div className="flex gap-2 pt-3 border-t border-ink-100">
        <Button onClick={onSave}>Save</Button>
        <Button variant="ghost" onClick={onRemove}>Delete</Button>
      </div>
    </div>
  );
}
