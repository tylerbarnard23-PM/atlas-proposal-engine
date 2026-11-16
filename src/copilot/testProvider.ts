import type Anthropic from "@anthropic-ai/sdk";
import type { MessagesClient } from "./agent";

// D4: a deterministic stand-in for the model, run through the real agent loop
// and tools. It is not a model and the page says so ("Test provider"). It
// exists so the contextual flow can be exercised end to end, in tests and in
// a browser, with no key and no spend. Its plan is fixed: read the scope,
// simulate trimming the largest in-scope non-cash position by 10%, draft that
// simulation if the evaluator allows it, then answer citing the engine's
// figures.

export const TEST_PROVIDER_MODEL = "atlas-test-provider";

type Block = Anthropic.Beta.BetaContentBlock;

let counter = 0;

function message(content: Block[], stop: Anthropic.Beta.BetaMessage["stop_reason"]): Anthropic.Beta.BetaMessage {
  return {
    id: `msg_test_${++counter}`,
    type: "message",
    role: "assistant",
    model: TEST_PROVIDER_MODEL,
    content,
    stop_reason: stop,
    stop_sequence: null,
    usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
  } as unknown as Anthropic.Beta.BetaMessage;
}

const toolUse = (name: string, input: Record<string, unknown>) => message([{ type: "tool_use", id: `toolu_test_${++counter}`, name, input } as unknown as Block], "tool_use");
const answer = (text: string) => message([{ type: "text", text, citations: null } as unknown as Block], "end_turn");

/** The latest tool result in the conversation, with the name of the tool that produced it. */
function lastResult(messages: Anthropic.Beta.BetaMessageParam[]): { tool: string; data: Record<string, unknown> | null; error: string | null } | null {
  const last = messages[messages.length - 1];
  if (!last || last.role !== "user" || typeof last.content === "string") return null;
  const result = last.content.find((b): b is Anthropic.Beta.BetaToolResultBlockParam => b.type === "tool_result");
  if (!result) return null;
  const prior = messages[messages.length - 2];
  const use = prior && typeof prior.content !== "string" ? prior.content.find((b) => b.type === "tool_use" && b.id === result.tool_use_id) : undefined;
  const tool = use && use.type === "tool_use" ? use.name : "unknown";
  const text = typeof result.content === "string" ? result.content : "";
  if (result.is_error) return { tool, data: null, error: text };
  try {
    return { tool, data: JSON.parse(text), error: null };
  } catch {
    return { tool, data: null, error: "unreadable result" };
  }
}

const fmt = (n: unknown, ccy: string) => (typeof n === "number" ? `${ccy} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "not available");

export function createTestProvider(): MessagesClient {
  let currency = "USD";
  let scopeTotal: unknown = null;
  let sim: Record<string, unknown> | null = null;
  return {
    beta: {
      messages: {
        async create(params) {
          const r = lastResult(params.messages);
          if (!r) return toolUse("get_scope_overview", {});
          if (r.error) return answer(`The engine refused a step: ${r.error}`);
          const d = r.data!;
          if (r.tool === "get_scope_overview") {
            currency = String(d.reporting_currency ?? "USD");
            scopeTotal = (d.totals as { current?: number } | undefined)?.current ?? null;
            const positions = (d.positions as { holding_id: string; asset_class: string; current: number | null; proposed_only: boolean }[] | undefined) ?? [];
            const largest = positions.filter((p) => p.asset_class !== "cash" && !p.proposed_only && (p.current ?? 0) > 0).sort((a, b) => (b.current ?? 0) - (a.current ?? 0))[0];
            if (!largest) return answer(`The investment scope totals ${fmt(scopeTotal, currency)} and holds no non-cash position to simulate.`);
            const amount = Math.max(100, Math.round(((largest.current ?? 0) * 0.1) / 100) * 100);
            return toolUse("simulate_scope_change", { holding_id: largest.holding_id, change: "reduce", amount });
          }
          if (r.tool === "simulate_scope_change") {
            sim = d;
            const position = d.position as { before: number | null; after: number | null };
            if (!d.draftable) return answer(`Simulated trimming ${d.holding} by ${fmt(d.amount, currency)}: not draftable (${d.not_draftable_reason}). No draft was prepared.`);
            return toolUse("draft_recommendation", {
              simulation_id: d.simulation_id,
              type: "reduce",
              priority: "medium",
              title: `Trim ${d.holding} by ${fmt(d.amount, currency)}`,
              rationale: `The shared evaluator takes ${d.holding} from ${fmt(position.before, currency)} to ${fmt(position.after, currency)} in the active alternative, with the proceeds held as cash in the same account.`,
            });
          }
          if (r.tool === "draft_recommendation" && sim) {
            const position = sim.position as { before: number | null; after: number | null };
            return answer(
              [
                `**Test provider (not a model).** The investment scope totals ${fmt(scopeTotal, currency)}.`,
                `- Simulated: trim ${sim.holding} by ${fmt(sim.amount, currency)}, from ${fmt(position.before, currency)} to ${fmt(position.after, currency)}.`,
                `- Prepared one unapproved draft (${d.draft_id}) as a preview; nothing is added yet. Add it to the working draft to review it; approval stays with the advisor.`,
              ].join("\n")
            );
          }
          return answer("Done.");
        },
      },
    },
  };
}
