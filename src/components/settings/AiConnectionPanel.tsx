import Link from "next/link";
import { Card, CardBody } from "@/components/ui/Card";
import { HostedConnection, PUBLIC_PREVIEW } from "@/components/copilot/HostedConnection";
import { ModeBadge, useCopilotMode } from "@/components/copilot/CopilotWorkspace";

// #113: Settings · AI connection. On the hosted site this is where a user signs
// in, connects or replaces their own API key, starts or stops a session and
// disconnects. Elsewhere it says what this server runs. Reading it sends
// nothing to a model.

export function AiConnectionPanel() {
  const mode = useCopilotMode();
  return (
    <Card id="ai-connection" className="mb-5 scroll-mt-4" data-testid="ai-connection">
      <CardBody className="space-y-3">
        {!mode ? (
          <p className="text-[13px] text-ink-500">Checking the AI connection…</p>
        ) : mode.mode === "hosted" ? (
          <HostedConnection info={mode.hosted} onChanged={mode.refresh} />
        ) : (
          <div className="space-y-2 text-[13px] text-ink-700">
            <div className="flex flex-wrap items-center gap-2">
              <ModeBadge mode={mode.mode} model={mode.model} live={mode.live} />
            </div>
            <p>
              {mode.mode === "demo"
                ? `${PUBLIC_PREVIEW} This server runs only the labelled scripted example; it has no sign-in or key storage.`
                : mode.mode === "test"
                ? "This server answers with the deterministic test provider: not a model, no API calls."
                : "This is a local Stratovell: Claude is connected on this computer (Connect Claude on the Stratovell AI page)."}
            </p>
            <p>
              <Link className="font-medium text-navy-700 hover:underline" href="/copilot">
                Open Stratovell AI
              </Link>
            </p>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
