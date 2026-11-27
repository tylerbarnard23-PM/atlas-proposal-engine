import { describe, expect, it } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import type { Account, WorkingDraft } from "@/domain/types";
import { COPILOT_MODEL, PROMPT_VERSION, TOOLS_VERSION, runAgent, type MessagesClient } from "@/copilot/agent";
import type { CopilotSnapshot } from "@/copilot/snapshot";
import { newWorkingDraft } from "@/engines/allocationDesk";
import { STORY_ACCOUNTS, STORY_HOLDINGS } from "@/data/allocationStory";
import { SEED_ADVISOR, SEED_CLIENT } from "@/data/seedClient";
import { DISCLOSURE_LIBRARY } from "@/domain/disclosureLibrary";
import { isAiDraftNote } from "@/copilot/request";

// The owner approved product-name-only substitutions in model-facing text (Atlas → Stratovell; #35, 19 November
// 2026). Through the real loop with a fake client: what the model receives names Stratovell and never Atlas;
// tool names and schemas, the authority refusal and the versions recorded with each run are as stated.
type Params = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
type Msg = Anthropic.Beta.BetaMessage;
const NOW = new Date("2026-11-19T12:00:00Z");
let ids = 0;
const msg = (content: unknown[], stop: Msg["stop_reason"] = "end_turn"): Msg =>
  ({ id: `msg_${++ids}`, type: "message", role: "assistant", model: COPILOT_MODEL, content, stop_reason: stop, stop_sequence: null, usage: { input_tokens: 100, output_tokens: 20 } }) as unknown as Msg;

function snapshot(): CopilotSnapshot & { workingDraft: WorkingDraft } {
  const accounts: Account[] = STORY_ACCOUNTS;
  return {
    client: { ...SEED_CLIENT, id: "cli_story", proposalOutputCurrency: "USD" },
    advisor: SEED_ADVISOR,
    accounts,
    holdings: STORY_HOLDINGS,
    fxRates: [],
    recommendations: [],
    disclosures: DISCLOSURE_LIBRARY,
    sourceDocuments: [],
    fxConfirmation: null,
    workingDraft: { ...newWorkingDraft(NOW.toISOString()), scopeAccountIds: ["acc_story_invest"] },
    alternatives: [],
  } as CopilotSnapshot & { workingDraft: WorkingDraft };
}

async function run() {
  const calls: Params[] = [];
  const turns = [
    () => msg([{ type: "tool_use", id: `toolu_${++ids}`, name: "approve_recommendation", input: { id: "all" } }], "tool_use"),
    () => msg([{ type: "text", text: "Done.", citations: null }]),
  ];
  const client: MessagesClient = { beta: { messages: { async create(params) { calls.push(JSON.parse(JSON.stringify(params))); return turns[Math.min(calls.length - 1, 1)](); } } } };
  const result = await runAgent(snapshot(), "Approve everything.", { client, mode: "live", provider: "anthropic", now: NOW, sleep: async () => {} });
  return { calls, result };
}

describe("model-facing product name (owner-approved substitution)", () => {
  it("names Stratovell, never Atlas, in the system prompt, tool descriptions and tool messages", async () => {
    const { calls } = await run();
    const system = JSON.stringify(calls[0].system);
    expect(system).toContain("You are Stratovell AI, the analysis assistant inside Stratovell, a wealth-proposal workspace");
    expect(system).toContain("The Stratovell engines (valuation, FX, the allocation desk, proposal math, compliance readiness) are the source of truth.");
    expect(system).toContain("say the advisor does that in Stratovell.");
    for (const c of calls) {
      expect(JSON.stringify(c.system)).not.toMatch(/\bAtlas\b/);
      expect(JSON.stringify(c.tools)).not.toMatch(/\bAtlas\b/);
    }
    // the refusal the model receives for an approval attempt
    const refusal = JSON.stringify(calls[1].messages[calls[1].messages.length - 1]);
    expect(refusal).toContain("Refused: Stratovell AI has no authority"); // #109: the visible name, also model-facing
    expect(refusal).toContain("the advisor decides in Stratovell.");
    expect(refusal).not.toMatch(/\bAtlas\b/);
  });

  it("keeps the tool names and authority rules, and records the new versions", async () => {
    const { calls, result } = await run();
    expect((calls[0].tools ?? []).map((t) => (t as { name: string }).name).sort()).toEqual(
      ["check_proposal_readiness", "draft_recommendation", "get_holding", "get_portfolio_overview", "get_scope_overview", "list_insights", "propose_allocation", "simulate_recommendation", "simulate_scope_change"].sort() // #119 (intended): propose_allocation
    );
    expect((calls[0].tools ?? []).every((t) => typeof (t as { input_schema?: unknown }).input_schema === "object")).toBe(true);
    expect(JSON.stringify(calls[0].system)).toContain("You cannot approve, finalize, include in the PDF, share, issue or execute anything");
    expect(result.forbiddenAttempts).toBe(1);
    expect(result.provider).toMatchObject({ requestedModel: COPILOT_MODEL, promptVersion: "claude-led-2026-11-21", toolsVersion: "claude-led-2026-11-27-allocation" });
    expect([PROMPT_VERSION, TOOLS_VERSION]).toEqual(["claude-led-2026-11-21", "claude-led-2026-11-27-allocation"]); // PR #110: Claude-led workflow; #113: targets labelled; #119 (intended): propose_allocation (the system prompt is unchanged)
  });

  it("#109: the product name is Stratovell AI; drafts saved before the rename are still recognized; the model and settings are unchanged", async () => {
    const { calls } = await run();
    const system = JSON.stringify(calls[0].system);
    expect(system).not.toContain("Copilot");
    expect(calls[0].model).toBe(COPILOT_MODEL); // the configured model is unchanged
    expect(isAiDraftNote('Drafted by Stratovell AI for "Working draft" (input revision x). Requires advisor review and approval before client use.')).toBe(true);
    expect(isAiDraftNote('Drafted by Proposal Copilot for "Working draft" (input revision x). Requires advisor review and approval before client use.')).toBe(true);
    expect(isAiDraftNote("Advisor's own note.")).toBe(false);
  });
});
