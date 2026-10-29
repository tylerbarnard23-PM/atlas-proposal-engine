import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { Recommendation, RecommendationType, WorkingDraft } from "@/domain/types";
import { normalizeHoldings, type NormalizedHolding } from "@/engines/normalizationEngine";
import { generateInsights, summarizeAllocation } from "@/engines/insightEngine";
import { applyRecToValue } from "@/engines/proposalEngine";
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
import { figuresIn } from "./evidence";
import type { CopilotSnapshot } from "./snapshot";

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
  numbers: number[];
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
    this.evidence.push({ id, tool, summary, numbers: numbersIn(result, (s) => this.withoutUntrusted(s)) });
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
        ...s.recommendations.flatMap((r) => [r.title, r.rationale, r.clientBenefit, r.riskTradeoff, r.taxNote, r.implementationStep, r.complianceNote, r.destination?.name]),
        s.client.fullName,
        s.client.householdName,
        s.client.investmentObjective,
        s.client.specialInstructions,
        ...(s.client.restrictedSecurities ?? []),
      ];
      this.untrustedCache = [...new Set(texts.filter((t): t is string => typeof t === "string" && t.trim().length > 0))].sort((a, b) => b.length - a.length);
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
    const s = this.snapshot;
    const pairs: [string | undefined, string][] = [
      [s.client.householdName, "[client household]"],
      [s.client.fullName, "[client]"],
      [s.advisor.email, "[advisor email]"],
      [s.advisor.name, "[advisor]"],
      ...(s.sourceDocuments ?? []).map((d, i) => [d.fileName, `[import ${i + 1}]`] as [string, string]),
    ];
    let out = text;
    for (const [raw, label] of pairs.filter(([r]) => typeof r === "string" && r.trim().length >= 3).sort((a, b) => b[0]!.length - a[0]!.length)) {
      const needle = json ? JSON.stringify(raw).slice(1, -1) : raw!;
      out = out.split(needle).join(label);
    }
    return out;
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
    // The profile the advice depends on; the client's name and identity stay out of model-bound data (#59).
    client: {
      risk_tolerance: client.riskTolerance,
      objective: client.investmentObjective,
      time_horizon_years: client.timeHorizonYears,
      liquidity_needs: client.liquidityNeeds,
      income_needs: client.incomeNeeds,
      tax_sensitivity: client.taxSensitivity,
      country_of_residence: client.countryOfResidence,
      restricted_securities: client.restrictedSecurities ?? [],
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
    })),
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

function simulate(ctx: CopilotContext, input: z.infer<typeof SimulateInput>) {
  const h = ctx.holding(input.holding_id);
  if (!h) throw new ToolInputError(`No holding with id ${input.holding_id}`);
  // The same isolated engine simulation as the editor's live preview: actual
  // cash offsets, household funding, missing rates and shortfalls. Tool
  // amounts are in the reporting currency. Nothing is saved.
  const preview = previewRecommendation({
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
    reserves: d.reserves.map((r) => ({ account: r.accountName, reserve: r.reserve, reserve_currency: r.reserveCurrency, available: r.available == null ? null : cents(r.available), breached: r.breached })),
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
    reserve_breaches: reserveBreaches.map((r) => ({ account: r.accountName, reserve: r.reserve, available: r.available == null ? null : cents(r.available) })),
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
    const h = ctx.holding(input.holding_id)!;
    const before = reportingValue(h);
    const rec = toolAmounts(ctx, input);
    const changes = before == null || input.proposed_value != null || Math.abs(applyRecToValue(before, rec, !!h.isLiability) - before) >= 1;
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
    complianceNote: `Drafted by Proposal Copilot for "${ctx.draft.name}" (input revision ${ctx.context.inputRevision}). Requires advisor review and approval before client use.`,
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
        "Client profile, net worth, allocation by asset class and currency, the ten largest positions and the recommendations already on file, all valued by the Atlas valuation and FX engines in the proposal's reporting currency. Call this first.",
      input_schema: { type: "object", properties: {} },
    },
    run: (ctx) => getPortfolioOverview(ctx),
  },
  list_insights: {
    definition: {
      name: "list_insights",
      description:
        "Rules-based findings from the Atlas insight engine: concentration, currency and country exposure, liquidity, cash drag, high fees, manual valuations and data-quality problems.",
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
      description: "Run the Atlas compliance readiness checklist that gates PDF generation and report which checks fail.",
      input_schema: { type: "object", properties: {} },
    },
    run: (ctx) => checkReadiness(ctx),
  },
  get_scope_overview: {
    definition: {
      name: "get_scope_overview",
      description:
        "The active alternative through the Atlas allocation desk: its investment scope, current and proposed totals and asset-class weights (scope only), target drift, in-scope positions, household context outside the scope, the alternative's actions, blocked actions, shortfalls and reserves, and the input revision. Use it before simulating a change.",
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
};

export const COPILOT_TOOLS: Anthropic.Beta.BetaTool[] = Object.values(TOOLS).map((t) => t.definition);

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

/**
 * Every finite number in a tool result, and every figure in its engine-written
 * text once untrusted workspace text is removed (`clean`), for checking the
 * figures an answer states.
 */
export function numbersIn(value: unknown, clean: (s: string) => string, out: number[] = []): number[] {
  if (typeof value === "number" && Number.isFinite(value)) out.push(value);
  else if (typeof value === "string") out.push(...figuresIn(clean(value)));
  else if (Array.isArray(value)) for (const v of value) numbersIn(v, clean, out);
  else if (value && typeof value === "object") for (const v of Object.values(value)) numbersIn(v, clean, out);
  return out;
}

const AUTHORITY_REFUSAL =
  "Refused: Proposal Copilot has no authority to approve, finalize, include in the PDF, share, issue or execute anything. It can investigate, simulate and save unapproved drafts; the advisor decides in Atlas.";

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
  try {
    const result = spec.run(ctx, input ?? {});
    const content = JSON.stringify(result);
    const evidenceId = ctx.record(name, result, `${content.length.toLocaleString()} chars of engine output`);
    return { content, isError: false, evidenceId };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { content: `Invalid input: ${err.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`, isError: true };
    }
    if (err instanceof ToolInputError) return { content: err.message, isError: true };
    // Anything else (a workspace record the engines can't read) is reported,
    // without its message or stack, and the run carries on truthfully.
    return { content: `The ${name} tool failed unexpectedly: Atlas couldn't read part of the workspace for it. Nothing was changed; tell the advisor rather than estimating.`, isError: true };
  }
}
