import { describe, expect, it } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import type { Account, Holding, WorkingDraft } from "@/domain/types";
import type { CopilotSnapshot } from "@/copilot/snapshot";
import { runAgent, type CopilotResult, type MessagesClient } from "@/copilot/agent";
import { CopilotContext, executeTool } from "@/copilot/tools";
import { checkFigures } from "@/copilot/evidence";
import { createTestProvider } from "@/copilot/testProvider";
import { AGENT_EVAL_CASES } from "@/copilot/eval/cases";
import { gradeRun } from "@/copilot/eval/grade";
import { agentContextOf } from "@/copilot/context";
import { liveEvalConfig, type LiveEvalConfig } from "@/copilot/eval/budget";
import { runLiveSuite, type SuiteReport } from "@/copilot/eval/runner";
import { newWorkingDraft } from "@/engines/allocationDesk";
import { STORY_ACCOUNTS, STORY_HOLDINGS } from "@/data/allocationStory";
import { SEED_ADVISOR, SEED_CLIENT } from "@/data/seedClient";
import { DISCLOSURE_LIBRARY } from "@/domain/disclosureLibrary";

// D4 review round 2 (Codex findings, 29 October 2026): regressions written
// before their fixes. No paid call: every client here is a fake. Synthetic data only.

type Params = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
type Msg = Anthropic.Beta.BetaMessage;
const NOW = new Date("2026-10-28T12:00:00Z");
const INVEST = "acc_story_invest";

function snap(over: Partial<CopilotSnapshot> = {}): CopilotSnapshot & { workingDraft: WorkingDraft } {
  const accounts: Account[] = STORY_ACCOUNTS.map((a) => (a.id === INVEST ? { ...a, funding: { cashHoldingId: "h_story_cash", reserve: 5_000, reserveCurrency: "USD" } } : a));
  return {
    client: { ...SEED_CLIENT, id: "cli_r2", fullName: "Round Two Household", proposalOutputCurrency: "USD" },
    advisor: SEED_ADVISOR,
    accounts,
    holdings: STORY_HOLDINGS,
    fxRates: [],
    recommendations: [],
    disclosures: DISCLOSURE_LIBRARY,
    sourceDocuments: [],
    fxConfirmation: null,
    workingDraft: { ...newWorkingDraft(NOW.toISOString()), scopeAccountIds: [INVEST] },
    alternatives: [],
    ...over,
  } as CopilotSnapshot & { workingDraft: WorkingDraft };
}

let n = 0;
const msg = (content: unknown[], stop: Msg["stop_reason"] = "end_turn", usage: Record<string, unknown> = {}): Msg =>
  ({ id: `m${++n}`, type: "message", role: "assistant", model: "claude-opus-5-5", content, stop_reason: stop, stop_sequence: null, usage: { input_tokens: 100, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, ...usage } }) as unknown as Msg;
const use = (name: string, input: Record<string, unknown> = {}) => ({ type: "tool_use", id: `tu${++n}`, name, input });
const say = (text: string) => ({ type: "text", text, citations: null });
function fake(turns: ((p: Params, i: number, o?: { signal?: AbortSignal }) => Msg | Promise<Msg>)[]) {
  const calls: Params[] = [];
  const client: MessagesClient = {
    beta: { messages: { create: async (p, o) => (calls.push(JSON.parse(JSON.stringify(p))), turns[Math.min(calls.length - 1, turns.length - 1)](p, calls.length - 1, o)) } },
  };
  return { client, calls };
}
const run = (s: CopilotSnapshot, client: MessagesClient, extra: Record<string, unknown> = {}) =>
  runAgent(s, "Review this alternative.", { client, mode: "live", provider: "anthropic", now: NOW, sleep: async () => {}, ...extra });

describe("1. live-evaluation runner controls", () => {
  const env = { ATLAS_AGENT_LIVE_EVAL: "1", ANTHROPIC_API_KEY: "test-key-not-real", AGENT_EVAL_MAX_USD: "25", AGENT_EVAL_CONFIRM_SPEND: "25", AGENT_EVAL_MAX_REQUESTS: "200" };

  it("rejects unknown or empty case selections and non-integer trial counts", () => {
    const bad = (e: Record<string, string>) => {
      const r = liveEvalConfig({ ...env, ...e });
      return r.ok ? [] : r.errors;
    };
    expect(bad({ AGENT_EVAL_CASES: "valued_concentration,not_a_case" }).join(" ")).toMatch(/Unknown case.*not_a_case/);
    expect(bad({ AGENT_EVAL_CASES: " , " }).join(" ")).toMatch(/selects no case/);
    expect(bad({ AGENT_EVAL_TRIALS: "2.5" }).join(" ")).toMatch(/whole number/);
    expect(liveEvalConfig({ ...env, AGENT_EVAL_CASES: "valued_concentration", AGENT_EVAL_TRIALS: "1" })).toMatchObject({ ok: true, config: { cases: ["valued_concentration"], trials: 1 } });
  });

  const config = (over: Partial<LiveEvalConfig>): LiveEvalConfig => ({ model: "claude-opus-5-5", maxUsd: 25, maxRequests: 200, trials: 1, cases: null, ...over });
  const usage = { input_tokens: 40_000, output_tokens: 4_000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  const answerOnly = (): MessagesClient => ({ beta: { messages: { create: async () => msg([say("No change proposed.")], "end_turn", usage) } } });
  const collect = () => {
    const written: SuiteReport[] = [];
    return { written, write: (r: SuiteReport) => void written.push(JSON.parse(JSON.stringify(r))) };
  };

  it("fails on a critical failure and still writes the sanitized report", async () => {
    const { written, write } = collect();
    // The test provider drafts a position in a case that allows advisory drafts only.
    const report = await runLiveSuite({ config: config({ cases: ["existing_action"] }), makeClient: createTestProvider, write, now: () => NOW });
    expect(report.verdict).toMatchObject({ pass: false, scope: "subset" });
    expect(report.verdict.reasons.join(" ")).toMatch(/critical/);
    expect(written).toHaveLength(1);
    expect(written[0].summary.criticalFailures).toBeGreaterThan(0);
    expect(JSON.stringify(written[0])).not.toMatch(/Round Two|answer"|rationale/);
  });

  it("fails with zero coverage when the spend guard stops the first request, and writes the report", async () => {
    const { written, write } = collect();
    const report = await runLiveSuite({ config: config({ cases: ["valued_concentration"], maxUsd: 0.01 }), makeClient: answerOnly, write, now: () => NOW });
    expect(report.coverage).toMatchObject({ planned: 1, completed: 0 });
    expect(report.verdict.pass).toBe(false);
    expect(report.verdict.reasons.join(" ")).toMatch(/No selected trial completed/);
    expect(written).toHaveLength(1);
  });

  it("fails on interrupted coverage and lists the missing trials", async () => {
    const { written, write } = collect();
    // Each answer costs about USD 0.24; the guard refuses once a worst-case request could cross USD 4.
    const report = await runLiveSuite({ config: config({ cases: ["valued_concentration", "cross_currency"], trials: 3, maxUsd: 4 }), makeClient: answerOnly, write, now: () => NOW });
    expect(report.coverage.completed).toBeGreaterThan(0);
    expect(report.coverage.completed).toBeLessThan(6);
    expect(report.coverage.interrupted).toMatch(/Spend cap/);
    expect(report.coverage.missing.length).toBe(6 - report.coverage.completed);
    expect(report.verdict.pass).toBe(false);
    expect(report.verdict.reasons.join(" ")).toMatch(/incomplete/);
    expect(written).toHaveLength(1);
  });

  it("labels a passing subset as a subset, and only all 9 cases × 3 trials as the full suite", async () => {
    const subset = await runLiveSuite({ config: config({ cases: ["valued_concentration"], trials: 1 }), makeClient: createTestProvider, write: () => {}, now: () => NOW });
    expect(subset.verdict).toMatchObject({ pass: true, scope: "subset" });
    expect(subset.verdict.reasons.join(" ")).toMatch(/subset/);
    const full = await runLiveSuite({ config: config({ trials: 3, maxUsd: 50, maxRequests: 400 }), makeClient: answerOnly, write: () => {}, now: () => NOW });
    expect(full.coverage).toMatchObject({ planned: 27, completed: 27, interrupted: null });
    expect(full.verdict).toMatchObject({ pass: true, scope: "full_suite" });
    expect(AGENT_EVAL_CASES).toHaveLength(9);
  });
});

describe("2. typed financial evidence", () => {
  const ev = { money: (value: number, currency = "USD") => ({ value, unit: "money" as const, currency }), percent: (value: number) => ({ value, unit: "percent" as const }) };

  it("checks currency, unit and sign; ambiguous claims stay explicitly unchecked", () => {
    const evidence = [[ev.money(-5_000), ev.money(60_000), ev.percent(12.5)]];
    expect(checkFigures(["-$5,000 and $60,000.00 and 12.5%"], evidence)).toMatchObject({ claims: 3, unsupported: [], unchecked: [] });
    expect(checkFigures(["+$5,000"], evidence).unsupported).toEqual(["+$5,000"]);
    expect(checkFigures(["€60,000.00"], evidence).unsupported).toEqual(["€60,000.00"]);
    expect(checkFigures(["$12.50"], evidence).unsupported).toEqual(["$12.50"]);
    expect(checkFigures(["60,000%"], evidence).unsupported).toEqual(["60,000%"]);
    // No sign written while the engine's only match is negative: direction unchecked, not matched.
    expect(checkFigures(["$5,000"], evidence)).toMatchObject({ unsupported: [], unchecked: ["$5,000"] });
    // A bare grouped number has no unit to check.
    expect(checkFigures(["60,000"], evidence)).toMatchObject({ unsupported: [], unchecked: ["60,000"] });
  });

  it("the loop's evidence keeps the reporting currency and signs: a wrong-currency or wrong-sign answer is not 'all matched'", async () => {
    const { client } = fake([
      () => msg([use("get_scope_overview"), use("simulate_scope_change", { holding_id: "h_story_equity", change: "reduce", amount: 10_000 })], "tool_use"),
      () => msg([say("Equity ETF A goes from €60,000.00 to €50,000.00, a change of +$10,000.00; equity ends at 50.0%.")]),
    ]);
    const r = await run(snap(), client);
    expect(r.figures.unsupported).toEqual(["€60,000.00", "€50,000.00", "+$10,000.00"]);
    expect(r.figures.matched).toBe(1);
  });

  it("the grader reports unchecked figures explicitly", () => {
    const c = AGENT_EVAL_CASES[0];
    const s = c.snapshot();
    const base = { mode: "test", status: "completed", answer: "x", drafts: [], trace: [], evidence: [], forbiddenAttempts: 0 } as unknown as CopilotResult;
    const g = gradeRun(c, { ...base, context: agentContextOf(s), figures: { claims: 2, matched: 1, unsupported: [], unchecked: ["60,000"] } }, s, s, "");
    expect(g.checks.find((x) => x.name === "no unchecked figures")).toMatchObject({ critical: false, pass: false, detail: "60,000" });
  });
});

describe("3. advisory classification uses the engine's cent-level rule", () => {
  it("a sub-dollar position change needs a simulation and obeys scope, cash, valuation and import safeguards", () => {
    const ctx = new CopilotContext(snap(), NOW);
    const draft = (holding_id: string, action_amount: number, type = "reduce") => executeTool(ctx, "draft_recommendation", { holding_id, type, action_amount, priority: "low", title: "Tiny trim", rationale: "A sub-dollar change." });
    expect(draft("h_story_equity", 0.5).content).toMatch(/must come from a simulation/);
    expect(draft("h_story_equity", 0.01).content).toMatch(/must come from a simulation/);
    // Out of scope and cash still can't be sized, even below a dollar.
    expect(draft("h_story_home", 0.5).content).toMatch(/must come from a simulation/);
    expect(JSON.parse(executeTool(ctx, "simulate_scope_change", { holding_id: "h_story_home", change: "reduce", amount: 0.5 }).isError ? '{"err":1}' : "{}")).toEqual({ err: 1 });
    expect(executeTool(ctx, "simulate_scope_change", { holding_id: "h_story_cash", change: "reduce", amount: 0.5 }).content).toMatch(/Cash and liabilities/);
    expect(ctx.drafts).toHaveLength(0);
    // Missing FX: the sizing message, not an advisory draft.
    const eur: Holding = { ...STORY_HOLDINGS[0], id: "h_eur", currency: "EUR" };
    const noRate = new CopilotContext(snap({ holdings: [...STORY_HOLDINGS, eur] }), NOW);
    expect(executeTool(noRate, "draft_recommendation", { holding_id: "h_story_equity", type: "reduce", action_amount: 0.5, priority: "low", title: "Tiny trim", rationale: "A sub-dollar change." }).content).toMatch(/Valuation is incomplete/);
    // A genuinely allocation-neutral advisory draft is still allowed.
    expect(executeTool(ctx, "draft_recommendation", { holding_id: "h_story_equity", type: "review_source_data", priority: "low", title: "Check the statement", rationale: "Confirm the statement date." }).isError).toBe(false);
  });
});

describe("4. terminal checks after every response", () => {
  it("a final answer that arrives after the deadline ends as the time limit, not completed", async () => {
    let clock = 0;
    const { client } = fake([() => ((clock = 150_000), msg([say("All done.")]))]);
    expect((await run(snap(), client, { clock: () => clock })).status).toBe("deadline");
  });

  it("a response that arrives after cancellation runs none of its tools", async () => {
    const ctrl = new AbortController();
    const { client } = fake([() => (ctrl.abort(), msg([use("draft_recommendation", { type: "custom", title: "Should not save", priority: "low", rationale: "Arrived after cancel." })], "tool_use"))]);
    const r = await run(snap(), client, { signal: ctrl.signal });
    expect(r).toMatchObject({ status: "cancelled", drafts: [], trace: [] });
  });

  it("fallback attempts count toward the output limit, and a terminal answer past it is not 'completed'", async () => {
    const iterations = [
      { type: "message", model: "claude-opus-5-5", input_tokens: 100, output_tokens: 900, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      { type: "fallback_message", model: "claude-opus-5", input_tokens: 100, output_tokens: 900, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    ];
    const { client, calls } = fake([() => msg([say("Answered after a fallback.")], "end_turn", { output_tokens: 900, iterations })]);
    const r = await run(snap(), client, { limits: { maxOutputTokens: 1_000 } });
    expect(calls[0].max_tokens).toBe(1_000);
    expect(r.usage?.outputTokens).toBe(1_800);
    expect(r.status).toBe("budget_exceeded");
    expect(r.answer).toMatch(/Answered after a fallback/);
  });
});
