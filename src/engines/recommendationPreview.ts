import type { Account, CurrencyCode, Holding, Recommendation, SourceDocument } from "@/domain/types";
import type { NormalizedHolding } from "./normalizationEngine";
import { applyRecommendationsToProposed, cashShortfallsOf, type CashShortfall, type FxContext } from "./proposalEngine";
import { describeAmounts } from "./recommendationAmounts";
import { holdingsFromIncompleteImports, importIssues, describeImportIssue } from "./importCompleteness";

// A recommendation's effect, simulated with the complete proposal engine in
// isolation (issue #33). The engine computes the actual cash offsets,
// household funding of debt paydowns, missing rates and shortfalls; this
// module only compares holdings before and after. Nothing is saved,
// approved or changed: inputs are read, never mutated.
//
// - Standalone: this recommendation alone, on the current holdings.
// - Combined: with every other approved recommendation that touches the same
//   position or account, shown separately. The recommendation being edited
//   replaces its saved version (by id), so it is never applied twice.

export interface Movement {
  holdingId: string;
  name: string;
  accountId: string;
  accountName: string;
  /** In the reporting currency; 0 for a cash line the actions would create. */
  before: number;
  after: number;
  change: number;
  /** Percentage change, or null when the starting value is zero. */
  pctChange: number | null;
  synthetic: boolean;
}

export interface Scenario {
  applied: boolean;
  /** The linked position, current → proposed. */
  position: Movement | null;
  /** Other cash lines that move: offsets, household funding, new cash lines. */
  cash: Movement[];
  /** Shortfalls this scenario creates or deepens. */
  shortfalls: CashShortfall[];
}

export interface PreviewWarning {
  kind: "missing_rate" | "unvalued" | "incomplete_import" | "currency_review" | "shortfall";
  message: string;
  /** Whether this keeps the final PDF blocked (now, or once approved and included). */
  blocksFinal: boolean;
}

export interface RecommendationPreview {
  state: "advisory" | "missing_holding" | "cannot_apply" | "no_change" | "simulated";
  reportingCurrency: CurrencyCode;
  holding?: { id: string; name: string; accountName: string; valueDate?: string; currency: CurrencyCode; assetClass: Holding["assetClass"]; isLiability: boolean };
  /** The entered amount and its reporting-currency equivalent, when they differ. */
  amounts: string | null;
  /** A target value is set, so the action amount is ignored. */
  targetOverridesAction: boolean;
  /** Same exposure, different vehicle or lot: the allocation doesn't move. */
  allocationNeutral: boolean;
  standalone: Scenario | null;
  combined: (Scenario & { others: { id: string; title: string }[]; thisChange: number }) | null;
  warnings: PreviewWarning[];
}

const NET_FLAT = new Set<Recommendation["type"]>(["tax_loss_harvest", "replace_high_fee_fund", "improve_asset_location"]);
const EPSILON = 0.005; // half a cent: anything smaller is floating-point noise

type MaybeValued = Holding & Partial<Pick<NormalizedHolding, "valuation">>;
const valueOf = (h: MaybeValued): number | null =>
  h.valuation ? (h.valuation.status === "valued" ? h.reportingMarketValue ?? null : null) : h.reportingMarketValue ?? null;

function movement(before: MaybeValued | undefined, after: MaybeValued | undefined, accountName: (id: string) => string): Movement | null {
  const h = (after ?? before)!;
  const b = before ? valueOf(before) : 0;
  const a = after ? valueOf(after) : 0;
  if (b == null || a == null) return null;
  const change = a - b;
  return {
    holdingId: h.id,
    name: h.assetName,
    accountId: h.accountId,
    accountName: accountName(h.accountId),
    before: b,
    after: a,
    change,
    pctChange: b === 0 ? null : (change / Math.abs(b)) * 100,
    synthetic: !before,
  };
}

// Compares two engine outputs: the linked position, and every cash line that moved.
function compare(
  from: Holding[],
  to: Holding[],
  positionId: string,
  accounts: Account[],
  fx: FxContext,
  fromShortfalls: CashShortfall[],
  applied: boolean
): Scenario {
  const names = new Map(accounts.map((a) => [a.id, a.name] as const));
  const accountName = (id: string) => names.get(id) ?? id;
  const fromById = new Map(from.map((h) => [h.id, h] as const));
  const position = movement(fromById.get(positionId), to.find((h) => h.id === positionId), accountName);
  const cash: Movement[] = [];
  for (const h of to) {
    if (h.id === positionId || h.isLiability || h.assetClass !== "cash") continue;
    const m = movement(fromById.get(h.id), h, accountName);
    if (m && Math.abs(m.change) >= EPSILON) cash.push(m);
  }
  const before = new Map(fromShortfalls.map((s) => [s.accountId, s.shortfall] as const));
  const shortfalls = cashShortfallsOf(to, accounts, fx).filter((s) => s.shortfall > (before.get(s.accountId) ?? 0) + EPSILON);
  return { applied, position, cash, shortfalls };
}

export function previewRecommendation(input: {
  /** The recommendation as edited (a draft or a saved one being changed). */
  rec: Recommendation;
  /** Current holdings, normalized against the current rates. */
  holdings: Holding[];
  /** Saved recommendations; approved ones other than `rec` form the combined result. */
  recommendations: Recommendation[];
  accounts: Account[];
  fx: FxContext;
  sourceDocuments: SourceDocument[];
}): RecommendationPreview {
  const { rec, holdings, accounts, fx } = input;
  const base = {
    reportingCurrency: fx.reportingCurrency,
    amounts: describeAmounts(rec, fx),
    targetOverridesAction: rec.proposedValue != null && rec.actionAmount != null,
    allocationNeutral: NET_FLAT.has(rec.type),
  };
  const warnings: PreviewWarning[] = [];
  const willBeInPdf = rec.approvedByAdvisor && rec.includeInPdf;
  if (rec.currencyReview?.status === "open") {
    warnings.push({
      kind: "currency_review",
      message: `Currency not yet confirmed: amounts calculated in ${rec.currencyReview.calculatedIn}, saved label ${rec.currencyReview.legacyLabel}. ${
        willBeInPdf ? "Blocks the final PDF until resolved." : "Will block the final PDF once approved and included."
      }`,
      blocksFinal: true,
    });
  }

  if (!rec.relatedHoldingId) return { ...base, state: "advisory", standalone: null, combined: null, warnings };
  const linked = holdings.find((h) => h.id === rec.relatedHoldingId) as MaybeValued | undefined;
  if (!linked) return { ...base, state: "missing_holding", standalone: null, combined: null, warnings };
  const account = accounts.find((a) => a.id === linked.accountId);
  const holdingInfo = {
    id: linked.id,
    name: linked.assetName,
    accountName: account?.name ?? linked.accountId,
    valueDate: linked.valuationDate,
    currency: linked.currency,
    assetClass: linked.assetClass,
    isLiability: !!linked.isLiability,
  };

  const incomplete = holdingsFromIncompleteImports(input.sourceDocuments, holdings);
  if (incomplete.has(linked.id)) {
    const issue = importIssues(input.sourceDocuments, holdings).find((i) => i.documentId === linked.sourceTrace?.sourceDocumentId);
    warnings.push({
      kind: "incomplete_import",
      message: `From an incomplete import${issue ? ` (${describeImportIssue(issue)})` : ""}: the portfolio may be missing positions. Blocks the final PDF until the import is complete.`,
      blocksFinal: true,
    });
  }

  if (linked.valuation && linked.valuation.status !== "valued") {
    warnings.unshift({
      kind: "unvalued",
      message: `${linked.assetName} can't be valued in ${fx.reportingCurrency} (no ${linked.valuation.currency}/${fx.reportingCurrency} rate), so this recommendation can't be applied until the rate is added in Market Data.`,
      blocksFinal: true,
    });
    return { ...base, state: "cannot_apply", holding: holdingInfo, standalone: { applied: false, position: null, cash: [], shortfalls: [] }, combined: null, warnings };
  }

  // Standalone: this recommendation alone. The engine takes its list as the
  // approved set; the draft's own approval flags don't matter here.
  const current = holdings;
  const currentShortfalls = cashShortfallsOf(current, accounts, fx);
  const alone = applyRecommendationsToProposed(current, [rec], accounts, fx);
  const unresolved = alone.unresolved.find((u) => u.recommendationId === rec.id);
  if (unresolved) {
    warnings.unshift({ kind: "missing_rate", message: unresolved.reason, blocksFinal: true });
    return { ...base, state: "cannot_apply", holding: holdingInfo, standalone: { applied: false, position: movement(linked, linked, () => holdingInfo.accountName), cash: [], shortfalls: [] }, combined: null, warnings };
  }
  const standalone = compare(current, alone.holdings, linked.id, accounts, fx, currentShortfalls, true);
  for (const s of standalone.shortfalls) {
    warnings.push({
      kind: "shortfall",
      message: `${s.accountName} would be short ${s.shortfall.toLocaleString("en-US", { style: "currency", currency: fx.reportingCurrency })} of cash. Reduce the amount or fund it with a sale in that account; an unfunded purchase blocks the final PDF.`,
      blocksFinal: true,
    });
  }

  // Combined: other approved recommendations on the same position or account.
  // The edited recommendation replaces its saved version by id.
  const others = input.recommendations.filter(
    (r) =>
      r.id !== rec.id &&
      r.approvedByAdvisor &&
      r.status !== "excluded" &&
      !!r.relatedHoldingId &&
      (r.relatedHoldingId === linked.id || holdings.find((h) => h.id === r.relatedHoldingId)?.accountId === linked.accountId)
  );
  let combined: RecommendationPreview["combined"] = null;
  if (others.length > 0) {
    const allOthers = input.recommendations.filter((r) => r.id !== rec.id && r.approvedByAdvisor && r.status !== "excluded");
    const withoutThis = applyRecommendationsToProposed(current, allOthers, accounts, fx);
    const withThis = applyRecommendationsToProposed(current, [...allOthers, rec], accounts, fx);
    const scenario = compare(current, withThis.holdings, linked.id, accounts, fx, currentShortfalls, !withThis.unresolved.some((u) => u.recommendationId === rec.id));
    const positionWithout = withoutThis.holdings.find((h) => h.id === linked.id) as MaybeValued | undefined;
    const positionWith = withThis.holdings.find((h) => h.id === linked.id) as MaybeValued | undefined;
    const a = positionWith ? valueOf(positionWith) : null;
    const b = positionWithout ? valueOf(positionWithout) : null;
    combined = { ...scenario, others: others.map((r) => ({ id: r.id, title: r.title })), thisChange: a != null && b != null ? a - b : 0 };
  }

  const moved = Math.abs(standalone.position?.change ?? 0) >= EPSILON || standalone.cash.length > 0;
  return { ...base, state: moved || rec.proposedValue != null ? "simulated" : "no_change", holding: holdingInfo, standalone, combined, warnings };
}
