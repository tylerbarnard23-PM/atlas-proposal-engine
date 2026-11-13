import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as React from "react";

// D4/D5 usability review-fix (10 November 2026): the four Codex findings on
// the proposal-flow slice, reproduced by rendering the real pages and
// components (react-dom/server) against the real store, its actions and the
// deterministic test provider through the real agent loop. Interaction
// itself (clicks, focus, resizing) is checked in the browser; these tests pin
// what each state renders. Synthetic data only.

vi.mock("zustand", async (orig) => ({ ...(await orig<typeof import("zustand")>()), create: (await import("./support/liveStore")).liveCreate }));

const env = vi.hoisted(() => {
  const data = new Map<string, string>();
  const localStorage = {
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() {
      return data.size;
    },
  };
  const e = { wide: false, location: { search: "" } };
  (globalThis as { window?: unknown }).window = {
    localStorage,
    location: e.location,
    matchMedia: (q: string) => ({ media: q, matches: e.wide, addEventListener() {}, removeEventListener() {} }),
  };
  return Object.assign(e, { data });
});

const NOW = new Date("2026-11-10T12:00:00Z");
const INVEST = "acc_story_invest";

async function load() {
  return {
    ...(await import("react-dom/server")),
    ...(await import("@/store/useStore")),
    ...(await import("@/data/allocationStory")),
    ...(await import("@/engines/recommendationAmounts")),
    ...(await import("@/copilot/agent")),
    ...(await import("@/copilot/request")),
    ...(await import("@/copilot/testProvider")),
    ...(await import("@/components/copilot/CopilotWorkspace")),
    ...(await import("@/components/copilot/CopilotPanel")),
    ...(await import("@/components/copilot/modal")),
    RecommendationsPage: (await import("@/app/recommendations/page")).default,
    DeskPage: (await import("@/app/allocation-desk/page")).default,
  };
}
type M = Awaited<ReturnType<typeof load>>;
const store = (m: M) => m.useAtlasStore.getState();
const html = (m: M, el: React.ReactElement) => m.renderToStaticMarkup(el);
const text = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

beforeEach(() => {
  vi.resetModules();
  env.data.clear();
  env.wide = false;
  env.location.search = "";
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

function story(m: M) {
  store(m).startNewClient();
  m.useAtlasStore.setState({
    client: { ...store(m).client, fullName: "UI Story Household", proposalOutputCurrency: "USD" },
    accounts: m.STORY_ACCOUNTS,
    holdings: m.STORY_HOLDINGS,
    recommendations: [],
    fxRates: [],
    hasHydrated: true,
  });
  store(m).setDraftScope([INVEST]);
}

/** One Copilot answer (test provider, real loop) and the draft it prepared. */
async function answer(m: M) {
  const req = m.copilotRequest(store(m), "Review this alternative.");
  const r = await m.runAgent(req.snapshot, req.question, { client: m.createTestProvider(), mode: "test", provider: "test", now: NOW });
  expect(r.drafts).toHaveLength(1);
  return r;
}

/** The preview card as the workspace renders it, for the answer and what this session added. */
function preview(m: M, r: Awaited<ReturnType<typeof answer>>, addedHere: string[], onReveal?: (ids: string[]) => void) {
  const live = m.copilotRequest(store(m), "").context;
  const stale = r.context.inputRevision !== live.inputRevision || r.context.alternativeId !== live.alternativeId;
  return text(
    html(
      m,
      React.createElement(m.DraftPreview, {
        result: r,
        stale,
        selected: new Set(r.drafts.map((d) => d.id)),
        existing: new Set(store(m).recommendations.map((x) => x.id)),
        addedHere: new Set(addedHere),
        onToggle: () => {},
        onAdd: () => {},
        onDiscard: () => {},
        onReveal,
        note: null,
      })
    )
  );
}

describe("1. a recommendation saved from the Current draft view stays visible", () => {
  it("the just-saved record is shown and highlighted with where it was saved; its membership and approval are unchanged", async () => {
    const m = await load();
    story(m);
    const r = await answer(m);
    store(m).acceptAgentDrafts(r.drafts, r.context);
    const members = [...store(m).workingDraft.memberIds];

    // What New recommendation → Save does: the editor's record, saved as entered.
    const rec = { ...m.newRecommendation("USD"), title: "Review the beneficiary designations (synthetic)", rationale: "Saved from the Current draft view." };
    store(m).upsertRecommendation(rec);

    env.location.search = "?view=draft";
    const before = text(html(m, React.createElement(m.RecommendationsPage)));
    expect(before).toContain("Current draft (1)");
    // The filter alone would hide it: that is the finding.
    expect(before).not.toContain(rec.title);

    env.location.search = `?view=draft&saved=${rec.id}`;
    const page = html(m, React.createElement(m.RecommendationsPage));
    const t = text(page);
    expect(t).toContain(rec.title);
    expect(t).toContain("Just saved");
    expect(t).toContain(`Saved “${rec.title}”. It isn't in “Working draft” (it's in no draft), so it's shown here until you change the view.`);
    expect(t).toContain("Not approved.");
    expect(t).toContain("Current draft (1)");
    expect(page).toContain(`id="rec-${rec.id}"`);
    // Nothing was added to the draft or approved to make it visible.
    expect(store(m).workingDraft.memberIds).toEqual(members);
    expect(store(m).recommendations.find((x) => x.id === rec.id)).toMatchObject({ approvedByAdvisor: false });
  });

  it("a record saved inside the draft is confirmed as in it", async () => {
    const m = await load();
    story(m);
    const r = await answer(m);
    store(m).acceptAgentDrafts(r.drafts, r.context);
    const id = r.drafts[0].id;
    store(m).upsertRecommendation({ ...store(m).recommendations.find((x) => x.id === id)!, title: "Trim Equity ETF A (edited)" });
    env.location.search = `?view=draft&saved=${id}`;
    const t = text(html(m, React.createElement(m.RecommendationsPage)));
    expect(t).toContain("Saved “Trim Equity ETF A (edited)” in “Working draft”.");
  });
});

describe("2. the Copilot message follows where the added action is now", () => {
  it("says added and awaiting approval only while it is; afterwards it tells what happened from where it is now, and never re-adds", async () => {
    const m = await load();
    story(m);
    const r = await answer(m);
    const id = r.drafts[0].id;
    expect(store(m).acceptAgentDrafts(r.drafts, r.context).ok).toBe(true);

    expect(preview(m, r, [id])).toContain(m.ADDED);

    // Taken out of the draft on the desk.
    store(m).setDraftMember(id, false);
    const out = preview(m, r, [id]);
    expect(out).not.toContain(m.ADDED);
    expect(out).toContain(m.ADDED_EARLIER);
    expect(out).toContain("Now in no draft");
    expect(out).not.toContain("Add to working draft");
    expect(store(m).workingDraft.memberIds).not.toContain(id);

    // Back in, then approved: in the draft, approved.
    store(m).setDraftMember(id, true);
    const rec = store(m).recommendations.find((x) => x.id === id)!;
    store(m).upsertRecommendation({ ...rec, approvedByAdvisor: true, status: "approved", includeInPdf: true });
    expect(preview(m, r, [id])).toContain("In the working draft, approved");

    // Another alternative becomes active: the action stays in its own.
    store(m).duplicateDraft("Alternative B");
    const elsewhere = preview(m, r, [id]);
    expect(elsewhere).toContain(m.ADDED_EARLIER);
    expect(elsewhere).toContain('Now in "Working draft", not the active alternative');
    store(m).setActiveDraft(store(m).alternatives.find((a) => a.memberIds.includes(id))!.id);

    // Rejected, then deleted.
    store(m).rejectRecommendation(id, "Client declined");
    expect(preview(m, r, [id])).toContain("Rejected");
    store(m).removeRecommendation(id);
    expect(preview(m, r, [id])).toContain("Deleted since");
    expect(store(m).recommendations.some((x) => x.id === id)).toBe(false);
  });
});

describe("3. finding the added action on the allocation desk", () => {
  it("inside the desk panel it is an action that reveals the row; on the Copilot page it is a link the desk honours", async () => {
    const m = await load();
    story(m);
    const r = await answer(m);
    const id = r.drafts[0].id;
    store(m).acceptAgentDrafts(r.drafts, r.context);

    const inPanel = html(
      m,
      React.createElement(m.DraftPreview, {
        result: r,
        stale: true,
        selected: new Set([id]),
        existing: new Set([id]),
        addedHere: new Set([id]),
        onToggle: () => {},
        onAdd: () => {},
        onDiscard: () => {},
        onReveal: () => {},
        note: null,
      })
    );
    expect(inPanel).not.toContain('href="/allocation-desk');
    expect(inPanel).toMatch(/<button[^>]*data-testid="copilot-reveal"/);

    const onPage = preview(m, r, [id]);
    expect(onPage).not.toContain("copilot-reveal");
    const link = html(
      m,
      React.createElement(m.DraftPreview, { result: r, stale: true, selected: new Set([id]), existing: new Set([id]), addedHere: new Set([id]), onToggle: () => {}, onAdd: () => {}, onDiscard: () => {}, note: null })
    );
    expect(link).toContain(`href="/allocation-desk?focus=${id}"`);

    env.location.search = `?focus=${id}`;
    const desk = html(m, React.createElement(m.DeskPage));
    expect(desk).toMatch(new RegExp(`id="desk-action-${id}"[^>]*data-testid="desk-just-added"|data-testid="desk-just-added"[^>]*id="desk-action-${id}"`));
  });
});

describe("4. the narrow panel is a modal dialog; the wide column is not", () => {
  it("narrow: dialog with aria-modal; wide: a labelled complementary column with no modal semantics", async () => {
    const m = await load();
    story(m);
    const props = { question: "Q", onClose: () => {}, onReveal: () => {} };
    env.wide = false;
    const narrow = html(m, React.createElement(m.CopilotPanel, props));
    expect(narrow).toMatch(/role="dialog"[^>]*aria-modal="true"/);
    env.wide = true;
    const wide = html(m, React.createElement(m.CopilotPanel, props));
    expect(wide).not.toContain('aria-modal');
    expect(wide).not.toContain('role="dialog"');
    expect(wide).toContain('role="complementary"');
  });

  it("isolation marks everything outside the panel inert and restores exactly what was there", async () => {
    const m = await load();
    type N = { inert: boolean; parentElement: N | null; children: N[]; name: string };
    const node = (name: string, inert = false): N => ({ name, inert, parentElement: null, children: [] });
    const adopt = (p: N, ...c: N[]) => {
      for (const x of c) x.parentElement = p;
      p.children.push(...c);
      return p;
    };
    const body = node("body");
    const sidebar = node("sidebar");
    const alreadyInert = node("already", true);
    const main = node("main");
    const desk = node("desk");
    const panel = node("panel");
    adopt(main, desk, panel);
    adopt(body, sidebar, alreadyInert, main);
    const restore = m.isolateBackground(panel as unknown as HTMLElement, body as unknown as HTMLElement);
    expect([sidebar.inert, alreadyInert.inert, desk.inert, main.inert, panel.inert]).toEqual([true, true, true, false, false]);
    restore();
    expect([sidebar.inert, alreadyInert.inert, desk.inert, main.inert, panel.inert]).toEqual([false, true, false, false, false]);
  });

  it("Tab and Shift+Tab wrap inside the dialog", async () => {
    const m = await load();
    const [a, b, c] = ["a", "b", "c"];
    expect(m.wrapFocus([a, b, c], c, false)).toBe(a);
    expect(m.wrapFocus([a, b, c], a, true)).toBe(c);
    expect(m.wrapFocus([a, b, c], b, false)).toBeNull();
    // Focus that escaped the dialog comes back in at the edge the key points to.
    expect(m.wrapFocus([a, b, c], "outside", false)).toBe(a);
    expect(m.wrapFocus([a, b, c], "outside", true)).toBe(c);
    expect(m.wrapFocus([], "outside", false)).toBeNull();
  });
});
