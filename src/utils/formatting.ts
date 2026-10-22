import { getCurrencyConfig } from "@/domain/currencyConfigs";

export function formatCurrency(
  amount: number | undefined | null,
  currency = "USD",
  opts: { compact?: boolean; signed?: boolean; minimumFractionDigits?: number } = {}
): string {
  if (amount == null || !Number.isFinite(amount)) return "—";
  const cfg = getCurrencyConfig(currency);
  const decimals = opts.minimumFractionDigits ?? cfg.decimals;
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: cfg.code,
    notation: opts.compact && Math.abs(amount) >= 10_000 ? "compact" : "standard",
    minimumFractionDigits: opts.compact ? 1 : decimals,
    maximumFractionDigits: opts.compact ? 2 : decimals,
    currencyDisplay: cfg.group === "custom" ? "code" : "narrowSymbol",
  });
  const out = formatter.format(amount);
  if (opts.signed && amount > 0) return "+" + out;
  return out;
}

export function formatNumber(
  n: number | undefined | null,
  opts: { decimals?: number; compact?: boolean; signed?: boolean } = {}
): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const decimals = opts.decimals ?? 2;
  const formatter = new Intl.NumberFormat("en-US", {
    notation: opts.compact && Math.abs(n) >= 10_000 ? "compact" : "standard",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  const out = formatter.format(n);
  if (opts.signed && n > 0) return "+" + out;
  return out;
}

export function formatPercent(
  pct: number | undefined | null,
  decimals = 1,
  opts: { signed?: boolean } = {}
): string {
  if (pct == null || !Number.isFinite(pct)) return "—";
  const formatter = new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  const out = formatter.format(pct / 100);
  if (opts.signed && pct > 0) return "+" + out;
  return out;
}

// Dates (issue #28). Two kinds, chosen by what a field means, never by the
// shape of its string:
// - Calendar dates name a day: valuation, statement and rate dates. They show
//   the same day in every time zone. Stored as "2026-04-30", or (older data)
//   as that day's UTC midnight, "2026-04-30T00:00:00Z"; either way the day is
//   the UTC calendar date of the stored value.
// - Timestamps are instants: uploads, approvals, generation, confirmations.
//   They show in the viewer's time zone, or in the one given.

/** The day a calendar-date field names, "2026-04-30"; null when it isn't a date. */
export function calendarDay(value: string | undefined): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    const t = new Date(Date.UTC(y, m - 1, d));
    return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? value : null;
  }
  const t = Date.parse(value);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
}

/** A calendar date for display, the same in every time zone: "Apr 30, 2026". */
export function formatCalendarDate(value: string | undefined, opts: { month?: "short" | "long"; locale?: string } = {}): string {
  if (!value) return "—";
  const day = calendarDay(value);
  if (!day) return value;
  return new Intl.DateTimeFormat(opts.locale ?? "en-US", { year: "numeric", month: opts.month ?? "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(`${day}T00:00:00Z`)
  );
}

/** The date of an instant in the viewer's (or the given) time zone: "Apr 29, 2026". */
export function formatTimestampDate(iso: string | undefined, opts: { timeZone?: string; month?: "short" | "long" | "numeric"; locale?: string } = {}): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  return new Intl.DateTimeFormat(opts.locale ?? "en-US", { year: "numeric", month: opts.month ?? "short", day: "numeric", timeZone: opts.timeZone }).format(t);
}

/** An instant with its time, in the viewer's (or the given) time zone. */
export function formatDateTime(iso: string | undefined, opts: { timeZone?: string } = {}): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: opts.timeZone }).format(t);
}

/** Today as a calendar day in the viewer's time zone, for date inputs: "2026-04-29". */
export function localCalendarDay(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Whether a time zone name is usable for display (e.g. "America/New_York"). */
export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || tz.length === 0 || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function daysBetween(a: string | Date, b: string | Date = new Date()): number {
  const da = typeof a === "string" ? new Date(a) : a;
  const db = typeof b === "string" ? new Date(b) : b;
  return Math.floor((db.getTime() - da.getTime()) / 86_400_000);
}

export function todayIso(): string {
  return new Date().toISOString();
}

export function safeId(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}
