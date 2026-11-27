import type { Account, AllocationStrategy, AssetClass, ClassWeight, ClientProfile, CurrencyCode, DiscoveryQuestionId, Recommendation, WorkingDraft } from "@/domain/types";
import { ASSET_CLASS_LABELS } from "@/domain/assetTaxonomy";
import type { NormalizedHolding } from "./normalizationEngine";
import type { FxContext } from "./proposalEngine";
import { reportingValue } from "./valuationTotals";
import { candidateProblems, evaluateDesk, positionEditRecommendation, type DeskResult } from "./allocationDesk";
import { conflictsOf, missingDetailsOf, QUESTIONS, questionLabel, questionStatus } from "./clientDiscovery";

// #119 — Prepare allocation proposal. Stratovell AI returns one structured
// decision for the active alternative's investment scope: propose a mix,
// maintain the current mix (a justified hold), or ask a specific question.
// This module only reads. It checks the decision (brief readiness, weights,
// each leg's eligibility) and builds implementation legs as ordinary position
// edits on holdings already owned; every figure comes from the shared desk
// evaluator (evaluateDesk / candidateProblems), so the Copilot tool, the
// page's live selection and the PDF agree. The AI's weights are its judgment:
// never written to the advisor's desk targets, never presented as achieved.

export type AllocationOutcome = "propose" | "maintain" | "ask";

/** What the workspace offers the decision: the active alternative, its holdings (normalized at current rates) and the client. */
export interface ProposalInputs {
  holdings: NormalizedHolding[];
  accounts: Account[];
  recommendations: Recommendation[];
  draft: WorkingDraft;
  fx: FxContext;
  client: ClientProfile;
}

/** A decision's implementation group, as the AI returned it: legs on holdings already owned, in one account. */
export interface GroupInput {
  title: string;
  rationale: string;
  legs: { holdingId: string; change: "reduce" | "increase"; amount: number }[];
}

export interface DecisionInput {
  outcome: AllocationOutcome;
  headline: string;
  rationale: string;
  objectiveRefs: DiscoveryQuestionId[];
  proposedWeights?: ClassWeight[];
  alternative?: { summary: string; weights?: ClassWeight[] };
  question?: { text: string; decides: string };
  groups?: GroupInput[];
}

export const MAX_GROUPS = 4;
const label = (c: AssetClass) => ASSET_CLASS_LABELS[c] ?? c;
const round1 = (n: number) => Math.round(n * 10) / 10;
const cents = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// Brief readiness
// ---------------------------------------------------------------------------

/**
 * Whether the client brief supports a personalized mix (or a justified hold):
 * every question answered and reviewed by the advisor, with no unresolved
 * conflict or missing detail. Otherwise the decision must be a question.
 */
export function briefReadiness(c: ClientProfile): { ready: boolean; issues: string[] } {
  const issues: string[] = [];
  for (const { id } of QUESTIONS) {
    const s = questionStatus(c, id);
    if (s === "not_discussed") issues.push(`${questionLabel(id)}: not discussed.`);
    else if (s === "recorded") issues.push(`${questionLabel(id)}: recorded but not reviewed by the advisor.`);
    else if (s === "review_stale") issues.push(`${questionLabel(id)}: changed since the advisor's review.`);
  }
  for (const x of conflictsOf(c)) issues.push(`Possible conflict: ${x}`);
  for (const x of missingDetailsOf(c)) issues.push(`Missing detail: ${x}`);
  return { ready: issues.length === 0, issues };
}

// ---------------------------------------------------------------------------
// The scope's recorded mix
// ---------------------------------------------------------------------------

/** The active alternative through the shared evaluator (its draft view), optionally with extra actions added last. */
export function deskWith(inp: ProposalInputs, extra: Recommendation[] = []): DeskResult {
  const ids = new Set(extra.map((r) => r.id));
  return evaluateDesk({
    holdings: inp.holdings,
    accounts: inp.accounts,
    recommendations: [...inp.recommendations.filter((r) => !ids.has(r.id)), ...extra],
    draft: { ...inp.draft, memberIds: [...inp.draft.memberIds.filter((x) => !ids.has(x)), ...ids] },
    fx: inp.fx,
    view: "draft",
  });
}

/** Weights of the recorded holdings in scope (the evaluator's current column), largest first. */
export function recordedWeights(desk: DeskResult): ClassWeight[] {
  return desk.rows.filter((r) => r.current > 0.005 && r.currentPct != null).map((r) => ({ assetClass: r.assetClass, pct: round1(r.currentPct!) }));
}

/** In-scope holdings the decision can't value or classify: listed, never normalized away. */
export function scopeExceptions(inp: ProposalInputs, desk: DeskResult) {
  const inScope = new Set(desk.scope.accountIds);
  return {
    unvalued: desk.unvalued,
    unclassified: inp.holdings.filter((h) => inScope.has(h.accountId) && !h.isLiability && h.assetClass === "custom").map((h) => ({ id: h.id, name: h.assetName })),
  };
}

// ---------------------------------------------------------------------------
// Weights
// ---------------------------------------------------------------------------

/**
 * Why a set of proposed weights can't be used, or an empty list. They must be
 * percentages of the same in-scope portfolio: one per class, 0–100, totalling
 * 100 (cash included), and every class held in scope must be listed, even at
 * 0, so nothing (an unclassified holding included) is silently dropped.
 */
export function weightProblems(weights: ClassWeight[], held: AssetClass[]): string[] {
  const out: string[] = [];
  const seen = new Set<AssetClass>();
  for (const w of weights) {
    if (!(w.assetClass in ASSET_CLASS_LABELS) || w.assetClass === "liability") out.push(`${w.assetClass} isn't an investment asset class.`);
    if (seen.has(w.assetClass)) out.push(`${label(w.assetClass)} is listed twice.`);
    seen.add(w.assetClass);
    if (!Number.isFinite(w.pct) || w.pct < 0 || w.pct > 100) out.push(`${label(w.assetClass)}: ${w.pct} isn't a percentage between 0 and 100.`);
  }
  const total = weights.reduce((a, w) => a + (Number.isFinite(w.pct) ? w.pct : 0), 0);
  if (Math.abs(total - 100) > 0.1) out.push(`The weights total ${round1(total)}%, not 100% (cash included).`);
  const missing = held.filter((c) => !seen.has(c));
  if (missing.length) out.push(`Every class held in scope needs a weight (0 to exit it): missing ${missing.map(label).join(", ")}.`);
  return out;
}

// ---------------------------------------------------------------------------
// Implementation groups
// ---------------------------------------------------------------------------

const norm = (s: string) => s.trim().toLowerCase();
const namedIn = (h: NormalizedHolding, list: string[]) => {
  const names = new Set(list.map(norm).filter(Boolean));
  return names.has(norm(h.assetName)) || (!!h.identifier?.value && names.has(norm(h.identifier.value)));
};

/** Why one leg can't be used, or null. Only holdings already owned, in scope, valued and eligible. */
export function legProblem(inp: ProposalInputs, desk: DeskResult, leg: GroupInput["legs"][number]): string | null {
  const h = inp.holdings.find((x) => x.id === leg.holdingId);
  if (!h) return `No holding ${leg.holdingId}: this version implements with holdings already owned; a new security isn't proposed.`;
  if (!desk.scope.accountIds.includes(h.accountId)) return `${h.assetName} is outside the selected investment scope.`;
  if (h.isLiability || h.assetClass === "liability") return `${h.assetName} is a liability.`;
  if (h.assetClass === "cash") return `${h.assetName} is cash: cash moves only as the other legs' offset.`;
  if (reportingValue(h) == null) return `${h.assetName} has no usable value in ${inp.fx.reportingCurrency}.`;
  if (!Number.isFinite(leg.amount) || leg.amount <= 0) return `The amount for ${h.assetName} must be positive.`;
  if (leg.change === "reduce" && namedIn(h, inp.client.discovery?.securitiesToRetain ?? [])) return `${h.assetName} is a security the client wants to retain.`;
  if (leg.change === "increase") {
    if (namedIn(h, inp.client.restrictedSecurities ?? [])) return `${h.assetName} is a restricted investment for this client, so it can't be bought.`;
    if (h.restrictions?.trim()) return `${h.assetName} has recorded restrictions ("${h.restrictions.trim()}"), so it isn't eligible to buy until the advisor resolves them.`;
  }
  return null;
}

/** A group's legs as recommendations: ordinary position edits; a group of two or more legs is one linked unit (applied whole or not at all). */
export function groupLegs(inp: ProposalInputs, group: GroupInput, ids: { group: string; leg: (i: number) => string }, now: string): Recommendation[] {
  const linked = group.legs.length > 1 ? { groupId: ids.group, legs: group.legs.length } : undefined;
  return group.legs.map((leg, i) => {
    const h = inp.holdings.find((x) => x.id === leg.holdingId)!;
    const rec = positionEditRecommendation({ holding: h, kind: leg.change, amount: cents(leg.amount), reportingCurrency: inp.fx.reportingCurrency, id: ids.leg(i), now });
    return { ...rec, rationale: group.rationale, ...(linked ? { linked } : {}) };
  });
}

export interface GroupCheck {
  /** Why it can't be implemented (leg eligibility, one account, or the evaluator), or null. */
  problem: string | null;
}

/** A group on its own in the active alternative: its legs' eligibility, one account, then the evaluator's gate. */
export function checkGroup(inp: ProposalInputs, desk: DeskResult, group: GroupInput, legs: Recommendation[] | null): GroupCheck {
  if (group.legs.length === 0) return { problem: "The group has no actions." };
  for (const leg of group.legs) {
    const p = legProblem(inp, desk, leg);
    if (p) return { problem: p };
  }
  const accounts = new Set(group.legs.map((l) => inp.holdings.find((h) => h.id === l.holdingId)!.accountId));
  if (accounts.size > 1) return { problem: "A group's actions must be in one account (its sale funds its purchase there)." };
  if (!legs) return { problem: "The group couldn't be built." };
  const problems = candidateProblems({ holdings: inp.holdings, accounts: inp.accounts, recommendations: inp.recommendations, draft: inp.draft, candidates: legs, fx: inp.fx });
  return { problem: problems.length ? problems.join(" ") : null };
}

// ---------------------------------------------------------------------------
// What a selection produces
// ---------------------------------------------------------------------------

export interface MixRow {
  assetClass: AssetClass;
  label: string;
  /** Recorded holdings in scope. */
  currentPct: number;
  currentAmount: number;
  /** The AI's proposed weight (judgment), or null when there is none. */
  proposedPct: number | null;
  /** Proposed minus recorded (the proposal's change), in percentage points and in money of the recorded scope; null without a proposal. */
  changePts: number | null;
  changeAmount: number | null;
  /** The evaluator's result for the active alternative with the selected actions. */
  resultPct: number;
  resultAmount: number;
  /** Proposed minus result, in percentage points of the result's scope; null without a proposal. */
  gapPts: number | null;
  gapAmount: number | null;
  /** The class needs more than it gets and no existing, eligible holding in scope could take it: a new security would be needed. */
  noEligibleCandidate: boolean;
}

export interface SelectionResult {
  rows: MixRow[];
  totals: { current: number; result: number };
  /** Why the selection can't all be applied together (spending the same cash twice, a shortfall, a reserve, a blocked unit). */
  problems: string[];
  /** Actions already in the alternative before the selection (their effect is in the result too). */
  existingActions: number;
}

/** Existing in-scope holdings of a class that could take a purchase (valued, not restricted, not cash or a liability). */
export function eligibleBuyers(inp: ProposalInputs, desk: DeskResult, c: AssetClass) {
  return inp.holdings.filter((h) => h.assetClass === c && legProblem(inp, desk, { holdingId: h.id, change: "increase", amount: 1 }) == null);
}

/** The mix the active alternative reaches with `legs` added, beside the recorded mix and the AI's proposal, with the gap per class. */
export function evaluateSelection(inp: ProposalInputs, legs: Recommendation[], proposed: ClassWeight[] | null): SelectionResult {
  const before = deskWith(inp);
  const after = deskWith(inp, legs);
  const problems = legs.length ? candidateProblems({ holdings: inp.holdings, accounts: inp.accounts, recommendations: inp.recommendations, draft: inp.draft, candidates: legs, fx: inp.fx }) : [];
  const proposedBy = new Map((proposed ?? []).map((w) => [w.assetClass, w.pct] as const));
  const classes = new Set<AssetClass>([...before.rows.map((r) => r.assetClass), ...after.rows.map((r) => r.assetClass), ...proposedBy.keys()]);
  const pct = (v: number, t: number) => (t > 0 ? (v / t) * 100 : 0);
  const rows: MixRow[] = [...classes].map((c) => {
    const b = before.rows.find((r) => r.assetClass === c);
    const a = after.rows.find((r) => r.assetClass === c);
    const currentAmount = b?.current ?? 0;
    const resultAmount = a?.proposed ?? 0;
    const resultPct = pct(resultAmount, after.totals.proposed);
    const p = proposed ? proposedBy.get(c) ?? 0 : null;
    const gapPts = p == null ? null : p - resultPct;
    const needsMore = gapPts != null && gapPts > 0.05 && c !== "cash";
    const currentPct = pct(currentAmount, before.totals.current);
    return {
      assetClass: c,
      label: label(c),
      currentPct: round1(currentPct),
      currentAmount: cents(currentAmount),
      proposedPct: p,
      changePts: p == null ? null : round1(p - currentPct),
      changeAmount: p == null ? null : cents(((p - currentPct) / 100) * before.totals.current),
      resultPct: round1(resultPct),
      resultAmount: cents(resultAmount),
      gapPts: gapPts == null ? null : round1(gapPts),
      gapAmount: gapPts == null ? null : cents((gapPts / 100) * after.totals.proposed),
      noEligibleCandidate: needsMore && eligibleBuyers(inp, before, c).length === 0,
    };
  });
  rows.sort((x, y) => y.currentAmount - x.currentAmount || (y.proposedPct ?? 0) - (x.proposedPct ?? 0) || x.label.localeCompare(y.label));
  return { rows, totals: { current: cents(before.totals.current), result: cents(after.totals.proposed) }, problems, existingActions: before.actions.length };
}

// ---------------------------------------------------------------------------
// The strategy record
// ---------------------------------------------------------------------------

/** The advisory record of the decision (no position change): a "rebalance" for a proposed mix, a "hold" for maintaining it. */
export function strategyRecommendation(input: {
  id: string;
  decision: DecisionInput & { outcome: "propose" | "maintain" };
  currentWeights: ClassWeight[];
  groupIds: string[];
  basis: AllocationStrategy["basis"];
  now: string;
}): Recommendation {
  const { decision: d } = input;
  const proposedWeights = d.outcome === "maintain" ? input.currentWeights : d.proposedWeights ?? [];
  return {
    id: input.id,
    title: d.headline,
    type: d.outcome === "maintain" ? "hold" : "rebalance",
    currency: input.basis.reportingCurrency,
    rationale: d.rationale,
    priority: "medium",
    status: "draft",
    includeInPdf: false,
    approvedByAdvisor: false,
    allocationStrategy: {
      outcome: d.outcome,
      proposedWeights,
      currentWeights: input.currentWeights,
      objectiveRefs: d.objectiveRefs,
      ...(d.alternative ? { alternative: d.alternative } : {}),
      groupIds: input.groupIds,
      basis: input.basis,
    },
    createdAt: input.now,
    updatedAt: input.now,
  };
}

/**
 * An approved strategy beside what the approved actions achieve: the weights
 * when proposed, the AI's proposed weights, the result (the evaluator's rows
 * for the version) and what is not implemented. Never a target shown as a result.
 */
export function strategyResultRows(strategy: AllocationStrategy, result: { assetClass: AssetClass; proposedPct: number | null }[]) {
  const classes = new Set<AssetClass>([...strategy.currentWeights.map((w) => w.assetClass), ...strategy.proposedWeights.map((w) => w.assetClass), ...result.filter((r) => (r.proposedPct ?? 0) > 0.005).map((r) => r.assetClass)]);
  return [...classes]
    .map((c) => {
      const proposed = strategy.proposedWeights.find((w) => w.assetClass === c)?.pct ?? 0;
      const achieved = result.find((r) => r.assetClass === c)?.proposedPct ?? 0;
      const gap = round1(proposed - achieved);
      return { assetClass: c, label: label(c), whenProposed: strategy.currentWeights.find((w) => w.assetClass === c)?.pct ?? 0, proposed, result: round1(achieved), notImplementedPts: Math.abs(gap) < 0.05 ? 0 : gap };
    })
    .sort((a, b) => b.whenProposed - a.whenProposed || b.proposed - a.proposed);
}

/** The reporting currency label for amounts. */
export const money = (n: number, ccy: CurrencyCode) => `${ccy} ${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
