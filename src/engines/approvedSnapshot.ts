import type {
  Account,
  AdvisorProfile,
  ApprovedSnapshot,
  ClientProfile,
  ComplianceCheck,
  Disclosure,
  FxConfirmation,
  FxRate,
  Holding,
  ModelRevision,
  Proposal,
  ProposalSection,
  Recommendation,
  SnapshotInputs,
  SourceDocument,
  StrategyRevision,
  WorkingDraft,
} from "@/domain/types";
import { currentDisclosure } from "@/domain/disclosureLibrary";
import { evaluateWorkspaceReadiness, readinessOk } from "./complianceEngine";
import { forReadiness } from "./importCompleteness";
import { normalizeHoldings } from "./normalizationEngine";
import { recordInputBasis } from "./allocationDesk";
import { findRevision } from "./strategyProposals";
import { projectSnapshotInputs } from "./workspaceBackup";
import { canonicalJson, contentHash, snapshotDraft, snapshotFingerprint, snapshotResults } from "./snapshotRecord";
import type { ProposalPdfTemplateProps, SnapshotPresentation } from "@/pdf/templates/ProposalPdfTemplate";

// D3 — review once, present consistently (R19/R20/R21 minimum). An approved
// version freezes the economic package the shared readiness passed on: the
// records the evaluator and the template read, the approved actions in saved
// order, the exact rates and the library revisions they use. Approving a
// version is a separate act from approving actions or drafting: it changes
// nothing else. The meeting view and every document from a version render
// from its frozen inputs with the shared template, never from the live
// workspace. A local application record, not a tamper-proof book of record.

/** The workspace a version is captured from (the store's data). */
export interface SnapshotSource {
  client: ClientProfile;
  advisor: AdvisorProfile;
  accounts: Account[];
  holdings: Holding[];
  recommendations: Recommendation[];
  proposal: Proposal;
  proposalSections: ProposalSection[];
  /** The disclosure library; the proposal's included and every required one are frozen. */
  disclosures: Disclosure[];
  fxRates: FxRate[];
  fxConfirmation: FxConfirmation | null;
  sourceDocuments: SourceDocument[];
  workingDraft: WorkingDraft;
  alternatives: WorkingDraft[];
  strategies: StrategyRevision[];
  models: ModelRevision[];
  snapshots: ApprovedSnapshot[];
}

/** The live readiness the app gates on (the same call as the PDF Preview and the route). */
export function workspaceReadiness(ws: SnapshotSource, now: Date): ComplianceCheck[] {
  return evaluateWorkspaceReadiness({
    client: ws.client,
    advisor: ws.advisor,
    accounts: ws.accounts,
    holdings: ws.holdings,
    recommendations: ws.recommendations,
    disclosures: ws.disclosures,
    fxRates: ws.fxRates,
    sourceDocuments: ws.sourceDocuments,
    fxConfirmation: ws.fxConfirmation,
    now,
    drafts: [ws.workingDraft, ...ws.alternatives],
  });
}

/** The alternative that owns the approved actions (readiness allows only one), else the active one. */
export function reviewedAlternative(ws: Pick<SnapshotSource, "recommendations" | "workingDraft" | "alternatives">): WorkingDraft {
  const approved = new Set(ws.recommendations.filter((r) => r.approvedByAdvisor).map((r) => r.id));
  return [ws.workingDraft, ...ws.alternatives].find((d) => d.memberIds.some((id) => approved.has(id))) ?? ws.workingDraft;
}

type Captured = Pick<ApprovedSnapshot, "alternative" | "inputs">;

/** What a version made now would hold (no gate, no identity). */
function capture(ws: SnapshotSource, now: Date): Captured {
  const reportingCurrency = ws.client.proposalOutputCurrency;
  const draft = reviewedAlternative(ws);
  const approved = ws.recommendations.filter((r) => r.approvedByAdvisor);
  const included = new Set(ws.proposal.disclosureIds);
  // The model the alternative is pinned to, and every strategy revision it or an approved sleeve names.
  const model = draft.model ? findRevision(ws.models, draft.model.id, draft.model.revision) : undefined;
  const strategyKeys = new Set<string>();
  for (const w of model?.strategyWeights ?? []) strategyKeys.add(`${w.strategyId}@${w.strategyRevision}`);
  for (const r of approved) if (r.destination?.strategy) strategyKeys.add(`${r.destination.strategy.id}@${r.destination.strategy.revision}`);
  const inputs: SnapshotInputs = projectSnapshotInputs({
    client: ws.client,
    advisor: ws.advisor,
    accounts: ws.accounts,
    holdings: ws.holdings,
    recommendations: approved,
    proposal: ws.proposal,
    sections: ws.proposalSections,
    // Frozen with their text as shown today: a later library change doesn't rewrite this version.
    disclosures: ws.disclosures.filter((d) => included.has(d.id) || d.required).map(currentDisclosure),
    fxRates: ws.fxRates,
    fxConfirmation: ws.fxConfirmation,
    sourceDocuments: ws.sourceDocuments.map(forReadiness),
    models: model ? [model] : [],
    strategies: ws.strategies.filter((s) => strategyKeys.has(`${s.id}@${s.revision}`)),
  });
  const inputBasis = recordInputBasis(
    { holdings: normalizeHoldings(ws.holdings, ws.fxRates, reportingCurrency), accounts: ws.accounts, actions: approved, fxRates: ws.fxRates, reportingCurrency },
    now.toISOString()
  );
  return {
    alternative: structuredClone({ id: draft.id, name: draft.name, scopeAccountIds: draft.scopeAccountIds, targets: draft.targets, model: draft.model ?? null, inputBasis }),
    inputs,
  };
}

export type BuildSnapshot = { ok: true; snapshot: ApprovedSnapshot } | { ok: false; failing: string[] };

/**
 * The next approved version, only when the shared readiness passes now.
 * Creates the record only; the caller appends it.
 */
export function buildSnapshot(ws: SnapshotSource, opts: { now: Date; id: string; note?: string }): BuildSnapshot {
  const checks = workspaceReadiness(ws, opts.now);
  if (!readinessOk(checks)) return { ok: false, failing: checks.filter((c) => !c.passed).map((c) => c.label) };
  const { alternative, inputs } = capture(ws, opts.now);
  const note = opts.note?.trim();
  const base = {
    id: opts.id,
    version: Math.max(0, ...ws.snapshots.map((s) => s.version)) + 1,
    approvedAt: opts.now.toISOString(),
    approvedBy: { advisorId: ws.advisor.id, name: ws.advisor.name },
    ...(note ? { note } : {}),
    alternative,
    inputs,
  };
  return { ok: true, snapshot: { ...base, results: snapshotResults(base), fingerprint: snapshotFingerprint(base) } };
}

/** The shared readiness on a version's own inputs, at `now` (the server's clock when issuing). Inputs are never refreshed. */
export function snapshotReadiness(s: ApprovedSnapshot, now: Date): ComplianceCheck[] {
  const i = s.inputs;
  return evaluateWorkspaceReadiness({
    client: i.client,
    advisor: i.advisor,
    accounts: i.accounts,
    holdings: i.holdings,
    recommendations: i.recommendations,
    disclosures: i.disclosures,
    fxRates: i.fxRates,
    sourceDocuments: i.sourceDocuments,
    fxConfirmation: i.fxConfirmation,
    now,
    drafts: [snapshotDraft(s)],
  });
}

const PARTS: { key: keyof SnapshotInputs | "alternative"; label: string }[] = [
  { key: "holdings", label: "holdings" },
  { key: "accounts", label: "accounts or funding" },
  { key: "recommendations", label: "approved actions" },
  { key: "fxRates", label: "exchange rates" },
  { key: "fxConfirmation", label: "exchange-rate confirmation" },
  { key: "strategies", label: "strategy revisions" },
  { key: "models", label: "model revision" },
  { key: "alternative", label: "alternative, scope or targets" },
  { key: "disclosures", label: "disclosures" },
  { key: "sections", label: "sections" },
  { key: "proposal", label: "proposal" },
  { key: "client", label: "client profile" },
  { key: "advisor", label: "advisor or firm" },
  { key: "sourceDocuments", label: "imports" },
];

export type SnapshotStatus = { kind: "matches" } | { kind: "changed"; parts: string[] };

/**
 * Whether the workspace still holds what a version froze. Compared on
 * contents; the input record's own timestamp is ignored. A change never
 * touches the version: the advisor approves a new one.
 */
export function snapshotStatus(s: ApprovedSnapshot, ws: SnapshotSource, now: Date): SnapshotStatus {
  const live = capture(ws, now);
  const comparable = (c: Captured) => ({ inputs: c.inputs, alternative: { ...c.alternative, inputBasis: c.alternative.inputBasis.fingerprint } });
  const a = comparable(s);
  const b = comparable(live);
  if (contentHash(a) === contentHash(b)) return { kind: "matches" };
  const parts = PARTS.filter(({ key }) =>
    key === "alternative" ? canonicalJson(a.alternative) !== canonicalJson(b.alternative) : canonicalJson(a.inputs[key]) !== canonicalJson(b.inputs[key])
  ).map((p) => p.label);
  return { kind: "changed", parts };
}

/** The template's props for a version: its frozen inputs, at its approval time, labelled with how it is presented. */
export function snapshotTemplateProps(
  s: ApprovedSnapshot,
  opts: { variant: "draft" | "final"; presentation: SnapshotPresentation; issuedAt?: string; timeZone?: string }
): ProposalPdfTemplateProps {
  const i = s.inputs;
  return {
    client: i.client,
    advisor: i.advisor,
    accounts: i.accounts,
    holdings: i.holdings,
    recommendations: i.recommendations,
    sections: i.sections,
    disclosures: i.disclosures,
    proposal: i.proposal,
    fxRates: i.fxRates,
    fxConfirmation: i.fxConfirmation,
    strategies: i.strategies,
    models: i.models,
    modelPin: s.alternative.model,
    variant: opts.variant,
    now: s.approvedAt,
    timeZone: opts.timeZone,
    snapshot: {
      id: s.id,
      version: s.version,
      approvedAt: s.approvedAt,
      approvedBy: s.approvedBy,
      note: s.note,
      fingerprint: s.fingerprint,
      alternativeName: s.alternative.name,
      scopeAccountIds: s.alternative.scopeAccountIds,
      inputBasis: s.alternative.inputBasis,
      readiness: snapshotReadiness(s, new Date(s.approvedAt)),
      presentation: opts.presentation,
      issuedAt: opts.issuedAt,
    },
  };
}

/** The name a document from a version is saved under. */
export function snapshotFileName(s: ApprovedSnapshot, variant: "draft" | "final", issuedAt: Date): string {
  const name = (s.inputs.client.householdName ?? s.inputs.client.fullName).replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return `SAMPLE_${name}_${variant === "draft" ? "Draft_" : ""}Wealth_Proposal_v${s.version}_${issuedAt.toISOString().slice(0, 10)}.pdf`;
}
