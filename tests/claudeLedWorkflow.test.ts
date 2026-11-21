import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as React from "react";
import type { Recommendation } from "@/domain/types";

// The Claude-led recommendation workflow (PR #110, 21 November 2026): no
// rule-to-recommendation path in the normal workflow, Claude as the only
// source of AI recommendations, recommendation origins, and Portfolio checks
// with their basis. Through the real store, route handler, agent loop,
// engines, backup and template. Synthetic data only; no key, no provider call.

vi.mock("zustand", async (orig) => ({ ...(await orig<typeof import("zustand")>()), create: (await import("./support/liveStore")).liveCreate }));

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
  (globalThis as { window?: unknown }).window = { localStorage: s, location: { search: "" } };
  return s;
});

const NOW = new Date("2026-11-21T12:00:00Z");
const INVEST = "acc_story_invest";

async function load() {
  return {
    ...(await import("react-dom/server")),
    ...(await import("@/store/useStore")),
    ...(await import("@/data/allocationStory")),
    ...(await import("@/data/seedClient")),
    ...(await import("@/data/seedRecommendations")),
    ...(await import("@/domain/disclosureLibrary")),
    ...(await import("@/engines/normalizationEngine")),
    ...(await import("@/engines/insightEngine")),
    ...(await import("@/engines/recommendationAmounts")),
    ...(await import("@/engines/allocationDesk")),
    ...(await import("@/engines/recommendationOrigin")),
    ...(await import("@/engines/workspaceBackup")),
    ...(await import("@/engines/approvedSnapshot")),
    ...(await import("@/engines/clientDiscovery")),
    ...(await import("@/engines/importCompleteness")),
    ...(await import("@/copilot/agent")),
    ...(await import("@/copilot/context")),
    ...(await import("@/copilot/demo")),
    ...(await import("@/copilot/testProvider")),
    ...(await import("@/copilot/routeHandler")),
    ...(await import("@/copilot/request")),
    ...(await import("@/copilot/tools")),
    ...(await import("@/components/copilot/CopilotWorkspace")),
    ...(await import("@/components/insights/PortfolioChecks")),
    ...(await import("@/components/layout/Sidebar")),
    ...(await import("@/pdf/templates/ProposalPdfTemplate")),
  };
}
type M = Awaited<ReturnType<typeof load>>;
const store = (m: M) => m.useAtlasStore.getState();

beforeEach(() => {
  vi.resetModules();
  storage.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

/** The allocation story (synthetic), as a fresh client with no recommendations. */
function story(m: M) {
  store(m).startNewClient();
  m.useAtlasStore.setState({
    client: { ...store(m).client, fullName: "Story Household (synthetic)", proposalOutputCurrency: "USD" },
    accounts: m.STORY_ACCOUNTS,
    holdings: m.STORY_HOLDINGS,
    recommendations: [],
    fxRates: [],
  });
  store(m).setDraftScope([INVEST]);
}

const request = (m: M, runAs?: string) => {
  const s = store(m);
  const snapshot = { ...s, sourceDocuments: s.sourceDocuments.map(m.forReadiness) };
  return { question: "Review this portfolio for the client.", snapshot, context: m.agentContextOf(snapshot), ...(runAs ? { runAs } : {}) };
};
const post = (m: M, body: unknown, env: Record<string, string>) =>
  m.handleCopilotPost(new Request("http://127.0.0.1:3000/api/copilot", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), { ...m.defaultDeps(), env } as never);

/** A stand-in for Claude: the test provider's plan, reported under the live model's name. */
function claudeLike(m: M) {
  const inner = m.createTestProvider();
  return {
    beta: {
      messages: {
        async create(params: never, opts?: never) {
          const r = await inner.beta.messages.create(params, opts);
          return { ...r, model: m.COPILOT_MODEL };
        },
      },
    },
  };
}

const SRC = path.join(__dirname, "..", "src");
function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? sourceFiles(path.join(dir, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [path.join(dir, e.name)] : []));
}

describe("1. no rule-to-recommendation path in the normal workflow", () => {
  it("no production source contains the template generator or its button", () => {
    const hits = sourceFiles(SRC).filter((f) => /recommendationFromInsight|Convert to recommendation/.test(fs.readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
    expect(fs.existsSync(path.join(SRC, "engines", "recommendationEngine.ts"))).toBe(false);
  });

  it("importing holdings and generating checks create no recommendation; a new client starts with none", async () => {
    const m = await load();
    store(m).startNewClient();
    expect(store(m).recommendations).toEqual([]);
    const doc = { id: "doc_synthetic", fileName: "synthetic.pdf", uploadedAt: NOW.toISOString(), status: "parsed" } as never;
    store(m).loadImportedEngagement({ accounts: m.STORY_ACCOUNTS, holdings: m.STORY_HOLDINGS, sourceDocument: doc } as never);
    store(m).addImportedToEngagement({ accounts: [], holdings: [], sourceDocument: { ...(doc as object), id: "doc_2" } } as never);
    const checks = m.generateInsights({ holdings: m.normalizeHoldings(store(m).holdings, store(m).fxRates, "USD"), reportingCurrency: "USD" });
    store(m).setInsights(checks);
    expect(checks.length).toBeGreaterThan(0);
    expect(store(m).recommendations).toEqual([]);
  });

  it("Portfolio checks render without any convert action, and rendering them adds nothing", async () => {
    const m = await load();
    store(m).resetSeed();
    const before = store(m).recommendations.length;
    const html = m.renderToStaticMarkup(React.createElement(m.PortfolioChecks, {}));
    expect(html).toContain("Built-in Stratovell rule");
    expect(html).not.toMatch(/Convert to recommendation/i);
    expect(html).toContain("Analyze this finding");
    expect(store(m).recommendations.length).toBe(before);
  });
});

describe("2. Claude is the only source of AI recommendations", () => {
  it("demo mode refuses a request for Claude before running anything; the scripted example must be chosen", async () => {
    const m = await load();
    story(m);
    for (const runAs of [undefined, "claude", "test_provider"]) {
      const r = await post(m, request(m, runAs), { COPILOT_MODE: "demo" });
      expect(r.status).toBe(409);
      const body = await r.json();
      expect(body.code).toBe("run_mode_mismatch");
      expect(body.drafts).toBeUndefined();
    }
    const ok = await post(m, { ...request(m, "scripted_example"), question: "Draft recommendations for the top risks" }, { COPILOT_MODE: "demo" });
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(body.mode).toBe("demo");
    for (const d of body.drafts as Recommendation[]) expect(d.origin).toEqual({ kind: "example", source: "scripted_demo" });
  });

  it("test mode and a fake live session answer only a request for the test provider; the live gate is never reached otherwise", async () => {
    const m = await load();
    story(m);
    expect((await post(m, request(m), { COPILOT_MODE: "test" })).status).toBe(409);
    const t = await post(m, request(m, "test_provider"), { COPILOT_MODE: "test" });
    expect(t.status).toBe(200);
    const drafts = (await t.json()).drafts as Recommendation[];
    expect(drafts.length).toBeGreaterThan(0);
    for (const d of drafts) expect(d.origin).toEqual({ kind: "example", source: "test_provider" });
    // No session exists: a mismatch is refused as a mismatch, before the session gate.
    const fake = await post(m, request(m, "claude"), { COPILOT_MODE: "live", COPILOT_LIVE_PROVIDER: "fake" });
    expect(fake.status).toBe(409);
    expect((await fake.json()).code).toBe("run_mode_mismatch");
    const live = await post(m, request(m, "scripted_example"), { COPILOT_MODE: "live" });
    expect(live.status).toBe(409);
    expect((await live.json()).code).toBe("run_mode_mismatch");
  });

  it("the page's run choice follows the server's actual mode and provider", async () => {
    const m = await load();
    expect(m.analysisRun({ mode: "demo", live: null })).toMatchObject({ runAs: "scripted_example", claudeAvailable: false });
    expect(m.analysisRun({ mode: "test", live: null })).toMatchObject({ runAs: "test_provider", claudeAvailable: false });
    expect(m.analysisRun({ mode: "live", live: { provider: "fake" } as never })).toMatchObject({ runAs: "test_provider", claudeAvailable: false });
    expect(m.analysisRun({ mode: "live", live: { provider: "anthropic" } as never })).toMatchObject({ runAs: "claude", claudeAvailable: true });
    expect(m.analysisRun(null)).toBeNull();
  });

  it("the prompt and the checks tool treat a rule flag as a fact to analyze, not a recommendation", async () => {
    const m = await load();
    expect(m.PROMPT_VERSION).toBe("claude-led-2026-11-21");
    expect(m.TOOLS_VERSION).toBe("claude-led-2026-11-21");
    const tool = m.COPILOT_TOOLS.find((t: { name: string }) => t.name === "list_insights")!;
    expect(tool.description).toMatch(/product default/i);
    expect(tool.description).toMatch(/not a recommendation/i);
    story(m);
    const ctx = new m.CopilotContext(request(m).snapshot as never, NOW);
    const out = JSON.parse(m.executeTool(ctx, "list_insights", {}).content);
    for (const i of out.insights) expect(i.basis.source).toBe("Built-in Stratovell rule");
  });
});

describe("3. recommendation origins", () => {
  it("are stamped from the run's actual provider, never from IDs or notes", async () => {
    const m = await load();
    story(m);
    const snap = request(m).snapshot;
    const claude = await m.runAgent(snap as never, "Review this alternative.", { client: claudeLike(m) as never, mode: "live", provider: "anthropic", now: NOW });
    expect(claude.drafts.length).toBeGreaterThan(0);
    for (const d of claude.drafts) expect(d.origin).toMatchObject({ kind: "claude", models: [m.COPILOT_MODEL], promptVersion: m.PROMPT_VERSION });
    const fake = await m.runAgent(snap as never, "Review this alternative.", { client: m.createTestProvider(), mode: "live", provider: "test", now: NOW });
    for (const d of fake.drafts) {
      expect(d.origin).toEqual({ kind: "example", source: "test_provider" });
      expect(m.originLabel(d).label).not.toMatch(/Claude/);
    }
    // An earlier AI-tool record: its ID and note don't make it Claude's.
    const earlier = { ...claude.drafts[0], origin: undefined } as Recommendation;
    expect(m.originOf(earlier).kind).toBe("unrecorded");
    expect(m.originLabel(earlier).label).not.toMatch(/Claude/);
    expect(m.originLabel(earlier).detail).toMatch(/wasn't recorded/);
  });

  it("acceptance keeps the server's origin; advisor records are advisor-authored; edits keep the source and are marked", async () => {
    const m = await load();
    story(m);
    const r = await m.runAgent(request(m).snapshot as never, "Review this alternative.", { client: claudeLike(m) as never, mode: "live", provider: "anthropic", now: NOW });
    expect(store(m).acceptAgentDrafts(r.drafts, r.context)).toMatchObject({ ok: true });
    const accepted = store(m).recommendations.find((x) => x.id === r.drafts[0].id)!;
    expect(accepted.origin?.kind).toBe("claude");
    expect(accepted.status).toBe("needs_review");

    // Approving or including in the PDF is not an edit.
    store(m).upsertRecommendation({ ...accepted, approvedByAdvisor: true, status: "approved", includeInPdf: true });
    expect(store(m).recommendations.find((x) => x.id === accepted.id)!.origin).toEqual(accepted.origin);
    // A content edit keeps the source and records the edit; approval invalidation is unchanged.
    const approved = store(m).recommendations.find((x) => x.id === accepted.id)!;
    store(m).upsertRecommendation({ ...approved, rationale: `${approved.rationale} Edited by the advisor (synthetic).`, actionAmount: (approved.actionAmount ?? 0) + 100 });
    const edited = store(m).recommendations.find((x) => x.id === accepted.id)!;
    expect(edited.origin).toMatchObject({ kind: "claude", editedByAdvisorAt: NOW.toISOString() });
    expect(edited.approvedByAdvisor).toBe(false);
    expect(m.originLabel(edited).label).toBe("Claude draft, edited by advisor");

    // A new advisor recommendation, and a desk edit.
    const own = { ...m.newRecommendation("USD"), title: "Advisor note (synthetic)", rationale: "Written by the advisor." };
    store(m).upsertRecommendation(own);
    expect(store(m).recommendations.find((x) => x.id === own.id)!.origin).toEqual({ kind: "advisor" });
    const desk = m.positionEditRecommendation({ holding: m.STORY_HOLDINGS[0], kind: "reduce", amount: 1_000, reportingCurrency: "USD", id: "rec_desk_synthetic", now: NOW.toISOString() });
    store(m).addDraftEdit(desk);
    expect(store(m).recommendations.find((x) => x.id === desk.id)!.origin).toEqual({ kind: "advisor" });

    // A draft that arrives without an origin is never called Claude's or the advisor's.
    const bare = { ...r.drafts[0], id: "rec_ai_bare", origin: undefined } as Recommendation;
    const again = await m.runAgent(request(m).snapshot as never, "Review.", { client: m.createTestProvider(), mode: "test", provider: "test", now: NOW });
    void again;
    const ctx = m.agentContextOf({ ...store(m), sourceDocuments: store(m).sourceDocuments.map(m.forReadiness) } as never);
    store(m).acceptAgentDrafts([{ ...bare, relatedHoldingId: undefined, actionAmount: undefined, type: "custom" } as Recommendation], ctx);
    expect(store(m).recommendations.find((x) => x.id === "rec_ai_bare")?.origin).toEqual({ kind: "unrecorded" });
  });

  it("older records keep no stored origin and are labelled from reliable evidence only", async () => {
    const m = await load();
    const seed = m.SEED_RECOMMENDATIONS[0];
    expect(seed.origin).toBeUndefined();
    expect(m.originLabel(seed).label).toBe("Sample example (prewritten)");
    const template = { ...seed, id: "rec_old_template", sourceInsightKey: "concentration:h_aapl" } as Recommendation;
    expect(m.originOf(template)).toEqual({ kind: "unrecorded" });
    expect(m.originLabel(template).detail).toMatch(/rule check/);
    const unknown = { ...seed, id: "rec_old_unknown" } as Recommendation;
    expect(m.originLabel(unknown).label).toBe("Origin not recorded");
  });

  it("a discovery edit after the answer still makes the preview stale", async () => {
    const m = await load();
    story(m);
    const r = await m.runAgent(request(m).snapshot as never, "Review this alternative.", { client: m.createTestProvider(), mode: "test", provider: "test", now: NOW });
    expect(r.drafts.length).toBeGreaterThan(0);
    store(m).setDiscoveryAnswer("objectives", { primary: "reduce_concentration", secondary: ["preserve_wealth"] });
    const res = store(m).acceptAgentDrafts(r.drafts, r.context);
    expect(res.ok).toBe(false);
    expect(store(m).recommendations).toEqual([]);
  });
});

describe("3b. origins in backups and approved versions", () => {
  it("v11 backups carry origin through export, restore and reload; an invalid origin or an older envelope with one is refused", async () => {
    const m = await load();
    story(m);
    const r = await m.runAgent(request(m).snapshot as never, "Review this alternative.", { client: claudeLike(m) as never, mode: "live", provider: "anthropic", now: NOW });
    store(m).acceptAgentDrafts(r.drafts, r.context);
    const ids = m.DISCLOSURE_LIBRARY.map((d) => d.id);
    const text = m.serializeBackup(m.createBackup(store(m), NOW));
    const parsed = m.parseBackup(text, { disclosureIds: ids });
    if (!parsed.ok) throw new Error(parsed.errors.join("; "));
    expect(parsed.backup.engagement.recommendations.find((x) => x.id === r.drafts[0].id)!.origin).toEqual(r.drafts[0].origin);

    const bad = JSON.parse(text);
    bad.engagement.recommendations[0].origin = { kind: "claude_said_so" };
    expect(m.parseBackup(JSON.stringify(bad), { disclosureIds: ids }).ok).toBe(false);
    const noModel = JSON.parse(text);
    noModel.engagement.recommendations[0].origin = { kind: "claude" };
    expect(m.parseBackup(JSON.stringify(noModel), { disclosureIds: ids }).ok).toBe(false);
    const older = JSON.parse(text);
    older.workspaceVersion = 10;
    delete older.engagement.client.discovery;
    older.engagement.snapshots = [];
    expect(m.parseBackup(JSON.stringify(older), { disclosureIds: ids }).ok).toBe(false);
    delete older.engagement.recommendations[0].origin;
    // Without the newer field the same v10 file is accepted (strict, not broken).
    expect(m.parseBackup(JSON.stringify(older), { disclosureIds: ids }).ok).toBe(true);
  });

  it("a new version freezes each action's origin; the meeting view and PDF render the same records without printing it", async () => {
    const m = await load();
    story(m);
    const r = await m.runAgent(request(m).snapshot as never, "Review this alternative.", { client: claudeLike(m) as never, mode: "live", provider: "anthropic", now: NOW });
    store(m).acceptAgentDrafts(r.drafts, r.context);
    for (const rec of store(m).recommendations) store(m).upsertRecommendation({ ...rec, approvedByAdvisor: true, status: "approved", includeInPdf: true });
    const v = store(m).approveVersion("Synthetic approval.");
    if (!v.ok) throw new Error(v.failing.join("; "));
    const frozen = v.snapshot.inputs.recommendations.find((x) => x.id === r.drafts[0].id)!;
    expect(frozen.origin?.kind).toBe("claude");
    expect(m.versionOrigins(v.snapshot)).toEqual({ claude: 1, claudeEdited: 0, advisor: 0, example: 0, unrecorded: 0 });
    expect(m.snapshotStatus(v.snapshot, store(m) as never, NOW)).toEqual({ kind: "matches" });
    // The final-PDF route's strict check accepts it.
    expect(m.checkSnapshot(JSON.parse(JSON.stringify(v.snapshot))).ok).toBe(true);

    const props = m.snapshotTemplateProps(v.snapshot, { variant: "final", presentation: "meeting", timeZone: "UTC" });
    const stripped = { ...props, recommendations: props.recommendations.map(({ origin, ...rest }) => (void origin, rest)) };
    const withOrigin = m.renderToStaticMarkup(React.createElement(m.ProposalPdfTemplate, props as never));
    const without = m.renderToStaticMarkup(React.createElement(m.ProposalPdfTemplate, stripped as never));
    expect(withOrigin).toBe(without);
    expect(withOrigin).not.toMatch(/Claude draft|Generated by Claude/);
  });
});

describe("4. Portfolio checks", () => {
  it("each check states its rule, observed figure, product-default threshold, scope, valuation date and limits; no trade-prescribing wording", async () => {
    const m = await load();
    store(m).resetSeed();
    const s = store(m);
    const checks = m.generateInsights({ holdings: m.normalizeHoldings(s.holdings, s.fxRates, s.client.proposalOutputCurrency), reportingCurrency: s.client.proposalOutputCurrency });
    const conc = checks.find((i) => i.category === "concentration")!;
    expect(conc.basis).toMatchObject({ source: "Built-in Stratovell rule" });
    expect(conc.basis!.observed).toMatch(/% of investible assets/);
    expect(conc.basis!.threshold).toMatch(/8%.*product default/);
    expect(conc.basis!.threshold).toMatch(/not a regulatory limit/);
    expect(conc.basis!.scope).toMatch(/every account in the household/i);
    expect(conc.basis!.valuationDates).toMatch(/\d{4}/);
    for (const i of checks) {
      expect(i.basis, i.title).toBeDefined();
      expect(`${i.title} ${i.detail}`).not.toMatch(/Consider (trimming|hedging|whether a lower-cost)|rebalanc|Higher-than-target|higher than target/i);
    }
    const cash = checks.find((i) => i.title.startsWith("Cash represents"));
    if (cash) expect(cash.detail).toMatch(/No client cash target was evaluated/);
  });

  it("thresholds are unchanged", async () => {
    const m = await load();
    const h = (id: string, v: number, extra: object = {}) => ({ ...m.STORY_HOLDINGS[0], id, assetName: `Issuer ${id}`, assetType: "stock", nativeMarketValue: v, ...extra });
    const at = (pct: number) => m.generateInsights({ holdings: m.normalizeHoldings([h("x", pct), h("rest", 100 - pct, { assetType: "etf", assetName: "Index ETF" })] as never, [], "USD"), reportingCurrency: "USD" }).filter((i) => i.category === "concentration").length;
    expect(at(7.9)).toBe(0);
    expect(at(8)).toBe(1);
  });

  it("Insights leaves the primary navigation; /insights redirects to Portfolio checks; analyzing a finding only prefills the question", async () => {
    const m = await load();
    expect(m.NAV.map((n) => n.href)).not.toContain("/insights");
    expect(m.NAV.find((n) => n.href === "/copilot")?.label).toBe("Stratovell AI");
    const page = (await import("@/app/insights/page")).default;
    let target = "";
    try {
      page();
    } catch (e) {
      target = String((e as { digest?: string }).digest ?? e);
    }
    expect(target).toContain("/copilot?view=checks");
    store(m).resetSeed();
    const s = store(m);
    const conc = m.generateInsights({ holdings: m.normalizeHoldings(s.holdings, s.fxRates, "USD"), reportingCurrency: "USD" }).find((i) => i.category === "concentration")!;
    const q = m.findingQuestion(conc);
    expect(q).toContain(conc.title);
    expect(q).toContain(conc.basis!.threshold!);
    expect(q).toMatch(/client brief/);
    expect(store(m).recommendations).toEqual(s.recommendations);
  });
});
