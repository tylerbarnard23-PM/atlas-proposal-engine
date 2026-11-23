import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import type { Recommendation } from "@/domain/types";
import { loadSampleRecommendations } from "./support/sampleRecommendations";

// #113: prewritten samples no longer fill the Recommendations screen. They sit
// in a collapsed "Saved examples" section with their own count; scripted and
// test examples have their own section; Claude, advisor and unrecorded records
// fill the list. Approved examples keep affecting the proposal, so a notice
// says so and an explicit, confirmed action can take selected ones out of the
// working proposal. Through the real store and the real page. Synthetic data.

vi.mock("zustand", async (orig) => ({ ...(await orig<typeof import("zustand")>()), create: (await import("./support/liveStore")).liveCreate }));
vi.mock("next/navigation", async (orig) => ({ ...(await orig<typeof import("next/navigation")>()), useSearchParams: () => new URLSearchParams(""), usePathname: () => "/recommendations", useRouter: () => ({ replace() {}, push() {}, prefetch() {} }) }));
const storage = vi.hoisted(() => {
  const data = new Map<string, string>();
  const s = { getItem: (k: string) => (data.has(k) ? data.get(k)! : null), setItem: (k: string, v: string) => void data.set(k, String(v)), removeItem: (k: string) => void data.delete(k), clear: () => data.clear(), key: (i: number) => [...data.keys()][i] ?? null, get length() { return data.size; } };
  (globalThis as { window?: unknown }).window = { localStorage: s, location: { search: "", href: "http://localhost/", pathname: "/", hash: "" }, history: { pushState() {}, replaceState() {} } };
  return s;
});

async function load() {
  return {
    ...(await import("react-dom/server")),
    ...(await import("@/store/useStore")),
    ...(await import("@/data/seedRecommendations")),
    ...(await import("@/engines/recommendationOrigin")),
    ...(await import("@/engines/recommendationAmounts")),
    ...(await import("@/engines/workspaceBackup")),
    ...(await import("@/domain/disclosureLibrary")),
    RecommendationsPage: (await import("@/app/recommendations/page")).default,
  };
}
type M = Awaited<ReturnType<typeof load>>;
const store = (m: M) => m.useAtlasStore.getState();
const setView = (v: string) => ((window as unknown as { location: { search: string } }).location.search = v ? `?view=${v}` : "");
const render = (m: M, view = "") => {
  setView(view);
  m.useAtlasStore.setState({ hasHydrated: true });
  try {
    return m.renderToStaticMarkup(React.createElement(m.RecommendationsPage));
  } finally {
    setView("");
  }
};
const cards = (html: string) => [...html.matchAll(/\sid="rec-([^"]+)"/g)].map((x) => x[1]);
/** The markup of one section, from its test id to the end of the page (sections follow each other). */
const section = (html: string, testid: string) => {
  const at = html.indexOf(`data-testid="${testid}"`);
  return at < 0 ? "" : html.slice(at);
};
const between = (html: string, from: string, to: string) => {
  const a = html.indexOf(`data-testid="${from}"`);
  const b = html.indexOf(`data-testid="${to}"`);
  return a < 0 ? "" : html.slice(a, b > a ? b : undefined);
};

const CLAUDE = "rec_claude_synthetic_113";
const ADVISOR = "rec_advisor_synthetic_113";
const SCRIPTED = "rec_scripted_synthetic_113";
const UNKNOWN = "rec_unrecorded_synthetic_113";

/** A legacy workspace: the six prewritten samples (no stored origin, as before #111) plus one record of each other origin. */
function legacyWorkspace(m: M, inDraft: string[] = [CLAUDE]) {
  loadSampleRecommendations(m.useAtlasStore);
  const base = { ...store(m).recommendations[0], origin: undefined, approvedByAdvisor: false, includeInPdf: false, status: "draft" } as Recommendation;
  const extra: Recommendation[] = [
    { ...base, id: CLAUDE, title: "Claude record (synthetic)", origin: { kind: "claude", models: ["claude-opus-5-5"] } },
    { ...base, id: ADVISOR, title: "Advisor record (synthetic)", origin: { kind: "advisor" } },
    { ...base, id: SCRIPTED, title: "Scripted example record (synthetic)", origin: { kind: "example", source: "scripted_demo" } },
    { ...base, id: UNKNOWN, title: "Older record of unknown origin (synthetic)" },
  ];
  m.useAtlasStore.setState({ recommendations: [...store(m).recommendations, ...extra] });
  for (const id of inDraft) store(m).setDraftMember(id, true);
}

beforeEach(() => {
  vi.resetModules();
  storage.clear();
});
afterEach(() => vi.useRealTimers());

describe("examples are listed apart from Claude and advisor recommendations", () => {
  it("All: the list holds Claude, advisor and unrecorded records; scripted examples have their own section; the six samples sit collapsed under Saved examples (6)", async () => {
    const m = await load();
    legacyWorkspace(m);
    const html = render(m, "all");
    expect(cards(html)).toHaveLength(10);
    const main = between(html, "recs-main", "run-examples");
    expect(cards(main).sort()).toEqual([ADVISOR, CLAUDE, UNKNOWN].sort());
    expect(main).toContain("Origin not recorded");
    const scripted = between(html, "run-examples", "saved-examples");
    expect(scripted).toContain("Scripted and test examples (1)");
    expect(cards(scripted)).toEqual([SCRIPTED]);
    const saved = section(html, "saved-examples");
    expect(saved).toMatch(/^data-testid="saved-examples"[^>]*>/);
    expect(saved.slice(0, saved.indexOf(">"))).not.toMatch(/\sopen/); // collapsed by default
    expect(saved).toContain("Saved examples (6)");
    expect(cards(saved).sort()).toEqual(m.SEED_RECOMMENDATIONS.map((r) => r.id).sort());
    expect(saved).toContain("6 records are labelled");
    // The view's explanation counts the examples it holds.
    expect(html).toContain("7 of these are examples, listed separately below.");
    // Unknown origins stay unknown: nothing is inferred as Claude.
    expect(m.exampleKind(store(m).recommendations.find((r) => r.id === UNKNOWN)!)).toBeNull();
    expect(m.originLabel(store(m).recommendations.find((r) => r.id === UNKNOWN)!).label).toBe("Origin not recorded");
  });

  it("Current draft: only its members, in the same groups; no saved-examples section when none of its members is a sample", async () => {
    const m = await load();
    legacyWorkspace(m, [CLAUDE, SCRIPTED]);
    const html = render(m, "draft");
    expect(cards(html).sort()).toEqual([CLAUDE, SCRIPTED].sort());
    expect(html).not.toContain('data-testid="saved-examples"');
    expect(html).toContain("1 of them is an example, listed separately below.");
  });

  it("a workspace holding only samples shows the empty state, not the samples", async () => {
    const m = await load();
    loadSampleRecommendations(m.useAtlasStore);
    const html = render(m, "all");
    expect(html).toContain("No recommendations added yet.");
    expect(html).not.toContain('data-testid="recs-main"');
    expect(html).toContain("Saved examples (6)");
    expect(html).not.toMatch(/no analysis has run/i);
  });
});

describe("bulk approval describes the records in view", () => {
  it("'Approve all listed' counts and approves only the pending Claude and advisor records in view, never an example", async () => {
    const m = await load();
    legacyWorkspace(m, [CLAUDE, ADVISOR, SCRIPTED, m.SEED_RECOMMENDATIONS[0].id]);
    const html = render(m, "draft");
    expect(html).toContain("Approve all listed (2)");
    expect(store(m).approveAllRecommendations([CLAUDE, ADVISOR])).toBe(2);
    const byId = (id: string) => store(m).recommendations.find((r) => r.id === id)!;
    expect(byId(CLAUDE).approvedByAdvisor).toBe(true);
    expect(byId(ADVISOR).approvedByAdvisor).toBe(true);
    expect(byId(SCRIPTED).approvedByAdvisor).toBe(false);
    expect(byId(m.SEED_RECOMMENDATIONS[0].id).approvedByAdvisor).toBe(false);
    expect(byId(UNKNOWN).approvedByAdvisor).toBe(false); // outside the draft: not in view
    expect(render(m, "draft")).toContain("All listed approved");
    // Without ids, the store action keeps its earlier meaning (every pending record).
    expect(store(m).approveAllRecommendations()).toBeGreaterThan(0);
  });
});

describe("approved examples still affect the proposal", () => {
  it("a notice says so wherever their cards are; Remove from the working proposal withdraws approval and membership, keeps every record, origin and version", async () => {
    const m = await load();
    const sample = "rec_replace_high_fee";
    legacyWorkspace(m, [CLAUDE, SCRIPTED, sample]);
    const approve = (id: string) => store(m).upsertRecommendation({ ...store(m).recommendations.find((r) => r.id === id)!, approvedByAdvisor: true, status: "approved", includeInPdf: true });
    for (const id of [CLAUDE, SCRIPTED, sample]) approve(id);
    expect(store(m).recommendations.filter((r) => r.approvedByAdvisor).map((r) => r.id).sort()).toEqual([CLAUDE, SCRIPTED, sample].sort());
    // An approved version taken earlier (synthetic record): the action must not touch it.
    const version = { id: "snap_synthetic", version: 1, fingerprint: "synthetic", inputs: { recommendations: structuredClone(store(m).recommendations) } };
    m.useAtlasStore.setState({ snapshots: [version as never] });
    const snapshotsBefore = JSON.stringify(store(m).snapshots);

    // The sample's card is collapsed in All and absent from a draft view without it, but the notice is on every view.
    for (const view of ["all", "draft"]) {
      const html = render(m, view);
      expect(html).toContain('data-testid="approved-examples-notice"');
      expect(html).toContain("2 approved examples still affect this proposal.");
    }
    const before = structuredClone(store(m).recommendations);
    // Non-examples among the ids are ignored: the Claude record keeps its approval.
    expect(store(m).withdrawExamplesFromProposal([SCRIPTED, sample, CLAUDE])).toBe(2);
    const after = store(m).recommendations;
    expect(after.map((r) => r.id)).toEqual(before.map((r) => r.id)); // nothing created or deleted
    for (const id of [SCRIPTED, sample]) {
      const r = after.find((x) => x.id === id)!;
      expect(r).toMatchObject({ approvedByAdvisor: false, includeInPdf: false });
      expect(store(m).workingDraft.memberIds).not.toContain(id);
      const was = before.find((x) => x.id === id)!;
      expect(m.knownOrigin(r)).toEqual(m.knownOrigin(was)); // origin untouched, not marked edited
      expect(m.originLabel(r).label).toBe(m.originLabel(was).label);
      expect({ ...r, approvedByAdvisor: was.approvedByAdvisor, includeInPdf: was.includeInPdf, status: was.status, updatedAt: was.updatedAt }).toEqual(was);
    }
    expect(after.find((r) => r.id === CLAUDE)!.approvedByAdvisor).toBe(true);
    expect(store(m).workingDraft.memberIds).toContain(CLAUDE);
    expect(JSON.stringify(store(m).snapshots)).toBe(snapshotsBefore);
    expect(render(m, "all")).not.toContain('data-testid="approved-examples-notice"');
    // Doing it again changes nothing.
    expect(store(m).withdrawExamplesFromProposal([SCRIPTED, sample])).toBe(0);
  });

  it("a withdrawn workspace backs up and restores exactly (no backup schema change)", async () => {
    const m = await load();
    legacyWorkspace(m, [SCRIPTED]);
    store(m).upsertRecommendation({ ...store(m).recommendations.find((r) => r.id === SCRIPTED)!, approvedByAdvisor: true, status: "approved", includeInPdf: true });
    store(m).withdrawExamplesFromProposal([SCRIPTED]);
    const ids = { disclosureIds: m.DISCLOSURE_LIBRARY.map((d) => d.id) };
    const exported = m.exportBackup(store(m), new Date("2026-11-23T12:00:00Z"), ids);
    if (!exported.ok) throw new Error(exported.errors.join("; "));
    const before = structuredClone(store(m).recommendations);
    store(m).resetSeed();
    const parsed = m.parseBackup(exported.text, ids);
    if (!parsed.ok) throw new Error(parsed.errors.join("; "));
    expect(store(m).restoreWorkspace(m.restoredState(parsed.backup, { advisor: store(m).advisor, disclosures: m.DISCLOSURE_LIBRARY }, { replaceFirm: false }))).toEqual({ ok: true });
    expect(store(m).recommendations).toEqual(before);
  });
});
