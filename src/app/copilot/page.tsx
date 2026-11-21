"use client";

import * as React from "react";
import { ClientOnly } from "@/components/layout/ClientOnly";
import { PageHeader } from "@/components/ui/Section";
import { Card, CardBody } from "@/components/ui/Card";
import { CopilotWorkspace, ModeBadge, useCopilotMode } from "@/components/copilot/CopilotWorkspace";
import { ClientBriefPanel } from "@/components/profile/ClientBriefPanel";
import { PortfolioChecks, findingQuestion } from "@/components/insights/PortfolioChecks";
import { cn } from "@/utils/cn";
import type { Insight } from "@/domain/types";

export default function CopilotPage() {
  return (
    <ClientOnly>
      <Inner />
    </ClientOnly>
  );
}

type View = "analysis" | "checks";
const VIEWS: { id: View; label: string }[] = [
  { id: "analysis", label: "AI analysis" },
  { id: "checks", label: "Portfolio checks" },
];

function Inner() {
  const mode = useCopilotMode();
  // A contextual entry point can prefill the question; it never runs by itself.
  const [params] = React.useState(() => new URLSearchParams(window.location.search));
  const [view, setView] = React.useState<View>(params.get("view") === "checks" ? "checks" : "analysis");
  const [question, setQuestion] = React.useState(() => ({ text: params.get("q") ?? "", key: 0 }));

  function show(v: View) {
    setView(v);
    const url = new URL(window.location.href);
    if (v === "checks") url.searchParams.set("view", "checks");
    else url.searchParams.delete("view");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }

  // A finding goes to the analysis view as a question; nothing runs until the advisor runs it.
  function analyze(i: Insight) {
    setQuestion((q) => ({ text: findingQuestion(i), key: q.key + 1 }));
    show("analysis");
  }

  return (
    <>
      <PageHeader
        eyebrow="Advisory · AI-assisted"
        title="Stratovell AI"
        description="The advisor records the client's objectives. Stratovell checks the portfolio data and calculates possible changes. Claude analyzes that information and prepares recommendations for your review and approval: drafts are a preview until you add them, and adding never approves anything."
        actions={mode && <ModeBadge mode={mode.mode} model={mode.model} live={mode.live} />}
      />
      <div role="tablist" aria-label="Stratovell AI views" className="mb-4 flex gap-1 border-b border-ink-100 max-w-4xl">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            role="tab"
            id={`tab-${v.id}`}
            aria-selected={view === v.id}
            aria-controls={`panel-${v.id}`}
            onClick={() => show(v.id)}
            data-testid={`view-${v.id}`}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-[14px] font-medium focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-navy-300 rounded-t",
              view === v.id ? "border-navy-700 text-navy-800" : "border-transparent text-ink-500 hover:text-ink-800"
            )}
          >
            {v.label}
          </button>
        ))}
      </div>
      {view === "analysis" ? (
        <div role="tabpanel" id="panel-analysis" aria-labelledby="tab-analysis">
          <div className="max-w-4xl mb-4">
            <ClientBriefPanel variant="compact" />
          </div>
          <Card className="max-w-4xl">
            <CardBody>
              <CopilotWorkspace key={question.key} initialQuestion={question.text} />
            </CardBody>
          </Card>
        </div>
      ) : (
        <div role="tabpanel" id="panel-checks" aria-labelledby="tab-checks" className="max-w-4xl">
          <PortfolioChecks onAnalyze={analyze} />
        </div>
      )}
    </>
  );
}
