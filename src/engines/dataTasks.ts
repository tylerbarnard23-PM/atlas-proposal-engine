import type { DataTaskKind, Holding } from "@/domain/types";
import type { HoldingValuation } from "./normalizationEngine";
import { isStale } from "@/utils/dates";

// "Data to complete": the gaps in imported data an advisor can act on,
// worked out from each holding's own fields (not its stored data-quality
// notes, which are only computed for some holdings and go stale).

export const MARKET_STALE_DAYS = 35;
export const PRIVATE_STALE_DAYS = 365;

// Valued by appraisal or statement once in a while, not priced daily.
const PRIVATELY_VALUED = new Set(["real_estate", "business", "collectible", "insurance", "private_equity", "private_credit", "hedge_fund", "venture", "alternatives"]);

// Asset classes whose holdings trade under a ticker, CUSIP or ISIN.
const LISTED = new Set(["equity", "fixed_income", "commodity", "crypto"]);

export function staleThresholdDays(h: Pick<Holding, "assetClass">): number {
  return PRIVATELY_VALUED.has(h.assetClass) ? PRIVATE_STALE_DAYS : MARKET_STALE_DAYS;
}

export function isBalanceOnly(h: Holding): boolean {
  return h.dataQuality.some((d) => /only this account's balance/.test(d.message));
}

export function needsIdentifier(h: Holding): boolean {
  return LISTED.has(h.assetClass) && !h.identifier && !isBalanceOnly(h) && h.assetType !== "option";
}

export function isStaleValue(h: Holding): boolean {
  return !h.isLiability && isStale(h.valuationDate, staleThresholdDays(h));
}

export interface DataTask {
  kind: DataTaskKind;
  openIds: string[];
  doneIds: string[];
}

export function dataTasks(holdings: (Holding & { valuation?: HoldingValuation })[]): DataTask[] {
  const tasks: Record<DataTaskKind, DataTask> = {
    // First: an unvalued holding is left out of every total.
    missing_fx_rate: { kind: "missing_fx_rate", openIds: [], doneIds: [] },
    balance_only: { kind: "balance_only", openIds: [], doneIds: [] },
    missing_identifier: { kind: "missing_identifier", openIds: [], doneIds: [] },
    stale_value: { kind: "stale_value", openIds: [], doneIds: [] },
  };
  for (const h of holdings) {
    if (h.valuation?.status === "unvalued") tasks.missing_fx_rate.openIds.push(h.id);
    if (isBalanceOnly(h)) (h.dataAcks?.keepAsBalance ? tasks.balance_only.doneIds : tasks.balance_only.openIds).push(h.id);
    if (needsIdentifier(h)) tasks.missing_identifier.openIds.push(h.id);
    if (isStaleValue(h)) {
      const accepted = h.dataAcks?.acceptedValuationDate && h.dataAcks.acceptedValuationDate === h.valuationDate;
      (accepted ? tasks.stale_value.doneIds : tasks.stale_value.openIds).push(h.id);
    }
  }
  return Object.values(tasks).filter((t) => t.openIds.length > 0);
}

// Codes the tasks above replace, so the same gap isn't reported twice.
export const CODES_COVERED_BY_TASKS = new Set(["MISSING_IDENTIFIER", "STALE_VALUATION", "MISSING_VALUATION_DATE"]);
