import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import type { Account, FxRate, Holding } from "@/domain/types";

// #109 — the reviewed client brief as Stratovell AI receives it, through the
// real store, context revision and agent loop. Synthetic data only; no
// provider call (a fake messages client records what the model would receive).

const storage = vi.hoisted(() => {
  const data = new Map<string, string>();
  const s = {
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() {
      return data.size;
    },
  };
  (globalThis as { window?: unknown }).window = { localStorage: s };
  return s;
});

const NOW = new Date("2026-11-20T12:00:00Z");
const KEY = "atlas-proposal-engine";
const ACC = "acc_uma_story";
const C = "sleeve_acc_uma_story_str_etf_c_r1";
const PRIVATE = "PRIVATE-DISCOVERY-CANARY: spouse undecided about the house";
const NAME = "Managed Story Household";
const EUR_ACCOUNT: Account = { id: "acc_eur_story", name: "Euro Account (synthetic)", type: "brokerage", baseCurrency: "EUR", country: "DE", createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z" };
const EUR_FUND: Holding = {
  id: "h_eur_fund",
  accountId: EUR_ACCOUNT.id,
  assetName: "Euro Equity Fund (synthetic)",
  assetType: "mutual_fund",
  assetClass: "equity",
  country: "DE",
  currency: "EUR",
  nativeMarketValue: 10_000,
  expenseRatioPct: 0.2,
  valuationDate: "2026-09-30",
  valuationSource: { kind: "statement", asOf: "2026-09-30", confidence: "high" },
  quoteType: "manual",
  priceFreshness: "manual",
  dataQuality: [],
  advisorVerification: "advisor_reviewed",
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
};
const EURUSD: FxRate = { base: "EUR", quote: "USD", rate: 1.1, asOf: "2026-11-19T00:00:00.000Z", source: "ECB" };

async function load() {
  return {
    ...(await import("@/store/useStore")),
    ...(await import("@/engines/clientDiscovery")),
    ...(await import("@/engines/workspaceBackup")),
    ...(await import("@/engines/strategyProposals")),
    ...(await import("@/engines/normalizationEngine")),
    ...(await import("@/engines/approvedSnapshot")),
    ...(await import("@/engines/importCompleteness")),
    ...(await import("@/data/umaStory")),
    ...(await import("@/data/seedClient")),
    ...(await import("@/domain/disclosureLibrary")),
    ...(await import("@/copilot/agent")),
    ...(await import("@/copilot/context")),
    ...(await import("@/copilot/testProvider")),
  };
}
type M = Awaited<ReturnType<typeof load>>;
const store = (m: M) => m.useAtlasStore.getState();
const json = (v: unknown) => JSON.parse(JSON.stringify(v));
const ids = (m: M) => ({ disclosureIds: m.DISCLOSURE_LIBRARY.map((d) => d.id) });

beforeEach(() => {
  vi.resetModules();
  storage.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

/** A complete synthetic brief, entered through the store's actions as the questionnaire does. */
function answerAll(m: M) {
  const s = store(m);
  s.setDiscoveryAnswer("objectives", { primary: "reduce_concentration", secondary: ["preserve_wealth", "fund_spending"], clarification: "Diversify away from the largest position." });
  s.setDiscoveryAnswer("timeHorizon", { years: 12 });
  s.setDiscoveryAnswer("liquidity", { need: "planned", amount: 250_000, currency: "USD", timing: "within_1_year" });
  s.setDiscoveryAnswer("income", { need: "none" });
  s.setDiscoveryAnswer("lossWillingness", { level: "moderate" });
  s.setDiscoveryAnswer("lossAbility", { level: "moderate" });
  s.setDiscoveryAnswer("taxSensitivity", { level: "high" });
  s.setDiscoveryAnswer("securitiesToRetain", { securities: [] });
  s.setDiscoveryAnswer("restrictedInvestments", { securities: ["Tobacco producers"] });
  s.setDiscoveryAnswer("otherConstraints", { text: "" });
  s.setDiscoveryClarification("liquidity", `Home purchase for ${NAME}; date not fixed.`);
}

/** The managed-account story with the EUR account in scope, funded, reviewed and approved, with v1 approved. */
function approvedStory(m: M) {
  store(m).startNewClient();
  m.useAtlasStore.setState({
    client: { ...store(m).client, fullName: NAME, householdName: NAME, proposalOutputCurrency: "USD", advisorDiscoveryNotes: PRIVATE },
    accounts: [m.UMA_ACCOUNT, EUR_ACCOUNT],
    holdings: [m.UMA_CASH, EUR_FUND],
    recommendations: [],
    fxRates: [EURUSD],
  });
  store(m).setDraftScope([ACC, EUR_ACCOUNT.id]);
  store(m).setAccountFunding(ACC, { cashHoldingId: "h_uma_cash", reserve: 5_000, reserveCurrency: "USD" });
  store(m).addSyntheticLibrary();
  store(m).pinModel({ id: "mdl_uma_core", revision: 1 });
  const s = store(m);
  const plan = m.sleevePlan({
    model: m.UMA_STRATEGY_MODEL,
    strategies: s.strategies,
    basis: m.accountBasis({ account: s.accounts.find((a) => a.id === ACC), holdings: m.normalizeHoldings(s.holdings, s.fxRates, "USD"), fx: { reportingCurrency: "USD", rates: s.fxRates } }),
  });
  store(m).addDraftEdit(m.sleevePurchases({ plan, accountId: ACC, ids: { group: "grp_story", rec: (sid) => `rec_story_${sid}` }, now: NOW.toISOString() }));
  for (const id of store(m).workingDraft.memberIds) {
    const r = store(m).recommendations.find((x) => x.id === id)!;
    store(m).upsertRecommendation({ ...r, approvedByAdvisor: true, status: "approved", includeInPdf: true });
  }
  store(m).recordSleeveReview(store(m).recommendations.find((r) => r.destination?.id === C)!.id, "No published minimum; reviewed with the sponsor's terms (synthetic).");
  const v = store(m).approveVersion("Approved before discovery (synthetic).");
  if (!v.ok) throw new Error(v.failing.join("; "));
  return v.snapshot;
}

const request = (m: M) => {
  const s = store(m);
  const snapshot = { ...s, sourceDocuments: s.sourceDocuments.map(m.forReadiness) };
  return { snapshot, context: m.agentContextOf(snapshot) };
};

describe("#109 Stratovell AI receives the reviewed brief; stale previews are refused; approved versions are untouched", () => {
  it("a discovery edit makes an earlier preview stale; the approved version is never rewritten", async () => {
    const m = await load();
    const v1 = approvedStory(m);
    const before = JSON.stringify(store(m).snapshots);
    const r = await m.runAgent(request(m).snapshot, "Review this alternative.", { client: m.createTestProvider(), mode: "test", provider: "test", now: NOW });
    expect(r.drafts).toHaveLength(1);

    store(m).setDiscoveryAnswer("lossAbility", { level: "low" });
    const count = store(m).recommendations.length;
    const stale = store(m).acceptAgentDrafts(r.drafts, r.context);
    expect(stale.ok === false && stale.error).toMatch(/workspace changed/);
    expect(store(m).recommendations).toHaveLength(count);
    // a review alone also changes the brief the preview was made against
    const r2 = await m.runAgent(request(m).snapshot, "Review this alternative.", { client: m.createTestProvider(), mode: "test", provider: "test", now: NOW });
    store(m).recordDiscoveryReview();
    expect(store(m).acceptAgentDrafts(r2.drafts, r2.context)).toMatchObject({ ok: false });

    // The version approved before discovery is byte-identical and keeps its fingerprint; the live profile is reported as changed.
    expect(JSON.stringify(store(m).snapshots)).toBe(before);
    expect(store(m).snapshots[0].fingerprint).toBe(v1.fingerprint);
    expect("discovery" in store(m).snapshots[0].inputs.client).toBe(false);
    expect(m.snapshotStatus(store(m).snapshots[0], store(m), NOW)).toEqual({ kind: "changed", parts: ["client profile"] });
  });

  it("the model receives the brief with review status and unknowns, never the private notes, identity or legacy levels", async () => {
    const m = await load();
    approvedStory(m);
    answerAll(m);
    store(m).recordDiscoveryReview();
    store(m).setDiscoveryNotDiscussed("timeHorizon");
    store(m).setAnalysisNote(`Ask about ${NAME}'s planned gift.`);
    type Params = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
    const calls: Params[] = [];
    let n = 0;
    const msg = (content: unknown[], stop: string) => ({ id: `msg_${++n}`, type: "message", role: "assistant", model: m.COPILOT_MODEL, content, stop_reason: stop, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 5 } });
    const client = {
      beta: {
        messages: {
          async create(params: Params) {
            calls.push(json(params));
            return (calls.length === 1 ? msg([{ type: "tool_use", id: "toolu_1", name: "get_portfolio_overview", input: {} }], "tool_use") : msg([{ type: "text", text: "Noted.", citations: null }], "end_turn")) as never;
          },
        },
      },
    };
    const { snapshot, context } = request(m);
    const r = await m.runAgent(snapshot, `What should ${NAME} do?`, { client, mode: "live", provider: "anthropic", now: NOW, sleep: async () => {} });
    expect(r.context).toEqual(context);
    const sent = JSON.stringify(calls);
    const result = JSON.stringify(calls[1].messages[calls[1].messages.length - 1]);
    expect(result).toContain("client_brief");
    expect(result).toContain("reviewed_by_advisor");
    expect(result).toContain("Reduce concentration");
    expect(result).toContain("Planned withdrawal: USD 250,000, within 1 year");
    expect(result).toMatch(/not_discussed[^\]]*Time horizon/);
    // names inside the advisor's free text are replaced like everywhere else (here the household's name)
    expect(result).toContain("Home purchase for [client household]; date not fixed.");
    expect(result).toContain("Ask about [client household]'s planned gift.");
    expect(sent).not.toContain(PRIVATE);
    expect(sent).not.toContain(NAME);
    expect(sent).not.toMatch(/risk_tolerance|liquidity_needs|income_needs/);
  });
});
