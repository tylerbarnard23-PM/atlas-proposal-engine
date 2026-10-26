"use client";

import * as React from "react";
import { useAtlasStore } from "@/store/useStore";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import type { AssetClass, CurrencyCode, ModelRevision, Recommendation, StrategyFee, StrategyRevision } from "@/domain/types";
import { ASSET_CLASS_LABELS } from "@/domain/assetTaxonomy";
import type { NormalizedHolding } from "@/engines/normalizationEngine";
import type { FxContext } from "@/engines/proposalEngine";
import { previewDraftEdit, type DeskResult, type DraftEditPreview } from "@/engines/allocationDesk";
import {
  accountBasis,
  exposureView,
  feeCoverage,
  findRevision,
  label,
  latestRevision,
  latestRevisions,
  minimumStatus,
  pendingPlanKey,
  sleeveDestinationId,
  sleevePlan,
  sleevePurchases,
  sleeveRows,
  unallocatedWeight,
  type MinimumStatus,
} from "@/engines/strategyProposals";
import { UMA_MODELS, UMA_STRATEGIES } from "@/data/umaStory";
import { formatCurrency, safeId } from "@/utils/formatting";

// D2a — models and manager/strategy sleeves on the Allocation desk. Every
// figure comes from engines/strategyProposals and the shared evaluator. A
// model or plan creates no trade or approval; purchases join the draft only
// when the advisor adds them, as one unit applied whole or left out.

const pct = (n: number) => `${Number(n.toFixed(2))}%`;
const MIX_CLASSES: AssetClass[] = ["equity", "fixed_income", "cash", "custom"];
const field = "rounded border border-ink-200 px-2 py-1 text-[12px]";

export function ModelsAndSleeves({ d, holdings, fx }: { d: DeskResult; holdings: NormalizedHolding[]; fx: FxContext }) {
  const strategies = useAtlasStore((s) => s.strategies);
  const models = useAtlasStore((s) => s.models);
  const draft = useAtlasStore((s) => s.workingDraft);
  const pinModel = useAtlasStore((s) => s.pinModel);
  const addLibrary = useAtlasStore((s) => s.addSyntheticLibrary);
  const [editing, setEditing] = React.useState<{ kind: "strategy" | "model"; base?: StrategyRevision | ModelRevision } | null>(null);

  const pinned = draft.model ? findRevision(models, draft.model.id, draft.model.revision) : undefined;
  const newest = draft.model ? latestRevision(models, draft.model.id) : undefined;
  const missingExamples = UMA_STRATEGIES.some((x) => !findRevision(strategies, x.id, x.revision)) || UMA_MODELS.some((x) => !findRevision(models, x.id, x.revision));

  return (
    <div className="space-y-3">
      <Card>
        <CardBody className="space-y-3 text-[13px]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-ink-700">Library of strategies and models. Each edit saves a new revision; alternatives stay on the revision they use.</span>
            <span className="ml-auto flex gap-2">
              {missingExamples && <Button size="sm" variant="secondary" onClick={addLibrary}>Add synthetic examples</Button>}
              <Button size="sm" variant="secondary" onClick={() => setEditing({ kind: "strategy" })}>New strategy</Button>
              <Button size="sm" variant="secondary" onClick={() => setEditing({ kind: "model" })}>New model</Button>
            </span>
          </div>
          {/* Keyed by the definition being revised, so switching starts that definition's own values. */}
          {editing?.kind === "strategy" && <StrategyForm key={`s:${editing.base?.id ?? "new"}:${editing.base?.revision ?? 0}`} base={editing.base as StrategyRevision | undefined} onDone={() => setEditing(null)} />}
          {editing?.kind === "model" && <ModelForm key={`m:${editing.base?.id ?? "new"}:${editing.base?.revision ?? 0}`} base={editing.base as ModelRevision | undefined} strategies={strategies} onDone={() => setEditing(null)} />}
          {strategies.length > 0 && (
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-ink-500 text-left">
                  <th className="py-1 font-medium">Strategy</th>
                  <th className="py-1 font-medium">Minimum</th>
                  <th className="py-1 font-medium">Fees (as supplied)</th>
                  <th className="py-1 font-medium">Underlying mix</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {latestRevisions(strategies).map((s) => (
                  <tr key={s.id} className="border-t border-ink-100 align-top">
                    <td className="py-1.5 pr-2 text-ink-900">
                      {label(s)} <span className="text-ink-500">· {s.strategyType} · {s.currency}</span> {s.provenance === "synthetic" && <Badge tone="neutral">Synthetic</Badge>}
                    </td>
                    <td className="py-1.5 pr-2">{s.minimum == null ? "Not supplied" : formatCurrency(s.minimum, s.currency)}</td>
                    <td className="py-1.5 pr-2">{feeCoverage(s.fees)}</td>
                    <td className="py-1.5 pr-2">{s.mix ? `${mixText(s.mix.weights)} · ${s.mix.source}, ${s.mix.asOf}` : "Unknown (not supplied)"}</td>
                    <td className="py-1.5 text-right"><Button size="sm" variant="ghost" onClick={() => setEditing({ kind: "strategy", base: s })}>Revise</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {models.length > 0 && (
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-ink-500 text-left">
                  <th className="py-1 font-medium">Model</th>
                  <th className="py-1 font-medium">Weights</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {latestRevisions(models).map((m) => (
                  <tr key={m.id} className="border-t border-ink-100 align-top">
                    <td className="py-1.5 pr-2 text-ink-900">
                      {m.name} (rev {m.revision}) <span className="text-ink-500">· {m.kind === "asset_class" ? "Asset-class target" : "Manager/strategy allocation"}</span>
                    </td>
                    <td className="py-1.5 pr-2">{modelText(m, strategies)}</td>
                    <td className="py-1.5 text-right whitespace-nowrap">
                      <Button size="sm" variant="secondary" onClick={() => pinModel({ id: m.id, revision: m.revision })} disabled={draft.model?.id === m.id && draft.model.revision === m.revision}>
                        Use in this alternative
                      </Button>{" "}
                      <Button size="sm" variant="ghost" onClick={() => setEditing({ kind: "model", base: m })}>Revise</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {strategies.length === 0 && models.length === 0 && <p className="text-2xs text-ink-500">The library is empty. Add the synthetic examples or enter a strategy; nothing here is a verified offering.</p>}
        </CardBody>
      </Card>

      {pinned && (
        <Card>
          <CardBody className="space-y-2 text-[13px]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-ink-900">
                This alternative uses <strong>{pinned.name}</strong> (rev {pinned.revision}).
              </span>
              {newest && newest.revision > pinned.revision && (
                <Button size="sm" variant="secondary" onClick={() => pinModel({ id: newest.id, revision: newest.revision })}>
                  Use revision {newest.revision} instead
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => pinModel(null)}>Stop using this model</Button>
            </div>
            {newest && newest.revision > pinned.revision && <p className="text-2xs text-ink-500">Revision {newest.revision} exists. This alternative stays on revision {pinned.revision} until you switch.</p>}
            {pinned.kind === "asset_class" ? (
              <p className="text-2xs text-ink-500">The model set this alternative&apos;s targets ({modelText(pinned, strategies)}). Targets create no trades; drift stays visible above until you add explicit actions.</p>
            ) : (
              <SleevePlanPanel key={`${draft.id}:${pinned.id}:${pinned.revision}`} model={pinned} d={d} holdings={holdings} fx={fx} />
            )}
          </CardBody>
        </Card>
      )}

      <SleeveActions d={d} />
      <ExposurePanel d={d} />
    </div>
  );
}

const statusText = (st: MinimumStatus, money: (n: number) => string, funded: boolean) =>
  st.kind === "met"
    ? `${funded ? "Meets" : "Purchase meets"} the ${money(st.minimum)} minimum`
    : st.kind === "below"
    ? `${funded ? "Below" : "Purchase is below"} the ${money(st.minimum)} minimum`
    : st.reviewed
    ? "Minimum not supplied; reviewed"
    : "Minimum not supplied; review needed before the final PDF";

/**
 * Every sleeve action the advisor may need to act on (this alternative's and
 * every approved one), whatever model is pinned, with minimum reviews. All
 * amounts are in the sleeve's own currency, from the evaluator.
 */
function SleeveActions({ d }: { d: DeskResult }) {
  const recommendations = useAtlasStore((s) => s.recommendations);
  const draft = useAtlasStore((s) => s.workingDraft);
  const alternatives = useAtlasStore((s) => s.alternatives);
  const recordReview = useAtlasStore((s) => s.recordSleeveReview);
  const [notes, setNotes] = React.useState<Record<string, string>>({});
  const rows = sleeveRows({ recommendations, positions: d.positions, activeMemberIds: draft.memberIds, alternatives });
  if (rows.length === 0) return null;
  return (
    <Card>
      <CardBody className="space-y-1 text-[12px]">
        <div className="text-2xs uppercase tracking-wider text-ink-500">Sleeve actions (this alternative and every approved one)</div>
        <table className="w-full">
          <tbody>
            {rows.map((r) => {
              const money = (n: number) => formatCurrency(n, r.currency);
              const review = recommendations.find((x) => x.id === r.recommendationId)?.destination?.strategy?.review;
              return (
                <tr key={r.recommendationId} className="border-t border-ink-100 align-top">
                  <td className="py-1.5 pr-2 text-ink-900">
                    {r.label}
                    {r.owner && <span className="text-ink-500"> · in {r.owner}</span>} {r.approved ? <Badge tone="positive">Approved</Badge> : <Badge tone="neutral">Not approved</Badge>}
                  </td>
                  <td className="py-1.5 pr-2 tabular">{r.purchase == null ? "—" : `Purchase ${money(r.purchase)}`}</td>
                  <td className="py-1.5 pr-2 tabular">{r.funded == null ? "Not in this alternative" : r.funded > 0 ? `Funded ${money(r.funded)}` : "Not applied in this alternative"}</td>
                  <td className="py-1.5">
                    <span className={r.status.kind === "below" || r.needsReview ? "text-warning-600" : ""}>{statusText(r.status, money, r.funded != null && r.funded > 0)}</span>
                    {review && <span className="text-ink-500">: {review.note}</span>}
                    {r.needsReview && (
                      <span className="mt-1 flex flex-wrap items-center gap-1">
                        <input value={notes[r.recommendationId] ?? ""} onChange={(e) => setNotes({ ...notes, [r.recommendationId]: e.target.value })} placeholder="Review note" aria-label={`Review note for ${r.label}`} className={`w-48 ${field}`} />
                        <Button size="sm" variant="secondary" disabled={!(notes[r.recommendationId] ?? "").trim()} onClick={() => recordReview(r.recommendationId, notes[r.recommendationId])}>
                          Record review
                        </Button>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="text-2xs text-ink-500">A review records that the advisor checked an unsupplied minimum; it is not a statement that eligibility passed.</p>
      </CardBody>
    </Card>
  );
}

function mixText(weights: Partial<Record<AssetClass, number>>) {
  return (Object.entries(weights) as [AssetClass, number][]).filter(([, w]) => w > 0).map(([c, w]) => `${ASSET_CLASS_LABELS[c]} ${pct(w)}`).join(", ");
}

function modelText(m: ModelRevision, strategies: StrategyRevision[]) {
  const parts =
    m.kind === "asset_class"
      ? [mixText(m.assetWeights ?? {})]
      : [
          ...(m.strategyWeights ?? []).map((r) => {
            const s = findRevision(strategies, r.strategyId, r.strategyRevision);
            return `${s ? label(s) : r.strategyId} ${pct(r.weight)}`;
          }),
          ...(m.cashWeight ? [`Cash ${pct(m.cashWeight)}`] : []),
        ];
  const rest = unallocatedWeight(m);
  return `${parts.join(" · ")}${rest > 0 ? ` · unallocated ${pct(rest)}` : ""}`;
}

function SleevePlanPanel({ model, d, holdings, fx }: { model: ModelRevision; d: DeskResult; holdings: NormalizedHolding[]; fx: FxContext }) {
  const accounts = useAtlasStore((s) => s.accounts);
  const strategies = useAtlasStore((s) => s.strategies);
  const recommendations = useAtlasStore((s) => s.recommendations);
  const draft = useAtlasStore((s) => s.workingDraft);
  const addEdit = useAtlasStore((s) => s.addDraftEdit);
  const eligible = d.scope.accountIds.filter((id) => !accounts.find((a) => a.id === id)?.isLiabilityAccount);
  const [chosen, setChosen] = React.useState(eligible[0] ?? "");
  const accountId = eligible.includes(chosen) ? chosen : eligible[0] ?? "";
  const account = accounts.find((a) => a.id === accountId);
  const plan = sleevePlan({ model, strategies, basis: accountBasis({ account, holdings, fx }) });
  const ccy = plan.basis.ok ? plan.basis.currency : null;
  const money = (n: number) => (ccy ? formatCurrency(n, ccy) : n.toLocaleString("en-US"));
  const reporting = (n: number) => formatCurrency(n, fx.reportingCurrency);
  // A pending preview belongs to this alternative, model revision, account and plan amounts.
  const key = pendingPlanKey({ draftId: draft.id, model, accountId, plan });
  const [pending, setPending] = React.useState<{ key: string; legs: Recommendation[] } | null>(null);
  const current = pending && pending.key === key ? pending : null;
  // Recomputed from the current inputs on every render, so what Add adds is what is shown.
  const preview: DraftEditPreview | null = React.useMemo(
    () => (current ? previewDraftEdit({ holdings, accounts, recommendations, draft, candidate: current.legs, fx }) : null),
    [current, holdings, accounts, recommendations, draft, fx]
  );
  const stale = !!pending && !current;
  const native = (destId: string) => d.positions.find((p) => p.id === destId)?.proposedNative ?? null;
  const members = new Set(draft.memberIds);
  const inDraft = (destId: string) => recommendations.some((r) => members.has(r.id) && r.destination?.id === destId && r.destination.strategy);

  const build = () => {
    const group = safeId("grp");
    setPending({ key, legs: sleevePurchases({ plan, accountId, ids: { group, rec: () => safeId("rec") }, now: new Date().toISOString() }) });
  };

  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-[12px] text-ink-600">
        Account
        <select value={accountId} onChange={(e) => setChosen(e.target.value)} aria-label="Account for the sleeve plan" className={field}>
          {eligible.map((id) => <option key={id} value={id}>{accounts.find((a) => a.id === id)?.name ?? id}</option>)}
        </select>
        <span>{plan.basis.ok ? `Basis: ${money(plan.basis.value)} (the account's current value)` : ""}</span>
      </label>
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-ink-500 text-left">
            <th className="py-1 font-medium">Sleeve</th>
            <th className="py-1 font-medium text-right">Weight</th>
            <th className="py-1 font-medium text-right">Target</th>
            <th className="py-1 font-medium text-right">Funded in this alternative</th>
            <th className="py-1 font-medium">Minimum</th>
          </tr>
        </thead>
        <tbody>
          {plan.rows.map((r) => {
            const destId = sleeveDestinationId(accountId, r.strategy);
            const funded = inDraft(destId) ? native(destId) : null;
            // Compared in the strategy's own currency; a value in another currency is never compared with its minimum.
            const fundedHere = funded && funded.currency === r.strategy.currency ? funded.amount : null;
            const status = minimumStatus(r.strategy.minimum, fundedHere ?? r.target, false);
            const own = (n: number) => formatCurrency(n, r.strategy.currency);
            return (
              <tr key={r.strategy.id} className="border-t border-ink-100 align-top">
                <td className="py-1.5 pr-2 text-ink-900">{label(r.strategy)}</td>
                <td className="py-1.5 pr-2 text-right tabular">{pct(r.weight)}</td>
                <td className="py-1.5 pr-2 text-right tabular">{money(r.target)}</td>
                <td className="py-1.5 pr-2 text-right tabular">{funded ? formatCurrency(funded.amount, funded.currency) : "Not funded"}</td>
                <td className="py-1.5">
                  {status.kind === "not_supplied"
                    ? "Not supplied (see Sleeve actions)"
                    : `${fundedHere != null ? (status.kind === "met" ? "Meets" : "Is below") : status.kind === "met" ? "Target meets" : "Target is below"} the ${own(status.minimum)} minimum`}
                </td>
              </tr>
            );
          })}
          <tr className="border-t border-ink-100">
            <td className="py-1.5 text-ink-900">Eligible cash (stays as cash)</td>
            <td className="py-1.5 text-right tabular">{pct(plan.cash.weight)}</td>
            <td className="py-1.5 text-right tabular">{money(plan.cash.target)}</td>
            <td colSpan={2} />
          </tr>
          {plan.unallocated.weight > 0 && (
            <tr className="border-t border-ink-100">
              <td className="py-1.5 text-ink-900">Unallocated (stays as cash)</td>
              <td className="py-1.5 text-right tabular">{pct(plan.unallocated.weight)}</td>
              <td className="py-1.5 text-right tabular">{money(plan.unallocated.target)}</td>
              <td colSpan={2} />
            </tr>
          )}
        </tbody>
      </table>
      {plan.problems.map((p) => <p key={p} className="text-2xs text-negative-600">{p}</p>)}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" disabled={plan.problems.length > 0} onClick={build}>Preview funded purchases</Button>
        <span className="text-2xs text-ink-500">Targets alone create nothing. The purchases join this alternative only when you add them, as one unit applied whole or left out; they are unapproved.</span>
      </div>
      {stale && (
        <p className="text-2xs text-warning-600">
          The earlier preview no longer matches this alternative, model, account or amounts, so it was set aside. Preview again before adding.
        </p>
      )}
      {current && preview && (
        <div className="space-y-1 rounded border border-ink-100 p-2" data-testid="sleeve-preview">
          {preview.applied ? (
            <p className="text-[12px] text-ink-700">
              With the rest of this alternative, every sleeve purchase applies
              {preview.cash.map((c) => `; ${c.name} ${reporting(c.before)} → ${reporting(c.after)}`).join("")} (in {fx.reportingCurrency}).
            </p>
          ) : (
            <p className="text-[12px] text-negative-600">These purchases wouldn&apos;t apply:</p>
          )}
          {preview.blocked.map((b) => <p key={b.unitId} className="text-2xs text-negative-600">{b.reason}</p>)}
          {preview.unresolved.map((u) => <p key={u.recommendationId} className="text-2xs text-negative-600">{u.reason}</p>)}
          <div className="flex gap-2">
            <Button size="sm" onClick={() => { addEdit(current.legs); setPending(null); }}>Add to draft</Button>
            <Button size="sm" variant="ghost" onClick={() => setPending(null)}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ExposurePanel({ d }: { d: DeskResult }) {
  const recommendations = useAtlasStore((s) => s.recommendations);
  const strategies = useAtlasStore((s) => s.strategies);
  const e = exposureView({ positions: d.positions, recommendations, strategies });
  if (e.sleeves.length === 0) return null;
  const money = (n: number) => formatCurrency(n, d.reportingCurrency);
  return (
    <Card>
      <CardBody className="grid gap-4 md:grid-cols-2 text-[12px]">
        <div>
          <div className="text-2xs uppercase tracking-wider text-ink-500 mb-1">Look-through exposure ({money(e.total)})</div>
          <table className="w-full">
            <tbody>
              {e.rows.map((r) => (
                <tr key={r.assetClass} className="border-t border-ink-100">
                  <td className="py-1">{ASSET_CLASS_LABELS[r.assetClass]}</td>
                  <td className="py-1 text-right tabular">{money(r.value)}</td>
                  <td className="py-1 text-right tabular w-16">{pct(r.pct)}</td>
                </tr>
              ))}
              {e.unknown.value > 0 && (
                <tr className="border-t border-ink-100 text-warning-600">
                  <td className="py-1">Unknown (no supplied mix, {e.unknown.sleeves} sleeve{e.unknown.sleeves === 1 ? "" : "s"})</td>
                  <td className="py-1 text-right tabular">{money(e.unknown.value)}</td>
                  <td className="py-1 text-right tabular w-16">{pct(e.unknown.pct)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div>
          <div className="text-2xs uppercase tracking-wider text-ink-500 mb-1">By manager/strategy sleeve</div>
          <table className="w-full">
            <tbody>
              {e.sleeves.map((s) => (
                <tr key={s.destinationId} className="border-t border-ink-100">
                  <td className="py-1">{s.manager} — {s.name} (rev {s.revision}){s.mixKnown ? "" : " · mix unknown"}</td>
                  <td className="py-1 text-right tabular">{money(s.value)}</td>
                  <td className="py-1 text-right tabular w-16">{pct(s.pct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="md:col-span-2 text-2xs text-ink-500">
          Two views of the same proposed value: a sleeve&apos;s underlying investments are never added on top of it. Unknown exposure stays unknown; it is not spread across the known classes. In the allocation grid above, sleeves appear as Other / unclassified (balance only).
        </p>
      </CardBody>
    </Card>
  );
}

function StrategyForm({ base, onDone }: { base?: StrategyRevision; onDone: () => void }) {
  const save = useAtlasStore((s) => s.saveStrategy);
  const feeOf = (k: StrategyFee["kind"]) => base?.fees.find((f) => f.kind === k)?.rateBps;
  const [f, setF] = React.useState({
    manager: base?.manager ?? "",
    name: base?.name ?? "",
    strategyType: base?.strategyType ?? "Separately managed account",
    currency: base?.currency ?? "USD",
    minimum: base?.minimum == null ? "" : String(base.minimum),
    mixKnown: !!base?.mix,
    mix: Object.fromEntries(MIX_CLASSES.map((c) => [c, String(base?.mix?.weights[c] ?? "")])) as Record<AssetClass, string>,
    mixSource: base?.mix?.source ?? "",
    mixAsOf: base?.mix?.asOf ?? "",
    fees: Object.fromEntries((["manager", "platform", "instrument", "all_in"] as const).map((k) => [k, feeOf(k) == null ? "" : String(feeOf(k))])) as Record<string, string>,
  });
  const [problems, setProblems] = React.useState<string[]>([]);
  const num = (t: string) => Number(t.replace(/[,\s]/g, ""));
  const submit = () => {
    const fees: StrategyFee[] = Object.entries(f.fees)
      .filter(([, v]) => v.trim() !== "")
      .map(([kind, v]) => ({ kind: kind as StrategyFee["kind"], rateBps: num(v), basis: base?.fees.find((x) => x.kind === kind)?.basis ?? "assets in the sleeve" }));
    const weights = Object.fromEntries(MIX_CLASSES.filter((c) => f.mix[c].trim() !== "").map((c) => [c, num(f.mix[c])]));
    const out = save({
      ...(base ? { id: base.id } : {}),
      manager: f.manager.trim(),
      name: f.name.trim(),
      strategyType: f.strategyType.trim(),
      currency: f.currency.trim().toUpperCase() as CurrencyCode,
      minimum: f.minimum.trim() === "" ? null : num(f.minimum),
      fees,
      mix: f.mixKnown ? { weights, source: f.mixSource.trim(), asOf: f.mixAsOf.trim() } : null,
      provenance: "custom",
    });
    setProblems(out);
    if (out.length === 0) onDone();
  };
  const input = (key: "manager" | "name" | "strategyType" | "currency" | "minimum", text: string, w = "w-40") => (
    <label className="flex items-center gap-1.5">
      {text}
      <input value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })} aria-label={text} className={`${w} ${field}`} />
    </label>
  );
  return (
    <div className="space-y-2 rounded border border-ink-100 p-2 text-[12px] text-ink-600">
      <div className="text-ink-900">{base ? `Revise ${label(base)}: saves revision ${base.revision + 1}` : "New strategy (custom)"}</div>
      <div className="flex flex-wrap gap-3">
        {input("manager", "Manager")}
        {input("name", "Strategy")}
        {input("strategyType", "Type")}
        {input("currency", "Currency", "w-16")}
        {input("minimum", "Minimum (blank: not supplied)", "w-28")}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={f.mixKnown} onChange={(e) => setF({ ...f, mixKnown: e.target.checked })} />
          Underlying mix supplied
        </label>
        {f.mixKnown &&
          MIX_CLASSES.map((c) => (
            <label key={c} className="flex items-center gap-1">
              {ASSET_CLASS_LABELS[c]} %
              <input value={f.mix[c]} onChange={(e) => setF({ ...f, mix: { ...f.mix, [c]: e.target.value } })} aria-label={`${ASSET_CLASS_LABELS[c]} share of the mix`} className={`w-14 ${field}`} />
            </label>
          ))}
        {f.mixKnown && (
          <>
            <input value={f.mixSource} onChange={(e) => setF({ ...f, mixSource: e.target.value })} placeholder="Mix source" aria-label="Mix source" className={`w-36 ${field}`} />
            <input value={f.mixAsOf} onChange={(e) => setF({ ...f, mixAsOf: e.target.value })} placeholder="As of (YYYY-MM-DD)" aria-label="Mix date" className={`w-32 ${field}`} />
          </>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span>Fees in basis points (blank: not supplied)</span>
        {Object.keys(f.fees).map((k) => (
          <label key={k} className="flex items-center gap-1">
            {k.replace("_", "-")}
            <input value={f.fees[k]} onChange={(e) => setF({ ...f, fees: { ...f.fees, [k]: e.target.value } })} aria-label={`${k} fee in basis points`} className={`w-14 ${field}`} />
          </label>
        ))}
      </div>
      {problems.map((p) => <p key={p} className="text-2xs text-negative-600">{p}</p>)}
      <div className="flex gap-2">
        <Button size="sm" onClick={submit}>{base ? "Save new revision" : "Save strategy"}</Button>
        <Button size="sm" variant="ghost" onClick={onDone}>Cancel</Button>
      </div>
    </div>
  );
}

function ModelForm({ base, strategies, onDone }: { base?: ModelRevision; strategies: StrategyRevision[]; onDone: () => void }) {
  const save = useAtlasStore((s) => s.saveModel);
  const [kind, setKind] = React.useState<ModelRevision["kind"]>(base?.kind ?? "strategy");
  const [name, setName] = React.useState(base?.name ?? "");
  const [asset, setAsset] = React.useState<Record<string, string>>(Object.fromEntries(MIX_CLASSES.map((c) => [c, String(base?.assetWeights?.[c] ?? "")])));
  const latest = latestRevisions(strategies);
  const [weights, setWeights] = React.useState<Record<string, string>>(
    Object.fromEntries(latest.map((s) => [s.id, String(base?.strategyWeights?.find((w) => w.strategyId === s.id)?.weight ?? "")]))
  );
  const [cash, setCash] = React.useState(String(base?.cashWeight ?? ""));
  const [problems, setProblems] = React.useState<string[]>([]);
  const num = (t: string) => Number(t.replace(/[,\s]/g, ""));
  const submit = () => {
    const out = save({
      ...(base ? { id: base.id } : {}),
      name: name.trim(),
      kind,
      ...(kind === "asset_class"
        ? { assetWeights: Object.fromEntries(MIX_CLASSES.filter((c) => asset[c].trim() !== "").map((c) => [c, num(asset[c])])) }
        : {
            // A revision uses each strategy's latest revision; earlier model revisions keep theirs.
            strategyWeights: latest.filter((s) => (weights[s.id] ?? "").trim() !== "").map((s) => ({ strategyId: s.id, strategyRevision: s.revision, weight: num(weights[s.id]) })),
            cashWeight: cash.trim() === "" ? 0 : num(cash),
          }),
      provenance: "custom",
    });
    setProblems(out);
    if (out.length === 0) onDone();
  };
  return (
    <div className="space-y-2 rounded border border-ink-100 p-2 text-[12px] text-ink-600">
      <div className="text-ink-900">{base ? `Revise ${base.name}: saves revision ${base.revision + 1}` : "New model (custom)"}</div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5">
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Model name" className={`w-56 ${field}`} />
        </label>
        <select value={kind} onChange={(e) => setKind(e.target.value as ModelRevision["kind"])} disabled={!!base} aria-label="Model kind" className={field}>
          <option value="strategy">Manager/strategy allocation</option>
          <option value="asset_class">Asset-class target</option>
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {kind === "asset_class"
          ? MIX_CLASSES.map((c) => (
              <label key={c} className="flex items-center gap-1">
                {ASSET_CLASS_LABELS[c]} %
                <input value={asset[c]} onChange={(e) => setAsset({ ...asset, [c]: e.target.value })} aria-label={`${ASSET_CLASS_LABELS[c]} target weight`} className={`w-14 ${field}`} />
              </label>
            ))
          : [
              ...latest.map((s) => (
                <label key={s.id} className="flex items-center gap-1">
                  {label(s)} %
                  <input value={weights[s.id] ?? ""} onChange={(e) => setWeights({ ...weights, [s.id]: e.target.value })} aria-label={`Weight for ${label(s)}`} className={`w-14 ${field}`} />
                </label>
              )),
              <label key="cash" className="flex items-center gap-1">
                Cash %
                <input value={cash} onChange={(e) => setCash(e.target.value)} aria-label="Cash weight" className={`w-14 ${field}`} />
              </label>,
            ]}
      </div>
      <p className="text-2xs text-ink-500">Weights above 100% are refused; below 100% the rest is shown as unallocated. Saving creates no trade.</p>
      {problems.map((p) => <p key={p} className="text-2xs text-negative-600">{p}</p>)}
      <div className="flex gap-2">
        <Button size="sm" onClick={submit}>{base ? "Save new revision" : "Save model"}</Button>
        <Button size="sm" variant="ghost" onClick={onDone}>Cancel</Button>
      </div>
    </div>
  );
}
