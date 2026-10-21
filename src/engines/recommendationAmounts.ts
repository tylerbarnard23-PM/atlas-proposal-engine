import type { CurrencyCode, Recommendation } from "@/domain/types";
import { safeId, todayIso } from "@/utils/formatting";
import { resolveFxRate, type FxResolveResult } from "./currencyEngine";
import type { FxContext } from "./proposalEngine";

// Recommendation money amounts (issue #24)
// ----------------------------------------
// - A recommendation's money amounts are entered in its own `currency`:
//   proposedValue always (it's a target value, monetary even when the action
//   amount is a percent), and actionAmount when its unit is "amount". A
//   "percent" action amount is a share of the holding's value: no currency.
// - amountsInReporting converts them into the reporting currency at the
//   workspace's current rates. It's the only conversion: applyRecToValue
//   accepts only its output (ReportingAmounts), so a raw recommendation can't
//   be applied unconverted and a converted one can't be converted again.
// - A missing rate is reported, never treated as 1:1.
// - The currency label never changes on its own: changing it converts the
//   amounts at a shown rate or replaces them (changeRecommendationCurrency).

export interface AmountConversion {
  from: CurrencyCode;
  to: CurrencyCode;
  rate: number;
  source: string;
  asOf: string;
  path: FxResolveResult["path"];
}

/** A recommendation's amounts in the reporting currency, ready to apply. */
export interface ReportingAmounts {
  readonly kind: "reporting-amounts";
  type: Recommendation["type"];
  actionAmount?: number;
  actionAmountUnit?: "amount" | "percent";
  proposedValue?: number;
}

type AmountFields = Pick<Recommendation, "type" | "actionAmount" | "actionAmountUnit" | "proposedValue" | "currency">;

export type AmountsResult =
  | { ok: true; amounts: ReportingAmounts; conversion?: AmountConversion }
  | { ok: false; currency: CurrencyCode; reason: string };

/** Whether the recommendation carries any money amount (as opposed to none, or only a percent). */
export const hasMoneyAmounts = (r: Pick<Recommendation, "actionAmount" | "actionAmountUnit" | "proposedValue">) =>
  r.proposedValue != null || (r.actionAmount != null && r.actionAmountUnit !== "percent");

const conversionOf = (from: CurrencyCode, to: CurrencyCode, r: FxResolveResult): AmountConversion => ({
  from,
  to,
  rate: r.rate,
  source: r.source,
  asOf: r.asOf,
  path: r.path,
});

/** The recommendation's amounts in the reporting currency, with the conversion used (if any). */
export function amountsInReporting(rec: AmountFields, fx: FxContext): AmountsResult {
  const base = { kind: "reporting-amounts" as const, type: rec.type, actionAmountUnit: rec.actionAmountUnit };
  const currency = rec.currency || fx.reportingCurrency;
  if (!hasMoneyAmounts(rec) || currency === fx.reportingCurrency) {
    return { ok: true, amounts: { ...base, actionAmount: rec.actionAmount, proposedValue: rec.proposedValue } };
  }
  const r = resolveFxRate(fx.rates, currency, fx.reportingCurrency);
  if (!r) {
    return {
      ok: false,
      currency,
      reason: `No ${currency}/${fx.reportingCurrency} exchange rate, so this recommendation's ${currency} amount can't be converted and it was not applied.`,
    };
  }
  const conv = (n?: number) => (n == null ? undefined : n * r.rate);
  return {
    ok: true,
    amounts: {
      ...base,
      actionAmount: rec.actionAmountUnit === "percent" ? rec.actionAmount : conv(rec.actionAmount),
      proposedValue: conv(rec.proposedValue),
    },
    conversion: conversionOf(currency, fx.reportingCurrency, r),
  };
}

export const money = (n: number, currency: string) =>
  `${currency} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const rateText = (rate: number) => (rate >= 0.1 ? rate.toFixed(4) : rate.toPrecision(4));

/** "0.8000 EUR per USD (ECB, as of 2026-10-20; current workspace rate, recalculated when rates change)" */
export function describeConversion(c: AmountConversion): string {
  const how = c.path === "cross" ? ", cross rate via USD" : "";
  return `${rateText(c.rate)} ${c.to} per ${c.from} (${c.source}${how}, as of ${c.asOf.slice(0, 10)}; current workspace rate, recalculated when rates change)`;
}

/**
 * The recommendation's money amounts and their reporting-currency equivalent,
 * or null when nothing needs converting (same currency, or no money amounts).
 */
export function describeAmounts(rec: AmountFields, fx: FxContext): string | null {
  const currency = rec.currency || fx.reportingCurrency;
  if (!hasMoneyAmounts(rec) || currency === fx.reportingCurrency) return null;
  const result = amountsInReporting(rec, fx);
  const parts: string[] = [];
  const amount = rec.actionAmountUnit === "percent" ? undefined : rec.actionAmount;
  const pair = (label: string, n: number, converted?: number) =>
    `${label}${money(Math.abs(n), currency)}${converted != null ? ` ≈ ${money(Math.abs(converted), fx.reportingCurrency)}` : ""}`;
  if (!result.ok) {
    if (amount != null) parts.push(pair("", amount));
    if (rec.proposedValue != null) parts.push(pair("Target ", rec.proposedValue));
    return `${parts.join("; ")}: not converted (no ${currency}/${fx.reportingCurrency} rate in the workspace), so it isn't applied.`;
  }
  if (amount != null) parts.push(pair("", amount, result.amounts.actionAmount));
  if (rec.proposedValue != null) parts.push(pair("Target ", rec.proposedValue, result.amounts.proposedValue));
  return `${parts.join("; ")} at ${describeConversion(result.conversion!)}`;
}

/** A blank recommendation, in the reporting currency. */
export function newRecommendation(reportingCurrency: CurrencyCode): Recommendation {
  const now = todayIso();
  return {
    id: safeId("rec"),
    title: "",
    type: "custom",
    currency: reportingCurrency,
    rationale: "",
    priority: "medium",
    status: "draft",
    includeInPdf: false,
    approvedByAdvisor: false,
    createdAt: now,
    updatedAt: now,
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export type CurrencyChange =
  | { ok: true; rec: Recommendation; conversion?: AmountConversion }
  | { ok: false; reason: string };

/**
 * Changes a recommendation's currency. With money amounts the advisor must
 * choose: "convert" keeps the economic value at the shown rate (amounts
 * rounded to the cent); "replace" clears them to be entered again. A
 * "relabel" (same numbers, new currency) is only allowed with no money
 * amounts, where the currency carries no value.
 */
export function changeRecommendationCurrency(
  rec: Recommendation,
  to: CurrencyCode,
  mode: "convert" | "replace" | "relabel",
  fx: FxContext
): CurrencyChange {
  if (to === rec.currency) return { ok: true, rec };
  if (!hasMoneyAmounts(rec)) return { ok: true, rec: { ...rec, currency: to } };
  if (mode === "relabel") {
    return { ok: false, reason: "This recommendation has amounts: convert them at a rate, or enter replacement amounts." };
  }
  if (mode === "replace") {
    return {
      ok: true,
      rec: { ...rec, currency: to, proposedValue: undefined, actionAmount: rec.actionAmountUnit === "percent" ? rec.actionAmount : undefined },
    };
  }
  const r = resolveFxRate(fx.rates, rec.currency, to);
  if (!r) return { ok: false, reason: `No ${rec.currency}/${to} exchange rate in the workspace to convert with. Enter replacement amounts instead.` };
  const conv = (n?: number) => (n == null ? undefined : round2(n * r.rate));
  return {
    ok: true,
    rec: {
      ...rec,
      currency: to,
      actionAmount: rec.actionAmountUnit === "percent" ? rec.actionAmount : conv(rec.actionAmount),
      proposedValue: conv(rec.proposedValue),
    },
    conversion: conversionOf(rec.currency, to, r),
  };
}

const unit = (r: Pick<Recommendation, "actionAmountUnit">) => r.actionAmountUnit ?? "amount";
const moneyChanged = (a: Recommendation, b: Recommendation) =>
  a.actionAmount !== b.actionAmount || unit(a) !== unit(b) || a.proposedValue !== b.proposedValue || a.currency !== b.currency;

/** An edit that changes what the recommendation does: its amounts, currency, linked holding or type. */
export function isMaterialEdit(prev: Recommendation, next: Recommendation): boolean {
  return moneyChanged(prev, next) || prev.relatedHoldingId !== next.relatedHoldingId || prev.type !== next.type;
}

/**
 * Rules applied whenever a recommendation is saved over an earlier version:
 * - a material edit of an approved recommendation clears its approval
 *   (approve again after the change); approving or unapproving alone isn't
 *   an edit, and a draft approved in the same save keeps that approval;
 * - editing the money amounts or currency resolves an open currency review
 *   as "changed": the advisor has stated the amounts explicitly.
 */
export function withApprovalRule(prev: Recommendation | undefined, next: Recommendation): Recommendation {
  if (!prev) return next;
  let out = next;
  if (prev.approvedByAdvisor && next.approvedByAdvisor && isMaterialEdit(prev, next)) {
    out = { ...out, approvedByAdvisor: false, status: "needs_review" };
  }
  if (out.currencyReview?.status === "open" && moneyChanged(prev, next)) {
    out = { ...out, currencyReview: { ...out.currencyReview, status: "changed", resolvedAt: todayIso() } };
  }
  return out;
}

/**
 * v5 migration. Before v5 the engine calculated every money amount in the
 * reporting currency, whatever the label said; `calculatedIn` is that
 * currency. The amounts keep being calculated in it; a differing old label
 * is kept as evidence (it may have been a default) for the advisor to review.
 */
export function migrateRecommendationCurrency(rec: Recommendation, calculatedIn: CurrencyCode, now: string): Recommendation {
  if (rec.currencyReview) return rec;
  const label = rec.currency;
  if (!hasMoneyAmounts(rec) || !label || label === calculatedIn) return { ...rec, currency: calculatedIn };
  return { ...rec, currency: calculatedIn, currencyReview: { legacyLabel: label, calculatedIn, status: "open", migratedAt: now } };
}

const primaryAmount = (r: Recommendation) => r.proposedValue ?? (r.actionAmountUnit === "percent" ? undefined : r.actionAmount);

export type ReviewResolution =
  | { ok: true; rec: Recommendation; effect?: { from: string; to: string }; conversion?: AmountConversion }
  | { ok: false; reason: string };

/**
 * Resolves an open currency review:
 * - "keep": the amounts stay in the currency they've been calculated in. The
 *   economic amount doesn't change, so an approval stands.
 * - "legacy": the amounts are treated as the old label's currency, converted
 *   at the current rate. That changes the economic amount (shown as `effect`
 *   before the advisor confirms) and clears the approval.
 * Editing the amounts in the form resolves it too (see withApprovalRule).
 */
export function resolveCurrencyReview(rec: Recommendation, choice: "keep" | "legacy", fx: FxContext, now: string): ReviewResolution {
  const review = rec.currencyReview;
  if (!review || review.status !== "open") return { ok: false, reason: "This recommendation has no open currency review." };
  if (choice === "keep") return { ok: true, rec: { ...rec, currencyReview: { ...review, status: "kept", resolvedAt: now } } };
  const candidate: Recommendation = { ...rec, currency: review.legacyLabel };
  const converted = amountsInReporting(candidate, fx);
  if (!converted.ok) return { ok: false, reason: converted.reason };
  const amount = primaryAmount(rec);
  const convertedAmount = rec.proposedValue != null ? converted.amounts.proposedValue : converted.amounts.actionAmount;
  const effect =
    amount == null
      ? undefined
      : {
          from: money(amount, rec.currency),
          to:
            review.legacyLabel === fx.reportingCurrency || convertedAmount == null
              ? money(amount, review.legacyLabel)
              : `${money(amount, review.legacyLabel)} ≈ ${money(convertedAmount, fx.reportingCurrency)}`,
        };
  return {
    ok: true,
    rec: {
      ...candidate,
      approvedByAdvisor: false,
      status: rec.approvedByAdvisor ? "needs_review" : rec.status,
      currencyReview: { ...review, status: "changed", resolvedAt: now },
    },
    effect,
    conversion: converted.conversion,
  };
}

/** Open reviews that block final output: on approved recommendations included in the PDF. */
export const openCurrencyReviews = (recs: Recommendation[]) =>
  recs.filter((r) => r.approvedByAdvisor && r.includeInPdf && r.currencyReview?.status === "open");

/** Recommendations whose money amounts are in a currency other than the reporting one. */
export const recommendationsInOtherCurrencies = (recs: Recommendation[], reportingCurrency: CurrencyCode) =>
  recs.filter((r) => r.status !== "excluded" && hasMoneyAmounts(r) && r.currency !== reportingCurrency);
