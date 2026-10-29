import type Anthropic from "@anthropic-ai/sdk";
import { COPILOT_MODEL, usageEntries, type MessagesClient } from "@/copilot/agent";
import { AGENT_EVAL_CASES } from "./cases";

// D4: limits for the opt-in live evaluation. A paid run needs explicit flags,
// a key, a request limit and a spend cap no higher than the code ceilings.
// The request limit is enforced exactly. The spend cap is a GUARD ON AN
// ESTIMATE, not a guaranteed ceiling: before each request the wrapper prices
// a conservative worst case (the largest input seen plus headroom, billed as
// cache writes; the full max_tokens of output; and, with refusal fallbacks
// on, a full re-run at the highest listed price) and refuses the request if
// that could cross the cap. A next request whose input exceeds the estimate,
// or a price change, could still overshoot it; set the cap with margin.
// Prices are Anthropic first-party list prices from the official pricing page
// on PRICE_DATE; the report records it.

export const PRICE_DATE = "2026-10-29";
/** USD per million tokens (5-minute cache writes; Opus 5.5 cache reads are 0.05x input). */
export const PRICES: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
};
/**
 * Default refusal-fallback routing isn't published per model, so an attempt by
 * any model without a recorded price is billed at the highest list price on the
 * pricing page (retired Opus 4 / 4.1: $15 input, $75 output; 5-minute cache
 * writes $18.75, reads $1.50). Conservative by design.
 */
export const FALLBACK_CEILING = { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 };
const priceOf = (model: string | undefined) => (model && PRICES[model]) || FALLBACK_CEILING;

/** Ceilings no environment setting can exceed. */
export const HARD_CEILINGS = { maxUsd: 50, maxRequests: 400, maxTrials: 5 };

export interface LiveEvalConfig {
  model: string;
  maxUsd: number;
  maxRequests: number;
  trials: number;
  cases: string[] | null;
}

/** The validated configuration, or why a live run must not start. Fails closed. */
export function liveEvalConfig(env: Record<string, string | undefined>, knownCases: string[] = AGENT_EVAL_CASES.map((c) => c.id)): { ok: true; config: LiveEvalConfig } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (env.ATLAS_AGENT_LIVE_EVAL !== "1") errors.push("Set ATLAS_AGENT_LIVE_EVAL=1 to opt in to a paid live evaluation.");
  if (!env.ANTHROPIC_API_KEY) errors.push("ANTHROPIC_API_KEY is not set.");
  const model = env.AGENT_EVAL_MODEL ?? COPILOT_MODEL;
  if (!PRICES[model]) errors.push(`Model ${model} isn't an approved evaluation configuration (supported: ${Object.keys(PRICES).join(", ")}).`);
  const num = (key: string, max: number) => {
    const v = Number(env[key]);
    if (!env[key] || !Number.isFinite(v) || v <= 0) errors.push(`Set ${key} to a positive number (at most ${max}).`);
    else if (v > max) errors.push(`${key}=${v} exceeds the ceiling of ${max}.`);
    return v;
  };
  const maxUsd = num("AGENT_EVAL_MAX_USD", HARD_CEILINGS.maxUsd);
  const maxRequests = num("AGENT_EVAL_MAX_REQUESTS", HARD_CEILINGS.maxRequests);
  const trials = env.AGENT_EVAL_TRIALS ? num("AGENT_EVAL_TRIALS", HARD_CEILINGS.maxTrials) : 3;
  if (env.AGENT_EVAL_TRIALS && Number.isFinite(trials) && !Number.isInteger(trials)) errors.push(`AGENT_EVAL_TRIALS=${env.AGENT_EVAL_TRIALS} must be a whole number of trials.`);
  if (env.AGENT_EVAL_CONFIRM_SPEND !== env.AGENT_EVAL_MAX_USD) errors.push("Set AGENT_EVAL_CONFIRM_SPEND to the same value as AGENT_EVAL_MAX_USD to confirm the spend.");
  // A case selection names known cases only, and at least one; unset means the whole suite.
  let cases: string[] | null = null;
  if (env.AGENT_EVAL_CASES !== undefined) {
    cases = [...new Set(env.AGENT_EVAL_CASES.split(",").map((s) => s.trim()).filter(Boolean))];
    const known = new Set(knownCases);
    const unknown = cases.filter((c) => !known.has(c));
    if (cases.length === 0) errors.push("AGENT_EVAL_CASES selects no case; unset it to run the whole suite.");
    if (unknown.length) errors.push(`Unknown case ID in AGENT_EVAL_CASES: ${unknown.join(", ")} (known: ${knownCases.join(", ")}).`);
  }
  return errors.length ? { ok: false, errors } : { ok: true, config: { model, maxUsd, maxRequests, trials, cases } };
}

export class BudgetExceeded extends Error {}

/**
 * What a configuration would cost: the planned runs, a hard worst case (every
 * run uses all its turns at the full output limit, as cache writes, each
 * also re-run by a fallback at the ceiling price) and an expected
 * estimate from the loop's typical shape (about 5 requests of ~12,000 input
 * and ~1,500 output tokens, with the system prompt and tools cached). The
 * worst case is a ceiling, not a forecast; the spend cap applies either way.
 */
export function planLiveEval(model: string, runs: { maxTurns: number }[], maxTokensPerResponse: number) {
  const perRequestWorst = worstRequestCost(model, 50_000, maxTokensPerResponse, true);
  const worstUsd = runs.reduce((a, r) => a + r.maxTurns * perRequestWorst, 0);
  const expectedPerRun = 5 * costOf(model, { input_tokens: 8_000, cache_read_input_tokens: 4_000, output_tokens: 1_500 });
  return { runs: runs.length, worstUsd, expectedUsd: runs.length * expectedPerRun, expectedPerRunUsd: expectedPerRun, priceDate: PRICE_DATE };
}

export interface Spend {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  usd: number;
}

/** The list-price cost of usage by a model; a model without a recorded price is billed at FALLBACK_CEILING. */
export function costOf(model: string | undefined, u: { input_tokens?: number | null; output_tokens?: number | null; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }): number {
  const p = priceOf(model);
  return ((u.input_tokens ?? 0) * p.input + (u.output_tokens ?? 0) * p.output + (u.cache_read_input_tokens ?? 0) * p.cacheRead + (u.cache_creation_input_tokens ?? 0) * p.cacheWrite) / 1e6;
}

/** A conservative worst case for one request: input billed as cache writes, full output, and with fallbacks a second full attempt at the ceiling price. */
export function worstRequestCost(model: string, inputTokens: number, maxTokens: number, fallbacks: boolean): number {
  const p = priceOf(model);
  const one = (inputTokens * Math.max(p.input, p.cacheWrite) + maxTokens * p.output) / 1e6;
  const fallback = fallbacks ? (inputTokens * FALLBACK_CEILING.cacheWrite + maxTokens * FALLBACK_CEILING.output) / 1e6 : 0;
  return one + fallback;
}

/**
 * Wraps a messages client with the run's limits. The request limit is exact.
 * Before each request it prices the worst case (worstRequestCost on the
 * largest input seen so far plus headroom) and refuses the request if that
 * could cross the spend cap. Spend is the sum over every attempt in
 * usage.iterations, each at its own model's price. A refusal ends the agent
 * run as "failed"; nothing is retried past it. Failed requests carry no usage
 * and are counted as unbilled.
 */
export function budgetedClient(
  inner: MessagesClient,
  cfg: Pick<LiveEvalConfig, "model" | "maxUsd" | "maxRequests">,
  spend: Spend,
  opts: { inputHeadroom?: number; onRequest?: (params: Anthropic.Beta.Messages.MessageCreateParamsNonStreaming) => void; sizing?: { largestInput: number } } = {}
): MessagesClient {
  // The largest input seen; shared across a suite's trials (pass `sizing`) so a new trial doesn't start from the low default.
  const sizing = opts.sizing ?? { largestInput: 20_000 };
  const headroom = opts.inputHeadroom ?? 30_000;
  return {
    beta: {
      messages: {
        async create(params, options) {
          if (params.model !== cfg.model) throw new BudgetExceeded(`Requested model ${params.model} isn't the configured ${cfg.model}.`);
          const worst = worstRequestCost(cfg.model, sizing.largestInput + headroom, params.max_tokens, (params as { fallbacks?: unknown }).fallbacks != null);
          if (spend.requests + 1 > cfg.maxRequests) throw new BudgetExceeded(`Request limit ${cfg.maxRequests} reached.`);
          if (spend.usd + worst > cfg.maxUsd) throw new BudgetExceeded(`Spend cap USD ${cfg.maxUsd} would be at risk (spent ${spend.usd.toFixed(4)}, next request up to ${worst.toFixed(4)}).`);
          opts.onRequest?.(params);
          spend.requests += 1;
          const res = await inner.beta.messages.create(params, options);
          for (const u of usageEntries(res)) {
            spend.inputTokens += u.input_tokens ?? 0;
            spend.outputTokens += u.output_tokens ?? 0;
            spend.cacheReadTokens += u.cache_read_input_tokens ?? 0;
            spend.cacheWriteTokens += u.cache_creation_input_tokens ?? 0;
            spend.usd += costOf(u.model, u);
            sizing.largestInput = Math.max(sizing.largestInput, (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0));
          }
          return res;
        },
      },
    },
  };
}
