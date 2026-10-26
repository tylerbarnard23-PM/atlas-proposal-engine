import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Holding, Recommendation } from "@/domain/types";

vi.mock("puppeteer-core", async () => (await import("./support/fakeChromium")).puppeteerModule);
vi.mock("@/pdf/chromiumPath", async () => (await import("./support/fakeChromium")).chromiumPathModule);

// D2 — funded alternatives. A proposed-only investment, a linked sell/buy
// replacement applied whole or not at all, an explicit eligible cash source
// with an enforced reserve, two independent named alternatives and their
// comparison, all through the shared engine, store, readiness and backup.

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

const NOW = new Date("2026-10-24T12:00:00Z");

async function load() {
  return {
    ...(await import("@/store/useStore")),
    ...(await import("@/engines/allocationDesk")),
    ...(await import("@/engines/workspaceBackup")),
    ...(await import("@/engines/normalizationEngine")),
    ...(await import("@/engines/proposalEngine")),
    ...(await import("@/engines/complianceEngine")),
    ...(await import("@/data/allocationStory")),
    ...(await import("@/domain/disclosureLibrary")),
  };
}
type M = Awaited<ReturnType<typeof load>>;

beforeEach(() => {
  vi.resetModules();
  storage.clear();
});

const BOND_B = { id: "dest_bond_b", name: "Bond ETF B", assetClass: "fixed_income" as const };

/** The story with the investment account's cash eligible and a 10,000 reserve. */
function story(m: M, reserve = 10_000) {
  m.useAtlasStore.getState().startNewClient();
  m.useAtlasStore.setState({
    client: { ...m.useAtlasStore.getState().client, fullName: "Story Household", proposalOutputCurrency: "USD" },
    accounts: m.STORY_ACCOUNTS,
    holdings: m.STORY_HOLDINGS,
    recommendations: [],
  });
  const st = m.useAtlasStore.getState();
  st.setDraftScope(["acc_story_invest"]);
  st.setAccountFunding("acc_story_invest", { cashHoldingId: "h_story_cash", reserve, reserveCurrency: "USD" });
}

const replace = (m: M, sell: number, buy: number, tag = "a", holdingId = "h_story_equity") => {
  const h = m.useAtlasStore.getState().holdings.find((x) => x.id === holdingId)!;
  return m.replacementRecommendations({ holding: h, sellAmount: sell, buyAmount: buy, destination: BOND_B, currency: "USD", ids: { sell: `rec_sell_${tag}`, buy: `rec_buy_${tag}`, group: `grp_${tag}` }, now: NOW.toISOString() });
};

function desk(m: M, draft = m.useAtlasStore.getState().workingDraft, view: "draft" | "approved" = "draft") {
  const s = m.useAtlasStore.getState();
  return m.evaluateDesk({ holdings: m.normalizeHoldings(s.holdings, s.fxRates, "USD"), accounts: s.accounts, recommendations: s.recommendations, draft, fx: { reportingCurrency: "USD", rates: s.fxRates }, view });
}
const weights = (d: ReturnType<typeof desk>) => Object.fromEntries(d.rows.map((r) => [r.assetClass, r.proposed]));
const readiness = (m: M) => {
  const s = m.useAtlasStore.getState();
  return m.evaluateWorkspaceReadiness({ client: s.client, advisor: s.advisor, accounts: s.accounts, holdings: s.holdings, recommendations: s.recommendations, disclosures: s.disclosures, fxRates: s.fxRates, sourceDocuments: s.sourceDocuments, now: NOW, drafts: [s.workingDraft, ...s.alternatives] });
};
const check = (m: M, code: string) => readiness(m).find((c) => c.code === code)!;
const approve = (m: M, ids: string[]) => {
  const st = m.useAtlasStore.getState();
  for (const id of ids) st.upsertRecommendation({ ...m.useAtlasStore.getState().recommendations.find((r) => r.id === id)!, approvedByAdvisor: true, status: "approved", includeInPdf: true });
};

describe("a linked replacement into a proposed investment", () => {
  it("sell 10,000 equity, buy 10,000 of new Bond ETF B: 50/40/10, current holdings unchanged, reserve kept", async () => {
    const m = await load();
    story(m);
    const before = structuredClone(m.useAtlasStore.getState().holdings);
    const legs = replace(m, 10_000, 10_000);
    const s = m.useAtlasStore.getState();
    const p = m.previewDraftEdit({ holdings: m.normalizeHoldings(s.holdings, s.fxRates, "USD"), accounts: s.accounts, recommendations: s.recommendations, draft: s.workingDraft, candidate: legs, fx: { reportingCurrency: "USD", rates: s.fxRates } });
    expect(p).toMatchObject({ applied: true, position: { before: 60_000, after: 50_000 }, destination: { name: "Bond ETF B", after: 10_000 }, blocked: [], shortfalls: [] });
    m.useAtlasStore.getState().addDraftEdit(legs);
    const d = desk(m);
    expect(weights(d)).toEqual({ equity: 50_000, fixed_income: 40_000, cash: 10_000 });
    expect(d.rows.map((r) => r.proposedPct)).toEqual([50, 40, 10]);
    expect(d.positions.find((x) => x.id === "dest_bond_b")).toMatchObject({ name: "Bond ETF B", current: 0, proposed: 10_000, proposedOnly: true });
    expect(d.reserves).toEqual([expect.objectContaining({ accountId: "acc_story_invest", available: 10_000, reserve: 10_000, headroom: 0, breached: false })]);
    expect(m.useAtlasStore.getState().holdings).toEqual(before);
    expect(m.useAtlasStore.getState().recommendations.every((r) => !r.approvedByAdvisor && !r.includeInPdf)).toBe(true);
  });

  it("buying 10,001 after the 10,000 sale would leave 9,999: the whole replacement is left out, in preview, draft and readiness", async () => {
    const m = await load();
    story(m);
    const legs = replace(m, 10_000, 10_001);
    m.useAtlasStore.getState().addDraftEdit(legs);
    const d = desk(m);
    expect(weights(d)).toEqual({ equity: 60_000, fixed_income: 30_000, cash: 10_000 }); // nothing half-applied
    expect(d.positions.some((x) => x.id === "dest_bond_b")).toBe(false);
    expect(d.blocked).toEqual([{ unitId: "grp_a", recommendationIds: ["rec_sell_a", "rec_buy_a"], accountId: "acc_story_invest", reason: expect.stringMatching(/USD 9,999.*below its USD 10,000 reserve/) }]);
    approve(m, ["rec_sell_a", "rec_buy_a"]);
    expect(check(m, "funding_reserves")).toMatchObject({ passed: false, detail: expect.stringMatching(/9,999/) });
    expect(check(m, "fx_available").passed).toBe(true);
    expect(check(m, "trades_funded").passed).toBe(true); // positive cash, still blocked by the reserve
  });

  it("is applied whole or not at all: a leg that can't convert, an incomplete group, or a cross-account pair blocks both legs", async () => {
    const m = await load();
    story(m);
    // The sold position has no rate: the purchase isn't applied either.
    m.useAtlasStore.setState({ holdings: m.STORY_HOLDINGS.map((h) => (h.id === "h_story_bond" ? { ...h, currency: "NOK" as Holding["currency"] } : h)) });
    m.useAtlasStore.getState().addDraftEdit(replace(m, 5_000, 5_000, "fx", "h_story_bond"));
    let d = desk(m);
    expect(d.blocked.map((b) => b.unitId)).toEqual(["grp_fx"]);
    expect(d.cash[0].proposed).toBe(10_000);
    expect(d.positions.some((x) => x.proposedOnly)).toBe(false);
    expect(d.unresolved.map((u) => u.recommendationId)).toEqual(["rec_sell_fx"]); // still visible to the FX checks

    // Only one leg included: incomplete.
    m.useAtlasStore.setState({ holdings: m.STORY_HOLDINGS });
    m.useAtlasStore.setState((s) => ({ workingDraft: { ...s.workingDraft, memberIds: ["rec_buy_fx"] } }));
    d = desk(m);
    expect(d.blocked[0].reason).toMatch(/incomplete: 1 of its 2/);
    expect(weights(d)).toEqual({ equity: 60_000, fixed_income: 30_000, cash: 10_000 });

    // Selling in one account to buy in another: unsupported, visibly.
    const [sellX, buyX] = replace(m, 1_000, 1_000, "x");
    m.useAtlasStore.getState().addDraftEdit([{ ...sellX, relatedHoldingId: "h_story_home", relatedAccountId: "acc_story_home" }, buyX]);
    expect(desk(m).blocked.find((b) => b.unitId === "grp_x")!.reason).toMatch(/across accounts isn't supported/);
  });

  it("only the chosen eligible cash funds it: no source, a cash-like fund slice and unknown availability are not spendable", async () => {
    const m = await load();
    story(m);
    m.useAtlasStore.getState().setAccountFunding("acc_story_invest", null);
    m.useAtlasStore.getState().addDraftEdit(replace(m, 10_000, 10_000));
    expect(desk(m).blocked[0].reason).toMatch(/no eligible cash source chosen/);

    // A money-market slice listed first isn't touched: offsets go to the designated line.
    const mmf: Holding = { ...m.STORY_HOLDINGS[2], id: "h_story_mmf", assetName: "Money market fund (slice)", nativeMarketValue: 5_000 };
    m.useAtlasStore.setState({ holdings: [mmf, ...m.STORY_HOLDINGS] });
    m.useAtlasStore.getState().setAccountFunding("acc_story_invest", { cashHoldingId: "h_story_cash", reserve: 10_000, reserveCurrency: "USD" });
    const sale = { ...replace(m, 3_000, 1_000, "s")[0], id: "rec_plain_sale", linked: undefined };
    m.useAtlasStore.setState((s) => ({ recommendations: [sale], workingDraft: { ...s.workingDraft, memberIds: ["rec_plain_sale"] } }));
    const d = desk(m);
    expect(d.positions.find((x) => x.id === "h_story_mmf")!.proposed).toBe(5_000);
    expect(d.positions.find((x) => x.id === "h_story_cash")!.proposed).toBe(13_000);

    // The eligible line can't be valued: availability unknown, so the reserve breaches and purchases are left out.
    m.useAtlasStore.setState({ holdings: m.STORY_HOLDINGS.map((h) => (h.id === "h_story_cash" ? { ...h, currency: "NOK" as Holding["currency"] } : h)) });
    const status = desk(m).reserves[0];
    expect(status).toMatchObject({ available: null, breached: true });
    // Funding can only point at a cash line in that account.
    m.useAtlasStore.getState().setAccountFunding("acc_story_invest", { cashHoldingId: "h_story_equity", reserve: 0, reserveCurrency: "USD" });
    expect(m.useAtlasStore.getState().accounts.find((a) => a.id === "acc_story_invest")!.funding!.cashHoldingId).toBe("h_story_cash");
  });

  it("a purchase in another currency than the eligible cash stays unresolved (no in-account conversion)", async () => {
    const m = await load();
    story(m);
    const [sell, buy] = replace(m, 1_000, 1_000);
    m.useAtlasStore.getState().addDraftEdit([sell, { ...buy, currency: "EUR", destination: { ...buy.destination!, currency: "EUR" } }]);
    expect(desk(m).blocked[0].reason).toMatch(/currency conversion inside the account isn't supported/);
  });
});

describe("two independent named alternatives", () => {
  it("duplicating copies actions with new IDs and cleared approval; editing one leaves the other and current holdings unchanged", async () => {
    const m = await load();
    story(m);
    const st = m.useAtlasStore.getState();
    st.renameActiveDraft("Alternative A");
    st.addDraftEdit(replace(m, 10_000, 10_000));
    approve(m, ["rec_sell_a", "rec_buy_a"]);
    const holdingsBefore = structuredClone(m.useAtlasStore.getState().holdings);
    st.duplicateDraft("Alternative B");
    let s = m.useAtlasStore.getState();
    const b = s.workingDraft;
    const a = s.alternatives.find((x) => x.name === "Alternative A")!;
    expect(b.name).toBe("Alternative B");
    expect(b.memberIds).toHaveLength(2);
    expect(b.memberIds.some((id) => a.memberIds.includes(id))).toBe(false);
    const copies = s.recommendations.filter((r) => b.memberIds.includes(r.id));
    expect(copies.every((r) => !r.approvedByAdvisor && !r.includeInPdf && r.status === "draft")).toBe(true);
    expect(new Set(copies.map((r) => r.linked!.groupId)).size).toBe(1);
    expect(copies[0].linked!.groupId).not.toBe("grp_a");
    expect(copies.find((r) => r.destination)!.destination!.id).toBe("dest_bond_b"); // the investment keeps its identity
    expect(weights(desk(m))).toEqual({ equity: 50_000, fixed_income: 40_000, cash: 10_000 });

    // Change B to a 5,000 replacement: B 55/35/10, A untouched.
    st.setDraftMember(copies[0].id, false);
    expect(m.useAtlasStore.getState().workingDraft.memberIds).toEqual([]); // the whole linked pair leaves
    st.addDraftEdit(replace(m, 5_000, 5_000, "b"));
    s = m.useAtlasStore.getState();
    const compared = m.compareAlternatives({ holdings: m.normalizeHoldings(s.holdings, s.fxRates, "USD"), accounts: s.accounts, recommendations: s.recommendations, drafts: [s.workingDraft, ...s.alternatives], fx: { reportingCurrency: "USD", rates: s.fxRates } });
    expect(compared.map((c) => [c.draft.name, weights(c.result)])).toEqual([
      ["Alternative B", { equity: 55_000, fixed_income: 35_000, cash: 10_000 }],
      ["Alternative A", { equity: 50_000, fixed_income: 40_000, cash: 10_000 }],
    ]);
    expect(compared.map((c) => c.result.reserves[0].headroom)).toEqual([0, 0]);
    expect(s.holdings).toEqual(holdingsBefore);
    // A's actions can't join B (each alternative's actions are its own).
    st.setDraftMember("rec_sell_a", true);
    expect(m.useAtlasStore.getState().workingDraft.memberIds).not.toContain("rec_sell_a");
    // Switching makes A active again with its own actions.
    st.setActiveDraft(a.id);
    expect(m.useAtlasStore.getState().workingDraft.name).toBe("Alternative A");
    expect(weights(desk(m))).toEqual({ equity: 50_000, fixed_income: 40_000, cash: 10_000 });
  });

  it("approvals from two alternatives can't make a final PDF; one alternative's can", async () => {
    const m = await load();
    story(m);
    const st = m.useAtlasStore.getState();
    st.renameActiveDraft("Alternative A");
    st.addDraftEdit(replace(m, 10_000, 10_000));
    st.duplicateDraft("Alternative B");
    st.setDraftMember(m.useAtlasStore.getState().workingDraft.memberIds[0], false);
    st.addDraftEdit(replace(m, 5_000, 5_000, "b"));
    approve(m, ["rec_sell_b", "rec_buy_b"]);
    expect(check(m, "approved_alternative").passed).toBe(true);
    // The approved view (the PDF's set) shows B's result.
    expect(weights(desk(m, undefined, "approved"))).toEqual({ equity: 55_000, fixed_income: 35_000, cash: 10_000 });
    approve(m, ["rec_sell_a", "rec_buy_a"]);
    expect(check(m, "approved_alternative")).toMatchObject({ passed: false, detail: expect.stringMatching(/Alternative B, Alternative A|Alternative A, Alternative B/) });
    // Approving one leg of a linked pair alone applies nothing and blocks.
    m.useAtlasStore.getState().upsertRecommendation({ ...m.useAtlasStore.getState().recommendations.find((r) => r.id === "rec_buy_a")!, approvedByAdvisor: false });
    expect(check(m, "funding_reserves").detail).toMatch(/incomplete/);
  });
});

describe("preview, saved result, reload and backup agree", () => {
  it("the alternatives, funding rule and proposed investment survive reload and a v8 backup round trip", async () => {
    let m = await load();
    story(m);
    const st = m.useAtlasStore.getState();
    st.renameActiveDraft("Alternative A");
    st.addDraftEdit(replace(m, 10_000, 10_000));
    st.duplicateDraft("Alternative B");
    st.setDraftMember(m.useAtlasStore.getState().workingDraft.memberIds[0], false);
    st.addDraftEdit(replace(m, 5_000, 5_000, "b"));
    const snapshot = (mm: M) => {
      const s = mm.useAtlasStore.getState();
      return mm.compareAlternatives({ holdings: mm.normalizeHoldings(s.holdings, s.fxRates, "USD"), accounts: s.accounts, recommendations: s.recommendations, drafts: [s.workingDraft, ...s.alternatives], fx: { reportingCurrency: "USD", rates: s.fxRates } }).map((c) => [c.draft.name, c.result.rows, c.result.reserves, c.result.blocked]);
    };
    const before = snapshot(m);
    expect(JSON.parse(storage.getItem("atlas-proposal-engine")!).version).toBe(9);
    vi.resetModules();
    m = await load();
    await m.useAtlasStore.persist.rehydrate();
    expect(snapshot(m)).toEqual(before);

    const s = m.useAtlasStore.getState();
    const text = m.serializeBackup(m.createBackup(s, NOW));
    expect(JSON.parse(text).workspaceVersion).toBe(9);
    const parsed = m.parseBackup(text, { disclosureIds: m.DISCLOSURE_LIBRARY.map((d) => d.id) });
    if (!parsed.ok) throw new Error(parsed.errors.join("; "));
    const restored = m.restoredState(parsed.backup, s, { replaceFirm: false });
    m.useAtlasStore.getState().startNewClient();
    expect(m.useAtlasStore.getState().restoreWorkspace(restored)).toEqual({ ok: true });
    expect(snapshot(m)).toEqual(before);
  });

  it("v7 and v6 backups upgrade with no alternatives; they can't carry v8 fields; a v7 store migrates idempotently", async () => {
    const m = await load();
    const st = m.useAtlasStore.getState();
    st.upsertRecommendation({ ...st.recommendations[0], approvedByAdvisor: true, status: "approved", includeInPdf: true });
    const v8 = JSON.parse(m.serializeBackup(m.createBackup(m.useAtlasStore.getState(), NOW)));
    const ids = { disclosureIds: m.DISCLOSURE_LIBRARY.map((d) => d.id) };
    const { alternatives: _a, unresolvedFunding: _f, strategies: _s, models: _m, ...e7 } = v8.engagement;
    void _a;
    void _f;
    void _s;
    void _m;
    const v7 = { ...v8, workspaceVersion: 7, engagement: e7 };
    const p7 = m.parseBackup(JSON.stringify(v7), ids);
    if (!p7.ok) throw new Error(p7.errors.join("; "));
    expect(p7.backup.workspaceVersion).toBe(9);
    expect(p7.backup.engagement.alternatives).toEqual([]);
    expect(p7.backup.engagement.workingDraft).toEqual(v8.engagement.workingDraft);
    const { workingDraft: _w, ...e6 } = e7;
    void _w;
    const p6 = m.parseBackup(JSON.stringify({ ...v8, workspaceVersion: 6, engagement: e6 }), ids);
    if (!p6.ok) throw new Error(p6.errors.join("; "));
    expect(p6.backup.engagement).toMatchObject({ alternatives: [], workingDraft: { memberIds: [st.recommendations[0].id] } });
    // A v7 file can't carry a funding rule or a D2 action.
    const withFunding = { ...v7, engagement: { ...e7, accounts: e7.accounts.map((a: { id: string }, i: number) => (i === 0 ? { ...a, funding: { cashHoldingId: "h_cash_brokerage", reserve: 1 } } : a)) } };
    expect(m.parseBackup(JSON.stringify(withFunding), ids).ok).toBe(false);
    // Store v7 → v8.
    const persisted = JSON.parse(JSON.stringify(m.useAtlasStore.getState()));
    delete persisted.alternatives;
    const migrated = m.migrateAtlasState(persisted, 7);
    expect(migrated.alternatives).toEqual([]);
    expect(migrated.recommendations).toEqual(persisted.recommendations);
    const again = m.migrateAtlasState({ ...migrated, alternatives: [migrated.workingDraft] }, 7);
    expect(again.alternatives).toHaveLength(1);
  });

  it("a backup with an action in two alternatives, or funding outside its account, is rejected", async () => {
    const m = await load();
    story(m);
    m.useAtlasStore.getState().addDraftEdit(replace(m, 10_000, 10_000));
    m.useAtlasStore.getState().duplicateDraft("B");
    const b = m.createBackup(m.useAtlasStore.getState(), NOW);
    const ids = { disclosureIds: m.DISCLOSURE_LIBRARY.map((d) => d.id) };
    const shared = { ...b, engagement: { ...b.engagement, alternatives: [{ ...b.engagement.alternatives[0], memberIds: b.engagement.workingDraft.memberIds }] } };
    expect(m.parseBackup(JSON.stringify(shared), ids)).toEqual({ ok: false, errors: expect.arrayContaining([expect.stringMatching(/more than one alternative/)]) });
    const misplaced = { ...b, engagement: { ...b.engagement, accounts: b.engagement.accounts.map((a) => (a.id === "acc_story_invest" ? { ...a, funding: { cashHoldingId: "h_story_home", reserve: 0 } } : a)) } };
    expect(m.parseBackup(JSON.stringify(misplaced), ids)).toEqual({ ok: false, errors: [expect.stringMatching(/eligible cash h_story_home isn't a cash line in that account/)] });
  });
});

describe("existing behavior is kept", () => {
  it("legacy actions on an account without a funding rule work as before, including household loan paydown funding", async () => {
    const m = await load();
    const s = m.useAtlasStore.getState();
    const hs = m.normalizeHoldings(s.holdings, s.fxRates, "USD");
    const pay: Recommendation = { ...s.recommendations.find((r) => r.id === "rec_pay_mortgage")!, actionAmount: 100_000, actionAmountUnit: "amount", approvedByAdvisor: true, status: "approved" };
    const r = m.applyRecommendationsToProposed(hs, [pay], s.accounts, { reportingCurrency: "USD", rates: s.fxRates });
    expect(r.blocked).toEqual([]);
    expect(r.holdings.find((h) => h.id === "h_mortgage")!.reportingMarketValue).toBe(-1_385_000);
    const totalCash = (list: Holding[]) => list.filter((h) => h.assetClass === "cash").reduce((a, h) => a + (h.reportingMarketValue ?? 0), 0);
    expect(totalCash(hs) - totalCash(r.holdings)).toBeCloseTo(100_000, 6);
  });
});

describe("output surfaces use the same result", () => {
  it("an approved replacement reaches the PDF's proposed allocation; the Recommendations preview defers to the desk", async () => {
    const m = await load();
    story(m);
    m.useAtlasStore.getState().addDraftEdit(replace(m, 10_000, 10_000));
    approve(m, ["rec_sell_a", "rec_buy_a"]);
    const s = m.useAtlasStore.getState();
    const React = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { ProposalPdfTemplate } = await import("@/pdf/templates/ProposalPdfTemplate");
    const html = renderToStaticMarkup(React.createElement(ProposalPdfTemplate, { client: s.client, advisor: s.advisor, accounts: s.accounts, holdings: s.holdings, recommendations: s.recommendations, sections: s.proposalSections, disclosures: s.disclosures, fxRates: s.fxRates, proposal: s.proposal, variant: "draft", now: NOW.toISOString(), timeZone: "UTC" }));
    const text = html.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    expect(text).not.toMatch(/NaN|undefined/);
    // Proposed: fixed income 40% (Bond ETF A 30,000 + new Bond ETF B 10,000) of the 500,000 household.
    expect(weights(desk(m, undefined, "approved"))).toEqual({ equity: 50_000, fixed_income: 40_000, cash: 10_000 });
    expect(text).toMatch(/Fixed Income[^%]*8\.0%/);
    const { previewRecommendation } = await import("@/engines/recommendationPreview");
    const p = previewRecommendation({ rec: s.recommendations.find((r) => r.id === "rec_buy_a")!, holdings: m.normalizeHoldings(s.holdings, s.fxRates, "USD"), recommendations: s.recommendations, accounts: s.accounts, fx: { reportingCurrency: "USD", rates: s.fxRates }, sourceDocuments: [] });
    expect(p.state).toBe("linked");
  });
});

describe("review boundaries (PR #75)", () => {
  it("an oversized linked sale is left out whole: no proceeds beyond the position, no false completion, in preview and draft", async () => {
    const m = await load();
    story(m);
    const s = m.useAtlasStore.getState();
    const legs = replace(m, 70_000, 60_000); // the position is 60,000
    const p = m.previewDraftEdit({ holdings: m.normalizeHoldings(s.holdings, s.fxRates, "USD"), accounts: s.accounts, recommendations: s.recommendations, draft: s.workingDraft, candidate: legs, fx: { reportingCurrency: "USD", rates: s.fxRates } });
    expect(p.applied).toBe(false);
    expect(p.destination).toMatchObject({ after: null });
    expect(p.blocked).toEqual([expect.objectContaining({ unitId: "grp_a", reason: expect.stringMatching(/USD 70,000.*more than.*USD 60,000/) })]);
    m.useAtlasStore.getState().addDraftEdit(legs);
    expect(weights(desk(m))).toEqual({ equity: 60_000, fixed_income: 30_000, cash: 10_000 });
    approve(m, ["rec_sell_a", "rec_buy_a"]);
    expect(check(m, "funding_reserves")).toMatchObject({ passed: false, detail: expect.stringMatching(/more than/) });
  });

  it("the sale is checked against the position after earlier actions in the draft", async () => {
    const m = await load();
    story(m);
    const h = m.useAtlasStore.getState().holdings.find((x) => x.id === "h_story_equity")!;
    m.useAtlasStore.getState().addDraftEdit(m.positionEditRecommendation({ holding: h, kind: "reduce", amount: 20_000, reportingCurrency: "USD", id: "rec_trim", now: NOW.toISOString() }));
    m.useAtlasStore.getState().addDraftEdit(replace(m, 50_000, 50_000)); // only 40,000 is left
    const d = desk(m);
    expect(d.blocked.map((b) => b.unitId)).toEqual(["grp_a"]);
    expect(weights(d)).toEqual({ equity: 40_000, fixed_income: 30_000, cash: 30_000 }); // the trim alone
    // Exactly the remaining 40,000 applies.
    m.useAtlasStore.getState().setDraftMember("rec_sell_a", false);
    m.useAtlasStore.getState().addDraftEdit(replace(m, 40_000, 40_000, "c"));
    expect(weights(desk(m))).toEqual({ equity: 0, fixed_income: 70_000, cash: 30_000 });
  });

  it("the reserve is in the eligible cash's own currency, with the boundary exact after conversion", async () => {
    const m = await load();
    story(m, 10_000);
    m.useAtlasStore.setState({ holdings: m.STORY_HOLDINGS.map((h) => (h.id === "h_story_cash" ? { ...h, currency: "EUR" as Holding["currency"] } : h)) });
    // The line is now EUR: the reserve is restated in EUR (a USD reserve isn't relabelled).
    m.useAtlasStore.getState().setAccountFunding("acc_story_invest", { cashHoldingId: "h_story_cash", reserve: 10_000, reserveCurrency: "EUR" });
    const eur = (sell: number, buy: number, tag: string) => {
      const h = m.useAtlasStore.getState().holdings.find((x) => x.id === "h_story_equity")!;
      return m.replacementRecommendations({ holding: h, sellAmount: sell, buyAmount: buy, destination: BOND_B, currency: "EUR", ids: { sell: `rec_sell_${tag}`, buy: `rec_buy_${tag}`, group: `grp_${tag}` }, now: NOW.toISOString() });
    };
    // EUR 10,000 cash (USD 10,850) against a EUR 10,000 reserve: headroom 0, not USD 850.
    expect(desk(m).reserves[0]).toMatchObject({ currency: "EUR", available: 10_000, headroom: 0, breached: false });
    m.useAtlasStore.getState().addDraftEdit(eur(10_000, 10_000, "a"));
    let d = desk(m);
    expect(d.blocked).toEqual([]);
    expect(d.reserves[0].headroom).toBeCloseTo(0, 6);
    m.useAtlasStore.getState().setDraftMember("rec_sell_a", false);
    m.useAtlasStore.getState().addDraftEdit(eur(10_000, 10_001, "b"));
    d = desk(m);
    expect(d.blocked).toEqual([expect.objectContaining({ unitId: "grp_b", reason: expect.stringMatching(/EUR 9,999.*below its EUR 10,000 reserve/) })]);
    // A EUR 10,500 reserve is breached by EUR 10,000 even though the cash is worth USD 10,850.
    m.useAtlasStore.getState().setAccountFunding("acc_story_invest", { cashHoldingId: "h_story_cash", reserve: 10_500, reserveCurrency: "EUR" });
    expect(desk(m).reserves[0]).toMatchObject({ available: 10_000, breached: true });
  });

  it("the final-PDF route enforces the reserve and the one-alternative rule on the server", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    try {
      const m = await load();
      story(m);
      const st = m.useAtlasStore.getState();
      st.renameActiveDraft("Alternative A");
      st.addDraftEdit(replace(m, 10_000, 10_000));
      approve(m, ["rec_sell_a", "rec_buy_a"]);
      const { POST } = await import("@/app/api/proposals/[id]/generate-pdf/route");
      const post = async () => {
        const s = JSON.parse(JSON.stringify(m.useAtlasStore.getState()));
        const state = { client: s.client, advisor: s.advisor, accounts: s.accounts, holdings: s.holdings, recommendations: s.recommendations, sections: s.proposal.sections, disclosures: s.disclosures, proposal: s.proposal, fxRates: s.fxRates, sourceDocuments: [], fxConfirmation: null, workingDraft: s.workingDraft, alternatives: s.alternatives };
        const res = await POST(new Request("http://localhost/api/proposals/p1/generate-pdf?variant=final", { method: "POST", body: JSON.stringify({ state }) }), { params: Promise.resolve({ id: "p1" }) });
        return res.status === 422 ? ((await res.json()).failing as string[]) : [];
      };
      const FUNDING = "Linked replacements applied whole and cash reserves kept";
      const ONE = "Approved actions come from one alternative";
      expect(await post()).not.toContain(FUNDING); // headroom exactly 0
      m.useAtlasStore.getState().setAccountFunding("acc_story_invest", { cashHoldingId: "h_story_cash", reserve: 10_000.01, reserveCurrency: "USD" });
      expect(await post()).toContain(FUNDING);
      m.useAtlasStore.getState().setAccountFunding("acc_story_invest", { cashHoldingId: "h_story_cash", reserve: 10_000, reserveCurrency: "USD" });
      m.useAtlasStore.getState().duplicateDraft("Alternative B");
      approve(m, m.useAtlasStore.getState().workingDraft.memberIds);
      expect(await post()).toContain(ONE);
    } finally {
      vi.useRealTimers();
    }
  });

  it("Copilot's readiness sees the alternatives, as the PDF route does", async () => {
    const m = await load();
    story(m);
    const st = m.useAtlasStore.getState();
    st.addDraftEdit(replace(m, 10_000, 10_000));
    approve(m, ["rec_sell_a", "rec_buy_a"]);
    st.duplicateDraft("Alternative B");
    approve(m, m.useAtlasStore.getState().workingDraft.memberIds);
    const s = JSON.parse(JSON.stringify(m.useAtlasStore.getState()));
    const { parseCopilotRequest } = await import("@/copilot/snapshot");
    const { CopilotContext, executeTool } = await import("@/copilot/tools");
    const parsed = parseCopilotRequest({ question: "ready?", snapshot: { client: s.client, advisor: s.advisor, accounts: s.accounts, holdings: s.holdings, fxRates: s.fxRates, recommendations: s.recommendations, disclosures: s.disclosures, workingDraft: s.workingDraft, alternatives: s.alternatives } });
    if (!parsed.ok) throw new Error(parsed.error);
    const out = JSON.parse(executeTool(new CopilotContext(parsed.value.snapshot), "check_proposal_readiness", {}).content);
    expect(out.checks.find((c: { check: string }) => c.check === "Approved actions come from one alternative")).toMatchObject({ passed: false });
  });

  it("eligible cash that is no longer a cash line (reclassified, or in a backup) is never spent", async () => {
    const m = await load();
    story(m, 0);
    // The chosen line is reclassified as a fund after the rule was set.
    m.useAtlasStore.getState().patchHolding("h_story_cash", { assetClass: "fixed_income" });
    m.useAtlasStore.getState().addDraftEdit(replace(m, 10_000, 10_001));
    const d = desk(m);
    expect(d.blocked).toEqual([expect.objectContaining({ unitId: "grp_a", reason: expect.stringMatching(/eligible cash .* is no longer a cash line/) })]);
    expect(d.positions.some((x) => x.id === "dest_bond_b")).toBe(false);
    expect(d.reserves[0]).toMatchObject({ available: null, breached: true });
    // A backup can't name a non-cash line as eligible cash either.
    story(m);
    const b = m.createBackup(m.useAtlasStore.getState(), NOW);
    const bad = { ...b, engagement: { ...b.engagement, accounts: b.engagement.accounts.map((a) => (a.id === "acc_story_invest" ? { ...a, funding: { cashHoldingId: "h_story_bond", reserve: 0 } } : a)) } };
    expect(m.parseBackup(JSON.stringify(bad), { disclosureIds: m.DISCLOSURE_LIBRARY.map((x) => x.id) })).toEqual({ ok: false, errors: [expect.stringMatching(/h_story_bond isn't a cash line/)] });
  });

  it("export, restore and reload keep approvals, blocked units, funding and readiness", async () => {
    let m = await load();
    story(m);
    const st = m.useAtlasStore.getState();
    st.renameActiveDraft("Alternative A");
    st.addDraftEdit(replace(m, 10_000, 10_000));
    st.addDraftEdit(replace(m, 1_000, 1_001, "x")); // breaches the reserve: left out whole
    approve(m, ["rec_sell_a", "rec_buy_a", "rec_sell_x", "rec_buy_x"]);
    st.duplicateDraft("Alternative B");
    const state = (mm: M) => {
      const s = mm.useAtlasStore.getState();
      const r = mm.evaluateWorkspaceReadiness({ client: s.client, advisor: s.advisor, accounts: s.accounts, holdings: s.holdings, recommendations: s.recommendations, disclosures: s.disclosures, fxRates: s.fxRates, sourceDocuments: s.sourceDocuments, now: NOW, drafts: [s.workingDraft, ...s.alternatives] });
      return { approved: desk(mm, undefined, "approved"), draft: desk(mm), alternatives: s.alternatives.map((a) => [a.id, a.name, a.memberIds]), active: [s.workingDraft.id, s.workingDraft.memberIds], funding: s.accounts.map((a) => a.funding ?? null), checks: r.map((c) => [c.code, c.passed, c.detail ?? null]) };
    };
    const before = state(m);
    expect(before.approved.blocked.map((b) => b.unitId)).toEqual(["grp_x"]);
    const text = m.serializeBackup(m.createBackup(m.useAtlasStore.getState(), NOW));
    const parsed = m.parseBackup(text, { disclosureIds: m.DISCLOSURE_LIBRARY.map((d) => d.id) });
    if (!parsed.ok) throw new Error(parsed.errors.join("; "));
    m.useAtlasStore.getState().startNewClient();
    expect(m.useAtlasStore.getState().restoreWorkspace(m.restoredState(parsed.backup, m.useAtlasStore.getState(), { replaceFirm: false }))).toEqual({ ok: true });
    vi.resetModules();
    m = await load();
    await m.useAtlasStore.persist.rehydrate();
    expect(state(m)).toEqual(before);
  });
});

describe("an explicit funding rule never falls back to other cash (PR #75)", () => {
  /** The story with a second, valued cash line in the investment account. */
  function twoCash(m: M) {
    story(m, 0);
    const cash = m.useAtlasStore.getState().holdings.find((h) => h.id === "h_story_cash")!;
    m.useAtlasStore.getState().upsertHolding({ ...cash, id: "h_story_cash2", assetName: "Second deposit", nativeMarketValue: 5_000 });
  }
  const increase = (m: M, amount = 1_000, id = "rec_inc") => {
    const h = m.useAtlasStore.getState().holdings.find((x) => x.id === "h_story_equity")!;
    m.useAtlasStore.getState().addDraftEdit(m.positionEditRecommendation({ holding: h, kind: "increase", amount, reportingCurrency: "USD", id, now: NOW.toISOString() }));
  };
  const at = (d: ReturnType<typeof desk>, id: string) => d.positions.find((p) => p.id === id)?.proposed ?? null;
  const unchanged = (m: M, reason: RegExp) => {
    const d = desk(m);
    expect(at(d, "h_story_equity")).toBe(60_000);
    expect(at(d, "h_story_cash2")).toBe(5_000);
    expect(d.positions.some((p) => p.synthetic)).toBe(false);
    expect(d.unresolved).toEqual([]); // not disguised as missing FX
    expect(d.blocked).toEqual([expect.objectContaining({ recommendationIds: ["rec_inc"], accountId: "acc_story_invest", reason: expect.stringMatching(reason) })]);
    approve(m, ["rec_inc"]);
    expect(check(m, "funding_reserves")).toMatchObject({ passed: false, detail: expect.stringMatching(reason) });
    expect(check(m, "fx_available").passed).toBe(true);
  };

  it("removed designated cash: an increase isn't funded from the other cash line or a new one", async () => {
    const m = await load();
    twoCash(m);
    m.useAtlasStore.getState().removeHolding("h_story_cash");
    increase(m);
    unchanged(m, /eligible cash h_story_cash was removed/);
  });

  it("the Recommendations preview says the action can't be funded, not that a rate is missing", async () => {
    const m = await load();
    twoCash(m);
    m.useAtlasStore.getState().removeHolding("h_story_cash");
    increase(m);
    const s = m.useAtlasStore.getState();
    const { previewRecommendation } = await import("@/engines/recommendationPreview");
    const p = previewRecommendation({ rec: s.recommendations.find((r) => r.id === "rec_inc")!, holdings: m.normalizeHoldings(s.holdings, s.fxRates, "USD"), recommendations: s.recommendations, accounts: s.accounts, fx: { reportingCurrency: "USD", rates: s.fxRates }, sourceDocuments: [] });
    expect(p.state).toBe("cannot_apply");
    expect(p.warnings[0]).toMatchObject({ kind: "funding", blocksFinal: true, message: expect.stringMatching(/was removed/) });
  });

  it("reclassified designated cash: the same", async () => {
    const m = await load();
    twoCash(m);
    m.useAtlasStore.getState().patchHolding("h_story_cash", { assetClass: "fixed_income" });
    increase(m);
    unchanged(m, /eligible cash h_story_cash is no longer a cash line/);
  });

  it("designated cash that can't be valued doesn't authorize spending another valued line", async () => {
    const m = await load();
    twoCash(m);
    m.useAtlasStore.getState().patchHolding("h_story_cash", { currency: "NOK" as Holding["currency"] });
    m.useAtlasStore.getState().setAccountFunding("acc_story_invest", { cashHoldingId: "h_story_cash", reserve: 0, reserveCurrency: "NOK" as Holding["currency"] });
    increase(m);
    unchanged(m, /eligible cash Cash can't be valued/);
  });

  it("a valid designated source alone funds the action and takes its proceeds", async () => {
    const m = await load();
    twoCash(m);
    increase(m, 1_000);
    let d = desk(m);
    expect([at(d, "h_story_equity"), at(d, "h_story_cash"), at(d, "h_story_cash2")]).toEqual([61_000, 9_000, 5_000]);
    m.useAtlasStore.getState().setDraftMember("rec_inc", false);
    const h = m.useAtlasStore.getState().holdings.find((x) => x.id === "h_story_equity")!;
    m.useAtlasStore.getState().addDraftEdit(m.positionEditRecommendation({ holding: h, kind: "reduce", amount: 2_000, reportingCurrency: "USD", id: "rec_red", now: NOW.toISOString() }));
    d = desk(m);
    expect([at(d, "h_story_equity"), at(d, "h_story_cash"), at(d, "h_story_cash2")]).toEqual([58_000, 12_000, 5_000]);
    expect(d.blocked).toEqual([]);
  });

  it("without a funding rule, the first cash line funds it as before", async () => {
    const m = await load();
    twoCash(m);
    m.useAtlasStore.getState().setAccountFunding("acc_story_invest", null);
    m.useAtlasStore.getState().removeHolding("h_story_cash");
    increase(m);
    const d = desk(m);
    expect([at(d, "h_story_equity"), at(d, "h_story_cash2")]).toEqual([61_000, 4_000]);
    expect(d.blocked).toEqual([]);
  });

  it("household loan paydown draws only on an account's valid eligible cash; accounts without rules are unchanged", async () => {
    const m = await load();
    const st = m.useAtlasStore.getState();
    const brokerageCash = st.holdings.find((h) => h.id === "h_cash_brokerage")!;
    st.upsertHolding({ ...brokerageCash, id: "h_cash_brokerage2", assetName: "Second brokerage deposit", nativeMarketValue: 300_000 });
    const pay = (amount = 100_000, s = m.useAtlasStore.getState()) => {
      const rec = { ...s.recommendations.find((r) => r.id === "rec_pay_mortgage")!, actionAmount: amount, actionAmountUnit: "amount" as const };
      const r = m.applyRecommendationsToProposed(m.normalizeHoldings(s.holdings, s.fxRates, "USD"), [rec], s.accounts, { reportingCurrency: "USD", rates: s.fxRates });
      const v = (id: string) => r.holdings.find((h) => h.id === id)?.reportingMarketValue ?? null;
      return { r, v };
    };
    // No rule: the largest cash line's account is drawn first (the existing behavior).
    let { r, v } = pay();
    expect(v("h_mortgage")).toBe(-1_385_000);
    expect(v("h_cash_brokerage2")! + v("h_cash_brokerage")!).toBeCloseTo(184_200 + 300_000 - 100_000, 6);
    // A valid rule: only the designated line is available (184,200 of a 250,000 paydown); the rest comes from other accounts.
    m.useAtlasStore.getState().setAccountFunding("acc_brokerage_us", { cashHoldingId: "h_cash_brokerage", reserve: 0, reserveCurrency: "USD" });
    ({ r, v } = pay(250_000));
    expect([v("h_mortgage"), v("h_cash_brokerage"), v("h_cash_brokerage2")]).toEqual([-1_235_000, 0, 300_000]);
    // The designated line removed: the brokerage account isn't drawn at all.
    m.useAtlasStore.getState().removeHolding("h_cash_brokerage");
    ({ r, v } = pay());
    expect(v("h_cash_brokerage2")).toBe(300_000);
    expect(v("h_mortgage")).toBe(-1_385_000);
    expect(r.unresolved).toEqual([]);
  });
});

describe("a reserve keeps its currency basis (PR #75)", () => {
  /** The story (USD cash, USD 5,000 reserve) with a EUR deposit in the same account. */
  function withEur(m: M) {
    story(m, 5_000);
    const cash = m.useAtlasStore.getState().holdings.find((h) => h.id === "h_story_cash")!;
    m.useAtlasStore.getState().upsertHolding({ ...cash, id: "h_story_eur", assetName: "EUR deposit", currency: "EUR" as Holding["currency"], nativeMarketValue: 9_000 });
  }
  const funding = (m: M) => m.useAtlasStore.getState().accounts.find((a) => a.id === "acc_story_invest")!.funding;
  const increase = (m: M, amount: number) => {
    const h = m.useAtlasStore.getState().holdings.find((x) => x.id === "h_story_equity")!;
    m.useAtlasStore.getState().addDraftEdit(m.positionEditRecommendation({ holding: h, kind: "increase", amount, reportingCurrency: "USD", id: "rec_inc", now: NOW.toISOString() }));
  };

  it("a USD reserve can't be saved, untouched, against a EUR source; the pending reserve must be restated", async () => {
    const m = await load();
    withEur(m);
    expect(funding(m)).toEqual({ cashHoldingId: "h_story_cash", reserve: 5_000, reserveCurrency: "USD" });
    // The store refuses a reserve whose stated currency isn't the source's.
    m.useAtlasStore.getState().setAccountFunding("acc_story_invest", { cashHoldingId: "h_story_eur", reserve: 5_000, reserveCurrency: "USD" });
    expect(funding(m)).toEqual({ cashHoldingId: "h_story_cash", reserve: 5_000, reserveCurrency: "USD" });
    // The control starts a EUR source with no reserve (nothing relabelled); the saved USD source keeps its number.
    expect(m.pendingReserveText(funding(m), "EUR")).toBe("");
    expect(m.pendingReserveText(funding(m), "USD")).toBe("5000");
  });

  it("an explicitly entered EUR reserve saves and is enforced in EUR", async () => {
    const m = await load();
    withEur(m);
    m.useAtlasStore.getState().setAccountFunding("acc_story_invest", { cashHoldingId: "h_story_eur", reserve: 8_000, reserveCurrency: "EUR" });
    expect(funding(m)).toEqual({ cashHoldingId: "h_story_eur", reserve: 8_000, reserveCurrency: "EUR" });
    expect(desk(m).reserves[0]).toMatchObject({ currency: "EUR", reserveCurrency: "EUR", available: 9_000, headroom: 1_000, breached: false });
    increase(m, 2_170); // EUR 2,000 at 1.085
    const d = desk(m);
    expect(d.reserves[0].available).toBeCloseTo(7_000, 6);
    expect(d.reserves[0].breached).toBe(true);
    approve(m, ["rec_inc"]);
    expect(check(m, "funding_reserves")).toMatchObject({ passed: false, detail: expect.stringMatching(/EUR 7,000 is below its EUR 8,000 reserve/) });
  });

  it("a reserve with no recorded currency is shown as unknown and must be restated; nothing is guessed", async () => {
    const m = await load();
    withEur(m);
    // A rule saved before reserves carried a currency (an earlier v8 build).
    m.useAtlasStore.setState({ accounts: m.useAtlasStore.getState().accounts.map((a) => (a.id === "acc_story_invest" ? { ...a, funding: { cashHoldingId: "h_story_cash", reserve: 5_000 } } : a)) });
    m.useAtlasStore.getState().removeHolding("h_story_cash");
    expect(desk(m).reserves[0]).toMatchObject({ problem: "removed", reserveCurrency: null, reserve: 5_000 });
    expect(check(m, "funding_reserves").detail).toMatch(/reserve 5,000 \(currency unknown\) kept/);
    expect(m.pendingReserveText(funding(m), "USD")).toBe("");
    expect(m.pendingReserveText(funding(m), "EUR")).toBe("");
    // The same with the source still present: unresolved until restated.
    m.useAtlasStore.setState({ accounts: m.useAtlasStore.getState().accounts.map((a) => (a.id === "acc_story_invest" ? { ...a, funding: { cashHoldingId: "h_story_eur", reserve: 5_000 } } : a)) });
    expect(desk(m).reserves[0]).toMatchObject({ problem: "reserve_currency", breached: true });
    m.useAtlasStore.getState().setAccountFunding("acc_story_invest", { cashHoldingId: "h_story_eur", reserve: 4_000, reserveCurrency: "EUR" });
    expect(desk(m).reserves[0]).toMatchObject({ problem: null, breached: false, headroom: 5_000 });
  });

  it("changing the designated line's native or approved currency leaves the reserve unresolved until restated", async () => {
    const m = await load();
    withEur(m);
    increase(m, 1_000);
    m.useAtlasStore.getState().patchHolding("h_story_cash", { currency: "EUR" as Holding["currency"] });
    let d = desk(m);
    expect(d.reserves[0]).toMatchObject({ problem: "reserve_currency", reserveCurrency: "USD", reserve: 5_000, breached: true });
    expect(d.blocked).toEqual([expect.objectContaining({ recommendationIds: ["rec_inc"], reason: expect.stringMatching(/valued in EUR, but its reserve was set in USD/) })]);
    expect(funding(m)).toEqual({ cashHoldingId: "h_story_cash", reserve: 5_000, reserveCurrency: "USD" }); // never relabelled
    // An approved value in another currency is a change of basis too.
    m.useAtlasStore.getState().patchHolding("h_story_cash", { currency: "USD" as Holding["currency"], proposalApprovedValue: { amount: 9_000, currency: "EUR", source: { kind: "statement", asOf: NOW.toISOString(), confidence: "high" } } as Holding["proposalApprovedValue"] });
    expect(desk(m).reserves[0].problem).toBe("reserve_currency");
    // Restated in EUR: resolved, and the increase is funded again.
    m.useAtlasStore.getState().setAccountFunding("acc_story_invest", { cashHoldingId: "h_story_cash", reserve: 4_000, reserveCurrency: "EUR" });
    d = desk(m);
    expect(d.reserves[0]).toMatchObject({ problem: null, reserveCurrency: "EUR" });
    expect(d.blocked).toEqual([]);
  });

  it("save, reload, export and restore keep the reserve basis and the unresolved state", async () => {
    let m = await load();
    withEur(m);
    m.useAtlasStore.getState().patchHolding("h_story_cash", { currency: "EUR" as Holding["currency"] });
    const before = JSON.parse(JSON.stringify(m.useAtlasStore.getState().accounts));
    vi.resetModules();
    m = await load();
    await m.useAtlasStore.persist.rehydrate();
    expect(m.useAtlasStore.getState().accounts).toEqual(before);
    const s = m.useAtlasStore.getState();
    const exported = m.exportBackup(s, NOW, { disclosureIds: m.DISCLOSURE_LIBRARY.map((d) => d.id) });
    if (!exported.ok) throw new Error(exported.errors.join("; "));
    const file = JSON.parse(exported.text);
    expect(file.engagement.accounts.find((a: { id: string }) => a.id === "acc_story_invest").funding).toEqual({ cashHoldingId: "h_story_cash", reserve: 5_000, reserveCurrency: "USD" });
    expect(file.engagement.unresolvedFunding).toEqual([{ accountId: "acc_story_invest", cashHoldingId: "h_story_cash", reason: "reserve_currency" }]);
    // A false declaration is still rejected.
    const lie = structuredClone(file);
    lie.engagement.unresolvedFunding = [];
    expect(m.parseBackup(JSON.stringify(lie), { disclosureIds: m.DISCLOSURE_LIBRARY.map((d) => d.id) }).ok).toBe(false);
    const parsed = m.parseBackup(exported.text, { disclosureIds: m.DISCLOSURE_LIBRARY.map((d) => d.id) });
    if (!parsed.ok) throw new Error(parsed.errors.join("; "));
    m.useAtlasStore.getState().startNewClient();
    expect(m.useAtlasStore.getState().restoreWorkspace(m.restoredState(parsed.backup, s, { replaceFirm: false }))).toEqual({ ok: true });
    vi.resetModules();
    m = await load();
    await m.useAtlasStore.persist.rehydrate();
    expect(m.useAtlasStore.getState().accounts).toEqual(before);
    expect(check(m, "funding_reserves")).toMatchObject({ passed: false, detail: expect.stringMatching(/reserve was set in USD/) });
  });
});
