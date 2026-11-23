"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useAtlasStore } from "@/store/useStore";
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from "@/components/ui/Card";
import { Label, Textarea } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/Section";
import { ClientOnly } from "@/components/layout/ClientOnly";
import { DiscoveryQuestionnaire } from "@/components/profile/DiscoveryQuestionnaire";
import { ClientBriefPanel } from "@/components/profile/ClientBriefPanel";
import { clientBrief } from "@/engines/clientDiscovery";

// #111: the client's objectives on their own page: the discovery
// questionnaire, the advisor's review, the full brief and the private
// discovery notes, reading and writing the same stored answers as before.
// Nothing here runs an analysis or creates a recommendation; "Continue to
// Stratovell AI" only navigates.

export default function ClientObjectivesPage() {
  return (
    <ClientOnly>
      <Inner />
    </ClientOnly>
  );
}

const continueLink =
  "inline-flex items-center gap-1.5 rounded-md bg-navy-700 px-3 h-9 text-[13px] font-medium text-white hover:bg-navy-800 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-navy-300";

function Inner() {
  const client = useAtlasStore((s) => s.client);
  const setClient = useAtlasStore((s) => s.setClient);
  const b = clientBrief(client);

  // A link to a section (#client-discovery, #client-brief, a question) lands on it once the workspace has loaded.
  React.useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id) document.getElementById(id)?.scrollIntoView({ block: "start" });
  }, []);

  return (
    <>
      <PageHeader
        eyebrow="Engagement"
        title="Client objectives"
        description="What the client told you: objectives, time horizon, money needs, attitude to losses, tax sensitivity and constraints. Record each answer, then record your review. Stratovell AI relates its analysis to this brief. Nothing on this page runs an analysis or creates a recommendation."
      />

      <div className="max-w-4xl space-y-6">
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-paper ring-1 ring-inset ring-ink-100 px-4 py-3"
          data-testid="objectives-status"
        >
          <span className="text-[13px] text-ink-700">
            {b.counts.answered} of {b.counts.total} answered · {b.counts.reviewed} reviewed · {b.counts.stale} changed since review
            {b.conflicts.length ? ` · ${b.conflicts.length} possible conflict${b.conflicts.length === 1 ? "" : "s"}` : ""}
          </span>
          <Link href="/copilot" className={continueLink} data-testid="continue-to-ai">
            Continue to Stratovell AI <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <DiscoveryQuestionnaire />

        <ClientBriefPanel />

        <Card>
          <CardHeader>
            <CardTitle>Advisor discovery notes (private)</CardTitle>
          </CardHeader>
          <CardBody>
            <Textarea
              rows={3}
              aria-label="Advisor discovery notes (private)"
              value={client.advisorDiscoveryNotes ?? ""}
              onChange={(e) => setClient({ advisorDiscoveryNotes: e.target.value })}
            />
            <p className="mt-1 text-2xs text-ink-500">Private to you: never part of the client brief and never sent to Stratovell AI or Anthropic.</p>
          </CardBody>
        </Card>

        <EarlierProfile />

        <div className="flex justify-end">
          <Link href="/copilot" className={continueLink}>
            Continue to Stratovell AI <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </>
  );
}

/**
 * The profile levels and notes from before discovery existed. Kept so older
 * proposals and saved workspaces stay as they were; never discovery answers,
 * never reviewed, never sent to Stratovell AI. The levels are read-only (no
 * second risk form); the two notes still print, labelled as earlier notes, so
 * they stay editable here.
 */
function EarlierProfile() {
  const client = useAtlasStore((s) => s.client);
  const setClient = useAtlasStore((s) => s.setClient);
  return (
    <Card>
      <details data-testid="earlier-profile">
        <summary className="cursor-pointer list-none rounded-t-lg focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-navy-300">
          <CardHeader>
            <CardTitle>Earlier profile fields (kept for compatibility)</CardTitle>
            <CardSubtitle>Not discovery answers, not reviewed and not sent to Stratovell AI. Select to show.</CardSubtitle>
          </CardHeader>
        </summary>
        <CardBody className="space-y-3 text-[13px]">
          <p className="text-2xs text-ink-500">
            Proposals approved before discovery existed show these levels; new versions present the reviewed client brief instead. Use the questions above for what
            the client said.
          </p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
            <Level term="Risk level (earlier)" value={client.riskTolerance} />
            <Level term="Liquidity level (earlier)" value={client.liquidityNeeds} />
            <Level term="Income level (earlier)" value={client.incomeNeeds} />
          </dl>
          <div>
            <Label htmlFor="earlier-objective">Earlier objective note</Label>
            <Textarea id="earlier-objective" rows={2} value={client.investmentObjective} onChange={(e) => setClient({ investmentObjective: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="earlier-instructions">Earlier special instructions</Label>
            <Textarea id="earlier-instructions" rows={2} value={client.specialInstructions ?? ""} onChange={(e) => setClient({ specialInstructions: e.target.value })} />
          </div>
          <p className="text-2xs text-ink-500">The two notes print in the proposal under “Earlier profile notes (not part of the reviewed brief)”. Clear them to leave them out.</p>
        </CardBody>
      </details>
    </Card>
  );
}

function Level({ term, value }: { term: string; value: string }) {
  return (
    <div>
      <dt className="text-2xs text-ink-500">{term}</dt>
      <dd className="capitalize text-ink-800">{value}</dd>
    </div>
  );
}
