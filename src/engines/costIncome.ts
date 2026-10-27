import type { Holding } from "@/domain/types";
import { reportingValue } from "./valuationTotals";

// D3 / R16 minimum: known-input costs and income with their coverage. A
// holding with no supplied expense ratio or yield is not counted as zero: the
// figures describe only the covered holdings, and say how much that is. With
// nothing supplied the figure is unavailable. Nothing is extrapolated to the
// uncovered value, and no saving or forecast is derived.

export interface CoverageFigure {
  /** Expense: the value-weighted ratio in percent; income: the annual amount. Over covered holdings only; null when none is covered. */
  value: number | null;
  coveredValue: number;
  totalValue: number;
  coveredCount: number;
  totalCount: number;
}

export interface CostIncomeCoverage {
  expense: CoverageFigure;
  income: CoverageFigure;
  /** Proposed manager/strategy sleeves: their fees are supplied strategy components, listed separately, never mixed into holding ratios. */
  sleevesExcluded: number;
}

type Valued = Holding & { reportingMarketValue?: number | null; proposedOnly?: boolean };
const valueOf = (h: Valued) => reportingValue(h) as number;

/**
 * Coverage over valued, non-cash, non-liability holdings (cash has no expense
 * ratio; a liability has neither). Proposed sleeves are excluded and counted.
 */
export function costIncomeCoverage(holdings: Valued[]): CostIncomeCoverage {
  const basis = holdings.filter((h) => !h.isLiability && h.assetClass !== "cash" && h.assetClass !== "liability" && (reportingValue(h) ?? 0) > 0);
  const sleeves = basis.filter((h) => h.proposedOnly);
  const own = basis.filter((h) => !h.proposedOnly);
  const totalValue = own.reduce((a, h) => a + valueOf(h), 0);
  const figure = (pick: (h: Valued) => number | undefined, weighted: boolean): CoverageFigure => {
    const covered = own.filter((h) => pick(h) != null && Number.isFinite(pick(h)));
    const coveredValue = covered.reduce((a, h) => a + valueOf(h), 0);
    const sum = covered.reduce((a, h) => a + ((pick(h) as number) / 100) * valueOf(h), 0);
    return {
      value: covered.length === 0 || coveredValue <= 0 ? null : weighted ? (sum / coveredValue) * 100 : sum,
      coveredValue,
      totalValue,
      coveredCount: covered.length,
      totalCount: own.length,
    };
  };
  return { expense: figure((h) => h.expenseRatioPct, true), income: figure((h) => h.incomeYieldPct, false), sleevesExcluded: sleeves.length };
}

/** "0.42% across 63% of non-cash value (12 of 20 holdings)", or why it is unavailable. */
export function describeCoverage(f: CoverageFigure, render: (value: number) => string): string {
  if (f.totalCount === 0) return "Not applicable (no valued non-cash holdings)";
  if (f.value == null) return `Unavailable: not supplied for any of the ${f.totalCount} valued non-cash holding${f.totalCount === 1 ? "" : "s"}`;
  const pct = f.totalValue > 0 ? Math.round((f.coveredValue / f.totalValue) * 100) : 0;
  const all = f.coveredCount === f.totalCount;
  return `${render(f.value)} ${all ? "across all" : `across ${pct}% of`} non-cash value (${f.coveredCount} of ${f.totalCount} holding${f.totalCount === 1 ? "" : "s"})${all ? "" : "; not supplied for the rest"}`;
}
