import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadSampleRecommendations } from "./support/sampleRecommendations";
import * as React from "react";
import * as fs from "node:fs";
import * as path from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import type { ClientProfile, Recommendation, WorkingDraft } from "@/domain/types";

// PR #110, the remaining Codex findings at 527407e: the conversation across
// view changes, client-stated evidence only from structured answers, and the
// origin of duplicated actions. Through the real page component, agent loop,
// figure checker and store actions. Synthetic data only; no provider call.

vi.mock("zustand", async (orig) => ({ ...(await orig<typeof import("zustand")>()), create: (await import("./support/liveStore")).liveCreate }));
const nav = vi.hoisted(() => ({ search: "" }));
vi.mock("next/navigation", async (orig) => ({ ...(await orig<typeof import("next/navigation")>()), useSearchParams: () => new URLSearchParams(nav.search), usePathname: () => "/copilot" }));

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
  (globalThis as { window?: unknown }).window = { localStorage: s, location: { search: "", href: "http://localhost/copilot", pathname: "/copilot", hash: "" }, history: { pushState() {}, replaceState() {} } };
  return s;
});

const NOW = new Date("2026-11-21T12:00:00Z");
const T = NOW.toISOString();

async function load() {
  return {
    ...(await import("react-dom/server")),
    ...(await import("@/store/useStore")),
    ...(await import("@/data/allocationStory")),
    ...(await import("@/data/seedClient")),
    ...(await import("@/data/seedRecommendations")),
    ...(await import("@/domain/disclosureLibrary")),
    ...(await import("@/engines/allocationDesk")),
    ...(await import("@/engines/recommendationAmounts")),
    ...(await import("@/engines/clientDiscovery")),
    ...(await import("@/engines/recommendationOrigin")),
    ...(await import("@/copilot/agent")),
    ...(await import("@/components/copilot/CopilotWorkspace")),
    CopilotPage: (await import("@/app/copilot/page")).default,
  };
}
type M = Awaited<ReturnType<typeof load>>;
const store = (m: M) => m.useAtlasStore.getState();

beforeEach(() => {
  vi.resetModules();
  storage.clear();
  nav.search = "";
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe("finding 1: the conversation survives view changes and prefills", () => {
  it("both views stay mounted; the inactive one is hidden, so a switch never unmounts the conversation", async () => {
    const m = await load();
    store(m).resetSeed();
    m.useAtlasStore.setState({ hasHydrated: true });
    for (const search of ["?view=checks", ""]) {
      nav.search = search;
      const html = m.renderToStaticMarkup(React.createElement(m.CopilotPage));
      expect(html, search).toContain('data-testid="copilot-context"');
      expect(html, search).toContain('data-testid="portfolio-checks"');
      const hidden = (id: string) => new RegExp(`<div[^>]*id="panel-${id}"[^>]*hidden`).test(html);
      expect(hidden("analysis")).toBe(search === "?view=checks");
      expect(hidden("checks")).toBe(search !== "?view=checks");
      expect(html).toMatch(search === "?view=checks" ? /id="tab-checks"[^>]*aria-selected="true"/ : /id="tab-analysis"[^>]*aria-selected="true"/);
    }
  });

  it("a prefill never re-keys or remounts the conversation", () => {
    const src = fs.readFileSync(path.join(__dirname, "..", "src", "app", "copilot", "page.tsx"), "utf8");
    expect(src).not.toMatch(/<CopilotWorkspace[^>]*\bkey=/);
    expect(src).not.toMatch(/view === "analysis" \?/);
  });

  it("an answer stays tied to the question it answered; a new question in the box is marked as not yet run", async () => {
    const m = await load();
    const asked = "Review this portfolio.";
    expect(m.answeredQuestionNote(asked, asked)).toBeNull();
    expect(m.answeredQuestionNote(asked, `  ${asked}  `)).toBeNull();
    expect(m.answeredQuestionNote(asked, "Analyze this portfolio check for this client: ...")).toMatch(/earlier question.*nothing has run/i);
  });
});

// --- finding 2 --------------------------------------------------------------
type Params = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;

async function ask(m: M, client: ClientProfile, answer: string) {
  let n = 0;
  const msg = (content: unknown[], stop: string) => ({ id: `m${++n}`, type: "message", role: "assistant", model: m.COPILOT_MODEL, content, stop_reason: stop, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } });
  const fake = {
    beta: {
      messages: {
        async create(params: Params) {
          void params;
          if (n === 0) return msg([{ type: "tool_use", id: "t1", name: "get_portfolio_overview", input: {} }], "tool_use") as never;
          return msg([{ type: "text", text: answer, citations: null }], "end_turn") as never;
        },
      },
    },
  };
  const snapshot = {
    client,
    advisor: m.SEED_ADVISOR,
    accounts: m.STORY_ACCOUNTS,
    holdings: m.STORY_HOLDINGS,
    fxRates: [],
    recommendations: [],
    disclosures: m.DISCLOSURE_LIBRARY,
    sourceDocuments: [],
    fxConfirmation: null,
    workingDraft: { ...m.newWorkingDraft(T), scopeAccountIds: ["acc_story_invest"] } as WorkingDraft,
    alternatives: [],
  };
  return m.runAgent(snapshot as never, "Review this portfolio.", { client: fake as never, mode: "live", provider: "anthropic", now: NOW, sleep: async () => {} });
}

describe("finding 2: client-stated evidence comes only from structured monetary answers", () => {
  const PADDED = ["  Keep USD 987,654,321.23 aside for the family trust.  ", "\nKeep USD 987,654,321.23 aside for the family trust.\n", "\t Keep USD 987,654,321.23 aside.\r\n", "Keep  USD 987,654,321.23   aside."];
  for (const text of PADDED) {
    it(`Other constraints ${JSON.stringify(text)}: an answer calling the figure calculated cash is unsupported, not client-stated`, async () => {
      const m = await load();
      const base: ClientProfile = { ...m.SEED_CLIENT, id: "cli_review", proposalOutputCurrency: "USD", restrictedSecurities: [] };
      for (const client of [m.recordAnswer(base, "otherConstraints", { text }, T), m.recordReview(m.recordAnswer(base, "otherConstraints", { text }, T), T)]) {
        const r = await ask(m, client, "Calculated cash is USD 987,654,321.23.");
        expect(r.figures.clientStated).toEqual([]);
        expect(r.figures.matched).toBe(0);
        expect(r.figures.unsupported).toContain("USD 987,654,321.23");
      }
    });
  }

  it("a clarification's figure is never evidence, whatever its whitespace", async () => {
    const m = await load();
    const base: ClientProfile = { ...m.SEED_CLIENT, id: "cli_review", proposalOutputCurrency: "USD", restrictedSecurities: [] };
    const answered = m.recordAnswer(base, "lossAbility", { level: "moderate" }, T);
    const client = m.setClarification(answered, "lossAbility", "\n  Could absorb USD 61,234.56 at most.  \n", T);
    const r = await ask(m, client, "The client can absorb USD 61,234.56.");
    expect(r.figures.clientStated).toEqual([]);
    expect(r.figures.unsupported).toContain("USD 61,234.56");
  });

  it("structured amounts stay client-stated with their own currency; another currency or a free-text figure doesn't", async () => {
    const m = await load();
    const base: ClientProfile = { ...m.SEED_CLIENT, id: "cli_review", proposalOutputCurrency: "USD", restrictedSecurities: [] };
    let client = m.recordAnswer(base, "liquidity", { need: "planned", amount: 150_000, currency: "USD", timing: "within_1_year" }, T);
    client = m.recordAnswer(client, "income", { need: "needed", amount: 4_000, currency: "EUR", frequency: "monthly" }, T);
    client = m.recordAnswer(client, "otherConstraints", { text: "  Pledge USD 250,000 to the foundation.  " }, T);
    const r = await ask(m, client, "The planned withdrawal is USD 150,000. The income need is EUR 4,000 a month. Not EUR 150,000. The pledge is USD 250,000.");
    expect(r.figures.clientStated.sort()).toEqual(["EUR 4,000", "USD 150,000"]);
    expect(r.figures.unsupported.sort()).toEqual(["EUR 150,000", "USD 250,000"]);
    expect(r.figures.matched).toBe(0);
  });

  it("engine figures still match", async () => {
    const m = await load();
    const base: ClientProfile = { ...m.SEED_CLIENT, id: "cli_review", proposalOutputCurrency: "USD", restrictedSecurities: [] };
    // The story's net worth: the engine's own figure in the overview.
    const r = await ask(m, m.recordAnswer(base, "liquidity", { need: "planned", amount: 150_000, currency: "USD", timing: "within_1_year" }, T), "Net worth is $500,000.");
    expect(r.figures.matched).toBe(1);
    expect(r.figures.clientStated).toEqual([]);
  });
});

// --- finding 3 --------------------------------------------------------------
describe("finding 3: duplicating an alternative keeps each action's known origin", () => {
  it("a prewritten sample, a Claude draft and an advisor record keep their origins; an unknown one stays unknown; copies start unapproved and out of the PDF", async () => {
    const m = await load();
    store(m).resetSeed();
    loadSampleRecommendations(m.useAtlasStore); // #111: the sample no longer preloads them
    const seed = m.SEED_RECOMMENDATIONS[0];
    const claude: Recommendation = { ...seed, id: "rec_ai_claude_synthetic", title: "Claude draft (synthetic)", origin: { kind: "claude", models: ["claude-opus-5-5"], promptVersion: "claude-led-2026-11-21" } };
    const unknown: Recommendation = { ...seed, id: "rec_old_unknown", title: "Older record (synthetic)", sourceInsightKey: "fees:h_high_fee_fund" };
    m.useAtlasStore.setState({ recommendations: [...store(m).recommendations, claude, unknown] });
    store(m).upsertRecommendation({ ...m.newRecommendation("USD"), id: "rec_advisor_synthetic", title: "Advisor record (synthetic)", rationale: "Written by the advisor." });
    for (const id of [seed.id, claude.id, unknown.id, "rec_advisor_synthetic"]) store(m).setDraftMember(id, true);
    store(m).upsertRecommendation({ ...store(m).recommendations.find((r) => r.id === seed.id)!, approvedByAdvisor: true, status: "approved", includeInPdf: true });
    const originals = JSON.stringify(store(m).recommendations);

    store(m).duplicateDraft("Copy (synthetic)");
    const s = store(m);
    const copies = s.workingDraft.memberIds.map((id) => s.recommendations.find((r) => r.id === id)!);
    const byTitle = (t: string) => copies.find((c) => c.title === t)!;
    expect(byTitle(seed.title).origin).toEqual({ kind: "example", source: "sample_workspace" });
    expect(m.originLabel(byTitle(seed.title)).label).toBe("Sample example (prewritten)");
    expect(byTitle(claude.title).origin).toEqual(claude.origin);
    expect(byTitle("Advisor record (synthetic)").origin).toEqual({ kind: "advisor" });
    expect(byTitle(unknown.title).origin).toBeUndefined();
    expect(m.originLabel(byTitle(unknown.title)).label).toBe("Origin not recorded");
    expect(m.originLabel(byTitle(unknown.title)).detail).toMatch(/rule check/);
    for (const c of copies) expect(c).toMatchObject({ approvedByAdvisor: false, includeInPdf: false, status: "draft" });
    // The originals are untouched.
    expect(JSON.stringify(s.recommendations.filter((r) => !s.workingDraft.memberIds.includes(r.id)))).toBe(originals);
  });
});
