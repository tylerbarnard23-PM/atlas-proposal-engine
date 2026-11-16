import { describe, expect, it } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { COPILOT_MODEL, DEFAULT_LIMITS, runAgent, type MessagesClient } from "@/copilot/agent";
import { createTestProvider } from "@/copilot/testProvider";
import { AGENT_EVAL_CASES } from "@/copilot/eval/cases";
import { BudgetExceeded, budgetedClient, costOf, newSpend, worstRequestCost, type LiveEvalConfig } from "@/copilot/eval/budget";
import { runLiveSuite, type SuiteReport } from "@/copilot/eval/runner";

// The pilot runner's accounting (budgetedClient in src/copilot/eval/budget.ts):
// a response's cost counts as known only with complete accounting
// (pricedUsage); otherwise the conservative reservation made before sending is
// kept, the trial ends with the reason, and the evaluation can't pass. Fake
// providers only; no paid call is made here.

const NOW = new Date("2026-11-10T12:00:00Z");
const MAX = DEFAULT_LIMITS.maxTokensPerResponse;
const params = (extra: Record<string, unknown> = {}) => ({ model: COPILOT_MODEL, max_tokens: MAX, messages: [], ...extra }) as never;
// The reservation for a first request: the default sizing (20,000) plus headroom (30,000).
const FIRST = worstRequestCost(COPILOT_MODEL, 50_000, MAX, false);
const FIRST_WITH_FALLBACK = worstRequestCost(COPILOT_MODEL, 50_000, MAX, true);
const cfg = (over: Partial<LiveEvalConfig> = {}) => ({ model: COPILOT_MODEL, maxUsd: 50, maxRequests: 50, ...over });

type Res = Record<string, unknown>;
const reply = (usage: unknown, extra: Res = {}): Res => ({ id: "m", type: "message", role: "assistant", model: COPILOT_MODEL, content: [{ type: "text", text: "No change proposed.", citations: null }], stop_reason: "end_turn", stop_sequence: null, usage, ...extra });
/** A fake provider that returns (or throws) each step in turn and counts the calls it received. */
function provider(steps: (() => Res | Promise<Res>)[]) {
  let calls = 0;
  const client: MessagesClient = { beta: { messages: { create: async () => (await steps[Math.min(calls++, steps.length - 1)]()) as never } } };
  return { client, calls: () => calls };
}
const VALID = { input_tokens: 10_000, output_tokens: 2_000, cache_read_input_tokens: 5_000, cache_creation_input_tokens: 1_000 };

describe("pilot accounting: unknown usage is never read as USD 0", () => {
  const unknown: [string, unknown, RegExp][] = [
    ["no usage", undefined, /no usage/],
    ["null usage", null, /no usage/],
    ["no output count", { input_tokens: 10 }, /input or output/],
    ["no input count", { output_tokens: 10 }, /input or output/],
    ["a negative count", { input_tokens: -1, output_tokens: 10 }, /input or output/],
    ["a non-number count", { input_tokens: "10", output_tokens: 10 }, /input or output/],
    ["an invalid cache count", { input_tokens: 10, output_tokens: 10, cache_read_input_tokens: Number.NaN }, /cache_read_input_tokens/],
  ];
  for (const [name, usage, reason] of unknown) {
    it(`${name}: keeps the reservation, ends with the reason and refuses later requests`, async () => {
      const spend = newSpend();
      const { client: inner, calls } = provider([() => reply(usage)]);
      const client = budgetedClient(inner, cfg(), spend);
      const err = await client.beta.messages.create(params()).then(() => null, (e) => e);
      expect(err).toBeInstanceOf(BudgetExceeded);
      expect(err.message).toMatch(/no valid usage accounting/);
      expect(err.message).toMatch(reason);
      expect(spend).toMatchObject({ requests: 1, attempts: 0, pricedUsd: 0, reservedUsd: 0, unknownRequests: 1 });
      expect(spend.retainedUsd).toBeCloseTo(FIRST, 10);
      expect(spend.usd).toBeCloseTo(FIRST, 10);
      expect(spend.inputTokens + spend.outputTokens).toBe(0);
      expect(spend.unknownReasons).toHaveLength(1);
      expect(spend.accountingStop).toMatch(reason);
      // Refused before sending: the provider isn't called again and nothing more is counted.
      await expect(client.beta.messages.create(params())).rejects.toThrow(/charge is unknown/);
      await expect(budgetedClient(inner, cfg(), spend).beta.messages.create(params())).rejects.toThrow(/charge is unknown/);
      expect(calls()).toBe(1);
      expect(spend.requests).toBe(1);
    });
  }

  it("malformed fallback accounting keeps the reservation (at the fallback worst case)", async () => {
    const good = { type: "message", model: COPILOT_MODEL, input_tokens: 100, output_tokens: 10 };
    const cases: [unknown, RegExp][] = [
      [{ input_tokens: 100, output_tokens: 10, iterations: [good, { type: "fallback_message", input_tokens: 100, output_tokens: 10 }] }, /attempt 2 of 2 doesn't name the model/],
      [{ input_tokens: 100, output_tokens: 10, iterations: [good, { type: "fallback_message", model: "claude-x" }] }, /attempt 2 of 2 lacks valid/],
      [{ input_tokens: 100, output_tokens: 10, iterations: [good, null] }, /attempt 2 of 2 has no usage/],
      [{ input_tokens: 100, output_tokens: 10, iterations: "two" }, /isn't a list/],
    ];
    for (const [usage, reason] of cases) {
      const spend = newSpend();
      const client = budgetedClient(provider([() => reply(usage)]).client, cfg(), spend);
      await expect(client.beta.messages.create(params({ fallbacks: "default" }))).rejects.toThrow(reason);
      expect(spend.retainedUsd).toBeCloseTo(FIRST_WITH_FALLBACK, 10);
      expect(spend).toMatchObject({ pricedUsd: 0, attempts: 0, unknownRequests: 1 });
    }
  });
});

describe("pilot accounting: complete accounting settles the reservation", () => {
  it("valid zero usage settles at a known USD 0, and later requests are allowed", async () => {
    const spend = newSpend();
    const client = budgetedClient(provider([() => reply({ input_tokens: 0, output_tokens: 0, cache_read_input_tokens: null, cache_creation_input_tokens: null })]).client, cfg(), spend);
    await client.beta.messages.create(params());
    await client.beta.messages.create(params());
    expect(spend).toMatchObject({ requests: 2, attempts: 2, usd: 0, pricedUsd: 0, retainedUsd: 0, reservedUsd: 0, unknownRequests: 0, accountingStop: null });
  });

  it("prices valid cache accounting exactly and sums the tokens", async () => {
    const spend = newSpend();
    const client = budgetedClient(provider([() => reply(VALID)]).client, cfg(), spend);
    await client.beta.messages.create(params());
    expect(spend.pricedUsd).toBeCloseTo(costOf(COPILOT_MODEL, VALID), 12);
    expect(spend.usd).toBeCloseTo(spend.pricedUsd, 12);
    expect(spend).toMatchObject({ inputTokens: 10_000, outputTokens: 2_000, cacheReadTokens: 5_000, cacheWriteTokens: 1_000, retainedUsd: 0, reservedUsd: 0 });
  });

  it("prices a complete fallback record attempt by attempt", async () => {
    const iterations = [
      { type: "message", model: COPILOT_MODEL, input_tokens: 10_000, output_tokens: 1_000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      { type: "fallback_message", model: "claude-unlisted-fallback", input_tokens: 10_000, output_tokens: 2_000, cache_read_input_tokens: null, cache_creation_input_tokens: null },
    ];
    const spend = newSpend();
    await budgetedClient(provider([() => reply({ input_tokens: 10_000, output_tokens: 2_000, iterations }, { model: "claude-unlisted-fallback" })]).client, cfg(), spend).beta.messages.create(params({ fallbacks: "default" }));
    expect(spend.attempts).toBe(2);
    expect(spend.pricedUsd).toBeCloseTo(costOf(COPILOT_MODEL, iterations[0]) + costOf("claude-unlisted-fallback", { input_tokens: 10_000, output_tokens: 2_000 }), 12);
    expect(spend.outputTokens).toBe(3_000);
    expect(spend.retainedUsd).toBe(0);
  });

  it("doesn't double count: a settled reservation is released before the next request is checked", async () => {
    // The cap fits one reservation plus small priced usage, never two reservations.
    const spend = newSpend();
    const client = budgetedClient(provider([() => reply({ input_tokens: 100, output_tokens: 100 })]).client, cfg({ maxUsd: FIRST * 1.5 }), spend);
    for (let i = 0; i < 5; i++) await client.beta.messages.create(params());
    expect(spend.requests).toBe(5);
    expect(spend.usd).toBeCloseTo(5 * costOf(COPILOT_MODEL, { input_tokens: 100, output_tokens: 100 }), 12);
    expect(spend.reservedUsd).toBe(0);
  });

  it("reserves before sending: a request in flight counts toward the cap", async () => {
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    const spend = newSpend();
    const { client: inner, calls } = provider([async () => (await held, reply({ input_tokens: 100, output_tokens: 100 }))]);
    const client = budgetedClient(inner, cfg({ maxUsd: FIRST * 1.5 }), spend);
    const first = client.beta.messages.create(params());
    expect(spend.reservedUsd).toBeCloseTo(FIRST, 10);
    expect(spend.usd).toBeCloseTo(FIRST, 10);
    await expect(client.beta.messages.create(params())).rejects.toThrow(/Spend cap/);
    release();
    await first;
    expect(calls()).toBe(1);
    expect(spend.reservedUsd).toBe(0);
  });
});

describe("pilot accounting: failures leave the charge unknown", () => {
  const failures: [string, () => never][] = [
    ["a server error", () => { throw new Anthropic.InternalServerError(500, { error: { message: "payload-canary" } }, "boom payload-canary", new Headers()); }],
    ["a timeout", () => { throw new Anthropic.APIConnectionTimeoutError(); }],
    ["a cancellation", () => { throw new Anthropic.APIUserAbortError(); }],
  ];
  for (const [name, fail] of failures) {
    it(`${name}: counts the request, keeps the reservation and rethrows the original error`, async () => {
      const spend = newSpend();
      let thrown: unknown;
      const inner: MessagesClient = { beta: { messages: { create: async () => { try { return fail(); } catch (e) { thrown = e; throw e; } } } } };
      const err = await budgetedClient(inner, cfg(), spend).beta.messages.create(params()).then(() => null, (e) => e);
      expect(err).toBe(thrown);
      expect(spend).toMatchObject({ requests: 1, attempts: 0, pricedUsd: 0, reservedUsd: 0, unknownRequests: 1 });
      expect(spend.retainedUsd).toBeCloseTo(FIRST, 10);
      expect(spend.unknownReasons[0]).toMatch(/charge is unknown/);
      expect(JSON.stringify(spend)).not.toContain("payload-canary");
    });
  }

  it("counts the loop's retry as a sent request and keeps the failed request's reservation", async () => {
    const spend = newSpend();
    const { client: inner, calls } = provider([
      () => { throw new Anthropic.InternalServerError(529, { error: { message: "overloaded" } }, "overloaded", new Headers()); },
      () => reply({ input_tokens: 100, output_tokens: 100 }),
    ]);
    const c = AGENT_EVAL_CASES[0];
    const result = await runAgent(c.snapshot(), c.question, { client: budgetedClient(inner, cfg(), spend), mode: "live", provider: "anthropic", now: NOW, sleep: async () => {} });
    expect(result.status).toBe("completed");
    expect(calls()).toBe(2);
    expect(spend).toMatchObject({ requests: 2, attempts: 1, unknownRequests: 1 });
    expect(spend.retainedUsd).toBeCloseTo(worstRequestCost(COPILOT_MODEL, 50_000, MAX, true), 10);
    expect(spend.usd).toBeCloseTo(spend.retainedUsd + costOf(COPILOT_MODEL, { input_tokens: 100, output_tokens: 100 }), 12);
  });

  it("kept reservations make the guard refuse requests that could cross the cap", async () => {
    const spend = newSpend();
    const { client: inner, calls } = provider([() => { throw new Anthropic.APIConnectionTimeoutError(); }]);
    const client = budgetedClient(inner, cfg({ maxUsd: FIRST * 2.5 }), spend);
    await expect(client.beta.messages.create(params())).rejects.toThrow(/timed out/i);
    await expect(client.beta.messages.create(params())).rejects.toThrow(/timed out/i);
    await expect(client.beta.messages.create(params())).rejects.toThrow(/Spend cap/);
    expect(calls()).toBe(2);
    expect(spend.retainedUsd).toBeCloseTo(2 * FIRST, 10);
  });
});

describe("pilot accounting across the selected evaluation (runner)", () => {
  const config = (over: Partial<LiveEvalConfig>): LiveEvalConfig => ({ model: COPILOT_MODEL, maxUsd: 25, maxRequests: 200, trials: 1, cases: ["valued_concentration"], ...over });
  const collect = () => {
    const written: SuiteReport[] = [];
    return { written, write: (r: SuiteReport) => void written.push(JSON.parse(JSON.stringify(r))) };
  };

  it("missing usage ends the evaluation with the reason, fails the verdict and still writes the report", async () => {
    const { written, write } = collect();
    let made = 0;
    let sent = 0;
    const makeClient = (): MessagesClient => (made++, { beta: { messages: { create: async () => (sent++, reply(undefined) as never) } } });
    const report = await runLiveSuite({ config: config({ trials: 2 }), makeClient, write, now: () => NOW });
    expect(sent).toBe(1);
    expect(made).toBe(1);
    expect(report.verdict).toMatchObject({ pass: false, scope: "subset" });
    expect(report.verdict.reasons.join(" ")).toMatch(/Accounting incomplete: 1 request/);
    expect(report.coverage).toMatchObject({ planned: 2, completed: 0 });
    expect(report.coverage.interrupted).toMatch(/no valid usage accounting/);
    expect(report.runs[0].budgetStop).toMatch(/no valid usage accounting/);
    expect(report.spend).toMatchObject({ requests: 1, unknownRequests: 1, pricedUsd: 0 });
    expect(report.spend.retainedUsd).toBeGreaterThan(0);
    expect(report.spend.usd).toBe(report.spend.retainedUsd);
    expect(written).toHaveLength(1);
    expect(written[0].verdict.pass).toBe(false);
  });

  it("a failed request with an unknown charge stops the evaluation after its trial and fails the verdict", async () => {
    const { write, written } = collect();
    let sent = 0;
    // A non-retryable failure: the loop ends the trial as "failed" without another request.
    const makeClient = (): MessagesClient => ({ beta: { messages: { create: async () => { sent++; throw new Anthropic.BadRequestError(400, { error: { message: "payload-canary" } }, "bad payload-canary", new Headers()); } } } });
    const report = await runLiveSuite({ config: config({ cases: ["valued_concentration", "cross_currency"] }), makeClient, write, now: () => NOW });
    expect(sent).toBe(1);
    expect(report.runs).toHaveLength(1);
    expect(report.runs[0].status).toBe("failed");
    expect(report.runs[0].budgetStop).toMatch(/charge is unknown/);
    expect(report.coverage).toMatchObject({ planned: 2, completed: 0 });
    expect(report.verdict.pass).toBe(false);
    expect(report.verdict.reasons.join(" ")).toMatch(/Accounting incomplete/);
    expect(JSON.stringify(written[0])).not.toContain("payload-canary");
  });

  it("carries accounting across trials: valid zero usage passes a subset, and spend is the sum of every trial", async () => {
    const report = await runLiveSuite({ config: config({ trials: 2 }), makeClient: createTestProvider, write: () => {}, now: () => NOW });
    expect(report.verdict).toMatchObject({ pass: true, scope: "subset" });
    expect(report.spend).toMatchObject({ usd: 0, pricedUsd: 0, retainedUsd: 0, reservedUsd: 0, unknownRequests: 0, accountingStop: null });
    expect(report.spend.requests).toBeGreaterThan(2);
    expect(report.spend.attempts).toBe(report.spend.requests);
  });

  it("an unknown charge in a later trial fails a selection whose earlier trials passed", async () => {
    let trial = 0;
    const makeClient = (): MessagesClient => {
      trial++;
      const inner = createTestProvider();
      return trial === 1 ? inner : { beta: { messages: { create: async (p, o) => ({ ...(await inner.beta.messages.create(p, o)), usage: { input_tokens: 5 } }) as never } } };
    };
    const report = await runLiveSuite({ config: config({ trials: 3 }), makeClient, write: () => {}, now: () => NOW });
    expect(report.runs.map((r) => !!r.budgetStop)).toEqual([false, true]);
    expect(report.coverage).toMatchObject({ planned: 3, completed: 1 });
    expect(report.verdict.pass).toBe(false);
    expect(report.verdict.reasons.join(" ")).toMatch(/Accounting incomplete: 1 request/);
  });
});
