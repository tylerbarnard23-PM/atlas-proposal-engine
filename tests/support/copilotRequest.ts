import type { WorkingDraft } from "@/domain/types";
import { agentContextOf } from "@/copilot/context";
import { newWorkingDraft } from "@/engines/allocationDesk";
import { actualRun, copilotMode } from "@/copilot/routeHandler";

/**
 * A Copilot request body as the page builds it (D4): the snapshot with its
 * active alternative, and the context computed from that same snapshot.
 */
/** What the page asks to run on a server with this environment (it reads the mode first): Claude, the scripted example or the test provider. */
export function runAsFor(env: Record<string, string | undefined>) {
  return actualRun(copilotMode(env), env);
}

export function copilotRequest<S extends object>(question: string, snapshot: S) {
  const draft = (snapshot as { workingDraft?: WorkingDraft }).workingDraft ?? newWorkingDraft("2026-10-01T00:00:00.000Z");
  const withDraft = { ...snapshot, workingDraft: draft };
  return { question, snapshot: withDraft, context: agentContextOf(withDraft as never) };
}
