import type Anthropic from "@anthropic-ai/sdk";
import { ALLOCATION_TASK_MARKER, type MessagesClient } from "./agent";

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

// #119: the allocation task's scripted plan. Fixed rules, not judgment: they
// exist to exercise the workflow and the engines (a proposed mix, a justified
// hold, a follow-up question), never as evidence of analysis quality.
type Brief = { answers?: { question: string; answer: string; status: string }[]; not_discussed?: string[]; possible_conflicts?: string[]; missing_details?: string[] };
type Scope = { reporting_currency?: string; totals?: { current?: number }; allocation?: { asset_class: string; current: number | null }[]; positions?: { holding_id: string; account: string; asset_class: string; current: number | null; proposed_only: boolean }[] };

const r2 = (n: number) => Math.round(n * 100) / 100;

/** The scripted allocation decision for a brief and a scope (the propose_allocation input). */
export function scriptedAllocationDecision(brief: Brief, scope: Scope): Record<string, unknown> {
  const answer = (label: string) => brief.answers?.find((a) => a.question === label);
  const unreviewed = (brief.answers ?? []).find((a) => a.status !== "reviewed_by_advisor");
  const ask = (text: string, decides: string) => ({ outcome: "ask_question", headline: "A question before proposing a mix", rationale: "Information that would change the allocation decision is missing, unreviewed or conflicting, so no mix is proposed yet.", question: { text, decides } });
  if (brief.possible_conflicts?.length) return ask(`${brief.possible_conflicts[0]} Which should guide the allocation?`, "Whether the mix should take more or less risk, and by how much.");
  if (brief.not_discussed?.length) return ask(`Please discuss "${brief.not_discussed[0]}" with the client and record it.`, "How much risk and how much cash the mix should carry.");
  if (brief.missing_details?.length) return ask(`${brief.missing_details[0]} Please record it.`, "How much cash to hold, and when.");
  if (unreviewed) return ask(`Please review the recorded answer to "${unreviewed.question}" with the client.`, "Whether the recorded answer can guide the mix.");

  const ccy = scope.reporting_currency ?? "USD";
  const total = scope.totals?.current ?? 0;
  const amount = (c: string) => scope.allocation?.find((a) => a.asset_class === c)?.current ?? 0;
  const objectives = answer("Objectives")?.answer ?? "";
  const willingness = answer("Willingness to accept losses")?.answer ?? "";
  const liquidity = answer("Liquidity needs")?.answer ?? "";
  const m = liquidity.match(/^Planned withdrawal: ([A-Z]{3}) ([\d,]+(?:\.\d+)?), within 1 year/);
  const need = m && m[1] === ccy ? Number(m[2].replace(/,/g, "")) : 0;
  const cashNow = amount("cash");
  const raise = r2(Math.max(0, need - cashNow));
  const cautious = /^Primary: Preserve wealth/.test(objectives) && /^(Low|Moderate)$/.test(willingness);
  const equityAfterRaise = amount("equity") - raise;
  const shift = cautious && total > 0 && equityAfterRaise / total > 0.6 + 1e-9 ? r2(equityAfterRaise - 0.6 * total) : 0;
  const pctOf = (n: number) => Math.round((n / total) * 1000) / 10;
  const weights = (moves: Record<string, number>) => {
    const out = (scope.allocation ?? []).filter((a) => (a.current ?? 0) > 0.005 || moves[a.asset_class]).map((a) => ({ asset_class: a.asset_class, pct: pctOf((a.current ?? 0) + (moves[a.asset_class] ?? 0)) }));
    for (const c of Object.keys(moves)) if (!out.some((w) => w.asset_class === c)) out.push({ asset_class: c, pct: pctOf(moves[c]) });
    return out;
  };

  if (raise <= 0.005 && shift <= 0.005) {
    return {
      outcome: "maintain_current_mix",
      headline: "Keep the current mix",
      rationale: `The reviewed brief (${objectives}; willingness to accept losses: ${willingness}; ${liquidity}) gives no reason to change the mix: no withdrawal needs more cash than the ${ccy} ${cashNow.toLocaleString("en-US")} held, and the stated risk tolerance accepts the current equity share. No trade is proposed.`,
      objective_refs: ["objectives", "liquidity", "lossWillingness", "lossAbility", "timeHorizon"],
    };
  }

  const positions = (scope.positions ?? []).filter((p) => !p.proposed_only && (p.current ?? 0) > 0);
  const largest = (c: string, account?: string) => positions.filter((p) => p.asset_class === c && (!account || p.account === account)).sort((a, b) => (b.current ?? 0) - (a.current ?? 0))[0];
  const equity = largest("equity");
  const bonds = equity ? largest("fixed_income", equity.account) : undefined;
  const groups: Record<string, unknown>[] = [];
  if (equity && raise > 0.005) groups.push({ title: "Raise cash from the existing equity fund", rationale: `Reduce the equity fund by ${ccy} ${raise.toLocaleString("en-US")} and keep the proceeds as cash in the same account, meeting the planned withdrawal.`, legs: [{ holding_id: equity.holding_id, change: "reduce", amount: raise }] });
  if (equity && bonds && shift > 0.005) groups.push({ title: "Shift from equities into the existing bond fund", rationale: `Reduce the equity fund by a further ${ccy} ${shift.toLocaleString("en-US")} and buy the existing core bond fund with the proceeds; the sale and the purchase form one funded group.`, legs: [{ holding_id: equity.holding_id, change: "reduce", amount: shift }, { holding_id: bonds.holding_id, change: "increase", amount: shift }] });
  const proposed = weights({ equity: -(raise + shift), cash: raise, ...(shift > 0.005 ? { fixed_income: shift } : {}) });
  const eq = proposed.find((w) => w.asset_class === "equity")?.pct;
  const cash = proposed.find((w) => w.asset_class === "cash")?.pct;
  return {
    outcome: "propose_changes",
    headline: `Raise cash to ${cash}% and lower equities to ${eq}%`,
    rationale:
      `The reviewed brief records: ${liquidity}; ${objectives}; willingness to accept losses: ${willingness}. Holding ${ccy} ${need.toLocaleString("en-US")} in cash meets the stated withdrawal.` +
      (shift > 0.005 ? " Moving a further share from equities into bonds is a strategy judgment for the stated risk tolerance, not a figure the questionnaire dictates." : ""),
    objective_refs: shift > 0.005 ? ["liquidity", "lossWillingness", "objectives"] : ["liquidity"],
    proposed_weights: proposed,
    alternative:
      shift > 0.005
        ? { summary: "Raise cash only: it meets the cash preference with less selling, but leaves more equity exposure than the stated risk tolerance suggests.", weights: weights({ equity: -raise, cash: raise }) }
        : { summary: "Keep today's mix: it leaves cash below the stated withdrawal." },
    groups,
  };
}

export function createTestProvider(): MessagesClient {
  let currency = "USD";
  let scopeTotal: unknown = null;
  let sim: Record<string, unknown> | null = null;
  let brief: Brief = {};
  return {
    beta: {
      messages: {
        async create(params) {
          const r = lastResult(params.messages);
          const first = params.messages[0];
          const allocationTask = typeof first?.content === "string" && first.content.startsWith(ALLOCATION_TASK_MARKER);
          if (allocationTask) {
            if (!r) return toolUse("get_portfolio_overview", {});
            if (r.error) return answer(`**Test provider (not a model).** The engine refused a step: ${r.error}`);
            const d = r.data!;
            if (r.tool === "get_portfolio_overview") {
              brief = ((d.client as { client_brief?: Brief } | undefined)?.client_brief ?? {}) as Brief;
              return toolUse("get_scope_overview", {});
            }
            if (r.tool === "get_scope_overview") return toolUse("propose_allocation", scriptedAllocationDecision(brief, d as Scope));
            if (r.tool === "propose_allocation") {
              const groups = (d.groups as { title: string; feasible: boolean; not_feasible_reason: string | null }[] | undefined) ?? [];
              const gaps = ((d.mix as { asset_class: string; gap_pts: number | null; no_eligible_candidate: boolean }[] | undefined) ?? []).filter((x) => (x.gap_pts ?? 0) > 0.05);
              return answer(
                [
                  `**Test provider (not a model).** Allocation decision: ${String(d.outcome).replace(/_/g, " ")}.`,
                  ...groups.map((g) => `- ${g.title}: ${g.feasible ? "feasible" : `not feasible (${g.not_feasible_reason})`}.`),
                  ...gaps.map((g) => `- ${g.asset_class}: ${g.gap_pts} percentage points short of the proposed weight${g.no_eligible_candidate ? "; no eligible existing holding" : ""}.`),
                  "Nothing is added or approved: review the groups and add the ones you choose.",
                ].join("\n")
              );
            }
            return answer("Done.");
          }
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
