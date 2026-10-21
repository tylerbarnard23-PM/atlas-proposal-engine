"use client";

import * as React from "react";
import { forReadiness } from "@/engines/importCompleteness";
import Link from "next/link";
import { Bot, Check, CircleAlert, Plus, Send, Wrench } from "lucide-react";
import { useAtlasStore } from "@/store/useStore";
import { ClientOnly } from "@/components/layout/ClientOnly";
import { PageHeader } from "@/components/ui/Section";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import type { Recommendation } from "@/domain/types";
import type { CopilotResult } from "@/copilot/agent";

const SUGGESTIONS = [
  "Summarize this client's portfolio and the biggest issues",
  "Draft recommendations for the top risks",
  "Is this proposal ready to send? What's blocking the PDF?",
];

const TOOL_LABELS: Record<string, string> = {
  get_portfolio_overview: "Read portfolio overview",
  list_insights: "Ran insight engine",
  get_holding: "Inspected holding",
  simulate_recommendation: "Simulated in proposal engine",
  check_proposal_readiness: "Ran readiness checklist",
  draft_recommendation: "Saved draft recommendation",
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
  const upsert = useAtlasStore((s) => s.upsertRecommendation);
  const [question, setQuestion] = React.useState("");
  const [mode, setMode] = React.useState<"live" | "demo" | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<CopilotResult | null>(null);
  const [added, setAdded] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    fetch("/api/copilot")
      .then((r) => r.json())
      .then((d) => setMode(d.mode))
      .catch(() => setMode(null));
  }, []);

  async function ask(q: string) {
    const text = q.trim();
    if (!text || loading) return;
    setQuestion(text);
    setLoading(true);
    setError(null);
    setResult(null);
    setAdded(new Set());
    try {
      const res = await fetch("/api/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: text,
          snapshot: {
            client: state.client,
            advisor: state.advisor,
            accounts: state.accounts,
            holdings: state.holdings,
            fxRates: state.fxRates,
            recommendations: state.recommendations,
            disclosures: state.disclosures,
            sourceDocuments: state.sourceDocuments.map(forReadiness),
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      setResult(data as CopilotResult);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function addDraft(rec: Recommendation) {
    upsert(rec);
    setAdded((s) => new Set(s).add(rec.id));
  }

  return (
    <>
      <PageHeader
        eyebrow="Advisory · AI-assisted"
        title="Proposal Copilot"
        description="Ask about this client's portfolio. Claude answers by calling the same Atlas engines the rest of the app uses, and any recommendations it drafts arrive unapproved for you to review."
        actions={
          mode && (
            <Badge tone={mode === "live" ? "positive" : "gold"} className="whitespace-nowrap" title={mode === "demo" ? "A scripted planner calls the same engine tools as the live agent." : undefined}>
              {mode === "live" ? "Live · Claude" : "Demo mode · no API key"}
            </Badge>
          )
        }
      />

      <Card>
        <CardBody className="space-y-3">
          <Textarea
            rows={3}
            value={question}
            placeholder="e.g. Which positions create the most concentration risk, and what would trimming them do?"
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) ask(question);
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => ask(question)} loading={loading} iconLeft={<Send className="h-4 w-4" />}>
              Ask Copilot
            </Button>
            {SUGGESTIONS.map((s) => (
              <Button key={s} size="sm" variant="secondary" onClick={() => ask(s)} disabled={loading}>
                {s}
              </Button>
            ))}
          </div>
        </CardBody>
      </Card>

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-md border border-negative-500/30 bg-negative-50 px-4 py-3 text-sm text-negative-600">
          <CircleAlert className="h-4 w-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {loading && (
        <p className="mt-6 text-sm text-ink-500">Working through the engines… live answers can take up to a minute.</p>
      )}

      {result && (
        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            <Card>
              <CardHeader className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-navy-700" />
                <CardTitle>Answer</CardTitle>
              </CardHeader>
              <CardBody>
                <MiniMarkdown text={result.answer} />
              </CardBody>
            </Card>

            {result.drafts.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Draft recommendations · not approved</CardTitle>
                </CardHeader>
                <CardBody className="space-y-3">
                  {result.drafts.map((d) => (
                    <div key={d.id} className="rounded-md border border-ink-100 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="navy">{d.type.replace(/_/g, " ")}</Badge>
                        <Badge tone="warning">Needs review</Badge>
                        <Badge tone="neutral">{d.priority} priority</Badge>
                      </div>
                      <h4 className="font-serif text-base text-ink-900 mt-1.5">{d.title}</h4>
                      <p className="text-sm text-ink-600 mt-1 leading-relaxed">{d.rationale}</p>
                      <div className="mt-2">
                        {added.has(d.id) ? (
                          <span className="inline-flex items-center gap-1 text-[13px] text-positive-600">
                            <Check className="h-4 w-4" /> Added.{" "}
                            <Link href="/recommendations" className="underline">Review in Recommendations</Link>
                          </span>
                        ) : (
                          <Button size="sm" variant="secondary" onClick={() => addDraft(d)} iconLeft={<Plus className="h-4 w-4" />}>
                            Add to Recommendations (unapproved)
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </CardBody>
              </Card>
            )}
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
                      <div className="text-ink-800">{TOOL_LABELS[t.name] ?? t.name}</div>
                      <div className="text-2xs text-ink-500 wrap-break-word">{t.summary}</div>
                    </div>
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-2xs text-ink-500 leading-relaxed">
                {result.mode === "live" ? `Model: ${result.model}. ` : ""}
                Every figure comes from a deterministic Atlas engine; the model plans and writes, it does not do the math.
              </p>
            </CardBody>
          </Card>
        </div>
      )}
    </>
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
