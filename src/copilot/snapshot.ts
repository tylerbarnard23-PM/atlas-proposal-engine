import { z } from "zod";
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
const record = z.record(z.unknown());
export const CopilotRequestSchema = z.object({
  question: z.string().trim().min(1).max(2000),
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
    workingDraft: record.and(z.object({ id: z.string(), name: z.string(), memberIds: z.array(z.string()), scopeAccountIds: z.array(z.string()).nullable() })),
    alternatives: z.array(record.and(z.object({ name: z.string(), memberIds: z.array(z.string()) }))).max(50).optional(),
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

export type CopilotRequest = { question: string; snapshot: CopilotSnapshot & { workingDraft: WorkingDraft }; context: AgentContext };

export function parseCopilotRequest(body: unknown):
  | { ok: true; value: CopilotRequest }
  | { ok: false; error: string } {
  const parsed = CopilotRequestSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  }
  return { ok: true, value: parsed.data as unknown as CopilotRequest };
}
