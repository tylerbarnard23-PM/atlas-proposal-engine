import { z } from "zod";
import { LIST_LIMITS, describeIssues } from "../server/requestLimits";
import type { AgentContext } from "./context";
import type {
  Account,
  AdvisorProfile,
  ClientProfile,
  Disclosure,
  FxConfirmation,
  FxRate,
  Holding,
  Recommendation,
  SourceDocument,
  WorkingDraft,
} from "@/domain/types";

// The workspace lives in the advisor's browser (zustand + localStorage), so the
// Copilot API receives the slice of state it needs with each request. The
// server never persists it.
export interface CopilotSnapshot {
  client: ClientProfile;
  advisor: AdvisorProfile;
  accounts: Account[];
  holdings: Holding[];
  fxRates: FxRate[];
  recommendations: Recommendation[];
  disclosures: Disclosure[];
  /** Imports' completeness (see forReadiness); absent from older clients. */
  sourceDocuments?: SourceDocument[];
  /** The advisor's confirmation of stale rates in use (#26); absent from older clients. */
  fxConfirmation?: FxConfirmation | null;
  /** D2: the working draft and the other alternatives, for the one-alternative check; absent from older clients. */
  workingDraft?: WorkingDraft;
  alternatives?: WorkingDraft[];
}

// Structural guard only: the engines are defensive about optional fields, so
// we check shape and size limits here rather than re-declaring every domain type.
const record = z.record(z.string(), z.unknown());
// #86: the nested lists carry the same limits as the collections they refer to
// (a member is a recommendation, a scope entry an account), so a request the
// snapshot already accepts can't be refused by them.
const memberIds = z.array(z.string().max(200)).max(LIST_LIMITS.memberIds);
const scopeIds = z.array(z.string().max(200)).max(LIST_LIMITS.scopeAccountIds);
/**
 * What the advisor chose to run. The server answers only when this is what
 * actually runs, so a script or the test provider never stands in for Claude.
 * Absent means "claude".
 */
export const RUN_AS = ["claude", "scripted_example", "test_provider"] as const;
export type RunAs = (typeof RUN_AS)[number];

export const CopilotRequestSchema = z.object({
  question: z.string().trim().min(1).max(2000),
  runAs: z.enum(RUN_AS).optional(),
  // #119: Prepare allocation proposal (absent: an open question).
  task: z.enum(["allocation_proposal"]).optional(),
  snapshot: z.object({
    client: record,
    advisor: record,
    accounts: z.array(record).max(200),
    holdings: z.array(record.and(z.object({ id: z.string(), assetName: z.string() }))).max(1000),
    fxRates: z.array(record).max(500),
    recommendations: z.array(record).max(200),
    disclosures: z.array(record).max(200),
    sourceDocuments: z.array(record.and(z.object({ id: z.string(), fileName: z.string() }))).max(500).optional(),
    fxConfirmation: record.nullable().optional(),
    // D4: the active alternative the answer is about (its scope, actions and targets).
    workingDraft: record.and(z.object({ id: z.string(), name: z.string(), memberIds, scopeAccountIds: scopeIds.nullable() })),
    alternatives: z.array(record.and(z.object({ name: z.string(), memberIds }))).max(50).optional(),
  }),
  // D4: what the browser says the request is about; the route checks it against the snapshot.
  context: z.object({
    clientId: z.string().max(200),
    alternativeId: z.string().max(200),
    alternativeName: z.string().max(200),
    scopeAccountIds: z.array(z.string().max(200)).max(200).nullable(),
    inputRevision: z.string().max(64),
  }),
});

export type CopilotRequest = { question: string; runAs?: RunAs; task?: "allocation_proposal"; snapshot: CopilotSnapshot & { workingDraft: WorkingDraft }; context: AgentContext };

export function parseCopilotRequest(body: unknown):
  | { ok: true; value: CopilotRequest }
  | { ok: false; error: string } {
  const parsed = CopilotRequestSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, error: describeIssues(parsed.error.issues) };
  }
  return { ok: true, value: parsed.data as unknown as CopilotRequest };
}
