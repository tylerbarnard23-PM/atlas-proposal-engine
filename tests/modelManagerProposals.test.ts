import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Holding, Recommendation } from "@/domain/types";

vi.mock("puppeteer-core", async () => (await import("./support/fakeChromium")).puppeteerModule);
vi.mock("@/pdf/chromiumPath", async () => (await import("./support/fakeChromium")).chromiumPathModule);

// D2a — model portfolios and manager-sleeve proposals, through the real
// store, shared evaluator, readiness, final-PDF route and backup paths, on
// the committed synthetic USD 100,000 account (MODEL_AND_MANAGER_PROPOSALS.md).

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

async function load() {
  return {
    ...(await import("@/store/useStore")),
    ...(await import("@/engines/allocationDesk")),
    ...(await import("@/engines/strategyProposals")),
    ...(await import("@/engines/workspaceBackup")),
    ...(await import("@/engines/normalizationEngine")),
    ...(await import("@/engines/complianceEngine")),
    ...(await import("@/data/umaStory")),
    ...(await import("@/domain/disclosureLibrary")),
  };
}
type M = Awaited<ReturnType<typeof load>>;

beforeEach(() => {
  vi.resetModules();
  storage.clear();
});

/** The managed-account story: USD 100,000 eligible cash with a reserve, the synthetic library, nothing pinned. */
function story(m: M, reserve = 5_000) {
  m.useAtlasStore.getState().startNewClient();
  m.useAtlasStore.setState({
    client: { ...m.useAtlasStore.getState().client, fullName: "Managed Story Household", proposalOutputCurrency: "USD" },
    accounts: [m.UMA_ACCOUNT],
    holdings: [m.UMA_CASH],
    recommendations: [],
  });
  const st = m.useAtlasStore.getState();
  st.setDraftScope([ACC]);
  st.setAccountFunding(ACC, { cashHoldingId: "h_uma_cash", reserve, reserveCurrency: "USD" });
  st.addSyntheticLibrary();
}

const fx = (m: M) => ({ reportingCurrency: "USD" as const, rates: m.useAtlasStore.getState().fxRates });
const normalized = (m: M) => {
  const s = m.useAtlasStore.getState();
  return m.normalizeHoldings(s.holdings, s.fxRates, "USD");
};
function plan(m: M, model = m.UMA_STRATEGY_MODEL) {
  const s = m.useAtlasStore.getState();
  return m.sleevePlan({ model, strategies: s.strategies, basis: m.accountBasis({ account: s.accounts.find((a) => a.id === ACC), holdings: normalized(m), fx: fx(m) }) });
}
let seq = 0;
const purchases = (m: M, p = plan(m), tag = `g${++seq}`) =>
  m.sleevePurchases({ plan: p, accountId: ACC, ids: { group: `grp_${tag}`, rec: (sid) => `rec_${tag}_${sid}` }, now: NOW.toISOString() });
function desk(m: M, view: "draft" | "approved" = "draft", draft = m.useAtlasStore.getState().workingDraft) {
  const s = m.useAtlasStore.getState();
  return m.evaluateDesk({ holdings: normalized(m), accounts: s.accounts, recommendations: s.recommendations, draft, fx: fx(m), view });
}
const value = (d: ReturnType<typeof desk>, id: string) => d.positions.find((p) => p.id === id)?.proposed ?? null;
function exposure(m: M, d = desk(m)) {
  const s = m.useAtlasStore.getState();
  return m.exposureView({ positions: d.positions, recommendations: s.recommendations, strategies: s.strategies });
}
const pctBy = (e: ReturnType<typeof exposure>) => Object.fromEntries(e.rows.map((r) => [r.assetClass, Math.round(r.pct * 100) / 100]));
const readiness = (m: M) => {
  const s = m.useAtlasStore.getState();
  return m.evaluateWorkspaceReadiness({ client: s.client, advisor: s.advisor, accounts: s.accounts, holdings: s.holdings, recommendations: s.recommendations, disclosures: s.disclosures, fxRates: s.fxRates, sourceDocuments: s.sourceDocuments, now: NOW, drafts: [s.workingDraft, ...s.alternatives] });
};
const check = (m: M, code: string) => readiness(m).find((c) => c.code === code)!;
const approveAll = (m: M, ids = m.useAtlasStore.getState().workingDraft.memberIds) => {
  for (const id of ids) {
    const r = m.useAtlasStore.getState().recommendations.find((x) => x.id === id)!;
    m.useAtlasStore.getState().upsertRecommendation({ ...r, approvedByAdvisor: true, status: "approved", includeInPdf: true });
  }
};
const A = "sleeve_acc_uma_story_str_equity_a_r1";
const B = "sleeve_acc_uma_story_str_fixed_b_r1";
const C = "sleeve_acc_uma_story_str_etf_c_r1";

describe("a strategy allocation target", () => {
  it("40/35/20/5 on USD 100,000 is 40,000 / 35,000 / 20,000 / 5,000, and pinning it creates no holding, action or approval", async () => {
    const m = await load();
    story(m);
    const before = structuredClone(m.useAtlasStore.getState().holdings);
    m.useAtlasStore.getState().pinModel({ id: "mdl_uma_core", revision: 1 });
    const p = plan(m);
    expect(p.problems).toEqual([]);
    expect(p.rows.map((r) => [r.strategy.manager, r.target])).toEqual([["Equity Manager A", 40_000], ["Fixed Income Manager B", 35_000], ["ETF Model C", 20_000]]);
    expect([p.cash, p.unallocated]).toEqual([{ weight: 5, target: 5_000 }, { weight: 0, target: 0 }]);
    const s = m.useAtlasStore.getState();
    expect(s.workingDraft.model).toEqual({ id: "mdl_uma_core", revision: 1 });
    expect(s.recommendations).toEqual([]);
    expect(s.holdings).toEqual(before);
    expect(value(desk(m), "h_uma_cash")).toBe(100_000);
  });
});

describe("an explicitly funded transition", () => {
  it("applies whole: sleeves 40/35/20k, cash 5,000; totals reconcile to 100,000 and exposure is 50/45/5, never double-counted", async () => {
    const m = await load();
    story(m);
    const before = structuredClone(m.useAtlasStore.getState().holdings);
    const legs = purchases(m);
    expect(legs.map((r) => [r.destination!.id, r.actionAmount, r.approvedByAdvisor, r.linked!.legs])).toEqual([[A, 40_000, false, 3], [B, 35_000, false, 3], [C, 20_000, false, 3]]);
    const s = m.useAtlasStore.getState();
    const preview = m.previewDraftEdit({ holdings: normalized(m), accounts: s.accounts, recommendations: s.recommendations, draft: s.workingDraft, candidate: legs, fx: fx(m) });
    expect(preview).toMatchObject({ applied: true, blocked: [], shortfalls: [] });
    m.useAtlasStore.getState().addDraftEdit(legs);
    const d = desk(m);
    expect([value(d, A), value(d, B), value(d, C), value(d, "h_uma_cash")]).toEqual([40_000, 35_000, 20_000, 5_000]);
    expect(d.positions.filter((p) => p.proposedOnly).every((p) => p.assetClass === "custom")).toBe(true); // a manager is never an asset class
    expect(d.reserves[0]).toMatchObject({ available: 5_000, reserve: 5_000, breached: false });
    const e = exposure(m, d);
    expect(e.total).toBe(100_000);
    expect(pctBy(e)).toEqual({ equity: 50, fixed_income: 45, cash: 5 });
    expect(e.unknown).toEqual({ value: 0, pct: 0, sleeves: 0 });
    expect(e.sleeves.map((x) => [x.manager, x.value])).toEqual([["Equity Manager A", 40_000], ["Fixed Income Manager B", 35_000], ["ETF Model C", 20_000]]);
    expect(m.useAtlasStore.getState().holdings).toEqual(before);
  });

  it("cancelling (previewing without adding) changes nothing", async () => {
    const m = await load();
    story(m);
    const s0 = JSON.stringify(m.useAtlasStore.getState().recommendations) + JSON.stringify(m.useAtlasStore.getState().workingDraft.memberIds);
    const s = m.useAtlasStore.getState();
    m.previewDraftEdit({ holdings: normalized(m), accounts: s.accounts, recommendations: s.recommendations, draft: s.workingDraft, candidate: purchases(m), fx: fx(m) });
    expect(JSON.stringify(m.useAtlasStore.getState().recommendations) + JSON.stringify(m.useAtlasStore.getState().workingDraft.memberIds)).toBe(s0);
  });
});

describe("unknowns stay unknown", () => {
  it("a sleeve with no supplied mix is an unknown 20%, not renormalized; a prior alternative keeps the earlier revisions", async () => {
    const m = await load();
    story(m);
    const st = m.useAtlasStore.getState();
    st.renameActiveDraft("Mix known");
    st.pinModel({ id: "mdl_uma_core", revision: 1 });
    st.addDraftEdit(purchases(m));
    // C's mix is withdrawn in revision 2; the model gets a revision using it.
    const c1 = m.findRevision(st.strategies, "str_etf_c", 1)!;
    expect(m.useAtlasStore.getState().saveStrategy({ ...c1, id: "str_etf_c", mix: null })).toEqual([]);
    expect(m.useAtlasStore.getState().saveModel({ ...m.UMA_STRATEGY_MODEL, id: "mdl_uma_core", strategyWeights: m.UMA_STRATEGY_MODEL.strategyWeights!.map((w) => (w.strategyId === "str_etf_c" ? { ...w, strategyRevision: 2 } : w)) })).toEqual([]);
    m.useAtlasStore.getState().duplicateDraft("Mix unknown");
    for (const id of m.useAtlasStore.getState().workingDraft.memberIds) m.useAtlasStore.getState().setDraftMember(id, false);
    m.useAtlasStore.getState().pinModel({ id: "mdl_uma_core", revision: 2 });
    const model2 = m.findRevision(m.useAtlasStore.getState().models, "mdl_uma_core", 2)!;
    m.useAtlasStore.getState().addDraftEdit(purchases(m, plan(m, model2)));
    const e = exposure(m);
    expect(pctBy(e)).toEqual({ equity: 40, fixed_income: 35, cash: 5 });
    expect(e.unknown).toEqual({ value: 20_000, pct: 20, sleeves: 1 });
    expect(e.total).toBe(100_000);
    // The first alternative is still pinned to revision 1 and its known 50/45/5.
    const a = m.useAtlasStore.getState().alternatives.find((x) => x.name === "Mix known")!;
    expect(a.model).toEqual({ id: "mdl_uma_core", revision: 1 });
    expect(pctBy(exposure(m, desk(m, "draft", a)))).toEqual({ equity: 50, fixed_income: 45, cash: 5 });
  });

  it("missing fees and minimums are reported as not supplied, never as zero or eligible", async () => {
    const m = await load();
    expect(m.feeCoverage([])).toBe("Fees not supplied");
    expect(m.minimumStatus(null, 20_000, false)).toEqual({ kind: "not_supplied", reviewed: false });
    expect(m.feeCoverage([{ kind: "all_in", rateBps: 90, basis: "assets" }, { kind: "manager", rateBps: 40, basis: "assets" }])).toMatch(/not added together/);
  });
});

describe("minimums and reserves are enforced by the shared evaluator", () => {
  it("a 50,000 minimum makes the 40,000 commitment fail: the whole unit is left out, and the final PDF is refused", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    try {
      const m = await load();
      story(m);
      const st = m.useAtlasStore.getState();
      const a1 = m.findRevision(st.strategies, "str_equity_a", 1)!;
      expect(st.saveStrategy({ ...a1, id: "str_equity_a", minimum: 50_000 })).toEqual([]);
      const strategyWeights = m.UMA_STRATEGY_MODEL.strategyWeights!.map((w) => (w.strategyId === "str_equity_a" ? { ...w, strategyRevision: 2 } : w));
      expect(m.useAtlasStore.getState().saveModel({ ...m.UMA_STRATEGY_MODEL, id: "mdl_uma_core", strategyWeights })).toEqual([]);
      const legs = purchases(m, plan(m, m.findRevision(m.useAtlasStore.getState().models, "mdl_uma_core", 2)!));
      m.useAtlasStore.getState().addDraftEdit(legs);
      const d = desk(m);
      expect(d.blocked).toEqual([expect.objectContaining({ recommendationIds: legs.map((r) => r.id), reason: expect.stringMatching(/Equity Manager A — Core Equity would hold USD 40,000, below its USD 50,000 minimum/) })]);
      expect(d.positions.some((p) => p.proposedOnly)).toBe(false); // nothing half-applied
      expect(value(d, "h_uma_cash")).toBe(100_000);
      approveAll(m);
      expect(check(m, "funding_reserves")).toMatchObject({ passed: false, detail: expect.stringMatching(/minimum/) });
      const s = JSON.parse(JSON.stringify(m.useAtlasStore.getState()));
      const { POST } = await import("@/app/api/proposals/[id]/generate-pdf/route");
      const state = { client: s.client, advisor: s.advisor, accounts: s.accounts, holdings: s.holdings, recommendations: s.recommendations, sections: s.proposal.sections, disclosures: s.disclosures, proposal: s.proposal, fxRates: s.fxRates, sourceDocuments: [], fxConfirmation: null, workingDraft: s.workingDraft, alternatives: s.alternatives };
      const res = await POST(new Request("http://localhost/api/proposals/p1/generate-pdf?variant=final", { method: "POST", body: JSON.stringify({ state }) }), { params: Promise.resolve({ id: "p1" }) });
      expect(res.status).toBe(422);
      expect((await res.json()).failing).toContain("Linked replacements applied whole and cash reserves kept");
    } finally {
      vi.useRealTimers();
    }
  });

  it("a 10,000 reserve makes the 5,000-cash target infeasible: left out whole, not forced", async () => {
    const m = await load();
    story(m, 10_000);
    m.useAtlasStore.getState().addDraftEdit(purchases(m));
    const d = desk(m);
    expect(d.blocked).toEqual([expect.objectContaining({ reason: expect.stringMatching(/^Linked purchase not applied: .*USD 5,000, below its USD 10,000 reserve/) })]); // purchases alone are not a "replacement"
    expect(value(d, "h_uma_cash")).toBe(100_000);
  });

  it("an unsupplied minimum blocks the final PDF until the advisor records a review, worded as a review", async () => {
    const m = await load();
    story(m);
    m.useAtlasStore.getState().addDraftEdit(purchases(m));
    approveAll(m);
    expect(check(m, "funding_reserves").passed).toBe(true);
    expect(check(m, "strategy_terms")).toMatchObject({ passed: false, detail: expect.stringMatching(/ETF Model C — Balanced ETF Model: minimum not supplied/) });
    const cRec = m.useAtlasStore.getState().recommendations.find((r) => r.destination?.id === C)!;
    m.useAtlasStore.getState().recordSleeveReview(cRec.id, "No published minimum; reviewed with the sponsor's terms sheet (synthetic).");
    expect(check(m, "strategy_terms").passed).toBe(true);
    const after = m.useAtlasStore.getState().recommendations.find((r) => r.id === cRec.id)!;
    expect(after).toMatchObject({ approvedByAdvisor: true, destination: { strategy: { minimum: null, review: { note: expect.stringMatching(/reviewed/) } } } });
  });

  it("an atomic failure (the designated cash removed) leaves every sleeve out, with the funding reason", async () => {
    const m = await load();
    story(m);
    m.useAtlasStore.getState().addDraftEdit(purchases(m));
    m.useAtlasStore.getState().removeHolding("h_uma_cash");
    const d = desk(m);
    expect(d.positions.some((p) => p.proposedOnly)).toBe(false);
    expect(d.blocked[0].reason).toMatch(/eligible cash .* was removed/);
  });
});

describe("definitions are validated and pinned", () => {
  it("rejects totals above 100%, duplicate assignments, nothing allocated and a mix that isn't complete", async () => {
    const m = await load();
    story(m);
    const st = m.useAtlasStore.getState();
    const base = { name: "Bad", kind: "strategy" as const, provenance: "custom" as const };
    expect(st.saveModel({ ...base, strategyWeights: [{ strategyId: "str_equity_a", strategyRevision: 1, weight: 80 }, { strategyId: "str_fixed_b", strategyRevision: 1, weight: 30 }], cashWeight: 0 })).toEqual([expect.stringMatching(/above 100%/)]);
    expect(st.saveModel({ ...base, strategyWeights: [{ strategyId: "str_equity_a", strategyRevision: 1, weight: 40 }, { strategyId: "str_equity_a", strategyRevision: 1, weight: 40 }] })).toEqual([expect.stringMatching(/more than once/)]);
    expect(st.saveModel({ name: "Empty", kind: "asset_class", assetWeights: {}, provenance: "custom" })).toEqual([expect.stringMatching(/allocates nothing/)]);
    expect(st.saveModel({ ...base, strategyWeights: [{ strategyId: "str_missing", strategyRevision: 1, weight: 50 }] })).toEqual([expect.stringMatching(/isn't in the library/)]);
    expect(st.saveStrategy({ manager: "M", name: "Partial", strategyType: "SMA", currency: "USD", minimum: null, fees: [], mix: { weights: { equity: 60 }, source: "s", asOf: "2026-09-30" }, provenance: "custom" })).toEqual([expect.stringMatching(/total 100%/)]);
    expect(m.useAtlasStore.getState().models).toHaveLength(2); // nothing saved
  });

  it("a plan in another currency, with no basis, or for an unsupported account can't be funded", async () => {
    const m = await load();
    story(m);
    const st = m.useAtlasStore.getState();
    const eurC = { ...m.findRevision(st.strategies, "str_etf_c", 1)!, currency: "EUR" as Holding["currency"] };
    expect(st.saveStrategy({ ...eurC, id: "str_etf_c" })).toEqual([]);
    const model = { ...m.UMA_STRATEGY_MODEL, strategyWeights: m.UMA_STRATEGY_MODEL.strategyWeights!.map((w) => (w.strategyId === "str_etf_c" ? { ...w, strategyRevision: 2 } : w)) };
    const p = plan(m, model);
    expect(p.problems).toEqual([expect.stringMatching(/in EUR, but the eligible cash is in USD/)]);
    expect(() => purchases(m, p)).toThrow(/EUR/);
    // No eligible cash chosen; a zero-value account; an unknown account.
    m.useAtlasStore.getState().setAccountFunding(ACC, null);
    expect(plan(m).problems).toContainEqual(expect.stringMatching(/no eligible cash chosen/));
    expect(m.accountBasis({ account: undefined, holdings: normalized(m), fx: fx(m) })).toEqual({ ok: false, reason: expect.stringMatching(/supported investment account/) });
    m.useAtlasStore.setState({ holdings: [{ ...m.UMA_CASH, nativeMarketValue: 0 }] });
    m.useAtlasStore.getState().setAccountFunding(ACC, { cashHoldingId: "h_uma_cash", reserve: 0, reserveCurrency: "USD" });
    expect(plan(m).problems).toContainEqual(expect.stringMatching(/nothing to allocate/));
  });

  it("revising the 60/35/5 asset-class model to 50/45/5 leaves the earlier alternative on revision 1", async () => {
    const m = await load();
    story(m);
    const st = m.useAtlasStore.getState();
    st.renameActiveDraft("Alternative A");
    st.pinModel({ id: "mdl_balanced", revision: 1 });
    expect(m.useAtlasStore.getState().workingDraft.targets).toEqual({ equity: 60, fixed_income: 35, cash: 5 });
    m.useAtlasStore.getState().duplicateDraft("Alternative B");
    expect(m.useAtlasStore.getState().saveModel({ ...m.BALANCED_MODEL, id: "mdl_balanced", assetWeights: { equity: 50, fixed_income: 45, cash: 5 } })).toEqual([]);
    expect(m.latestRevision(m.useAtlasStore.getState().models, "mdl_balanced")!.revision).toBe(2);
    // B still follows nothing automatically until it is pinned explicitly.
    expect(m.useAtlasStore.getState().workingDraft.model).toEqual({ id: "mdl_balanced", revision: 1 });
    m.useAtlasStore.getState().pinModel({ id: "mdl_balanced", revision: 2 });
    expect(m.useAtlasStore.getState().workingDraft.targets).toEqual({ equity: 50, fixed_income: 45, cash: 5 });
    const a = m.useAtlasStore.getState().alternatives.find((x) => x.name === "Alternative A")!;
    expect([a.model, a.targets]).toEqual([{ id: "mdl_balanced", revision: 1 }, { equity: 60, fixed_income: 35, cash: 5 }]);
    expect(m.findRevision(m.useAtlasStore.getState().models, "mdl_balanced", 1)!.assetWeights).toEqual({ equity: 60, fixed_income: 35, cash: 5 });
    expect(m.useAtlasStore.getState().recommendations).toEqual([]);
  });

  it("duplicating an alternative with funded sleeves remaps action and group IDs and clears approval; editing one leaves the other", async () => {
    const m = await load();
    story(m);
    m.useAtlasStore.getState().addDraftEdit(purchases(m));
    approveAll(m);
    const reviewed = m.useAtlasStore.getState().recommendations.find((r) => r.destination?.id === C)!;
    m.useAtlasStore.getState().recordSleeveReview(reviewed.id, "Reviewed for alternative A only.");
    const aIds = m.useAtlasStore.getState().workingDraft.memberIds;
    m.useAtlasStore.getState().duplicateDraft("Copy");
    const copy = m.useAtlasStore.getState().recommendations.filter((r) => m.useAtlasStore.getState().workingDraft.memberIds.includes(r.id));
    expect(copy.every((r) => !aIds.includes(r.id) && !r.approvedByAdvisor && r.linked!.groupId !== "grp_" && r.destination?.strategy)).toBe(true);
    expect(new Set(copy.map((r) => r.linked!.groupId)).size).toBe(1);
    expect(copy.find((r) => r.destination!.id === C)!.destination!.strategy!.review).toBeUndefined(); // the review stays with A
    expect(m.useAtlasStore.getState().recommendations.find((r) => r.id === reviewed.id)!.destination!.strategy!.review).toBeDefined();
    for (const r of copy) m.useAtlasStore.getState().setDraftMember(r.id, false);
    const a = m.useAtlasStore.getState().alternatives[0];
    expect(value(desk(m, "draft", a), A)).toBe(40_000);
    expect(value(desk(m), A)).toBeNull();
  });
});

describe("Copilot and persistence", () => {
  it("Copilot readiness reports the unreviewed minimum", async () => {
    const m = await load();
    story(m);
    m.useAtlasStore.getState().addDraftEdit(purchases(m));
    approveAll(m);
    const s = JSON.parse(JSON.stringify(m.useAtlasStore.getState()));
    const { parseCopilotRequest } = await import("@/copilot/snapshot");
    const { CopilotContext, executeTool } = await import("@/copilot/tools");
    const parsed = parseCopilotRequest({ question: "ready?", snapshot: { client: s.client, advisor: s.advisor, accounts: s.accounts, holdings: s.holdings, fxRates: s.fxRates, recommendations: s.recommendations, disclosures: s.disclosures, workingDraft: s.workingDraft, alternatives: s.alternatives } });
    if (!parsed.ok) throw new Error(parsed.error);
    const out = JSON.parse(executeTool(new CopilotContext(parsed.value.snapshot), "check_proposal_readiness", {}).content);
    expect(out.checks.find((c: { check: string }) => c.check === "Strategy minimums supplied or reviewed")).toMatchObject({ passed: false });
  });

  it("reload, v9 export/restore/reload, and v8/v7/v6 upgrades keep definitions, pins, sleeves, reviews and blockers", async () => {
    let m = await load();
    story(m);
    m.useAtlasStore.getState().pinModel({ id: "mdl_uma_core", revision: 1 });
    m.useAtlasStore.getState().addDraftEdit(purchases(m));
    const cRec = m.useAtlasStore.getState().recommendations.find((r) => r.destination?.id === C)!;
    m.useAtlasStore.getState().recordSleeveReview(cRec.id, "Reviewed (synthetic).");
    const snap = (mm: M) => {
      const s = mm.useAtlasStore.getState();
      return { strategies: s.strategies, models: s.models, draft: [s.workingDraft.model, s.workingDraft.memberIds], recs: s.recommendations, accounts: s.accounts, holdings: s.holdings, exposure: pctBy(exposure(mm)) };
    };
    const before = JSON.parse(JSON.stringify(snap(m)));
    expect(JSON.parse(storage.getItem("atlas-proposal-engine")!).version).toBe(9);
    vi.resetModules();
    m = await load();
    await m.useAtlasStore.persist.rehydrate();
    expect(JSON.parse(JSON.stringify(snap(m)))).toEqual(before);

    const ids = { disclosureIds: m.DISCLOSURE_LIBRARY.map((d) => d.id) };
    const exported = m.exportBackup(m.useAtlasStore.getState(), NOW, ids);
    if (!exported.ok) throw new Error(exported.errors.join("; "));
    const file = JSON.parse(exported.text);
    expect(file.workspaceVersion).toBe(9);
    const parsed = m.parseBackup(exported.text, ids);
    if (!parsed.ok) throw new Error(parsed.errors.join("; "));
    m.useAtlasStore.getState().startNewClient();
    expect(m.useAtlasStore.getState().restoreWorkspace(m.restoredState(parsed.backup, m.useAtlasStore.getState(), { replaceFirm: false }))).toEqual({ ok: true });
    vi.resetModules();
    m = await load();
    await m.useAtlasStore.persist.rehydrate();
    expect(JSON.parse(JSON.stringify(snap(m)))).toEqual(before);

    // Corrupt references are still rejected.
    const mutate = (fn: (x: any) => void) => {
      const c = structuredClone(file);
      fn(c);
      return m.parseBackup(JSON.stringify(c), ids).ok;
    };
    expect(mutate((x) => (x.engagement.workingDraft.model = { id: "mdl_uma_core", revision: 7 }))).toBe(false);
    expect(mutate((x) => (x.engagement.recommendations[0].destination.strategy.minimum = 1))).toBe(false);
    expect(mutate((x) => (x.engagement.recommendations[0].destination.strategy.revision = 9))).toBe(false);
    expect(mutate((x) => (x.engagement.models[0].cashWeight = 50))).toBe(false); // above 100%

    // A v8 file has no library, pins or sleeve terms; it upgrades with an empty library and can't carry them.
    const plain = (() => {
      const c = structuredClone(file);
      const { strategies: _s, models: _m, ...e8 } = c.engagement;
      void _s;
      void _m;
      e8.recommendations = e8.recommendations.filter((r: Recommendation) => !r.destination?.strategy);
      e8.workingDraft = { ...e8.workingDraft, memberIds: [] };
      delete e8.workingDraft.model;
      return { ...c, workspaceVersion: 8, engagement: e8 };
    })();
    const p8 = m.parseBackup(JSON.stringify(plain), ids);
    if (!p8.ok) throw new Error(p8.errors.join("; "));
    expect(p8.backup.workspaceVersion).toBe(9);
    expect([p8.backup.engagement.strategies, p8.backup.engagement.models]).toEqual([[], []]);
    expect(m.parseBackup(JSON.stringify({ ...plain, engagement: { ...plain.engagement, strategies: [] } }), ids).ok).toBe(false);
    expect(m.parseBackup(JSON.stringify({ ...file, workspaceVersion: 8 }), ids).ok).toBe(false);
    // Store v8 → v9.
    const persisted = JSON.parse(JSON.stringify(m.useAtlasStore.getState()));
    delete persisted.strategies;
    delete persisted.models;
    const migrated = m.migrateAtlasState(persisted, 8);
    expect([migrated.strategies, migrated.models]).toEqual([[], []]);
    expect(m.migrateAtlasState({ ...migrated, strategies: [m.UMA_STRATEGIES[0]] }, 8).strategies).toHaveLength(1);
  });
});

describe("output", () => {
  it("the PDF shows approved sleeves at their balance, says how, and claims no exposure, verification or eligibility", async () => {
    const m = await load();
    story(m);
    m.useAtlasStore.getState().addDraftEdit(purchases(m));
    approveAll(m);
    const s = m.useAtlasStore.getState();
    const React = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { ProposalPdfTemplate } = await import("@/pdf/templates/ProposalPdfTemplate");
    const html = renderToStaticMarkup(React.createElement(ProposalPdfTemplate, { client: s.client, advisor: s.advisor, accounts: s.accounts, holdings: s.holdings, recommendations: s.recommendations, sections: s.proposalSections, disclosures: s.disclosures, fxRates: s.fxRates, proposal: s.proposal, variant: "draft", now: NOW.toISOString(), timeZone: "UTC" }));
    const text = html.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, " ");
    expect(text).not.toMatch(/NaN|undefined/);
    expect(text).toMatch(/Includes 3 proposed manager\/strategy sleeves \(Equity Manager A — Core Equity \(rev 1\); Fixed Income Manager B — Core Bond \(rev 1\); ETF Model C — Balanced ETF Model \(rev 1\)\)/);
    expect(text).toMatch(/underlying asset-class exposure is not broken out/);
    expect(text).toMatch(/not a verified offering, appointment or eligibility determination/);
    expect(text).toMatch(/Other \/ unclassified/);
  });
});

describe("review fixes (PR #79)", () => {
  /** A EUR managed account in a USD report at EUR/USD 0.50, with a EUR strategy (minimum EUR 25,000) at 40%. */
  function eurStory(m: M) {
    story(m);
    const s0 = m.useAtlasStore.getState();
    m.useAtlasStore.setState({
      accounts: [{ ...m.UMA_ACCOUNT, baseCurrency: "EUR" as Holding["currency"] }],
      holdings: [{ ...m.UMA_CASH, currency: "EUR" as Holding["currency"] }],
      fxRates: s0.fxRates.map((r) => (r.base === "EUR" && r.quote === "USD" ? { ...r, rate: 0.5 } : r)),
    });
    const st = m.useAtlasStore.getState();
    st.setAccountFunding(ACC, { cashHoldingId: "h_uma_cash", reserve: 0, reserveCurrency: "EUR" as Holding["currency"] });
    expect(st.saveStrategy({ manager: "Euro Manager E", name: "Euro Core", strategyType: "SMA", currency: "EUR" as Holding["currency"], minimum: 25_000, fees: [], mix: null, provenance: "custom" })).toEqual([]);
    const e = m.latestRevisions(m.useAtlasStore.getState().strategies).find((x) => x.manager === "Euro Manager E")!;
    expect(m.useAtlasStore.getState().saveModel({ name: "Euro 40", kind: "strategy", strategyWeights: [{ strategyId: e.id, strategyRevision: e.revision, weight: 40 }], cashWeight: 60, provenance: "custom" })).toEqual([]);
    const model = m.latestRevisions(m.useAtlasStore.getState().models).find((x) => x.name === "Euro 40")!;
    m.useAtlasStore.getState().pinModel({ id: model.id, revision: model.revision });
    return { e, model };
  }
  const rows = (m: M) => {
    const s = m.useAtlasStore.getState();
    const drafts = [s.workingDraft, ...s.alternatives];
    const compared = m.compareAlternatives({ holdings: normalized(m), accounts: s.accounts, recommendations: s.recommendations, drafts, fx: fx(m) });
    return m.sleeveRows({ recommendations: s.recommendations, activeId: s.workingDraft.id, alternatives: drafts, results: new Map(compared.map((c) => [c.draft.id, c.result])), approved: desk(m, "approved") });
  };

  it("a EUR sleeve in a USD report: the commitment and its minimum are compared in EUR (40,000 funded meets 25,000)", async () => {
    const m = await load();
    const { model } = eurStory(m);
    const p = plan(m, model);
    expect(p.basis).toEqual({ ok: true, value: 100_000, currency: "EUR" });
    m.useAtlasStore.getState().addDraftEdit(purchases(m, p));
    const d = desk(m);
    expect(d.blocked).toEqual([]); // the engine applies it
    const pos = d.positions.find((x) => x.proposedOnly)!;
    expect(pos.proposed).toBe(20_000); // reporting (USD)
    expect(pos.proposedNative).toEqual({ amount: 40_000, currency: "EUR" });
    expect(rows(m)).toEqual([expect.objectContaining({ currency: "EUR", funded: { amount: 40_000, currency: "EUR" }, status: { kind: "met", minimum: 25_000 } })]);
  });

  it("a pending preview is bound to its alternative, model revision, account and plan amounts", async () => {
    const m = await load();
    story(m);
    m.useAtlasStore.getState().pinModel({ id: "mdl_uma_core", revision: 1 });
    const key = () => {
      const s = m.useAtlasStore.getState();
      const model = m.findRevision(s.models, s.workingDraft.model!.id, s.workingDraft.model!.revision)!;
      return m.pendingPlanKey({ draftId: s.workingDraft.id, model, accountId: ACC, plan: plan(m, model) });
    };
    const k0 = key();
    expect(key()).toBe(k0);
    // Another alternative, another model revision, or a changed basis invalidates it.
    m.useAtlasStore.getState().duplicateDraft("B");
    expect(key()).not.toBe(k0);
    m.useAtlasStore.getState().setActiveDraft(m.useAtlasStore.getState().alternatives[0].id);
    expect(key()).toBe(k0);
    expect(m.useAtlasStore.getState().saveModel({ ...m.UMA_STRATEGY_MODEL, id: "mdl_uma_core", cashWeight: 4 })).toEqual([]);
    m.useAtlasStore.getState().pinModel({ id: "mdl_uma_core", revision: 2 });
    expect(key()).not.toBe(k0);
    m.useAtlasStore.getState().pinModel({ id: "mdl_uma_core", revision: 1 });
    expect(key()).toBe(k0);
    m.useAtlasStore.setState({ holdings: [{ ...m.UMA_CASH, nativeMarketValue: 90_000 }] });
    expect(key()).not.toBe(k0);
  });

  it("an approved sleeve needing a review stays reviewable when the model is unpinned or changed, and from another alternative", async () => {
    const m = await load();
    story(m);
    m.useAtlasStore.getState().renameActiveDraft("A");
    m.useAtlasStore.getState().pinModel({ id: "mdl_uma_core", revision: 1 });
    m.useAtlasStore.getState().addDraftEdit(purchases(m));
    approveAll(m);
    m.useAtlasStore.getState().pinModel(null);
    const needing = () => rows(m).filter((r) => r.needsReview);
    expect(needing().map((r) => [r.label, r.owner])).toEqual([["ETF Model C — Balanced ETF Model (rev 1)", null]]);
    expect(check(m, "strategy_terms").passed).toBe(false);
    // From another alternative (with a different model pinned) it is still listed, labelled with its owner.
    m.useAtlasStore.getState().duplicateDraft("B");
    for (const id of m.useAtlasStore.getState().workingDraft.memberIds) m.useAtlasStore.getState().setDraftMember(id, false);
    m.useAtlasStore.getState().pinModel({ id: "mdl_balanced", revision: 1 });
    expect(needing().map((r) => [r.label, r.owner, r.approved])).toEqual([["ETF Model C — Balanced ETF Model (rev 1)", "A", true]]);
    m.useAtlasStore.getState().recordSleeveReview(needing()[0].recommendationId, "Reviewed (synthetic).");
    expect(needing()).toEqual([]);
    expect(check(m, "strategy_terms").passed).toBe(true);
    // Approvals and revision references are unchanged.
    const recs = m.useAtlasStore.getState().recommendations.filter((r) => r.destination?.strategy && r.approvedByAdvisor);
    expect(recs.map((r) => [r.destination!.strategy!.id, r.destination!.strategy!.revision])).toEqual([["str_equity_a", 1], ["str_fixed_b", 1], ["str_etf_c", 1]]);
  });
});

describe("sleeve displays follow their own amounts and results (PR #79, round 2)", () => {
  const rowsOf = (m: M) => {
    const s = m.useAtlasStore.getState();
    const drafts = [s.workingDraft, ...s.alternatives];
    const compared = m.compareAlternatives({ holdings: normalized(m), accounts: s.accounts, recommendations: s.recommendations, drafts, fx: fx(m) });
    return m.sleeveRows({ recommendations: s.recommendations, activeId: s.workingDraft.id, alternatives: drafts, results: new Map(compared.map((c) => [c.draft.id, c.result])), approved: desk(m, "approved") });
  };

  it("a EUR 20,000 purchase at EUR/USD 2 funds USD 40,000 of a USD sleeve: shown as EUR 20,000, and it meets the USD 25,000 minimum", async () => {
    const m = await load();
    story(m);
    m.useAtlasStore.setState({ fxRates: m.useAtlasStore.getState().fxRates.map((r) => (r.base === "EUR" && r.quote === "USD" ? { ...r, rate: 2 } : r)) });
    m.useAtlasStore.getState().renameActiveDraft("A");
    const legs = purchases(m).map((r) => (r.destination!.id === A ? { ...r, currency: "EUR" as Holding["currency"], actionAmount: 20_000 } : r));
    m.useAtlasStore.getState().addDraftEdit(legs);
    approveAll(m);
    expect(desk(m).blocked).toEqual([]); // the engine converts and applies it
    m.useAtlasStore.getState().duplicateDraft("B"); // A is now another alternative; its approved sleeve is still listed
    const a = rowsOf(m).find((r) => r.owner === "A" && r.destinationId === A)!;
    expect(a).toMatchObject({ purchase: { amount: 20_000, currency: "EUR" }, funded: { amount: 40_000, currency: "USD" }, status: { kind: "met", minimum: 25_000 } });
  });

  it("A's approved USD 40,000 is never attributed to B, whose USD 20,000 commitment is blocked by the minimum, in any view", async () => {
    const m = await load();
    story(m);
    m.useAtlasStore.getState().renameActiveDraft("A");
    m.useAtlasStore.getState().addDraftEdit(purchases(m));
    approveAll(m);
    m.useAtlasStore.getState().duplicateDraft("B");
    const bLeg = m.useAtlasStore.getState().recommendations.find((r) => m.useAtlasStore.getState().workingDraft.memberIds.includes(r.id) && r.destination?.id === A)!;
    m.useAtlasStore.getState().upsertRecommendation({ ...bLeg, actionAmount: 20_000 });
    // The approved view (A's actions) does hold USD 40,000 at the shared destination ID.
    expect(desk(m, "approved").positions.find((p) => p.id === A)?.proposed).toBe(40_000);
    const r = rowsOf(m);
    const b = r.find((x) => x.owner === null && x.destinationId === A)!;
    expect(b).toMatchObject({ approved: false, funded: { amount: 0, currency: "USD" }, status: null, blockedReason: expect.stringMatching(/below its USD 25,000 minimum/) });
    expect(r.find((x) => x.owner === "A" && x.destinationId === A)).toMatchObject({ approved: true, funded: { amount: 40_000, currency: "USD" }, status: { kind: "met", minimum: 25_000 } });
  });
});
