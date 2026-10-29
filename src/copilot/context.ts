import type { Account, ClientProfile, FxConfirmation, FxRate, Holding, Recommendation, SourceDocument, WorkingDraft } from "@/domain/types";
import { contentHash } from "@/engines/snapshotRecord";

// D4: what a Copilot answer is about. The browser sends it with each request
// and the server recomputes it from the workspace it received; accepting a
// draft recomputes it from the live workspace. Any edit to the client profile
// or the inputs the evaluator reads (holdings, rates, actions, the
// alternative's scope, members, targets or model) changes the revision, so a
// stale preview can't be accepted.

export interface AgentContext {
  clientId: string;
  alternativeId: string;
  alternativeName: string;
  /** The alternative's chosen scope; null means every investment account. */
  scopeAccountIds: string[] | null;
  inputRevision: string;
}

/** The workspace fields the revision covers, as the Copilot request carries them (imports already projected with `forReadiness`). */
export interface ContextSource {
  client: ClientProfile;
  accounts: Account[];
  holdings: Holding[];
  recommendations: Recommendation[];
  fxRates: FxRate[];
  fxConfirmation?: FxConfirmation | null;
  sourceDocuments?: SourceDocument[];
  workingDraft: WorkingDraft;
}

/** The input revision: a content hash, so the browser and the server agree on the same contents whatever their key order. */
export function inputRevisionOf(ws: ContextSource): string {
  const d = ws.workingDraft;
  return contentHash({
    // The whole profile: restrictions, risk, liquidity, income and tax needs shape the advice.
    client: ws.client,
    accounts: ws.accounts,
    holdings: ws.holdings,
    recommendations: ws.recommendations,
    fxRates: ws.fxRates,
    fxConfirmation: ws.fxConfirmation ?? null,
    sourceDocuments: ws.sourceDocuments ?? [],
    // The alternative as the evaluator reads it; its derived input record and timestamps are left out.
    draft: { id: d.id, scopeAccountIds: d.scopeAccountIds, memberIds: d.memberIds, targets: d.targets, model: d.model ?? null },
  });
}

export function agentContextOf(ws: ContextSource): AgentContext {
  const d = ws.workingDraft;
  return { clientId: ws.client.id, alternativeId: d.id, alternativeName: d.name, scopeAccountIds: d.scopeAccountIds, inputRevision: inputRevisionOf(ws) };
}

/** Why a context doesn't describe this workspace, or null when it does. */
export function contextMismatch(ref: AgentContext, ws: ContextSource): string | null {
  const now = agentContextOf(ws);
  if (ref.clientId !== now.clientId) return "This answer is about another client.";
  if (ref.alternativeId !== now.alternativeId) return `This answer is about the alternative "${ref.alternativeName}", which is no longer the active one.`;
  if (ref.inputRevision !== now.inputRevision) return "The workspace changed after this answer (client profile, holdings, rates, actions or the alternative's scope or targets). Ask again for a current preview.";
  return null;
}
