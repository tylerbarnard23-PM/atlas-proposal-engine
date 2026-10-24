"use client";

import * as React from "react";
import { holdingsFromIncompleteImports } from "@/engines/importCompleteness";
import { linkToHolding, unresolvedRecommendationLinks } from "@/engines/recommendationLinks";
import { ImportNotice, IncompleteImportTag } from "@/components/import/ImportNotice";
import Link from "next/link";
import { Ban, CheckCheck, CheckCircle2, Lightbulb, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useAtlasStore } from "@/store/useStore";
import { ClientOnly } from "@/components/layout/ClientOnly";
import { PageHeader } from "@/components/ui/Section";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select, Textarea } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { Drawer } from "@/components/ui/Drawer";
import { ReasonPicker } from "@/components/ui/ReasonPicker";
import type { Holding, Recommendation, RecommendationStatus, RecommendationType } from "@/domain/types";
import { proposedCashShortfalls } from "@/engines/proposalEngine";
import { useNormalizedHoldings } from "@/hooks/useNormalizedHoldings";
import { useFxNow } from "@/hooks/useFxNow";
import { hasMoneyAmounts, newRecommendation } from "@/engines/recommendationAmounts";
import { restatementMessage } from "@/engines/allocationDesk";
import { summarizePreview } from "@/components/recommendations/recEffect";
import { RecPreview } from "@/components/recommendations/RecPreview";
import { previewRecommendation } from "@/engines/recommendationPreview";
import { CurrencyReviewPanel } from "@/components/recommendations/CurrencyReviewPanel";
import { RecCurrencyField } from "@/components/recommendations/RecCurrencyField";
import { formatCurrency, formatTimestampDate, todayIso } from "@/utils/formatting";

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

const REJECT_REASONS = ["Client declined", "Not suitable", "Tax impact too high", "Timing"];

/** The holding picker's entry for a removed account link (never saved as a holding). */
const REMOVED_ACCOUNT = "__removed_account__";
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
  const accounts = useAtlasStore((s) => s.accounts);
  const upsert = useAtlasStore((s) => s.upsertRecommendation);
  const fxRates = useAtlasStore((s) => s.fxRates);
  const { holdings: normalized, reportingCurrency } = useNormalizedHoldings();
  const now = useFxNow();
  const fx = React.useMemo(() => ({ reportingCurrency, rates: fxRates, now }), [reportingCurrency, fxRates, now]);
  const shortfalls = React.useMemo(
    () => proposedCashShortfalls(normalized, recs.filter((r) => r.approvedByAdvisor), accounts, fx),
    [normalized, recs, accounts, fx]
  );
  const remove = useAtlasStore((s) => s.removeRecommendation);
  const approveAll = useAtlasStore((s) => s.approveAllRecommendations);
  const isRejected = (r: Recommendation) => r.status === "excluded";
  const pendingCount = recs.filter((r) => !r.approvedByAdvisor && !isRejected(r)).length;
  const rejectRec = useAtlasStore((s) => s.rejectRecommendation);
  const reopenRec = useAtlasStore((s) => s.reopenRecommendation);
  const [rejecting, setRejecting] = React.useState<string | null>(null);
  // Rejected ones sink to the bottom; otherwise keep the advisor's order.
  const ordered = React.useMemo(() => [...recs.filter((r) => !isRejected(r)), ...recs.filter(isRejected)], [recs]);
  const [approvedNotice, setApprovedNotice] = React.useState<number | null>(null);

  function onApproveAll() {
    const fromCopilot = recs.filter((r) => !r.approvedByAdvisor && !isRejected(r) && r.complianceNote?.includes("Proposal Copilot")).length;
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
  // Recommendations on holdings from an import that isn't fully accounted for.
  const sourceDocuments = useAtlasStore((s) => s.sourceDocuments);
  const fromIncomplete = React.useMemo(() => holdingsFromIncompleteImports(sourceDocuments, normalized), [sourceDocuments, normalized]);
  // Linked holding or account removed: kept for the advisor's review (engines/recommendationLinks).
  const unresolved = React.useMemo(
    () => new Map(unresolvedRecommendationLinks({ recommendations: recs, holdings: normalized, accounts }).map((l) => [l.recommendationId, l])),
    [recs, normalized, accounts]
  );
  // Each card's effect, simulated with the complete engine (the same
  // simulation as the editor's live preview), so cards, preview and proposal agree.
  const previews = React.useMemo(
    () =>
      Object.fromEntries(
        recs.map((r) => [r.id, previewRecommendation({ rec: r, holdings: normalized, recommendations: recs, accounts, fx, sourceDocuments })])
      ),
    [recs, normalized, accounts, fx, sourceDocuments]
  );

  function newRec() {
    setEditing(newRecommendation(reportingCurrency));
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
              {pendingCount > 0
                ? `Approve all (${pendingCount})`
                : recs.some((r) => r.approvedByAdvisor)
                ? "All approved"
                : "Nothing to approve"}
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

      <ImportNotice className="mb-4" />

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
          {ordered.map((r) => {
            const rejected = isRejected(r);
            const preview = previews[r.id];
            const effect = summarizePreview(preview);
            return (
              <Card key={r.id} className={rejected ? "opacity-80 bg-slatey-50" : undefined}>
                <CardBody>
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge tone="navy">{r.type.replace(/_/g, " ")}</Badge>
                        {rejected ? (
                          <Badge tone="negative">Rejected</Badge>
                        ) : (
                          <Badge tone={r.approvedByAdvisor ? "positive" : "warning"}>
                            {r.approvedByAdvisor ? "Approved" : "Not approved"}
                          </Badge>
                        )}
                        <Badge tone="neutral">{r.priority} priority</Badge>
                        {r.includeInPdf && <Badge tone="gold">In PDF prose</Badge>}
                        {r.relatedHoldingId && fromIncomplete.has(r.relatedHoldingId) && <IncompleteImportTag />}
                        {unresolved.has(r.id) && (
                          <Badge tone="warning" title="Relink it to a current holding or account, reject it or delete it. The final PDF waits for this review.">
                            Linked {unresolved.get(r.id)!.holdingId ? `holding ${unresolved.get(r.id)!.holdingId}` : `account ${unresolved.get(r.id)!.accountId}`} removed: review
                          </Badge>
                        )}
                      </div>
                      <h4 className={`font-serif text-lg mt-1.5 ${rejected ? "text-ink-500 line-through decoration-ink-300" : "text-ink-900"}`}>{r.title}</h4>
                      {!rejected && restatementMessage(r) && (
                        <p className="mt-1 text-[13px] text-warning-600">
                          {r.approvedByAdvisor ? "Approved before amounts were required: it keeps its saved effect. " : ""}
                          {restatementMessage(r)}
                        </p>
                      )}
                      {rejected && (
                        <p className="mt-1 text-[13px] text-negative-600">
                          Rejected{r.rejectedAt ? ` ${formatTimestampDate(r.rejectedAt)}` : ""}
                          {r.rejectionReason ? `: ${r.rejectionReason}` : ""}. Not applied to the Before / After and left out of the PDF.
                        </p>
                      )}
                      <p className="text-sm text-ink-600 mt-1 leading-relaxed">{r.rationale}</p>
                      {!rejected && (
                      <div
                        data-testid="rec-card-effect"
                        className={`mt-2 text-[12px] tabular px-2.5 py-1.5 rounded-md inline-block space-y-0.5 ${
                          effect.tone === "positive"
                            ? "bg-positive-50 text-positive-600"
                            : effect.tone === "negative"
                            ? "bg-negative-50 text-negative-600"
                            : effect.tone === "warning"
                            ? "bg-warning-50 text-warning-600"
                            : "bg-slatey-100 text-ink-700"
                        }`}
                      >
                        <div>
                          {r.approvedByAdvisor ? "↻ " : "○ "}
                          {effect.position ? `This recommendation alone: ${effect.position}` : effect.headline}
                        </div>
                        {effect.position && effect.cash && <div>{effect.cash}</div>}
                        {effect.combined && <div className="text-ink-700">{effect.combined}</div>}
                      </div>
                      )}
                      {!rejected && preview.amounts && (
                        <p className="mt-1 text-2xs text-ink-500 tabular">
                          Amount: {preview.amounts}. Any figures written in the text above are as entered, not converted.
                        </p>
                      )}
                      {!rejected && (
                        <CurrencyReviewPanel rec={r} fx={fx} onResolve={(next) => upsert({ ...next, updatedAt: todayIso() })} onEdit={() => setEditing(r)} />
                      )}
                    </div>
                    <div className="flex flex-col gap-2 shrink-0">
                      {rejected ? (
                        <Button size="sm" variant="secondary" iconLeft={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => reopenRec(r.id)}>
                          Reopen
                        </Button>
                      ) : (
                        <>
                          <Button size="sm" variant="secondary" onClick={() => setEditing(r)}>Edit</Button>
                          <Button
                            size="sm"
                            variant={r.approvedByAdvisor ? "secondary" : "primary"}
                            disabled={!r.approvedByAdvisor && !!restatementMessage(r)}
                            title={!r.approvedByAdvisor && restatementMessage(r) ? "Enter an explicit amount first" : undefined}
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
                            className="text-negative-600 hover:bg-negative-50"
                            aria-label={`Reject ${r.title}`}
                            iconLeft={<Ban className="h-3.5 w-3.5" />}
                            onClick={() => setRejecting(rejecting === r.id ? null : r.id)}
                          >
                            Reject
                          </Button>
                        </>
                      )}
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
                  {rejecting === r.id && !rejected && (
                    <ReasonPicker
                      className="mt-3"
                      tone="negative"
                      prompt="Why reject this recommendation? (optional, kept for the record)"
                      reasons={REJECT_REASONS}
                      confirmLabel="Reject recommendation"
                      onConfirm={(reason) => {
                        rejectRec(r.id, reason);
                        setRejecting(null);
                      }}
                      onCancel={() => setRejecting(null)}
                    />
                  )}
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
            wasApproved={!!recs.find((x) => x.id === editing.id)?.approvedByAdvisor}
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
  wasApproved,
  onChange,
  onSave,
  onRemove,
}: {
  value: Recommendation;
  wasApproved: boolean;
  onChange: (p: Partial<Recommendation>) => void;
  onSave: () => void;
  onRemove: () => void;
}) {
  const { holdings, reportingCurrency } = useNormalizedHoldings();
  const fxRates = useAtlasStore((s) => s.fxRates);
  const now = useFxNow();
  const fx = React.useMemo(() => ({ reportingCurrency, rates: fxRates, now }), [reportingCurrency, fxRates, now]);
  const accounts = useAtlasStore((s) => s.accounts);
  const accountById = React.useMemo(
    () => Object.fromEntries(accounts.map((a) => [a.id, a])),
    [accounts]
  );
  const savedRecs = useAtlasStore((s) => s.recommendations);
  const sourceDocuments = useAtlasStore((s) => s.sourceDocuments);
  // Live: the edited recommendation (not yet saved) simulated with the
  // complete engine; its saved version is replaced by id, never added twice.
  const preview = React.useMemo(
    () => previewRecommendation({ rec: value, holdings, recommendations: savedRecs, accounts, fx, sourceDocuments }),
    [value, holdings, savedRecs, accounts, fx, sourceDocuments]
  );
  const targetSet = value.proposedValue != null;
  // An account-only recommendation whose account was removed: shown, so None can clear it.
  const removedAccountOnly = !value.relatedHoldingId && !!value.relatedAccountId && !accountById[value.relatedAccountId];

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
      <RecCurrencyField value={value} fx={fx} onChange={(next) => onChange(next)} />

      <div className="border-t border-ink-100 pt-3">
        <Label>Linked holding</Label>
        <Select
          value={value.relatedHoldingId ?? (removedAccountOnly ? REMOVED_ACCOUNT : "")}
          onChange={(e) => {
            if (e.target.value === REMOVED_ACCOUNT) return;
            // Holding and account links change together (engines/recommendationLinks).
            onChange(linkToHolding(value, e.target.value || undefined, { holdings, accounts }));
          }}
        >
          <option value="">— None (advisory only) —</option>
          {value.relatedHoldingId && !holdings.some((h) => h.id === value.relatedHoldingId) && (
            <option value={value.relatedHoldingId}>Removed holding ({value.relatedHoldingId}): choose a current one or None</option>
          )}
          {removedAccountOnly && <option value={REMOVED_ACCOUNT}>Removed account ({value.relatedAccountId}): choose a holding or None</option>}
          {holdings.map((h) => {
            const acct = accountById[h.accountId];
            return (
              <option key={h.id} value={h.id}>
                {h.assetName} {h.identifier ? `(${h.identifier.value})` : ""} · {acct?.name ?? "—"}
              </option>
            );
          })}
        </Select>

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
                disabled={(!value.relatedHoldingId && value.type !== "buy") || targetSet}
                aria-label="Action amount"
              />
              <Select
                className="w-20"
                value={value.actionAmountUnit ?? "amount"}
                onChange={(e) =>
                  onChange({ actionAmountUnit: e.target.value as "amount" | "percent" })
                }
                aria-label="Action amount unit"
              >
                <option value="amount">{value.currency}</option>
                <option value="percent">%</option>
              </Select>
            </div>
            <div className={`text-2xs mt-1 ${targetSet ? "text-warning-600 font-medium" : "text-ink-500"}`} data-testid="action-amount-note">
              {targetSet
                ? "Ignored while a target value is set: the target takes precedence. Clear the target to use an action amount."
                : value.actionAmountUnit === "percent"
                ? "Percent of the linked holding's current value."
                : `Absolute amount in ${value.currency}.`}
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
              aria-label="Proposed value"
            />
            <div className="text-2xs text-ink-500 mt-1">
              In {value.currency}. Wins over the action amount if both are set.
            </div>
          </div>
        </div>

        <div className="mt-3">
          <RecPreview preview={preview} />
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
            <div className="text-2xs text-ink-500">
              Approving applies this recommendation to the Before / After allocation immediately.
              {wasApproved && " Changing its amounts, currency, linked holding or type clears the approval when you save; approve it again afterwards."}
            </div>
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
