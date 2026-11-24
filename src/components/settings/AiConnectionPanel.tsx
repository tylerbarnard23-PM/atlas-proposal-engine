import Link from "next/link";
import { Card, CardBody } from "@/components/ui/Card";
import { ModeBadge, useCopilotMode } from "@/components/copilot/CopilotWorkspace";

// Settings · AI connection: what this copy of Stratovell runs. In the desktop
// application (live mode) Claude is connected under Connect Claude on the
// Stratovell AI page, with the user's own key. The public website is a scripted
// preview with no sign-in or key storage (hosted mode was retired in #116).
// Reading it sends nothing to a model.

export const SCRIPTED_PREVIEW = "Scripted preview · Claude is not connected.";

export function AiConnectionPanel() {
  const mode = useCopilotMode();
  return (
    <Card id="ai-connection" className="mb-5 scroll-mt-4" data-testid="ai-connection">
      <CardBody className="space-y-3">
        {!mode ? (
          <p className="text-[13px] text-ink-500">Checking the AI connection…</p>
        ) : (
          <div className="space-y-2 text-[13px] text-ink-700">
            <div className="flex flex-wrap items-center gap-2">
              <ModeBadge mode={mode.mode} model={mode.model} live={mode.live} />
            </div>
            <p>
              {mode.mode === "demo"
                ? `${SCRIPTED_PREVIEW} This website runs only the labelled scripted example; it has no sign-in or key storage. Claude analysis runs in the Stratovell desktop application, with your own Anthropic API key.`
                : mode.mode === "test"
                ? "This server answers with the deterministic test provider: not a model, no API calls."
                : "Stratovell runs on this computer. Connect Claude with your own Anthropic API key under Connect Claude on the Stratovell AI page. Saving a key makes no model request; analysis starts only when you start it."}
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
