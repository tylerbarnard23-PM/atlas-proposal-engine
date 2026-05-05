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
  recordPdfJob: (job: PdfGenerationJob) => void;
  resetSeed: () => void;
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
      recordPdfJob: (job) => set((s) => ({ pdfHistory: [job, ...s.pdfHistory].slice(0, 25) })),
      resetSeed: () => set({ ...seedState(), hasHydrated: true }),
      setHasHydrated: (b) => set({ hasHydrated: b }),
    }),
    {
      name: "atlas-proposal-engine",
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
      version: 1,
    }
  )
);

// Server-safe snapshot used by API routes that don't have access to localStorage.
export function serverSnapshot(): AtlasState {
  return seedState();
}
