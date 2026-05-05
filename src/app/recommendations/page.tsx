"use client";

import * as React from "react";
import { useAtlasStore } from "@/store/useStore";
import { ClientOnly } from "@/components/layout/ClientOnly";
import { PageHeader } from "@/components/ui/Section";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
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
        actions={<Button onClick={newRec}>New recommendation</Button>}
      />

      {recs.length === 0 ? (
        <EmptyState
          title="No recommendations yet"
          description="Convert an insight or create one manually."
          action={<Button onClick={newRec}>New recommendation</Button>}
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
