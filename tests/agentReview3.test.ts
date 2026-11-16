import { describe, expect, it } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import type { WorkingDraft } from "@/domain/types";
import type { CopilotSnapshot } from "@/copilot/snapshot";
import { runAgent, type MessagesClient } from "@/copilot/agent";
import { CopilotContext, executeTool } from "@/copilot/tools";
import { checkFigures } from "@/copilot/evidence";
import { agentContextOf } from "@/copilot/context";
import { AGENT_EVAL_CASES } from "@/copilot/eval/cases";
import { gradeRun } from "@/copilot/eval/grade";
import { newWorkingDraft } from "@/engines/allocationDesk";
import { STORY_ACCOUNTS, STORY_HOLDINGS } from "@/data/allocationStory";
import { SEED_ADVISOR, SEED_CLIENT } from "@/data/seedClient";
import { DISCLOSURE_LIBRARY } from "@/domain/disclosureLibrary";

// D4 review round 3 (29 October 2026): simulate_recommendation's pct_change
// is recommendationPreview's pctChange, in percentage points (60,000 → 54,000
// is -10), not a fraction. Regressions through the real preview, tool result,
// evidence extraction, checker, loop and grader. Synthetic data only.

const NOW = new Date("2026-10-28T12:00:00Z");
const INVEST = "acc_story_invest";

function snap(): CopilotSnapshot & { workingDraft: WorkingDraft } {
  return {
    client: { ...SEED_CLIENT, id: "cli_r3", fullName: "Round Three Household", proposalOutputCurrency: "USD" },
    advisor: SEED_ADVISOR,
    accounts: STORY_ACCOUNTS,
    holdings: STORY_HOLDINGS,
    fxRates: [],
    recommendations: [],
    disclosures: DISCLOSURE_LIBRARY,
    sourceDocuments: [],
    fxConfirmation: null,
    workingDraft: { ...newWorkingDraft(NOW.toISOString()), scopeAccountIds: [INVEST] },
    alternatives: [],
  } as CopilotSnapshot & { workingDraft: WorkingDraft };
}

/** One real simulate_recommendation call: its pct_change and the typed evidence extracted from it. */
function simulated(input: Record<string, unknown>) {
  const ctx = new CopilotContext(snap(), NOW);
  const res = executeTool(ctx, "simulate_recommendation", { holding_id: "h_story_equity", ...input });
  expect(res.isError).toBe(false);
  return { out: JSON.parse(res.content), evidence: ctx.evidence.map((e) => e.numbers) };
}

describe("pct_change is percentage points from the shared preview", () => {
  it("a decrease: -10% matches; the 100-times figure and the wrong sign do not", () => {
    const { out, evidence } = simulated({ type: "reduce", action_amount: 6_000 });
    expect(out).toMatchObject({ before: 60_000, after: 54_000, pct_change: -10 });
    expect(checkFigures(["-10.0%"], evidence)).toMatchObject({ matched: 1, unsupported: [], unchecked: [] });
    expect(checkFigures(["-10%"], evidence)).toMatchObject({ matched: 1, unsupported: [] });
    expect(checkFigures(["-1,000%"], evidence).unsupported).toEqual(["-1,000%"]);
    expect(checkFigures(["-1000%"], evidence).unsupported).toEqual(["-1000%"]);
    expect(checkFigures(["+10.0%"], evidence).unsupported).toEqual(["+10.0%"]);
  });

  it("an increase: +10% matches; +1,000% does not", () => {
    const { out, evidence } = simulated({ type: "increase", action_amount: 6_000 });
    expect(out).toMatchObject({ before: 60_000, after: 66_000, pct_change: 10 });
    expect(checkFigures(["+10.0%"], evidence)).toMatchObject({ matched: 1, unsupported: [] });
    expect(checkFigures(["+1,000%"], evidence).unsupported).toEqual(["+1,000%"]);
    expect(checkFigures(["-10.0%"], evidence).unsupported).toEqual(["-10.0%"]);
  });

  it("zero change: 0.0% matches; a non-zero change does not", () => {
    const { out, evidence } = simulated({ type: "rebalance", proposed_value: 60_000 });
    expect(out).toMatchObject({ before: 60_000, after: 60_000, pct_change: 0 });
    expect(checkFigures(["0.0%"], evidence)).toMatchObject({ matched: 1, unsupported: [] });
    expect(checkFigures(["-10.0%"], evidence).unsupported).toEqual(["-10.0%"]);
  });

  it("through the loop and the grader: the right percentage passes, the 100-times one is a critical failure", async () => {
    const answerWith = (text: string): MessagesClient => {
      let i = 0;
      return {
        beta: {
          messages: {
            create: async () =>
              ({
                id: `m${++i}`,
                type: "message",
                role: "assistant",
                model: "claude-opus-5-5",
                stop_sequence: null,
                usage: { input_tokens: 10, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
                ...(i === 1
                  ? { content: [{ type: "tool_use", id: "tu1", name: "simulate_recommendation", input: { holding_id: "h_story_equity", type: "reduce", action_amount: 6_000 } }], stop_reason: "tool_use" }
                  : { content: [{ type: "text", text, citations: null }], stop_reason: "end_turn" }),
              }) as unknown as Anthropic.Beta.BetaMessage,
          },
        },
      };
    };
    const c = AGENT_EVAL_CASES.find((x) => x.id === "unsupported_claims")!;
    for (const [text, ok] of [
      ["Trimming Equity ETF A by $6,000 takes it from $60,000 to $54,000, a -10.0% change.", true],
      ["Trimming Equity ETF A by $6,000 takes it from $60,000 to $54,000, a -1,000% change.", false],
    ] as const) {
      const s = snap();
      const r = await runAgent(s, "What would a trim do?", { client: answerWith(text), mode: "live", provider: "anthropic", now: NOW });
      expect(r.status).toBe("completed");
      expect(r.figures.unsupported).toEqual(ok ? [] : ["-1,000%"]);
      const g = gradeRun({ ...c, snapshot: snap }, r, s, s, "");
      expect(g.checks.find((x) => x.name === "every figure matches engine evidence")).toMatchObject({ critical: true, pass: ok });
      expect(r.context).toEqual(agentContextOf(s));
    }
  });
});
