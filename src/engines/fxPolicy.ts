import type { Account, CurrencyCode, FxConfirmation, FxRate, FxRefreshRecord, Holding, Recommendation } from "@/domain/types";
import { resolveFxRate, usableFxRate } from "./currencyEngine";
import { normalizeHoldings } from "./normalizationEngine";
import { applyRecommendationsToProposed } from "./proposalEngine";
import { hasMoneyAmounts } from "./recommendationAmounts";
import { resolveValuation } from "./valuationEngine";
import { STALE_FX_DAYS, fxAgeDays, utcDate } from "./fxAge";

// FX refresh, freshness and confirmation policy (issue #26)
// --------------------------------------------------------
// - A refresh merges into the stored rates by economic pair (EUR/USD and
//   USD/EUR are one pair). A returned rate replaces the pair in either
//   orientation; pairs the provider didn't return are kept with their own
//   date and source and labelled "not in last refresh"; advisor-entered
//   (Manual) rates are never replaced; a failed refresh changes nothing.
// - Freshness is computed from each rate's own date, in UTC calendar days,
//   against an injected clock. STALE_FX_DAYS is an initial product policy
//   chosen to exceed the ECB's longest publication gap around holidays; it is
//   not an institutional or regulatory standard.
// - Only rates actually used count: the legs that value a holding, convert an
//   approved recommendation's amount, or move cash in the proposal. Mock
//   (fallback) data is never current, whatever its date.
// - Stale or unverified rates in use need a refresh or an explicit
//   confirmation. A confirmation is bound to a fingerprint of every rate in
//   use (current legs too: a cross rate depends on both) and their uses, and
//   lapses FX_CONFIRMATION_DAYS after its confirmedAt. Unreadable, future or
//   inconsistent times make it invalid.

export { STALE_FX_DAYS, fxAgeDays, utcDate } from "./fxAge";
/** A confirmation of stale rates lapses exactly this many days (×24 hours) after it was given. */
export const FX_CONFIRMATION_DAYS = 7;
/** Requested on every refresh, in addition to the workspace's own currencies. */
export const DEFAULT_FX_QUOTES: CurrencyCode[] = ["EUR", "GBP", "CHF", "JPY", "CAD", "AUD", "SGD", "HKD", "MXN"];

const DAY = 86_400_000;

/** One key per economic pair, whichever orientation is stored: "EUR/USD". */
export const fxPairKey = (a: CurrencyCode, b: CurrencyCode) => [a, b].sort().join("/");


// ---------------------------------------------------------------------------
// Refresh
// ---------------------------------------------------------------------------

export type FxRefreshResponse =
  | { ok: true; provider: string; base: CurrencyCode; requested: CurrencyCode[]; rates: FxRate[] }
  | { ok: false; provider: string; base: CurrencyCode; requested: CurrencyCode[]; error: string };

export function mergeFxRefresh(existing: FxRate[], response: FxRefreshResponse, now: Date): { rates: FxRate[]; record: FxRefreshRecord } {
  const at = now.toISOString();
  const base = { at, provider: response.provider, requested: response.requested };
  if (!response.ok) {
    return { rates: existing, record: { ...base, ok: false, error: response.error, updated: [], retained: [], manualKept: [] } };
  }
  const returned = new Map<string, FxRate>();
  for (const r of response.rates) {
    if (r.base === r.quote || !usableFxRate(r)) continue;
    returned.set(fxPairKey(r.base, r.quote), r);
  }
  const manual = new Set(existing.filter((r) => r.source === "Manual").map((r) => fxPairKey(r.base, r.quote)));
  const updated = [...returned.keys()].filter((k) => !manual.has(k));
  const kept: FxRate[] = [];
  const retained = new Set<string>();
  for (const r of existing) {
    const key = fxPairKey(r.base, r.quote);
    if (r.source === "Manual" || r.base === r.quote) kept.push(r); // an identity rate needs no provider
    else if (updated.includes(key)) continue; // replaced, in either orientation
    else {
      kept.push({ ...r, notInLastRefresh: true });
      retained.add(key);
    }
  }
  const fresh = updated.map((k) => {
    const { notInLastRefresh: _drop, ...r } = returned.get(k)!;
    void _drop;
    return { ...r, refreshedAt: at };
  });
  return {
    rates: [...kept, ...fresh],
    record: { ...base, ok: true, updated: [...updated].sort(), retained: [...retained].sort(), manualKept: [...manual].sort() },
  };
}

// ---------------------------------------------------------------------------
// Currencies to request versus rates actually used
// ---------------------------------------------------------------------------

export interface FxWorkspace {
  holdings: Holding[];
  accounts: Account[];
  recommendations: Recommendation[];
  fxRates: FxRate[];
  reportingCurrency: CurrencyCode;
}

/** Every currency the workspace refers to: worth requesting, whether or not a calculation uses it now. */
export function currenciesToRequest(ws: Omit<FxWorkspace, "fxRates">): CurrencyCode[] {
  const out = new Set<CurrencyCode>([ws.reportingCurrency]);
  for (const h of ws.holdings) {
    out.add(h.currency);
    out.add(resolveValuation(h).currency);
  }
  for (const a of ws.accounts) out.add(a.baseCurrency);
  for (const r of ws.recommendations) if (r.status !== "excluded" && hasMoneyAmounts(r)) out.add(r.currency);
  return [...out].filter(Boolean).sort();
}

export interface FxUse {
  key: string;
  leg: FxRate;
  /** Why it's used: stable ids (for the fingerprint) and readable labels. */
  uses: { id: string; label: string }[];
}

/** The stored rates the proposal's calculations actually use, by pair. */
export function fxRatesInUse(ws: FxWorkspace): FxUse[] {
  const byKey = new Map<string, FxUse>();
  const add = (from: CurrencyCode, id: string, label: string) => {
    const r = resolveFxRate(ws.fxRates, from, ws.reportingCurrency);
    if (!r) return;
    for (const leg of r.legs) {
      const key = fxPairKey(leg.base, leg.quote);
      const u = byKey.get(key) ?? { key, leg, uses: [] };
      if (!u.uses.some((x) => x.id === id)) u.uses.push({ id, label });
      byKey.set(key, u);
    }
  };
  // Valuing current holdings (an approved value in its own currency).
  for (const h of ws.holdings) add(resolveValuation(h).currency, `holding:${h.id}`, `Holding: ${h.assetName}`);
  // Converting approved recommendations' money amounts.
  const approved = ws.recommendations.filter((r) => r.approvedByAdvisor);
  for (const r of approved) {
    if (hasMoneyAmounts(r) && r.currency !== ws.reportingCurrency) add(r.currency, `rec:${r.id}`, `Recommendation: ${r.title} (${r.currency} amount)`);
  }
  // Writing proposed values and cash offsets back in their own currencies.
  if (approved.length > 0) {
    const normalized = normalizeHoldings(ws.holdings, ws.fxRates, ws.reportingCurrency);
    const before = new Map(normalized.map((h) => [h.id, h] as const));
    const names = new Map(ws.accounts.map((a) => [a.id, a.name] as const));
    const proposed = applyRecommendationsToProposed(normalized, approved, ws.accounts, { reportingCurrency: ws.reportingCurrency, rates: ws.fxRates });
    for (const p of proposed.holdings) {
      const b = before.get(p.id);
      if (!b) add(p.currency, `cash:${p.accountId}`, `Proposed cash in ${names.get(p.accountId) ?? p.accountId}`);
      else if (b.nativeMarketValue !== p.nativeMarketValue) add(p.currency, `proposed:${p.id}`, `Proposed change: ${p.assetName}`);
    }
  }
  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
}

// ---------------------------------------------------------------------------
// Freshness and confirmation
// ---------------------------------------------------------------------------

export interface FxLegStatus {
  key: string;
  base: CurrencyCode;
  quote: CurrencyCode;
  rate: number;
  asOf: string;
  source: FxRate["source"];
  ageDays: number;
  /** Older than STALE_FX_DAYS. */
  stale: boolean;
  /** Mock/fallback data: never provider-verified, so never current. */
  unverified: boolean;
  manual: boolean;
  notInLastRefresh: boolean;
  uses: { id: string; label: string }[];
}

export function fxLegStatus(leg: FxRate, now: Date, uses: FxUse["uses"] = []): FxLegStatus {
  const ageDays = fxAgeDays(leg.asOf, now);
  return {
    key: fxPairKey(leg.base, leg.quote),
    base: leg.base,
    quote: leg.quote,
    rate: leg.rate,
    asOf: leg.asOf,
    source: leg.source,
    ageDays,
    stale: ageDays > STALE_FX_DAYS,
    unverified: leg.source === "Mock",
    manual: leg.source === "Manual",
    notInLastRefresh: !!leg.notInLastRefresh,
    uses,
  };
}

/** "invalid": the stored times are unreadable, in the future, or don't match the policy lifetime. */
export type FxConfirmationState = "none" | "valid" | "expired" | "changed" | "invalid";

/** How far ahead of this clock a confirmation time may be (another device's clock) and still count. */
export const CLOCK_SKEW_MS = 2 * 60_000;

export interface FxFreshness {
  policyDays: number;
  /** Every rate leg used by the calculations. */
  inUse: FxLegStatus[];
  /** Those that are stale or unverified. */
  attention: FxLegStatus[];
  /** Fingerprint of every rate in use and its uses; null when nothing needs attention. */
  fingerprint: string | null;
  /** `expiresAt` is the policy expiry, confirmedAt + FX_CONFIRMATION_DAYS (null when the record is unreadable). */
  confirmation: { state: FxConfirmationState; record: FxConfirmation | null; expiresAt: string | null };
  /** Nothing needs attention, or a valid confirmation covers exactly what does. */
  current: boolean;
}

// FNV-1a, twice with different offsets: a short, stable, deterministic id.
function fnv(s: string, seed: number): string {
  let h = seed >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

// The whole calculation the advisor confirmed: every leg in use (current ones
// too, since a cross rate's value depends on both legs) with its uses, and
// which legs needed confirming (so a leg turning stale later isn't covered).
function fingerprintOf(inUse: FxLegStatus[], reportingCurrency: CurrencyCode): string {
  const text = [
    reportingCurrency,
    ...inUse
      .map((l) => [l.key, l.base, l.quote, l.rate, l.asOf, l.source, l.stale || l.unverified ? "attention" : "current", l.uses.map((u) => u.id).sort().join(";")].join("|"))
      .sort(),
  ].join("\n");
  return fnv(text, 0x811c9dc5) + fnv(text, 0x01000193);
}

/** The policy expiry of a confirmation, or null when its times can't be trusted at `now`. */
function confirmationExpiry(record: FxConfirmation, now: Date): number | null {
  const confirmed = Date.parse(record.confirmedAt);
  const expires = Date.parse(record.expiresAt);
  if (!Number.isFinite(confirmed) || !Number.isFinite(expires)) return null;
  if (confirmed - now.getTime() > CLOCK_SKEW_MS) return null; // given in the future
  const policy = confirmed + FX_CONFIRMATION_DAYS * DAY;
  return expires === policy ? policy : null; // the lifetime runs from confirmedAt, whatever expiresAt says
}

export function fxFreshness(input: FxWorkspace & { now: Date; confirmation?: FxConfirmation | null }): FxFreshness {
  const inUse = fxRatesInUse(input).map((u) => fxLegStatus(u.leg, input.now, u.uses));
  const attention = inUse.filter((l) => l.stale || l.unverified);
  const fingerprint = attention.length > 0 ? fingerprintOf(inUse, input.reportingCurrency) : null;
  const record = input.confirmation ?? null;
  let state: FxConfirmationState = "none";
  let expiresAt: string | null = null;
  if (record && fingerprint) {
    const expiry = confirmationExpiry(record, input.now);
    if (expiry === null) state = "invalid";
    else {
      expiresAt = new Date(expiry).toISOString();
      if (record.fingerprint !== fingerprint || record.reportingCurrency !== input.reportingCurrency) state = "changed";
      else if (input.now.getTime() >= expiry) state = "expired";
      else state = "valid";
    }
  }
  return { policyDays: STALE_FX_DAYS, inUse, attention, fingerprint, confirmation: { state, record, expiresAt }, current: attention.length === 0 || state === "valid" };
}

/** The next instant freshness can change by time alone: the next UTC midnight, or an earlier future deadline. */
export function nextFxBoundary(nowMs: number, deadlines: number[]): number {
  const midnight = Math.floor(nowMs / DAY) * DAY + DAY;
  return Math.min(midnight, ...deadlines.filter((d) => Number.isFinite(d) && d > nowMs));
}

/** The advisor's confirmation of the stale or unverified rates in use now, or null when none need it. */
export function confirmStaleRates(input: FxWorkspace & { now: Date }): FxConfirmation | null {
  const f = fxFreshness(input);
  if (!f.fingerprint) return null;
  const oldest = f.attention.reduce((a, b) => (Date.parse(b.asOf) < Date.parse(a.asOf) ? b : a));
  return {
    confirmedAt: input.now.toISOString(),
    expiresAt: new Date(input.now.getTime() + FX_CONFIRMATION_DAYS * DAY).toISOString(),
    pairs: f.attention.map((l) => l.key),
    oldestRateDate: utcDate(oldest.asOf),
    fingerprint: f.fingerprint,
    reportingCurrency: input.reportingCurrency,
  };
}

const SOURCE_LABELS: Record<FxRate["source"], string> = {
  ECB: "ECB reference rates",
  Frankfurter: "ECB reference rates (via Frankfurter)",
  Manual: "advisor-entered (manual) rates",
  Mock: "unverified fallback (mock) rates",
};

/** The sources of the rates in use, as a phrase: "ECB reference rates and advisor-entered (manual) rates"; null when none are used. */
export function describeFxSources(inUse: FxLegStatus[]): string | null {
  const labels = (Object.keys(SOURCE_LABELS) as FxRate["source"][]).filter((s) => inUse.some((l) => l.source === s)).map((s) => SOURCE_LABELS[s]);
  if (labels.length === 0) return null;
  return labels.length === 1 ? labels[0] : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

/** "2026-10-29 12:00 UTC" */
export const utcMinute = (iso: string) => new Date(Date.parse(iso)).toISOString().slice(0, 16).replace("T", " ") + " UTC";

/** "EUR/USD 175 days old (2026-04-30, ECB)" */
export function describeLeg(l: FxLegStatus): string {
  if (l.unverified) return `${l.key} unverified ${l.source.toLowerCase()} data (${utcDate(l.asOf)})`;
  return `${l.key} ${l.ageDays} day${l.ageDays === 1 ? "" : "s"} old (${utcDate(l.asOf)}, ${l.source})`;
}

/** Readiness detail for "Exchange rates current". */
export function describeFreshness(f: FxFreshness): string | undefined {
  if (f.attention.length === 0) return undefined;
  const legs = f.attention.map(describeLeg).join("; ");
  const c = f.confirmation;
  if (c.state === "valid") return `Older or unverified rates confirmed until ${utcMinute(c.expiresAt!)}: ${legs}`;
  const why =
    c.state === "expired"
      ? `; confirmation expired ${utcMinute(c.expiresAt!)}`
      : c.state === "changed"
      ? "; the earlier confirmation no longer applies (rates or their use changed)"
      : c.state === "invalid"
      ? "; the stored confirmation isn't valid (its times are unreadable, in the future or inconsistent)"
      : "";
  return `${legs}${why}. Refresh in Market Data or confirm them (policy: ${f.policyDays} days).`;
}
