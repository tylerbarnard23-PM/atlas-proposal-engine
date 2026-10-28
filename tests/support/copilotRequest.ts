import type { WorkingDraft } from "@/domain/types";
import { agentContextOf } from "@/copilot/context";
import { newWorkingDraft } from "@/engines/allocationDesk";

/**
 * A Copilot request body as the page builds it (D4): the snapshot with its
 * active alternative, and the context computed from that same snapshot.
 */
export function copilotRequest<S extends object>(question: string, snapshot: S) {
  const draft = (snapshot as { workingDraft?: WorkingDraft }).workingDraft ?? newWorkingDraft("2026-10-01T00:00:00.000Z");
  const withDraft = { ...snapshot, workingDraft: draft };
  return { question, snapshot: withDraft, context: agentContextOf(withDraft as never) };
}
