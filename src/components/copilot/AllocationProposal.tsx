"use client";

import * as React from "react";
import Link from "next/link";
import { Check, CircleAlert, CircleCheck, Eye, HelpCircle, X } from "lucide-react";
import { useAtlasStore } from "@/store/useStore";
import { normalizeHoldings } from "@/engines/normalizationEngine";
import { evaluateSelection, type MixRow } from "@/engines/allocationProposal";
import { ADDED, ADDED_EARLIER, PREVIEW_ONLY, previewPhase, reviewHref } from "@/copilot/request";
import type { CopilotResult } from "@/copilot/agent";
import type { AllocationRunView } from "@/copilot/tools";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatCurrency } from "@/utils/formatting";
import { cn } from "@/utils/cn";

// #119 — Prepare allocation proposal, as the advisor reviews it: the reviewed
// inputs, the decision (a proposed mix, a justified hold or a question), the
// AI's weights labelled as its judgment beside the recorded mix, and the
// implementation groups. What a selection produces is recalculated here with
// the shared engine (evaluateSelection) on the live workspace. Nothing is added
// until the advisor adds it; adding never approves anything.

const OUTCOME_LABEL = { propose: "Proposed mix", maintain: "Justified hold", ask: "Question first" } as const;
const pts = (n: number | null) => (n == null ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(1)} pp`);
const pct = (n: number | null) => (n == null ? "—" : `${n.toFixed(1)}%`);

export function AllocationProposal(props: {
  result: CopilotResult & { allocation: AllocationRunView };
  stale: boolean;
  existing: Set<string>;
  addedHere: Set<string>;
  onAdd: (ids: string[]) => void;
  onDiscard: () => void;
  note: { tone: "info" | "error"; text: string } | null;
}) {
  const { result, stale, existing, addedHere } = props;
  const a = result.allocation;
  const s = useAtlasStore();
  const ccy = a.reportingCurrency;
  const money = (n: number | null) => (n == null ? "—" : formatCurrency(n, ccy));
  const feasible = a.groups.filter((g) => g.problem == null);
  const [chosen, setChosen] = React.useState<Set<string>>(() => new Set(feasible.map((g) => g.id)));
  const legsOf = (ids: Set<string>) => result.drafts.filter((d) => a.groups.some((g) => ids.has(g.id) && g.legIds.includes(d.id)));
  const strategy = result.drafts.find((d) => d.id === a.strategyDraftId) ?? null;
  const judgment = result.mode === "live" && result.provider?.name === "anthropic" ? "Claude's judgment" : "the test provider's scripted example (not a model)";

  // The engine on the live workspace: the recorded mix, the proposal, and what the selected groups produce.
  const inputs = React.useMemo(
    () => ({ holdings: normalizeHoldings(s.holdings, s.fxRates, ccy), accounts: s.accounts, recommendations: s.recommendations, draft: s.workingDraft, fx: { reportingCurrency: ccy, rates: s.fxRates }, client: s.client }),
    [s.holdings, s.fxRates, s.accounts, s.recommendations, s.workingDraft, s.client, ccy]
  );
  const unselected = React.useMemo(() => evaluateSelection(inputs, [], a.proposedWeights), [inputs, a.proposedWeights]);
  const selection = React.useMemo(() => evaluateSelection(inputs, legsOf(chosen), a.proposedWeights), [inputs, chosen, a.proposedWeights]); // eslint-disable-line react-hooks/exhaustive-deps

  const toAdd = [...(strategy ? [strategy.id] : []), ...legsOf(chosen).map((d) => d.id)];
  const { phase, added } = previewPhase(result.drafts.filter((d) => toAdd.includes(d.id) || existing.has(d.id)), existing, stale, addedHere);
  const targets = Object.keys(s.workingDraft.targets).length > 0;
  const canAdd = phase === "preview" && toAdd.length > 0 && selection.problems.length === 0;

  return (
    <Card className={cn("border-l-4", phase === "added" ? "border-l-positive-500" : "border-l-warning-500")} data-testid="allocation-proposal" data-outcome={a.outcome}>
      <CardHeader className="flex flex-wrap items-center gap-2">
        <CardTitle>Allocation proposal</CardTitle>
        <Badge tone={a.outcome === "ask" ? "warning" : "navy"} data-testid="allocation-outcome">
          {OUTCOME_LABEL[a.outcome]}
        </Badge>
      </CardHeader>
      <CardBody className="space-y-4">
        <p className="text-[13px] text-ink-600" data-testid="allocation-inputs">
          <span className="font-medium text-ink-800">Reviewed inputs:</span> {money(a.scopeTotal)} in &ldquo;{result.context.alternativeName}&rdquo;&apos;s scope · client brief{" "}
          {a.briefReady ? "material answers reviewed" : "not ready"} · {targets ? "your desk targets are separate and unchanged" : "no advisor-set target"}
          {a.scopeAccounts.length > 0 && <> · accounts: {a.scopeAccounts.join(", ")}</>}.
        </p>
        {a.unknowns.length > 0 && (
          <p className="text-[13px] text-ink-700" data-testid="allocation-unknowns">
            <span className="font-medium text-ink-800">Still unknown:</span> {a.unknowns.join(" ")} Nothing is assumed for these; tax and cost-basis effects aren&apos;t estimated.
          </p>
        )}
        <FigureFlags figures={result.figures} />

        {a.outcome === "ask" ? (
          <div className="space-y-2" data-testid="allocation-question">
            <div className="flex items-start gap-2 text-ink-900">
              <HelpCircle className="h-4 w-4 mt-1 shrink-0 text-warning-600" />
              <div>
                <p className="font-serif text-lg">{a.question?.text}</p>
                <p className="text-[13px] text-ink-700 mt-1">
                  <span className="text-ink-500">What the answer decides: </span>
                  {a.question?.decides}
                </p>
              </div>
            </div>
            {a.briefIssues.length > 0 && (
              <ul className="list-disc pl-5 text-[13px] text-ink-700">
                {a.briefIssues.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            )}
            <p className="text-[13px] text-ink-700">No mix is proposed and nothing is ready to approve. Record and review the answer in Client objectives, then prepare the proposal again.</p>
          </div>
        ) : (
          <>
            <div>
              <h3 className="font-serif text-xl text-ink-900" data-testid="allocation-headline">
                {a.headline}
              </h3>
              <p className="text-sm text-ink-700 mt-1 leading-relaxed">{a.rationale}</p>
              {a.clientBasis.length > 0 && (
                <ul className="mt-2 space-y-1 text-[13px] text-ink-700" data-testid="allocation-client-basis">
                  {a.clientBasis.map((b) => (
                    <li key={b.question}>
                      <span className="font-medium text-ink-800">
                        {b.label}: &ldquo;{b.said}&rdquo;
                      </span>{" "}
                      — {b.supports}
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-2xs text-ink-500 mt-1">The quoted answers are the client&apos;s, as you recorded and reviewed them; how they support the decision is {judgment}.</p>
            </div>
            <MixTable rows={unselected.rows} money={money} judgment={judgment} hold={a.outcome === "maintain"} />
            {a.alternative && (
              <p className="text-[13px] text-ink-700" data-testid="allocation-alternative">
                <span className="font-medium text-ink-800">Alternative considered: </span>
                {a.alternative.summary}
                {a.alternative.weights && ` (${a.alternative.weights.map((w) => `${w.pct}% ${unselected.rows.find((r) => r.assetClass === w.assetClass)?.label ?? w.assetClass}`).join(" / ")})`}
              </p>
            )}
            {a.unclassified.length > 0 && (
              <p role="note" className="text-[13px] text-warning-600">
                Unclassified holdings in scope (shown as their own class, never spread across the others): {a.unclassified.map((u) => u.name).join(", ")}.
              </p>
            )}

            {a.outcome === "maintain" && (
              <p className="text-[13px] text-ink-700" data-testid="allocation-hold-note">
                This hold adds no action: it keeps the recorded mix.
                {selection.existingActions > 0 &&
                  ` ${selection.existingActions} action${selection.existingActions === 1 ? "" : "s"} already in this alternative (not part of this hold) would change the mix to ${selection.rows.map((r) => `${r.label} ${pct(r.resultPct)}`).join(", ")}.`}
              </p>
            )}
            {a.outcome === "propose" && (
              <div className="space-y-2">
                <h4 className="text-[13px] font-semibold uppercase tracking-wide text-ink-500">How could it be implemented?</h4>
                {a.groups.length === 0 && <p className="text-[13px] text-ink-700">No funded group was proposed from the holdings already owned; the mix below is what is achievable now.</p>}
                {a.groups.map((g, i) => (
                  <label key={g.id} className={cn("block rounded-md border p-3", g.problem ? "border-negative-500/30 bg-negative-50" : "border-ink-100")} data-testid="allocation-group">
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        className="mt-1"
                        disabled={!!g.problem || phase !== "preview"}
                        checked={chosen.has(g.id)}
                        onChange={() =>
                          setChosen((c) => {
                            const n = new Set(c);
                            if (n.has(g.id)) n.delete(g.id);
                            else n.add(g.id);
                            return n;
                          })
                        }
                        aria-label={`Select "${g.title}"`}
                      />
                      <div className="min-w-0">
                        <div className="font-medium text-ink-900">
                          {i + 1}. {g.title}
                        </div>
                        <p className="text-[13px] text-ink-700">{g.rationale}</p>
                        <ul className="text-[13px] text-ink-700 mt-1">
                          {g.legs.map((l) => (
                            <li key={`${l.holdingId}-${l.change}`}>
                              {l.change === "reduce" ? "Reduce" : "Buy more of"} {l.name} by <span className="tabular">{money(l.amount)}</span> ({l.accountName})
                            </li>
                          ))}
                        </ul>
                        {g.legs.length > 1 && <p className="text-2xs text-ink-500">The sale and the purchase form one funded group: applied together or not at all.</p>}
                        {g.problem && (
                          <p role="alert" className="text-[13px] text-negative-600 mt-1" data-testid="allocation-group-problem">
                            Not available: {g.problem}
                          </p>
                        )}
                      </div>
                    </div>
                  </label>
                ))}
                <SelectionTable rows={selection.rows} money={money} existingActions={selection.existingActions} />
                {selection.problems.length > 0 && (
                  <p role="alert" className="text-[13px] text-negative-600" data-testid="allocation-selection-problems">
                    These groups can&apos;t be applied together: {selection.problems.join(" ")}
                  </p>
                )}
              </div>
            )}

            <div role="status" data-testid="allocation-phase" data-phase={a.addable ? phase : "not_addable"} className="text-[13px]">
              {!a.addable ? (
                <span role="alert" className="flex items-start gap-2 text-ink-800">
                  <CircleAlert className="h-4 w-4 mt-0.5 shrink-0 text-warning-600" />
                  <span>
                    <strong>{PREVIEW_ONLY}</strong> The run didn&apos;t complete ({result.status.replace(/_/g, " ")}), so nothing from it can be added. Prepare the proposal again.
                  </span>
                </span>
              ) : phase === "added" ? (
                <span className="flex items-center gap-2 font-semibold text-positive-600">
                  <CircleCheck className="h-4 w-4" />
                  {added.some((id) => addedHere.has(id)) ? ADDED : ADDED_EARLIER}{" "}
                  <Link href={reviewHref(added)} className="font-medium text-navy-700 underline">
                    Review and approve on Recommendations
                  </Link>
                </span>
              ) : phase === "stale" ? (
                <span role="alert" className="flex items-start gap-2 text-ink-800">
                  <CircleAlert className="h-4 w-4 mt-0.5 shrink-0 text-warning-600" />
                  <span>
                    <strong>{PREVIEW_ONLY}</strong> The brief, scope or holdings changed after this proposal, so it can&apos;t be added. Prepare it again.
                  </span>
                </span>
              ) : (
                <span className="flex items-center gap-2 text-warning-600">
                  <Eye className="h-4 w-4" />
                  <strong>{PREVIEW_ONLY}</strong>
                  <span className="text-ink-700">A preview is not an order. Adding puts the strategy record{chosen.size ? " and the selected groups" : ""} in &ldquo;{result.context.alternativeName}&rdquo;, unapproved.</span>
                </span>
              )}
            </div>
            {a.addable && phase === "preview" && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => props.onAdd(toAdd)} disabled={!canAdd} iconLeft={<Check className="h-4 w-4" />} data-testid="allocation-add">
                  {a.outcome === "maintain"
                    ? "Add as a no-trade recommendation"
                    : legsOf(chosen).length
                    ? `Add the strategy and ${chosen.size} selected group${chosen.size === 1 ? "" : "s"}`
                    : "Add the strategy only (no trades)"}
                </Button>
                <Button size="sm" variant="secondary" onClick={props.onDiscard} iconLeft={<X className="h-4 w-4" />}>
                  Discard
                </Button>
              </div>
            )}
          </>
        )}
        {props.note && (
          <p role={props.note.tone === "error" ? "alert" : "status"} className={cn("text-[13px]", props.note.tone === "error" ? "text-negative-600" : "text-ink-700")} data-testid="allocation-note">
            {props.note.text}
          </p>
        )}
      </CardBody>
    </Card>
  );
}

function MixTable({ rows, money, judgment, hold }: { rows: MixRow[]; money: (n: number | null) => string; judgment: string; hold: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]" data-testid="allocation-mix">
        <thead className="text-left text-ink-500">
          <tr>
            <th className="py-1 pr-3 font-medium">Asset class</th>
            <th className="py-1 pr-3 font-medium">Current</th>
            <th className="py-1 pr-3 font-medium">{hold ? "Kept" : "Proposed"}</th>
            <th className="py-1 pr-3 font-medium">Change</th>
            <th className="py-1 font-medium">Net amount</th>
          </tr>
        </thead>
        <tbody className="tabular">
          {rows.map((r) => (
            <tr key={r.assetClass} className="border-t border-ink-100">
              <td className="py-1 pr-3">{r.label}</td>
              <td className="py-1 pr-3">{pct(r.currentPct)}</td>
              <td className="py-1 pr-3 font-medium text-navy-700">{pct(r.proposedPct)}</td>
              <td className="py-1 pr-3">{pts(r.changePts)}</td>
              <td className="py-1">{r.changeAmount == null ? "—" : `${r.changeAmount > 0 ? "+" : ""}${money(r.changeAmount)}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-2xs text-ink-500 mt-1">
        Proposed weights: {judgment}, not your desk targets and not a calculated result. Current figures come from Stratovell&apos;s engines; pp = percentage points of the same in-scope portfolio.
      </p>
    </div>
  );
}

function SelectionTable({ rows, money, existingActions }: { rows: MixRow[]; money: (n: number | null) => string; existingActions: number }) {
  return (
    <div className="overflow-x-auto">
      <h4 className="text-[13px] font-semibold uppercase tracking-wide text-ink-500 mt-2">What your selection produces</h4>
      <table className="w-full text-[13px]" data-testid="allocation-selection">
        <thead className="text-left text-ink-500">
          <tr>
            <th className="py-1 pr-3 font-medium">Asset class</th>
            <th className="py-1 pr-3 font-medium">Recorded</th>
            <th className="py-1 pr-3 font-medium">Proposed</th>
            <th className="py-1 pr-3 font-medium">Selected result</th>
            <th className="py-1 font-medium">Still to reach (against the proposed weight)</th>
          </tr>
        </thead>
        <tbody className="tabular">
          {rows.map((r) => (
            <tr key={r.assetClass} className="border-t border-ink-100">
              <td className="py-1 pr-3">{r.label}</td>
              <td className="py-1 pr-3">{pct(r.currentPct)}</td>
              <td className="py-1 pr-3">{pct(r.proposedPct)}</td>
              <td className="py-1 pr-3 font-medium">{pct(r.resultPct)}</td>
              <td className="py-1" data-testid={`allocation-gap-${r.assetClass}`}>
                {r.gapPts == null || Math.abs(r.gapPts) < 0.05 ? "—" : `${pts(r.gapPts)} (${money(r.gapAmount)})`}
                {r.noEligibleCandidate && <span className="block text-negative-600">No eligible candidate: a new security would be needed (not proposed in this version)</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-2xs text-ink-500 mt-1">
        Calculated by Stratovell&apos;s engines for the selected groups{existingActions ? `, together with the ${existingActions} action${existingActions === 1 ? "" : "s"} already in this alternative` : ""}. A gap is shown as a gap, never as achieved. Missing cost basis means any tax effect is unknown; none is estimated.
      </p>
    </div>
  );
}

/** #119 (review finding 3): figures shown on the card or in the answer that no engine result supports, and those that are only the proposal itself. */
function FigureFlags({ figures }: { figures: CopilotResult["figures"] }) {
  const unsupported = figures.unsupported ?? [];
  const proposal = figures.proposal ?? [];
  if (unsupported.length === 0 && proposal.length === 0) return null;
  return (
    <div role="note" className="rounded-md bg-warning-50 ring-1 ring-inset ring-warning-500/40 px-3 py-2 text-[13px] text-ink-800 space-y-0.5" data-testid="allocation-figure-flags">
      {unsupported.length > 0 && <p>Figures not supported by Stratovell&apos;s engine results: {unsupported.join(", ")}. Check them before relying on this proposal.</p>}
      {proposal.length > 0 && <p>Figures that are the proposal itself (a judgment, or a gap measured against it), not engine results: {proposal.join(", ")}.</p>}
    </div>
  );
}
