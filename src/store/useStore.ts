"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  Account,
  AdvisorProfile,
  ApprovedSnapshot,
  AssetClass,
  ClientProfile,
  CurrencyCode,
  DismissedInsight,
  Disclosure,
  FxConfirmation,
  FxRate,
  FxRefreshRecord,
  Holding,
  Insight,
  MarketDataResult,
  ModelRevision,
  PdfGenerationJob,
  Proposal,
  ProposalSection,
  Recommendation,
  SourceDocument,
  StrategyRevision,
  WorkingDraft,
} from "@/domain/types";
import { SEED_ACCOUNTS } from "@/data/seedAccounts";
import { SEED_ADVISOR, SEED_CLIENT } from "@/data/seedClient";
import { SEED_FX_RATES } from "@/data/seedFxRates";
import { SEED_HOLDINGS } from "@/data/seedHoldings";
import { SEED_RECOMMENDATIONS } from "@/data/seedRecommendations";
import { SEED_MARKET_QUOTES } from "@/data/seedMarketData";
import { DISCLOSURE_LIBRARY } from "@/domain/disclosureLibrary";
import { safeId, todayIso } from "@/utils/formatting";
import { DEFAULT_PROPOSAL_SECTIONS } from "@/engines/proposalEngine";
import { confirmStaleRates } from "@/engines/fxPolicy";
import { fxClock } from "@/engines/fxClock";
import { cashBasisCurrency, markRemovedLinks } from "@/engines/recommendationLinks";
import { contextMismatch, type AgentContext } from "@/copilot/context";
import { forReadiness } from "@/engines/importCompleteness";
import { migrateRecommendationCurrency, withApprovalRule } from "@/engines/recommendationAmounts";
import { candidateProblems, deskActions, draftBasisInputs, legacyWorkingDraft, needsIntentRestatement, newWorkingDraft, recordInputBasis } from "@/engines/allocationDesk";
import { normalizeHoldings } from "@/engines/normalizationEngine";
import { LEGACY_SAMPLE_FIRM_NAME } from "@/domain/branding";
import type { ImportedWorkspace } from "@/ingestion/documents/toWorkspace";
import type { RestoredWorkspace } from "@/engines/workspaceBackup";
import { findRevision, modelProblems, nextRevision, strategyProblems } from "@/engines/strategyProposals";
import { UMA_MODELS, UMA_STRATEGIES } from "@/data/umaStory";
import { buildSnapshot } from "@/engines/approvedSnapshot";

/** The browser storage key every saved workspace lives under; never renamed. */
export const STORAGE_KEY = "atlas-proposal-engine";
export const STORE_VERSION = 10;

export interface AtlasState {
  client: ClientProfile;
  advisor: AdvisorProfile;
  accounts: Account[];
  holdings: Holding[];
  fxRates: FxRate[];
  recommendations: Recommendation[];
  insights: Insight[];
  dismissedInsights: DismissedInsight[];
  sourceDocuments: SourceDocument[];
  marketDataByIdentifier: Record<string, MarketDataResult>;
  proposalSections: ProposalSection[];
  proposal: Proposal;
  disclosures: Disclosure[];
  pdfHistory: PdfGenerationJob[];
  /** Outcome of the last FX refresh attempt (#26). */
  fxRefresh: FxRefreshRecord | null;
  /** The advisor's confirmation of stale rates in use; checked against its fingerprint and expiry (#26). */
  fxConfirmation: FxConfirmation | null;
  /** The one working allocation draft (D1): scope, members, targets and the inputs it was edited against. */
  workingDraft: WorkingDraft;
  /** D2: the other named alternatives (inactive drafts), each with its own actions. */
  alternatives: WorkingDraft[];
  /** D2a: the library of immutable strategy and model revisions (append-only; kept when a new client starts). */
  strategies: StrategyRevision[];
  models: ModelRevision[];
  /** D3: the engagement's approved versions, append-only; a later edit never rewrites one. */
  snapshots: ApprovedSnapshot[];
  hasHydrated: boolean;
}

export interface AtlasActions {
  setClient: (patch: Partial<ClientProfile>) => void;
  setAdvisor: (patch: Partial<AdvisorProfile>) => void;
  upsertAccount: (account: Account) => void;
  removeAccount: (id: string) => void;
  upsertHolding: (holding: Holding) => void;
  removeHolding: (id: string) => void;
  setHoldings: (holdings: Holding[]) => void;
  upsertRecommendation: (rec: Recommendation) => void;
  removeRecommendation: (id: string) => void;
  /** Sets the value-check state of several holdings at once (Confirm all, and its Undo). */
  setHoldingsVerification: (ids: string[], verification: Holding["advisorVerification"]) => void;
  /** Merges fields into one holding (used by the in-place "Data to complete" fixes). */
  patchHolding: (id: string, patch: Partial<Holding>) => void;
  /** Puts a deleted recommendation back at its old position (Undo). */
  restoreRecommendation: (rec: Recommendation, index: number) => void;
  setInsights: (insights: Insight[]) => void;
  dismissInsight: (d: DismissedInsight) => void;
  restoreInsight: (key: string) => void;
  /** Records the advisor's decision not to propose it (status "excluded"). */
  rejectRecommendation: (id: string, reason?: string) => void;
  /** Brings a rejected recommendation back as a draft. */
  reopenRecommendation: (id: string) => void;
  addSourceDocument: (doc: SourceDocument) => void;
  updateSourceDocument: (id: string, patch: Partial<SourceDocument>) => void;
  setMarketData: (identifierKey: string, result: MarketDataResult) => void;
  applyMarketDataResults: (results: { holdingId: string; result: MarketDataResult }[]) => void;
  setFxRates: (rates: FxRate[]) => void;
  /** Stores a merged refresh (engines/fxPolicy mergeFxRefresh): its rates and its outcome. */
  applyFxRefresh: (result: { rates: FxRate[]; record: FxRefreshRecord }) => void;
  setFxConfirmation: (confirmation: FxConfirmation | null) => void;
  /** Confirms the stale or unverified rates in use now, at the shared FX clock's current instant (so it's valid at once). */
  confirmFxRates: () => void;
  toggleSection: (key: string) => void;
  setProposalNotes: (notes: string) => void;
  // Optional disclosures only; required ones always stay in the proposal.
  toggleDisclosure: (id: string) => void;
  // Approves every recommendation not yet approved and includes it in the PDF.
  approveAllRecommendations: () => number;
  recordPdfJob: (job: PdfGenerationJob) => void;
  resetSeed: () => void;
  // Clears the client, accounts, holdings and recommendations but keeps the
  // firm & branding, which are set once and reused for every client.
  startNewClient: () => void;
  // Loads an imported document as a new engagement (keeps firm & branding).
  loadImportedEngagement: (imported: ImportedWorkspace) => void;
  // Adds an imported document's accounts and holdings to the current client.
  addImportedToEngagement: (imported: ImportedWorkspace) => void;
  clearAll: () => void;
  setHasHydrated: (b: boolean) => void;
  /**
   * Replaces the workspace with a validated backup (engines/workspaceBackup),
   * all or nothing: the browser save is checked before anything changes, and
   * if it fails the current workspace stays exactly as it was (R23a).
   */
  restoreWorkspace: (next: RestoredWorkspace) => { ok: true } | { ok: false; error: string };
  // Working draft (D1). None of these changes a holding, an approval or the
  // final-PDF inputs; each records the inputs the draft is now edited against.
  /** The accounts in the allocation scope; null goes back to "not chosen" (every non-liability account). */
  setDraftScope: (accountIds: string[] | null) => void;
  setDraftMember: (recommendationId: string, member: boolean) => void;
  /** A target weight in percent of the scope, or null to clear it. Targets never create trades. */
  setDraftTarget: (assetClass: AssetClass, pct: number | null) => void;
  /** Saves an explicit position edit (or a linked replacement's legs) as unapproved recommendations in the draft. */
  addDraftEdit: (rec: Recommendation | Recommendation[]) => void;
  /**
   * D4: accepts Copilot drafts into the active alternative as unapproved
   * members, only if the answer's context still describes the workspace.
   * Idempotent: a draft already in the workspace is skipped, never replaced.
   */
  acceptAgentDrafts: (drafts: Recommendation[], context: AgentContext) => { ok: true; added: string[]; skipped: string[] } | { ok: false; error: string };
  /** Records the current accepted values and rates as the draft's inputs. */
  recordDraftInputs: () => void;
  // D2. Funding rules live on the account, so every engine path sees them.
  /** Chooses an account's eligible cash line and minimum reserve, or clears them (null). */
  /** A reserve is stated in its cash line's currency (`reserveCurrency` must match it); null removes the rule. */
  setAccountFunding: (accountId: string, funding: { cashHoldingId: string; reserve: number; reserveCurrency: CurrencyCode } | null) => void;
  /** Copies the active draft into a new named alternative with new action IDs and no approvals, and makes it active. */
  duplicateDraft: (name: string) => void;
  /** Makes another alternative the active (editable) draft. */
  setActiveDraft: (id: string) => void;
  renameActiveDraft: (name: string) => void;
  // D2a. The library is append-only: an edit saves the next revision of the same ID.
  /** Saves a strategy (a new ID) or the next revision of `input.id`. Returns why it can't be saved, or [] when saved. */
  saveStrategy: (input: Omit<StrategyRevision, "id" | "revision" | "createdAt"> & { id?: string }) => string[];
  /** Saves a model (a new ID) or the next revision of `input.id`. Returns why it can't be saved, or [] when saved. */
  saveModel: (input: Omit<ModelRevision, "id" | "revision" | "createdAt"> & { id?: string }) => string[];
  /** Adds the synthetic example strategies and models that aren't already in the library. */
  addSyntheticLibrary: () => void;
  /**
   * Pins the active alternative to a model revision (null unpins). An
   * asset-class model sets the draft's targets; neither kind creates actions
   * or approvals. A newer revision is never followed automatically.
   */
  pinModel: (model: { id: string; revision: number } | null) => void;
  /** Records the advisor's review of a sleeve whose minimum wasn't supplied. A review, not verified eligibility. */
  recordSleeveReview: (recommendationId: string, note: string) => void;
  /**
   * D3: approves the next version of the economic package, only when the
   * shared readiness passes now. Appends it and changes nothing else: action
   * approvals, drafts and holdings stay as they are.
   */
  approveVersion: (note?: string) => { ok: true; snapshot: ApprovedSnapshot } | { ok: false; failing: string[] };
}

function initialProposal(): Proposal {
  const now = new Date().toISOString();
  return {
    id: "prop_blackwell_2026q2",
    clientId: SEED_CLIENT.id,
    advisorId: SEED_ADVISOR.id,
    title: "Blackwell Family Office — 2026 Wealth Proposal",
    createdAt: now,
    updatedAt: now,
    approvalStatus: "draft",
    sections: DEFAULT_PROPOSAL_SECTIONS,
    recommendationIds: [],
    assumptionIds: [],
    disclosureIds: DISCLOSURE_LIBRARY.filter((d) => d.required).map((d) => d.id),
  };
}

const seedState = (): AtlasState => ({
  client: SEED_CLIENT,
  advisor: SEED_ADVISOR,
  accounts: SEED_ACCOUNTS,
  holdings: SEED_HOLDINGS,
  fxRates: SEED_FX_RATES,
  recommendations: SEED_RECOMMENDATIONS,
  insights: [],
  dismissedInsights: [],
  sourceDocuments: [],
  marketDataByIdentifier: Object.fromEntries(SEED_MARKET_QUOTES.map((q) => [`${q.identifier.type}:${q.identifier.value}`, q])),
  proposalSections: DEFAULT_PROPOSAL_SECTIONS,
  proposal: initialProposal(),
  disclosures: DISCLOSURE_LIBRARY,
  pdfHistory: [],
  fxRefresh: null,
  fxConfirmation: null,
  workingDraft: newWorkingDraft(new Date().toISOString()),
  alternatives: [],
  strategies: [],
  models: [],
  snapshots: [],
  hasHydrated: false,
});

const blankState = (): AtlasState => {
  const now = new Date().toISOString();
  const clientId = `cli_${Math.random().toString(36).slice(2, 10)}`;
  const advisorId = `adv_${Math.random().toString(36).slice(2, 10)}`;
  return {
    client: {
      id: clientId,
      fullName: "",
      countryOfResidence: "US",
      taxResidency: "US",
      reportingCountry: "US",
      baseCurrency: "USD",
      proposalOutputCurrency: "USD",
      locale: "en-US",
      riskTolerance: "moderate",
      investmentObjective: "",
      timeHorizonYears: 10,
      liquidityNeeds: "moderate",
      incomeNeeds: "modest",
      taxSensitivity: "moderate",
    },
    advisor: { id: advisorId, name: "", email: "", firmName: "" },
    accounts: [],
    holdings: [],
    fxRates: SEED_FX_RATES, // reference rates remain useful on a blank slate
    recommendations: [],
    insights: [],
    dismissedInsights: [],
    sourceDocuments: [],
    marketDataByIdentifier: {},
    proposalSections: DEFAULT_PROPOSAL_SECTIONS,
    proposal: {
      id: `prop_${Math.random().toString(36).slice(2, 10)}`,
      clientId,
      advisorId,
      title: "Wealth Proposal",
      createdAt: now,
      updatedAt: now,
      approvalStatus: "draft",
      sections: DEFAULT_PROPOSAL_SECTIONS,
      recommendationIds: [],
      assumptionIds: [],
      disclosureIds: DISCLOSURE_LIBRARY.filter((d) => d.required).map((d) => d.id),
    },
    disclosures: DISCLOSURE_LIBRARY,
    pdfHistory: [],
    fxRefresh: null,
    fxConfirmation: null,
    workingDraft: newWorkingDraft(now),
    alternatives: [],
    strategies: [],
    models: [],
    snapshots: [],
    hasHydrated: true,
  };
};

// Upgrades a workspace saved by an earlier version of the app. Exported so
// each step can be unit-tested.
export function migrateAtlasState(persisted: unknown, version: number): AtlasState {
  const state = persisted as AtlasState;
  if (version < 2 && state?.advisor?.name === "Margaret S. Whitfield, CFA, CFP®") {
    state.advisor = { ...state.advisor, name: SEED_ADVISOR.name };
  }
  if (version < 2 && Array.isArray(state?.pdfHistory)) {
    state.pdfHistory = state.pdfHistory.filter((j) => j.status !== "running");
  }
  // v3: new disclosures (fees, conflicts, not-an-offer, client-provided
  // information, held-away assets) and a strengthened data-source text.
  // The library has no in-app editor, so refresh it from the source and
  // add any newly required disclosure to the proposal.
  if (version < 3 && state) {
    state.disclosures = DISCLOSURE_LIBRARY;
    if (state.proposal) {
      const ids = new Set(state.proposal.disclosureIds ?? []);
      for (const d of DISCLOSURE_LIBRARY) if (d.required) ids.add(d.id);
      state.proposal = { ...state.proposal, disclosureIds: [...ids] };
    }
  }
  // v4: white-label branding. The sample firm is renamed so it no longer
  // shares the product's name, and the old remote-logo URL field is dropped
  // (the PDF server would have fetched it); logos are now uploaded images.
  if (version < 4 && state?.advisor) {
    const { firmLogoUrl: _dropped, ...advisor } = state.advisor as AdvisorProfile & { firmLogoUrl?: string };
    void _dropped;
    state.advisor =
      advisor.firmName === LEGACY_SAMPLE_FIRM_NAME
        ? { ...advisor, firmName: SEED_ADVISOR.firmName, email: SEED_ADVISOR.email }
        : advisor;
  }
  // v5 (#24): recommendation amounts are denominated in their own currency.
  // Until now the engine calculated them in the reporting currency whatever
  // their label said, so each takes that currency (every effect stays the
  // same); a differing old label is kept for the advisor to review. The
  // proposal's own output currency and country are dropped: the client
  // settings are the only source.
  if (version < 5 && state) {
    const calculatedIn = state.client?.proposalOutputCurrency || "USD";
    const now = new Date().toISOString();
    if (Array.isArray(state.recommendations)) {
      state.recommendations = state.recommendations.map((r) => migrateRecommendationCurrency(r, calculatedIn, now));
    }
    if (state.proposal) {
      const { outputCurrency: _c, outputCountry: _k, ...proposal } = state.proposal as Proposal & { outputCurrency?: string; outputCountry?: string };
      void _c;
      void _k;
      state.proposal = proposal;
    }
  }
  // v6 (#26): rate age is computed from each rate's date, so the stored
  // isStale flag (never set by the app) is dropped. Every rate, date and
  // source is kept; nothing else changes.
  if (version < 6 && state && Array.isArray(state.fxRates)) {
    state.fxRates = state.fxRates.map((r) => {
      const { isStale: _drop, ...rate } = r as FxRate & { isStale?: boolean };
      void _drop;
      return rate;
    });
  }
  // v7 (D1): one working draft. An existing workspace's draft holds its
  // approved recommendations, in saved order, so its preview equals the
  // proposal it already had; nothing about the recommendations changes.
  // Idempotent: a draft that's already there is kept.
  if (version < 7 && state && !state.workingDraft) {
    state.workingDraft = legacyWorkingDraft(Array.isArray(state.recommendations) ? state.recommendations : [], new Date().toISOString());
  }
  // v8 (D2): named alternatives (none yet), funding rules on accounts (none
  // yet). Nothing existing changes. Idempotent.
  if (version < 8 && state && !Array.isArray(state.alternatives)) {
    state.alternatives = [];
  }
  // v9 (D2a): an empty strategy/model library; no alternative is pinned to a
  // model (an absent pin reads as none). Nothing existing changes. Idempotent.
  if (version < 9 && state) {
    if (!Array.isArray(state.strategies)) state.strategies = [];
    if (!Array.isArray(state.models)) state.models = [];
  }
  // v10 (D3): no approved versions yet; earlier documents name none.
  // Nothing existing changes. Idempotent.
  if (version < 10 && state && !Array.isArray(state.snapshots)) {
    state.snapshots = [];
  }
  return state;
}

// The draft after a change, with the inputs it is now edited against.
function draftChange(s: AtlasState, patch: Partial<WorkingDraft>): { workingDraft: WorkingDraft } {
  const now = new Date().toISOString();
  const draft = { ...s.workingDraft, ...patch };
  const inputs = draftBasisInputs({ holdings: s.holdings, accounts: s.accounts, recommendations: s.recommendations, fxRates: s.fxRates, reportingCurrency: s.client.proposalOutputCurrency, draft });
  return { workingDraft: { ...draft, inputBasis: recordInputBasis(inputs, now), updatedAt: now } };
}

// A recommendation saved without an amount keeps its legacy effect, but a new
// approval needs an explicit size first (R07): the approval isn't recorded.
function guardApproval(prev: Recommendation | undefined, next: Recommendation): Recommendation {
  const approving = next.approvedByAdvisor && !prev?.approvedByAdvisor;
  if (!approving || !needsIntentRestatement(next)) return next;
  return { ...next, approvedByAdvisor: false, status: prev?.status ?? "draft", includeInPdf: prev?.includeInPdf ?? false };
}

export const useAtlasStore = create<AtlasState & AtlasActions>()(
  persist(
    (set, get) => ({
      ...seedState(),
      setClient: (patch) => set((s) => ({ client: { ...s.client, ...patch } })),
      setAdvisor: (patch) => set((s) => ({ advisor: { ...s.advisor, ...patch } })),
      upsertAccount: (account) =>
        set((s) => ({
          accounts: s.accounts.some((a) => a.id === account.id)
            ? s.accounts.map((a) => (a.id === account.id ? { ...a, ...account } : a))
            : [...s.accounts, account],
        })),
      // Recommendations linked to what's removed are kept for review, not
      // deleted or redirected (engines/recommendationLinks).
      removeAccount: (id) =>
        set((s) => ({
          accounts: s.accounts.filter((a) => a.id !== id),
          holdings: s.holdings.filter((h) => h.accountId !== id),
          recommendations: markRemovedLinks(
            s.recommendations,
            { holdingIds: new Set(s.holdings.filter((h) => h.accountId === id).map((h) => h.id)), accountIds: new Set([id]) },
            todayIso()
          ),
        })),
      upsertHolding: (h) =>
        set((s) => ({
          holdings: s.holdings.some((x) => x.id === h.id)
            ? s.holdings.map((x) => (x.id === h.id ? { ...x, ...h } : x))
            : [...s.holdings, h],
        })),
      removeHolding: (id) =>
        set((s) => ({
          holdings: s.holdings.filter((h) => h.id !== id),
          recommendations: markRemovedLinks(s.recommendations, { holdingIds: new Set([id]), accountIds: new Set() }, todayIso()),
        })),
      setHoldings: (holdings) => set({ holdings }),
      // Every save goes through the edit rules: a material change to an
      // approved recommendation clears its approval (see withApprovalRule).
      upsertRecommendation: (rec) =>
        set((s) => ({
          recommendations: s.recommendations.some((r) => r.id === rec.id)
            ? s.recommendations.map((r) => (r.id === rec.id ? withApprovalRule(r, guardApproval(r, { ...r, ...rec })) : r))
            : [...s.recommendations, guardApproval(undefined, rec)],
        })),
      removeRecommendation: (id) =>
        set((s) => ({ recommendations: s.recommendations.filter((r) => r.id !== id) })),
      patchHolding: (id, patch) =>
        set((s) => ({
          holdings: s.holdings.map((h) => (h.id === id ? { ...h, ...patch, updatedAt: todayIso() } : h)),
        })),
      setHoldingsVerification: (ids, verification) =>
        set((s) => {
          const target = new Set(ids);
          const now = todayIso();
          return {
            holdings: s.holdings.map((h) => (target.has(h.id) ? { ...h, advisorVerification: verification, updatedAt: now } : h)),
          };
        }),
      restoreRecommendation: (rec, index) =>
        set((s) => {
          if (s.recommendations.some((r) => r.id === rec.id)) return {};
          const next = [...s.recommendations];
          next.splice(Math.max(0, Math.min(index, next.length)), 0, rec);
          return { recommendations: next };
        }),
      setInsights: (insights) => set({ insights }),
      dismissInsight: (d) =>
        set((s) => ({ dismissedInsights: [d, ...s.dismissedInsights.filter((x) => x.key !== d.key)] })),
      restoreInsight: (key) => set((s) => ({ dismissedInsights: s.dismissedInsights.filter((x) => x.key !== key) })),
      // A rejected recommendation also leaves the working draft (reopening it
      // doesn't put it back: joining the draft is an explicit choice).
      rejectRecommendation: (id, reason) =>
        set((s) => ({
          ...(s.workingDraft.memberIds.includes(id) ? draftChange(s, { memberIds: s.workingDraft.memberIds.filter((x) => x !== id) }) : {}),
          alternatives: s.alternatives.map((d) => (d.memberIds.includes(id) ? { ...d, memberIds: d.memberIds.filter((x) => x !== id) } : d)),
          recommendations: s.recommendations.map((r) =>
            r.id === id
              ? {
                  ...r,
                  status: "excluded",
                  approvedByAdvisor: false,
                  includeInPdf: false,
                  rejectionReason: reason?.trim() || undefined,
                  rejectedAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                }
              : r
          ),
        })),
      reopenRecommendation: (id) =>
        set((s) => ({
          recommendations: s.recommendations.map((r) =>
            r.id === id
              ? { ...r, status: "draft", rejectionReason: undefined, rejectedAt: undefined, updatedAt: new Date().toISOString() }
              : r
          ),
        })),
      addSourceDocument: (doc) => set((s) => ({ sourceDocuments: [doc, ...s.sourceDocuments] })),
      updateSourceDocument: (id, patch) =>
        set((s) => ({
          sourceDocuments: s.sourceDocuments.map((d) => (d.id === id ? { ...d, ...patch } : d)),
        })),
      setMarketData: (key, result) =>
        set((s) => ({ marketDataByIdentifier: { ...s.marketDataByIdentifier, [key]: result } })),
      applyMarketDataResults: (results) =>
        set((s) => {
          const md = { ...s.marketDataByIdentifier };
          for (const { result } of results) {
            md[`${result.identifier.type}:${result.identifier.value}`] = result;
          }
          return { marketDataByIdentifier: md };
        }),
      setFxRates: (rates) => set({ fxRates: rates }),
      applyFxRefresh: ({ rates, record }) => set({ fxRates: rates, fxRefresh: record }),
      setFxConfirmation: (confirmation) => set({ fxConfirmation: confirmation }),
      confirmFxRates: () => {
        const s = get();
        // fxClock.now() catches the on-screen time up first: a confirmation
        // timed after a stale snapshot would read as future-dated (invalid).
        const now = new Date(fxClock.now());
        set({ fxConfirmation: confirmStaleRates({ holdings: s.holdings, accounts: s.accounts, recommendations: s.recommendations, fxRates: s.fxRates, reportingCurrency: s.client.proposalOutputCurrency, now }) });
      },
      toggleSection: (key) =>
        set((s) => ({
          proposalSections: s.proposalSections.map((p) =>
            p.key === key ? { ...p, enabled: !p.enabled } : p
          ),
          proposal: {
            ...s.proposal,
            sections: s.proposal.sections.map((p) => (p.key === key ? { ...p, enabled: !p.enabled } : p)),
          },
        })),
      setProposalNotes: (notes) => set((s) => ({ proposal: { ...s.proposal, notes } })),
      toggleDisclosure: (id) =>
        set((s) => {
          const d = s.disclosures.find((x) => x.id === id);
          if (!d || d.required) return {};
          const ids = s.proposal.disclosureIds;
          return {
            proposal: {
              ...s.proposal,
              disclosureIds: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
            },
          };
        }),
      approveAllRecommendations: () => {
        // Rejected recommendations are a decision already made: not "pending".
        // One saved without an amount needs an explicit size first (R07).
        const skip = (r: Recommendation) => r.approvedByAdvisor || r.status === "excluded" || needsIntentRestatement(r);
        const pending = get().recommendations.filter((r) => !skip(r));
        const now = new Date().toISOString();
        set((s) => ({
          recommendations: s.recommendations.map((r) =>
            skip(r)
              ? r
              : { ...r, approvedByAdvisor: true, status: "approved", includeInPdf: true, updatedAt: now }
          ),
        }));
        return pending.length;
      },
      // Upsert by id: a job is recorded as "running" and later updated to its
      // final status, which must replace the running entry, not add another.
      recordPdfJob: (job) =>
        set((s) => ({
          pdfHistory: s.pdfHistory.some((j) => j.id === job.id)
            ? s.pdfHistory.map((j) => (j.id === job.id ? job : j))
            : [job, ...s.pdfHistory].slice(0, 25),
        })),
      resetSeed: () => set({ ...seedState(), hasHydrated: true }),
      startNewClient: () =>
        set((s) => {
          const fresh = blankState();
          // The strategy/model library is the advisor's reference data, kept like the firm.
          return { ...fresh, advisor: s.advisor, strategies: s.strategies, models: s.models, proposal: { ...fresh.proposal, advisorId: s.advisor.id } };
        }),
      loadImportedEngagement: (imported) =>
        set((s) => {
          const fresh = blankState();
          const name = imported.clientName?.trim() || "Imported client";
          return {
            ...fresh,
            advisor: s.advisor,
            strategies: s.strategies,
            models: s.models,
            client: { ...fresh.client, fullName: name, householdName: name },
            accounts: imported.accounts,
            holdings: imported.holdings,
            sourceDocuments: [imported.sourceDocument],
            proposal: { ...fresh.proposal, advisorId: s.advisor.id, title: `${name} — Wealth Proposal` },
          };
        }),
      addImportedToEngagement: (imported) =>
        set((s) => ({
          accounts: [...s.accounts, ...imported.accounts],
          holdings: [...s.holdings, ...imported.holdings],
          sourceDocuments: [imported.sourceDocument, ...s.sourceDocuments],
        })),
      clearAll: () => set(blankState()),
      setHasHydrated: (b) => set({ hasHydrated: b }),
      setDraftScope: (accountIds) => set((s) => draftChange(s, { scopeAccountIds: accountIds == null ? null : [...new Set(accountIds)] })),
      // A linked replacement joins or leaves as a whole. An action that
      // belongs to another alternative can't join this one (each
      // alternative's actions are its own).
      setDraftMember: (id, member) =>
        set((s) => {
          const rec = s.recommendations.find((r) => r.id === id);
          if (member && (!rec || rec.status === "excluded")) return {};
          const ids = rec?.linked ? s.recommendations.filter((r) => r.linked?.groupId === rec.linked!.groupId).map((r) => r.id) : [id];
          if (member && s.alternatives.some((d) => ids.some((x) => d.memberIds.includes(x)))) return {};
          const others = s.workingDraft.memberIds.filter((x) => !ids.includes(x));
          return draftChange(s, { memberIds: member ? [...others, ...ids] : others });
        }),
      setDraftTarget: (assetClass, pct) =>
        set((s) => {
          const targets = { ...s.workingDraft.targets };
          if (pct == null) delete targets[assetClass];
          else if (Number.isFinite(pct) && pct >= 0 && pct <= 100) targets[assetClass] = pct;
          else return {};
          return draftChange(s, { targets });
        }),
      addDraftEdit: (input) =>
        set((s) => {
          const recs = Array.isArray(input) ? input : [input];
          const ids = new Set(recs.map((r) => r.id));
          const next = { ...s, recommendations: [...s.recommendations.filter((r) => !ids.has(r.id)), ...recs.map((r) => guardApproval(undefined, r))] };
          return { recommendations: next.recommendations, ...draftChange(next, { memberIds: [...s.workingDraft.memberIds.filter((x) => !ids.has(x)), ...ids] }) };
        }),
      acceptAgentDrafts: (drafts, context) => {
        const s = get();
        const existing = new Set(s.recommendations.map((r) => r.id));
        const skipped = drafts.filter((d) => existing.has(d.id)).map((d) => d.id);
        const fresh = drafts.filter((d) => !existing.has(d.id));
        // A repeated accept (a retry or a second click) finds everything already there.
        if (fresh.length === 0) return { ok: true, added: [], skipped };
        const mismatch = contextMismatch(context, { ...s, sourceDocuments: s.sourceDocuments.map(forReadiness) });
        if (mismatch) return { ok: false, error: mismatch };
        // The selection together, as it would join the alternative: each draft was
        // simulated on its own run's path, not necessarily alongside the others chosen.
        const ccy = s.client.proposalOutputCurrency;
        const problems = candidateProblems({
          holdings: normalizeHoldings(s.holdings, s.fxRates, ccy),
          accounts: s.accounts,
          recommendations: s.recommendations,
          draft: s.workingDraft,
          candidates: fresh,
          fx: { reportingCurrency: ccy, rates: s.fxRates },
        });
        if (problems.length > 0) return { ok: false, error: `Not accepted: ${problems.join(" ")}` };
        // Whatever the draft says, it joins unapproved and out of the PDF.
        get().addDraftEdit(fresh.map((d) => ({ ...d, status: "needs_review" as const, approvedByAdvisor: false, includeInPdf: false })));
        return { ok: true, added: fresh.map((d) => d.id), skipped };
      },
      setAccountFunding: (accountId, funding) =>
        set((s) => {
          const account = s.accounts.find((a) => a.id === accountId);
          if (!account || account.isLiabilityAccount) return {};
          if (funding) {
            const h = s.holdings.find((x) => x.id === funding.cashHoldingId);
            if (!h || h.accountId !== accountId || h.assetClass !== "cash" || h.isLiability) return {};
            if (!Number.isFinite(funding.reserve) || funding.reserve < 0) return {};
            // The reserve is stated in its cash line's currency; another currency is never relabelled.
            if (funding.reserveCurrency !== cashBasisCurrency(h)) return {};
          }
          const { funding: _old, ...rest } = account;
          void _old;
          const updated = funding
            ? { ...rest, funding: { cashHoldingId: funding.cashHoldingId, reserve: funding.reserve, reserveCurrency: funding.reserveCurrency }, updatedAt: todayIso() }
            : { ...rest, updatedAt: todayIso() };
          return { accounts: s.accounts.map((a) => (a.id === accountId ? updated : a)) };
        }),
      duplicateDraft: (name) =>
        set((s) => {
          const now = new Date().toISOString();
          const source = deskActions(s.recommendations, s.workingDraft, "draft");
          // New action and group IDs; the proposed investment keeps its identity.
          const groupIds = new Map<string, string>();
          const copies = source.map((r) => {
            const linked = r.linked ? { ...r.linked, groupId: groupIds.get(r.linked.groupId) ?? (groupIds.set(r.linked.groupId, safeId("grp")), groupIds.get(r.linked.groupId)!) } : undefined;
            // D2a: a sleeve's recorded minimum review is this alternative's decision, like approval; the copy starts without it.
            const strategy = r.destination?.strategy;
            const destination = strategy?.review ? { ...r.destination!, strategy: { id: strategy.id, revision: strategy.revision, manager: strategy.manager, name: strategy.name, minimum: strategy.minimum } } : r.destination;
            const copy: Recommendation = { ...r, id: safeId("rec"), status: "draft", approvedByAdvisor: false, includeInPdf: false, rejectionReason: undefined, rejectedAt: undefined, createdAt: now, updatedAt: now, ...(linked ? { linked } : {}), ...(destination ? { destination } : {}) };
            return copy;
          });
          const copy: WorkingDraft = { ...s.workingDraft, id: safeId("draft"), name: name.trim() || `Alternative ${s.alternatives.length + 2}`, memberIds: copies.map((r) => r.id), createdAt: now, updatedAt: now };
          const next = { ...s, recommendations: [...s.recommendations, ...copies], workingDraft: copy };
          return { recommendations: next.recommendations, alternatives: [...s.alternatives, s.workingDraft], ...draftChange(next, {}) };
        }),
      setActiveDraft: (id) =>
        set((s) => {
          const target = s.alternatives.find((d) => d.id === id);
          if (!target) return {};
          return { workingDraft: target, alternatives: [...s.alternatives.filter((d) => d.id !== id), s.workingDraft] };
        }),
      renameActiveDraft: (name) => set((s) => (name.trim() ? { workingDraft: { ...s.workingDraft, name: name.trim(), updatedAt: new Date().toISOString() } } : {})),
      saveStrategy: (input) => {
        const s = get();
        if (input.id && !s.strategies.some((x) => x.id === input.id)) return [`Strategy ${input.id} isn't in the library.`];
        const id = input.id ?? safeId("str");
        const rev: StrategyRevision = { ...input, id, revision: nextRevision(s.strategies, id), createdAt: new Date().toISOString() };
        const problems = strategyProblems(rev);
        if (problems.length === 0) set({ strategies: [...s.strategies, rev] });
        return problems;
      },
      saveModel: (input) => {
        const s = get();
        if (input.id && !s.models.some((x) => x.id === input.id)) return [`Model ${input.id} isn't in the library.`];
        const id = input.id ?? safeId("mdl");
        const rev: ModelRevision = { ...input, id, revision: nextRevision(s.models, id), createdAt: new Date().toISOString() };
        const problems = modelProblems(rev, s.strategies);
        if (problems.length === 0) set({ models: [...s.models, rev] });
        return problems;
      },
      addSyntheticLibrary: () =>
        set((s) => ({
          strategies: [...s.strategies, ...UMA_STRATEGIES.filter((x) => !findRevision(s.strategies, x.id, x.revision))],
          models: [...s.models, ...UMA_MODELS.filter((x) => !findRevision(s.models, x.id, x.revision))],
        })),
      pinModel: (model) =>
        set((s) => {
          if (!model) return draftChange(s, { model: null });
          const m = findRevision(s.models, model.id, model.revision);
          if (!m) return {};
          return draftChange(s, { model: { id: m.id, revision: m.revision }, ...(m.kind === "asset_class" ? { targets: { ...m.assetWeights } } : {}) });
        }),
      recordSleeveReview: (recommendationId, note) =>
        set((s) => {
          const text = note.trim();
          if (!text) return {};
          const now = new Date().toISOString();
          return {
            recommendations: s.recommendations.map((r) =>
              r.id === recommendationId && r.destination?.strategy && !r.relatedHoldingId
                ? { ...r, destination: { ...r.destination, strategy: { ...r.destination.strategy, review: { note: text, recordedAt: now } } }, updatedAt: now }
                : r
            ),
          };
        }),
      recordDraftInputs: () => set((s) => draftChange(s, {})),
      approveVersion: (note) => {
        const s = get();
        // The on-screen clock, caught up: the gate and the record share one instant.
        const result = buildSnapshot(s, { now: new Date(fxClock.now()), id: safeId("ver"), note });
        if (result.ok) set({ snapshots: [...s.snapshots, result.snapshot] });
        return result;
      },
      restoreWorkspace: (next) => {
        const storage = typeof window !== "undefined" ? window.localStorage : undefined;
        const before = get();
        const savedBefore = storage?.getItem(STORAGE_KEY) ?? null;
        const after = { ...before, ...next, hasHydrated: true };
        // Check the save first, with exactly what persist will write: if the
        // browser refuses it (e.g. storage full), nothing has changed yet.
        try {
          storage?.setItem(STORAGE_KEY, JSON.stringify({ state: after, version: STORE_VERSION }));
        } catch (err) {
          return { ok: false, error: `The browser couldn't save the restored workspace (${(err as Error).message}). Nothing was changed.` };
        }
        try {
          set({ ...next, hasHydrated: true });
          return { ok: true };
        } catch (err) {
          // Undo both: the in-memory workspace and the saved copy.
          try {
            set(before);
          } catch {
            // the saved copy is put back below
          }
          try {
            if (savedBefore === null) storage?.removeItem(STORAGE_KEY);
            else storage?.setItem(STORAGE_KEY, savedBefore);
          } catch {
            // nothing more can be done; the in-memory workspace is intact
          }
          return { ok: false, error: `The browser couldn't save the restored workspace (${(err as Error).message}). Nothing was changed.` };
        }
      },
    }),
    {
      name: STORAGE_KEY,
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
      version: STORE_VERSION,
      // v2: the seeded fictional advisor no longer carries real credential
      // marks (CFA, CFP®); strip them from workspaces saved before the change,
      // and drop "running" PDF jobs orphaned by the old append-only history.
      migrate: (persisted, version) => migrateAtlasState(persisted, version),
    }
  )
);

// Server-safe snapshot used by API routes that don't have access to localStorage.
export function serverSnapshot(): AtlasState {
  return seedState();
}
