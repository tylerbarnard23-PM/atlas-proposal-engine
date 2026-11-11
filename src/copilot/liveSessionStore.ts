import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { hash, randomToken, readJson, sameHash, saveJson as save, withLock } from "./localFiles.ts";

// The local live-testing session: the one allowance every live Copilot
// request draws on. The state is a small JSON file on this machine
// (git-ignored), so restarting the server, refreshing, cancelling or opening
// another tab never resets it. Every change happens under one lock (in this
// process and across processes) and is written atomically, so admission and
// spending reservations can't race. Only hashes, counters, timestamps and
// per-run summaries are stored: never prompts, answers, payloads or keys.
// A session starts in one of two ways: a paired browser starts it in Atlas
// after confirming its allowance (localConnect.ts), or the owner arms it from
// a terminal (scripts/live-session.mjs) and a browser claims it. Either way it
// names the provider it is for (Anthropic, paid; or the fake provider, no API
// calls) and the credential revision it was started under, and is usable only
// while the server runs that same provider with that same credential: a
// rehearsal can never turn into a paid session, and replacing the key ends
// the old session. Its allowance is fixed when it starts, at or below the
// ceilings here. Records from before these bindings (versions 1 and 2) are
// refused until a new session is started. This file imports Node built-ins
// only (through localFiles.ts), so that script can load it directly.

/** The ceilings of one session, and its default allowance. USD is an estimate-based guard, not a billing ceiling. */
export const LIVE_SESSION_LIMITS = { minutes: 30, runs: 3, requests: 10, usd: 5, activeRuns: 1 } as const;
/** One session's allowance: never above LIVE_SESSION_LIMITS. */
export interface Allowance {
  minutes: number;
  runs: number;
  requests: number;
  usd: number;
  activeRuns: 1;
}
export type AllowanceChoice = Pick<Allowance, "minutes" | "runs" | "requests" | "usd">;

/**
 * The allowance a session would start with: the ceilings, lowered by any valid
 * choice. Whole minutes, runs and requests of at least 1; a positive USD
 * figure. Anything above a ceiling, or not a number, is refused: a choice can
 * lower a limit and never raise it.
 */
export function allowanceFrom(choice: Partial<AllowanceChoice> | undefined | null): { ok: true; allowance: Allowance } | { ok: false; error: string } {
  const out: Allowance = { ...LIVE_SESSION_LIMITS };
  for (const key of ["minutes", "runs", "requests", "usd"] as const) {
    const v = choice?.[key];
    if (v === undefined) continue;
    const ceiling = LIVE_SESSION_LIMITS[key];
    if (typeof v !== "number" || !Number.isFinite(v) || v <= 0 || (key !== "usd" && !Number.isInteger(v))) return { ok: false, error: `The session's ${key} must be a ${key === "usd" ? "positive number" : "whole number of at least 1"}.` };
    if (v > ceiling) return { ok: false, error: `The session's ${key} can be lowered, not raised: ${v} is above the limit of ${ceiling}.` };
    out[key] = v;
  }
  return { ok: true, allowance: out };
}
/** A run still marked active after the 100-second run deadline plus this grace was abandoned (a crash or restart). */
export const STALE_RUN_MS = 100_000 + 30_000;
export const DEFAULT_SESSION_FILE = ".atlas-local/live-session.json";

/** The provider a session is armed for. It must match the server's configured provider on every use. */
export type SessionProvider = "anthropic" | "fake";
export const SESSION_PROVIDERS: readonly SessionProvider[] = ["anthropic", "fake"];
export const providerName = (p: SessionProvider) => (p === "anthropic" ? "Anthropic (paid)" : "the fake provider (no API calls)");
const isProvider = (p: unknown): p is SessionProvider => typeof p === "string" && (SESSION_PROVIDERS as readonly string[]).includes(p);

// Resolved at run time only; the ignore comment stops the bundler tracing the whole project into the server output.
export const sessionFilePath = (env: Record<string, string | undefined>) => resolve(/*turbopackIgnore: true*/ env.ATLAS_LIVE_SESSION_FILE || DEFAULT_SESSION_FILE);

export interface RunTally {
  id: string;
  startedAt: string;
  requests: number;
  attempts: number;
  usd: number;
  retainedUsd: number;
  models: string[];
}
export interface RunSummary extends RunTally {
  endedAt: string;
  status: string;
}
export interface Reservation {
  id: string;
  runId: string;
  usd: number;
  at: string;
}
export interface SessionState {
  version: 3;
  /** The provider this session was armed for. */
  provider: SessionProvider;
  /** The credential revision it was started under (null: no key in use, which only the fake provider allows). */
  credentialRevision: string | null;
  /** This session's allowance, fixed when it started. */
  limits: Allowance;
  id: string;
  armedAt: string;
  claimHash: string;
  cookieHash: string | null;
  stopped: { at: string; reason: string } | null;
  runs: number;
  /** HTTP requests sent to the provider, retries and failures included. */
  requests: number;
  /** Model attempts reported by the provider (a refusal fallback adds one within the same request). */
  attempts: number;
  /** List-price estimate of the usage the provider reported. */
  spentUsd: number;
  /** Reservations kept because a request's usage is unknown (an error, timeout or cancellation). */
  retainedUsd: number;
  largestInput: number;
  active: RunTally | null;
  pending: Reservation[];
  history: RunSummary[];
}

export type SessionErrorCode =
  | "no_session"
  | "invalid_session"
  | "unbound_session"
  | "provider_mismatch"
  | "credential_mismatch"
  | "bad_provider"
  | "bad_allowance"
  | "already_armed"
  | "bad_token"
  | "already_claimed"
  | "not_claimed"
  | "not_this_browser"
  | "expired"
  | "stopped"
  | "run_in_progress"
  | "exhausted"
  | "not_active_run";
export type Result<T> = ({ ok: true } & T) | { ok: false; code: SessionErrorCode; error: string };

const round = (n: number) => Math.round(n * 1e6) / 1e6;

export const expiresAt = (s: Pick<SessionState, "armedAt" | "limits">) => new Date(Date.parse(s.armedAt) + s.limits.minutes * 60_000);
export const committedUsd = (s: Pick<SessionState, "spentUsd" | "retainedUsd" | "pending">) => round(s.spentUsd + s.retainedUsd + s.pending.reduce((a, r) => a + r.usd, 0));

// --- File access ------------------------------------------------------------

const num = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0;
const str = (v: unknown) => typeof v === "string" && v.length > 0;
const isTally = (t: unknown): t is RunTally => {
  const r = t as RunTally;
  return !!r && str(r.id) && str(r.startedAt) && num(r.requests) && num(r.attempts) && num(r.usd) && num(r.retainedUsd) && Array.isArray(r.models) && r.models.every(str);
};

/** The session in the file, or null when it is missing or doesn't read as a valid session (which callers treat as closed). */
export function parseState(raw: unknown): SessionState | null {
  const s = raw as SessionState;
  if (!s || s.version !== 3 || !isProvider(s.provider) || !str(s.id) || !str(s.armedAt) || Number.isNaN(Date.parse(s.armedAt)) || !str(s.claimHash)) return null;
  if (!(s.credentialRevision === null || str(s.credentialRevision))) return null;
  // A stored allowance above a ceiling is never honoured.
  const limits = s.limits && typeof s.limits === "object" ? allowanceFrom({ minutes: s.limits.minutes, runs: s.limits.runs, requests: s.limits.requests, usd: s.limits.usd }) : null;
  if (!limits || !limits.ok || s.limits.activeRuns !== 1) return null;
  if (!(s.cookieHash === null || str(s.cookieHash))) return null;
  if (!(s.stopped === null || (s.stopped && str(s.stopped.at) && typeof s.stopped.reason === "string"))) return null;
  if (![s.runs, s.requests, s.attempts, s.spentUsd, s.retainedUsd, s.largestInput].every(num)) return null;
  if (!(s.active === null || isTally(s.active))) return null;
  if (!Array.isArray(s.pending) || !s.pending.every((p) => p && str(p.id) && str(p.runId) && num(p.usd) && str(p.at))) return null;
  if (!Array.isArray(s.history) || !s.history.every((h) => isTally(h) && str(h.endedAt) && typeof h.status === "string")) return null;
  return s;
}

type Loaded = { kind: "none" } | { kind: "invalid" } | { kind: "unbound" } | { kind: "ok"; state: SessionState };

function load(file: string): Loaded {
  const raw = readJson(file) as { version?: unknown } | null | undefined;
  if (raw === undefined) return { kind: "none" };
  if (raw === null) return { kind: "invalid" };
  // Armed before sessions were bound to a provider and a credential: never usable, whatever the server runs.
  if (raw && typeof raw === "object" && (raw.version === 1 || raw.version === 2)) return { kind: "unbound" };
  const state = parseState(raw);
  return state ? { kind: "ok", state } : { kind: "invalid" };
}

const HOW_TO_START = "Start a new session in Atlas (Connect Claude on the Copilot page), or arm a new session in a terminal: npm run live-session -- arm --provider anthropic (or fake).";
const UNBOUND_ERROR = `This live session was armed before sessions were bound to a provider and a key, so it can't be used. ${HOW_TO_START}`;

/** The refusal for a record that isn't a usable session, or null when it is one. */
function notUsable(l: Loaded): Extract<Result<object>, { ok: false }> | null {
  if (l.kind === "none") return { ok: false, code: "no_session", error: `No live session is armed. ${HOW_TO_START}` };
  if (l.kind === "unbound") return { ok: false, code: "unbound_session", error: UNBOUND_ERROR };
  if (l.kind === "invalid") return { ok: false, code: "invalid_session", error: `The live session record can't be read, so live requests are refused. ${HOW_TO_START}` };
  return null;
}

/** Refuses a session armed for another provider than the one the server runs now. */
function providerMismatch(s: SessionState, provider: SessionProvider): Extract<Result<object>, { ok: false }> | null {
  if (s.provider === provider) return null;
  return {
    ok: false,
    code: "provider_mismatch",
    error: `This live session was armed for ${providerName(s.provider)}, but the server is now configured for ${providerName(provider)}. It isn't carried over: stop it and start a new session for ${providerName(provider)}.`,
  };
}

/** Refuses a session started under another credential than the one in use now (the key was replaced, removed or reselected). */
function credentialMismatch(s: SessionState, credentialRevision: string | null): Extract<Result<object>, { ok: false }> | null {
  if (s.credentialRevision === credentialRevision) return null;
  return {
    ok: false,
    code: "credential_mismatch",
    error: "The API key connection changed after this session started, so the session can't be used. Its counters are kept. Stop it and start a new session to continue.",
  };
}

const runsUsedUp = (s: SessionState) => `The session's ${s.limits.runs} agent run${s.limits.runs === 1 ? " is" : "s are"} used up.`;

// --- Derived state ------------------------------------------------------------

/** Ends a run left active by a crashed or restarted server: its in-flight reservations are kept as spend. */
function reapStale(s: SessionState, now: Date): boolean {
  if (!s.active || now.getTime() - Date.parse(s.active.startedAt) <= STALE_RUN_MS) return false;
  endRun(s, now, s.active.id, "abandoned");
  return true;
}

function endRun(s: SessionState, now: Date, runId: string, status: string) {
  const mine = s.pending.filter((p) => p.runId === runId);
  const kept = mine.reduce((a, p) => a + p.usd, 0);
  s.pending = s.pending.filter((p) => p.runId !== runId);
  s.retainedUsd = round(s.retainedUsd + kept);
  if (s.active?.id === runId) {
    s.history.push({ ...s.active, retainedUsd: round(s.active.retainedUsd + kept), endedAt: now.toISOString(), status });
    s.active = null;
  }
}

/** Why no new run or request may start now, or null. `nextRequestUsd` is the worst case of the next request. */
function closedReason(s: SessionState, now: Date, nextRequestUsd: number): Extract<Result<object>, { ok: false }> | null {
  if (s.stopped) return { ok: false, code: "stopped", error: `The live session was stopped (${s.stopped.reason}).` };
  if (now >= expiresAt(s)) return { ok: false, code: "expired", error: `The live session expired at ${expiresAt(s).toISOString()}.` };
  if (s.requests >= s.limits.requests) return { ok: false, code: "exhausted", error: `The session's ${s.limits.requests} provider request${s.limits.requests === 1 ? " is" : "s are"} used up.` };
  if (committedUsd(s) + nextRequestUsd > s.limits.usd)
    return {
      ok: false,
      code: "exhausted",
      error: `The USD ${s.limits.usd} spending guard would be at risk: USD ${committedUsd(s).toFixed(4)} is spent or reserved, and the next request could cost up to USD ${nextRequestUsd.toFixed(4)} (an estimate).`,
    };
  return null;
}

export type SessionStatus = "unarmed" | "invalid" | "unbound" | "provider_mismatch" | "credential_mismatch" | "unclaimed" | "not_this_browser" | "active" | "expired" | "stopped" | "exhausted";

export interface SessionView {
  status: SessionStatus;
  message: string;
  /** The provider the session was armed for (null when there's no usable record). */
  provider: SessionProvider | null;
  id: string | null;
  armedAt: string | null;
  expiresAt: string | null;
  limits: Allowance;
  used: { runs: number; requests: number; attempts: number; spentUsd: number; retainedUsd: number; committedUsd: number };
  remaining: { runs: number; requests: number; usd: number };
  runInProgress: boolean;
  nextRequestUsd: number;
  history: Omit<RunSummary, "id">[];
}

const zeroUsed = { runs: 0, requests: 0, attempts: 0, spentUsd: 0, retainedUsd: 0, committedUsd: 0 };

/**
 * The session as a caller may see it: no hashes, tokens or cookies. `cookie`
 * is this browser's session cookie, if any; `provider` is the server's
 * configured provider, when known, so a session armed for another one shows as such.
 */
export function viewOf(loaded: Loaded, now: Date, cookie: string | null, nextRequestUsd = 0, provider?: SessionProvider, credentialRevision?: string | null): SessionView {
  const base = { nextRequestUsd: round(nextRequestUsd) };
  if (loaded.kind !== "ok")
    return {
      ...base,
      limits: { ...LIVE_SESSION_LIMITS },
      status: loaded.kind === "none" ? "unarmed" : loaded.kind === "unbound" ? "unbound" : "invalid",
      message: notUsable(loaded)!.error,
      provider: null,
      id: null,
      armedAt: null,
      expiresAt: null,
      used: zeroUsed,
      remaining: { runs: 0, requests: 0, usd: 0 },
      runInProgress: false,
      history: [],
    };
  const s = structuredClone(loaded.state);
  reapStale(s, now);
  const committed = committedUsd(s);
  const used = { runs: s.runs, requests: s.requests, attempts: s.attempts, spentUsd: round(s.spentUsd), retainedUsd: round(s.retainedUsd), committedUsd: committed };
  const remaining = {
    runs: Math.max(0, s.limits.runs - s.runs),
    requests: Math.max(0, s.limits.requests - s.requests),
    usd: round(Math.max(0, s.limits.usd - committed)),
  };
  const closedNow = closedReason(s, now, nextRequestUsd) ?? (s.runs >= s.limits.runs && !s.active ? ({ ok: false, code: "exhausted", error: runsUsedUp(s) } as const) : null);
  // Mid-run, an in-flight reservation makes the budget look spent; that is "in progress", not "exhausted".
  const closed = closedNow && s.active && closedNow.code === "exhausted" ? null : closedNow;
  let status: SessionStatus;
  let message: string;
  const mismatch = provider ? providerMismatch(s, provider) : null;
  // A stopped or expired session says so; a key change matters only while the session could otherwise be used.
  const changed = credentialRevision !== undefined && !closed ? credentialMismatch(s, credentialRevision) : null;
  if (mismatch) {
    status = "provider_mismatch";
    message = mismatch.error;
  } else if (changed) {
    status = "credential_mismatch";
    message = changed.error;
  } else if (closed) {
    status = closed.code === "stopped" ? "stopped" : closed.code === "expired" ? "expired" : "exhausted";
    message = closed.error;
  } else if (!s.cookieHash) {
    status = "unclaimed";
    message = "A session was armed in a terminal but no browser has claimed it. Open the claim link printed when it was armed.";
  } else if (!cookie || !sameHash(hash(cookie), s.cookieHash)) {
    status = "not_this_browser";
    message = "This session was claimed by another browser (or this browser's session cookie is missing).";
  } else {
    status = "active";
    message = s.active ? "A run is in progress." : "Ready: live requests will use this session's allowance.";
  }
  return { ...base, limits: s.limits, status, message, provider: s.provider, id: s.id, armedAt: s.armedAt, expiresAt: expiresAt(s).toISOString(), used, remaining, runInProgress: !!s.active, history: s.history.map(({ id: _id, ...h }) => h) };
}

// --- Operations ---------------------------------------------------------------

export async function readView(file: string, now: Date, cookie: string | null, nextRequestUsd = 0, provider?: SessionProvider, credentialRevision?: string | null): Promise<SessionView> {
  return withLock(file, () => viewOf(load(file), now, cookie, nextRequestUsd, provider, credentialRevision), true);
}

export interface ArmOptions {
  /** A lower allowance than the ceilings; omitted limits stay at the ceiling. */
  allowance?: Partial<AllowanceChoice> | null;
  /** The credential revision in use now (null: none, which only the fake provider allows). */
  credentialRevision?: string | null;
  /** Started in Atlas by a paired browser: claim it for that browser in the same step, returning its session cookie. */
  claim?: boolean;
}

/**
 * Starts a new session for one provider, named explicitly, under the
 * credential in use now. Refused while one is armed and still usable: stop it
 * first, so counters are never reset silently. An older or unreadable record
 * is replaced. Returns the one-time claim token (terminal arming), or with
 * `claim` the session cookie of the browser that started it.
 */
export async function armSession(file: string, now: Date, provider: SessionProvider, opts: ArmOptions = {}): Promise<Result<{ token: string; cookie: string | null; state: SessionState }>> {
  if (!isProvider(provider)) return { ok: false, code: "bad_provider", error: `Name the provider to arm for: --provider ${SESSION_PROVIDERS.join(" or --provider ")}.` };
  const limits = allowanceFrom(opts.allowance);
  if (!limits.ok) return { ok: false, code: "bad_allowance", error: limits.error };
  return withLock(file, () => {
    const prev = load(file);
    if (prev.kind === "ok") {
      const s = prev.state;
      reapStale(s, now);
      if (!s.stopped && now < expiresAt(s) && (s.active || s.runs < s.limits.runs))
        return { ok: false, code: "already_armed", error: `A live session is armed until ${expiresAt(s).toISOString()}. Stop it first (Stop live session in Atlas, or npm run live-session -- stop).` } as const;
    }
    const token = randomToken();
    const cookie = opts.claim ? randomToken() : null;
    const state: SessionState = {
      version: 3,
      provider,
      credentialRevision: opts.credentialRevision ?? null,
      limits: limits.allowance,
      id: randomUUID(),
      armedAt: now.toISOString(),
      claimHash: hash(token),
      cookieHash: cookie ? hash(cookie) : null,
      stopped: null,
      runs: 0,
      requests: 0,
      attempts: 0,
      spentUsd: 0,
      retainedUsd: 0,
      largestInput: 20_000,
      active: null,
      pending: [],
      history: [],
    };
    save(file, state);
    return { ok: true, token, cookie, state };
  });
}

/** Binds the armed session to one browser: the one-time claim token becomes a session cookie (only its hash is kept). */
export async function claimSession(file: string, now: Date, token: string, provider: SessionProvider): Promise<Result<{ cookie: string; expiresAt: Date }>> {
  return withLock(file, () => {
    const l = load(file);
    const unusable = notUsable(l);
    if (unusable || l.kind !== "ok") return unusable!;
    const s = l.state;
    const mismatch = providerMismatch(s, provider);
    if (mismatch) return mismatch;
    if (s.stopped) return { ok: false, code: "stopped", error: "This live session was stopped." } as const;
    if (now >= expiresAt(s)) return { ok: false, code: "expired", error: "This live session has expired." } as const;
    if (s.cookieHash) return { ok: false, code: "already_claimed", error: "This live session has already been claimed." } as const;
    if (!token || !sameHash(hash(token), s.claimHash)) return { ok: false, code: "bad_token", error: "The claim link isn't valid for the armed session." } as const;
    const cookie = randomToken();
    s.cookieHash = hash(cookie);
    save(file, s);
    return { ok: true, cookie, expiresAt: expiresAt(s) };
  });
}

/** Stops the session for good. In-flight reservations stay counted until they settle. */
export async function stopSession(file: string, now: Date, reason: string): Promise<Result<{ state: SessionState }>> {
  return withLock(file, () => {
    const l = load(file);
    const unusable = notUsable(l);
    if (unusable || l.kind !== "ok") return unusable!;
    const s = l.state;
    if (!s.stopped) s.stopped = { at: now.toISOString(), reason: reason.slice(0, 120) };
    save(file, s);
    return { ok: true, state: s };
  });
}

/** Admits one run: this browser's claimed, unexpired, unstopped session, with no run active and allowance left. Counts the run. */
export async function admitRun(file: string, now: Date, cookie: string | null, nextRequestUsd: number, provider: SessionProvider, credentialRevision: string | null = null): Promise<Result<{ runId: string; view: SessionView }>> {
  return withLock(file, () => {
    const l = load(file);
    const unusable = notUsable(l);
    if (unusable || l.kind !== "ok") return unusable!;
    const s = l.state;
    // Before anything else: a session armed for another provider is never used, nor counted against.
    // A session stopped because the key changed says it was stopped (with the reason), not merely that the key differs.
    const mismatch = providerMismatch(s, provider) ?? (s.stopped ? null : credentialMismatch(s, credentialRevision));
    if (mismatch) return mismatch;
    const reaped = reapStale(s, now);
    const closedNow = closedReason(s, now, nextRequestUsd);
    // A run in flight holds a reservation, so "exhausted" would mislead: say it's in progress (stopped and expired still win).
    const closed = closedNow && s.active && closedNow.code === "exhausted" ? ({ ok: false, code: "run_in_progress", error: "A live run is already in progress; only one runs at a time." } as const) : closedNow;
    if (closed) {
      if (reaped) save(file, s);
      return closed;
    }
    if (!s.cookieHash) return { ok: false, code: "not_claimed", error: "The armed session hasn't been claimed by a browser yet." } as const;
    if (!cookie || !sameHash(hash(cookie), s.cookieHash)) return { ok: false, code: "not_this_browser", error: "This browser doesn't hold the live session." } as const;
    if (s.active) {
      if (reaped) save(file, s);
      return { ok: false, code: "run_in_progress", error: "A live run is already in progress; only one runs at a time." } as const;
    }
    if (s.runs >= s.limits.runs) return { ok: false, code: "exhausted", error: runsUsedUp(s) } as const;
    const runId = randomUUID();
    s.runs += 1;
    s.active = { id: runId, startedAt: now.toISOString(), requests: 0, attempts: 0, usd: 0, retainedUsd: 0, models: [] };
    save(file, s);
    return { ok: true, runId, view: viewOf({ kind: "ok", state: s }, now, cookie, nextRequestUsd, provider, credentialRevision) };
  });
}

/**
 * Reserves one provider request for the active run, atomically: it counts the
 * request and holds `price(largestInputSoFar)` USD until the request settles.
 * Refused when the run isn't the active one, or the session is stopped,
 * expired or out of requests or budget.
 */
export async function reserveRequest(
  file: string,
  now: Date,
  runId: string,
  provider: SessionProvider,
  price: (largestInput: number) => number,
  credentialRevision: string | null = null
): Promise<Result<{ reservationId: string; usd: number }>> {
  return withLock(file, () => {
    const l = load(file);
    const unusable = notUsable(l);
    if (unusable || l.kind !== "ok") return unusable!;
    const s = l.state;
    const mismatch = providerMismatch(s, provider) ?? (s.stopped ? null : credentialMismatch(s, credentialRevision));
    if (mismatch) return mismatch;
    if (s.active?.id !== runId) return { ok: false, code: "not_active_run", error: "This run is no longer the session's active run." } as const;
    const usd = round(price(s.largestInput));
    const closed = closedReason(s, now, usd);
    if (closed) return closed;
    const reservationId = randomUUID();
    s.requests += 1;
    s.active.requests += 1;
    s.pending.push({ id: reservationId, runId, usd, at: now.toISOString() });
    save(file, s);
    return { ok: true, reservationId, usd };
  });
}

/** Settles a reservation: with known usage it is replaced by the priced usage; otherwise the reservation is kept as spend. */
export async function settleRequest(
  file: string,
  reservationId: string,
  outcome: { known: true; usd: number; attempts: number; largestInput: number; models: string[] } | { known: false }
): Promise<void> {
  await withLock(file, () => {
    const l = load(file);
    if (l.kind !== "ok") return;
    const s = l.state;
    const r = s.pending.find((p) => p.id === reservationId);
    if (!r) return;
    s.pending = s.pending.filter((p) => p.id !== reservationId);
    const run = s.active?.id === r.runId ? s.active : null;
    if (outcome.known) {
      s.spentUsd = round(s.spentUsd + outcome.usd);
      s.attempts += outcome.attempts;
      s.largestInput = Math.max(s.largestInput, outcome.largestInput);
      if (run) {
        run.usd = round(run.usd + outcome.usd);
        run.attempts += outcome.attempts;
        run.models = [...new Set([...run.models, ...outcome.models])];
      }
    } else {
      s.retainedUsd = round(s.retainedUsd + r.usd);
      if (run) run.retainedUsd = round(run.retainedUsd + r.usd);
    }
    save(file, s);
  });
}

/** Ends the run: any reservation still open is kept as spend, and a summary is recorded. Returns the run's tally. */
export async function finishRun(file: string, now: Date, runId: string, status: string): Promise<RunSummary | null> {
  return withLock(file, () => {
    const l = load(file);
    if (l.kind !== "ok") return null;
    const s = l.state;
    if (s.active?.id !== runId) return s.history.find((h) => h.id === runId) ?? null;
    endRun(s, now, runId, status);
    save(file, s);
    return s.history[s.history.length - 1];
  });
}
