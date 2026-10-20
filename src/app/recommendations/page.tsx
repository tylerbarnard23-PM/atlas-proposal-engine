"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCheck, CheckCircle2, Lightbulb, Plus, Trash2 } from "lucide-react";
import { useAtlasStore } from "@/store/useStore";
import { ClientOnly } from "@/components/layout/ClientOnly";
import { PageHeader } from "@/components/ui/Section";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select, Textarea } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { Drawer } from "@/components/ui/Drawer";
import type { Holding, Recommendation, RecommendationStatus, RecommendationType } from "@/domain/types";
import { applyRecToValue, proposedCashShortfalls } from "@/engines/proposalEngine";
import { useNormalizedHoldings } from "@/hooks/useNormalizedHoldings";
import { formatCurrency, safeId, todayIso } from "@/utils/formatting";

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
  const holdings = useAtlasStore((s) => s.holdings);
  const accounts = useAtlasStore((s) => s.accounts);
  const upsert = useAtlasStore((s) => s.upsertRecommendation);
  const { holdings: normalized, reportingCurrency } = useNormalizedHoldings();
  const shortfalls = React.useMemo(
    () => proposedCashShortfalls(normalized, recs.filter((r) => r.approvedByAdvisor), accounts),
    [normalized, recs, accounts]
  );
  const remove = useAtlasStore((s) => s.removeRecommendation);
  const approveAll = useAtlasStore((s) => s.approveAllRecommendations);
  const pendingCount = recs.filter((r) => !r.approvedByAdvisor).length;
  const [approvedNotice, setApprovedNotice] = React.useState<number | null>(null);

  function onApproveAll() {
    const fromCopilot = recs.filter((r) => !r.approvedByAdvisor && r.complianceNote?.includes("Proposal Copilot")).length;
    const ok = confirm(
      `Approve ${pendingCount} recommendation${pendingCount === 1 ? "" : "s"} and include ${pendingCount === 1 ? "it" : "them"} in the PDF?` +
        (fromCopilot ? `\n\n${fromCopilot} of these were drafted by the Proposal Copilot.` : "") +
        "\n\nApproved recommendations reshape the Before / After allocation and appear in the client proposal. You can unapprove any of them afterwards."
    );
    if (ok) setApprovedNotice(approveAll());
  }
  const [editing, setEditing] = React.useState<Recommendation | null>(null);
  // Delete straight from the list, with Undo instead of a confirm dialog.
  const [deleted, setDeleted] = React.useState<{ rec: Recommendation; index: number } | null>(null);
  const restore = useAtlasStore((s) => s.restoreRecommendation);
  function deleteRec(r: Recommendation) {
    setDeleted({ rec: r, index: recs.findIndex((x) => x.id === r.id) });
    remove(r.id);
  }
  const holdingsById = React.useMemo(
    () => Object.fromEntries(holdings.map((h) => [h.id, h])),
    [holdings]
  );

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
        description="Approving a recommendation reshapes the Before / After allocation immediately. The Include-in-PDF toggle controls only whether its prose appears in the final document. Holding values are confirmed separately, in Accounts & Assets."
        actions={
          <>
            <Link href="/insights">
              <Button variant="secondary" iconLeft={<Lightbulb className="h-4 w-4" />}>
                Browse insights
              </Button>
            </Link>
            <Button
              variant="secondary"
              onClick={onApproveAll}
              disabled={pendingCount === 0}
              iconLeft={<CheckCheck className="h-4 w-4" />}
            >
              {pendingCount === 0 ? "All approved" : `Approve all (${pendingCount})`}
            </Button>
            <Button onClick={newRec} iconLeft={<Plus className="h-4 w-4" />}>
              New recommendation
            </Button>
          </>
        }
      />

      {approvedNotice != null && approvedNotice > 0 && (
        <div role="status" className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-positive-50 ring-1 ring-inset ring-positive-500/40 px-4 py-2.5 text-[13px]">
          <span className="inline-flex items-center gap-1.5 font-semibold text-positive-600">
            <CheckCircle2 className="h-4 w-4" />
            Approved {approvedNotice} recommendation{approvedNotice === 1 ? "" : "s"} and included {approvedNotice === 1 ? "it" : "them"} in the PDF.
          </span>
          <Link href="/pdf-preview" className="font-medium text-navy-700 hover:underline">Check readiness in PDF Preview →</Link>
        </div>
      )}

      {deleted && (
        <div role="status" className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-slatey-50 ring-1 ring-inset ring-ink-200 px-4 py-2.5 text-[13px] text-ink-800">
          <span>Deleted &ldquo;{deleted.rec.title || "Untitled recommendation"}&rdquo;.</span>
          <button
            className="font-medium text-navy-700 hover:underline"
            onClick={() => {
              restore(deleted.rec, deleted.index);
              setDeleted(null);
            }}
          >
            Undo
          </button>
          <button className="ml-auto text-ink-500 hover:text-ink-800" onClick={() => setDeleted(null)}>Dismiss</button>
        </div>
      )}

      {shortfalls.length > 0 && (
        <div role="alert" className="mb-4 rounded-md bg-negative-50 ring-1 ring-inset ring-negative-500/30 px-4 py-3 text-[13px] text-ink-800">
          <div className="font-semibold text-negative-600">Approved purchases exceed available cash</div>
          <p className="mt-0.5">
            {shortfalls
              .map((sf) => `${sf.accountName} is short ${formatCurrency(sf.shortfall, reportingCurrency, { compact: true })}`)
              .join("; ")}
            . Reduce a purchase or add a sale in the same account. The final PDF stays locked until this is fixed.
          </p>
        </div>
      )}

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
          {recs.map((r) => {
            const linked = r.relatedHoldingId ? holdingsById[r.relatedHoldingId] : undefined;
            const effect = describeRecEffect(r, linked);
            return (
              <Card key={r.id}>
                <CardBody>
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge tone="navy">{r.type.replace(/_/g, " ")}</Badge>
                        <Badge tone={r.approvedByAdvisor ? "positive" : "warning"}>
                          {r.approvedByAdvisor ? "Approved" : "Not approved"}
                        </Badge>
                        <Badge tone="neutral">{r.priority} priority</Badge>
                        {r.includeInPdf && <Badge tone="gold">In PDF prose</Badge>}
                      </div>
                      <h4 className="font-serif text-lg text-ink-900 mt-1.5">{r.title}</h4>
                      <p className="text-sm text-ink-600 mt-1 leading-relaxed">{r.rationale}</p>
                      <div
                        className={`mt-2 text-[12px] tabular px-2.5 py-1.5 rounded-md inline-block ${
                          effect.tone === "positive"
                            ? "bg-positive-50 text-positive-600"
                            : effect.tone === "negative"
                            ? "bg-negative-50 text-negative-600"
                            : effect.tone === "warning"
                            ? "bg-warning-50 text-warning-600"
                            : "bg-slatey-100 text-ink-700"
                        }`}
                      >
                        {r.approvedByAdvisor ? "↻ " : "○ "}
                        {effect.label}
                      </div>
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
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Delete ${r.title}`}
                        iconLeft={<Trash2 className="h-3.5 w-3.5" />}
                        onClick={() => deleteRec(r)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                </CardBody>
              </Card>
            );
          })}
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
              const existing = recs.find((x) => x.id === editing.id);
              if (existing) deleteRec(existing);
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

  // Single source of truth for the effect summary — runs the same per-rec
  // engine helper used by applyRecommendationsToProposed and the card-level
  // summary, so the form, the cards, and the proposal can never disagree.
  const effectHint = React.useMemo(() => {
    if (!value.relatedHoldingId) {
      return "Without a linked holding, this recommendation will appear in the proposal text but won't shift the Before / After allocation.";
    }
    if (!linkedHolding || currentValue == null) {
      return "Linked holding no longer exists.";
    }
    const after = applyRecToValue(currentValue, value, !!linkedHolding.isLiability);
    if (Math.abs(after - currentValue) < 1 && value.proposedValue == null) {
      switch (value.type) {
        case "tax_loss_harvest":
        case "replace_high_fee_fund":
        case "improve_asset_location":
          return "Net-flat on allocation — same exposure, different vehicle/lot.";
        default:
          return "No allocation shift yet — set an action amount or proposed value.";
      }
    }
    const delta = after - currentValue;
    const cashDirection = delta < 0 ? "credit" : "debit";
    const cashAbs = formatCurrency(Math.abs(delta), linkedHolding.currency, { compact: true });
    return `${linkedHolding.assetName}: ${formatCurrency(currentValue, linkedHolding.currency, { compact: true })} → ${formatCurrency(after, linkedHolding.currency, { compact: true })}. Cash ${cashDirection} ${cashAbs} in the same account.`;
  }, [value, linkedHolding, currentValue]);

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
            <div className="flex gap-1.5">
              <Input
                type="number"
                value={value.actionAmount ?? ""}
                onChange={(e) =>
                  onChange({ actionAmount: e.target.value === "" ? undefined : Number(e.target.value) })
                }
                placeholder={
                  value.actionAmountUnit === "percent"
                    ? "e.g. 40 for 40%"
                    : value.type === "rebalance"
                    ? "Signed (negative trims)"
                    : "e.g. 50000"
                }
                disabled={!value.relatedHoldingId && value.type !== "buy"}
              />
              <Select
                className="w-20"
                value={value.actionAmountUnit ?? "amount"}
                onChange={(e) =>
                  onChange({ actionAmountUnit: e.target.value as "amount" | "percent" })
                }
                aria-label="Action amount unit"
              >
                <option value="amount">$</option>
                <option value="percent">%</option>
              </Select>
            </div>
            <div className="text-2xs text-ink-500 mt-1">
              {value.actionAmountUnit === "percent"
                ? "Percent of the linked holding's current value."
                : "Absolute amount in the recommendation's currency."}
            </div>
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
            <div className="text-2xs text-ink-500 mt-1">
              Wins over the action amount if both are set.
            </div>
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
      <div className="border-t border-ink-100 pt-3 space-y-2">
        <label className="flex items-start gap-2 text-[13px]">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={value.approvedByAdvisor}
            onChange={(e) => onChange({ approvedByAdvisor: e.target.checked })}
          />
          <div>
            <div className="font-medium text-ink-900">Advisor approved</div>
            <div className="text-2xs text-ink-500">Approving applies this recommendation to the Before / After allocation immediately.</div>
          </div>
        </label>
        <label className="flex items-start gap-2 text-[13px]">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={value.includeInPdf}
            onChange={(e) => onChange({ includeInPdf: e.target.checked })}
          />
          <div>
            <div className="font-medium text-ink-900">Include in client PDF</div>
            <div className="text-2xs text-ink-500">Adds this recommendation's prose to the Recommendations section. Independent of the math toggle above.</div>
          </div>
        </label>
      </div>
      <div className="flex gap-2 pt-3 border-t border-ink-100">
        <Button onClick={onSave}>Save</Button>
        <Button variant="ghost" onClick={onRemove}>Delete</Button>
      </div>
    </div>
  );
}

// Tiny effect summary used on each recommendation card. Calls the same
// per-rec helper the engine uses so the UI never drifts from the math.
function describeRecEffect(
  rec: Recommendation,
  linked: Holding | undefined
): { label: string; tone: "neutral" | "positive" | "negative" | "warning" } {
  if (!rec.relatedHoldingId) {
    return { label: "Advisory only — no allocation impact.", tone: "neutral" };
  }
  if (!linked) {
    return { label: "Linked holding no longer exists.", tone: "warning" };
  }
  const before = linked.reportingMarketValue ?? linked.nativeMarketValue;
  const after = applyRecToValue(before, rec, !!linked.isLiability);
  const delta = after - before;
  if (Math.abs(delta) < 1 && rec.proposedValue == null) {
    return {
      label: `${linked.assetName}: no shift yet — set an action amount or proposed value.`,
      tone: "warning",
    };
  }
  const cashDelta = linked.isLiability && delta > 0 ? -delta : -delta; // sale credits cash
  const cashLabel =
    cashDelta === 0
      ? ""
      : ` · Cash ${cashDelta > 0 ? "+" : "−"}${formatCurrency(Math.abs(cashDelta), linked.currency, { compact: true })}`;
  const sign = delta < 0 ? "−" : "+";
  return {
    label: `${linked.assetName}: ${formatCurrency(before, linked.currency, { compact: true })} → ${formatCurrency(
      after,
      linked.currency,
      { compact: true }
    )} (${sign}${formatCurrency(Math.abs(delta), linked.currency, { compact: true })})${cashLabel}`,
    tone: delta < 0 ? "negative" : "positive",
  };
}
