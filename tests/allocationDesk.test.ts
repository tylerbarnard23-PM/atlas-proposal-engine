import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Holding, Recommendation } from "@/domain/types";

// D1 — the working allocation desk. Scope, the current/proposed/target grid,
// one working draft (membership separate from approval and PDF prose),
// explicit position edits through the shared engine, the recorded input basis,
// and persistence through reload and backup. The store runs against an
// in-memory localStorage so saving and reloading are exercised for real.

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

const KEY = "atlas-proposal-engine";
const NOW = new Date("2026-10-24T12:00:00Z");

async function load() {
  return {
    ...(await import("@/store/useStore")),
    ...(await import("@/engines/allocationDesk")),
    ...(await import("@/engines/workspaceBackup")),
    ...(await import("@/engines/normalizationEngine")),
    ...(await import("@/engines/proposalEngine")),
    ...(await import("@/engines/complianceEngine")),
    ...(await import("@/engines/recommendationPreview")),
    ...(await import("@/data/allocationStory")),
    ...(await import("@/domain/disclosureLibrary")),
  };
}
type M = Awaited<ReturnType<typeof load>>;

beforeEach(() => {
  vi.resetModules();
  storage.clear();
});

/** The synthetic acceptance story as the whole workspace. */
function story(m: M) {
  const s = m.useAtlasStore.getState();
  s.startNewClient();
  m.useAtlasStore.setState({
    client: { ...m.useAtlasStore.getState().client, fullName: "Story Household", proposalOutputCurrency: "USD" },
    accounts: m.STORY_ACCOUNTS,
    holdings: m.STORY_HOLDINGS,
    recommendations: [],
  });
}

function desk(m: M, view: "draft" | "approved" = "draft") {
  const s = m.useAtlasStore.getState();
  const ccy = s.client.proposalOutputCurrency;
  return m.evaluateDesk({
    holdings: m.normalizeHoldings(s.holdings, s.fxRates, ccy),
    accounts: s.accounts,
    recommendations: s.recommendations,
    draft: s.workingDraft,
    fx: { reportingCurrency: ccy, rates: s.fxRates, now: NOW },
    view,
  });
}
const row = (d: ReturnType<typeof desk>, c: string) => d.rows.find((r) => r.assetClass === c)!;
const readiness = (m: M) => {
  const s = m.useAtlasStore.getState();
  return m.evaluateWorkspaceReadiness({ client: s.client, advisor: s.advisor, accounts: s.accounts, holdings: s.holdings, recommendations: s.recommendations, disclosures: s.disclosures, fxRates: s.fxRates, sourceDocuments: s.sourceDocuments, fxConfirmation: s.fxConfirmation, now: NOW });
};
const edit = (m: M, holdingId: string, kind: "reduce" | "exit" | "increase", amount?: number, id = `rec_${kind}_${holdingId}`) => {
  const h = m.useAtlasStore.getState().holdings.find((x) => x.id === holdingId)!;
  return m.positionEditRecommendation({ holding: h, kind, amount, reportingCurrency: "USD", id, now: NOW.toISOString() });
};

describe("the acceptance story", () => {
  it("household 500,000; the selected investment account (100,000) is the denominator: 60/30/10", async () => {
    const m = await load();
    story(m);
    m.useAtlasStore.getState().setDraftScope(["acc_story_invest"]);
    const d = desk(m);
    expect(d.householdAssets).toBe(500_000);
    expect(d.context).toEqual({ accounts: [{ id: "acc_story_home", name: "Story — Primary Residence", value: 400_000 }], total: 400_000 });
    expect(d.totals).toEqual({ current: 100_000, proposed: 100_000 });
    expect(d.rows.map((r) => [r.assetClass, r.current, r.currentPct])).toEqual([["equity", 60_000, 60], ["fixed_income", 30_000, 30], ["cash", 10_000, 10]]);
    expect(d.cash).toEqual([{ accountId: "acc_story_invest", accountName: "Story — Investment Account", current: 10_000, proposed: 10_000 }]);
  });

  it("a 50/40/10 target creates no trade: drift is shown, nothing else changes", async () => {
    const m = await load();
    story(m);
    const st = m.useAtlasStore.getState();
    st.setDraftScope(["acc_story_invest"]);
    const before = structuredClone({ holdings: m.useAtlasStore.getState().holdings, recommendations: m.useAtlasStore.getState().recommendations });
    st.setDraftTarget("equity", 50);
    st.setDraftTarget("fixed_income", 40);
    st.setDraftTarget("cash", 10);
    const after = m.useAtlasStore.getState();
    expect({ holdings: after.holdings, recommendations: after.recommendations }).toEqual(before);
    expect(after.workingDraft.memberIds).toEqual([]);
    const d = desk(m);
    expect(d.targetSum).toBe(100);
    expect(d.actions).toEqual([]);
    expect(d.totals.proposed).toBe(100_000);
    expect([row(d, "equity").drift, row(d, "equity").driftPts]).toEqual([10_000, 10]);
    expect([row(d, "fixed_income").drift, row(d, "fixed_income").driftPts]).toEqual([-10_000, -10]);
    expect([row(d, "cash").drift, row(d, "cash").driftPts]).toEqual([0, 0]);
    // Invalid targets are refused rather than clamped.
    st.setDraftTarget("equity", 120);
    st.setDraftTarget("equity", -5);
    expect(m.useAtlasStore.getState().workingDraft.targets.equity).toBe(50);
  });

  it("an explicit sale of 10,000 previews 50/30/20 with actual cash 20,000; current holdings and approvals don't change", async () => {
    const m = await load();
    story(m);
    const st = m.useAtlasStore.getState();
    st.setDraftScope(["acc_story_invest"]);
    st.setDraftTarget("equity", 50);
    st.setDraftTarget("fixed_income", 40);
    st.setDraftTarget("cash", 10);
    const holdingsBefore = structuredClone(m.useAtlasStore.getState().holdings);
    const gatesBefore = readiness(m).map((c) => [c.code, c.passed]);

    const rec = edit(m, "h_story_equity", "reduce", 10_000);
    // The shared preview shows the same effect before anything is saved.
    const s0 = m.useAtlasStore.getState();
    const preview = m.previewRecommendation({ rec, holdings: m.normalizeHoldings(s0.holdings, s0.fxRates, "USD"), recommendations: s0.recommendations, accounts: s0.accounts, fx: { reportingCurrency: "USD", rates: s0.fxRates }, sourceDocuments: [] });
    expect(preview.standalone!.position).toMatchObject({ before: 60_000, after: 50_000 });
    expect(preview.standalone!.cash.map((c) => [c.holdingId, c.before, c.after])).toEqual([["h_story_cash", 10_000, 20_000]]);

    st.addDraftEdit(rec);
    const s = m.useAtlasStore.getState();
    expect(s.holdings).toEqual(holdingsBefore);
    const saved = s.recommendations.find((r) => r.id === rec.id)!;
    expect(saved).toMatchObject({ approvedByAdvisor: false, includeInPdf: false, status: "draft", type: "reduce", actionAmount: 10_000, actionAmountUnit: "amount", relatedHoldingId: "h_story_equity" });
    expect(s.workingDraft.memberIds).toEqual([rec.id]);

    const d = desk(m);
    expect(d.rows.map((r) => [r.assetClass, r.current, r.proposed, r.proposedPct])).toEqual([["equity", 60_000, 50_000, 50], ["fixed_income", 30_000, 30_000, 30], ["cash", 10_000, 20_000, 20]]);
    expect(d.cash[0]).toMatchObject({ current: 10_000, proposed: 20_000 });
    expect([row(d, "equity").drift, row(d, "fixed_income").drift, row(d, "cash").drift]).toEqual([0, -10_000, 10_000]);
    expect(d.unapprovedInDraft.map((r) => r.id)).toEqual([rec.id]);
    // The approved subset (the final-PDF inputs) is untouched, and so is readiness.
    const approved = desk(m, "approved");
    expect(approved.actions).toEqual([]);
    expect(approved.rows.map((r) => r.proposed)).toEqual([60_000, 30_000, 10_000]);
    expect(readiness(m).map((c) => [c.code, c.passed])).toEqual(gatesBefore);
  });

  it("an explicit full exit and an unfunded purchase go through the same engine and its shortfall rule", async () => {
    const m = await load();
    story(m);
    const st = m.useAtlasStore.getState();
    st.setDraftScope(["acc_story_invest"]);
    st.addDraftEdit(edit(m, "h_story_bond", "exit"));
    expect(row(desk(m), "fixed_income").proposed).toBe(0);
    expect(desk(m).cash[0].proposed).toBe(40_000);
    expect(m.useAtlasStore.getState().recommendations[0]).toMatchObject({ type: "sell", actionAmount: 100, actionAmountUnit: "percent" });

    st.setDraftMember(m.useAtlasStore.getState().recommendations[0].id, false);
    st.addDraftEdit(edit(m, "h_story_equity", "increase", 15_000));
    const d = desk(m);
    expect(d.cash[0].proposed).toBe(-5_000);
    expect(d.shortfalls).toEqual([{ accountId: "acc_story_invest", accountName: "Story — Investment Account", shortfall: 5_000 }]);
    // Approving it brings the same shortfall to the final-PDF gate.
    const inc = m.useAtlasStore.getState().recommendations.find((r) => r.type === "increase")!;
    st.upsertRecommendation({ ...inc, approvedByAdvisor: true, status: "approved", includeInPdf: true });
    expect(readiness(m).find((c) => c.code === "trades_funded")!.passed).toBe(false);
    expect(() => edit(m, "h_story_equity", "reduce", 0)).toThrow();
    // A cash line takes no edit: the engine would move no offsetting cash.
    expect(() => edit(m, "h_story_cash", "reduce", 1_000)).toThrow(/Cash and liabilities/);
    expect(desk(m).positions.filter(m.editablePosition).map((p) => p.id)).toEqual(["h_story_equity", "h_story_bond"]);
  });
});

describe("scope and context", () => {
  it("liabilities and context stay out of the denominator; an unchosen scope shows every non-liability account", async () => {
    const m = await load();
    const d = desk(m); // the sample workspace
    expect(d.scope.chosen).toBe(false);
    const s = m.useAtlasStore.getState();
    expect(d.scope.accountIds).toEqual(s.accounts.filter((a) => !a.isLiabilityAccount).map((a) => a.id));
    expect(d.liabilities.lines.map((l) => l.id)).toEqual(["h_mortgage"]);
    expect(d.liabilities.total).toBeLessThan(0);
    expect(d.rows.some((r) => r.assetClass === "liability")).toBe(false);
    expect(d.totals.current).toBeCloseTo(d.householdAssets, 6);
    // Narrowing the scope moves the rest to context without losing it.
    s.setDraftScope(["acc_brokerage_us"]);
    const narrowed = desk(m);
    expect(narrowed.totals.current + narrowed.context.total).toBeCloseTo(d.householdAssets, 6);
    expect(narrowed.scope.chosen).toBe(true);
  });

  it("an in-scope holding with no rate is left out of the weights and still blocks the final PDF", async () => {
    const m = await load();
    story(m);
    const eur: Holding = { ...m.STORY_HOLDINGS[0], id: "h_story_nok", assetName: "NOK fund", currency: "NOK", nativeMarketValue: 5_000 };
    m.useAtlasStore.setState({ holdings: [...m.STORY_HOLDINGS, eur] });
    m.useAtlasStore.getState().setDraftScope(["acc_story_invest"]);
    const d = desk(m);
    expect(d.unvalued).toEqual([{ id: "h_story_nok", name: "NOK fund" }]);
    expect(d.totals.current).toBe(100_000);
    expect(readiness(m).find((c) => c.code === "holdings_valued")!.passed).toBe(false);
  });
});

describe("review fixes (PR #72)", () => {
  it("unvalued wealth outside the scope is listed, not silently dropped from context, household or liabilities", async () => {
    const m = await load();
    story(m);
    const homeNok: Holding = { ...m.STORY_HOLDINGS[3], id: "h_story_cabin", assetName: "Cabin (NOK)", currency: "NOK", nativeMarketValue: 900_000 };
    const loanNok: Holding = { ...m.STORY_HOLDINGS[3], id: "h_story_loan", assetName: "Cabin loan (NOK)", assetClass: "liability", isLiability: true, currency: "NOK", nativeMarketValue: -300_000 };
    m.useAtlasStore.setState({ holdings: [...m.STORY_HOLDINGS, homeNok, loanNok] });
    m.useAtlasStore.getState().setDraftScope(["acc_story_invest"]);
    const d = desk(m);
    expect(d.unvalued).toEqual([]);
    expect(d.unvaluedOutside).toEqual([
      { id: "h_story_cabin", name: "Cabin (NOK)", accountName: "Story — Primary Residence", liability: false },
      { id: "h_story_loan", name: "Cabin loan (NOK)", accountName: "Story — Primary Residence", liability: true },
    ]);
    expect(d.context.total).toBe(400_000); // valued context only, and said so
    expect(d.liabilities.lines.find((l) => l.id === "h_story_loan")!.value).toBeNull();
  });

  it("household assets always equal scope plus context, even for an asset in a liability account", async () => {
    const m = await load();
    story(m);
    const loanAcct = { ...m.STORY_ACCOUNTS[0], id: "acc_story_loan", name: "Story — Mortgage", type: "liability_account" as const, isLiabilityAccount: true };
    const offset: Holding = { ...m.STORY_HOLDINGS[2], id: "h_story_offset", accountId: "acc_story_loan", assetName: "Offset cash", nativeMarketValue: 2_500 };
    const loan: Holding = { ...m.STORY_HOLDINGS[2], id: "h_story_mortgage", accountId: "acc_story_loan", assetName: "Mortgage", assetClass: "liability", isLiability: true, nativeMarketValue: -150_000 };
    m.useAtlasStore.setState({ accounts: [...m.STORY_ACCOUNTS, loanAcct], holdings: [...m.STORY_HOLDINGS, offset, loan] });
    m.useAtlasStore.getState().setDraftScope(["acc_story_invest"]);
    const d = desk(m);
    expect(d.householdAssets).toBe(502_500);
    expect(d.totals.current + d.context.total).toBe(d.householdAssets);
    expect(d.context.accounts.map((a) => [a.id, a.value])).toEqual([["acc_story_home", 400_000], ["acc_story_loan", 2_500]]);
    expect(d.liabilities.total).toBe(-150_000);
    expect(d.scope.accountIds).toEqual(["acc_story_invest"]); // a liability account is never in scope
  });

  it("a change to a rate the draft's actions use shows as changed inputs", async () => {
    const m = await load();
    story(m);
    const st = m.useAtlasStore.getState();
    // A draft action entered in EUR: converting it uses EUR/USD, which no holding needs.
    st.addDraftEdit({ ...edit(m, "h_story_equity", "reduce", 1_000, "rec_eur"), currency: "EUR" });
    const basis = m.useAtlasStore.getState().workingDraft.inputBasis!;
    expect(basis.rates.map((r) => `${r.base}/${r.quote}`)).toContain("EUR/USD");
    const s = m.useAtlasStore.getState();
    const inputs = () => {
      const x = m.useAtlasStore.getState();
      return m.draftBasisInputs({ holdings: x.holdings, accounts: x.accounts, recommendations: x.recommendations, fxRates: x.fxRates, reportingCurrency: "USD", draft: x.workingDraft });
    };
    expect(m.inputsChanged(basis, inputs())).toBe(false);
    st.setFxRates(s.fxRates.map((r) => (r.base === "EUR" ? { ...r, rate: r.rate + 0.05 } : r)));
    expect(m.inputsChanged(basis, inputs())).toBe(true);
  });

  it("the approved view applies exactly what the final PDF and readiness apply", async () => {
    const m = await load();
    story(m);
    // Legacy data can be approved and marked excluded at once; the PDF engine applies it, so the approved view must too.
    const odd = { ...edit(m, "h_story_equity", "reduce", 5_000, "rec_odd"), approvedByAdvisor: true, status: "excluded" as const };
    m.useAtlasStore.setState({ recommendations: [odd] });
    m.useAtlasStore.getState().setDraftScope(["acc_story_invest"]);
    const s = m.useAtlasStore.getState();
    const hs = m.normalizeHoldings(s.holdings, s.fxRates, "USD");
    const pdf = m.applyRecommendationsToProposed(hs, s.recommendations.filter((r) => r.approvedByAdvisor), s.accounts, { reportingCurrency: "USD", rates: s.fxRates });
    const pdfEquity = pdf.holdings.filter((h) => h.assetClass === "equity").reduce((a, h) => a + (h.reportingMarketValue ?? 0), 0);
    expect(row(desk(m, "approved"), "equity").proposed).toBe(pdfEquity);
    expect(pdfEquity).toBe(55_000);
  });
});

describe("the contextual preview evaluates the working draft (review fix)", () => {
  const preview = (m: M, candidate: Recommendation) => {
    const s = m.useAtlasStore.getState();
    return m.previewDraftEdit({ holdings: m.normalizeHoldings(s.holdings, s.fxRates, "USD"), accounts: s.accounts, recommendations: s.recommendations, draft: s.workingDraft, candidate, fx: { reportingCurrency: "USD", rates: s.fxRates } });
  };
  const snapshot = (m: M) => JSON.parse(JSON.stringify({ h: m.useAtlasStore.getState().holdings, r: m.useAtlasStore.getState().recommendations, d: m.useAtlasStore.getState().workingDraft }));

  it("a second sale previews from the draft (50,000 → 40,000), and the desk matches exactly after saving", async () => {
    const m = await load();
    story(m);
    const st = m.useAtlasStore.getState();
    st.setDraftScope(["acc_story_invest"]);
    st.addDraftEdit(edit(m, "h_story_equity", "reduce", 10_000, "rec_first"));
    const second = edit(m, "h_story_equity", "reduce", 10_000, "rec_second");
    const before = snapshot(m);
    const p = preview(m, second);
    expect(snapshot(m)).toEqual(before); // previewing (or cancelling) changes nothing
    expect(p.position).toEqual({ before: 50_000, after: 40_000 });
    expect(p.cash).toEqual([{ holdingId: "h_story_cash", name: "Cash", accountName: "Story — Investment Account", before: 20_000, after: 30_000 }]);
    expect(p.shortfalls).toEqual([]);
    st.addDraftEdit(second);
    const d = desk(m);
    expect(row(d, "equity").proposed).toBe(p.position.after);
    expect(d.cash[0].proposed).toBe(p.cash[0].after);
  });

  it("two purchases each affordable alone show the combined shortfall before the second is saved", async () => {
    const m = await load();
    story(m);
    const st = m.useAtlasStore.getState();
    st.addDraftEdit(edit(m, "h_story_equity", "increase", 6_000, "rec_buy1"));
    const p = preview(m, edit(m, "h_story_bond", "increase", 6_000, "rec_buy2"));
    expect(p.cash).toEqual([{ holdingId: "h_story_cash", name: "Cash", accountName: "Story — Investment Account", before: 4_000, after: -2_000 }]);
    expect(p.shortfalls).toEqual([{ accountId: "acc_story_invest", accountName: "Story — Investment Account", shortfall: 2_000 }]);
  });

  it("approved recommendations outside the draft stay out of the draft preview; saved order is kept", async () => {
    const m = await load();
    story(m);
    const st = m.useAtlasStore.getState();
    st.upsertRecommendation({ ...edit(m, "h_story_equity", "reduce", 5_000, "rec_approved_out"), approvedByAdvisor: true, status: "approved" });
    expect(preview(m, edit(m, "h_story_equity", "reduce", 10_000, "rec_x")).position).toEqual({ before: 60_000, after: 50_000 });
    // An earlier member applies before the candidate: exit, then the candidate's purchase.
    st.addDraftEdit(edit(m, "h_story_equity", "exit", undefined, "rec_exit"));
    const add = edit(m, "h_story_equity", "increase", 1_000, "rec_add");
    expect(preview(m, add).position).toEqual({ before: 0, after: 1_000 });
    st.addDraftEdit(add);
    expect(row(desk(m), "equity").proposed).toBe(1_000);
  });

  it("an action the draft can't apply is reported from the same resulting draft", async () => {
    const m = await load();
    story(m);
    const nok = { ...edit(m, "h_story_equity", "reduce", 1_000, "rec_nok"), currency: "NOK" as Recommendation["currency"] };
    const p = preview(m, nok);
    expect(p.applied).toBe(false);
    expect(p.unresolved.map((u) => u.recommendationId)).toEqual(["rec_nok"]);
    expect(p.position).toEqual({ before: 60_000, after: 60_000 });
  });
});

describe("legacy approved-and-rejected records (review fix)", () => {
  it("store migration and v6-backup upgrade keep them in the draft, unchanged, with the approved result", async () => {
    const m = await load();
    story(m);
    const odd = { ...edit(m, "h_story_equity", "reduce", 5_000, "rec_odd"), approvedByAdvisor: true, status: "excluded" as const };
    const normal = { ...edit(m, "h_story_bond", "reduce", 1_000, "rec_rejected"), status: "excluded" as const };
    m.useAtlasStore.setState({ recommendations: [odd, normal] });
    const v6 = JSON.parse(JSON.stringify(m.useAtlasStore.getState()));
    delete v6.workingDraft;
    const migrated = m.migrateAtlasState(v6, 6);
    expect(migrated.recommendations).toEqual([odd, normal]); // approval and status untouched
    expect(migrated.workingDraft.memberIds).toEqual(["rec_odd"]);
    m.useAtlasStore.setState(migrated);
    m.useAtlasStore.getState().setDraftScope(["acc_story_invest"]);
    expect(desk(m).actions.map((r) => r.id)).toEqual(["rec_odd"]);
    expect(desk(m).rows).toEqual(desk(m, "approved").rows);
    expect(row(desk(m), "equity").proposed).toBe(55_000);

    const v7 = JSON.parse(m.serializeBackup(m.createBackup(m.useAtlasStore.getState(), NOW)));
    const { workingDraft: _d, ...engagement } = v7.engagement;
    void _d;
    const parsed = m.parseBackup(JSON.stringify({ ...v7, workspaceVersion: 6, engagement }), { disclosureIds: m.DISCLOSURE_LIBRARY.map((d) => d.id) });
    if (!parsed.ok) throw new Error(parsed.errors.join("; "));
    expect(parsed.backup.engagement.workingDraft.memberIds).toEqual(["rec_odd"]);
    expect(parsed.backup.engagement.recommendations).toEqual(v7.engagement.recommendations);
    // Ordinary rejection is unchanged: rejecting clears approval and leaves the draft.
    m.useAtlasStore.getState().rejectRecommendation("rec_odd");
    expect(m.useAtlasStore.getState().workingDraft.memberIds).toEqual([]);
  });
});

describe("membership, approval and PDF prose are separate", () => {
  it("joining the draft doesn't approve; approving doesn't join; prose inclusion moves neither", async () => {
    const m = await load();
    story(m);
    const st = m.useAtlasStore.getState();
    const rec = edit(m, "h_story_equity", "reduce", 5_000, "rec_a");
    st.upsertRecommendation(rec);
    expect(m.useAtlasStore.getState().workingDraft.memberIds).toEqual([]);
    st.setDraftMember("rec_a", true);
    expect(m.useAtlasStore.getState().recommendations[0].approvedByAdvisor).toBe(false);
    st.setDraftMember("rec_a", false);
    st.upsertRecommendation({ ...rec, approvedByAdvisor: true, status: "approved" });
    expect(m.useAtlasStore.getState().workingDraft.memberIds).toEqual([]);
    expect(desk(m).approvedOutsideDraft.map((r) => r.id)).toEqual(["rec_a"]);
    expect(desk(m, "approved").actions.map((r) => r.id)).toEqual(["rec_a"]);
    st.upsertRecommendation({ ...m.useAtlasStore.getState().recommendations[0], includeInPdf: true });
    expect(m.useAtlasStore.getState().workingDraft.memberIds).toEqual([]);
    // Rejecting takes it out of the draft; a rejected one can't join, and reopening doesn't put it back.
    st.setDraftMember("rec_a", true);
    st.rejectRecommendation("rec_a");
    expect(m.useAtlasStore.getState().workingDraft.memberIds).toEqual([]);
    expect(desk(m).actions).toEqual([]);
    st.setDraftMember("rec_a", true);
    expect(m.useAtlasStore.getState().workingDraft.memberIds).toEqual([]);
    st.reopenRecommendation("rec_a");
    expect(m.useAtlasStore.getState().workingDraft.memberIds).toEqual([]);
  });

  it("members apply in the recommendations' saved order, not the order they joined", async () => {
    const m = await load();
    story(m);
    const st = m.useAtlasStore.getState();
    const exit = edit(m, "h_story_equity", "exit", undefined, "rec_exit");
    const add = edit(m, "h_story_equity", "increase", 1_000, "rec_add");
    st.upsertRecommendation(exit);
    st.upsertRecommendation(add);
    st.setDraftMember("rec_add", true);
    st.setDraftMember("rec_exit", true);
    expect(desk(m).actions.map((r) => r.id)).toEqual(["rec_exit", "rec_add"]);
    expect(row(desk(m), "equity").proposed).toBe(1_000); // exit, then add 1,000
  });
});

describe("legacy implicit intent", () => {
  it("keeps its effect, but a new approval needs an explicit size; Approve all skips it", async () => {
    const m = await load();
    const st = m.useAtlasStore.getState();
    const legacy = st.recommendations.find((r) => r.id === "rec_reduce_aapl")!;
    expect(m.implicitIntent(legacy)).toBe("a reduction of half the position");
    expect(m.restatementMessage(legacy)).toMatch(/Enter an explicit amount/);
    st.upsertRecommendation({ ...legacy, approvedByAdvisor: true, status: "approved", includeInPdf: true });
    expect(m.useAtlasStore.getState().recommendations.find((r) => r.id === legacy.id)).toMatchObject({ approvedByAdvisor: false, status: legacy.status, includeInPdf: legacy.includeInPdf });
    st.approveAllRecommendations();
    expect(m.useAtlasStore.getState().recommendations.find((r) => r.id === legacy.id)!.approvedByAdvisor).toBe(false);

    // Restated explicitly as 50%, the same effect can be approved.
    const restated: Recommendation = { ...legacy, actionAmount: 50, actionAmountUnit: "percent" };
    const s = m.useAtlasStore.getState();
    const fx = { reportingCurrency: "USD" as const, rates: s.fxRates };
    const hs = m.normalizeHoldings(s.holdings, s.fxRates, "USD");
    const value = (r: Recommendation) => m.applyRecommendationsToProposed(hs, [r], s.accounts, fx).holdings.find((h) => h.id === "h_aapl")!.reportingMarketValue;
    expect(value(restated)).toBe(value(legacy));
    st.upsertRecommendation({ ...restated, approvedByAdvisor: true, status: "approved", includeInPdf: true });
    expect(m.useAtlasStore.getState().recommendations.find((r) => r.id === legacy.id)!.approvedByAdvisor).toBe(true);
  });

  it("an approval saved before stays approved and keeps its effect", async () => {
    const m = await load();
    const legacy = { ...m.useAtlasStore.getState().recommendations.find((r) => r.id === "rec_reduce_aapl")!, approvedByAdvisor: true, status: "approved" as const };
    const state = m.migrateAtlasState({ ...JSON.parse(JSON.stringify(m.useAtlasStore.getState())), recommendations: [legacy], workingDraft: undefined }, 6);
    expect(state.recommendations).toEqual([legacy]);
    expect(state.workingDraft.memberIds).toEqual(["rec_reduce_aapl"]);
  });
});

describe("store v7 migration", () => {
  it("a v6 workspace gets a draft of its approved recommendations, previewing the same proposal; idempotent", async () => {
    const m = await load();
    const s = JSON.parse(JSON.stringify(m.useAtlasStore.getState())) as { recommendations: Recommendation[]; workingDraft?: unknown };
    const recs = s.recommendations.map((r, i) => (i % 2 === 0 ? { ...r, approvedByAdvisor: true, status: "approved" as const } : r));
    const { workingDraft: _drop, ...v6 } = { ...s, recommendations: recs };
    void _drop;
    const migrated = m.migrateAtlasState(structuredClone(v6), 6);
    expect(migrated.recommendations).toEqual(recs);
    expect(migrated.workingDraft.memberIds).toEqual(recs.filter((r) => r.approvedByAdvisor).map((r) => r.id));
    expect(migrated.workingDraft).toMatchObject({ scopeAccountIds: null, targets: {}, inputBasis: null });
    // The draft view and the approved view are the same proposal as before.
    m.useAtlasStore.setState(migrated);
    const draft = desk(m);
    const approved = desk(m, "approved");
    expect(draft.rows).toEqual(approved.rows);
    expect(draft.actions.map((r) => r.id)).toEqual(approved.actions.map((r) => r.id));
    // Running it again (or on a v7 state) keeps the existing draft.
    const kept = { ...migrated.workingDraft, memberIds: ["x"] };
    expect(m.migrateAtlasState({ ...migrated, workingDraft: kept }, 6).workingDraft).toBe(kept);
  });

  it("the draft survives a reload from the saved key", async () => {
    let m = await load();
    story(m);
    const st = m.useAtlasStore.getState();
    st.setDraftScope(["acc_story_invest"]);
    st.setDraftTarget("equity", 50);
    st.addDraftEdit(edit(m, "h_story_equity", "reduce", 10_000));
    const draft = m.useAtlasStore.getState().workingDraft;
    expect(JSON.parse(storage.getItem(KEY)!).version).toBe(7);
    vi.resetModules();
    m = await load();
    await m.useAtlasStore.persist.rehydrate();
    expect(m.useAtlasStore.getState().workingDraft).toEqual(draft);
    expect(row(desk(m), "equity").proposed).toBe(50_000);
  });
});

describe("input basis", () => {
  it("records each accepted value, its date and the rates used; a rate change shows as changed until recorded again", async () => {
    const m = await load();
    const st = m.useAtlasStore.getState();
    st.setDraftTarget("equity", 40);
    const s = m.useAtlasStore.getState();
    const basis = s.workingDraft.inputBasis!;
    expect(basis.values).toHaveLength(s.holdings.length);
    expect(basis.values.find((v) => v.holdingId === "h_aapl")).toEqual({ holdingId: "h_aapl", accountId: "acc_brokerage_us", amount: 941_556, currency: "USD", sourceKind: "statement", date: "2026-04-30" });
    expect(basis.rates.map((r) => `${r.base}/${r.quote}`)).toEqual(["CAD/USD", "CHF/USD", "EUR/USD", "GBP/USD", "JPY/USD"]);
    const hs = () => {
      const x = m.useAtlasStore.getState();
      return m.draftBasisInputs({ holdings: x.holdings, accounts: x.accounts, recommendations: x.recommendations, fxRates: x.fxRates, reportingCurrency: "USD", draft: x.workingDraft });
    };
    expect(m.inputsChanged(basis, hs())).toBe(false);
    st.setFxRates(s.fxRates.map((r) => (r.base === "EUR" ? { ...r, rate: 1.2, asOf: "2026-10-23" } : r)));
    expect(m.inputsChanged(basis, hs())).toBe(true);
    st.recordDraftInputs();
    expect(m.inputsChanged(m.useAtlasStore.getState().workingDraft.inputBasis, hs())).toBe(false);
    // A changed source date alone is a changed input too.
    st.patchHolding("h_aapl", { valuationSource: { ...s.holdings.find((h) => h.id === "h_aapl")!.valuationSource, asOf: "2026-05-01" } });
    expect(m.inputsChanged(m.useAtlasStore.getState().workingDraft.inputBasis, hs())).toBe(true);
  });
});

describe("backup and restore", () => {
  const ids = (m: M) => ({ disclosureIds: m.DISCLOSURE_LIBRARY.map((d) => d.id) });

  it("a v7 backup round-trips the draft and its preview", async () => {
    const m = await load();
    story(m);
    const st = m.useAtlasStore.getState();
    st.setDraftScope(["acc_story_invest"]);
    st.setDraftTarget("fixed_income", 40);
    st.addDraftEdit(edit(m, "h_story_equity", "reduce", 10_000));
    const before = m.useAtlasStore.getState();
    const parsed = m.parseBackup(m.serializeBackup(m.createBackup(before, NOW)), ids(m));
    if (!parsed.ok) throw new Error(parsed.errors.join("; "));
    const restored = m.restoredState(parsed.backup, before, { replaceFirm: false });
    expect(restored.workingDraft).toEqual(before.workingDraft);
    const rowsBefore = desk(m).rows;
    m.useAtlasStore.getState().startNewClient();
    expect(m.useAtlasStore.getState().restoreWorkspace(restored)).toEqual({ ok: true });
    expect(desk(m).rows).toEqual(rowsBefore);
  });

  it("a v6 backup is validated as v6 and upgraded: its approved recommendations become the draft", async () => {
    const m = await load();
    const st = m.useAtlasStore.getState();
    st.upsertRecommendation({ ...st.recommendations[0], approvedByAdvisor: true, status: "approved", includeInPdf: true });
    const v7 = JSON.parse(m.serializeBackup(m.createBackup(m.useAtlasStore.getState(), NOW)));
    const { workingDraft: _d, ...engagement } = v7.engagement;
    void _d;
    const v6 = { ...v7, workspaceVersion: 6, engagement };
    const parsed = m.parseBackup(JSON.stringify(v6), ids(m));
    if (!parsed.ok) throw new Error(parsed.errors.join("; "));
    expect(parsed.backup.workspaceVersion).toBe(7);
    expect(parsed.backup.engagement.workingDraft).toMatchObject({ memberIds: [st.recommendations[0].id], scopeAccountIds: null, targets: {}, inputBasis: null, createdAt: NOW.toISOString() });
    expect(parsed.backup.engagement.recommendations).toEqual(v7.engagement.recommendations);
    // Still strict: a v6 file carrying a draft (or anything unknown) is rejected, and so is v5.
    expect(m.parseBackup(JSON.stringify({ ...v6, engagement: v7.engagement }), ids(m)).ok).toBe(false);
    expect(m.parseBackup(JSON.stringify({ ...v6, workspaceVersion: 5 }), ids(m))).toEqual({ ok: false, errors: [expect.stringMatching(/not supported/)] });
  });

  it("dangling draft references are pruned on export and rejected in a file", async () => {
    const m = await load();
    story(m);
    const st = m.useAtlasStore.getState();
    st.setDraftScope(["acc_story_invest", "acc_story_home"]);
    st.addDraftEdit(edit(m, "h_story_equity", "reduce", 1_000, "rec_gone"));
    st.removeRecommendation("rec_gone");
    expect(m.useAtlasStore.getState().workingDraft.memberIds).toEqual(["rec_gone"]); // ignored in the app; Undo can bring it back
    st.removeAccount("acc_story_home");
    const b = m.createBackup(m.useAtlasStore.getState(), NOW);
    expect(b.engagement.workingDraft.memberIds).toEqual([]);
    expect(b.engagement.workingDraft.scopeAccountIds).toEqual(["acc_story_invest"]);
    const bad = { ...b, engagement: { ...b.engagement, workingDraft: { ...b.engagement.workingDraft, memberIds: ["rec_missing"], scopeAccountIds: ["acc_missing"] } } };
    const parsed = m.parseBackup(JSON.stringify(bad), ids(m));
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.errors).toEqual([
      "The working draft includes recommendation rec_missing, which isn't in the backup.",
      "The working draft's scope includes account acc_missing, which isn't in the backup.",
    ]);
  });
});
