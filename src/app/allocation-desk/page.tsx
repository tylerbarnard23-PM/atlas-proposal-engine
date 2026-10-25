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
import type { Account, AssetClass, CurrencyCode as AssetCurrency, Recommendation } from "@/domain/types";
import type { ReserveStatus } from "@/engines/proposalEngine";
import { ASSET_CLASS_LABELS } from "@/domain/assetTaxonomy";
import {
  compareAlternatives,
  draftBasisInputs,
  evaluateDesk,
  replacementRecommendations,
  inputsChanged,
  editablePosition,
  positionEditRecommendation,
  previewDraftEdit,
  restatementMessage,
  scopeCandidates,
  type DeskPosition,
  type DraftEditPreview,
  type DeskView,
  type PositionEditKind,
} from "@/engines/allocationDesk";
import { previewRecommendation, type PreviewWarning } from "@/engines/recommendationPreview";
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
  const alternatives = useAtlasStore((s) => s.alternatives);
  const setFunding = useAtlasStore((s) => s.setAccountFunding);
  const duplicate = useAtlasStore((s) => s.duplicateDraft);
  const setActive = useAtlasStore((s) => s.setActiveDraft);
  const rename = useAtlasStore((s) => s.renameActiveDraft);
  const [copyName, setCopyName] = React.useState("");
  const now = useFxNow();
  const [view, setView] = React.useState<DeskView>("draft");
  const [editing, setEditing] = React.useState<DeskPosition | null>(null);

  const fx = React.useMemo(() => ({ reportingCurrency, rates: fxRates, now }), [reportingCurrency, fxRates, now]);
  const d = React.useMemo(() => evaluateDesk({ holdings, accounts, recommendations, draft, fx, view }), [holdings, accounts, recommendations, draft, fx, view]);
  const money = (n: number) => formatCurrency(n, reportingCurrency);
  const changed = inputsChanged(draft.inputBasis, draftBasisInputs({ holdings, accounts, recommendations, fxRates, reportingCurrency: reportingCurrency as AssetCurrency, draft }));
  const candidates = scopeCandidates(accounts);
  const inScope = new Set(d.scope.accountIds);
  const toggleScope = (id: string) => setScope(inScope.has(id) ? d.scope.accountIds.filter((x) => x !== id) : [...d.scope.accountIds, id]);
  // Rejected ones are left out, except a legacy record still approved: the PDF applies it.
  const live = recommendations.filter((r) => r.status !== "excluded" || r.approvedByAdvisor);
  const members = new Set(draft.memberIds);
  const compared = React.useMemo(
    () => compareAlternatives({ holdings, accounts, recommendations, drafts: [draft, ...alternatives], fx }),
    [holdings, accounts, recommendations, draft, alternatives, fx]
  );
  const eligibleCurrency = (accountId: string) => {
    const id = accounts.find((a) => a.id === accountId)?.funding?.cashHoldingId;
    const h = id ? holdings.find((x) => x.id === id && x.accountId === accountId) : undefined;
    return h ? h.valuation.currency : null;
  };

  return (
    <>
      <PageHeader
        eyebrow="Advisory"
        title="Allocation desk"
        description="Choose the investment scope, set target weights and preview explicit changes to positions you already hold. A preview never changes current holdings, approvals or the final PDF."
      />

      <Card className="mb-3">
        <CardBody className="flex flex-wrap items-center gap-3 text-[13px]">
          <label className="flex items-center gap-2">
            <span className="text-ink-500">Alternative</span>
            <input
              key={draft.id}
              defaultValue={draft.name}
              onBlur={(e) => e.target.value.trim() && e.target.value !== draft.name && rename(e.target.value)}
              aria-label="Name of this alternative"
              className="w-44 rounded border border-ink-200 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-navy-500/30"
            />
          </label>
          {alternatives.map((a) => (
            <Button key={a.id} size="sm" variant="secondary" onClick={() => setActive(a.id)}>Switch to {a.name}</Button>
          ))}
          <span className="flex items-center gap-2 ml-auto">
            <input value={copyName} onChange={(e) => setCopyName(e.target.value)} placeholder="Name for the copy" aria-label="Name for the duplicated alternative" className="w-40 rounded border border-ink-200 px-2 py-1" />
            <Button size="sm" variant="secondary" onClick={() => { duplicate(copyName); setCopyName(""); }}>Duplicate as a new alternative</Button>
          </span>
          <span className="w-full text-2xs text-ink-500">A duplicate copies this alternative&apos;s actions with new IDs and no approvals; editing one alternative never changes another or current holdings.</span>
        </CardBody>
      </Card>

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
              Targets total {d.targetSum.toFixed(1)}%
              {d.targetSum > 100.05 ? `, ${(d.targetSum - 100).toFixed(1)}% more than the whole scope` : d.targetSum > 0 && d.targetSum < 99.95 ? `; ${(100 - d.targetSum).toFixed(1)}% unassigned` : ""}. A target is a desired weight: it creates no trades. Drift stays visible until you add explicit actions, such as a replacement into a new investment; automatic rebalancing isn't available.
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
                <div className="flex justify-between"><span>Context only, not in the weights{d.unvaluedOutside.length > 0 ? " (valued only)" : ""}</span><span className="tabular">{money(d.context.total)}</span></div>
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
              <p className="text-2xs text-ink-500 leading-relaxed pt-1">Cash moves only through the actions shown. Reserves are set under Funding below.</p>
            </CardBody>
          </Card>
        </div>
      </div>

      {(d.unvalued.length > 0 || d.unvaluedOutside.length > 0 || d.unresolved.length > 0 || d.blocked.length > 0) && (
        <Card className="mt-5 border-warning-200">
          <CardBody className="text-[13px] text-warning-600 space-y-1">
            {d.unvalued.length > 0 && <p>Not valued in {reportingCurrency} (left out of the weights; the final PDF stays blocked until they are): {d.unvalued.map((u) => u.name).join(", ")}.</p>}
            {d.unvaluedOutside.length > 0 && (
              <p>
                Outside the scope and not valued in {reportingCurrency} (left out of the context, household and liability totals, which cover valued items only):{" "}
                {d.unvaluedOutside.map((u) => `${u.name} (${u.accountName}${u.liability ? ", liability" : ""})`).join(", ")}.
              </p>
            )}
            {d.unresolved.map((u) => <p key={u.recommendationId + u.holdingId}>{u.reason}</p>)}
            {d.blocked.map((b) => <p key={b.unitId} className="text-negative-600">{b.reason}</p>)}
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
                      <div className="text-2xs text-ink-500">{p.accountName}{p.synthetic ? " · created by proposed cash flows" : ""}{p.proposedOnly ? " · proposed, not currently held" : ""}</div>
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
                          replaceCurrency={eligibleCurrency(p.accountId)}
                          onCancel={() => setEditing(null)}
                          onSave={(recs) => {
                            addEdit(recs);
                            setEditing(null);
                          }}
                          preview={(recs) => ({
                            draft: previewDraftEdit({ holdings, accounts, recommendations, draft, candidate: recs, fx }),
                            // Data warnings only (incomplete import, unvalued, currency review); funding comes from the draft above.
                            warnings: previewRecommendation({ rec: recs.find((r) => r.relatedHoldingId) ?? recs[0], holdings, recommendations, accounts, fx, sourceDocuments }).warnings.filter((w) => w.kind !== "shortfall" && w.kind !== "missing_rate" && w.kind !== "funding"),
                          })}
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

      <SectionDivider>Funding</SectionDivider>
      <Card>
        <CardBody className="space-y-2">
          {d.scope.accountIds.map((id) => {
            const account = accounts.find((a) => a.id === id)!;
            const cashLines = holdings.filter((h) => h.accountId === id && h.assetClass === "cash" && !h.isLiability).map((h) => ({ id: h.id, name: h.assetName, currency: h.valuation.currency }));
            // A saved source that no longer resolves stays visible as the saved choice.
            const savedId = account.funding?.cashHoldingId;
            const savedHolding = savedId ? holdings.find((h) => h.id === savedId) : undefined;
            const unresolvedSource =
              savedId && !cashLines.some((c) => c.id === savedId)
                ? { id: savedId, label: savedHolding ? `${savedHolding.assetName}: no longer a cash line here` : `${savedId}: removed` }
                : null;
            return <FundingRow key={id} account={account} cashLines={cashLines} unresolvedSource={unresolvedSource} status={d.reserves.find((r) => r.accountId === id)} onSave={(f) => setFunding(id, f)} />;
          })}
          <p className="text-2xs text-ink-500 leading-relaxed">
            Only the chosen cash line funds new investments and replacements; cash-like fund slices and cash that can&apos;t be valued are never spent automatically. A purchase that would take eligible cash below its reserve is left out whole, here and in the final-PDF checks.
          </p>
        </CardBody>
      </Card>

      <SectionDivider>Compare alternatives</SectionDivider>
      <Card>
        <CardBody className="p-0! overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-ink-500 text-left">
                <th className="px-4 py-2 font-medium">Alternative</th>
                {d.rows.map((r) => <th key={r.assetClass} className="px-3 py-2 font-medium text-right">{r.label}</th>)}
                <th className="px-3 py-2 font-medium text-right">Reserve headroom</th>
                <th className="px-4 py-2 font-medium">Issues</th>
              </tr>
            </thead>
            <tbody>
              {compared.map(({ draft: alt, result }) => (
                <tr key={alt.id} className="border-t border-ink-100">
                  <td className="px-4 py-2 text-ink-900">{alt.name}{alt.id === draft.id ? " (active)" : ""}</td>
                  {d.rows.map((r) => {
                    const row = result.rows.find((x) => x.assetClass === r.assetClass);
                    return <td key={r.assetClass} className="px-3 py-2 text-right tabular">{row ? `${money(row.proposed)} · ${pctText(row.proposedPct)}` : "—"}</td>;
                  })}
                  <td className="px-3 py-2 text-right tabular">
                    {result.reserves.length === 0 ? "No reserve set" : result.reserves.map((r) => (r.headroom == null ? "Unknown" : formatCurrency(r.headroom, r.currency ?? reportingCurrency))).join(" · ")}
                  </td>
                  <td className="px-4 py-2 text-2xs">
                    {[
                      result.blocked.length > 0 ? `${result.blocked.length} left out whole` : "",
                      result.shortfalls.length > 0 ? `${result.shortfalls.length} shortfall${result.shortfalls.length === 1 ? "" : "s"}` : "",
                      result.unresolved.length > 0 ? `${result.unresolved.length} unresolved` : "",
                      result.reserves.some((r) => r.breached) ? "reserve breached" : "",
                    ].filter(Boolean).join("; ") || "None"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-4 py-3 text-2xs text-ink-500 border-t border-ink-100">Each alternative is evaluated with the same engine as the PDF, using only its own actions. Approval and PDF prose are set on Recommendations; approve one alternative&apos;s actions for the final PDF.</p>
        </CardBody>
      </Card>

      <SectionDivider>Draft actions</SectionDivider>
      <Card>
        <CardBody className="space-y-2">
          {live.length === 0 && <p className="text-[13px] text-ink-500">No recommendations yet. Edit a position above to add an explicit action to the draft.</p>}
          {live.map((r) => (
            <ActionRow key={r.id} rec={r} member={members.has(r.id)} owner={alternatives.find((a) => a.memberIds.includes(r.id))?.name} onToggle={(m) => setMember(r.id, m)} />
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

function ActionRow({ rec, member, owner, onToggle }: { rec: Recommendation; member: boolean; owner?: string; onToggle: (m: boolean) => void }) {
  const restate = restatementMessage(rec);
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 border-b border-ink-100 pb-2 last:border-b-0">
      <div className="min-w-0">
        <div className="text-[13px] text-ink-900">{rec.title || "Untitled recommendation"}</div>
        <div className="flex flex-wrap gap-1 mt-1">
          {member && <Badge tone="navy">In draft</Badge>}
          {rec.approvedByAdvisor ? <Badge tone="positive">Approved</Badge> : <Badge tone="neutral">Not approved</Badge>}
          {rec.includeInPdf && <Badge tone="gold">In PDF prose</Badge>}
          {rec.status === "excluded" && rec.approvedByAdvisor && <Badge tone="warning">Marked rejected but still approved (legacy)</Badge>}
          {rec.linked && <Badge tone="info">Linked replacement</Badge>}
        </div>
        {restate && <p className="text-2xs text-warning-600 mt-1 max-w-2xl">{restate}</p>}
      </div>
      {owner ? (
        // Each alternative's actions are its own: switch to it to change them.
        <Badge tone="neutral">In {owner}</Badge>
      ) : (
        <label className="flex items-center gap-2 text-[12px] text-ink-700 shrink-0">
          <input type="checkbox" checked={member} onChange={(e) => onToggle(e.target.checked)} />
          In draft
        </label>
      )}
    </div>
  );
}

function PositionEditor({
  position,
  reportingCurrency,
  replaceCurrency,
  onSave,
  onCancel,
  preview,
}: {
  position: DeskPosition;
  reportingCurrency: string;
  /** The account's eligible-cash currency (a replacement's currency), or null when none is chosen. */
  replaceCurrency: string | null;
  onSave: (recs: Recommendation[]) => void;
  onCancel: () => void;
  preview: (recs: Recommendation[]) => { draft: DraftEditPreview; warnings: PreviewWarning[] };
}) {
  const [kind, setKind] = React.useState<PositionEditKind | "replace">("reduce");
  const [amount, setAmount] = React.useState("");
  const [buyAmount, setBuyAmount] = React.useState("");
  const [destName, setDestName] = React.useState("");
  const [destClass, setDestClass] = React.useState<AssetClass>("fixed_income");
  const [ids] = React.useState(() => ({ rec: safeId("rec"), sell: safeId("rec"), buy: safeId("rec"), group: safeId("grp"), dest: safeId("dest") }));
  const num = (t: string) => Number(t.replace(/[,\s]/g, ""));
  const n = num(amount);
  const nb = buyAmount.trim() === "" ? n : num(buyAmount);
  const positive = (x: number) => Number.isFinite(x) && x > 0;
  const ccy = (kind === "replace" ? replaceCurrency ?? reportingCurrency : reportingCurrency) as Recommendation["currency"];
  const now = new Date().toISOString();
  let recs: Recommendation[] | null = null;
  if (kind === "replace") {
    if (amount.trim() !== "" && positive(n) && positive(nb) && destName.trim()) {
      recs = replacementRecommendations({
        holding: { id: position.id, accountId: position.accountId, assetName: position.name, assetClass: position.assetClass },
        sellAmount: n,
        buyAmount: nb,
        destination: { id: ids.dest, name: destName, assetClass: destClass },
        currency: ccy,
        ids: { sell: ids.sell, buy: ids.buy, group: ids.group },
        now,
      });
    }
  } else if (kind === "exit" || (amount.trim() !== "" && positive(n))) {
    recs = [positionEditRecommendation({ holding: { id: position.id, accountId: position.accountId, assetName: position.name, assetClass: position.assetClass }, kind, amount: kind === "exit" ? undefined : n, reportingCurrency: reportingCurrency as Recommendation["currency"], id: ids.rec, now })];
  }
  const p = recs ? preview(recs) : null;
  const money = (x: number) => formatCurrency(x, kind === "replace" ? ccy : reportingCurrency);
  const field = "rounded border border-ink-200 px-2 py-1 text-right tabular focus:outline-none focus:ring-2 focus:ring-navy-500/30";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <fieldset className="flex flex-wrap gap-3 text-[13px]">
          <legend className="sr-only">Change to {position.name}</legend>
          {(["reduce", "increase", "exit", "replace"] as const).map((k) => (
            <label key={k} className="flex items-center gap-1.5">
              <input type="radio" name={`kind-${position.id}`} checked={kind === k} onChange={() => setKind(k)} />
              {k === "reduce" ? "Reduce by" : k === "increase" ? "Increase by" : k === "exit" ? "Sell all" : "Replace into a new investment"}
            </label>
          ))}
        </fieldset>
        {kind !== "exit" && (
          <label className="text-[12px] text-ink-600 flex items-center gap-2">
            {kind === "replace" ? "Sell" : "Amount"} ({kind === "replace" ? ccy : reportingCurrency})
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label={kind === "replace" ? `Amount to sell in ${ccy}` : `Amount in ${reportingCurrency}`} className={`w-32 ${field}`} />
          </label>
        )}
      </div>
      {kind === "replace" && (
        <div className="flex flex-wrap items-end gap-3 text-[12px] text-ink-600">
          <label className="flex items-center gap-2">
            New investment
            <input value={destName} onChange={(e) => setDestName(e.target.value)} aria-label="New investment name" placeholder="e.g. Bond ETF B" className="w-44 rounded border border-ink-200 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-navy-500/30" />
          </label>
          <label className="flex items-center gap-2">
            Asset class
            <select value={destClass} onChange={(e) => setDestClass(e.target.value as AssetClass)} aria-label="New investment asset class" className="rounded border border-ink-200 px-2 py-1">
              {(Object.keys(ASSET_CLASS_LABELS) as AssetClass[]).filter((c) => c !== "cash" && c !== "liability").map((c) => <option key={c} value={c}>{ASSET_CLASS_LABELS[c]}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2">
            Buy ({ccy})
            <input inputMode="decimal" value={buyAmount} onChange={(e) => setBuyAmount(e.target.value)} placeholder={amount || "same as sold"} aria-label={`Amount to buy in ${ccy}`} className={`w-32 ${field}`} />
          </label>
          {!replaceCurrency && <span className="text-warning-600">This account has no eligible cash chosen, so a replacement can&apos;t be funded yet.</span>}
        </div>
      )}
      {p && (
        <div className="text-[13px] text-ink-700 space-y-0.5">
          <div className="text-2xs uppercase tracking-wider text-ink-500">In the working draft, with this change</div>
          <div>
            {position.name}: {p.draft.position.before == null ? "Not valued" : money(p.draft.position.before)} → {p.draft.position.after == null ? "Not valued" : money(p.draft.position.after)}
          </div>
          {p.draft.destination && (
            <div>
              {p.draft.destination.name} (new): {p.draft.destination.after == null ? "not applied" : `${money(0)} → ${money(p.draft.destination.after)}`}
            </div>
          )}
          {p.draft.cash.map((c) => (
            <div key={c.holdingId}>{c.name} ({c.accountName}): {money(c.before)} → {money(c.after)}</div>
          ))}
        </div>
      )}
      {p?.draft.blocked.map((b) => <p key={b.unitId} className="text-2xs text-negative-600">{b.reason}</p>)}
      {p && !p.draft.applied && p.draft.blocked.length === 0 && <p className="text-2xs text-negative-600">This change can&apos;t be applied in the draft:</p>}
      {p?.draft.unresolved.map((u) => <p key={u.recommendationId + u.holdingId} className="text-2xs text-negative-600">{u.reason}</p>)}
      {p?.draft.shortfalls.map((s) => <p key={s.accountId} className="text-2xs text-negative-600">With the rest of the draft, {s.accountName} would be short {money(s.shortfall)}.</p>)}
      {p?.warnings.map((w, i) => <p key={i} className="text-2xs text-warning-600">{w.message}</p>)}
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={!recs} onClick={() => recs && onSave(recs)}>Add to draft</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
        <span className="text-2xs text-ink-500">
          {kind === "replace" ? "Adds a linked sell and buy, applied together or not at all; " : "Adds an unapproved action to the draft; "}
          current holdings don&apos;t change. Approve on Recommendations.
        </span>
      </div>
    </div>
  );
}

function FundingRow({
  account,
  cashLines,
  unresolvedSource,
  status,
  onSave,
}: {
  account: Account;
  cashLines: { id: string; name: string; currency: string }[];
  /** The saved eligible cash when it was removed or is no longer a cash line in this account. */
  unresolvedSource: { id: string; label: string } | null;
  status: ReserveStatus | undefined;
  onSave: (funding: { cashHoldingId: string; reserve: number } | null) => void;
}) {
  const [source, setSource] = React.useState(account.funding?.cashHoldingId ?? "");
  const [reserve, setReserve] = React.useState(account.funding ? String(account.funding.reserve) : "0");
  React.useEffect(() => {
    setSource(account.funding?.cashHoldingId ?? "");
    setReserve(account.funding ? String(account.funding.reserve) : "0");
  }, [account.funding]);
  const r = Number(reserve.replace(/[,\s]/g, ""));
  const line = cashLines.find((c) => c.id === source);
  // The reserve is in its cash line's currency; when that is unknown, none is invented.
  const currency = status?.currency ?? line?.currency ?? null;
  const fmt = (n: number) => (currency ? formatCurrency(n, currency) : `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })} (currency unknown)`);
  const choosable = !!line && Number.isFinite(r) && r >= 0;
  return (
    <div className="space-y-1.5 border-b border-ink-100 pb-2 last:border-b-0">
      <div className="text-[13px] text-ink-900">{account.name}</div>
      <div className="flex flex-wrap items-center gap-2 text-[12px] text-ink-600">
        <select value={source} onChange={(e) => setSource(e.target.value)} aria-label={`Eligible cash for ${account.name}`} className="rounded border border-ink-200 px-2 py-1">
          {!account.funding && <option value="">No eligible cash chosen</option>}
          {unresolvedSource && <option value={unresolvedSource.id}>Saved: {unresolvedSource.label}</option>}
          {cashLines.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.currency})</option>)}
        </select>
        <label className="flex items-center gap-1.5">
          Reserve
          <input inputMode="decimal" value={reserve} onChange={(e) => setReserve(e.target.value)} aria-label={`Minimum reserve for ${account.name}`} className="w-24 rounded border border-ink-200 px-2 py-1 text-right tabular" />
        </label>
        <Button size="sm" variant="secondary" disabled={!choosable} onClick={() => choosable && onSave({ cashHoldingId: source, reserve: r })}>
          {account.funding ? "Save funding rule" : "Set funding rule"}
        </Button>
        {account.funding && (
          <Button size="sm" variant="ghost" onClick={() => onSave(null)} aria-label={`Remove the funding rule and reserve for ${account.name}`}>
            Remove funding rule
          </Button>
        )}
      </div>
      {unresolvedSource && source === unresolvedSource.id && (
        <p className="text-2xs text-ink-500">Choose a valid cash line to fund this account, or remove the rule. Saving can&apos;t keep a source that no longer resolves.</p>
      )}
      {status && (
        <p className={`text-2xs ${status.breached ? "text-negative-600" : "text-ink-500"}`}>
          {status.problem
            ? `The chosen eligible cash ${status.cashHoldingId} ${status.problem === "removed" ? "was removed" : "is no longer a cash line in this account"}. Nothing is spent from this account, and no other cash is used, until you choose its eligible cash again; the ${fmt(status.reserve)} reserve is kept.`
            : status.available == null
            ? `Eligible cash can't be valued, so the ${fmt(status.reserve)} reserve can't be confirmed; nothing is spent from this account, and no other cash is used.`
            : `Eligible cash after this preview ${fmt(status.available)}; reserve ${fmt(status.reserve)}; headroom ${fmt(status.headroom ?? 0)}${status.breached ? " (below the reserve)" : ""}.`}
        </p>
      )}
    </div>
  );
}
