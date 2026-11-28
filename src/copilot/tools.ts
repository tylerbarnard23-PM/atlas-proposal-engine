import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { Recommendation, RecommendationType, WorkingDraft } from "@/domain/types";
import { normalizeHoldings, type NormalizedHolding } from "@/engines/normalizationEngine";
import { generateInsights, summarizeAllocation } from "@/engines/insightEngine";
import { previewRecommendation } from "@/engines/recommendationPreview";
import { candidateProblems, evaluateDesk, newWorkingDraft, positionEditRecommendation, previewDraftEdit, type DeskResult } from "@/engines/allocationDesk";
import { contentHash } from "@/engines/snapshotRecord";
import { describeLeg, fxFreshness, utcDate, utcMinute, type FxFreshness } from "@/engines/fxPolicy";
import { amountsInReporting, describeConversion } from "@/engines/recommendationAmounts";
import { missingPairs, reportingValue, valuationSummary, valuationTotal, type ValuedTotal } from "@/engines/valuationTotals";
import { evaluateWorkspaceReadiness, readinessOk } from "@/engines/complianceEngine";
import { todayIso } from "@/utils/formatting";
import { describeImportIssue, importIssues, type ImportIssue } from "@/engines/importCompleteness";
import { agentContextOf, type AgentContext } from "./context";
import { figuresIn, type EvidenceValue } from "./evidence";
import type { CopilotSnapshot } from "./snapshot";
import { redactIdentity } from "./redaction";
import { clientStatedAmounts, describeAnswer, modelBoundClientBrief, QUESTIONS, questionLabel } from "@/engines/clientDiscovery";
import { materialBasis } from "@/engines/allocationBasis";
import { ASSET_CLASS_LABELS } from "@/domain/assetTaxonomy";
import type { AssetClass, ClassWeight, DiscoveryQuestionId } from "@/domain/types";
import {
  briefReadiness,
  checkGroup,
  deskWith,
  evaluateSelection,
  groupLegs,
  legProblem,
  MAX_GROUPS,
  recordedWeights,
  scopeExceptions,
  strategyRecommendation,
  strategyRecordProblems,
  weightProblems,
  type AllocationOutcome,
  type GroupInput,
  type ProposalInputs,
} from "@/engines/allocationProposal";

// Every tool here is a thin, read-only wrapper over the deterministic engines.
// The model never computes a number itself; it asks the engines. The single
// write path, draft_recommendation, can only produce unapproved drafts, and a
// draft that changes a position must be the exact action a scope simulation
// in the same run evaluated (D4). Nothing here approves, finalizes, shares or
// executes anything.

export const MAX_DRAFTS_PER_RUN = 5;

/** A tool result kept as engine evidence: a safe summary for the trace, and its numbers for checking the answer's figures. */
export interface EvidenceRecord {
  id: string;
  tool: string;
  summary: string;
  /** Typed figures (value, unit, currency, sign) for checking the figures an answer states. */
  numbers: EvidenceValue[];
}

/**
 * #119: the allocation decision a run returned, as the page shows it. The drafts
 * (the strategy record and each feasible group's legs) are in the run's drafts;
 * this view names them. Nothing here is saved until the advisor adds it.
 */
export interface AllocationRunView {
  outcome: AllocationOutcome;
  headline: string;
  rationale: string;
  objectiveRefs: DiscoveryQuestionId[];
  /** What the client said (the recorded answer, quoted by Stratovell) and how it supports the decision (the model's words). */
  clientBasis: { question: DiscoveryQuestionId; label: string; said: string; supports: string }[];
  question: { text: string; decides: string } | null;
  briefReady: boolean;
  briefIssues: string[];
  /** Questions outside the materiality rule that aren't reviewed: shown as unknown, never assumed. */
  unknowns: string[];
  reportingCurrency: string;
  scopeTotal: number;
  /** The accounts in the decision's scope. */
  scopeAccounts: string[];
  /**
   * Whether its records can be added: only a completed run's one validated decision (a mix or a hold).
   * A question, or a cancelled, truncated or failed run, has none (review finding 1).
   */
  addable: boolean;
  currentWeights: ClassWeight[];
  /** The AI's proposed weights (judgment); null for a question. A hold proposes the current weights. */
  proposedWeights: ClassWeight[] | null;
  alternative: { summary: string; weights?: ClassWeight[] } | null;
  strategyDraftId: string | null;
  groups: {
    id: string;
    title: string;
    rationale: string;
    legIds: string[];
    problem: string | null;
    legs: { holdingId: string; name: string; accountName: string; change: "reduce" | "increase"; amount: number }[];
  }[];
  unclassified: { id: string; name: string }[];
}

/** A scope simulation the run may draft from: the exact candidate the shared evaluator ran. */
interface Simulation {
  candidate: Recommendation;
  draftable: boolean;
  reason: string | null;
}

// Tools that would take authority the Copilot doesn't have. They don't exist;
// a call to one is refused and counted so the run can report it.
const FORBIDDEN_TOOL = /^(approve|finali[sz]e|share|send|execute|place|submit|issue|generate_pdf|publish|delete|include_in_pdf)/i;

const REC_TYPES = [
  "buy", "sell", "hold", "reduce", "increase", "rebalance", "transfer",
  "consolidate_accounts", "tax_loss_harvest", "improve_asset_location",
  "currency_hedge", "replace_high_fee_fund", "increase_diversification",
  "reduce_concentration", "raise_cash", "add_income_strategy",
  "add_downside_protection", "add_insurance_coverage", "adjust_risk_level",
  "refinance_liability", "pay_down_debt", "review_private_valuation",
  "review_source_data", "refresh_market_data", "request_updated_statement",
  "custom",
] as const satisfies readonly RecommendationType[];

export class CopilotContext {
  readonly holdings: NormalizedHolding[];
  readonly reportingCurrency: string;
  readonly drafts: Recommendation[] = [];
  readonly evidence: EvidenceRecord[] = [];
  readonly simulations = new Map<string, Simulation>();
  /** Calls to tools that would approve, finalize, share or execute: refused, and counted here. */
  forbiddenAttempts = 0;
  /** #119: the run's allocation decision (at most one). */
  allocation: AllocationRunView | null = null;
  /** #119: the run's task; the allocation task has its own tool set. */
  task: "allocation_proposal" | null = null;
  /** The agent loop's current turn (the response whose tool calls are running). */
  turn = 0;
  private delivered = new Map<string, number>();
  /** The turn on which a tool first returned a result (that result reaches the model on the next turn); Infinity when never. */
  deliveredTurn(tool: string): number {
    return this.delivered.get(tool) ?? Infinity;
  }
  markDelivered(tool: string) {
    if (!this.delivered.has(tool)) this.delivered.set(tool, this.turn);
  }
  /** The active alternative: the scope and actions the evaluator reads. */
  readonly draft: WorkingDraft;
  /** What this run is about (client, alternative, scope, input revision). */
  readonly context: AgentContext;

  readonly now: Date;

  constructor(readonly snapshot: CopilotSnapshot, now: Date = new Date()) {
    this.now = now;
    this.reportingCurrency = snapshot.client.proposalOutputCurrency || "USD";
    this.holdings = normalizeHoldings(snapshot.holdings, snapshot.fxRates, this.reportingCurrency);
    this.draft = snapshot.workingDraft ?? newWorkingDraft(now.toISOString());
    this.context = agentContextOf({ ...snapshot, workingDraft: this.draft });
  }

  get fxContext() {
    return { reportingCurrency: this.reportingCurrency, rates: this.snapshot.fxRates };
  }

  /** #119: what an allocation decision is checked against (the active alternative). */
  get proposalInputs(): ProposalInputs {
    return { holdings: this.holdings, accounts: this.snapshot.accounts, recommendations: this.snapshot.recommendations, draft: this.draft, fx: this.fxContext, client: this.snapshot.client };
  }

  /** The active alternative through the shared desk evaluator (its draft view), optionally with extra actions added last. */
  desk(extra: Recommendation[] = []): DeskResult {
    const ids = new Set(extra.map((r) => r.id));
    return evaluateDesk({
      holdings: this.holdings,
      accounts: this.snapshot.accounts,
      recommendations: [...this.snapshot.recommendations.filter((r) => !ids.has(r.id)), ...extra],
      draft: { ...this.draft, memberIds: [...this.draft.memberIds.filter((x) => !ids.has(x)), ...ids] },
      fx: this.fxContext,
      view: "draft",
    });
  }

  /** Keeps a tool result as evidence and returns its reference. */
  record(tool: string, result: unknown, summary: string): string {
    const id = `ev_${this.evidence.length + 1}`;
    const numbers = evidenceIn(result, (s) => this.withoutUntrusted(s), this.reportingCurrency);
    // PR #110 review: when the brief is handed over, its client-stated figures are the structured amounts the
    // advisor recorded (with their own currency), never figures scanned from the brief's text.
    if (holdsBrief(result)) {
      for (const a of clientStatedAmounts(this.snapshot.client)) numbers.push({ value: a.value, unit: "money", currency: a.currency, source: "client_brief", label: a.label });
    }
    this.evidence.push({ id, tool, summary, numbers });
    return id;
  }

  // Text that comes from the workspace, not the engines: names, notes, titles
  // and rationales anyone (or an imported statement) could have written.
  // Engine wording can quote it ("Bond ETF A is 30% of ..."); figures inside
  // it are never evidence. Longest first, so a name inside a longer one goes too.
  private untrustedCache: string[] | null = null;
  private get untrusted(): string[] {
    if (!this.untrustedCache) {
      const s = this.snapshot;
      const texts = [
        ...s.holdings.flatMap((h) => [h.assetName, h.identifier?.value, h.advisorNotes, h.subAssetClass]),
        ...s.accounts.flatMap((a) => [a.name, a.institution]),
        ...(s.sourceDocuments ?? []).map((d) => d.fileName),
        ...s.recommendations.flatMap((r) => [r.title, r.rationale, r.clientBenefit, r.riskTradeoff, r.taxNote, r.implementationStep, r.complianceNote, r.destination?.name, r.allocationStrategy?.alternative?.summary]),
        s.client.fullName,
        s.client.householdName,
        s.client.investmentObjective,
        s.client.specialInstructions,
        ...(s.client.restrictedSecurities ?? []),
        // #109: what the advisor typed into the discovery brief (every free-text field).
        s.client.discovery?.analysisNote,
        s.client.discovery?.otherConstraints,
        ...(s.client.discovery?.securitiesToRetain ?? []),
        ...Object.values(s.client.discovery?.answers ?? {}).map((a) => a?.note),
      ];
      // PR #110 review: also as presented (trimmed, whitespace collapsed), so formatting never lets it through.
      const forms = texts.filter((t): t is string => typeof t === "string" && t.trim().length > 0).flatMap((t) => [t, t.trim(), t.replace(/\s+/g, " ").trim()]);
      this.untrustedCache = [...new Set(forms)].sort((a, b) => b.length - a.length);
    }
    return this.untrustedCache;
  }

  withoutUntrusted(text: string): string {
    let out = text;
    for (const t of this.untrusted) if (out.includes(t)) out = out.split(t).join(" ");
    return out;
  }

  /**
   * Model-bound text with identity removed (#59): the client's and household's
   * names, the advisor's name and email, and import file names (which often
   * carry a client's name) are replaced, wherever they appear, including
   * inside account names, notes and the advisor's question. Applied to the
   * JSON a tool returns, so names are matched in their escaped form.
   */
  redact(text: string, json = false): string {
    return redactIdentity(this.snapshot, text, json);
  }

  /** Age and confirmation of the rates in use (#26). Reported, never a reason to refuse a draft. */
  get fx(): FxFreshness {
    const s = this.snapshot;
    return fxFreshness({ holdings: s.holdings, accounts: s.accounts, recommendations: s.recommendations, fxRates: s.fxRates, reportingCurrency: this.reportingCurrency, confirmation: s.fxConfirmation ?? null, now: this.now });
  }

  // Investible assets, valued in the reporting currency. Its value is only a
  // usable denominator when the status is "complete".
  get investible(): ValuedTotal {
    return valuationTotal(this.holdings.filter((h) => !h.isLiability));
  }

  /** Imported documents not fully accounted for (rows missing, unreadable, or nothing to check against). */
  get importIssues(): ImportIssue[] {
    return importIssues(this.snapshot.sourceDocuments ?? [], this.snapshot.holdings);
  }

  get importsComplete(): boolean {
    return this.importIssues.length === 0;
  }

  /** Every holding valued: portfolio weights and allocation-changing drafts are allowed. */
  get valuationComplete(): boolean {
    return this.holdings.every((h) => reportingValue(h) != null);
  }

  holding(id: string): NormalizedHolding | undefined {
    return this.holdings.find((h) => h.id === id);
  }

  accountName(id: string): string {
    return this.snapshot.accounts.find((a) => a.id === id)?.name ?? "Unknown account";
  }
}

const round = (n: number | null) => (n == null ? null : Math.round(n));
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);
// A weight needs a known part and a complete denominator; otherwise null.
const weight = (ctx: CopilotContext, part: number | null) => {
  const total = ctx.investible;
  return part == null || !ctx.valuationComplete || total.value == null ? null : pct(part, total.value);
};

// What the model is told about valuation, so it can't present a partial
// figure as complete.
function valuationNote(ctx: CopilotContext) {
  const unvalued = ctx.holdings.filter((h) => reportingValue(h) == null);
  const s = valuationSummary(ctx.holdings);
  return {
    complete: s.complete,
    holdings_valued: s.holdingsValued,
    holdings_total: s.holdingsTotal,
    unvalued: unvalued.map((h) => ({
      holding_id: h.id,
      name: h.assetName,
      is_liability: !!h.isLiability,
      currency: h.valuation.currency,
      native_value: round(h.valuation.amount),
      reason: h.valuation.status === "unvalued" ? h.valuation.reason : null,
    })),
    missing_rates: missingPairs(s.net, ctx.reportingCurrency),
    note: s.complete
      ? undefined
      : "Valuation is incomplete: totals cover valued holdings only, portfolio weights are null, and allocation-changing drafts are refused until the missing rates are added in Exchange rates.",
  };
}

// What the model is told about import completeness: a valued portfolio can
// still be missing positions the import couldn't read.
function completenessNote(ctx: CopilotContext) {
  const issues = ctx.importIssues;
  return {
    valuation_complete: ctx.valuationComplete,
    imports_complete: issues.length === 0,
    import_issues: issues.map(describeImportIssue),
    note:
      issues.length === 0
        ? undefined
        : "An import is incomplete or its completeness is unknown: the workspace may be missing positions, so don't present totals or weights as the whole portfolio, and trade-sizing drafts are refused.",
  };
}

// What the model is told about the rates in use: their age against the
// policy and any confirmation. Staleness is disclosed, not a reason to refuse.
function fxNote(ctx: CopilotContext) {
  const f = ctx.fx;
  return {
    policy_days: f.policyDays,
    current: f.current,
    stale_in_use: f.attention.map((l) => ({
      pair: l.key,
      stored_as: `${l.base}/${l.quote}`,
      rate: l.rate,
      as_of: utcDate(l.asOf),
      age_days: l.ageDays,
      source: l.source,
      unverified: l.unverified,
      used_by: l.uses.length,
    })),
    confirmation: f.confirmation.state === "none" ? null : { state: f.confirmation.state, expires_at: f.confirmation.expiresAt ? utcMinute(f.confirmation.expiresAt) : null },
    note:
      f.attention.length === 0
        ? undefined
        : `Some rates in use are older than ${f.policyDays} days or unverified (${f.attention.map(describeLeg).join("; ")}). Values still use them; mention their age when citing converted figures. The final PDF needs a refresh or the advisor's confirmation.`,
  };
}

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

function getPortfolioOverview(ctx: CopilotContext) {
  const { client } = ctx.snapshot;
  const nw = valuationSummary(ctx.holdings);
  const complete = ctx.valuationComplete;
  // Largest valued holdings; unvalued ones are listed under `valuation`.
  const top = ctx.holdings
    .filter((h) => !h.isLiability && reportingValue(h) != null)
    .sort((a, b) => reportingValue(b)! - reportingValue(a)!)
    .slice(0, 10)
    .map((h) => ({
      holding_id: h.id,
      name: h.assetName,
      account: ctx.accountName(h.accountId),
      asset_class: h.assetClass,
      currency: h.currency,
      value: round(reportingValue(h)),
      pct_of_investible: weight(ctx, reportingValue(h)),
    }));
  return {
    reporting_currency: ctx.reportingCurrency,
    // #109: the advisor's discovery records, with review status, unknowns and conflicts. Older profile
    // levels and defaults are not client answers and aren't sent. The client's name and identity and the
    // private discovery notes stay out of model-bound data (#59).
    client: {
      country_of_residence: client.countryOfResidence,
      client_brief: modelBoundClientBrief(client),
    },
    // status: complete | partial (valued holdings only) | unavailable (null values).
    net_worth: {
      status: nw.net.status,
      gross_assets: round(nw.assets.value),
      liabilities: nw.liabilities.value == null ? null : round(Math.abs(nw.liabilities.value)),
      net: round(nw.net.value),
    },
    valuation: valuationNote(ctx),
    fx_freshness: fxNote(ctx),
    // Both must be true before the portfolio is presented as complete.
    completeness: completenessNote(ctx),
    counts: { accounts: ctx.snapshot.accounts.length, holdings: ctx.holdings.length },
    // Valued holdings only; percentages are null while valuation is incomplete.
    allocation_by_asset_class: summarizeAllocation(ctx.holdings, (h) => h.assetClass).map((r) => ({
      label: r.label,
      value: round(r.value),
      pct: complete ? Math.round(r.pct * 10) / 10 : null,
    })),
    allocation_by_currency: summarizeAllocation(ctx.holdings, (h) => h.currency).map((r) => ({
      label: r.label,
      value: round(r.value),
      pct: complete ? Math.round(r.pct * 10) / 10 : null,
    })),
    top_holdings: top,
    // Each recommendation's amounts in its own currency and, converted once,
    // in the reporting currency, with the rate used (null when none applies).
    existing_recommendations: ctx.snapshot.recommendations.map((r) => {
      const converted = amountsInReporting(r, { reportingCurrency: ctx.reportingCurrency, rates: ctx.snapshot.fxRates });
      const percent = r.actionAmountUnit === "percent";
      return {
        title: r.title,
        type: r.type,
        holding_id: r.relatedHoldingId ?? null,
        approved: r.approvedByAdvisor,
        currency: r.currency,
        action_amount: r.actionAmount ?? null,
        action_amount_unit: r.actionAmountUnit ?? "amount",
        proposed_value: r.proposedValue ?? null,
        action_amount_in_reporting: converted.ok && !percent ? converted.amounts.actionAmount ?? null : null,
        proposed_value_in_reporting: converted.ok ? converted.amounts.proposedValue ?? null : null,
        rate_used: converted.ok && converted.conversion ? { ...converted.conversion, description: describeConversion(converted.conversion, ctx.now) } : null,
        not_applied_reason: converted.ok ? null : converted.reason,
        currency_review_open: r.currencyReview?.status === "open",
      };
    }),
  };
}

const ListInsightsInput = z.object({
  category: z.string().optional(),
  min_severity: z.enum(["info", "warning", "critical"]).optional(),
});

function listInsights(ctx: CopilotContext, input: z.infer<typeof ListInsightsInput>) {
  const rank = { info: 0, warning: 1, critical: 2 } as const;
  const min = rank[input.min_severity ?? "info"];
  const insights = generateInsights({ holdings: ctx.holdings, reportingCurrency: ctx.reportingCurrency, fx: { now: ctx.now, confirmed: ctx.fx.confirmation.state === "valid" } })
    .filter((i) => (input.category ? i.category === input.category : true))
    .filter((i) => rank[i.severity] >= min);
  return {
    count: insights.length,
    insights: insights.map((i) => ({
      category: i.category,
      severity: i.severity,
      title: i.title,
      detail: i.detail,
      related_holding_ids: i.relatedHoldingIds ?? [],
      // What the check rests on: a product-default threshold, its scope and dates, and what it can't see.
      basis: i.basis
        ? { source: i.basis.source, rule: i.basis.rule, observed: i.basis.observed ?? null, threshold: i.basis.threshold ?? null, scope: i.basis.scope, valuation_dates: i.basis.valuationDates ?? null, limitations: i.basis.limitations }
        : null,
    })),
    note: "Portfolio checks are built-in rules with product-default thresholds: facts about the data, not recommendations. Decide what matters from the client brief.",
  };
}

const GetHoldingInput = z.object({ holding_id: z.string() });

function getHolding(ctx: CopilotContext, input: z.infer<typeof GetHoldingInput>) {
  const h = ctx.holding(input.holding_id);
  if (!h) throw new ToolInputError(`No holding with id ${input.holding_id}`);
  return {
    holding_id: h.id,
    name: h.assetName,
    identifier: h.identifier ? `${h.identifier.type}:${h.identifier.value}` : null,
    account: ctx.accountName(h.accountId),
    asset_class: h.assetClass,
    sub_asset_class: h.subAssetClass ?? null,
    country: h.country ?? null,
    currency: h.currency,
    native_value: round(h.nativeMarketValue),
    reporting_value: round(reportingValue(h)),
    valuation_status: h.valuation.status,
    pct_of_investible: h.isLiability ? null : weight(ctx, reportingValue(h)),
    cost_basis: h.costBasis ?? null,
    expense_ratio_pct: h.expenseRatioPct ?? null,
    liquidity: h.liquidity ?? null,
    is_liability: !!h.isLiability,
    valuation: { source: h.valuationSource.kind, date: h.valuationDate ?? null, freshness: h.priceFreshness ?? null },
    advisor_verification: h.advisorVerification,
    data_quality_issues: h.dataQuality.map((d) => ({ code: d.code, severity: d.severity, message: d.message })),
  };
}

const RecShape = {
  holding_id: z.string().optional(),
  type: z.enum(REC_TYPES),
  action_amount: z.number().finite().optional(),
  action_amount_unit: z.enum(["amount", "percent"]).optional(),
  proposed_value: z.number().finite().optional(),
};
const SimulateInput = z.object({ ...RecShape, holding_id: z.string() });

// A tool call's amounts (in the reporting currency), ready to apply.
function toolAmounts(ctx: CopilotContext, input: { type: Recommendation["type"]; action_amount?: number; action_amount_unit?: "amount" | "percent"; proposed_value?: number }) {
  const r = amountsInReporting(
    { type: input.type, actionAmount: input.action_amount, actionAmountUnit: input.action_amount_unit, proposedValue: input.proposed_value, currency: ctx.reportingCurrency },
    { reportingCurrency: ctx.reportingCurrency, rates: ctx.snapshot.fxRates }
  );
  if (!r.ok) throw new ToolInputError(r.reason);
  return r.amounts;
}

// The same isolated engine simulation as the editor's live preview: actual
// cash offsets, household funding, missing rates and shortfalls. Tool amounts
// are in the reporting currency. Nothing is saved.
function enginePreview(ctx: CopilotContext, h: NormalizedHolding, input: { type: Recommendation["type"]; action_amount?: number; action_amount_unit?: "amount" | "percent"; proposed_value?: number }) {
  return previewRecommendation({
    rec: {
      id: "copilot_simulation",
      title: "Simulation",
      type: input.type,
      relatedHoldingId: h.id,
      relatedAccountId: h.accountId,
      actionAmount: input.action_amount,
      actionAmountUnit: input.action_amount_unit,
      proposedValue: input.proposed_value,
      currency: ctx.reportingCurrency,
      rationale: "",
      priority: "medium",
      status: "draft",
      includeInPdf: false,
      approvedByAdvisor: false,
      createdAt: "",
      updatedAt: "",
    },
    holdings: ctx.holdings,
    recommendations: ctx.snapshot.recommendations,
    accounts: ctx.snapshot.accounts,
    fx: { reportingCurrency: ctx.reportingCurrency, rates: ctx.snapshot.fxRates },
    sourceDocuments: ctx.snapshot.sourceDocuments ?? [],
  });
}

function simulate(ctx: CopilotContext, input: z.infer<typeof SimulateInput>) {
  const h = ctx.holding(input.holding_id);
  if (!h) throw new ToolInputError(`No holding with id ${input.holding_id}`);
  const preview = enginePreview(ctx, h, input);
  const position = preview.standalone?.applied ? preview.standalone.position : null;
  if (!position) {
    return {
      holding: h.assetName,
      currency: ctx.reportingCurrency,
      before: reportingValue(h) == null ? null : cents(reportingValue(h)!),
      after: null,
      delta: null,
      pct_change: null,
      pct_of_investible_before: null,
      pct_of_investible_after: null,
      cash_movements: [],
      shortfalls: [],
      note: preview.warnings.find((w) => w.kind === "missing_rate" || w.kind === "unvalued" || w.kind === "funding")?.message ?? "This recommendation can't be simulated.",
    };
  }
  const { before, after, change } = position;
  // Weights are null while valuation is incomplete: the denominator is unknown.
  return {
    holding: h.assetName,
    currency: ctx.reportingCurrency,
    before: cents(before),
    after: cents(after),
    delta: cents(change),
    pct_change: position.pctChange == null ? null : Math.round(position.pctChange * 10_000) / 10_000,
    pct_of_investible_before: h.isLiability ? null : weight(ctx, before),
    pct_of_investible_after: h.isLiability ? null : weight(ctx, after),
    // Cash lines the engine actually moved (offsets, household funding of a
    // paydown, new cash lines); empty for a cash position's own change.
    cash_movements: preview.standalone!.cash.map((c) => ({
      holding: c.name,
      account: c.accountName,
      before: cents(c.before),
      after: cents(c.after),
      change: cents(c.change),
      new_line: c.synthetic,
    })),
    shortfalls: preview.standalone!.shortfalls.map((s) => ({ account: s.accountName, shortfall: cents(s.shortfall) })),
    combined_with_other_approved: preview.combined
      ? { others: preview.combined.others.map((o) => o.title), position_after: preview.combined.position ? cents(preview.combined.position.after) : null }
      : null,
    note:
      preview.state === "no_change"
        ? "No allocation change: this type is allocation-neutral or needs an action_amount / proposed_value."
        : ctx.valuationComplete
        ? undefined
        : "Valuation is incomplete, so weights are not shown.",
  };
}

const cents = (n: number) => Math.round(n * 100) / 100;

function checkReadiness(ctx: CopilotContext) {
  const s = ctx.snapshot;
  // Same shared evaluation the dashboard, PDF Preview and PDF API use.
  const checks = evaluateWorkspaceReadiness({
    client: s.client,
    advisor: s.advisor,
    accounts: s.accounts,
    holdings: ctx.holdings,
    recommendations: s.recommendations,
    disclosures: s.disclosures,
    fxRates: s.fxRates,
    sourceDocuments: s.sourceDocuments ?? [],
    fxConfirmation: s.fxConfirmation ?? null,
    now: ctx.now,
    drafts: [...(s.workingDraft ? [s.workingDraft] : []), ...(s.alternatives ?? [])],
  });
  return {
    ready: readinessOk(checks),
    checks: checks.map((c) => ({ check: c.label, passed: c.passed, detail: c.detail ?? null })),
  };
}

// ---------------------------------------------------------------------------
// D4: the active alternative through the shared desk evaluator
// ---------------------------------------------------------------------------

const money2 = (n: number | null) => (n == null ? null : cents(n));

/** Why a position-sizing change can't be evaluated honestly right now, or null. */
function sizingBlocked(ctx: CopilotContext): string | null {
  if (!ctx.valuationComplete) {
    return `Valuation is incomplete (${missingPairs(valuationSummary(ctx.holdings).net, ctx.reportingCurrency).join(", ")} rate missing), so allocation-changing drafts are paused. Draft an advisory recommendation instead, or ask the advisor to add the missing rate in Exchange rates.`;
  }
  if (!ctx.importsComplete) {
    return `An import is incomplete or its completeness is unknown (${ctx.importIssues.map(describeImportIssue).join("; ")}), so trade-sizing drafts are paused. Draft an advisory recommendation instead (for example, to obtain a complete statement).`;
  }
  return null;
}

function scopeSummary(d: DeskResult) {
  return {
    totals: { current: money2(d.totals.current), proposed: money2(d.totals.proposed) },
    allocation: d.rows.map((r) => ({
      asset_class: r.assetClass,
      current: money2(r.current),
      proposed: money2(r.proposed),
      current_pct: r.currentPct == null ? null : Math.round(r.currentPct * 10) / 10,
      proposed_pct: r.proposedPct == null ? null : Math.round(r.proposedPct * 10) / 10,
      target_pct: r.targetPct,
      drift_pts: r.driftPts == null ? null : Math.round(r.driftPts * 10) / 10,
    })),
  };
}

function scopeOverview(ctx: CopilotContext) {
  const d = ctx.desk();
  return {
    context: {
      alternative: ctx.draft.name,
      input_revision: ctx.context.inputRevision,
      scope: d.scope.chosen ? "selected accounts" : "every investment account",
    },
    reporting_currency: ctx.reportingCurrency,
    scope_accounts: d.scope.accounts.map((a) => ({ account_id: a.id, name: a.name, current: money2(a.current), proposed: money2(a.proposed) })),
    ...scopeSummary(d),
    // #113: targets are the advisor's own goals for this alternative, distinct from anything the model drafts.
    targets_note:
      "target_pct is the advisor's own allocation target for this alternative (set on the allocation desk), not a recommendation and not the client's stated policy; null means no target is set. A target never creates a trade, and drift_pts is the distance from it.",
    // In-scope positions; only these can be simulated or drafted here.
    positions: d.positions.map((p) => ({
      holding_id: p.id,
      name: p.name,
      account: p.accountName,
      asset_class: p.assetClass,
      current: money2(p.current),
      proposed: money2(p.proposed),
      proposed_only: p.proposedOnly,
    })),
    // Outside the scope: shown as context, never in the weights.
    household_context: {
      outside_scope_total: money2(d.context.total),
      outside_scope_accounts: d.context.accounts.map((a) => ({ name: a.name, value: money2(a.value) })),
      liabilities_total: money2(d.liabilities.total),
    },
    alternative_actions: d.actions.map((r) => ({ title: r.title, approved: r.approvedByAdvisor })),
    unvalued_in_scope: d.unvalued.map((u) => ({ holding_id: u.id, name: u.name })),
    blocked: d.blocked.map((b) => ({ reason: b.reason, actions: b.recommendationIds.length })),
    shortfalls: d.shortfalls.map((s) => ({ account: s.accountName, shortfall: cents(s.shortfall) })),
    reserves: d.reserves.map((r) => ({ account: r.accountName, reserve: r.reserve, reserve_currency: r.reserveCurrency, available: r.available == null ? null : cents(r.available), currency: r.currency, breached: r.breached })),
    completeness: completenessNote(ctx),
    note: d.scope.chosen ? "Weights and totals cover the selected investment scope only; household context is listed separately and is never in a denominator." : undefined,
  };
}

const ScopeChangeInput = z.object({
  holding_id: z.string(),
  change: z.enum(["reduce", "increase", "exit"]),
  amount: z.number().finite().positive().optional(),
});

function simulateScopeChange(ctx: CopilotContext, input: z.infer<typeof ScopeChangeInput>) {
  const h = ctx.holding(input.holding_id);
  if (!h) throw new ToolInputError(`No holding with id ${input.holding_id}`);
  const before = ctx.desk();
  if (!before.scope.accountIds.includes(h.accountId)) {
    throw new ToolInputError(`${h.assetName} is outside the selected investment scope (${ctx.accountName(h.accountId)} is household context). Only in-scope positions can be simulated or drafted.`);
  }
  const blocked = sizingBlocked(ctx);
  if (blocked) throw new ToolInputError(blocked);
  if (input.change !== "exit" && input.amount == null) throw new ToolInputError("A reduce or increase needs an amount in the reporting currency.");
  const amount = input.change === "exit" ? undefined : cents(input.amount!);
  const key = { revision: ctx.context.inputRevision, holding: h.id, change: input.change, amount: amount ?? null };
  const id = `rec_ai_${contentHash(key)}`;
  let candidate: Recommendation;
  try {
    candidate = positionEditRecommendation({ holding: h, kind: input.change, amount, reportingCurrency: ctx.reportingCurrency, id, now: ctx.now.toISOString() });
  } catch (err) {
    throw new ToolInputError((err as Error).message);
  }
  // Drafts already saved in this run that change a position: each simulation
  // builds on them, as accepting them together would.
  const prior = ctx.drafts.filter((d) => d.relatedHoldingId && (d.actionAmount != null || d.proposedValue != null));
  const base = { recommendations: [...ctx.snapshot.recommendations, ...prior], draft: { ...ctx.draft, memberIds: [...ctx.draft.memberIds, ...prior.map((d) => d.id)] } };
  const start = ctx.desk(prior);
  const preview = previewDraftEdit({ holdings: ctx.holdings, accounts: ctx.snapshot.accounts, ...base, candidate, fx: ctx.fxContext });
  const after = ctx.desk([...prior, candidate]);
  // The same gate acceptance applies: blocked or unconverted, a new or deeper
  // shortfall, or eligible cash below its reserve (a purchase into an account
  // already below it included).
  const problems = candidateProblems({ holdings: ctx.holdings, accounts: ctx.snapshot.accounts, ...base, candidates: [candidate], fx: ctx.fxContext });
  const shortfallBefore = new Map(start.shortfalls.map((s) => [s.accountId, s.shortfall] as const));
  const newShortfalls = after.shortfalls.filter((s) => s.shortfall > (shortfallBefore.get(s.accountId) ?? 0) + 0.005);
  const breachedBefore = new Set(start.reserves.filter((r) => r.breached).map((r) => r.accountId));
  const reserveBreaches = after.reserves.filter((r) => r.breached && (!breachedBefore.has(r.accountId) || (candidate.type === "increase" && r.accountId === h.accountId)));
  const duplicate = ctx.snapshot.recommendations.find(
    (r) => r.status !== "excluded" && r.relatedHoldingId === h.id && r.type === candidate.type && r.actionAmountUnit === candidate.actionAmountUnit && r.actionAmount === candidate.actionAmount
  );
  const reason = problems.length > 0 ? problems.join(" ") : duplicate ? `The same action is already on file ("${duplicate.title}").` : null;
  const simulationId = `sim_${contentHash(key)}`;
  ctx.simulations.set(simulationId, { candidate, draftable: reason == null, reason });
  return {
    simulation_id: simulationId,
    holding: h.assetName,
    change: input.change,
    amount,
    currency: ctx.reportingCurrency,
    position: { before: money2(preview.position.before), after: money2(preview.position.after) },
    cash: preview.cash.map((c) => ({ holding: c.name, account: c.accountName, before: cents(c.before), after: cents(c.after) })),
    blocked: preview.blocked.map((b) => b.reason),
    new_shortfalls: newShortfalls.map((s) => ({ account: s.accountName, shortfall: cents(s.shortfall) })),
    reserve_breaches: reserveBreaches.map((r) => ({ account: r.accountName, reserve: r.reserve, reserve_currency: r.reserveCurrency, available: r.available == null ? null : cents(r.available), currency: r.currency })),
    drafts_already_included: prior.map((d) => d.title),
    scope_before: scopeSummary(start),
    scope_after: scopeSummary(after),
    draftable: reason == null,
    not_draftable_reason: reason,
    note: "Simulated in the active alternative with the shared evaluator; nothing was saved.",
  };
}

const DraftInput = z.object({
  ...RecShape,
  simulation_id: z.string().optional(),
  title: z.string().min(3).max(160),
  priority: z.enum(["low", "medium", "high"]),
  rationale: z.string().min(10).max(2000),
  client_benefit: z.string().max(1000).optional(),
  risk_tradeoff: z.string().max(1000).optional(),
  tax_note: z.string().max(1000).optional(),
  implementation_step: z.string().max(1000).optional(),
});

function draftRecommendation(ctx: CopilotContext, input: z.infer<typeof DraftInput>) {
  if (ctx.drafts.length >= MAX_DRAFTS_PER_RUN) {
    throw new ToolInputError(`Draft limit reached (${MAX_DRAFTS_PER_RUN} per request).`);
  }
  if (input.holding_id && !ctx.holding(input.holding_id)) {
    throw new ToolInputError(`No holding with id ${input.holding_id}`);
  }
  let sized: Recommendation | null = null;
  if (input.simulation_id) {
    const sim = ctx.simulations.get(input.simulation_id);
    if (!sim) throw new ToolInputError(`No simulation with id ${input.simulation_id} in this request. Run simulate_scope_change first.`);
    if (!sim.draftable) throw new ToolInputError(`That simulation can't become a draft: ${sim.reason}`);
    sized = sim.candidate;
  } else if (input.holding_id) {
    // While any holding is unvalued or an import is incomplete, a trade can't
    // be sized honestly. Otherwise a position-changing draft must be the
    // exact action a scope simulation evaluated. Advisory drafts (no value
    // change) still go through.
    // Advisory only when the shared engine finds no effect at all: its preview
    // treats a half-cent move of the position or any cash line as a change.
    const h = ctx.holding(input.holding_id)!;
    toolAmounts(ctx, input);
    const changes = enginePreview(ctx, h, input).state !== "no_change";
    if (changes) {
      const blocked = sizingBlocked(ctx);
      if (blocked) throw new ToolInputError(blocked);
      throw new ToolInputError("A draft that changes a position must come from a simulation: run simulate_scope_change for this change and pass its simulation_id.");
    }
  }
  const now = todayIso();
  const id = sized?.id ?? `rec_ai_${contentHash({ revision: ctx.context.inputRevision, type: input.type, holding: input.holding_id ?? null, title: input.title })}`;
  if (ctx.drafts.some((d) => d.id === id)) throw new ToolInputError("That draft was already saved in this request.");
  if (ctx.snapshot.recommendations.some((r) => r.id === id)) throw new ToolInputError("That draft was already accepted into the workspace.");
  const base = sized ?? {
    id,
    type: input.type,
    relatedHoldingId: input.holding_id,
    relatedAccountId: input.holding_id ? ctx.holding(input.holding_id)?.accountId : undefined,
    actionAmount: input.action_amount,
    actionAmountUnit: input.action_amount_unit,
    proposedValue: input.proposed_value,
    currency: ctx.reportingCurrency,
  };
  const rec: Recommendation = {
    ...base,
    id,
    title: input.title,
    rationale: input.rationale,
    clientBenefit: input.client_benefit,
    riskTradeoff: input.risk_tradeoff,
    taxNote: input.tax_note,
    implementationStep: input.implementation_step,
    complianceNote: `Drafted by Stratovell AI for "${ctx.draft.name}" (input revision ${ctx.context.inputRevision}). Requires advisor review and approval before client use.`,
    priority: input.priority,
    // Hard-coded, not model-controlled: AI drafts are never approved and never
    // reach the client PDF until the advisor flips these in the UI.
    status: "needs_review",
    approvedByAdvisor: false,
    includeInPdf: false,
    createdAt: now,
    updatedAt: now,
  } as Recommendation;
  ctx.drafts.push(rec);
  return {
    draft_id: rec.id,
    status: "needs_review (advisor approval required)",
    sized_from: input.simulation_id ?? null,
    effect: sized ? "As simulated; see the simulation result." : input.holding_id ? "Advisory: no position change." : "Advisory only: no allocation impact.",
  };
}

// ---------------------------------------------------------------------------
// #119: Prepare allocation proposal
// ---------------------------------------------------------------------------

const ALLOCATION_CLASSES = (Object.keys(ASSET_CLASS_LABELS) as AssetClass[]).filter((c) => c !== "liability") as [AssetClass, ...AssetClass[]];
const QUESTION_IDS = QUESTIONS.map((q) => q.id) as [DiscoveryQuestionId, ...DiscoveryQuestionId[]];
const WeightIn = z.object({ asset_class: z.enum(ALLOCATION_CLASSES), pct: z.number().finite() });
const ProposeAllocationInput = z.object({
  outcome: z.enum(["propose_changes", "maintain_current_mix", "ask_question"]),
  headline: z.string().min(3).max(160),
  rationale: z.string().min(10).max(3000),
  // The client's recorded answers the decision rests on (Stratovell quotes them) and how each supports it.
  client_basis: z.array(z.object({ question: z.enum(QUESTION_IDS), supports: z.string().min(10).max(600) })).max(10).optional(),
  proposed_weights: z.array(WeightIn).max(20).optional(),
  alternative: z.object({ summary: z.string().min(3).max(1000), weights: z.array(WeightIn).max(20).optional() }).optional(),
  question: z.object({ text: z.string().min(5).max(600), decides: z.string().min(3).max(600) }).optional(),
  groups: z
    .array(
      z.object({
        title: z.string().min(3).max(160),
        rationale: z.string().min(3).max(1000),
        legs: z.array(z.object({ holding_id: z.string(), change: z.enum(["reduce", "increase"]), amount: z.number().finite().positive() })).min(1).max(4),
      })
    )
    .max(MAX_GROUPS)
    .optional(),
});

const OUTCOME: Record<z.infer<typeof ProposeAllocationInput>["outcome"], AllocationOutcome> = { propose_changes: "propose", maintain_current_mix: "maintain", ask_question: "ask" };
const weightsOf = (w: z.infer<typeof WeightIn>[]): ClassWeight[] => w.map((x) => ({ assetClass: x.asset_class, pct: x.pct }));
/** The tools whose results must reach the model, on an earlier turn, before it decides (review finding 1). */
const DECISION_INPUTS = ["get_portfolio_overview", "get_scope_overview"] as const;

function proposeAllocation(ctx: CopilotContext, input: z.infer<typeof ProposeAllocationInput>) {
  if (ctx.allocation) throw new ToolInputError("An allocation decision was already returned in this request; there is one per request.");
  // The decision must be made on inputs the model has actually received: tool results delivered on an earlier turn.
  const unseen = DECISION_INPUTS.filter((t) => !(ctx.deliveredTurn(t) < ctx.turn));
  if (unseen.length)
    throw new ToolInputError(`The client brief (get_portfolio_overview) and the investment scope (get_scope_overview) must reach you before you decide: call ${unseen.join(" and ")} first, read the results, then decide on a later turn.`);
  const outcome = OUTCOME[input.outcome];
  const inp = ctx.proposalInputs;
  const desk = deskWith(inp);
  const current = recordedWeights(desk);
  const { unclassified } = scopeExceptions(inp, desk);
  const client = ctx.snapshot.client;
  const brief = briefReadiness(client);
  const base = {
    headline: input.headline,
    rationale: input.rationale,
    briefReady: brief.ready,
    briefIssues: brief.issues,
    unknowns: brief.unknowns,
    reportingCurrency: ctx.reportingCurrency,
    scopeTotal: cents(desk.totals.current),
    scopeAccounts: desk.scope.accounts.map((a) => a.name),
    currentWeights: current,
    unclassified,
    addable: false,
  };

  if (outcome === "ask") {
    if (!input.question) throw new ToolInputError("ask_question needs question.text (one specific question for the advisor) and question.decides (what the answer would decide).");
    if (input.proposed_weights?.length || input.groups?.length) throw new ToolInputError("A question carries no weights or actions: nothing is ready to approve until it is answered.");
    ctx.allocation = { ...base, outcome, objectiveRefs: [], clientBasis: [], question: input.question, proposedWeights: null, alternative: null, strategyDraftId: null, groups: [] };
    return { outcome: "ask_question", brief_ready: brief.ready, brief_issues: brief.issues, note: "No mix is proposed and nothing is drafted; the advisor answers the question first." };
  }

  // A mix or a hold is personal: it needs the material questions reviewed with no open conflict, and a fully valued, complete scope.
  if (!brief.ready) throw new ToolInputError(`The client brief doesn't support a personalized decision yet: ${brief.issues.join(" ")} Return outcome ask_question with one specific question and what its answer decides.`);
  const blocked = sizingBlocked(ctx);
  if (blocked) throw new ToolInputError(blocked);
  if (!(desk.totals.current > 0)) throw new ToolInputError("Nothing in the investment scope is valued, so there is no mix to propose.");
  // Why, in the client's terms: each basis quotes a recorded answer; naming a question isn't enough.
  if (!input.client_basis?.length) throw new ToolInputError("Give client_basis: the recorded answers the decision rests on (question), and how each supports it (supports).");
  const clientBasis = input.client_basis.map((b) => {
    const said = describeAnswer(client, b.question);
    if (said == null) throw new ToolInputError(`${questionLabel(b.question)} wasn't answered, so it can't be cited as what the client said.`);
    return { question: b.question, said, supports: b.supports };
  });
  const objectiveRefs = [...new Set(clientBasis.map((b) => b.question))];

  const held = desk.rows.filter((r) => r.current > 0.005).map((r) => r.assetClass);
  let proposed: ClassWeight[];
  if (outcome === "maintain") {
    if (input.groups?.length) throw new ToolInputError("maintain_current_mix keeps the current mix: it carries no actions.");
    proposed = current; // exact, as recorded: a hold proposes no action
  } else {
    if (!input.proposed_weights?.length) throw new ToolInputError("propose_changes needs proposed_weights: one per asset class, totalling 100 with cash.");
    proposed = weightsOf(input.proposed_weights);
    const problems = weightProblems(proposed, held);
    if (problems.length) throw new ToolInputError(`Proposed weights not usable: ${problems.join(" ")}`);
    if (!input.alternative) throw new ToolInputError("A proposed mix needs a plausible alternative considered (alternative.summary), and why it wasn't chosen.");
    if (input.alternative.weights) {
      const alt = weightProblems(weightsOf(input.alternative.weights), held);
      if (alt.length) throw new ToolInputError(`Alternative weights not usable: ${alt.join(" ")}`);
    }
  }
  // The five-record limit covers the strategy and every leg: a decision over it is refused whole, never trimmed.
  const legCount = (input.groups ?? []).reduce((n, g) => n + g.legs.length, 0);
  if (1 + legCount > MAX_DRAFTS_PER_RUN)
    throw new ToolInputError(`A decision can carry at most ${MAX_DRAFTS_PER_RUN} records: the strategy plus ${MAX_DRAFTS_PER_RUN - 1} trade legs. This one has ${1 + legCount}; propose fewer groups (a funded group's legs stay together).`);

  const now = ctx.now.toISOString();
  const revision = ctx.context.inputRevision;
  const groups = (input.groups ?? []).map((g, gi) => {
    const group: GroupInput = { title: g.title, rationale: g.rationale, legs: g.legs.map((l) => ({ holdingId: l.holding_id, change: l.change, amount: cents(l.amount) })) };
    const gid = `grp_ai_${contentHash({ revision, gi, group })}`;
    const first = group.legs.map((l) => legProblem(inp, desk, l)).find((p) => p != null) ?? null;
    const legs = first ? null : groupLegs(inp, group, { group: gid, leg: (i) => `rec_ai_${contentHash({ gid, i })}` }, now);
    const { problem } = checkGroup(inp, desk, group, legs);
    return { gid, group, legs: problem ? null : legs, problem };
  });
  const feasibleLegs = groups.flatMap((g) => g.legs ?? []);
  const selection = evaluateSelection(inp, feasibleLegs, proposed);
  const strategyScope = desk.scope.accountIds;
  const strategyId = `rec_ai_${contentHash({ revision, outcome, headline: input.headline, proposed })}`;
  const strategy = strategyRecommendation({
    id: strategyId,
    decision: { outcome, headline: input.headline, rationale: input.rationale, objectiveRefs, proposedWeights: proposed, alternative: input.alternative ? { summary: input.alternative.summary, ...(input.alternative.weights ? { weights: weightsOf(input.alternative.weights) } : {}) } : undefined },
    currentWeights: current,
    groupIds: groups.filter((g) => g.legs).map((g) => g.gid),
    clientBasis,
    basis: {
      inputRevision: revision,
      // The accounts actually in scope at decision time (review finding 4), and what a material change is measured against.
      scopeAccountIds: [...strategyScope],
      reportingCurrency: ctx.reportingCurrency,
      scopeTotal: cents(desk.totals.current),
      material: materialBasis({ client, accounts: ctx.snapshot.accounts, holdings: ctx.snapshot.holdings, fxRates: ctx.snapshot.fxRates, reportingCurrency: ctx.reportingCurrency }, strategyScope, strategyScope),
    },
    now,
  });
  const consistency = strategyRecordProblems(strategy.allocationStrategy!);
  if (consistency.length) throw new ToolInputError(`The decision isn't consistent: ${consistency.join(" ")}`);
  for (const r of [strategy, ...feasibleLegs]) {
    if (ctx.snapshot.recommendations.some((x) => x.id === r.id)) throw new ToolInputError("This decision was already added to the workspace.");
  }
  // Hard-coded, as for every AI draft: unapproved, out of the PDF, and only a preview until the advisor adds it.
  const note = `Prepared by Stratovell AI for "${ctx.draft.name}" (input revision ${revision}). Requires advisor review and approval before client use.`;
  for (const r of [strategy, ...feasibleLegs]) ctx.drafts.push({ ...r, complianceNote: note, status: "needs_review", approvedByAdvisor: false, includeInPdf: false });

  const accountName = (hid: string) => ctx.accountName(ctx.holding(hid)?.accountId ?? "");
  ctx.allocation = {
    ...base,
    outcome,
    objectiveRefs,
    clientBasis: clientBasis.map((b) => ({ ...b, label: questionLabel(b.question) })),
    question: null,
    proposedWeights: proposed,
    alternative: input.alternative ? { summary: input.alternative.summary, ...(input.alternative.weights ? { weights: weightsOf(input.alternative.weights) } : {}) } : null,
    strategyDraftId: strategyId,
    // Addable only once the run completes (set by the agent loop).
    addable: false,
    groups: groups.map((g) => ({
      id: g.gid,
      title: g.group.title,
      rationale: g.group.rationale,
      legIds: (g.legs ?? []).map((l) => l.id),
      problem: g.problem,
      legs: g.group.legs.map((l) => ({ holdingId: l.holdingId, name: ctx.holding(l.holdingId)?.assetName ?? l.holdingId, accountName: accountName(l.holdingId), change: l.change, amount: l.amount })),
    })),
  };
  // Review finding 3: nothing the model wrote is echoed back (titles, headline, rationale), and its own weights and the
  // gaps measured against them are kept apart from engine results (claude_* and gap_* below are its proposal, not evidence).
  return {
    outcome: input.outcome,
    reporting_currency: ctx.reportingCurrency,
    scope_total: cents(desk.totals.current),
    mix: selection.rows.map((r) => ({
      asset_class: r.assetClass,
      current_pct: Math.round(r.currentPct * 10) / 10,
      current_amount: r.currentAmount,
      claude_proposed_pct: r.proposedPct,
      result_pct: r.resultPct,
      result_amount: r.resultAmount,
      gap_pts: r.gapPts,
      gap_amount: r.gapAmount,
      no_eligible_candidate: r.noEligibleCandidate,
    })),
    groups: groups.map((g, i) => ({ group: i + 1, feasible: g.problem == null, not_feasible_reason: g.problem })),
    combined_problems: selection.problems,
    still_unknown: brief.unknowns,
    unclassified_in_scope: unclassified.map((u) => u.name),
    note:
      "claude_proposed_pct is your judgment, not a calculation; gap_pts and gap_amount are measured against it. current_* and result_* are engine results (result: every feasible group selected). Saved as unapproved previews: the strategy record and each feasible group. The advisor chooses which groups to add; nothing is approved here. no_eligible_candidate means no existing eligible holding could take it (a new security would be needed).",
  };
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export class ToolInputError extends Error {}

type ToolSpec = {
  definition: Anthropic.Beta.BetaTool;
  run: (ctx: CopilotContext, input: unknown) => unknown;
};

const recProperties = {
  holding_id: { type: "string", description: "holding_id from get_portfolio_overview, list_insights or get_holding." },
  type: { type: "string", enum: [...REC_TYPES] },
  action_amount: {
    type: "number",
    description: "Optional size of the action: an amount in the reporting currency, or a percent of the position when action_amount_unit is 'percent'. Drafts are saved in the reporting currency.",
  },
  action_amount_unit: { type: "string", enum: ["amount", "percent"] },
  proposed_value: { type: "number", description: "Optional explicit target value for the position in the reporting currency (even when action_amount is a percent); overrides action_amount." },
} as const;

const TOOLS: Record<string, ToolSpec> = {
  get_portfolio_overview: {
    definition: {
      name: "get_portfolio_overview",
      description:
        "The client brief (the advisor's discovery records: objectives, time horizon, liquidity and income needs, loss willingness and ability, tax sensitivity and constraints, each with its review status, plus what wasn't discussed and possible conflicts), net worth, allocation by asset class and currency, the ten largest positions and the recommendations already on file, all valued by the Stratovell valuation and FX engines in the proposal's reporting currency. Call this first.",
      input_schema: { type: "object", properties: {} },
    },
    run: (ctx) => getPortfolioOverview(ctx),
  },
  list_insights: {
    definition: {
      name: "list_insights",
      description:
        "Stratovell's portfolio checks: built-in rules over the recorded data (concentration, currency and country exposure, illiquid assets, cash share, fund expense ratios, manual valuations and data-quality problems). Each check gives its basis: the observed figure, its threshold (a product default, not a regulatory limit or the client's policy), the scope, valuation dates and limitations. A check is a fact to analyze, not a recommendation.",
      input_schema: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: ["concentration", "currency", "country", "liquidity", "fees", "valuation", "data_quality"],
          },
          min_severity: { type: "string", enum: ["info", "warning", "critical"] },
        },
      },
    },
    run: (ctx, input) => listInsights(ctx, ListInsightsInput.parse(input)),
  },
  get_holding: {
    definition: {
      name: "get_holding",
      description: "Full detail for one holding, including valuation source, verification status and data-quality issues.",
      input_schema: { type: "object", properties: { holding_id: recProperties.holding_id }, required: ["holding_id"] },
    },
    run: (ctx, input) => getHolding(ctx, GetHoldingInput.parse(input)),
  },
  simulate_recommendation: {
    definition: {
      name: "simulate_recommendation",
      description:
        "Run a hypothetical recommendation through the same engine that builds the proposal's Before / After view: the position's value and weight before and after, the cash lines it actually moves (including household cash used for a debt paydown), and any cash shortfall. Changes nothing.",
      input_schema: { type: "object", properties: recProperties, required: ["holding_id", "type"] },
    },
    run: (ctx, input) => simulate(ctx, SimulateInput.parse(input)),
  },
  check_proposal_readiness: {
    definition: {
      name: "check_proposal_readiness",
      description: "Run the Stratovell compliance readiness checklist that gates PDF generation and report which checks fail.",
      input_schema: { type: "object", properties: {} },
    },
    run: (ctx) => checkReadiness(ctx),
  },
  get_scope_overview: {
    definition: {
      name: "get_scope_overview",
      description:
        "The active alternative through the Stratovell allocation desk: its investment scope, current and proposed totals and asset-class weights (scope only), target drift, in-scope positions, household context outside the scope, the alternative's actions, blocked actions, shortfalls and reserves, and the input revision. Use it before simulating a change.",
      input_schema: { type: "object", properties: {} },
    },
    run: (ctx) => scopeOverview(ctx),
  },
  simulate_scope_change: {
    definition: {
      name: "simulate_scope_change",
      description:
        "Evaluate one position change (reduce or increase by an amount in the reporting currency, or exit) in the active alternative with the shared desk evaluator: the position and cash before and after, any blocked unit or new shortfall, and the scope's totals and weights before and after. Only in-scope, valued, non-cash positions. Changes nothing. Returns a simulation_id; a position-changing draft must cite one that is draftable.",
      input_schema: {
        type: "object",
        properties: {
          holding_id: recProperties.holding_id,
          change: { type: "string", enum: ["reduce", "increase", "exit"] },
          amount: { type: "number", description: "Amount in the reporting currency (omit for exit)." },
        },
        required: ["holding_id", "change"],
      },
    },
    run: (ctx, input) => simulateScopeChange(ctx, ScopeChangeInput.parse(input)),
  },
  draft_recommendation: {
    definition: {
      name: "draft_recommendation",
      description: `Save a recommendation draft for the advisor to review. Drafts are always unapproved and excluded from the client PDF; they appear as a preview the advisor may accept into the active alternative. At most ${MAX_DRAFTS_PER_RUN} per request. A draft that changes a position must pass the simulation_id of a draftable simulate_scope_change result; its type and amount come from that simulation. Advisory drafts (no position change) need no simulation. While any holding can't be valued or an import is incomplete, position-changing drafts are refused.`,
      input_schema: {
        type: "object",
        properties: {
          ...recProperties,
          simulation_id: { type: "string", description: "From simulate_scope_change, for a draft that changes a position." },
          holding_id: { ...recProperties.holding_id, description: "Omit for advisory-only recommendations." },
          title: { type: "string" },
          priority: { type: "string", enum: ["low", "medium", "high"] },
          rationale: { type: "string", description: "Why, citing figures returned by the tools." },
          client_benefit: { type: "string" },
          risk_tradeoff: { type: "string" },
          tax_note: { type: "string" },
          implementation_step: { type: "string" },
        },
        required: ["type", "title", "priority", "rationale"],
      },
    },
    run: (ctx, input) => draftRecommendation(ctx, DraftInput.parse(input)),
  },
  propose_allocation: {
    definition: {
      name: "propose_allocation",
      description: [
        "Return the allocation decision for the active alternative's investment scope (once per request).",
        "outcome: propose_changes (a target asset-class mix), maintain_current_mix (a justified hold: no trade), or ask_question (information that would change the decision is missing or conflicting).",
        "proposed_weights are your judgment, separate from the advisor's own desk targets: percent of the in-scope portfolio, every class held in scope listed (0 to exit it), totalling 100 with cash. Include objective_refs (the client-brief questions it rests on) and a plausible alternative.",
        "groups: up to 4 funded implementation options using holdings already owned in scope (holding_id from get_scope_overview). A group's legs are in one account; a purchase is funded by the group's own sale or existing cash; a restricted security can't be bought and a retained one can't be sold. A group with a sale and a purchase applies whole or not at all.",
        "The engines check everything and return the current mix, your weights, the result of every feasible group selected and the remaining gap; a class with no eligible existing holding is reported, never filled with an invented security, price, fee or tax effect.",
        "Nothing is approved: the strategy record and feasible groups are unapproved previews the advisor may add.",
      ].join(" "),
      input_schema: {
        type: "object",
        properties: {
          outcome: { type: "string", enum: ["propose_changes", "maintain_current_mix", "ask_question"] },
          headline: { type: "string", description: "One line: what should change (or why the mix stays)." },
          rationale: { type: "string", description: "Client-specific reasoning from the reviewed brief and tool figures." },
          objective_refs: { type: "array", items: { type: "string", enum: [...QUESTION_IDS] } },
          proposed_weights: { type: "array", items: { type: "object", properties: { asset_class: { type: "string", enum: [...ALLOCATION_CLASSES] }, pct: { type: "number" } }, required: ["asset_class", "pct"] } },
          alternative: { type: "object", properties: { summary: { type: "string" }, weights: { type: "array", items: { type: "object", properties: { asset_class: { type: "string", enum: [...ALLOCATION_CLASSES] }, pct: { type: "number" } }, required: ["asset_class", "pct"] } } }, required: ["summary"] },
          question: { type: "object", properties: { text: { type: "string" }, decides: { type: "string" } }, required: ["text", "decides"] },
          groups: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                rationale: { type: "string" },
                legs: { type: "array", items: { type: "object", properties: { holding_id: { type: "string" }, change: { type: "string", enum: ["reduce", "increase"] }, amount: { type: "number", description: "In the reporting currency." } }, required: ["holding_id", "change", "amount"] } },
              },
              required: ["title", "rationale", "legs"],
            },
          },
        },
        required: ["outcome", "headline", "rationale"],
      },
    },
    run: (ctx, input) => proposeAllocation(ctx, ProposeAllocationInput.parse(input)),
  },
};

/**
 * #119 (review finding 1): each task has its own tools. An ordinary question gets every tool but the
 * allocation decision; Prepare allocation proposal gets the read and simulation tools and the decision,
 * never the generic draft tool, so only a validated decision can supply its records.
 */
const ALLOCATION_ONLY = new Set(["propose_allocation"]);
const NOT_IN_ALLOCATION = new Set(["draft_recommendation"]);
export function copilotToolsFor(task: "allocation_proposal" | null | undefined): Anthropic.Beta.BetaTool[] {
  return Object.entries(TOOLS)
    .filter(([name]) => (task === "allocation_proposal" ? !NOT_IN_ALLOCATION.has(name) : !ALLOCATION_ONLY.has(name)))
    .map(([, t]) => t.definition);
}
/** The tools of an ordinary question. */
export const COPILOT_TOOLS: Anthropic.Beta.BetaTool[] = copilotToolsFor(null);

export interface ToolCallRecord {
  name: string;
  input: unknown;
  ok: boolean;
  summary: string;
  /** The evidence reference of a successful result. */
  evidenceId?: string;
  /** A refused call to a tool that would take authority the Copilot doesn't have. */
  forbidden?: boolean;
}

// What each numeric field of a tool result measures, by its key. Money in the
// reporting currency unless the field is in its own currency (stated in a
// sibling field); percentages; fractions; anything else (rates, counts, days,
// IDs) supports no money or percentage claim.
// Every percentage below is in percentage points, as its producer returns it:
// pct (summarizeAllocation, ×100), pct_of_investible* (this file's pct helper),
// current/proposed_pct and drift_pts (evaluateDesk rows), target_pct (draft
// targets, 0-100), expense_ratio_pct (the holding's ratio in percent), and
// pct_change (recommendationPreview's pctChange: 60,000 → 54,000 is -10).
// #119: ai_proposed_pct (the AI's own weight, returned as checked), result_pct and gap_pts (evaluator rows, 0-100).
const PERCENT_KEYS = new Set(["pct", "pct_of_investible", "pct_of_investible_before", "pct_of_investible_after", "current_pct", "proposed_pct", "target_pct", "drift_pts", "expense_ratio_pct", "pct_change", "claude_proposed_pct", "result_pct", "gap_pts"]);
/**
 * #119 (review finding 3): the model's own proposal as a tool echoes it back: its weights, the gaps measured
 * against them, and reasons that restate its requested amounts. Kept as the model's proposal (source
 * "ai_proposal"), never as engine evidence for itself.
 */
const AI_PROPOSAL_KEYS = new Set(["claude_proposed_pct", "gap_pts", "gap_amount", "not_feasible_reason", "combined_problems"]);
const AI_MARK = "__ai_proposal__";
/** Fractions (0.1 = 10%). No tool returns one today; the checker still reads a fraction as its percentage. */
const RATIO_KEYS = new Set<string>();
/** Signed changes, not levels or sizes: the only fields that support a written "+" or "-". */
const CHANGE_KEYS = new Set(["delta", "change", "drift_pts", "pct_change", "gap_pts", "gap_amount"]);
const MONEY_REPORTING_KEYS = new Set([
  "value", "current", "proposed", "before", "after", "delta", "change", "shortfall", "gross_assets", "liabilities", "net",
  "outside_scope_total", "liabilities_total", "reporting_value", "action_amount_in_reporting", "proposed_value_in_reporting", "amount", "position_after",
  "scope_total", "current_amount", "result_amount", "gap_amount",
]);
/** Money in its own currency, named by this sibling field. */
const MONEY_OWN_KEYS: Record<string, string> = { native_value: "currency", action_amount: "currency", proposed_value: "currency", cost_basis: "currency", reserve: "reserve_currency", available: "currency" };

function classify(value: number, key: string | undefined, parent: Record<string, unknown> | undefined, reporting: string): EvidenceValue {
  const typed = classifyUnit(value, key, parent, reporting);
  return key && CHANGE_KEYS.has(key) ? { ...typed, change: true } : typed;
}

function classifyUnit(value: number, key: string | undefined, parent: Record<string, unknown> | undefined, reporting: string): EvidenceValue {
  if (key && RATIO_KEYS.has(key)) return { value, unit: "ratio" };
  if (key && PERCENT_KEYS.has(key)) return { value, unit: "percent" };
  if (key === "action_amount" && parent?.action_amount_unit === "percent") return { value, unit: "percent" };
  if (key && key in MONEY_OWN_KEYS) {
    const currency = parent?.[MONEY_OWN_KEYS[key]];
    return typeof currency === "string" ? { value, unit: "money", currency } : { value, unit: "other" };
  }
  if (key && MONEY_REPORTING_KEYS.has(key)) return { value, unit: "money", currency: reporting };
  return { value, unit: "other" };
}

/**
 * The typed figures in a tool result: each numeric field by what its key
 * measures (signs kept), and the figures in engine-written text once
 * untrusted workspace text is removed (`clean`).
 */
export function evidenceIn(value: unknown, clean: (s: string) => string, reporting: string, key?: string, parent?: Record<string, unknown>, out: EvidenceValue[] = []): EvidenceValue[] {
  // #109, PR #110 review: the client brief is the advisor's record of what the client said, never engine evidence,
  // and its text is never scanned for figures (constraints, clarifications, notes and labels included). Its
  // client-stated amounts come from the structured answers instead (CopilotContext.record, clientStatedAmounts).
  if (key === "client_brief") return out;
  // #119: the model's own proposal, echoed back, is kept apart from engine results (never evidence for itself).
  if (key && AI_PROPOSAL_KEYS.has(key) && !(parent && AI_MARK in parent)) {
    const inner: EvidenceValue[] = [];
    evidenceIn(value, clean, reporting, key, { ...(parent ?? {}), [AI_MARK]: true }, inner);
    for (const e of inner) out.push({ ...e, source: "ai_proposal" });
    return out;
  }
  if (typeof value === "number" && Number.isFinite(value)) out.push(classify(value, key, parent, reporting));
  else if (typeof value === "string") out.push(...figuresIn(clean(value)));
  else if (Array.isArray(value)) for (const v of value) evidenceIn(v, clean, reporting, key, parent, out);
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) evidenceIn(v, clean, reporting, k, value as Record<string, unknown>, out);
  return out;
}


/** Whether a tool result hands the client brief to the model (at any depth). */
const holdsBrief = (v: unknown): boolean => (Array.isArray(v) ? v.some(holdsBrief) : !!v && typeof v === "object" && ("client_brief" in v || Object.values(v).some(holdsBrief)));

const AUTHORITY_REFUSAL =
  "Refused: Stratovell AI has no authority to approve, finalize, include in the PDF, share, issue or execute anything. It can investigate, simulate and save unapproved drafts; the advisor decides in Stratovell.";

// Runs one tool call and returns the JSON string handed back to the model.
// Errors become is_error tool results instead of exceptions so the model can
// correct itself (wrong id, bad enum) without aborting the run. A successful
// result is kept as evidence.
export function executeTool(ctx: CopilotContext, name: string, input: unknown): { content: string; isError: boolean; evidenceId?: string; forbidden?: boolean } {
  const spec = Object.prototype.hasOwnProperty.call(TOOLS, name) ? TOOLS[name] : undefined;
  if (!spec) {
    if (FORBIDDEN_TOOL.test(name)) {
      ctx.forbiddenAttempts += 1;
      return { content: AUTHORITY_REFUSAL, isError: true, forbidden: true };
    }
    return { content: `Unknown tool: ${name}`, isError: true };
  }
  if (ALLOCATION_ONLY.has(name) && ctx.task !== "allocation_proposal") return { content: `${name} is available only in Prepare allocation proposal.`, isError: true };
  if (NOT_IN_ALLOCATION.has(name) && ctx.task === "allocation_proposal")
    return { content: `${name} isn't available in Prepare allocation proposal: return the decision with propose_allocation (its records are the only ones the advisor can add).`, isError: true };
  try {
    const result = spec.run(ctx, input ?? {});
    const content = JSON.stringify(result);
    const evidenceId = ctx.record(name, result, `${content.length.toLocaleString()} chars of engine output`);
    ctx.markDelivered(name);
    return { content, isError: false, evidenceId };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { content: `Invalid input: ${err.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`, isError: true };
    }
    if (err instanceof ToolInputError) return { content: err.message, isError: true };
    // Anything else (a workspace record the engines can't read) is reported,
    // without its message or stack, and the run carries on truthfully.
    return { content: `The ${name} tool failed unexpectedly: Stratovell couldn't read part of the workspace for it. Nothing was changed; tell the advisor rather than estimating.`, isError: true };
  }
}
