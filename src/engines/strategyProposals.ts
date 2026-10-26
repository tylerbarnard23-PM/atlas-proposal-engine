import type { Account, AssetClass, CurrencyCode, ModelRevision, Recommendation, StrategyFee, StrategyRevision } from "@/domain/types";
import type { NormalizedHolding } from "./normalizationEngine";
import type { FxContext } from "./proposalEngine";
import { cashBasisCurrency, fundingProblem } from "./recommendationLinks";
import { resolveFxRate } from "./currencyEngine";

// D2a — model portfolios and manager/strategy sleeve proposals.
//
// A library of immutable revisions (strategies and models), a sleeve plan
// that turns a strategy model into target amounts on an account's basis, the
// explicit construction of funded purchases (one D2 linked unit, applied
// whole by the shared evaluator or left out with its reason), and read-only
// views over the proposed result: look-through exposure, sleeves, minimums
// and fee coverage. Nothing here creates trades, approvals or holdings by
// itself; targets stay targets.

const EPS = 0.005;
const TOTAL_EPS = 1e-6;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const money = (n: number, ccy: string) => `${ccy} ${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

// ---------------------------------------------------------------------------
// Library: immutable revisions
// ---------------------------------------------------------------------------

type Revisioned = { id: string; revision: number };

/** The revision `revision` of `id`, if it exists. */
export const findRevision = <T extends Revisioned>(list: T[], id: string, revision: number): T | undefined =>
  list.find((x) => x.id === id && x.revision === revision);

/** The latest revision of `id`, if any. */
export const latestRevision = <T extends Revisioned>(list: T[], id: string): T | undefined =>
  list.filter((x) => x.id === id).sort((a, b) => b.revision - a.revision)[0];

/** Each definition's latest revision, in first-seen order. */
export function latestRevisions<T extends Revisioned>(list: T[]): T[] {
  const ids = [...new Set(list.map((x) => x.id))];
  return ids.map((id) => latestRevision(list, id)!);
}

/** The revision number an edit of `id` gets (1 for a new definition). */
export const nextRevision = (list: Revisioned[], id: string) => (latestRevision(list, id)?.revision ?? 0) + 1;

/** Why a strategy revision can't be saved, or [] when it can. Unknowns (minimum, fees, mix) are allowed and stay unknown. */
export function strategyProblems(s: Omit<StrategyRevision, "createdAt">): string[] {
  const out: string[] = [];
  if (!s.manager?.trim()) out.push("Enter the manager.");
  if (!s.name?.trim()) out.push("Enter the strategy name.");
  if (!/^[A-Z]{3}$/.test(s.currency ?? "")) out.push("Enter a three-letter currency.");
  if (s.minimum !== null && !(finite(s.minimum) && s.minimum >= 0)) out.push("A minimum must be a non-negative amount, or left as not supplied.");
  for (const f of s.fees ?? []) if (!(finite(f.rateBps) && f.rateBps >= 0) || !f.basis?.trim()) out.push("Each fee needs a non-negative rate and a stated basis.");
  if (s.mix) {
    const entries = Object.entries(s.mix.weights) as [AssetClass, number][];
    if (entries.some(([c, w]) => c === "liability" || !(finite(w) && w >= 0))) out.push("A supplied mix needs non-negative weights by asset class.");
    else if (Math.abs(sum(entries.map(([, w]) => w)) - 100) > 0.01) out.push("A supplied mix must total 100%. Leave the mix unknown instead of entering a partial one.");
    if (!s.mix.source?.trim() || !s.mix.asOf?.trim()) out.push("A supplied mix needs its source and date.");
  }
  return out;
}

/** Why a model revision can't be saved, or [] when it can. A total above 100% is refused; below 100% the rest is unallocated. */
export function modelProblems(m: Omit<ModelRevision, "createdAt">, strategies: StrategyRevision[]): string[] {
  const out: string[] = [];
  if (!m.name?.trim()) out.push("Enter the model name.");
  let total = 0;
  if (m.kind === "asset_class") {
    const entries = Object.entries(m.assetWeights ?? {}) as [AssetClass, number][];
    if (entries.some(([c, w]) => c === "liability" || !(finite(w) && w >= 0 && w <= 100))) out.push("Asset-class weights must be between 0% and 100%.");
    total = sum(entries.map(([, w]) => (finite(w) ? w : 0)));
    if (m.strategyWeights?.length) out.push("An asset-class model has no strategy weights.");
  } else {
    const rows = m.strategyWeights ?? [];
    if (rows.some((r) => !(finite(r.weight) && r.weight >= 0 && r.weight <= 100))) out.push("Strategy weights must be between 0% and 100%.");
    const ids = rows.map((r) => r.strategyId);
    if (new Set(ids).size !== ids.length) out.push("A strategy is assigned more than once.");
    for (const r of rows) if (!findRevision(strategies, r.strategyId, r.strategyRevision)) out.push(`Strategy ${r.strategyId} revision ${r.strategyRevision} isn't in the library.`);
    const cash = m.cashWeight ?? 0;
    if (!(finite(cash) && cash >= 0 && cash <= 100)) out.push("The cash weight must be between 0% and 100%.");
    total = sum(rows.map((r) => (finite(r.weight) ? r.weight : 0))) + (finite(cash) ? cash : 0);
    if (!rows.some((r) => r.weight > 0)) out.push("A strategy model allocates to at least one strategy.");
    if (m.assetWeights && Object.keys(m.assetWeights).length) out.push("A strategy model has no asset-class weights.");
  }
  if (total > 100 + TOTAL_EPS) out.push(`Weights total ${total.toFixed(2)}%, above 100%.`);
  if (total <= 0) out.push("The model allocates nothing.");
  return out;
}

/** The weight a model leaves unallocated (never negative for a valid model). */
export function unallocatedWeight(m: ModelRevision): number {
  const total = m.kind === "asset_class" ? sum(Object.values(m.assetWeights ?? {}).map((w) => w ?? 0)) : sum((m.strategyWeights ?? []).map((r) => r.weight)) + (m.cashWeight ?? 0);
  return Math.max(0, 100 - total);
}

// ---------------------------------------------------------------------------
// Sleeve plan: targets on an account's basis (no trades)
// ---------------------------------------------------------------------------

/** An account's value to allocate, in its eligible cash's currency, or why it can't be stated. */
export type AccountBasis = { ok: true; value: number; currency: CurrencyCode } | { ok: false; reason: string };

export function accountBasis(input: { account: Account | undefined; holdings: NormalizedHolding[]; fx: FxContext }): AccountBasis {
  const { account, holdings, fx } = input;
  if (!account || account.isLiabilityAccount) return { ok: false, reason: "Choose a supported investment account." };
  if (!account.funding) return { ok: false, reason: `${account.name} has no eligible cash chosen. Choose its eligible cash under Funding first.` };
  if (fundingProblem(account, holdings)) return { ok: false, reason: `${account.name}'s eligible cash rule needs attention under Funding before a plan can be funded.` };
  const cash = holdings.find((h) => h.id === account.funding!.cashHoldingId)!;
  const currency = cashBasisCurrency(cash);
  const own = holdings.filter((h) => h.accountId === account.id && !h.isLiability);
  if (own.some((h) => h.reportingMarketValue == null)) return { ok: false, reason: `Some holdings in ${account.name} can't be valued, so its value to allocate is unknown.` };
  const reporting = sum(own.map((h) => h.reportingMarketValue as number));
  const rate = currency === fx.reportingCurrency ? 1 : resolveFxRate(fx.rates, currency, fx.reportingCurrency)?.rate ?? null;
  if (rate == null) return { ok: false, reason: `No ${currency}/${fx.reportingCurrency} exchange rate, so ${account.name}'s value can't be stated in ${currency}.` };
  const value = reporting / rate;
  if (!(value > EPS)) return { ok: false, reason: `${account.name} has nothing to allocate.` };
  return { ok: true, value, currency };
}

export interface SleevePlanRow {
  strategy: StrategyRevision;
  weight: number;
  /** Target amount in the basis currency. A target, not a funded value. */
  target: number;
}

export interface SleevePlan {
  model: ModelRevision;
  basis: AccountBasis;
  rows: SleevePlanRow[];
  cash: { weight: number; target: number };
  unallocated: { weight: number; target: number };
  /** Why the plan can't be funded as purchases (definitions, currency, basis); [] when it can be constructed. */
  problems: string[];
}

/** A strategy model's target amounts on an account's basis. Creates nothing. */
export function sleevePlan(input: { model: ModelRevision; strategies: StrategyRevision[]; basis: AccountBasis }): SleevePlan {
  const { model, strategies, basis } = input;
  const problems = model.kind === "strategy" ? modelProblems(model, strategies) : ["Only a strategy allocation model has sleeves."];
  const value = basis.ok ? basis.value : 0;
  const cents = (n: number) => Math.round(n * 100) / 100;
  const rows: SleevePlanRow[] = (model.strategyWeights ?? []).flatMap((r) => {
    const strategy = findRevision(strategies, r.strategyId, r.strategyRevision);
    return strategy ? [{ strategy, weight: r.weight, target: cents((value * r.weight) / 100) }] : [];
  });
  if (!basis.ok) problems.push(basis.reason);
  else for (const r of rows) if (r.weight > 0 && r.strategy.currency !== basis.currency) problems.push(`${label(r.strategy)} is in ${r.strategy.currency}, but the eligible cash is in ${basis.currency}; currency conversion inside the account isn't supported.`);
  const cashWeight = model.cashWeight ?? 0;
  const unallocated = unallocatedWeight(model);
  return { model, basis, rows, cash: { weight: cashWeight, target: cents((value * cashWeight) / 100) }, unallocated: { weight: unallocated, target: cents((value * unallocated) / 100) }, problems };
}

export const label = (s: Pick<StrategyRevision, "manager" | "name" | "revision">) => `${s.manager} — ${s.name} (rev ${s.revision})`;

/** The proposed-only destination a sleeve of `strategy` in `accountId` uses: stable per account and strategy revision. */
export const sleeveDestinationId = (accountId: string, s: Pick<StrategyRevision, "id" | "revision">) => `sleeve_${accountId}_${s.id}_r${s.revision}`;

/**
 * The funded purchases a plan proposes: one buy per sleeve with a target,
 * from the account's eligible cash, as one linked unit applied whole or not
 * at all. Cash and unallocated weights stay as cash. Unapproved, outside the
 * PDF prose. Throws when the plan has problems (nothing is half-built).
 */
export function sleevePurchases(input: { plan: SleevePlan; accountId: string; ids: { group: string; rec: (strategyId: string) => string }; now: string }): Recommendation[] {
  const { plan, accountId, ids, now } = input;
  if (plan.problems.length > 0 || !plan.basis.ok) throw new Error(plan.problems[0] ?? "The plan can't be funded.");
  const currency = plan.basis.currency;
  const rows = plan.rows.filter((r) => r.target > EPS);
  if (rows.length === 0) throw new Error("No sleeve has a target to fund.");
  const linked = { groupId: ids.group, legs: rows.length };
  return rows.map((r) => {
    const s = r.strategy;
    return {
      id: ids.rec(s.id),
      title: `Fund sleeve: buy ${money(r.target, currency)} of ${label(s)}`,
      type: "buy",
      currency,
      rationale: "",
      priority: "medium",
      status: "draft",
      includeInPdf: false,
      approvedByAdvisor: false,
      relatedAccountId: accountId,
      actionAmount: r.target,
      actionAmountUnit: "amount",
      linked,
      destination: {
        id: sleeveDestinationId(accountId, s),
        name: `${s.manager} — ${s.name}`,
        // A sleeve is a balance-only grouping: a manager name is never an asset class.
        assetClass: "custom",
        accountId,
        currency,
        strategy: { id: s.id, revision: s.revision, manager: s.manager, name: s.name, minimum: s.minimum },
      },
      createdAt: now,
      updatedAt: now,
    } satisfies Recommendation;
  });
}

// ---------------------------------------------------------------------------
// Views over the proposed result (never another ledger)
// ---------------------------------------------------------------------------

type Position = { id: string; assetClass: AssetClass; proposed: number | null; accountId: string };

/** Sleeve destinations among the actions, by destination ID, with the strategy revision each is pinned to. */
export function sleeveRefs(recommendations: Recommendation[]) {
  const out = new Map<string, NonNullable<NonNullable<Recommendation["destination"]>["strategy"]>>();
  for (const r of recommendations) if (r.destination?.strategy && !r.relatedHoldingId) out.set(r.destination.id, r.destination.strategy);
  return out;
}

export interface ExposureView {
  total: number;
  /** Known exposure by asset class: direct holdings plus supplied sleeve mixes. */
  rows: { assetClass: AssetClass; value: number; pct: number }[];
  /** Sleeve value with no supplied mix: unknown, never renormalized into the known rows. */
  unknown: { value: number; pct: number; sleeves: number };
  /** The same value by manager/strategy sleeve. */
  sleeves: { destinationId: string; manager: string; name: string; revision: number; value: number; pct: number; mixKnown: boolean }[];
}

/**
 * Look-through exposure over the same proposed value: a sleeve's value is
 * split by its revision's supplied mix, or counted as unknown. Underlying
 * investments are never added on top of the sleeve, so totals reconcile.
 */
export function exposureView(input: { positions: Position[]; recommendations: Recommendation[]; strategies: StrategyRevision[] }): ExposureView {
  const refs = sleeveRefs(input.recommendations);
  const byClass = new Map<AssetClass, number>();
  const add = (c: AssetClass, v: number) => byClass.set(c, (byClass.get(c) ?? 0) + v);
  const sleeves: ExposureView["sleeves"] = [];
  let unknown = 0;
  let unknownCount = 0;
  const live = input.positions.filter((p) => p.proposed != null && Math.abs(p.proposed) > EPS && p.assetClass !== "liability");
  const total = sum(live.map((p) => p.proposed as number));
  for (const p of live) {
    const v = p.proposed as number;
    const ref = refs.get(p.id);
    if (!ref) {
      add(p.assetClass, v);
      continue;
    }
    const mix = findRevision(input.strategies, ref.id, ref.revision)?.mix ?? null;
    sleeves.push({ destinationId: p.id, manager: ref.manager, name: ref.name, revision: ref.revision, value: v, pct: total ? (v / total) * 100 : 0, mixKnown: !!mix });
    if (!mix) {
      unknown += v;
      unknownCount += 1;
      continue;
    }
    for (const [c, w] of Object.entries(mix.weights) as [AssetClass, number][]) add(c, (v * w) / 100);
  }
  const pct = (v: number) => (total ? (v / total) * 100 : 0);
  return {
    total,
    rows: [...byClass].filter(([, v]) => Math.abs(v) > EPS).map(([assetClass, value]) => ({ assetClass, value, pct: pct(value) })),
    unknown: { value: unknown, pct: pct(unknown), sleeves: unknownCount },
    sleeves,
  };
}

export type MinimumStatus =
  | { kind: "met"; minimum: number }
  | { kind: "below"; minimum: number }
  | { kind: "not_supplied"; reviewed: boolean };

/** A sleeve's minimum against its proposed commitment. Not supplied is never "met". */
export function minimumStatus(minimum: number | null, committed: number, reviewed: boolean): MinimumStatus {
  if (minimum == null) return { kind: "not_supplied", reviewed };
  return committed + EPS >= minimum ? { kind: "met", minimum } : { kind: "below", minimum };
}

/** What a strategy's supplied fees cover, as text. Components are listed; nothing is summed or compared. */
export function feeCoverage(fees: StrategyFee[]): string {
  if (fees.length === 0) return "Fees not supplied";
  const kinds = new Set(fees.map((f) => f.kind));
  const parts = fees.map((f) => `${f.kind.replace("_", "-")} ${(f.rateBps / 100).toFixed(2)}% of ${f.basis}`);
  const note = kinds.has("all_in") && kinds.size > 1 ? " (an all-in rate is listed with components; they are not added together)" : "";
  return `${parts.join("; ")}${note}`;
}

/** Approved sleeve purchases whose minimum wasn't supplied and that have no recorded advisor review (readiness). */
export function unreviewedSleeveTerms(approved: Recommendation[]) {
  return approved
    .filter((r) => r.destination?.strategy && !r.relatedHoldingId && r.destination.strategy.minimum == null && !r.destination.strategy.review)
    .map((r) => ({ recommendationId: r.id, title: r.title, manager: r.destination!.strategy!.manager, name: r.destination!.strategy!.name }));
}
