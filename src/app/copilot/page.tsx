"use client";

import * as React from "react";
import Link from "next/link";
import { Bot, Check, CircleAlert, Send, Square, Wrench, X } from "lucide-react";
import { forReadiness } from "@/engines/importCompleteness";
import { candidateProblems, evaluateDesk } from "@/engines/allocationDesk";
import { normalizeHoldings } from "@/engines/normalizationEngine";
import { agentContextOf, type AgentContext } from "@/copilot/context";
import { useAtlasStore } from "@/store/useStore";
import { ClientOnly } from "@/components/layout/ClientOnly";
import { PageHeader } from "@/components/ui/Section";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import { formatCurrency } from "@/utils/formatting";
import type { Recommendation } from "@/domain/types";
import type { CopilotMode, CopilotResult, RunStatus } from "@/copilot/agent";

const SUGGESTIONS = [
  "Summarize this client's portfolio and the biggest issues",
  "Draft recommendations for the top risks",
  "Is this proposal ready to send? What's blocking the PDF?",
];

const TOOL_LABELS: Record<string, string> = {
  get_portfolio_overview: "Read portfolio overview",
  get_scope_overview: "Read the alternative's scope (allocation desk)",
  list_insights: "Ran insight engine",
  get_holding: "Inspected holding",
  simulate_recommendation: "Simulated in proposal engine",
  simulate_scope_change: "Simulated in the alternative (allocation desk)",
  check_proposal_readiness: "Ran readiness checklist",
  draft_recommendation: "Saved draft (preview)",
};

const MODE_LABEL: Record<CopilotMode, string> = {
  demo: "Scripted demo · no model",
  test: "Test provider · not a model",
  live: "Live · Claude",
};
const MODE_HINT: Record<CopilotMode, string> = {
  demo: "A fixed script calls the same engine tools as the live agent. No model writes these answers.",
  test: "A deterministic test provider runs through the real agent loop and tools. It is not a model and makes no API calls.",
  live: "A Claude model plans and writes; every figure comes from the Atlas engines.",
};

const STATUS_LABEL: Record<RunStatus, string> = {
  completed: "Completed",
  refused: "Declined by the model",
  truncated: "Cut off",
  turn_limit: "Step limit reached",
  tool_limit: "Tool-call limit reached",
  budget_exceeded: "Output budget reached",
  deadline: "Time limit reached",
  cancelled: "Cancelled",
  failed: "Failed",
};

export default function CopilotPage() {
  return (
    <ClientOnly>
      <Inner />
    </ClientOnly>
  );
}

function Inner() {
  const state = useAtlasStore();
  const accept = useAtlasStore((s) => s.acceptAgentDrafts);
  const [question, setQuestion] = React.useState("");
  const [mode, setMode] = React.useState<{ mode: CopilotMode; model: string | null } | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<CopilotResult | null>(null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [acceptNote, setAcceptNote] = React.useState<string | null>(null);
  const abort = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    fetch("/api/copilot")
      .then((r) => r.json())
      .then((d) => setMode({ mode: d.mode, model: d.model ?? null }))
      .catch(() => setMode(null));
    // A contextual entry point (e.g. the allocation desk) can prefill the question; it never runs by itself.
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) setQuestion(q.slice(0, 2000));
  }, []);

  const sourceDocuments = React.useMemo(() => state.sourceDocuments.map(forReadiness), [state.sourceDocuments]);
  const context: AgentContext = React.useMemo(
    () => agentContextOf({ ...state, sourceDocuments }),
    [state, sourceDocuments]
  );
  const scopeNames =
    state.workingDraft.scopeAccountIds == null
      ? "Every investment account"
      : state.workingDraft.scopeAccountIds.map((id) => state.accounts.find((a) => a.id === id)?.name ?? id).join(", ") || "No accounts";
  // The preview belongs to the inputs it was computed on; any later edit makes it stale.
  const stale = result ? result.context.inputRevision !== context.inputRevision || result.context.alternativeId !== context.alternativeId || result.context.clientId !== context.clientId : false;
  const existing = React.useMemo(() => new Set(state.recommendations.map((r) => r.id)), [state.recommendations]);

  async function ask(q: string) {
    const text = q.trim();
    if (!text || loading) return;
    setQuestion(text);
    setLoading(true);
    setError(null);
    setResult(null);
    setAcceptNote(null);
    const controller = new AbortController();
    abort.current = controller;
    try {
      const res = await fetch("/api/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          question: text,
          context,
          snapshot: {
            client: state.client,
            advisor: state.advisor,
            accounts: state.accounts,
            holdings: state.holdings,
            fxRates: state.fxRates,
            recommendations: state.recommendations,
            disclosures: state.disclosures,
            sourceDocuments,
            fxConfirmation: state.fxConfirmation,
            // D2: lets readiness tell approvals that mix alternatives, as the PDF route does. D4: the active alternative is the answer's context.
            workingDraft: state.workingDraft,
            alternatives: state.alternatives,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      const r = data as CopilotResult;
      setResult(r);
      setSelected(new Set(r.drafts.map((d) => d.id)));
    } catch (e) {
      setError(controller.signal.aborted ? "Cancelled. Nothing was saved." : (e as Error).message);
    } finally {
      abort.current = null;
      setLoading(false);
    }
  }

  function acceptSelected() {
    if (!result) return;
    const drafts = result.drafts.filter((d) => selected.has(d.id));
    const r = accept(drafts, result.context);
    if (!r.ok) {
      setAcceptNote(r.error);
      return;
    }
    setAcceptNote(
      r.added.length > 0
        ? `Accepted ${r.added.length} draft${r.added.length === 1 ? "" : "s"} into "${result.context.alternativeName}", unapproved and excluded from the PDF.${r.skipped.length ? ` ${r.skipped.length} already there.` : ""}`
        : "Already accepted; nothing changed."
    );
  }

  const shownMode = result?.mode ?? mode?.mode ?? null;

  return (
    <>
      <PageHeader
        eyebrow="Advisory · AI-assisted"
        title="Proposal Copilot"
        description="Ask about the active alternative. Answers come from the same Atlas engines the rest of the app uses; drafts are a preview until you accept them, and acceptance never approves anything."
        actions={
          shownMode && (
            <Badge tone={shownMode === "live" ? "positive" : shownMode === "test" ? "warning" : "gold"} className="whitespace-nowrap" title={MODE_HINT[shownMode]} data-testid="copilot-mode">
              {MODE_LABEL[shownMode]}
              {shownMode !== "demo" && mode?.model ? ` · ${mode.model}` : ""}
            </Badge>
          )
        }
      />

      <Card className="mb-3">
        <CardBody className="text-[13px] text-ink-700" data-testid="copilot-context">
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            <span>
              <span className="text-ink-500">Client</span> {state.client.fullName || "Unnamed client"}
            </span>
            <span>
              <span className="text-ink-500">Alternative</span> {state.workingDraft.name}
            </span>
            <span>
              <span className="text-ink-500">Scope</span> {scopeNames}
            </span>
            <span>
              <span className="text-ink-500">Input revision</span> <code>{context.inputRevision}</code>
            </span>
          </div>
          {shownMode && <p className="mt-1 text-2xs text-ink-500">{MODE_HINT[shownMode]}</p>}
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-3">
          <Textarea
            rows={3}
            value={question}
            aria-label="Question for Copilot"
            placeholder="e.g. Which positions create the most concentration risk in this scope, and what would trimming them do?"
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) ask(question);
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => ask(question)} loading={loading} iconLeft={<Send className="h-4 w-4" />}>
              Ask Copilot
            </Button>
            {loading && (
              <Button variant="secondary" onClick={() => abort.current?.abort()} iconLeft={<Square className="h-4 w-4" />}>
                Cancel
              </Button>
            )}
            {SUGGESTIONS.map((s) => (
              <Button key={s} size="sm" variant="secondary" onClick={() => ask(s)} disabled={loading}>
                {s}
              </Button>
            ))}
          </div>
        </CardBody>
      </Card>

      {error && (
        <div role="alert" className="mt-4 flex items-start gap-2 rounded-md border border-negative-500/30 bg-negative-50 px-4 py-3 text-sm text-negative-600">
          <CircleAlert className="h-4 w-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {loading && <p className="mt-6 text-sm text-ink-500">Working through the engines… live answers can take up to a minute. Cancel stops the request; nothing is saved.</p>}

      {result && (
        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            <Card>
              <CardHeader className="flex flex-wrap items-center gap-2">
                <Bot className="h-4 w-4 text-navy-700" />
                <CardTitle>Answer</CardTitle>
                <Badge tone={result.status === "completed" ? "positive" : "warning"} data-testid="copilot-status">
                  {STATUS_LABEL[result.status]}
                </Badge>
              </CardHeader>
              <CardBody className="space-y-3">
                <MiniMarkdown text={result.answer} />
                <FigureStatus figures={result.figures} />
                {result.forbiddenAttempts > 0 && (
                  <p className="text-[13px] text-ink-700">
                    Refused {result.forbiddenAttempts} attempt{result.forbiddenAttempts === 1 ? "" : "s"} to approve, finalize, share or execute: Copilot has no such authority.
                  </p>
                )}
              </CardBody>
            </Card>

            {result.drafts.length > 0 && (
              <DraftPreview
                result={result}
                stale={stale}
                selected={selected}
                existing={existing}
                onToggle={(id) => setSelected((s) => {
                  const n = new Set(s);
                  if (n.has(id)) n.delete(id);
                  else n.add(id);
                  return n;
                })}
                onAccept={acceptSelected}
                onDiscard={() => {
                  setResult(null);
                  setAcceptNote("Discarded. Nothing was saved.");
                }}
                note={acceptNote}
              />
            )}
            {result.drafts.length === 0 && acceptNote && <p className="text-[13px] text-ink-700">{acceptNote}</p>}
          </div>

          <Card className="self-start">
            <CardHeader className="flex items-center gap-2">
              <Wrench className="h-4 w-4 text-navy-700" />
              <CardTitle>What the agent did</CardTitle>
            </CardHeader>
            <CardBody>
              <ol className="space-y-2 text-[13px]">
                {result.trace.map((t, i) => (
                  <li key={i} className="flex gap-2">
                    <span className={t.ok ? "text-positive-600" : "text-negative-600"}>{t.ok ? "✓" : "✕"}</span>
                    <div className="min-w-0">
                      <div className="text-ink-800">
                        {TOOL_LABELS[t.name] ?? t.name}
                        {t.evidenceId ? <span className="text-ink-500"> · {t.evidenceId}</span> : null}
                      </div>
                      <div className="text-2xs text-ink-500 wrap-break-word">{t.summary}</div>
                    </div>
                  </li>
                ))}
              </ol>
              <dl className="mt-3 space-y-0.5 text-2xs text-ink-500">
                <div>
                  Mode: {MODE_LABEL[result.mode]}
                  {result.provider ? ` · requested ${result.provider.requestedModel}; answered by ${result.provider.actualModels.join(", ") || "none"}${result.provider.fallbackUsed ? " (fallback)" : ""}` : ""}
                </div>
                {result.usage && (
                  <div>
                    {result.usage.requests} request{result.usage.requests === 1 ? "" : "s"} · {result.usage.inputTokens.toLocaleString()} input / {result.usage.outputTokens.toLocaleString()} output tokens
                  </div>
                )}
                <div>
                  Context: {result.context.alternativeName}, revision <code>{result.context.inputRevision}</code>
                </div>
              </dl>
              <p className="mt-3 text-2xs text-ink-500 leading-relaxed">Every figure should come from a deterministic Atlas engine; the model plans and writes, it does not do the math.</p>
            </CardBody>
          </Card>
        </div>
      )}
    </>
  );
}

// What the figure check found: unsupported and unchecked figures are named,
// and "all matched" appears only when every figure matched a typed engine
// result (value, unit, currency and any written sign).
function FigureStatus({ figures }: { figures: CopilotResult["figures"] }) {
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  if (figures.unsupported.length === 0 && figures.unchecked.length === 0) {
    return (
      <p className="text-2xs text-ink-500" data-testid="copilot-figures">
        {figures.claims === 0 ? "No figures to check in this answer." : `${plural(figures.claims, "figure")} checked against this run's engine results by value, unit, currency and sign; all matched.`}
      </p>
    );
  }
  return (
    <div role="status" className="rounded-md bg-warning-50 ring-1 ring-inset ring-warning-500/40 px-3 py-2 text-[13px] text-ink-800 space-y-1" data-testid="copilot-figures">
      <div>
        {figures.matched} of {plural(figures.claims, "figure")} matched this run&apos;s engine results.
      </div>
      {figures.unsupported.length > 0 && (
        <div data-testid="copilot-figures-unsupported">
          Not supported by any engine result (value, unit, currency or sign), so not verified: {figures.unsupported.join(", ")}.
        </div>
      )}
      {figures.unchecked.length > 0 && (
        <div data-testid="copilot-figures-unchecked">
          Couldn&apos;t be checked (no unit, or a direction only the wording states): {figures.unchecked.join(", ")}.
        </div>
      )}
    </div>
  );
}

// The drafts as a preview: each draft's effect on the active alternative, from
// the shared desk evaluator over the current workspace. Nothing is saved until
// the advisor accepts, and acceptance adds unapproved members only.
function DraftPreview(props: {
  result: CopilotResult;
  stale: boolean;
  selected: Set<string>;
  existing: Set<string>;
  onToggle: (id: string) => void;
  onAccept: () => void;
  onDiscard: () => void;
  note: string | null;
}) {
  const { result, stale, selected, existing } = props;
  const s = useAtlasStore();
  const ccy = s.client.proposalOutputCurrency;
  const preview = React.useMemo(() => {
    const holdings = normalizeHoldings(s.holdings, s.fxRates, ccy);
    const fx = { reportingCurrency: ccy, rates: s.fxRates };
    const picked = result.drafts.filter((d) => selected.has(d.id) && !s.recommendations.some((r) => r.id === d.id));
    const base = { holdings, accounts: s.accounts, fx, view: "draft" as const };
    const before = evaluateDesk({ ...base, recommendations: s.recommendations, draft: s.workingDraft });
    const after = evaluateDesk({
      ...base,
      recommendations: [...s.recommendations, ...picked],
      draft: { ...s.workingDraft, memberIds: [...s.workingDraft.memberIds, ...picked.map((d) => d.id)] },
    });
    // The same gate the store applies on accept: the selection together.
    const problems = picked.length ? candidateProblems({ holdings, accounts: s.accounts, recommendations: s.recommendations, draft: s.workingDraft, candidates: picked, fx }) : [];
    return { before, after, picked, problems };
  }, [s.holdings, s.fxRates, s.accounts, s.recommendations, s.workingDraft, ccy, result.drafts, selected]);
  const money = (n: number) => formatCurrency(n, ccy, { compact: true });
  const position = (d: Recommendation, which: "before" | "after") =>
    (which === "before" ? preview.before : preview.after).positions.find((p) => p.id === d.relatedHoldingId)?.proposed ?? null;
  const allAccepted = result.drafts.every((d) => existing.has(d.id));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Draft preview · not saved, not approved</CardTitle>
      </CardHeader>
      <CardBody className="space-y-3" data-testid="copilot-drafts">
        {stale && !allAccepted && (
          <div role="alert" className="rounded-md bg-warning-50 ring-1 ring-inset ring-warning-500/40 px-3 py-2 text-[13px] text-ink-800">
            The workspace changed after this answer (or another alternative is active), so this preview is stale and can&apos;t be accepted. Ask again.
          </div>
        )}
        {result.drafts.map((d) => {
          const accepted = existing.has(d.id);
          const b = position(d, "before");
          const a = position(d, "after");
          return (
            <div key={d.id} className="rounded-md border border-ink-100 p-3">
              <div className="flex flex-wrap items-center gap-2">
                {!accepted && (
                  <input type="checkbox" aria-label={`Include ${d.title}`} checked={selected.has(d.id)} onChange={() => props.onToggle(d.id)} disabled={stale} />
                )}
                <Badge tone="navy">{d.type.replace(/_/g, " ")}</Badge>
                <Badge tone={accepted ? "positive" : "warning"}>{accepted ? "In the alternative · unapproved" : "Preview"}</Badge>
                <Badge tone="neutral">{d.priority} priority</Badge>
              </div>
              <h4 className="font-serif text-base text-ink-900 mt-1.5">{d.title}</h4>
              <p className="text-sm text-ink-600 mt-1 leading-relaxed">{d.rationale}</p>
              {d.relatedHoldingId && d.actionAmount != null && b != null && !accepted && (
                <p className="text-[13px] text-ink-700 mt-1">
                  In &quot;{s.workingDraft.name}&quot; (allocation desk): {money(b)} → {selected.has(d.id) && a != null ? money(a) : "not selected"}
                </p>
              )}
            </div>
          );
        })}
        {preview.picked.length > 0 && (
          <p className="text-[13px] text-ink-700">
            Scope after the selected drafts: {money(preview.before.totals.proposed)} → {money(preview.after.totals.proposed)}
          </p>
        )}
        {preview.problems.length > 0 && !stale && (
          <div role="alert" className="rounded-md bg-warning-50 ring-1 ring-inset ring-warning-500/40 px-3 py-2 text-[13px] text-ink-800" data-testid="copilot-accept-problems">
            This selection can&apos;t be accepted together: {preview.problems.join(" ")}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={props.onAccept} disabled={stale || preview.picked.length === 0 || preview.problems.length > 0} iconLeft={<Check className="h-4 w-4" />}>
            Accept selected into &quot;{result.context.alternativeName}&quot; (unapproved)
          </Button>
          <Button size="sm" variant="ghost" onClick={props.onDiscard} iconLeft={<X className="h-4 w-4" />}>
            Discard
          </Button>
          {allAccepted && (
            <Link href="/allocation-desk" className="text-[13px] underline self-center">
              Review in the allocation desk
            </Link>
          )}
        </div>
        {props.note && (
          <p role="status" className="text-[13px] text-ink-700" data-testid="copilot-accept-note">
            {props.note}
          </p>
        )}
        <p className="text-2xs text-ink-500">Accepting adds the drafts to the active alternative as unapproved actions, excluded from the PDF. Approving them, and approving a version, stay with you.</p>
      </CardBody>
    </Card>
  );
}

// Renders the small Markdown subset the Copilot uses (paragraphs, "- " lists,
// **bold**, *italic*) as React elements, so model output is never injected as HTML.
function MiniMarkdown({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) {
      blocks.push(
        <ul key={blocks.length} className="list-disc pl-5 space-y-1">
          {list.map((l, i) => <li key={i}>{inline(l)}</li>)}
        </ul>
      );
      list = [];
    }
  };
  for (const line of text.split("\n")) {
    const item = line.match(/^\s*[-*]\s+(.*)$/);
    if (item) {
      list.push(item[1]);
      continue;
    }
    flush();
    const heading = line.match(/^#{1,4}\s+(.*)$/);
    if (heading) blocks.push(<h4 key={blocks.length} className="font-semibold text-ink-900">{inline(heading[1])}</h4>);
    else if (line.trim()) blocks.push(<p key={blocks.length}>{inline(line)}</p>);
  }
  flush();
  return <div className="space-y-2 text-sm text-ink-700 leading-relaxed">{blocks}</div>;
}

function inline(s: string): React.ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i} className="text-ink-900">{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={i} className="text-[12px]">{part.slice(1, -1)}</code>;
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) return <em key={i}>{part.slice(1, -1)}</em>;
    return part;
  });
}
