import { describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_LIMITS, PROMPT_VERSION, TOOLS_VERSION, runAgent } from "@/copilot/agent";
import { AGENT_EVAL_CASES, AGENT_EVAL_VERSION } from "@/copilot/eval/cases";
import { gradeRun } from "@/copilot/eval/grade";
import { BudgetExceeded, PRICE_DATE, budgetedClient, liveEvalConfig, planLiveEval, type Spend } from "@/copilot/eval/budget";

// D4: the opt-in PAID live evaluation (AGENT_EVALUATION.md, Layer B). Not part
// of `npm test` or CI: it runs only through `npm run eval:agent:live` with
// ATLAS_AGENT_LIVE_EVAL=1, a key, AGENT_EVAL_MAX_USD, AGENT_EVAL_MAX_REQUESTS
// and AGENT_EVAL_CONFIRM_SPEND equal to the cap. Without them it is skipped
// and prints why. Synthetic fixtures only. The report keeps statuses, checks,
// usage, cost and latency; no prompts, answers, tool payloads or keys.

const parsed = liveEvalConfig(process.env);

describe.skipIf(!parsed.ok)("live agent evaluation (paid, opt-in)", () => {
  it("runs the versioned synthetic cases within the hard limits and writes a sanitized report", async () => {
    if (!parsed.ok) return;
    const config = parsed.config;
    const cases = AGENT_EVAL_CASES.filter((c) => !config.cases || config.cases.includes(c.id));
    const plan = planLiveEval(config.model, cases.flatMap((c) => Array.from({ length: config.trials }, () => ({ maxTurns: c.limits?.maxTurns ?? DEFAULT_LIMITS.maxTurns }))), DEFAULT_LIMITS.maxTokensPerResponse);
    const spend: Spend = { requests: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, usd: 0 };
    const runs: unknown[] = [];
    let stopped: string | null = null;
    for (const c of cases) {
      for (let trial = 1; trial <= config.trials && !stopped; trial++) {
        const snapshot = c.snapshot();
        const before = JSON.parse(JSON.stringify(snapshot));
        let modelBound = "";
        let budgetStop: string | null = null;
        const inner = new Anthropic({ maxRetries: 0 });
        const client = budgetedClient(inner, config, spend, { onRequest: (p) => (modelBound += JSON.stringify(p.messages)) });
        const guarded = {
          beta: {
            messages: {
              create: async (...args: Parameters<typeof client.beta.messages.create>) => {
                try {
                  return await client.beta.messages.create(...args);
                } catch (err) {
                  if (err instanceof BudgetExceeded) budgetStop = err.message;
                  throw err;
                }
              },
            },
          },
        };
        const started = Date.now();
        const result = await runAgent(snapshot, c.question, { client: guarded, mode: "live", provider: "anthropic", model: config.model, limits: c.limits });
        const grade = gradeRun(c, result, before, snapshot, modelBound);
        runs.push({
          case: c.id,
          trial,
          status: result.status,
          latencyMs: Date.now() - started,
          provider: result.provider,
          usage: result.usage,
          figures: { claims: result.figures.claims, unsupported: result.figures.unsupported.length },
          forbiddenAttempts: result.forbiddenAttempts,
          drafts: result.drafts.map((d) => ({ type: d.type, positional: !!(d.relatedHoldingId && d.actionAmount != null) })),
          tools: result.trace.map((t) => ({ name: t.name, ok: t.ok })),
          grade,
          budgetStop,
        });
        if (budgetStop) stopped = budgetStop;
      }
    }
    const graded = runs as { case: string; grade: { pass: boolean; criticalFailures: number } }[];
    const report = {
      suite: AGENT_EVAL_VERSION,
      promptVersion: PROMPT_VERSION,
      toolsVersion: TOOLS_VERSION,
      commit: process.env.GITHUB_SHA ?? process.env.AGENT_EVAL_COMMIT ?? "unrecorded",
      model: config.model,
      priceDate: PRICE_DATE,
      config: { ...config },
      plan,
      spend,
      stopped,
      summary: {
        runs: graded.length,
        passed: graded.filter((r) => r.grade.pass).length,
        criticalFailures: graded.reduce((a, r) => a + r.grade.criticalFailures, 0),
        byCase: Object.fromEntries(cases.map((c) => [c.id, `${graded.filter((r) => r.case === c.id && r.grade.pass).length}/${graded.filter((r) => r.case === c.id).length}`])),
      },
      runs,
      limitations: "Synthetic fixtures only; code-based checks; wording needs the human rubric in the case manifest. Zero observed failures is not a guarantee.",
    };
    mkdirSync("agent-eval-reports", { recursive: true });
    const file = `agent-eval-reports/${AGENT_EVAL_VERSION}_${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    writeFileSync(file, JSON.stringify(report, null, 2));
    console.log(`Agent live evaluation: ${report.summary.passed}/${report.summary.runs} passed, ${report.summary.criticalFailures} critical failures, USD ${spend.usd.toFixed(4)} spent. Report: ${file}`);
    expect(spend.usd).toBeLessThanOrEqual(config.maxUsd);
  });
});

describe.skipIf(parsed.ok)("live agent evaluation (not configured)", () => {
  it("is skipped without explicit opt-in, credentials and a spend cap", () => {
    if (!parsed.ok) console.log(`Live agent evaluation not run:\n- ${parsed.errors.join("\n- ")}`);
    expect(parsed.ok).toBe(false);
  });
});
