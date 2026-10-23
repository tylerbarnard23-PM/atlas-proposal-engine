import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Recommendation } from "@/domain/types";

// PR #66 review: repairing a recommendation whose holding or account was
// removed. Choosing a holding in the editor links that holding and its
// account; choosing None clears a holding-derived (or removed) account link.
// Approval is never restored by relinking; content and evidence are kept.

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
vi.mock("puppeteer-core", async () => (await import("./support/fakeChromium")).puppeteerModule);
vi.mock("@/pdf/chromiumPath", async () => (await import("./support/fakeChromium")).chromiumPathModule);

const NOW = new Date("2026-10-22T12:00:00Z");

async function load() {
  const store = await import("@/store/useStore");
  const backup = await import("@/engines/workspaceBackup");
  const links = await import("@/engines/recommendationLinks");
  const { normalizeHoldings } = await import("@/engines/normalizationEngine");
  const { applyRecommendationsToProposed } = await import("@/engines/proposalEngine");
  const { evaluateWorkspaceReadiness } = await import("@/engines/complianceEngine");
  const { previewRecommendation } = await import("@/engines/recommendationPreview");
  const { DISCLOSURE_LIBRARY } = await import("@/domain/disclosureLibrary");
  return { ...store, ...backup, ...links, normalizeHoldings, applyRecommendationsToProposed, evaluateWorkspaceReadiness, previewRecommendation, DISCLOSURE_LIBRARY };
}
type Mods = Awaited<ReturnType<typeof load>>;
type State = ReturnType<Mods["useAtlasStore"]["getState"]>;
const ids = (m: Mods) => ({ disclosureIds: m.DISCLOSURE_LIBRARY.map((d) => d.id) });

const linkCheck = (m: Mods, s: State) => {
  const holdings = m.normalizeHoldings(s.holdings, s.fxRates, s.client.proposalOutputCurrency);
  return m
    .evaluateWorkspaceReadiness({ client: s.client, advisor: s.advisor, accounts: s.accounts, holdings, recommendations: s.recommendations, disclosures: s.disclosures, fxRates: s.fxRates, sourceDocuments: s.sourceDocuments, fxConfirmation: s.fxConfirmation, now: NOW })
    .find((c) => c.code === "recommendation_links")!;
};
const proposed = (m: Mods, s: State) => {
  const holdings = m.normalizeHoldings(s.holdings, s.fxRates, s.client.proposalOutputCurrency);
  return m
    .applyRecommendationsToProposed(holdings, s.recommendations.filter((r) => r.approvedByAdvisor), s.accounts, { reportingCurrency: s.client.proposalOutputCurrency, rates: s.fxRates, now: NOW })
    .holdings.map((h) => [h.id, h.reportingMarketValue]);
};

// The editor: a draft copy of the saved recommendation, changed by picking a
// holding (the shared helper), then saved through the store as the page does.
function edit(m: Mods, recId: string) {
  const saved = () => m.useAtlasStore.getState();
  let draft: Recommendation = structuredClone(saved().recommendations.find((r) => r.id === recId)!);
  return {
    get draft() {
      return draft;
    },
    pick(holdingId: string | undefined) {
      draft = { ...draft, ...m.linkToHolding(draft, holdingId, saved()) };
    },
    save() {
      m.useAtlasStore.getState().upsertRecommendation({ ...draft, updatedAt: NOW.toISOString() });
    },
  };
}

// H1 in account A1, H2 in a different existing account A2 (the sample's).
function setup(m: Mods) {
  const s = m.useAtlasStore.getState();
  const h1 = s.holdings.find((h) => h.id === "h_chf_nestle")!;
  const h2 = s.holdings.find((h) => h.accountId !== h1.accountId && h.assetClass === "equity" && h.currency === "USD")!;
  // Only this test's recommendation links into A1 (the sample has others).
  const inA1 = new Set(s.holdings.filter((h) => h.accountId === h1.accountId).map((h) => h.id));
  for (const r of s.recommendations) if ((r.relatedHoldingId && inA1.has(r.relatedHoldingId)) || r.relatedAccountId === h1.accountId) m.useAtlasStore.getState().removeRecommendation(r.id);
  const rec: Recommendation = {
    ...s.recommendations[0],
    id: "rec_relink",
    title: "Trim the Swiss position",
    rationale: "Reduce single-country exposure.",
    type: "reduce",
    relatedHoldingId: h1.id,
    relatedAccountId: h1.accountId,
    actionAmount: 1_000,
    actionAmountUnit: "amount",
    proposedValue: undefined,
    currency: "USD",
    currencyReview: { legacyLabel: "CHF", calculatedIn: "USD", status: "open", migratedAt: "2026-10-01T00:00:00.000Z" },
    approvedByAdvisor: true,
    includeInPdf: true,
    status: "approved",
  };
  m.useAtlasStore.getState().upsertRecommendation(rec);
  return { h1, h2, a1: h1.accountId, a2: h2.accountId, rec };
}

beforeEach(() => {
  vi.resetModules();
  storage.clear();
});

describe("relinking after the linked account was deleted", () => {
  it("picking holding H2 links H2 and its account A2, clears the blocker and keeps approval cleared", async () => {
    const m = await load();
    const { h2, a1, a2, rec } = setup(m);
    m.useAtlasStore.getState().removeAccount(a1);
    expect(linkCheck(m, m.useAtlasStore.getState()).passed).toBe(false);

    const editor = edit(m, rec.id);
    const savedBefore = JSON.stringify(m.useAtlasStore.getState());
    editor.pick(h2.id);
    // Previewing the edit (as the editor does live) saves nothing.
    m.previewRecommendation({ rec: editor.draft, holdings: m.useAtlasStore.getState().holdings, recommendations: m.useAtlasStore.getState().recommendations, accounts: m.useAtlasStore.getState().accounts, fx: { reportingCurrency: "USD", rates: m.useAtlasStore.getState().fxRates, now: NOW }, sourceDocuments: [] });
    expect(JSON.stringify(m.useAtlasStore.getState())).toBe(savedBefore);
    editor.save();

    const saved = m.useAtlasStore.getState().recommendations.find((r) => r.id === rec.id)!;
    expect(saved).toMatchObject({ relatedHoldingId: h2.id, relatedAccountId: a2 });
    expect(saved).toMatchObject({ approvedByAdvisor: false, status: "needs_review" }); // never restored by relinking
    // Content and evidence unchanged.
    expect(saved).toMatchObject({ title: rec.title, rationale: rec.rationale, type: rec.type, actionAmount: 1_000, actionAmountUnit: "amount", currency: "USD", includeInPdf: true, currencyReview: rec.currencyReview });
    expect(m.unresolvedRecommendationLinks(m.useAtlasStore.getState())).toEqual([]);
    expect(linkCheck(m, m.useAtlasStore.getState()).passed).toBe(true);
  });

  it("the repaired links and, once the advisor re-approves, their effect survive export, restore and reload", async () => {
    const m = await load();
    const { h2, a1, a2, rec } = setup(m);
    m.useAtlasStore.getState().removeAccount(a1);
    const editor = edit(m, rec.id);
    editor.pick(h2.id);
    editor.save();
    // Approving is the advisor's explicit, separate decision.
    const relinked = m.useAtlasStore.getState().recommendations.find((r) => r.id === rec.id)!;
    m.useAtlasStore.getState().upsertRecommendation({ ...relinked, approvedByAdvisor: true, status: "approved" });
    const before = m.useAtlasStore.getState();
    const effect = proposed(m, before);
    expect(effect.find(([id]) => id === h2.id)![1]).toBeCloseTo((before.holdings.find((h) => h.id === h2.id)!.nativeMarketValue as number) - 1_000, 6);

    const exported = m.exportBackup(before, NOW, ids(m));
    if (!exported.ok) throw new Error(exported.errors.join("; "));
    expect(JSON.parse(exported.text).engagement.unresolvedLinks).toEqual([]);
    const parsed = m.parseBackup(exported.text, ids(m));
    if (!parsed.ok) throw new Error(parsed.errors.join("; "));
    m.useAtlasStore.getState().startNewClient();
    expect(m.useAtlasStore.getState().restoreWorkspace(m.restoredState(parsed.backup, { advisor: before.advisor, disclosures: m.DISCLOSURE_LIBRARY }, { replaceFirm: false }))).toEqual({ ok: true });

    vi.resetModules(); // a fresh page, hydrating from the saved key
    const fresh = await load();
    await fresh.useAtlasStore.persist.rehydrate();
    const s = fresh.useAtlasStore.getState();
    expect(s.recommendations.find((r) => r.id === rec.id)).toMatchObject({ relatedHoldingId: h2.id, relatedAccountId: a2, approvedByAdvisor: true });
    expect(proposed(fresh, s)).toEqual(effect);
    expect(linkCheck(fresh, s).passed).toBe(true);
  });

  it("picking None (advisory only) clears both links: no hidden reference to the removed account", async () => {
    const m = await load();
    const { a1, rec } = setup(m);
    m.useAtlasStore.getState().removeAccount(a1);
    const editor = edit(m, rec.id);
    editor.pick(undefined);
    editor.save();
    const saved = m.useAtlasStore.getState().recommendations.find((r) => r.id === rec.id)!;
    expect(saved.relatedHoldingId).toBeUndefined();
    expect(saved.relatedAccountId).toBeUndefined();
    expect(saved).toMatchObject({ approvedByAdvisor: false, title: rec.title, actionAmount: 1_000 });
    expect(linkCheck(m, m.useAtlasStore.getState()).passed).toBe(true);
    const exported = m.exportBackup(m.useAtlasStore.getState(), NOW, ids(m));
    if (!exported.ok) throw new Error(exported.errors.join("; "));
    const inFile = JSON.parse(exported.text).engagement.recommendations.find((r: Recommendation) => r.id === rec.id);
    expect(JSON.stringify(inFile)).not.toContain(a1);
  });

  it("re-selecting the removed holding changes nothing; cancelling (not saving) changes nothing", async () => {
    const m = await load();
    const { h1, a1, rec } = setup(m);
    m.useAtlasStore.getState().removeAccount(a1);
    const saved = JSON.stringify(m.useAtlasStore.getState());
    const editor = edit(m, rec.id);
    editor.pick(h1.id); // the "Removed holding" option
    expect(editor.draft).toMatchObject({ relatedHoldingId: h1.id, relatedAccountId: a1 });
    editor.pick("h_aapl"); // then cancel: never saved
    expect(JSON.stringify(m.useAtlasStore.getState())).toBe(saved);
  });
});

describe("account-only recommendations", () => {
  it("keep their link to an existing account when None stays selected; picking a holding makes it holding-derived", async () => {
    const m = await load();
    const s = m.useAtlasStore.getState();
    const account = s.accounts[1];
    const rec: Recommendation = { ...s.recommendations[0], id: "rec_acct", title: "Consolidate this account", type: "consolidate_accounts", relatedHoldingId: undefined, relatedAccountId: account.id, actionAmount: undefined, proposedValue: undefined };
    m.useAtlasStore.getState().upsertRecommendation(rec);
    expect(m.linkToHolding(rec, undefined, m.useAtlasStore.getState())).toEqual({ relatedHoldingId: undefined, relatedAccountId: account.id });
    const other = s.holdings.find((h) => h.accountId !== account.id)!;
    expect(m.linkToHolding(rec, other.id, m.useAtlasStore.getState())).toEqual({ relatedHoldingId: other.id, relatedAccountId: other.accountId });
  });

  it("whose account was removed: None clears the removed account link", async () => {
    const m = await load();
    const s = m.useAtlasStore.getState();
    const account = s.accounts[1];
    const inAccount = new Set(s.holdings.filter((h) => h.accountId === account.id).map((h) => h.id));
    for (const r of s.recommendations) if (r.relatedHoldingId && inAccount.has(r.relatedHoldingId)) m.useAtlasStore.getState().removeRecommendation(r.id);
    m.useAtlasStore.getState().upsertRecommendation({ ...s.recommendations[0], id: "rec_acct", relatedHoldingId: undefined, relatedAccountId: account.id, actionAmount: undefined, proposedValue: undefined });
    m.useAtlasStore.getState().removeAccount(account.id);
    expect(linkCheck(m, m.useAtlasStore.getState()).passed).toBe(false);
    const editor = edit(m, "rec_acct");
    editor.pick(undefined);
    editor.save();
    expect(m.useAtlasStore.getState().recommendations.find((r) => r.id === "rec_acct")!.relatedAccountId).toBeUndefined();
    expect(linkCheck(m, m.useAtlasStore.getState()).passed).toBe(true);
  });
});

describe("other ways the blocker resolves, and the server gate", () => {
  it("rejecting or deleting the recommendation resolves it", async () => {
    const m = await load();
    const { a1, rec } = setup(m);
    m.useAtlasStore.getState().removeAccount(a1);
    m.useAtlasStore.getState().rejectRecommendation(rec.id, "No longer relevant");
    expect(linkCheck(m, m.useAtlasStore.getState()).passed).toBe(true);
    m.useAtlasStore.getState().reopenRecommendation(rec.id);
    expect(linkCheck(m, m.useAtlasStore.getState()).passed).toBe(false);
    m.useAtlasStore.getState().removeRecommendation(rec.id);
    expect(linkCheck(m, m.useAtlasStore.getState()).passed).toBe(true);
  });

  it("a direct final-PDF request rejects genuinely unresolved links, and accepts them once relinked", async () => {
    const m = await load();
    const { h2, a1, rec } = setup(m);
    m.useAtlasStore.getState().removeAccount(a1);
    const { POST } = await import("@/app/api/proposals/[id]/generate-pdf/route");
    const post = async () => {
      const s = m.useAtlasStore.getState();
      const state = { client: s.client, advisor: s.advisor, accounts: s.accounts, holdings: s.holdings, recommendations: s.recommendations, disclosures: s.disclosures, fxRates: s.fxRates, sourceDocuments: s.sourceDocuments, sections: [], proposal: s.proposal, fxConfirmation: s.fxConfirmation };
      const res = await POST(new Request("http://localhost/api/proposals/p/generate-pdf?variant=final", { method: "POST", body: JSON.stringify({ state }) }), { params: Promise.resolve({ id: "p" }) });
      return res.status === 422 ? ((await res.json()).failing as string[]) : [];
    };
    expect(await post()).toContain("Recommendations linked to current holdings and accounts");
    const editor = edit(m, rec.id);
    editor.pick(h2.id);
    editor.save();
    expect(await post()).not.toContain("Recommendations linked to current holdings and accounts");
  });
});
