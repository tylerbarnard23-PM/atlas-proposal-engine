import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// D5 usability slice (29 October 2026): the simplified Allocation desk →
// Copilot → Recommendations journey, through the real store, the shared
// request builder the page and the desk panel both use, the deterministic
// test provider and the real agent loop. Synthetic data only.

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

const NOW = new Date("2026-10-29T12:00:00Z");
const INVEST = "acc_story_invest";

async function load() {
  return {
    ...(await import("@/store/useStore")),
    ...(await import("@/engines/allocationDesk")),
    ...(await import("@/engines/normalizationEngine")),
    ...(await import("@/data/allocationStory")),
    ...(await import("@/copilot/agent")),
    ...(await import("@/copilot/context")),
    ...(await import("@/copilot/request")),
    ...(await import("@/copilot/demo")),
    ...(await import("@/copilot/testProvider")),
  };
}
type M = Awaited<ReturnType<typeof load>>;
const store = (m: M) => m.useAtlasStore.getState();
const json = (v: unknown) => JSON.parse(JSON.stringify(v));
/** Everything a preview, a discard or a view switch must leave alone. */
const workspace = (m: M) => json({ holdings: store(m).holdings, recs: store(m).recommendations, draft: store(m).workingDraft, alternatives: store(m).alternatives, snapshots: store(m).snapshots });

beforeEach(() => {
  vi.resetModules();
  storage.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

/** The acceptance story: the USD 100,000 investment account in scope, the home as context. */
function story(m: M) {
  store(m).startNewClient();
  m.useAtlasStore.setState({
    client: { ...store(m).client, fullName: "Flow Story Household", proposalOutputCurrency: "USD" },
    accounts: m.STORY_ACCOUNTS,
    holdings: m.STORY_HOLDINGS,
    recommendations: [],
    fxRates: [],
  });
  store(m).setDraftScope([INVEST]);
}

/** What the page or the panel sends, run by the test provider through the real loop. */
async function ask(m: M) {
  const req = m.copilotRequest(store(m), "Review this alternative.");
  const r = await m.runAgent(req.snapshot, req.question, { client: m.createTestProvider(), mode: "test", provider: "test", now: NOW });
  expect(r.context).toEqual(req.context);
  return r;
}
const existing = (m: M) => new Set(store(m).recommendations.map((r) => r.id));
const stale = (m: M, r: { context: { inputRevision: string } }) => r.context.inputRevision !== m.copilotRequest(store(m), "").context.inputRevision;

describe("one request for both entry points", () => {
  it("the page and the desk panel build the same request; building it changes nothing and names the scope", async () => {
    const m = await load();
    story(m);
    const before = workspace(m);
    const a = m.copilotRequest(store(m), "Q");
    const b = m.copilotRequest(store(m), "Q");
    expect(a).toEqual(b);
    expect(a.context).toEqual(m.agentContextOf(a.snapshot));
    expect(a.context).toMatchObject({ alternativeId: store(m).workingDraft.id, scopeAccountIds: [INVEST] });
    expect(workspace(m)).toEqual(before);

    expect(m.scopeLabel(store(m).accounts, store(m).workingDraft)).toMatchObject({ count: 1, total: 2, chosen: true, text: "1 of 2 accounts: Story — Investment Account" });
    store(m).setDraftScope(null);
    // The default is every non-liability account, named, as the desk resolves it.
    expect(m.scopeLabel(store(m).accounts, store(m).workingDraft)).toMatchObject({ count: 2, chosen: false, text: "All 2 accounts (default): Story — Investment Account, Story — Primary Residence" });
    store(m).setDraftScope([]);
    expect(m.scopeLabel(store(m).accounts, store(m).workingDraft).text).toBe("No accounts selected");
    // Many accounts: five names at a glance, the rest counted; the full list stays in text.
    const many = Array.from({ length: 7 }, (_, i) => ({ ...m.STORY_ACCOUNTS[0], id: `acc_many_${i}`, name: `Account ${i + 1}` }));
    const label = m.scopeLabel(many, { ...store(m).workingDraft, scopeAccountIds: null });
    expect(label.short).toBe("All 7 accounts (default): Account 1, Account 2, Account 3, Account 4, Account 5 and 2 more");
    expect(label.text).toContain("Account 7");
  });
});

describe("preview, discard and add", () => {
  it("a preview adds nothing and says so; discarding writes nothing; adding joins the working draft unapproved", async () => {
    const m = await load();
    story(m);
    const before = workspace(m);

    const first = await ask(m);
    expect(first.status).toBe("completed");
    expect(first.drafts).toHaveLength(1);
    expect(first.drafts[0]).toMatchObject({ relatedHoldingId: "h_story_equity", actionAmount: 6_000 });
    // Before acceptance the scripted answer doesn't claim anything was saved.
    expect(first.answer).toContain("nothing is added yet");
    expect(first.answer).not.toMatch(/\bSaved\b/);
    expect(m.previewPhase(first.drafts, existing(m), stale(m, first))).toEqual({ phase: "preview", added: [], pending: [first.drafts[0].id] });
    expect(m.PREVIEW_ONLY).toBe("Preview only — nothing added.");
    expect(workspace(m)).toEqual(before);

    // Discard is dropping the answer: the store is never called.
    expect(workspace(m)).toEqual(before);

    const second = await ask(m);
    expect(second.drafts.map((d) => d.id)).toEqual(first.drafts.map((d) => d.id));
    const added = store(m).acceptAgentDrafts(second.drafts, second.context);
    expect(added).toEqual({ ok: true, added: [second.drafts[0].id], skipped: [] });
    const rec = store(m).recommendations.find((r) => r.id === second.drafts[0].id)!;
    expect(rec).toMatchObject({ approvedByAdvisor: false, includeInPdf: false, status: "needs_review" });
    expect(store(m).workingDraft.memberIds).toContain(rec.id);
    expect(json(store(m).holdings)).toEqual(before.holdings);
    // Now the answer is stale, but what was added reads as added, with a way to find it.
    expect(m.previewPhase(second.drafts, existing(m), stale(m, second))).toEqual({ phase: "added", added: [rec.id], pending: [] });
    expect(m.ADDED).toBe("Added to working draft — awaiting approval.");
    expect(m.reviewHref([rec.id])).toBe(`/recommendations?view=draft&focus=${rec.id}`);
    expect(m.draftMembership(store(m).recommendations, store(m).workingDraft, store(m).alternatives).current.map((r) => r.id)).toEqual([rec.id]);
  });

  it("with several drafts, only the explicit selection is added", async () => {
    const m = await load();
    story(m);
    const r = await ask(m);
    const advisory = { ...r.drafts[0], id: "rec_ai_extra", relatedHoldingId: undefined, actionAmount: undefined, type: "review_source_data" as const, title: "Review the statement" };
    const drafts = [r.drafts[0], advisory];
    const out = store(m).acceptAgentDrafts([advisory], r.context);
    expect(out).toEqual({ ok: true, added: ["rec_ai_extra"], skipped: [] });
    expect(existing(m).has(r.drafts[0].id)).toBe(false);
    expect(m.previewPhase(drafts, existing(m), stale(m, r))).toEqual({ phase: "added", added: ["rec_ai_extra"], pending: [r.drafts[0].id] });
    // The unselected one can't follow on the old answer: the workspace changed.
    expect(store(m).acceptAgentDrafts([r.drafts[0]], r.context).ok).toBe(false);
  });
});

describe("stale context", () => {
  it("a scope change after the answer makes the preview stale and adding is refused, with nothing written", async () => {
    const m = await load();
    story(m);
    const r = await ask(m);
    store(m).setDraftScope(null);
    const before = workspace(m);
    expect(stale(m, r)).toBe(true);
    expect(m.previewPhase(r.drafts, existing(m), stale(m, r)).phase).toBe("stale");
    const out = store(m).acceptAgentDrafts(r.drafts, r.context);
    expect(out.ok).toBe(false);
    expect(workspace(m)).toEqual(before);
  });

  it("switching to another alternative also makes the preview stale", async () => {
    const m = await load();
    story(m);
    const first = store(m).workingDraft.id;
    const r = await ask(m);
    store(m).duplicateDraft("Alternative B");
    expect(store(m).workingDraft.id).not.toBe(first);
    expect(m.copilotRequest(store(m), "").context.alternativeId).not.toBe(r.context.alternativeId);
    expect(store(m).acceptAgentDrafts(r.drafts, r.context).ok).toBe(false);
  });
});

describe("reload and repeat", () => {
  it("after adding and a reload, the same request prepares no duplicate and a repeated add changes nothing", async () => {
    let m = await load();
    story(m);
    const r = await ask(m);
    expect(store(m).acceptAgentDrafts(r.drafts, r.context).ok).toBe(true);
    const saved = workspace(m);

    // Reload: a fresh store rehydrates from storage.
    vi.resetModules();
    m = await load();
    await m.useAtlasStore.persist.rehydrate();
    expect(workspace(m)).toEqual(saved);

    const again = await ask(m);
    expect(again.status).toBe("completed");
    expect(again.drafts).toEqual([]);
    expect(again.answer).toContain("No draft was prepared");
    expect(again.answer).toMatch(/already on file/);
    expect(store(m).acceptAgentDrafts(r.drafts, r.context)).toEqual({ ok: true, added: [], skipped: [r.drafts[0].id] });
    expect(workspace(m)).toEqual(saved);
    expect(store(m).recommendations.filter((x) => x.relatedHoldingId === "h_story_equity")).toHaveLength(1);
  });

  it("the scripted demo says it prepared drafts, not that it saved them", async () => {
    const m = await load();
    // The seeded synthetic demo workspace the public scripted mode uses, with no recommendation on file yet.
    m.useAtlasStore.setState({ recommendations: [] });
    const before = workspace(m);
    const r = m.runDemoCopilot(m.copilotSnapshot(store(m)), "Draft recommendations for the top risks");
    expect(r.drafts.length).toBeGreaterThan(0);
    for (const d of r.drafts) expect(d.approvedByAdvisor).toBe(false);
    expect(r.answer).toContain("to preview");
    expect(r.answer).toContain("Nothing is added yet");
    expect(r.answer).not.toMatch(/I saved/);
    expect(workspace(m)).toEqual(before);
  });
});

describe("draft and approved views", () => {
  it("the counts are the evaluator's own selections, and evaluating or counting either view changes nothing", async () => {
    const m = await load();
    story(m);
    const r = await ask(m);
    store(m).acceptAgentDrafts(r.drafts, r.context);
    const s = store(m);
    const holdings = m.normalizeHoldings(s.holdings, s.fxRates, "USD");
    const fx = { reportingCurrency: "USD", rates: s.fxRates, now: NOW };
    const before = workspace(m);
    const counts = m.deskViewCounts(s.recommendations, s.workingDraft);
    const draftView = m.evaluateDesk({ holdings, accounts: s.accounts, recommendations: s.recommendations, draft: s.workingDraft, fx, view: "draft" });
    const approvedView = m.evaluateDesk({ holdings, accounts: s.accounts, recommendations: s.recommendations, draft: s.workingDraft, fx, view: "approved" });
    expect(counts).toEqual({ draft: draftView.actions.length, approved: approvedView.actions.length });
    expect(counts).toEqual({ draft: 1, approved: 0 });
    // The draft view shows the proposed change; the approved view doesn't apply an unapproved action.
    expect(draftView.positions.find((p) => p.id === "h_story_equity")).toMatchObject({ current: 60_000, proposed: 54_000 });
    expect(approvedView.positions.find((p) => p.id === "h_story_equity")).toMatchObject({ current: 60_000, proposed: 60_000 });
    expect(workspace(m)).toEqual(before);

    // Approving is a separate, explicit act; then both views count it.
    const rec = s.recommendations[0];
    store(m).upsertRecommendation({ ...rec, approvedByAdvisor: true, status: "approved", includeInPdf: true });
    expect(m.deskViewCounts(store(m).recommendations, store(m).workingDraft)).toEqual({ draft: 1, approved: 1 });
  });

  it("the Recommendations views add up to every record: the current draft, other alternatives, and none", async () => {
    const m = await load();
    story(m);
    const r = await ask(m);
    store(m).acceptAgentDrafts(r.drafts, r.context);
    store(m).duplicateDraft("Alternative B");
    const copy = store(m).workingDraft;
    store(m).upsertRecommendation({ ...store(m).recommendations[0], id: "rec_unassigned", title: "Unassigned (synthetic)" });
    const recs = store(m).recommendations;
    const g = m.draftMembership(recs, store(m).workingDraft, store(m).alternatives);
    expect(g.current.map((x) => x.id)).toEqual(copy.memberIds);
    expect(g.otherAlternatives.map((x) => x.id)).toEqual([r.drafts[0].id]);
    expect(g.unassigned.map((x) => x.id)).toEqual(["rec_unassigned"]);
    expect(g.current.length + g.otherAlternatives.length + g.unassigned.length).toBe(recs.length);
  });
});
