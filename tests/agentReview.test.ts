import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import type { Account, Holding, Recommendation, WorkingDraft } from "@/domain/types";
import type { CopilotSnapshot } from "@/copilot/snapshot";

// D4 review (29 October 2026): regressions for defects confirmed in the
// focused review of PR #82, written before their fixes. Synthetic data only.

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

type Params = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
type Msg = Anthropic.Beta.BetaMessage;

const NOW = new Date("2026-10-28T12:00:00Z");
const INVEST = "acc_story_invest";
const CLIENT_NAME = "Rowan Canaryfield";

async function load() {
  return {
    ...(await import("@/copilot/agent")),
    ...(await import("@/copilot/tools")),
    ...(await import("@/copilot/context")),
    ...(await import("@/copilot/eval/budget")),
    ...(await import("@/engines/allocationDesk")),
    ...(await import("@/engines/importCompleteness")),
    ...(await import("@/data/allocationStory")),
    ...(await import("@/data/seedClient")),
    ...(await import("@/domain/disclosureLibrary")),
    ...(await import("@/store/useStore")),
  };
}
type M = Awaited<ReturnType<typeof load>>;

beforeEach(() => {
  vi.resetModules();
  storage.clear();
});
afterEach(() => vi.restoreAllMocks());

function snap(m: M, over: Partial<CopilotSnapshot> = {}): CopilotSnapshot & { workingDraft: WorkingDraft } {
  const accounts: Account[] = m.STORY_ACCOUNTS.map((a) => (a.id === INVEST ? { ...a, funding: { cashHoldingId: "h_story_cash", reserve: 5_000, reserveCurrency: "USD" } } : a));
  return {
    client: { ...m.SEED_CLIENT, id: "cli_review", fullName: CLIENT_NAME, householdName: `${CLIENT_NAME} Household`, proposalOutputCurrency: "USD" },
    advisor: { ...m.SEED_ADVISOR },
    accounts,
    holdings: m.STORY_HOLDINGS,
    fxRates: [],
    recommendations: [],
    disclosures: m.DISCLOSURE_LIBRARY,
    sourceDocuments: [],
    fxConfirmation: null,
    workingDraft: { ...m.newWorkingDraft(NOW.toISOString()), scopeAccountIds: [INVEST] },
    alternatives: [],
    ...over,
  } as CopilotSnapshot & { workingDraft: WorkingDraft };
}

let n = 0;
const msg = (content: unknown[], stop: Msg["stop_reason"] = "end_turn", usage: Record<string, unknown> = {}, model = "claude-opus-5-5"): Msg =>
  ({ id: `m${++n}`, type: "message", role: "assistant", model, content, stop_reason: stop, stop_sequence: null, usage: { input_tokens: 100, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, ...usage } }) as unknown as Msg;
const use = (name: string, input: Record<string, unknown> = {}) => ({ type: "tool_use", id: `tu${++n}`, name, input });
const say = (text: string) => ({ type: "text", text, citations: null });
const lastResults = (p: Params) => {
  const last = p.messages[p.messages.length - 1];
  return typeof last.content === "string" ? [] : (last.content.filter((b) => b.type === "tool_result") as Anthropic.Beta.BetaToolResultBlockParam[]);
};
function fake(turns: ((p: Params, i: number) => Msg | Promise<Msg>)[]) {
  const calls: Params[] = [];
  return {
    calls,
    client: {
      beta: {
        messages: {
          async create(p: Params) {
            calls.push(JSON.parse(JSON.stringify(p)));
            return turns[Math.min(calls.length - 1, turns.length - 1)](p, calls.length - 1);
          },
        },
      },
    },
  };
}
const run = (m: M, s: CopilotSnapshot, client: unknown, extra: Record<string, unknown> = {}) =>
  m.runAgent(s, "Review this alternative.", { client: client as never, mode: "live", provider: "anthropic", now: NOW, sleep: async () => {}, ...extra });

describe("financial evidence", () => {
  it("figures written in holding names or other untrusted text are not engine evidence", async () => {
    const m = await load();
    const holdings = m.STORY_HOLDINGS.map((h) => (h.id === "h_story_bond" ? { ...h, assetName: "Bond ETF A — guaranteed 12.5% yield, $250,000 bonus" } : h));
    const { client } = fake([
      () => msg([use("get_portfolio_overview"), use("get_scope_overview"), use("list_insights")], "tool_use"),
      () => msg([say("Bond ETF A pays a guaranteed 12.5% and a $250,000 bonus; the scope totals $100,000.00.")]),
    ]);
    const r = await run(m, snap(m, { holdings }), client);
    expect(r.figures.unsupported).toEqual(["12.5%", "$250,000"]);
  });

  it("a purchase that deepens an existing reserve breach is not draftable (the engine reports, never drops, an ordinary edit's breach)", async () => {
    const m = await load();
    // An existing action leaves the eligible cash at 3,000, under the 5,000 reserve.
    const buy = m.positionEditRecommendation({ holding: m.STORY_HOLDINGS[1], kind: "increase", amount: 7_000, reportingCurrency: "USD", id: "rec_existing_buy", now: NOW.toISOString() });
    const s = snap(m, { recommendations: [buy], workingDraft: { ...snap(m).workingDraft, memberIds: [buy.id] } });
    const ctx = new m.CopilotContext(s, NOW);
    const sim = JSON.parse(m.executeTool(ctx, "simulate_scope_change", { holding_id: "h_story_equity", change: "increase", amount: 1_000 }).content);
    expect(sim.draftable).toBe(false);
    expect(sim.not_draftable_reason).toMatch(/reserve/);
  });

  it("each simulation in a run builds on the drafts already saved, so two purchases can't each pass alone and breach together", async () => {
    const m = await load();
    const ctx = new m.CopilotContext(snap(m), NOW);
    const first = JSON.parse(m.executeTool(ctx, "simulate_scope_change", { holding_id: "h_story_bond", change: "increase", amount: 3_000 }).content);
    expect(first.draftable).toBe(true);
    expect(m.executeTool(ctx, "draft_recommendation", { simulation_id: first.simulation_id, type: "increase", priority: "low", title: "Add to bonds", rationale: "First purchase." }).isError).toBe(false);
    // Cash 10,000 - 3,000 - 3,000 = 4,000, under the 5,000 reserve.
    const second = JSON.parse(m.executeTool(ctx, "simulate_scope_change", { holding_id: "h_story_equity", change: "increase", amount: 3_000 }).content);
    expect(second.draftable).toBe(false);
    expect(second.not_draftable_reason).toMatch(/reserve/);
  });
});

describe("acceptance", () => {
  it("refuses a selection whose combined effect leaves a unit blocked, a new shortfall or a new reserve breach", async () => {
    const m = await load();
    const s = snap(m);
    m.useAtlasStore.setState({ client: s.client, accounts: s.accounts, holdings: s.holdings, recommendations: [], fxRates: [], sourceDocuments: [], fxConfirmation: null, workingDraft: s.workingDraft, alternatives: [] });
    const st = m.useAtlasStore.getState();
    const context = m.agentContextOf({ ...st, sourceDocuments: st.sourceDocuments.map(m.forReadiness) });
    const draft = (id: string, holding: Holding): Recommendation => ({ ...m.positionEditRecommendation({ holding, kind: "increase", amount: 3_000, reportingCurrency: "USD", id, now: NOW.toISOString() }), status: "needs_review" });
    const before = JSON.stringify(st.recommendations);
    const r = st.acceptAgentDrafts([draft("rec_ai_a", m.STORY_HOLDINGS[1]), draft("rec_ai_b", m.STORY_HOLDINGS[0])], context);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toMatch(/reserve/);
    expect(JSON.stringify(m.useAtlasStore.getState().recommendations)).toBe(before);
  });

  it("a client-profile change (for example a new restricted security) invalidates a pending answer", async () => {
    const m = await load();
    const s = snap(m);
    const ref = m.agentContextOf(s);
    expect(m.contextMismatch(ref, { ...s, client: { ...s.client, restrictedSecurities: ["Equity ETF A"] } })).toMatch(/changed/);
  });
});

describe("orchestration", () => {
  it("an unexpected tool failure is reported to the model and the run ends truthfully, not as a crash", async () => {
    const m = await load();
    const broken = m.STORY_HOLDINGS.map((h) => (h.id === "h_story_bond" ? ({ ...h, dataQuality: { length: 1 } } as unknown as Holding) : h));
    const { client } = fake([
      () => msg([use("get_holding", { holding_id: "h_story_bond" })], "tool_use"),
      (p) => {
        const [res] = lastResults(p);
        expect(res.is_error).toBe(true);
        expect(String(res.content)).toMatch(/failed unexpectedly/);
        expect(String(res.content)).not.toMatch(/TypeError|at .*\.ts/);
        return msg([say("That holding couldn't be read.")]);
      },
    ]);
    const r = await run(m, snap(m, { holdings: broken }), client);
    expect(r.status).toBe("completed");
    expect(r.trace[0]).toMatchObject({ name: "get_holding", ok: false });
  });

  it("the route answers an unreadable workspace with a clear 422, not an unhandled error", async () => {
    const m = await load();
    const { POST } = await import("@/app/api/copilot/route");
    const { copilotRequest } = await import("./support/copilotRequest");
    const holdings = m.STORY_HOLDINGS.map((h) => (h.id === "h_story_bond" ? ({ ...h, dataQuality: undefined } as unknown as Holding) : h));
    const res = await POST(new Request("http://localhost/api/copilot", { method: "POST", body: JSON.stringify(copilotRequest("hi", snap(m, { holdings }))) }));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/couldn't read this workspace/);
  });

  it("the run's output-token limit is hard: each request asks for no more than what remains", async () => {
    const m = await load();
    const { client, calls } = fake([
      () => msg([use("get_scope_overview")], "tool_use", { output_tokens: 800 }),
      () => msg([use("get_scope_overview")], "tool_use", { output_tokens: 200 }),
      () => msg([say("never requested")]),
    ]);
    const r = await run(m, snap(m), client, { limits: { maxOutputTokens: 1_000 } });
    expect(calls[0].max_tokens).toBe(1_000);
    expect(calls[1].max_tokens).toBe(200);
    expect(calls).toHaveLength(2);
    expect(r.status).toBe("budget_exceeded");
  });

  it("a request timeout at the deadline ends as the time limit, not a generic failure", async () => {
    const m = await load();
    let clock = 0;
    const { client } = fake([
      () => {
        clock = 200_000;
        throw new Anthropic.APIConnectionTimeoutError();
      },
    ]);
    const r = await run(m, snap(m), client, { clock: () => clock });
    expect(r.status).toBe("deadline");
  });

  it("usage counts every attempt in usage.iterations, including a declined attempt before a fallback", async () => {
    const m = await load();
    const iterations = [
      { type: "message", model: "claude-opus-5-5", input_tokens: 1_000, output_tokens: 300, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      { type: "fallback_message", model: "claude-opus-5", input_tokens: 1_000, output_tokens: 500, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    ];
    const { client } = fake([() => msg([say("Answered by the fallback.")], "end_turn", { input_tokens: 1_000, output_tokens: 500, iterations }, "claude-opus-5")]);
    const r = await run(m, snap(m), client);
    expect(r.usage).toMatchObject({ inputTokens: 2_000, outputTokens: 800 });
    expect(r.provider).toMatchObject({ actualModels: ["claude-opus-5"], fallbackUsed: true });
  });
});

describe("privacy", () => {
  it("the client's name, household name and import file names never reach the model, even inside account names, notes or the question", async () => {
    const m = await load();
    const accounts = snap(m).accounts.map((a) => (a.id === INVEST ? { ...a, name: `${CLIENT_NAME} Household — Brokerage` } : a));
    const doc = { id: "doc_r", fileName: `${CLIENT_NAME.replace(" ", "_")}_statement_2026.pdf`, importCompleteness: { status: "incomplete", reason: "total_mismatch", stated: 110_000, extracted: 100_000, currency: "USD", unreadableRows: 0 } };
    const holdings = m.STORY_HOLDINGS.map((h) => (h.accountId === INVEST ? { ...h, sourceTrace: { sourceDocumentId: "doc_r" } } : h)) as Holding[];
    const recs: Recommendation[] = [{ ...m.positionEditRecommendation({ holding: m.STORY_HOLDINGS[0], kind: "reduce", amount: 500, reportingCurrency: "USD", id: "rec_note", now: NOW.toISOString() }), rationale: `Discussed with ${CLIENT_NAME} on the phone.` }];
    const { client, calls } = fake([
      () => msg([use("get_portfolio_overview"), use("get_scope_overview"), use("check_proposal_readiness"), use("get_holding", { holding_id: "h_story_equity" })], "tool_use"),
      () => msg([say("Done.")]),
    ]);
    await m.runAgent(snap(m, { accounts, holdings, sourceDocuments: [doc as never], recommendations: recs }), `What should ${CLIENT_NAME} do?`, { client: client as never, mode: "live", provider: "anthropic", now: NOW });
    const sent = JSON.stringify(calls);
    expect(sent).not.toContain("Canaryfield");
    expect(sent).not.toContain("statement_2026.pdf");
  });
});

describe("live-evaluation spend accounting (no paid call)", () => {
  it("prices every attempt, a fallback at a conservative ceiling, and checks the worst next request including a fallback re-run", async () => {
    const m = await load();
    const iterations = [
      { type: "message", model: "claude-opus-5-5", input_tokens: 10_000, output_tokens: 1_000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      { type: "fallback_message", model: "claude-unlisted-fallback", input_tokens: 10_000, output_tokens: 2_000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    ];
    const inner = { beta: { messages: { create: async () => ({ model: "claude-unlisted-fallback", content: [], usage: { input_tokens: 10_000, output_tokens: 2_000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, iterations } }) as never } } };
    const spend = { requests: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, usd: 0 };
    const client = m.budgetedClient(inner as never, { model: "claude-opus-5-5", maxUsd: 50, maxRequests: 10 }, spend);
    await client.beta.messages.create({ model: "claude-opus-5-5", max_tokens: 16_000, messages: [] } as never);
    // Declined attempt at Opus 5.5 rates + fallback at the ceiling rate: more than the fallback alone at Opus 5.5 rates.
    const opusOnly = m.costOf("claude-opus-5-5", { input_tokens: 10_000, output_tokens: 2_000 });
    expect(spend.usd).toBeGreaterThan(opusOnly + m.costOf("claude-opus-5-5", { input_tokens: 10_000, output_tokens: 1_000 }));
    expect(spend.outputTokens).toBe(3_000);
    // A cap that covers one plain worst-case request but not a fallback re-run is refused before sending.
    const tight = m.budgetedClient(inner as never, { model: "claude-opus-5-5", maxUsd: 1, maxRequests: 10 }, { ...spend, requests: 0, usd: 0 });
    // As the loop sends it: with server-side refusal fallbacks on.
    await expect(tight.beta.messages.create({ model: "claude-opus-5-5", max_tokens: 16_000, fallbacks: "default", messages: [] } as never)).rejects.toThrow(/Spend cap/);
  });
});
