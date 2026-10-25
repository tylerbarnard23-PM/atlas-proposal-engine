import { z } from "zod";
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
    workingDraft: record.and(z.object({ name: z.string(), memberIds: z.array(z.string()) })).optional(),
    alternatives: z.array(record.and(z.object({ name: z.string(), memberIds: z.array(z.string()) }))).max(50).optional(),
  }),
});

export type CopilotRequest = { question: string; snapshot: CopilotSnapshot };

export function parseCopilotRequest(body: unknown):
  | { ok: true; value: CopilotRequest }
  | { ok: false; error: string } {
  const parsed = CopilotRequestSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  }
  return { ok: true, value: parsed.data as unknown as CopilotRequest };
}
