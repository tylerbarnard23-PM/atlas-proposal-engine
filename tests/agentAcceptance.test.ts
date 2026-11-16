import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Account, FxRate, Holding } from "@/domain/types";

// D4 — accepting Copilot drafts through the real store, next to an approved
// D3 version. The run uses the deterministic test provider through the real
// agent loop. Synthetic data only.

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

const NOW = new Date("2026-10-26T12:00:00Z");
const ACC = "acc_uma_story";
const C = "sleeve_acc_uma_story_str_etf_c_r1";
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
const EURUSD: FxRate = { base: "EUR", quote: "USD", rate: 1.1, asOf: "2026-10-25T00:00:00.000Z", source: "ECB" };

async function load() {
  return {
    ...(await import("@/store/useStore")),
    ...(await import("@/engines/strategyProposals")),
    ...(await import("@/engines/normalizationEngine")),
    ...(await import("@/engines/approvedSnapshot")),
    ...(await import("@/engines/importCompleteness")),
    ...(await import("@/data/umaStory")),
    ...(await import("@/copilot/agent")),
    ...(await import("@/copilot/context")),
    ...(await import("@/copilot/testProvider")),
  };
}
type M = Awaited<ReturnType<typeof load>>;
const store = (m: M) => m.useAtlasStore.getState();
const json = (v: unknown) => JSON.parse(JSON.stringify(v));

beforeEach(() => {
  vi.resetModules();
  storage.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

/** The managed-account story with the EUR account in scope, funded, reviewed and approved, with v1 approved. */
function approvedStory(m: M) {
  store(m).startNewClient();
  m.useAtlasStore.setState({
    client: { ...store(m).client, fullName: "Managed Story Household", proposalOutputCurrency: "USD" },
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
  const v = store(m).approveVersion("Approved before asking Copilot (synthetic).");
  if (!v.ok) throw new Error(v.failing.join("; "));
  return v.snapshot;
}

/** What the page sends: the workspace slice, and the context computed from it. */
function requestFor(m: M) {
  const s = store(m);
  const snapshot = { ...s, sourceDocuments: s.sourceDocuments.map(m.forReadiness) };
  return { snapshot, context: m.agentContextOf(snapshot) };
}

const ask = async (m: M) => {
  const { snapshot, context } = requestFor(m);
  const r = await m.runAgent(snapshot, "Review this alternative.", { client: m.createTestProvider(), mode: "test", provider: "test", now: NOW });
  expect(r.context).toEqual(context);
  return r;
};

describe("accepting Copilot drafts (D4)", () => {
  it("a preview writes nothing; acceptance adds one unapproved member and leaves holdings, approvals and the approved version untouched", async () => {
    const m = await load();
    const v1 = approvedStory(m);
    const before = json({ holdings: store(m).holdings, recs: store(m).recommendations, draft: store(m).workingDraft, snapshots: store(m).snapshots });

    const r = await ask(m);
    expect(r.status).toBe("completed");
    // The largest in-scope non-cash position is the EUR fund (USD 11,000); the provider trims 10%.
    expect(r.drafts).toHaveLength(1);
    expect(r.drafts[0]).toMatchObject({ relatedHoldingId: "h_eur_fund", actionAmount: 1_100, approvedByAdvisor: false, includeInPdf: false });
    expect(json({ holdings: store(m).holdings, recs: store(m).recommendations, draft: store(m).workingDraft, snapshots: store(m).snapshots })).toEqual(before);

    const a = store(m).acceptAgentDrafts(r.drafts, r.context);
    expect(a).toEqual({ ok: true, added: [r.drafts[0].id], skipped: [] });
    const s = store(m);
    const accepted = s.recommendations.find((x) => x.id === r.drafts[0].id)!;
    expect(accepted).toMatchObject({ approvedByAdvisor: false, includeInPdf: false, status: "needs_review" });
    expect(s.workingDraft.memberIds).toContain(accepted.id);
    expect(json(s.holdings)).toEqual(before.holdings);
    // Every earlier recommendation, approval included, is as it was.
    for (const old of before.recs) expect(json(s.recommendations.find((x) => x.id === old.id))).toEqual(old);
    // The approved version is unchanged and still matches: an unapproved draft isn't part of it.
    expect(json(s.snapshots)).toEqual(before.snapshots);
    expect(m.snapshotStatus(s.snapshots[0], s, NOW)).toEqual({ kind: "matches" });
    expect(s.snapshots[0].fingerprint).toBe(v1.fingerprint);
  });

  it("a retried or repeated accept never duplicates a draft or overwrites the advisor's later approval", async () => {
    const m = await load();
    approvedStory(m);
    const r = await ask(m);
    expect(store(m).acceptAgentDrafts(r.drafts, r.context)).toMatchObject({ ok: true, added: [r.drafts[0].id] });
    const count = store(m).recommendations.length;
    expect(store(m).acceptAgentDrafts(r.drafts, r.context)).toEqual({ ok: true, added: [], skipped: [r.drafts[0].id] });
    expect(store(m).recommendations).toHaveLength(count);

    // The advisor approves it; an old answer accepted again leaves that decision alone.
    const accepted = store(m).recommendations.find((x) => x.id === r.drafts[0].id)!;
    store(m).upsertRecommendation({ ...accepted, approvedByAdvisor: true, status: "approved", includeInPdf: true });
    expect(store(m).acceptAgentDrafts(r.drafts, r.context)).toMatchObject({ ok: true, added: [] });
    expect(store(m).recommendations.find((x) => x.id === r.drafts[0].id)).toMatchObject({ approvedByAdvisor: true });

    // The same question on the same inputs gives the same draft identity, so a re-run can't add a twin.
    const again = await ask(m);
    expect(again.drafts.map((d) => d.id)).not.toContain(undefined);
    expect(store(m).recommendations.filter((x) => x.relatedHoldingId === "h_eur_fund" && x.actionAmount === 1_100)).toHaveLength(1);
  });

  it("refuses a stale preview after an edit, and an answer about an alternative that is no longer active", async () => {
    const m = await load();
    approvedStory(m);
    const r = await ask(m);
    store(m).patchHolding("h_eur_fund", { nativeMarketValue: 12_000 });
    const count = store(m).recommendations.length;
    const stale = store(m).acceptAgentDrafts(r.drafts, r.context);
    expect(stale).toMatchObject({ ok: false });
    expect(stale.ok === false && stale.error).toMatch(/workspace changed/);
    expect(store(m).recommendations).toHaveLength(count);

    const fresh = await ask(m);
    store(m).duplicateDraft("Alternative B");
    const other = store(m).acceptAgentDrafts(fresh.drafts, fresh.context);
    expect(other.ok === false && other.error).toMatch(/no longer the active one/);
    expect(store(m).recommendations.some((x) => fresh.drafts.some((d) => d.id === x.id))).toBe(false);
  });

  it("an accepted draft and the approved version survive a reload unchanged", async () => {
    let m = await load();
    approvedStory(m);
    const r = await ask(m);
    store(m).acceptAgentDrafts(r.drafts, r.context);
    const saved = JSON.stringify({ recs: store(m).recommendations, draft: store(m).workingDraft.memberIds, snapshots: store(m).snapshots });
    vi.resetModules();
    m = await load();
    await m.useAtlasStore.persist.rehydrate();
    expect(JSON.stringify({ recs: store(m).recommendations, draft: store(m).workingDraft.memberIds, snapshots: store(m).snapshots })).toBe(saved);
    expect(store(m).recommendations.find((x) => x.id === r.drafts[0].id)).toMatchObject({ approvedByAdvisor: false, includeInPdf: false });
  });
});
