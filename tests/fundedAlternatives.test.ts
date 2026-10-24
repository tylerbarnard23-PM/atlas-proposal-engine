import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Holding, Recommendation } from "@/domain/types";

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
  st.setAccountFunding("acc_story_invest", { cashHoldingId: "h_story_cash", reserve });
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
    m.useAtlasStore.getState().setAccountFunding("acc_story_invest", { cashHoldingId: "h_story_cash", reserve: 10_000 });
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
    m.useAtlasStore.getState().setAccountFunding("acc_story_invest", { cashHoldingId: "h_story_equity", reserve: 0 });
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
    expect(JSON.parse(storage.getItem("atlas-proposal-engine")!).version).toBe(8);
    vi.resetModules();
    m = await load();
    await m.useAtlasStore.persist.rehydrate();
    expect(snapshot(m)).toEqual(before);

    const s = m.useAtlasStore.getState();
    const text = m.serializeBackup(m.createBackup(s, NOW));
    expect(JSON.parse(text).workspaceVersion).toBe(8);
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
    const { alternatives: _a, ...e7 } = v8.engagement;
    void _a;
    const v7 = { ...v8, workspaceVersion: 7, engagement: e7 };
    const p7 = m.parseBackup(JSON.stringify(v7), ids);
    if (!p7.ok) throw new Error(p7.errors.join("; "));
    expect(p7.backup.workspaceVersion).toBe(8);
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
    expect(m.parseBackup(JSON.stringify(misplaced), ids)).toEqual({ ok: false, errors: [expect.stringMatching(/eligible cash h_story_home isn't a holding in that account/)] });
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
