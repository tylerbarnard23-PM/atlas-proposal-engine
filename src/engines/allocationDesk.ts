import type { Account, AssetClass, CurrencyCode, DraftInputBasis, DraftInputRate, FxRate, Holding, Recommendation, WorkingDraft } from "@/domain/types";
import { ASSET_CLASS_LABELS } from "@/domain/assetTaxonomy";
import { normalizeHoldings, type NormalizedHolding } from "./normalizationEngine";
import { applyRecommendationsToProposed, cashShortfallsOf, type CashShortfall, type FxContext, type UnresolvedConversion } from "./proposalEngine";
import { valueProvenance } from "./valuationProvenance";
import { fxRatesInUse } from "./fxPolicy";

// D1 — the working allocation desk (R02 scope, R03 grid, R05/R07 working
// draft, R19a input basis). Everything here reads; nothing changes holdings,
// approvals or the final-PDF inputs. Proposed values come from the shared
// proposal engine (applyRecommendationsToProposed) with the chosen actions
// in their saved order; this module only groups and divides its output.

export type DeskView = "draft" | "approved";

const ID = "draft_working";

/** A new, empty working draft. */
export function newWorkingDraft(now: string, memberIds: string[] = []): WorkingDraft {
  return { id: ID, name: "Working draft", scopeAccountIds: null, memberIds, targets: {}, inputBasis: null, createdAt: now, updatedAt: now };
}

/**
 * The draft an existing workspace starts with (store v7 and v6 backups): its
 * approved recommendations, in saved order, so previewing the draft gives the
 * same proposed portfolio as before. Rejected ones are never members.
 */
export function legacyWorkingDraft(recommendations: Recommendation[], now: string): WorkingDraft {
  return newWorkingDraft(now, recommendations.filter((r) => r.approvedByAdvisor && r.status !== "excluded").map((r) => r.id));
}

// ---------------------------------------------------------------------------
// Explicit intent (R07 minimum)
// ---------------------------------------------------------------------------

/**
 * How the engine sizes a linked action saved without an amount: the legacy
 * implicit interpretation (applyRecToValue), or null when the size is explicit.
 * The effect is kept as evidence; a new approval needs an explicit restatement.
 */
export function implicitIntent(r: Pick<Recommendation, "type" | "relatedHoldingId" | "actionAmount" | "proposedValue">): string | null {
  if (!r.relatedHoldingId || r.actionAmount != null || r.proposedValue != null) return null;
  switch (r.type) {
    case "sell":
    case "raise_cash":
      return "a full exit of the position";
    case "reduce":
    case "reduce_concentration":
      return "a reduction of half the position";
    case "pay_down_debt":
      return "paying down half the balance";
    default:
      return null;
  }
}

export const needsIntentRestatement = (r: Recommendation) => implicitIntent(r) != null;

export function restatementMessage(r: Recommendation): string | null {
  const intent = implicitIntent(r);
  return intent
    ? `Saved without an amount, so it has been calculated as ${intent}. Enter an explicit amount (100% for a full exit) before approving it.`
    : null;
}

// ---------------------------------------------------------------------------
// Scope, actions and the evaluation
// ---------------------------------------------------------------------------

/** Accounts that can be in the allocation scope: every non-liability account. */
export const scopeCandidates = (accounts: Account[]) => accounts.filter((a) => !a.isLiabilityAccount);

/** The scope's account IDs: the advisor's choice (existing accounts only), else every candidate. */
export function scopeAccountIds(accounts: Account[], draft: WorkingDraft): string[] {
  const candidates = scopeCandidates(accounts).map((a) => a.id);
  if (draft.scopeAccountIds == null) return candidates;
  const chosen = new Set(draft.scopeAccountIds);
  return candidates.filter((id) => chosen.has(id));
}

/**
 * The actions a view applies, in the recommendations' saved order: the
 * draft's members (approved or not; a rejected one never applies), or
 * exactly the set the final PDF and readiness apply (every approved one).
 */
export function deskActions(recommendations: Recommendation[], draft: WorkingDraft, view: DeskView): Recommendation[] {
  if (view === "approved") return recommendations.filter((r) => r.approvedByAdvisor);
  const members = new Set(draft.memberIds);
  return recommendations.filter((r) => r.status !== "excluded" && members.has(r.id));
}

export interface DeskRow {
  assetClass: AssetClass;
  label: string;
  current: number;
  proposed: number;
  currentPct: number | null;
  proposedPct: number | null;
  targetPct: number | null;
  /** Target weight × the proposed scope total. */
  targetAmount: number | null;
  /** Proposed minus target: positive means above target. */
  drift: number | null;
  driftPts: number | null;
}

export interface DeskPosition {
  id: string;
  name: string;
  accountId: string;
  accountName: string;
  assetClass: AssetClass;
  current: number | null;
  proposed: number | null;
  synthetic: boolean;
}

export interface DeskResult {
  view: DeskView;
  reportingCurrency: CurrencyCode;
  scope: { chosen: boolean; accountIds: string[]; accounts: { id: string; name: string; current: number; proposed: number }[] };
  /** Non-liability accounts outside the scope: shown as context, never in the weights. */
  context: { accounts: { id: string; name: string; value: number }[]; total: number };
  /** Liabilities anywhere in the household, kept out of every allocation denominator. */
  liabilities: { lines: { id: string; name: string; accountName: string; value: number | null }[]; total: number };
  /** Valued household assets (scope + context), before any action. */
  householdAssets: number;
  totals: { current: number; proposed: number };
  rows: DeskRow[];
  /** Actual cash per scope account, current and proposed. */
  cash: { accountId: string; accountName: string; current: number; proposed: number }[];
  shortfalls: CashShortfall[];
  unresolved: UnresolvedConversion[];
  /** In-scope holdings with no usable value in the reporting currency: left out of the weights, still blocking as before. */
  unvalued: { id: string; name: string }[];
  /** Context assets and liabilities with no usable value: left out of the context, household and liability totals. */
  unvaluedOutside: { id: string; name: string; accountName: string; liability: boolean }[];
  positions: DeskPosition[];
  actions: Recommendation[];
  /** Approved recommendations outside the draft: the final PDF still uses them. */
  approvedOutsideDraft: Recommendation[];
  /** Draft members not yet approved: previewed here, not in the final PDF. */
  unapprovedInDraft: Recommendation[];
  targetSum: number;
}

type MaybeValued = Holding & { valuation?: NormalizedHolding["valuation"] };
const valueOf = (h: MaybeValued): number | null =>
  h.valuation ? (h.valuation.status === "valued" ? h.reportingMarketValue ?? null : null) : h.reportingMarketValue ?? null;
const isLiabilityLine = (h: Holding) => !!h.isLiability || h.assetClass === "liability";
const pct = (part: number, total: number) => (total > 0 ? (part / total) * 100 : null);

export function evaluateDesk(input: {
  /** Current holdings, normalized against the current rates. */
  holdings: NormalizedHolding[];
  accounts: Account[];
  recommendations: Recommendation[];
  draft: WorkingDraft;
  fx: FxContext;
  view: DeskView;
}): DeskResult {
  const { holdings, accounts, recommendations, draft, fx, view } = input;
  const names = new Map(accounts.map((a) => [a.id, a.name] as const));
  const accountName = (id: string) => names.get(id) ?? id;
  const inScope = new Set(scopeAccountIds(accounts, draft));
  const actions = deskActions(recommendations, draft, view);
  const proposed = applyRecommendationsToProposed(holdings, actions, accounts, fx);
  const proposedById = new Map(proposed.holdings.map((h) => [h.id, h as MaybeValued] as const));

  const rowsByClass = new Map<AssetClass, { current: number; proposed: number }>();
  const row = (c: AssetClass) => rowsByClass.get(c) ?? (rowsByClass.set(c, { current: 0, proposed: 0 }), rowsByClass.get(c)!);
  const scopeByAccount = new Map<string, { current: number; proposed: number }>();
  const acct = (id: string) => scopeByAccount.get(id) ?? (scopeByAccount.set(id, { current: 0, proposed: 0 }), scopeByAccount.get(id)!);
  const cashByAccount = new Map<string, { current: number; proposed: number }>();
  const cash = (id: string) => cashByAccount.get(id) ?? (cashByAccount.set(id, { current: 0, proposed: 0 }), cashByAccount.get(id)!);
  const contextByAccount = new Map<string, number>();
  const liabilities: DeskResult["liabilities"]["lines"] = [];
  const unvalued: DeskResult["unvalued"] = [];
  const unvaluedOutside: DeskResult["unvaluedOutside"] = [];
  const positions: DeskPosition[] = [];
  let householdAssets = 0;

  for (const id of inScope) acct(id);
  for (const h of holdings) {
    const now = valueOf(h);
    if (isLiabilityLine(h)) {
      liabilities.push({ id: h.id, name: h.assetName, accountName: accountName(h.accountId), value: now });
      if (now == null) unvaluedOutside.push({ id: h.id, name: h.assetName, accountName: accountName(h.accountId), liability: true });
      continue;
    }
    if (now != null) householdAssets += now;
    if (!inScope.has(h.accountId)) {
      if (now != null) contextByAccount.set(h.accountId, (contextByAccount.get(h.accountId) ?? 0) + now);
      else unvaluedOutside.push({ id: h.id, name: h.assetName, accountName: accountName(h.accountId), liability: false });
      continue;
    }
    const after = proposedById.has(h.id) ? valueOf(proposedById.get(h.id)!) : now;
    positions.push({ id: h.id, name: h.assetName, accountId: h.accountId, accountName: accountName(h.accountId), assetClass: h.assetClass, current: now, proposed: after, synthetic: false });
    if (now == null || after == null) {
      unvalued.push({ id: h.id, name: h.assetName });
      continue;
    }
    row(h.assetClass).current += now;
    row(h.assetClass).proposed += after;
    acct(h.accountId).current += now;
    acct(h.accountId).proposed += after;
    if (h.assetClass === "cash") {
      cash(h.accountId).current += now;
      cash(h.accountId).proposed += after;
    }
  }
  // Cash lines the engine creates for an account with no cash line yet.
  const currentIds = new Set(holdings.map((h) => h.id));
  for (const h of proposed.holdings as MaybeValued[]) {
    if (currentIds.has(h.id) || !inScope.has(h.accountId) || isLiabilityLine(h)) continue;
    const after = valueOf(h);
    if (after == null) continue;
    positions.push({ id: h.id, name: h.assetName, accountId: h.accountId, accountName: accountName(h.accountId), assetClass: h.assetClass, current: 0, proposed: after, synthetic: true });
    row(h.assetClass).proposed += after;
    acct(h.accountId).proposed += after;
    if (h.assetClass === "cash") cash(h.accountId).proposed += after;
  }

  const totals = { current: 0, proposed: 0 };
  for (const v of rowsByClass.values()) {
    totals.current += v.current;
    totals.proposed += v.proposed;
  }
  const classes = new Set<AssetClass>([...rowsByClass.keys(), ...(Object.keys(draft.targets) as AssetClass[])]);
  const rows: DeskRow[] = [...classes].map((c) => {
    const v = rowsByClass.get(c) ?? { current: 0, proposed: 0 };
    const t = draft.targets[c];
    const targetPct = t == null ? null : t;
    const targetAmount = targetPct == null ? null : (targetPct / 100) * totals.proposed;
    const proposedPct = pct(v.proposed, totals.proposed);
    return {
      assetClass: c,
      label: ASSET_CLASS_LABELS[c] ?? c,
      current: v.current,
      proposed: v.proposed,
      currentPct: pct(v.current, totals.current),
      proposedPct,
      targetPct,
      targetAmount,
      drift: targetAmount == null ? null : v.proposed - targetAmount,
      driftPts: targetPct == null || proposedPct == null ? null : proposedPct - targetPct,
    };
  });
  rows.sort((a, b) => b.current - a.current || b.proposed - a.proposed || a.label.localeCompare(b.label));

  const members = new Set(draft.memberIds);
  const live = recommendations.filter((r) => r.status !== "excluded");
  return {
    view,
    reportingCurrency: fx.reportingCurrency,
    scope: {
      chosen: draft.scopeAccountIds != null,
      accountIds: [...inScope],
      accounts: [...scopeByAccount].map(([id, v]) => ({ id, name: accountName(id), ...v })),
    },
    context: {
      // Every out-of-scope candidate, plus any liability account holding an asset (e.g. offset cash).
      accounts: accounts
        .filter((a) => !inScope.has(a.id) && (!a.isLiabilityAccount || contextByAccount.has(a.id)))
        .map((a) => ({ id: a.id, name: a.name, value: contextByAccount.get(a.id) ?? 0 })),
      total: [...contextByAccount.values()].reduce((a, b) => a + b, 0),
    },
    liabilities: { lines: liabilities, total: liabilities.reduce((a, l) => a + (l.value ?? 0), 0) },
    householdAssets,
    totals,
    rows,
    cash: [...inScope].map((id) => ({ accountId: id, accountName: accountName(id), ...(cashByAccount.get(id) ?? { current: 0, proposed: 0 }) })),
    shortfalls: cashShortfallsOf(proposed.holdings, accounts, fx),
    unresolved: proposed.unresolved,
    unvalued,
    unvaluedOutside,
    positions,
    actions,
    approvedOutsideDraft: recommendations.filter((r) => r.approvedByAdvisor && !members.has(r.id)),
    unapprovedInDraft: live.filter((r) => members.has(r.id) && !r.approvedByAdvisor),
    targetSum: Object.values(draft.targets).reduce<number>((a, b) => a + (b ?? 0), 0),
  };
}

// ---------------------------------------------------------------------------
// Contextual position edits
// ---------------------------------------------------------------------------

export type PositionEditKind = "reduce" | "exit" | "increase";

/**
 * Whether a position can take an explicit edit here: a valued, non-cash,
 * non-liability holding. The engine moves no offsetting cash for a change to
 * a cash line, so editing one would create or remove money; cash moves only
 * through the actions on other positions.
 */
export const editablePosition = (p: Pick<DeskPosition, "assetClass" | "current" | "synthetic">) => !p.synthetic && p.current != null && p.assetClass !== "cash";

/**
 * A draft recommendation for an explicit edit to a position already owned:
 * reduce or increase by an amount in the reporting currency, or an explicit
 * full exit (100%). Unapproved and not in the PDF prose; the caller adds it to
 * the draft. It has no implicit size.
 */
export function positionEditRecommendation(input: {
  holding: Pick<Holding, "id" | "accountId" | "assetName"> & Partial<Pick<Holding, "assetClass" | "isLiability">>;
  kind: PositionEditKind;
  amount?: number;
  reportingCurrency: CurrencyCode;
  id: string;
  now: string;
}): Recommendation {
  const { holding, kind, amount, reportingCurrency, id, now } = input;
  if (holding.assetClass === "cash" || holding.isLiability) throw new Error("Cash and liabilities can't take a position edit here.");
  if (kind !== "exit" && !(amount != null && Number.isFinite(amount) && amount > 0)) throw new Error("A reduce or increase needs a positive amount.");
  const money = (n: number) => `${reportingCurrency} ${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  const base = {
    id,
    relatedHoldingId: holding.id,
    relatedAccountId: holding.accountId,
    currency: reportingCurrency,
    rationale: "",
    priority: "medium" as const,
    status: "draft" as const,
    includeInPdf: false,
    approvedByAdvisor: false,
    createdAt: now,
    updatedAt: now,
  };
  if (kind === "exit") return { ...base, title: `Sell all of ${holding.assetName}`, type: "sell", actionAmount: 100, actionAmountUnit: "percent" };
  if (kind === "reduce") return { ...base, title: `Reduce ${holding.assetName} by ${money(amount!)}`, type: "reduce", actionAmount: amount, actionAmountUnit: "amount" };
  return { ...base, title: `Increase ${holding.assetName} by ${money(amount!)}`, type: "increase", actionAmount: amount, actionAmountUnit: "amount" };
}

// ---------------------------------------------------------------------------
// Input basis (R19a minimum)
// ---------------------------------------------------------------------------

// FNV-1a, 32-bit: identifies inputs; not a security measure.
function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export interface InputBasisInputs {
  /** Current holdings, normalized against the current rates. */
  holdings: NormalizedHolding[];
  accounts: Account[];
  /** The draft's actions (deskActions(…, "draft")). */
  actions: Recommendation[];
  fxRates: FxRate[];
  reportingCurrency: CurrencyCode;
}

/**
 * The accepted values the workspace values with, and every rate the draft
 * uses: valuing holdings, converting its actions' amounts and writing
 * proposed values and cash back in their own currencies (fxPolicy's in-use
 * rule, applied to the draft's actions).
 */
export function inputBasisOf(input: InputBasisInputs): Omit<DraftInputBasis, "recordedAt"> {
  const { holdings, reportingCurrency } = input;
  const values = holdings
    .map((h) => {
      const p = valueProvenance(h);
      return { holdingId: h.id, accountId: h.accountId, amount: h.valuation.amount, currency: h.valuation.currency, sourceKind: p.basis, date: p.date };
    })
    .sort((a, b) => a.holdingId.localeCompare(b.holdingId));
  const used = fxRatesInUse({ holdings, accounts: input.accounts, recommendations: input.actions.map((r) => ({ ...r, approvedByAdvisor: true })), fxRates: input.fxRates, reportingCurrency });
  const rates: DraftInputRate[] = used
    .map(({ leg }) => ({ base: leg.base, quote: leg.quote, rate: leg.rate, asOf: leg.asOf, source: leg.source }))
    .sort((a, b) => `${a.base}/${a.quote}`.localeCompare(`${b.base}/${b.quote}`));
  return { reportingCurrency, fingerprint: fnv1a(JSON.stringify([reportingCurrency, values, rates])), values, rates };
}

/** The basis inputs of a workspace and its draft (store, page and tests use the same). */
export function draftBasisInputs(ws: { holdings: Holding[]; accounts: Account[]; recommendations: Recommendation[]; fxRates: FxRate[]; reportingCurrency: CurrencyCode; draft: WorkingDraft }): InputBasisInputs {
  return {
    holdings: normalizeHoldings(ws.holdings, ws.fxRates, ws.reportingCurrency),
    accounts: ws.accounts,
    actions: deskActions(ws.recommendations, ws.draft, "draft"),
    fxRates: ws.fxRates,
    reportingCurrency: ws.reportingCurrency,
  };
}

export function recordInputBasis(input: InputBasisInputs, now: string): DraftInputBasis {
  return { recordedAt: now, ...inputBasisOf(input) };
}

/** Whether the workspace's inputs differ from those the draft recorded. */
export function inputsChanged(basis: DraftInputBasis | null, input: InputBasisInputs): boolean {
  return basis != null && basis.fingerprint !== inputBasisOf(input).fingerprint;
}
