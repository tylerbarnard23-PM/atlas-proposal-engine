import type Anthropic from "@anthropic-ai/sdk";
import { COPILOT_MODEL, type MessagesClient } from "@/copilot/agent";

// D4: hard limits for the opt-in live evaluation. A paid run needs explicit
// flags, a key and a spend cap no higher than the code ceiling; every request
// is checked against a worst-case cost first, so the cap is never crossed by
// more than an estimate error, and the run stops cleanly. Prices are the
// Anthropic first-party rates recorded on PRICE_DATE; the report says so.

export const PRICE_DATE = "2026-10-06";
/** USD per million tokens. Cache writes are 1.25x input (5-minute cache). */
export const PRICES: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
};

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
export function liveEvalConfig(env: Record<string, string | undefined>): { ok: true; config: LiveEvalConfig } | { ok: false; errors: string[] } {
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
  if (env.AGENT_EVAL_CONFIRM_SPEND !== env.AGENT_EVAL_MAX_USD) errors.push("Set AGENT_EVAL_CONFIRM_SPEND to the same value as AGENT_EVAL_MAX_USD to confirm the spend.");
  const cases = env.AGENT_EVAL_CASES ? env.AGENT_EVAL_CASES.split(",").map((s) => s.trim()).filter(Boolean) : null;
  return errors.length ? { ok: false, errors } : { ok: true, config: { model, maxUsd, maxRequests, trials: Math.floor(trials), cases } };
}

export class BudgetExceeded extends Error {}

/**
 * What a configuration would cost: the planned runs, a hard worst case (every
 * run uses all its turns at the full output limit, uncached) and an expected
 * estimate from the loop's typical shape (about 5 requests of ~12,000 input
 * and ~1,500 output tokens, with the system prompt and tools cached). The
 * worst case is a ceiling, not a forecast; the spend cap applies either way.
 */
export function planLiveEval(model: string, runs: { maxTurns: number }[], maxTokensPerResponse: number) {
  const perRequestWorst = costOf(model, { input_tokens: 50_000, output_tokens: maxTokensPerResponse });
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

export function costOf(model: string, u: { input_tokens?: number | null; output_tokens?: number | null; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }): number {
  const p = PRICES[model];
  if (!p) throw new Error(`No price for ${model}`);
  return ((u.input_tokens ?? 0) * p.input + (u.output_tokens ?? 0) * p.output + (u.cache_read_input_tokens ?? 0) * p.cacheRead + (u.cache_creation_input_tokens ?? 0) * p.cacheWrite) / 1e6;
}

/**
 * Wraps a messages client with the run's hard limits. Before each request it
 * assumes the worst case (the largest input seen so far plus headroom, billed
 * uncached, and the full max_tokens of output) and refuses the request if
 * that could cross the cap or the request limit. A refusal ends the agent run
 * as "failed"; nothing is retried past it.
 */
export function budgetedClient(inner: MessagesClient, cfg: Pick<LiveEvalConfig, "model" | "maxUsd" | "maxRequests">, spend: Spend, opts: { inputHeadroom?: number; onRequest?: (params: Anthropic.Beta.Messages.MessageCreateParamsNonStreaming) => void } = {}): MessagesClient {
  let largestInput = 20_000;
  const headroom = opts.inputHeadroom ?? 30_000;
  return {
    beta: {
      messages: {
        async create(params, options) {
          if (params.model !== cfg.model) throw new BudgetExceeded(`Requested model ${params.model} isn't the configured ${cfg.model}.`);
          const worst = costOf(cfg.model, { input_tokens: largestInput + headroom, output_tokens: params.max_tokens });
          if (spend.requests + 1 > cfg.maxRequests) throw new BudgetExceeded(`Request limit ${cfg.maxRequests} reached.`);
          if (spend.usd + worst > cfg.maxUsd) throw new BudgetExceeded(`Spend cap USD ${cfg.maxUsd} would be at risk (spent ${spend.usd.toFixed(4)}, next request up to ${worst.toFixed(4)}).`);
          opts.onRequest?.(params);
          spend.requests += 1;
          const res = await inner.beta.messages.create(params, options);
          const u = res.usage;
          spend.inputTokens += u?.input_tokens ?? 0;
          spend.outputTokens += u?.output_tokens ?? 0;
          spend.cacheReadTokens += u?.cache_read_input_tokens ?? 0;
          spend.cacheWriteTokens += u?.cache_creation_input_tokens ?? 0;
          spend.usd += costOf(cfg.model, u ?? {});
          largestInput = Math.max(largestInput, (u?.input_tokens ?? 0) + (u?.cache_read_input_tokens ?? 0) + (u?.cache_creation_input_tokens ?? 0));
          return res;
        },
      },
    },
  };
}
