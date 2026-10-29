import { describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { liveEvalConfig } from "@/copilot/eval/budget";
import { runLiveSuite } from "@/copilot/eval/runner";

// D4: the opt-in PAID live evaluation (AGENT_EVALUATION.md, Layer B). Not part
// of `npm test` or CI: it runs only through `npm run eval:agent:live` with
// ATLAS_AGENT_LIVE_EVAL=1, a key, AGENT_EVAL_MAX_USD, AGENT_EVAL_MAX_REQUESTS
// and AGENT_EVAL_CONFIRM_SPEND equal to the cap (AGENT_EVAL_CASES, if set,
// must name known cases; AGENT_EVAL_TRIALS must be a whole number). Without
// them it is skipped and prints why. Synthetic fixtures only. The sanitized
// report (statuses, checks, usage, cost, latency, coverage and verdict; no
// prompts, answers, tool payloads or keys) is written before the verdict is
// asserted, so a failing run still leaves its report. The spend cap is an
// estimate-based guard, not a guaranteed ceiling.

const parsed = liveEvalConfig(process.env);

describe.skipIf(!parsed.ok)("live agent evaluation (paid, opt-in)", () => {
  it("runs the selected synthetic cases within the limits, writes the report, and passes only with full coverage and no critical failure", async () => {
    if (!parsed.ok) return;
    let file = "";
    const report = await runLiveSuite({
      config: parsed.config,
      makeClient: () => new Anthropic({ maxRetries: 0 }),
      commit: process.env.GITHUB_SHA ?? process.env.AGENT_EVAL_COMMIT,
      write: (r) => {
        mkdirSync("agent-eval-reports", { recursive: true });
        file = `agent-eval-reports/${r.suite}_${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
        writeFileSync(file, JSON.stringify(r, null, 2));
      },
    });
    console.log(
      `Agent live evaluation (${report.verdict.scope === "full_suite" ? "full suite" : "SUBSET"}): ${report.verdict.pass ? "PASS" : "FAIL"}. ` +
        `${report.coverage.completed}/${report.coverage.planned} trials completed, ${report.summary.criticalFailures} critical failures, USD ${report.spend.usd.toFixed(4)} spent (estimate-priced). ` +
        `${report.verdict.reasons.join(" ")} Report: ${file}`
    );
    expect(report.verdict.reasons).toEqual(report.verdict.pass ? report.verdict.reasons : []);
    expect(report.verdict.pass).toBe(true);
  });
});

describe.skipIf(parsed.ok)("live agent evaluation (not configured)", () => {
  it("is skipped without explicit opt-in, credentials and a spend cap", () => {
    if (!parsed.ok) console.log(`Live agent evaluation not run:\n- ${parsed.errors.join("\n- ")}`);
    expect(parsed.ok).toBe(false);
  });
});
