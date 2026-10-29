"use client";

import * as React from "react";
import { ClientOnly } from "@/components/layout/ClientOnly";
import { PageHeader } from "@/components/ui/Section";
import { Card, CardBody } from "@/components/ui/Card";
import { CopilotWorkspace, ModeBadge, useCopilotMode } from "@/components/copilot/CopilotWorkspace";

export default function CopilotPage() {
  return (
    <ClientOnly>
      <Inner />
    </ClientOnly>
  );
}

function Inner() {
  const mode = useCopilotMode();
  // A contextual entry point can prefill the question; it never runs by itself.
  const [initial] = React.useState(() => new URLSearchParams(window.location.search).get("q") ?? "");

  return (
    <>
      <PageHeader
        eyebrow="Advisory · AI-assisted"
        title="Proposal Copilot"
        description="Ask about the active alternative. Answers come from the same Atlas engines the rest of the app uses. Drafts are a preview until you add them to the working draft, and adding never approves anything."
        actions={mode && <ModeBadge mode={mode.mode} model={mode.model} />}
      />
      <Card className="max-w-4xl">
        <CardBody>
          <CopilotWorkspace initialQuestion={initial} />
        </CardBody>
      </Card>
    </>
  );
}
