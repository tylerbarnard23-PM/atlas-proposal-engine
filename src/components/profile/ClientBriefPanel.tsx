import Link from "next/link";
import { useAtlasStore } from "@/store/useStore";
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from "@/components/ui/Card";
import { Label, Textarea } from "@/components/ui/Input";
import { clientBrief, modelBoundClientBrief } from "@/engines/clientDiscovery";
import { redactIdentity } from "@/copilot/redaction";
import { StatusBadge } from "./DiscoveryQuestionnaire";

// #109: the client brief for analysis, before the advisor asks Stratovell AI.
// It separates recorded answers (and their review), unknowns and conflicts,
// keeps the private discovery notes out, and shows the exact text a live
// question would send to Anthropic (names replaced, as the agent does).

export function ClientBriefPanel({ variant = "full" }: { variant?: "full" | "compact" }) {
  const client = useAtlasStore((s) => s.client);
  const advisor = useAtlasStore((s) => s.advisor);
  const sourceDocuments = useAtlasStore((s) => s.sourceDocuments);
  const setNote = useAtlasStore((s) => s.setAnalysisNote);
  const b = clientBrief(client);
  const compact = variant === "compact";
  const sent = redactIdentity({ client, advisor, sourceDocuments }, JSON.stringify(modelBoundClientBrief(client), null, 2), true);

  return (
    <Card id="client-brief" data-testid="client-brief">
      <CardHeader>
        <CardTitle>Client brief for analysis</CardTitle>
        <CardSubtitle>
          {b.counts.answered} of {b.counts.total} answered · {b.counts.reviewed} reviewed{b.counts.stale ? ` · ${b.counts.stale} changed since review` : ""}
          {b.conflicts.length ? ` · ${b.conflicts.length} possible conflict${b.conflicts.length === 1 ? "" : "s"}` : ""}
        </CardSubtitle>
      </CardHeader>
      <CardBody className="space-y-4 text-[13px]">
        {compact ? (
          // #111: on Stratovell AI, a concise summary; the full brief lives on Client objectives.
          <div className="space-y-1.5 text-ink-700" data-testid="client-brief-summary">
            <p>
              Stratovell AI relates its analysis to this brief and asks about what wasn’t discussed.{" "}
              <Link href="/client-objectives#client-discovery" className="text-navy-700 underline underline-offset-2">
                Edit client objectives
              </Link>
            </p>
            {(b.notDiscussed.length > 0 || b.conflicts.length > 0 || b.missingDetails.length > 0) && (
              <p className="text-2xs text-ink-600">
                {[
                  b.notDiscussed.length ? `${b.notDiscussed.length} not discussed yet (unknown)` : null,
                  b.conflicts.length ? `${b.conflicts.length} possible conflict${b.conflicts.length === 1 ? "" : "s"} to resolve with the client` : null,
                  b.missingDetails.length ? `${b.missingDetails.length} detail${b.missingDetails.length === 1 ? "" : "s"} still missing` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
            {b.restrictionsOnFile.length > 0 && (
              <p className="text-warning-600">Restricted investments on file, not confirmed in discovery: {b.restrictionsOnFile.join(", ")}. Still treated as restricted.</p>
            )}
          </div>
        ) : (
          <FullBrief b={b} />
        )}

        <div>
          <Label htmlFor={`brief-note-${variant}`}>Note for the analysis (optional)</Label>
          <Textarea id={`brief-note-${variant}`} rows={2} value={client.discovery?.analysisNote ?? ""} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Focus on the concentration before the planned withdrawal." />
          <p className="mt-1 text-2xs text-ink-500">Part of the brief. Don’t include names or account numbers. Your private discovery notes are never included.</p>
        </div>

        <details className="rounded-md border border-ink-100 px-3 py-2">
          <summary className="cursor-pointer text-ink-700 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-navy-300 rounded">
            What a live analysis sends to Anthropic
          </summary>
          <p className="mt-2 text-2xs text-ink-500">
            With live Claude, your question, this brief and the portfolio figures Claude’s tool calls return are sent to Anthropic. Names Stratovell recognizes are replaced
            first, which isn’t full anonymization. The scripted demo sends nothing.
          </p>
          <pre className="mt-2 max-h-72 overflow-auto rounded bg-slatey-50 p-2 text-2xs text-ink-800 whitespace-pre-wrap" data-testid="client-brief-sent">
            {sent}
          </pre>
        </details>
      </CardBody>
    </Card>
  );
}

/** The full brief, on Client objectives: each recorded answer with its review, unknowns, conflicts, missing details and restrictions on file. */
function FullBrief({ b }: { b: ReturnType<typeof clientBrief> }) {
  return (
    <>
      {b.answers.length > 0 && (
        <section aria-labelledby="brief-answers">
          <h3 id="brief-answers" className="font-semibold text-ink-900 mb-1.5">
            Recorded answers
          </h3>
          <ul className="space-y-1.5">
            {b.answers.map((a) => (
              <li key={a.question} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="text-ink-500 min-w-44">{a.label}</span>
                <span className="text-ink-900">{a.answer}</span>
                {a.clarification && <span className="text-ink-500">— {a.clarification}</span>}
                <StatusBadge status={a.status} reviewedAt={a.reviewedAt} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {b.notDiscussed.length > 0 && (
        <section aria-labelledby="brief-unknown">
          <h3 id="brief-unknown" className="font-semibold text-ink-900 mb-1">
            Not discussed yet (unknown)
          </h3>
          <p className="text-ink-700">{b.notDiscussed.map((q) => q.label).join(" · ")}</p>
        </section>
      )}

      {b.conflicts.length > 0 && (
        <section aria-labelledby="brief-conflicts" className="rounded-md bg-warning-50 px-3 py-2 ring-1 ring-inset ring-warning-500/30">
          <h3 id="brief-conflicts" className="font-semibold text-warning-600 mb-1">
            Possible conflicts to resolve with the client
          </h3>
          <ul className="list-disc pl-5 space-y-0.5 text-ink-800">
            {b.conflicts.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </section>
      )}

      {b.missingDetails.length > 0 && (
        <section aria-labelledby="brief-missing">
          <h3 id="brief-missing" className="font-semibold text-ink-900 mb-1">
            Details still missing
          </h3>
          <ul className="list-disc pl-5 space-y-0.5 text-ink-700">
            {b.missingDetails.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </section>
      )}

      {b.restrictionsOnFile.length > 0 && (
        <p className="text-warning-600">Restricted investments on file, not confirmed in discovery: {b.restrictionsOnFile.join(", ")}. Still treated as restricted.</p>
      )}
    </>
  );
}
