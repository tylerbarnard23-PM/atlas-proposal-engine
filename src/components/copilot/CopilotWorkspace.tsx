"use client";

import * as React from "react";
import Link from "next/link";
import { Bot, Check, CircleAlert, CircleCheck, Eye, Send, Square, X } from "lucide-react";
import { candidateProblems, evaluateDesk } from "@/engines/allocationDesk";
import { normalizeHoldings } from "@/engines/normalizationEngine";
import { ADDED, PREVIEW_ONLY, copilotRequest, previewPhase, reviewHref, scopeLabel } from "@/copilot/request";
import { useAtlasStore } from "@/store/useStore";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import { formatCurrency } from "@/utils/formatting";
import { cn } from "@/utils/cn";
import type { Recommendation } from "@/domain/types";
import type { CopilotMode, CopilotResult, RunStatus } from "@/copilot/agent";

// The Copilot conversation, shared by the Copilot page and the allocation
// desk's side panel. A question runs only when the advisor asks: mounting or
// opening it sends nothing but the mode lookup. Drafts are a preview until the
// advisor adds them to the working draft, and adding never approves anything.

export const SUGGESTIONS = [
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
  draft_recommendation: "Prepared a draft (preview only)",
};

export const MODE_LABEL: Record<CopilotMode, string> = {
  demo: "Scripted demo · no model",
  test: "Test provider · not a model",
  live: "Live · Claude",
};
export const MODE_HINT: Record<CopilotMode, string> = {
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

/** The mode the server runs Copilot in (a GET; it never starts a run). */
export function useCopilotMode() {
  const [mode, setMode] = React.useState<{ mode: CopilotMode; model: string | null } | null>(null);
  React.useEffect(() => {
    fetch("/api/copilot")
      .then((r) => r.json())
      .then((d) => setMode({ mode: d.mode, model: d.model ?? null }))
      .catch(() => setMode(null));
  }, []);
  return mode;
}

export function ModeBadge({ mode, model }: { mode: CopilotMode; model: string | null }) {
  return (
    <Badge tone={mode === "live" ? "positive" : mode === "test" ? "warning" : "gold"} className="whitespace-nowrap" title={MODE_HINT[mode]} data-testid="copilot-mode">
      {MODE_LABEL[mode]}
      {mode !== "demo" && model ? ` · ${model}` : ""}
    </Badge>
  );
}

export function CopilotWorkspace({
  initialQuestion = "",
  variant = "page",
  onAdded,
}: {
  initialQuestion?: string;
  /** "panel" stacks everything in one narrow column. */
  variant?: "page" | "panel";
  /** Called with the IDs just added to the working draft. */
  onAdded?: (ids: string[]) => void;
}) {
  const state = useAtlasStore();
  const accept = useAtlasStore((s) => s.acceptAgentDrafts);
  const mode = useCopilotMode();
  const [question, setQuestion] = React.useState(initialQuestion.slice(0, 2000));
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<CopilotResult | null>(null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [note, setNote] = React.useState<{ tone: "info" | "error"; text: string } | null>(null);
  const abort = React.useRef<AbortController | null>(null);
  React.useEffect(() => () => abort.current?.abort(), []);

  const request = React.useMemo(() => copilotRequest(state, ""), [state]);
  const context = request.context;
  const scope = scopeLabel(state.accounts, state.workingDraft);
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
    setNote(null);
    const controller = new AbortController();
    abort.current = controller;
    try {
      const res = await fetch("/api/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ ...request, question: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      const r = data as CopilotResult;
      setResult(r);
      setSelected(new Set(r.drafts.map((d) => d.id)));
    } catch (e) {
      setError(controller.signal.aborted ? "Cancelled. Nothing was added." : (e as Error).message);
    } finally {
      abort.current = null;
      setLoading(false);
    }
  }

  function addSelected() {
    if (!result) return;
    const drafts = result.drafts.filter((d) => selected.has(d.id));
    const r = accept(drafts, result.context);
    if (!r.ok) {
      setNote({ tone: "error", text: r.error });
      return;
    }
    setNote(r.added.length > 0 ? (r.skipped.length ? { tone: "info", text: `${r.skipped.length} already in the working draft.` } : null) : { tone: "info", text: "Already in the working draft; nothing changed." });
    if (r.added.length > 0) onAdded?.(r.added);
  }

  const shownMode = result?.mode ?? mode?.mode ?? null;
  const panel = variant === "panel";

  return (
    <div className="space-y-3">
      <div className="rounded-md bg-slatey-50 ring-1 ring-inset ring-ink-100 px-3 py-2 text-[13px] text-ink-700" data-testid="copilot-context">
        <div className={cn("flex gap-x-6 gap-y-1", panel ? "flex-col" : "flex-wrap")}>
          <span>
            <span className="text-ink-500">Asking about </span>
            <strong className="text-ink-900">{state.workingDraft.name}</strong>
            {!panel && <span className="text-ink-500"> for {state.client.fullName || "an unnamed client"}</span>}
          </span>
          <span data-testid="copilot-scope" title={scope.text}>
            <span className="text-ink-500">Scope </span>
            {scope.short}
          </span>
        </div>
        {shownMode && (
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-2xs text-ink-500">
            {panel && mode && <ModeBadge mode={shownMode} model={mode.model} />}
            <span>{MODE_HINT[shownMode]}</span>
          </div>
        )}
      </div>

      <div className="space-y-2">
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
          <Button onClick={() => ask(question)} loading={loading} disabled={!question.trim()} iconLeft={<Send className="h-4 w-4" />}>
            Ask
          </Button>
          {loading && (
            <Button variant="secondary" onClick={() => abort.current?.abort()} iconLeft={<Square className="h-4 w-4" />}>
              Cancel
            </Button>
          )}
          <span className="text-2xs text-ink-500">Nothing runs until you ask. Ctrl+Enter also asks.</span>
        </div>
        <div className="flex flex-wrap gap-2" aria-label="Suggested questions">
          {SUGGESTIONS.map((s) => (
            <Button key={s} size="sm" variant="secondary" onClick={() => ask(s)} disabled={loading}>
              {s}
            </Button>
          ))}
        </div>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-md border border-negative-500/30 bg-negative-50 px-4 py-3 text-sm text-negative-600">
          <CircleAlert className="h-4 w-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {loading && <p role="status" className="text-sm text-ink-500">Working through the engines… live answers can take up to a minute. Cancel stops the request; nothing is added.</p>}

      {!result && note && (
        <p role="status" className="text-[13px] text-ink-700" data-testid="copilot-accept-note">
          {note.text}
        </p>
      )}

      {result && (
        <div className="space-y-3">
          {result.drafts.length > 0 && (
            <DraftPreview
              result={result}
              stale={stale}
              selected={selected}
              existing={existing}
              onToggle={(id) =>
                setSelected((s) => {
                  const n = new Set(s);
                  if (n.has(id)) n.delete(id);
                  else n.add(id);
                  return n;
                })
              }
              onAdd={addSelected}
              onDiscard={() => {
                setResult(null);
                setNote({ tone: "info", text: "Discarded — nothing added." });
              }}
              note={note}
            />
          )}

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
              <RunDetails result={result} />
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}

// The technical trace, behind Details: tools run, evidence IDs, provider,
// usage and the input revision the answer is bound to.
function RunDetails({ result }: { result: CopilotResult }) {
  return (
    <details className="rounded-md border border-ink-100 px-3 py-2 text-[13px]" data-testid="copilot-details">
      <summary className="cursor-pointer text-ink-700 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-navy-300 rounded">
        Details: what the agent did ({result.trace.length} step{result.trace.length === 1 ? "" : "s"})
      </summary>
      <ol className="mt-2 space-y-2">
        {result.trace.map((t, i) => (
          <li key={i} className="flex gap-2">
            <span className={t.ok ? "text-positive-600" : "text-negative-600"} aria-label={t.ok ? "succeeded" : "failed"}>
              {t.ok ? "✓" : "✕"}
            </span>
            <div className="min-w-0">
              <div className="text-ink-800">
                {TOOL_LABELS[t.name] ?? t.name}
                {t.evidenceId ? <span className="text-ink-500"> ({t.evidenceId})</span> : null}
              </div>
              <div className="text-2xs text-ink-500 wrap-break-word">{t.summary}</div>
            </div>
          </li>
        ))}
      </ol>
      <dl className="mt-3 space-y-0.5 text-2xs text-ink-500">
        <div>
          Mode: {MODE_LABEL[result.mode]}
          {result.provider ? `; requested ${result.provider.requestedModel}, answered by ${result.provider.actualModels.join(", ") || "none"}${result.provider.fallbackUsed ? " (fallback)" : ""}` : ""}
        </div>
        {result.usage && (
          <div>
            {result.usage.requests} request{result.usage.requests === 1 ? "" : "s"}, {result.usage.inputTokens.toLocaleString()} input and {result.usage.outputTokens.toLocaleString()} output tokens
          </div>
        )}
        <div>
          Context: {result.context.alternativeName}, revision <code>{result.context.inputRevision}</code>
        </div>
      </dl>
      <p className="mt-2 text-2xs text-ink-500 leading-relaxed">Every figure should come from a deterministic Atlas engine; the model plans and writes, it does not do the math.</p>
    </details>
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
// the shared desk evaluator over the current workspace. Nothing is added until
// the advisor adds it, and adding puts unapproved members only.
function DraftPreview(props: {
  result: CopilotResult;
  stale: boolean;
  selected: Set<string>;
  existing: Set<string>;
  onToggle: (id: string) => void;
  onAdd: () => void;
  onDiscard: () => void;
  note: { tone: "info" | "error"; text: string } | null;
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
    // The same gate the store applies on adding: the selection together.
    const problems = picked.length ? candidateProblems({ holdings, accounts: s.accounts, recommendations: s.recommendations, draft: s.workingDraft, candidates: picked, fx }) : [];
    return { before, after, picked, problems };
  }, [s.holdings, s.fxRates, s.accounts, s.recommendations, s.workingDraft, ccy, result.drafts, selected]);
  const money = (n: number) => formatCurrency(n, ccy, { compact: true });
  const position = (d: Recommendation, which: "before" | "after") =>
    (which === "before" ? preview.before : preview.after).positions.find((p) => p.id === d.relatedHoldingId)?.proposed ?? null;
  const { phase, added, pending } = previewPhase(result.drafts, existing, stale);
  const many = result.drafts.length > 1;
  const canAdd = phase === "preview" && preview.picked.length > 0 && preview.problems.length === 0;
  const alt = result.context.alternativeName;

  return (
    <Card className={cn("border-l-4", phase === "added" ? "border-l-positive-500" : "border-l-warning-500")}>
      <CardBody className="space-y-3" data-testid="copilot-drafts">
        <div role="status" data-testid="copilot-preview-state" data-phase={phase}>
          {phase === "added" ? (
            <div className="space-y-1">
              <div className="flex items-center gap-2 font-semibold text-positive-600">
                <CircleCheck className="h-4 w-4" />
                {ADDED}
              </div>
              <p className="text-[13px] text-ink-700">
                {added.length} action{added.length === 1 ? "" : "s"} joined &ldquo;{alt}&rdquo;, unapproved and left out of the PDF.
                {pending.length > 0 && ` ${pending.length} not added: the workspace changed, so ask again to add ${pending.length === 1 ? "it" : "them"}.`}
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
                <Link href={reviewHref(added)} className="font-medium text-navy-700 underline" data-testid="copilot-review-link">
                  Review and approve on Recommendations
                </Link>
                <Link href="/allocation-desk#desk-actions" className="text-navy-700 underline">
                  See it in the allocation desk
                </Link>
              </div>
            </div>
          ) : phase === "stale" ? (
            <div role="alert" className="flex items-start gap-2 text-[13px] text-ink-800">
              <CircleAlert className="h-4 w-4 mt-0.5 shrink-0 text-warning-600" />
              <span>
                <strong>{PREVIEW_ONLY}</strong> The workspace changed after this answer (or another alternative is active), so it can&apos;t be added. Ask again.
              </span>
            </div>
          ) : (
            <div className="space-y-0.5">
              <div className="flex items-center gap-2 font-semibold text-warning-600">
                <Eye className="h-4 w-4" />
                {PREVIEW_ONLY}
              </div>
              <p className="text-[13px] text-ink-700">
                {many ? "Choose which drafts to add to" : "Add this draft to"} &ldquo;{alt}&rdquo; to review it. Adding never approves anything.
              </p>
            </div>
          )}
        </div>

        {phase !== "added" && (
          <div className="flex flex-wrap gap-2">
            {phase === "preview" && (
              <Button size="sm" onClick={props.onAdd} disabled={!canAdd} iconLeft={<Check className="h-4 w-4" />}>
                {many ? `Add ${preview.picked.length} selected to working draft` : "Add to working draft"}
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={props.onDiscard} iconLeft={<X className="h-4 w-4" />}>
              Discard
            </Button>
          </div>
        )}

        {preview.problems.length > 0 && phase === "preview" && (
          <div role="alert" className="rounded-md bg-warning-50 ring-1 ring-inset ring-warning-500/40 px-3 py-2 text-[13px] text-ink-800" data-testid="copilot-accept-problems">
            This selection can&apos;t be added together: {preview.problems.join(" ")}
          </div>
        )}
        {props.note && (
          <p role={props.note.tone === "error" ? "alert" : "status"} className={cn("text-[13px]", props.note.tone === "error" ? "text-negative-600" : "text-ink-700")} data-testid="copilot-accept-note">
            {props.note.text}
          </p>
        )}

        <div className="space-y-2">
          {result.drafts.map((d) => {
            const isAdded = existing.has(d.id);
            const b = position(d, "before");
            const a = position(d, "after");
            const label = `Include "${d.title}"`;
            return (
              <div key={d.id} className="rounded-md border border-ink-100 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  {many && phase === "preview" && <input type="checkbox" aria-label={label} checked={selected.has(d.id)} onChange={() => props.onToggle(d.id)} />}
                  <Badge tone={isAdded ? "positive" : "warning"}>{isAdded ? "Added · awaiting approval" : "Preview"}</Badge>
                  <Badge tone="navy">{d.type.replace(/_/g, " ")}</Badge>
                  <Badge tone="neutral">{d.priority} priority</Badge>
                </div>
                <h4 className="font-serif text-base text-ink-900 mt-1.5">{d.title}</h4>
                <p className="text-sm text-ink-600 mt-1 leading-relaxed">{d.rationale}</p>
                {d.relatedHoldingId && d.actionAmount != null && b != null && !isAdded && (
                  <p className="text-[13px] text-ink-700 mt-1">
                    Position in &ldquo;{s.workingDraft.name}&rdquo;: <span className="tabular">{money(b)}</span> →{" "}
                    {selected.has(d.id) && a != null ? <span className="tabular rounded bg-navy-50 px-1 font-medium text-navy-700">{money(a)}</span> : "not selected"}
                  </p>
                )}
              </div>
            );
          })}
        </div>
        {preview.picked.length > 0 && phase === "preview" && (
          <p className="text-[13px] text-ink-700">
            Scope after the selected drafts: <span className="tabular">{money(preview.before.totals.proposed)}</span> → <span className="tabular">{money(preview.after.totals.proposed)}</span>
          </p>
        )}
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
