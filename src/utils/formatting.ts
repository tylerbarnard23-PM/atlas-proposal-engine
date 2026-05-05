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

export function formatDate(iso: string | undefined): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function formatDateTime(iso: string | undefined): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
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
