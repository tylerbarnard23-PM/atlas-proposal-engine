"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  Account,
  AdvisorProfile,
  ClientProfile,
  Disclosure,
  FxRate,
  Holding,
  Insight,
  MarketDataResult,
  PdfGenerationJob,
  Proposal,
  ProposalSection,
  Recommendation,
  SourceDocument,
} from "@/domain/types";
import { SEED_ACCOUNTS } from "@/data/seedAccounts";
import { SEED_ADVISOR, SEED_CLIENT } from "@/data/seedClient";
import { SEED_FX_RATES } from "@/data/seedFxRates";
import { SEED_HOLDINGS } from "@/data/seedHoldings";
import { SEED_RECOMMENDATIONS } from "@/data/seedRecommendations";
import { SEED_MARKET_QUOTES } from "@/data/seedMarketData";
import { DISCLOSURE_LIBRARY } from "@/domain/disclosureLibrary";
import { DEFAULT_PROPOSAL_SECTIONS } from "@/engines/proposalEngine";

export interface AtlasState {
  client: ClientProfile;
  advisor: AdvisorProfile;
  accounts: Account[];
  holdings: Holding[];
  fxRates: FxRate[];
  recommendations: Recommendation[];
  insights: Insight[];
  sourceDocuments: SourceDocument[];
  marketDataByIdentifier: Record<string, MarketDataResult>;
  proposalSections: ProposalSection[];
  proposal: Proposal;
  disclosures: Disclosure[];
  pdfHistory: PdfGenerationJob[];
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
  setInsights: (insights: Insight[]) => void;
  addSourceDocument: (doc: SourceDocument) => void;
  updateSourceDocument: (id: string, patch: Partial<SourceDocument>) => void;
  setMarketData: (identifierKey: string, result: MarketDataResult) => void;
  applyMarketDataResults: (results: { holdingId: string; result: MarketDataResult }[]) => void;
  setFxRates: (rates: FxRate[]) => void;
  toggleSection: (key: string) => void;
  setProposalNotes: (notes: string) => void;
  // Optional disclosures only; required ones always stay in the proposal.
  toggleDisclosure: (id: string) => void;
  // Approves every recommendation not yet approved and includes it in the PDF.
  approveAllRecommendations: () => number;
  recordPdfJob: (job: PdfGenerationJob) => void;
  resetSeed: () => void;
  clearAll: () => void;
  setHasHydrated: (b: boolean) => void;
}

function initialProposal(): Proposal {
  const now = new Date().toISOString();
  return {
    id: "prop_blackwell_2026q2",
    clientId: SEED_CLIENT.id,
    advisorId: SEED_ADVISOR.id,
    title: "Blackwell Family Office — 2026 Wealth Proposal",
    outputCurrency: SEED_CLIENT.proposalOutputCurrency,
    outputCountry: SEED_CLIENT.reportingCountry,
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
  sourceDocuments: [],
  marketDataByIdentifier: Object.fromEntries(SEED_MARKET_QUOTES.map((q) => [`${q.identifier.type}:${q.identifier.value}`, q])),
  proposalSections: DEFAULT_PROPOSAL_SECTIONS,
  proposal: initialProposal(),
  disclosures: DISCLOSURE_LIBRARY,
  pdfHistory: [],
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
    sourceDocuments: [],
    marketDataByIdentifier: {},
    proposalSections: DEFAULT_PROPOSAL_SECTIONS,
    proposal: {
      id: `prop_${Math.random().toString(36).slice(2, 10)}`,
      clientId,
      advisorId,
      title: "Wealth Proposal",
      outputCurrency: "USD",
      outputCountry: "US",
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
    hasHydrated: true,
  };
};

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
      removeAccount: (id) =>
        set((s) => ({
          accounts: s.accounts.filter((a) => a.id !== id),
          holdings: s.holdings.filter((h) => h.accountId !== id),
        })),
      upsertHolding: (h) =>
        set((s) => ({
          holdings: s.holdings.some((x) => x.id === h.id)
            ? s.holdings.map((x) => (x.id === h.id ? { ...x, ...h } : x))
            : [...s.holdings, h],
        })),
      removeHolding: (id) => set((s) => ({ holdings: s.holdings.filter((h) => h.id !== id) })),
      setHoldings: (holdings) => set({ holdings }),
      upsertRecommendation: (rec) =>
        set((s) => ({
          recommendations: s.recommendations.some((r) => r.id === rec.id)
            ? s.recommendations.map((r) => (r.id === rec.id ? { ...r, ...rec } : r))
            : [...s.recommendations, rec],
        })),
      removeRecommendation: (id) =>
        set((s) => ({ recommendations: s.recommendations.filter((r) => r.id !== id) })),
      setInsights: (insights) => set({ insights }),
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
        const pending = get().recommendations.filter((r) => !r.approvedByAdvisor);
        const now = new Date().toISOString();
        set((s) => ({
          recommendations: s.recommendations.map((r) =>
            r.approvedByAdvisor
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
      clearAll: () => set(blankState()),
      setHasHydrated: (b) => set({ hasHydrated: b }),
    }),
    {
      name: "atlas-proposal-engine",
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
      version: 3,
      // v2: the seeded fictional advisor no longer carries real credential
      // marks (CFA, CFP®); strip them from workspaces saved before the change,
      // and drop "running" PDF jobs orphaned by the old append-only history.
      migrate: (persisted, version) => {
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
        return state;
      },
    }
  )
);

// Server-safe snapshot used by API routes that don't have access to localStorage.
export function serverSnapshot(): AtlasState {
  return seedState();
}
