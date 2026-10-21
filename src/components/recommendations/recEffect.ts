import type { Recommendation } from "@/domain/types";
import type { NormalizedHolding } from "@/engines/normalizationEngine";
import { applyRecToValue, type FxContext } from "@/engines/proposalEngine";
import { amountsInReporting, describeAmounts } from "@/engines/recommendationAmounts";
import { reportingValue } from "@/engines/valuationTotals";
import { formatCurrency } from "@/utils/formatting";

// Effect summaries for the recommendation cards and the edit form. Both use
// the engine's own steps (amountsInReporting, then applyRecToValue), so the
// UI and the proposal can't disagree. Every figure is in the reporting
// currency; a recommendation entered in another currency also shows its own
// amount and the rate it was converted at.

type Tone = "neutral" | "positive" | "negative" | "warning";

const NET_FLAT = new Set<Recommendation["type"]>(["tax_loss_harvest", "replace_high_fee_fund", "improve_asset_location"]);

export function describeRecEffect(
  rec: Recommendation,
  linked: NormalizedHolding | undefined,
  fx: FxContext
): { label: string; tone: Tone; amounts: string | null } {
  const cur = fx.reportingCurrency;
  const amounts = describeAmounts(rec, fx);
  if (!rec.relatedHoldingId) return { label: "Advisory only — no allocation impact.", tone: "neutral", amounts };
  if (!linked) return { label: "Linked holding no longer exists.", tone: "warning", amounts };
  const before = reportingValue(linked);
  if (before == null) {
    return {
      label: `${linked.assetName}: not valued in ${cur} (no ${linked.valuation.currency}/${cur} rate), so this can't be applied yet.`,
      tone: "warning",
      amounts,
    };
  }
  const converted = amountsInReporting(rec, fx);
  if (!converted.ok) {
    return { label: `${linked.assetName}: amount in ${converted.currency} with no ${converted.currency}/${cur} rate, so this can't be applied yet.`, tone: "warning", amounts };
  }
  const after = applyRecToValue(before, converted.amounts, !!linked.isLiability);
  const delta = after - before;
  if (Math.abs(delta) < 1 && rec.proposedValue == null) {
    return { label: `${linked.assetName}: no shift yet — set an action amount or proposed value.`, tone: "warning", amounts };
  }
  const money = (n: number) => formatCurrency(n, cur, { compact: true });
  const cashDelta = -delta; // a sale credits cash, a purchase or paydown debits it
  const cashLabel = cashDelta === 0 ? "" : ` · Cash ${cashDelta > 0 ? "+" : "−"}${money(Math.abs(cashDelta))}`;
  return {
    label: `${linked.assetName}: ${money(before)} → ${money(after)} (${delta < 0 ? "−" : "+"}${money(Math.abs(delta))})${cashLabel}`,
    tone: delta < 0 ? "negative" : "positive",
    amounts,
  };
}

export function describeFormEffect(
  rec: Recommendation,
  linked: NormalizedHolding | undefined,
  fx: FxContext
): { currentValue: string | null; hint: string; amounts: string | null } {
  const cur = fx.reportingCurrency;
  const amounts = describeAmounts(rec, fx);
  const current = linked ? reportingValue(linked) : null;
  const currentValue = current == null ? null : formatCurrency(current, cur);
  const out = (hint: string) => ({ currentValue, hint, amounts });
  if (!rec.relatedHoldingId) {
    return out("Without a linked holding, this recommendation will appear in the proposal text but won't shift the Before / After allocation.");
  }
  if (!linked) return out("Linked holding no longer exists.");
  if (current == null) {
    return out(`${linked.assetName} can't be valued in ${cur} (no ${linked.valuation.currency}/${cur} rate), so this recommendation's effect can't be shown or applied until the rate is added in Market Data.`);
  }
  const converted = amountsInReporting(rec, fx);
  if (!converted.ok) return out(`${converted.reason} Add the rate in Market Data, or change the recommendation's currency.`);
  const after = applyRecToValue(current, converted.amounts, !!linked.isLiability);
  if (Math.abs(after - current) < 1 && rec.proposedValue == null) {
    return out(NET_FLAT.has(rec.type) ? "Net-flat on allocation — same exposure, different vehicle/lot." : "No allocation shift yet — set an action amount or proposed value.");
  }
  const delta = after - current;
  const money = (n: number) => formatCurrency(n, cur, { compact: true });
  return out(`${linked.assetName}: ${money(current)} → ${money(after)}. Cash ${delta < 0 ? "credit" : "debit"} ${money(Math.abs(delta))} in the same account.`);
}
