import { forReadiness } from "@/engines/importCompleteness";
import { scopeAccountIds, scopeCandidates } from "@/engines/allocationDesk";
import { agentContextOf, type AgentContext } from "./context";
import type { CopilotSnapshot } from "./snapshot";
import type { AtlasState } from "@/store/useStore";
import type { Account, Recommendation, WorkingDraft } from "@/domain/types";

// D5 usability slice: what the Copilot page and the allocation desk's panel
// both send, built in one place so the two entry points ask about the same
// workspace slice and context. Building it sends nothing; a run starts only
// when the advisor asks.

type Workspace = Pick<
  AtlasState,
  "client" | "advisor" | "accounts" | "holdings" | "fxRates" | "recommendations" | "disclosures" | "sourceDocuments" | "fxConfirmation" | "workingDraft" | "alternatives"
>;

export function copilotSnapshot(s: Workspace): CopilotSnapshot & { workingDraft: WorkingDraft } {
  return {
    client: s.client,
    advisor: s.advisor,
    accounts: s.accounts,
    holdings: s.holdings,
    fxRates: s.fxRates,
    recommendations: s.recommendations,
    disclosures: s.disclosures,
    sourceDocuments: s.sourceDocuments.map(forReadiness),
    fxConfirmation: s.fxConfirmation,
    // D2: lets readiness tell approvals that mix alternatives, as the PDF route does. D4: the active alternative is the answer's context.
    workingDraft: s.workingDraft,
    alternatives: s.alternatives,
  };
}

/** The request body for POST /api/copilot: the question, the context it is bound to, and the workspace slice. */
export function copilotRequest(s: Workspace, question: string): { question: string; context: AgentContext; snapshot: CopilotSnapshot & { workingDraft: WorkingDraft } } {
  const snapshot = copilotSnapshot(s);
  return { question, context: agentContextOf(snapshot), snapshot };
}

/**
 * The active alternative's account scope in words, resolved as the desk
 * resolves it (`scopeAccountIds`): no saved scope means every candidate
 * (non-liability) account, the default. The names are listed either way.
 */
export function scopeLabel(accounts: Account[], draft: WorkingDraft): { count: number; total: number; names: string[]; chosen: boolean; text: string; short: string } {
  const total = scopeCandidates(accounts).length;
  const names = scopeAccountIds(accounts, draft).map((id) => accounts.find((a) => a.id === id)!.name);
  const n = names.length;
  const plural = (k: number) => `${k} account${k === 1 ? "" : "s"}`;
  const head = draft.scopeAccountIds == null ? `All ${plural(n)} (default)` : `${n} of ${plural(total)}`;
  const text = n === 0 ? "No accounts selected" : `${head}: ${names.join(", ")}`;
  // At a glance: the first few names, the rest counted (the full list is in `text`).
  const short = n <= SHORT_NAMES ? text : `${head}: ${names.slice(0, SHORT_NAMES).join(", ")} and ${n - SHORT_NAMES} more`;
  return { count: n, total, names, chosen: draft.scopeAccountIds != null, text, short };
}

const SHORT_NAMES = 5;

export const PREVIEW_ONLY = "Preview only — nothing added.";
export const ADDED = "Added to working draft — awaiting approval.";

export type PreviewPhase = "preview" | "stale" | "added";

/**
 * Where a Copilot answer's drafts stand. "added" once any of them is in the
 * workspace (the store adds them unapproved); "stale" when the workspace or the
 * active alternative changed after the answer, so nothing more can be added;
 * otherwise a preview that has added nothing.
 */
export function previewPhase(drafts: Pick<Recommendation, "id">[], existingIds: Set<string>, stale: boolean): { phase: PreviewPhase; added: string[]; pending: string[] } {
  const added = drafts.filter((d) => existingIds.has(d.id)).map((d) => d.id);
  const pending = drafts.filter((d) => !existingIds.has(d.id)).map((d) => d.id);
  return { phase: added.length > 0 ? "added" : stale ? "stale" : "preview", added, pending };
}

/** Where to review actions just added: Recommendations, on the current draft, with them highlighted. */
export const reviewHref = (ids: string[]) => `/recommendations?view=draft&focus=${ids.map(encodeURIComponent).join(",")}`;
