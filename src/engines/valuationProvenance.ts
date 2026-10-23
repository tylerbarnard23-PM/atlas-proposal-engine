import type { AdvisorVerificationStatus, Holding, ValuationSource } from "@/domain/types";
import { calendarDay, formatCalendarDate } from "@/utils/formatting";
import { resolveValuation } from "./valuationEngine";

// R18 (#51): what each value in the proposal is based on, described from the
// valuation the resolver actually uses (engines/valuationEngine), with that
// value's own recorded date. Atlas doesn't price securities from market
// data: a provider named here is historical evidence recorded with an older
// value, never a configured feed. Nothing here changes an amount.

export type ValueBasis = "approved" | "override" | "statement" | "advisor_entered" | "manual" | "legacy_market_data" | "mock";

export const BASIS_LABEL: Record<ValueBasis, string> = {
  approved: "Approved value",
  override: "Advisor override",
  statement: "Statement value",
  advisor_entered: "Advisor-entered value",
  manual: "Manual valuation",
  legacy_market_data: "Recorded market data (legacy)",
  mock: "Mock / placeholder value",
};

const REVIEW_LABEL: Record<AdvisorVerificationStatus, string> = {
  unverified: "Not yet reviewed",
  advisor_reviewed: "Reviewed",
  advisor_approved: "Approved",
  locked_for_proposal: "Locked for proposal",
  rejected: "Rejected",
};

export interface ValueProvenance {
  basis: ValueBasis;
  label: string;
  /** Provider, note or origin recorded with the value, when there is one. */
  detail?: string;
  /** The value's own recorded date (a calendar day), or null when none was recorded. */
  date: string | null;
  /** For an approved value: the day it was locked. */
  approvedOn?: string | null;
  /** The holding's own source, when the value used comes from somewhere else. */
  holdingSource?: string;
  review: string;
}

const basisOfKind = (kind: ValuationSource["kind"]): ValueBasis =>
  kind === "statement"
    ? "statement"
    : kind === "advisor_entered"
    ? "advisor_entered"
    : kind === "advisor_override"
    ? "override"
    : kind === "manual_valuation"
    ? "manual"
    : kind === "market_data"
    ? "legacy_market_data"
    : "mock";

function sourceDetail(s: ValuationSource): string | undefined {
  if (s.kind === "market_data") return s.providerName ? `${s.providerName}, as recorded at the time` : "provider not recorded";
  return s.note ?? s.providerName ?? undefined;
}

/** "Statement value, as of Apr 30, 2026": the holding's own source, for when another value is used. */
function describeHoldingSource(h: Holding): string {
  const day = calendarDay(h.valuationSource.asOf ?? h.valuationDate);
  return `${BASIS_LABEL[basisOfKind(h.valuationSource.kind)]}${day ? `, as of ${formatCalendarDate(day)}` : ""}`;
}

const DATED_WITH_HOLDING = new Set<ValueBasis>(["statement", "advisor_entered", "manual"]);

export function valueProvenance(h: Holding): ValueProvenance {
  const used = resolveValuation(h);
  const review = REVIEW_LABEL[h.advisorVerification] ?? "Not yet reviewed";
  if (used.fromApprovedValue) {
    const kind = basisOfKind(used.source.kind);
    const from = kind === "legacy_market_data" ? "market data" : BASIS_LABEL[kind].toLowerCase();
    const detail = sourceDetail(used.source);
    return {
      basis: "approved",
      label: BASIS_LABEL.approved,
      detail: `From ${from}${detail ? `: ${detail}` : ""}`,
      // The approved value's own source date only: the holding's date may belong to a different value.
      date: calendarDay(used.source.asOf),
      approvedOn: calendarDay(h.proposalApprovedValue?.lockedAt),
      holdingSource: describeHoldingSource(h),
      review,
    };
  }
  if (used.fromMarketData) {
    return {
      basis: "legacy_market_data",
      label: BASIS_LABEL.legacy_market_data,
      detail: sourceDetail({ ...used.source, kind: "market_data" }),
      date: calendarDay(used.source.asOf),
      holdingSource: describeHoldingSource(h),
      review,
    };
  }
  const basis = basisOfKind(used.source.kind);
  return {
    basis,
    label: BASIS_LABEL[basis],
    detail: sourceDetail(used.source),
    // An override is dated when it was entered. A statement, advisor-entered or
    // manual value is written together with the holding's valuation date, so
    // that date is its own; a mock or legacy market-data label isn't, and
    // without a date of its own it has none.
    date: calendarDay(used.source.asOf ?? (DATED_WITH_HOLDING.has(basis) ? h.valuationDate : undefined)),
    review,
  };
}

export function provenanceCounts(holdings: Holding[]): Record<ValueBasis, number> {
  const out: Record<ValueBasis, number> = { approved: 0, override: 0, statement: 0, advisor_entered: 0, manual: 0, legacy_market_data: 0, mock: 0 };
  for (const h of holdings) out[valueProvenance(h).basis] += 1;
  return out;
}

export interface ValueDateSummary {
  earliest: string | null;
  latest: string | null;
  /** Values with no recorded date. */
  undated: number;
  /** More than one recorded date: totals add values from different dates. */
  mixed: boolean;
}

export function valueDateSummary(holdings: Holding[]): ValueDateSummary {
  const days = holdings.map((h) => valueProvenance(h).date);
  const dated = days.filter((d): d is string => !!d).sort();
  return {
    earliest: dated[0] ?? null,
    latest: dated[dated.length - 1] ?? null,
    undated: days.length - dated.length,
    mixed: new Set(dated).size > 1,
  };
}

/** The limitation to state when values aren't all from one recorded date; null when they are. */
export function describeValueDates(s: ValueDateSummary): string | null {
  const parts: string[] = [];
  if (s.mixed) {
    parts.push(
      `Values are recorded as of different dates (${formatCalendarDate(s.earliest!)} to ${formatCalendarDate(s.latest!)}). Totals add each value as recorded; they are not a valuation of the whole portfolio on a single date.`
    );
  }
  if (s.undated > 0) parts.push(`${s.undated} ${s.undated === 1 ? "value has" : "values have"} no recorded date.`);
  return parts.length ? parts.join(" ") : null;
}

const BASIS_ORDER: ValueBasis[] = ["statement", "advisor_entered", "manual", "override", "approved", "legacy_market_data", "mock"];
const BASIS_NOUN: Record<ValueBasis, [string, string]> = {
  approved: ["approved value", "approved values"],
  override: ["advisor override", "advisor overrides"],
  statement: ["statement value", "statement values"],
  advisor_entered: ["advisor-entered value", "advisor-entered values"],
  manual: ["manual valuation", "manual valuations"],
  legacy_market_data: ["recorded market-data value (legacy)", "recorded market-data values (legacy)"],
  mock: ["mock / placeholder value", "mock / placeholder values"],
};

/** "18 statement values and 7 manual valuations". */
export function describeBasisCounts(counts: Record<ValueBasis, number>): string {
  const parts = BASIS_ORDER.filter((b) => counts[b] > 0).map((b) => `${counts[b]} ${BASIS_NOUN[b][counts[b] === 1 ? 0 : 1]}`);
  return parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** Each basis in use, with how many values use it and the range of their recorded dates. */
export function basisBreakdown(holdings: Holding[]): { basis: ValueBasis; label: string; count: number; summary: ValueDateSummary }[] {
  return BASIS_ORDER.map((basis) => {
    const of = holdings.filter((h) => valueProvenance(h).basis === basis);
    return { basis, label: BASIS_LABEL[basis], count: of.length, summary: valueDateSummary(of) };
  }).filter((r) => r.count > 0);
}

/** "Apr 30, 2026", "Jan 31, 2026 to Apr 30, 2026", plus any values with no recorded date. */
export function describeDateRange(s: ValueDateSummary): string {
  const range = !s.earliest ? "" : s.earliest === s.latest ? formatCalendarDate(s.earliest) : `${formatCalendarDate(s.earliest)} to ${formatCalendarDate(s.latest!)}`;
  const none = s.undated > 0 ? `${s.undated} not recorded` : "";
  return [range, none].filter(Boolean).join("; ");
}
