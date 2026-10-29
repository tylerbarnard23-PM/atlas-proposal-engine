import { DEFAULT_LIMITS, PROMPT_VERSION, TOOLS_VERSION, runAgent, type MessagesClient } from "@/copilot/agent";
import { AGENT_EVAL_CASES, AGENT_EVAL_VERSION, type AgentEvalCase } from "./cases";
import { gradeRun, type Grade } from "./grade";
import { BudgetExceeded, PRICE_DATE, budgetedClient, planLiveEval, type LiveEvalConfig, type Spend } from "./budget";

// D4: runs the versioned cases against a messages client within the run's
// limits, grades each trial and decides the verdict. The paid live command
// (eval/agentLive.eval.ts) is a thin wrapper; tests drive this with fakes.
// The verdict passes only when every selected trial completed (none skipped
// or cut short by the spend guard) and no trial had a critical failure. A
// passing selection smaller than the whole suite is labelled a subset, never
// the full 27-trial suite. The sanitized report is written whatever the
// verdict, and also if the run throws.

/** The full suite: every case, three trials each. */
export const FULL_SUITE_TRIALS = 3;

export interface TrialRecord {
  case: string;
  trial: number;
  status: string;
  latencyMs: number;
  provider: unknown;
  usage: unknown;
  figures: { claims: number; matched: number; unsupported: number; unchecked: number };
  forbiddenAttempts: number;
  drafts: { type: string; positional: boolean }[];
  tools: { name: string; ok: boolean }[];
  grade: Grade;
  /** Why the spend guard stopped this trial; such a trial doesn't count as covered. */
  budgetStop: string | null;
}

export interface SuiteReport {
  suite: string;
  promptVersion: string;
  toolsVersion: string;
  commit: string;
  model: string;
  priceDate: string;
  config: LiveEvalConfig;
  selection: { cases: string[]; trials: number; fullSuite: boolean };
  plan: ReturnType<typeof planLiveEval>;
  spend: Spend;
  coverage: { planned: number; completed: number; interrupted: string | null; missing: { case: string; trial: number }[] };
  summary: { runs: number; passed: number; criticalFailures: number; byCase: Record<string, string> };
  verdict: { pass: boolean; scope: "full_suite" | "subset"; reasons: string[] };
  runs: TrialRecord[];
  error: string | null;
  limitations: string;
}

export async function runLiveSuite(opts: {
  config: LiveEvalConfig;
  makeClient: () => MessagesClient;
  write: (report: SuiteReport) => void;
  cases?: AgentEvalCase[];
  now?: () => Date;
  commit?: string;
}): Promise<SuiteReport> {
  const { config } = opts;
  const all = opts.cases ?? AGENT_EVAL_CASES;
  const cases = config.cases ? all.filter((c) => config.cases!.includes(c.id)) : all;
  const planned = cases.flatMap((c) => Array.from({ length: config.trials }, (_, i) => ({ case: c, trial: i + 1 })));
  const fullSuite = cases.length === AGENT_EVAL_CASES.length && AGENT_EVAL_CASES.every((c) => cases.some((x) => x.id === c.id)) && config.trials === FULL_SUITE_TRIALS;
  const spend: Spend = { requests: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, usd: 0 };
  const runs: TrialRecord[] = [];
  let interrupted: string | null = null;
  const sizing = { largestInput: 20_000 };
  let error: string | null = null;

  try {
    for (const p of planned) {
      if (interrupted) break;
      const snapshot = p.case.snapshot();
      const before = JSON.parse(JSON.stringify(snapshot));
      let modelBound = "";
      let budgetStop: string | null = null;
      const guarded = budgetedClient(opts.makeClient(), config, spend, { sizing, onRequest: (params) => (modelBound += JSON.stringify(params.messages)) });
      const client: MessagesClient = {
        beta: {
          messages: {
            create: async (...args) => {
              try {
                return await guarded.beta.messages.create(...args);
              } catch (err) {
                if (err instanceof BudgetExceeded) budgetStop = err.message;
                throw err;
              }
            },
          },
        },
      };
      const started = Date.now();
      const result = await runAgent(snapshot, p.case.question, { client, mode: "live", provider: "anthropic", model: config.model, limits: p.case.limits, now: opts.now?.() });
      runs.push({
        case: p.case.id,
        trial: p.trial,
        status: result.status,
        latencyMs: Date.now() - started,
        provider: result.provider,
        usage: result.usage,
        figures: { claims: result.figures.claims, matched: result.figures.matched, unsupported: result.figures.unsupported.length, unchecked: result.figures.unchecked.length },
        forbiddenAttempts: result.forbiddenAttempts,
        drafts: result.drafts.map((d) => ({ type: d.type, positional: !!(d.relatedHoldingId && d.actionAmount != null) })),
        tools: result.trace.map((t) => ({ name: t.name, ok: t.ok })),
        grade: gradeRun(p.case, result, before, snapshot, modelBound),
        budgetStop,
      });
      if (budgetStop) interrupted = budgetStop;
    }
  } catch (err) {
    error = err instanceof Error ? err.name : "unknown error";
  }

  const covered = runs.filter((r) => !r.budgetStop);
  const coveredKeys = new Set(covered.map((r) => `${r.case}#${r.trial}`));
  const missing = planned.filter((p) => !coveredKeys.has(`${p.case.id}#${p.trial}`)).map((p) => ({ case: p.case.id, trial: p.trial }));
  const criticalFailures = covered.reduce((a, r) => a + r.grade.criticalFailures, 0);
  const reasons: string[] = [];
  if (planned.length === 0) reasons.push("No case was selected.");
  if (covered.length === 0) reasons.push("No selected trial completed, so nothing was evaluated.");
  else if (missing.length > 0) reasons.push(`Coverage incomplete: ${missing.length} of ${planned.length} selected trials did not complete${interrupted ? ` (${interrupted})` : ""}.`);
  if (criticalFailures > 0) reasons.push(`${criticalFailures} critical failure${criticalFailures === 1 ? "" : "s"} observed.`);
  if (error) reasons.push(`The run stopped on an unexpected ${error}.`);
  const pass = reasons.length === 0;
  if (pass) reasons.push(fullSuite ? `Full suite: all ${planned.length} trials completed with no critical failure.` : `Passing subset only (${cases.length} of ${AGENT_EVAL_CASES.length} cases, ${config.trials} trial${config.trials === 1 ? "" : "s"} each): not the full ${AGENT_EVAL_CASES.length * FULL_SUITE_TRIALS}-trial suite.`);

  const report: SuiteReport = {
    suite: AGENT_EVAL_VERSION,
    promptVersion: PROMPT_VERSION,
    toolsVersion: TOOLS_VERSION,
    commit: opts.commit ?? "unrecorded",
    model: config.model,
    priceDate: PRICE_DATE,
    config,
    selection: { cases: cases.map((c) => c.id), trials: config.trials, fullSuite },
    plan: planLiveEval(config.model, planned.map((p) => ({ maxTurns: p.case.limits?.maxTurns ?? DEFAULT_LIMITS.maxTurns })), DEFAULT_LIMITS.maxTokensPerResponse),
    spend,
    coverage: { planned: planned.length, completed: covered.length, interrupted, missing },
    summary: {
      runs: runs.length,
      passed: covered.filter((r) => r.grade.pass).length,
      criticalFailures,
      byCase: Object.fromEntries(cases.map((c) => [c.id, `${covered.filter((r) => r.case === c.id && r.grade.pass).length}/${config.trials}`])),
    },
    verdict: { pass, scope: fullSuite ? "full_suite" : "subset", reasons },
    runs,
    error,
    limitations: "Synthetic fixtures only; code-based checks; wording needs the human rubric in the case manifest. The spend cap is an estimate-based guard, not a guaranteed ceiling. Zero observed failures is not a guarantee.",
  };
  opts.write(report);
  return report;
}
