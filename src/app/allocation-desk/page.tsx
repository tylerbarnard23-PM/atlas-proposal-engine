"use client";

import * as React from "react";
import Link from "next/link";
import { useAtlasStore } from "@/store/useStore";
import { ClientOnly } from "@/components/layout/ClientOnly";
import { PageHeader, SectionDivider } from "@/components/ui/Section";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useNormalizedHoldings } from "@/hooks/useNormalizedHoldings";
import { useFxNow } from "@/hooks/useFxNow";
import type { AssetClass, Recommendation } from "@/domain/types";
import { ASSET_CLASS_LABELS } from "@/domain/assetTaxonomy";
import {
  evaluateDesk,
  inputsChanged,
  editablePosition,
  positionEditRecommendation,
  restatementMessage,
  scopeCandidates,
  type DeskPosition,
  type DeskView,
  type PositionEditKind,
} from "@/engines/allocationDesk";
import { previewRecommendation } from "@/engines/recommendationPreview";
import { formatCalendarDate, formatCurrency, formatTimestampDate, safeId } from "@/utils/formatting";

// D1 — the working allocation desk. Every figure comes from engines/
// allocationDesk (the shared proposal engine underneath); this page only
// shows it and records the advisor's draft choices. Nothing here changes a
// current holding, approves anything or changes the final-PDF inputs.

export default function AllocationDeskPage() {
  return (
    <ClientOnly>
      <Desk />
    </ClientOnly>
  );
}

const pctText = (n: number | null) => (n == null ? "—" : `${n.toFixed(1)}%`);
const signed = (n: number, f: (x: number) => string) => (Math.abs(n) < 0.005 ? f(0) : `${n > 0 ? "+" : "−"}${f(Math.abs(n))}`);

function Desk() {
  const { holdings, reportingCurrency } = useNormalizedHoldings();
  const accounts = useAtlasStore((s) => s.accounts);
  const recommendations = useAtlasStore((s) => s.recommendations);
  const fxRates = useAtlasStore((s) => s.fxRates);
  const sourceDocuments = useAtlasStore((s) => s.sourceDocuments);
  const draft = useAtlasStore((s) => s.workingDraft);
  const setScope = useAtlasStore((s) => s.setDraftScope);
  const setMember = useAtlasStore((s) => s.setDraftMember);
  const setTarget = useAtlasStore((s) => s.setDraftTarget);
  const addEdit = useAtlasStore((s) => s.addDraftEdit);
  const recordInputs = useAtlasStore((s) => s.recordDraftInputs);
  const now = useFxNow();
  const [view, setView] = React.useState<DeskView>("draft");
  const [editing, setEditing] = React.useState<DeskPosition | null>(null);

  const fx = React.useMemo(() => ({ reportingCurrency, rates: fxRates, now }), [reportingCurrency, fxRates, now]);
  const d = React.useMemo(() => evaluateDesk({ holdings, accounts, recommendations, draft, fx, view }), [holdings, accounts, recommendations, draft, fx, view]);
  const money = (n: number) => formatCurrency(n, reportingCurrency);
  const changed = inputsChanged(draft.inputBasis, holdings, reportingCurrency);
  const candidates = scopeCandidates(accounts);
  const inScope = new Set(d.scope.accountIds);
  const toggleScope = (id: string) => setScope(inScope.has(id) ? d.scope.accountIds.filter((x) => x !== id) : [...d.scope.accountIds, id]);
  const live = recommendations.filter((r) => r.status !== "excluded");
  const members = new Set(draft.memberIds);

  return (
    <>
      <PageHeader
        eyebrow="Advisory"
        title="Allocation desk"
        description="Choose the investment scope, set target weights and preview explicit changes to positions you already hold. A preview never changes current holdings, approvals or the final PDF."
      />

      <Card className="mb-5">
        <CardBody className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-[13px] text-ink-700 leading-relaxed max-w-3xl">
            {view === "draft" ? (
              <>
                Previewing the <strong>working draft</strong>: {d.actions.length} action{d.actions.length === 1 ? "" : "s"}
                {d.unapprovedInDraft.length > 0 && <>, {d.unapprovedInDraft.length} not yet approved (not in the final PDF)</>}.
              </>
            ) : (
              <>
                Previewing the <strong>approved subset</strong>: the {d.actions.length} approved action{d.actions.length === 1 ? "" : "s"} the final PDF uses.
              </>
            )}{" "}
            {view === "draft" && d.approvedOutsideDraft.length > 0 && (
              <span className="text-warning-600">
                {d.approvedOutsideDraft.length} approved action{d.approvedOutsideDraft.length === 1 ? " isn't" : "s aren't"} in this draft; the final PDF still includes {d.approvedOutsideDraft.length === 1 ? "it" : "them"}.
              </span>
            )}
          </div>
          <div role="group" aria-label="Preview" className="flex gap-1">
            <Button size="sm" variant={view === "draft" ? "primary" : "secondary"} aria-pressed={view === "draft"} onClick={() => setView("draft")}>Working draft</Button>
            <Button size="sm" variant={view === "approved" ? "primary" : "secondary"} aria-pressed={view === "approved"} onClick={() => setView("approved")}>Approved subset</Button>
          </div>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>Allocation of the selected scope</CardTitle>
              <span className="text-2xs text-ink-500">Weights are of {money(d.totals.current)} in scope (proposed {money(d.totals.proposed)}); liabilities and context assets are excluded.</span>
            </div>
          </CardHeader>
          <CardBody className="p-0! overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-ink-500 text-left">
                  <th className="px-4 py-2 font-medium">Asset class</th>
                  <th className="px-3 py-2 font-medium text-right">Current</th>
                  <th className="px-3 py-2 font-medium text-right">Proposed</th>
                  <th className="px-3 py-2 font-medium text-right">Target %</th>
                  <th className="px-3 py-2 font-medium text-right">Target amount</th>
                  <th className="px-4 py-2 font-medium text-right">Drift (proposed − target)</th>
                </tr>
              </thead>
              <tbody>
                {d.rows.map((r) => (
                  <tr key={r.assetClass} className="border-t border-ink-100">
                    <td className="px-4 py-2 text-ink-900">{r.label}</td>
                    <td className="px-3 py-2 text-right tabular">{money(r.current)} <span className="text-ink-500">· {pctText(r.currentPct)}</span></td>
                    <td className="px-3 py-2 text-right tabular">{money(r.proposed)} <span className="text-ink-500">· {pctText(r.proposedPct)}</span></td>
                    <td className="px-3 py-2 text-right">
                      <TargetInput assetClass={r.assetClass} value={r.targetPct} onChange={setTarget} />
                    </td>
                    <td className="px-3 py-2 text-right tabular">{r.targetAmount == null ? "—" : money(r.targetAmount)}</td>
                    <td className={`px-4 py-2 text-right tabular ${r.drift != null && Math.abs(r.drift) >= 0.5 ? "text-warning-600" : ""}`}>
                      {r.drift == null ? "No target" : `${signed(r.drift, money)} · ${signed(r.driftPts ?? 0, (x) => `${x.toFixed(1)} pts`)}`}
                    </td>
                  </tr>
                ))}
                <AddTargetRow existing={new Set(d.rows.map((r) => r.assetClass))} onAdd={(c) => setTarget(c, 0)} />
              </tbody>
            </table>
            <p className="px-4 py-3 text-2xs text-ink-500 leading-relaxed border-t border-ink-100">
              Targets total {d.targetSum.toFixed(1)}%{Math.abs(d.targetSum - 100) >= 0.05 && d.targetSum > 0 ? `; ${(100 - d.targetSum).toFixed(1)}% unassigned` : ""}. A target is a desired weight: it creates no trades. Drift stays visible until you add explicit actions; new investments and automatic rebalancing come later (D2).
            </p>
          </CardBody>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader><CardTitle>Investment scope</CardTitle></CardHeader>
            <CardBody className="space-y-2 text-[13px]">
              {!d.scope.chosen && <p className="text-2xs text-warning-600">Scope not chosen yet: every non-liability account is shown. Untick accounts to leave them as context.</p>}
              {candidates.map((a) => {
                const v = d.scope.accounts.find((x) => x.id === a.id)?.current ?? d.context.accounts.find((x) => x.id === a.id)?.value ?? 0;
                return (
                  <label key={a.id} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <input type="checkbox" checked={inScope.has(a.id)} onChange={() => toggleScope(a.id)} aria-label={`Include ${a.name} in the allocation scope`} />
                      <span className={inScope.has(a.id) ? "text-ink-900" : "text-ink-500"}>{a.name}</span>
                    </span>
                    <span className="tabular text-ink-700">{money(v)}</span>
                  </label>
                );
              })}
              <div className="border-t border-ink-100 pt-2 text-2xs text-ink-500 space-y-1">
                <div className="flex justify-between"><span>In scope (denominator)</span><span className="tabular">{money(d.totals.current)}</span></div>
                <div className="flex justify-between"><span>Context only, not in the weights</span><span className="tabular">{money(d.context.total)}</span></div>
                <div className="flex justify-between"><span>Household assets</span><span className="tabular">{money(d.householdAssets)}</span></div>
                <div className="flex justify-between"><span>Liabilities (kept separate)</span><span className="tabular">{money(d.liabilities.total)}</span></div>
              </div>
              {d.scope.chosen && (
                <Button size="sm" variant="ghost" onClick={() => setScope(null)}>Reset to every account</Button>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader><CardTitle>Actual cash</CardTitle></CardHeader>
            <CardBody className="space-y-1.5 text-[13px]">
              {d.cash.map((c) => (
                <div key={c.accountId} className="flex justify-between gap-2">
                  <span className="text-ink-700">{c.accountName}</span>
                  <span className={`tabular ${c.proposed < -0.5 ? "text-negative-600 font-medium" : ""}`}>{money(c.current)} → {money(c.proposed)}</span>
                </div>
              ))}
              {d.shortfalls.map((s) => (
                <p key={s.accountId} className="text-2xs text-negative-600">{s.accountName} would be short {money(s.shortfall)}: purchases exceed its cash.</p>
              ))}
              <p className="text-2xs text-ink-500 leading-relaxed pt-1">Cash moves only through the actions shown. A cash reserve isn&apos;t recorded or enforced yet (D2).</p>
            </CardBody>
          </Card>
        </div>
      </div>

      {(d.unvalued.length > 0 || d.unresolved.length > 0) && (
        <Card className="mt-5 border-warning-200">
          <CardBody className="text-[13px] text-warning-600 space-y-1">
            {d.unvalued.length > 0 && <p>Not valued in {reportingCurrency} (left out of the weights; the final PDF stays blocked until they are): {d.unvalued.map((u) => u.name).join(", ")}.</p>}
            {d.unresolved.map((u) => <p key={u.recommendationId + u.holdingId}>{u.reason}</p>)}
          </CardBody>
        </Card>
      )}

      <SectionDivider>Positions in scope</SectionDivider>
      <Card>
        <CardBody className="p-0! overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-ink-500 text-left">
                <th className="px-4 py-2 font-medium">Position</th>
                <th className="px-3 py-2 font-medium">Asset class</th>
                <th className="px-3 py-2 font-medium text-right">Current</th>
                <th className="px-3 py-2 font-medium text-right">Proposed</th>
                <th className="px-4 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {d.positions.map((p) => (
                <React.Fragment key={p.id}>
                  <tr className="border-t border-ink-100">
                    <td className="px-4 py-2">
                      <div className="text-ink-900">{p.name}</div>
                      <div className="text-2xs text-ink-500">{p.accountName}{p.synthetic ? " · created by proposed cash flows" : ""}</div>
                    </td>
                    <td className="px-3 py-2 text-ink-700">{ASSET_CLASS_LABELS[p.assetClass] ?? p.assetClass}</td>
                    <td className="px-3 py-2 text-right tabular">{p.current == null ? "Not valued" : money(p.current)}</td>
                    <td className="px-3 py-2 text-right tabular">{p.proposed == null ? "Not valued" : money(p.proposed)}</td>
                    <td className="px-4 py-2 text-right">
                      {editablePosition(p) && (
                        <Button size="sm" variant="secondary" onClick={() => setEditing(editing?.id === p.id ? null : p)} aria-expanded={editing?.id === p.id}>
                          {editing?.id === p.id ? "Close" : "Edit position"}
                        </Button>
                      )}
                    </td>
                  </tr>
                  {editing?.id === p.id && (
                    <tr className="bg-slatey-50">
                      <td colSpan={5} className="px-4 py-3">
                        <PositionEditor
                          position={p}
                          reportingCurrency={reportingCurrency}
                          onCancel={() => setEditing(null)}
                          onSave={(rec) => {
                            addEdit(rec);
                            setEditing(null);
                          }}
                          preview={(rec) =>
                            previewRecommendation({ rec, holdings, recommendations, accounts, fx, sourceDocuments })
                          }
                        />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </CardBody>
      </Card>

      <SectionDivider>Draft actions</SectionDivider>
      <Card>
        <CardBody className="space-y-2">
          {live.length === 0 && <p className="text-[13px] text-ink-500">No recommendations yet. Edit a position above to add an explicit action to the draft.</p>}
          {live.map((r) => (
            <ActionRow key={r.id} rec={r} member={members.has(r.id)} onToggle={(m) => setMember(r.id, m)} />
          ))}
          <p className="text-2xs text-ink-500 leading-relaxed">
            &ldquo;In draft&rdquo; puts an action in this preview only. Approval and PDF prose are set on <Link href="/recommendations" className="text-navy-700 hover:underline">Recommendations</Link>; the final PDF uses approved actions.
          </p>
        </CardBody>
      </Card>

      <SectionDivider>Draft inputs</SectionDivider>
      <Card>
        <CardBody className="text-[13px] text-ink-700 space-y-2">
          {draft.inputBasis ? (
            <>
              <p>
                Recorded {formatTimestampDate(draft.inputBasis.recordedAt)}: {draft.inputBasis.values.length} accepted values and {draft.inputBasis.rates.length} exchange rate{draft.inputBasis.rates.length === 1 ? "" : "s"} ({draft.inputBasis.reportingCurrency}).
                {" "}Value dates {dateRange(draft.inputBasis.values.map((v) => v.date))}.
              </p>
              {changed ? (
                <p className="text-warning-600">Values or rates have changed since these inputs were recorded. The preview above uses the current ones.</p>
              ) : (
                <p className="text-2xs text-ink-500">The workspace still matches these inputs.</p>
              )}
            </>
          ) : (
            <p>Not recorded yet: the draft records its inputs the first time you change it.</p>
          )}
          <div className="flex items-center gap-3">
            <Button size="sm" variant="secondary" onClick={recordInputs}>Record current inputs</Button>
            <span className="text-2xs text-ink-500">Identifies the accepted values, dates and rates the draft was edited against. It is not an approval or a snapshot.</span>
          </div>
        </CardBody>
      </Card>
    </>
  );
}

function dateRange(dates: (string | null)[]) {
  const known = dates.filter((x): x is string => !!x).sort();
  const missing = dates.length - known.length;
  const range = known.length === 0 ? "not recorded" : known[0] === known[known.length - 1] ? formatCalendarDate(known[0]) : `${formatCalendarDate(known[0])} to ${formatCalendarDate(known[known.length - 1])}`;
  return missing > 0 ? `${range} (${missing} not recorded)` : range;
}

function TargetInput({ assetClass, value, onChange }: { assetClass: AssetClass; value: number | null; onChange: (c: AssetClass, v: number | null) => void }) {
  const [text, setText] = React.useState(value == null ? "" : String(value));
  React.useEffect(() => setText(value == null ? "" : String(value)), [value]);
  const commit = () => {
    const t = text.trim();
    if (t === "") return onChange(assetClass, null);
    const n = Number(t);
    if (Number.isFinite(n) && n >= 0 && n <= 100) onChange(assetClass, n);
    else setText(value == null ? "" : String(value));
  };
  return (
    <input
      inputMode="decimal"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && commit()}
      placeholder="—"
      aria-label={`Target weight for ${ASSET_CLASS_LABELS[assetClass] ?? assetClass}, percent`}
      className="w-16 rounded border border-ink-200 px-2 py-1 text-right tabular focus:outline-none focus:ring-2 focus:ring-navy-500/30"
    />
  );
}

function AddTargetRow({ existing, onAdd }: { existing: Set<AssetClass>; onAdd: (c: AssetClass) => void }) {
  const options = (Object.keys(ASSET_CLASS_LABELS) as AssetClass[]).filter((c) => !existing.has(c) && c !== "liability");
  if (options.length === 0) return null;
  return (
    <tr className="border-t border-ink-100">
      <td colSpan={6} className="px-4 py-2">
        <label className="text-2xs text-ink-500 flex items-center gap-2">
          Add a target for another asset class
          <select className="rounded border border-ink-200 px-2 py-1 text-[12px]" value="" onChange={(e) => e.target.value && onAdd(e.target.value as AssetClass)}>
            <option value="">Choose…</option>
            {options.map((c) => <option key={c} value={c}>{ASSET_CLASS_LABELS[c]}</option>)}
          </select>
        </label>
      </td>
    </tr>
  );
}

function ActionRow({ rec, member, onToggle }: { rec: Recommendation; member: boolean; onToggle: (m: boolean) => void }) {
  const restate = restatementMessage(rec);
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 border-b border-ink-100 pb-2 last:border-b-0">
      <div className="min-w-0">
        <div className="text-[13px] text-ink-900">{rec.title || "Untitled recommendation"}</div>
        <div className="flex flex-wrap gap-1 mt-1">
          {member && <Badge tone="navy">In draft</Badge>}
          {rec.approvedByAdvisor ? <Badge tone="positive">Approved</Badge> : <Badge tone="neutral">Not approved</Badge>}
          {rec.includeInPdf && <Badge tone="gold">In PDF prose</Badge>}
        </div>
        {restate && <p className="text-2xs text-warning-600 mt-1 max-w-2xl">{restate}</p>}
      </div>
      <label className="flex items-center gap-2 text-[12px] text-ink-700 shrink-0">
        <input type="checkbox" checked={member} onChange={(e) => onToggle(e.target.checked)} />
        In draft
      </label>
    </div>
  );
}

function PositionEditor({
  position,
  reportingCurrency,
  onSave,
  onCancel,
  preview,
}: {
  position: DeskPosition;
  reportingCurrency: string;
  onSave: (rec: Recommendation) => void;
  onCancel: () => void;
  preview: (rec: Recommendation) => ReturnType<typeof previewRecommendation>;
}) {
  const [kind, setKind] = React.useState<PositionEditKind>("reduce");
  const [amount, setAmount] = React.useState("");
  const [id] = React.useState(() => safeId("rec"));
  const n = Number(amount.replace(/[,\s]/g, ""));
  const valid = kind === "exit" || (amount.trim() !== "" && Number.isFinite(n) && n > 0);
  const rec = valid
    ? positionEditRecommendation({ holding: { id: position.id, accountId: position.accountId, assetName: position.name, assetClass: position.assetClass }, kind, amount: kind === "exit" ? undefined : n, reportingCurrency: reportingCurrency as Recommendation["currency"], id, now: new Date().toISOString() })
    : null;
  const p = rec ? preview(rec) : null;
  const money = (x: number) => formatCurrency(x, reportingCurrency);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <fieldset className="flex flex-wrap gap-3 text-[13px]">
          <legend className="sr-only">Change to {position.name}</legend>
          {(["reduce", "increase", "exit"] as const).map((k) => (
            <label key={k} className="flex items-center gap-1.5">
              <input type="radio" name={`kind-${position.id}`} checked={kind === k} onChange={() => setKind(k)} />
              {k === "reduce" ? "Reduce by" : k === "increase" ? "Increase by" : "Sell all"}
            </label>
          ))}
        </fieldset>
        {kind !== "exit" && (
          <label className="text-[12px] text-ink-600 flex items-center gap-2">
            Amount ({reportingCurrency})
            <input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-label={`Amount in ${reportingCurrency}`}
              className="w-32 rounded border border-ink-200 px-2 py-1 text-right tabular focus:outline-none focus:ring-2 focus:ring-navy-500/30"
            />
          </label>
        )}
      </div>
      {p?.standalone?.position && (
        <div className="text-[13px] text-ink-700 space-y-0.5">
          <div>{position.name}: {money(p.standalone.position.before)} → {money(p.standalone.position.after)}</div>
          {p.standalone.cash.map((c) => (
            <div key={c.holdingId}>{c.name} ({c.accountName}): {money(c.before)} → {money(c.after)}</div>
          ))}
        </div>
      )}
      {p?.warnings.map((w, i) => <p key={i} className="text-2xs text-warning-600">{w.message}</p>)}
      {p?.standalone?.shortfalls.map((s) => <p key={s.accountId} className="text-2xs text-negative-600">{s.accountName} would be short {money(s.shortfall)}.</p>)}
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={!rec} onClick={() => rec && onSave(rec)}>Add to draft</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
        <span className="text-2xs text-ink-500">Adds an unapproved action to the draft; current holdings don&apos;t change. Approve it on Recommendations.</span>
      </div>
    </div>
  );
}
