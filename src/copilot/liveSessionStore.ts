import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

// The local live-testing session: the one allowance every live Copilot
// request draws on. The state is a small JSON file on this machine
// (git-ignored), so restarting the server, refreshing, cancelling or opening
// another tab never resets it. Every change happens under one lock (in this
// process and across processes) and is written atomically, so admission and
// spending reservations can't race. Only hashes, counters, timestamps and
// per-run summaries are stored: never prompts, answers, payloads or keys.
// The owner arms a session from a terminal (scripts/live-session.mjs), which
// is the only way to create one. This file imports Node built-ins only, so
// that script can load it directly.

/** Fixed limits of one session. USD is an estimate-based guard, not a billing ceiling. */
export const LIVE_SESSION_LIMITS = { minutes: 30, runs: 3, requests: 10, usd: 5, activeRuns: 1 } as const;
/** A run still marked active after the 100-second run deadline plus this grace was abandoned (a crash or restart). */
export const STALE_RUN_MS = 100_000 + 30_000;
export const DEFAULT_SESSION_FILE = ".atlas-local/live-session.json";

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
  version: 1;
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

export type SessionErrorCode = "no_session" | "invalid_session" | "already_armed" | "bad_token" | "already_claimed" | "not_claimed" | "not_this_browser" | "expired" | "stopped" | "run_in_progress" | "exhausted" | "not_active_run";
export type Result<T> = ({ ok: true } & T) | { ok: false; code: SessionErrorCode; error: string };

const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const sameHash = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const round = (n: number) => Math.round(n * 1e6) / 1e6;

export const expiresAt = (s: Pick<SessionState, "armedAt">) => new Date(Date.parse(s.armedAt) + LIVE_SESSION_LIMITS.minutes * 60_000);
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
  if (!s || s.version !== 1 || !str(s.id) || !str(s.armedAt) || Number.isNaN(Date.parse(s.armedAt)) || !str(s.claimHash)) return null;
  if (!(s.cookieHash === null || str(s.cookieHash))) return null;
  if (!(s.stopped === null || (s.stopped && str(s.stopped.at) && typeof s.stopped.reason === "string"))) return null;
  if (![s.runs, s.requests, s.attempts, s.spentUsd, s.retainedUsd, s.largestInput].every(num)) return null;
  if (!(s.active === null || isTally(s.active))) return null;
  if (!Array.isArray(s.pending) || !s.pending.every((p) => p && str(p.id) && str(p.runId) && num(p.usd) && str(p.at))) return null;
  if (!Array.isArray(s.history) || !s.history.every((h) => isTally(h) && str(h.endedAt) && typeof h.status === "string")) return null;
  return s;
}

type Loaded = { kind: "none" } | { kind: "invalid" } | { kind: "ok"; state: SessionState };

function load(file: string): Loaded {
  if (!existsSync(file)) return { kind: "none" };
  try {
    const state = parseState(JSON.parse(readFileSync(file, "utf8")));
    return state ? { kind: "ok", state } : { kind: "invalid" };
  } catch {
    return { kind: "invalid" };
  }
}

function save(file: string, state: SessionState) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2), { encoding: "utf8", mode: 0o600 });
  for (let i = 0; ; i++) {
    try {
      renameSync(tmp, file);
      return;
    } catch (err) {
      // Windows can briefly refuse to replace a file another process has open.
      if (i >= 20) {
        rmSync(tmp, { force: true });
        throw err;
      }
      const until = Date.now() + 10;
      while (Date.now() < until) {
        /* brief spin before retrying the rename */
      }
    }
  }
}

// One queue per process (shared by every route bundle through globalThis),
// plus an exclusive lock file for other processes such as the arming script.
const g = globalThis as typeof globalThis & { __atlasLiveSessionQueue?: Promise<unknown> };

async function withLock<T>(file: string, fn: () => T): Promise<T> {
  const prior = g.__atlasLiveSessionQueue ?? Promise.resolve();
  const run = prior.then(() => crossProcess(file, fn));
  g.__atlasLiveSessionQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function crossProcess<T>(file: string, fn: () => T): Promise<T> {
  mkdirSync(dirname(file), { recursive: true });
  const lock = `${file}.lock`;
  const deadline = Date.now() + 5_000;
  let fd: number | null = null;
  while (fd === null) {
    try {
      fd = openSync(lock, "wx");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      try {
        // A lock left by a crashed process: every holder finishes in milliseconds.
        if (Date.now() - statSync(lock).mtimeMs > 10_000) rmSync(lock, { force: true });
      } catch {
        /* the lock was released meanwhile */
      }
      if (Date.now() > deadline) throw new Error("The live session record is busy.");
      await new Promise((r) => setTimeout(r, 15));
    }
  }
  try {
    return fn();
  } finally {
    closeSync(fd);
    rmSync(lock, { force: true });
  }
}

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
  if (s.requests >= LIVE_SESSION_LIMITS.requests) return { ok: false, code: "exhausted", error: `The session's ${LIVE_SESSION_LIMITS.requests} provider requests are used up.` };
  if (committedUsd(s) + nextRequestUsd > LIVE_SESSION_LIMITS.usd)
    return {
      ok: false,
      code: "exhausted",
      error: `The USD ${LIVE_SESSION_LIMITS.usd} spending guard would be at risk: USD ${committedUsd(s).toFixed(4)} is spent or reserved, and the next request could cost up to USD ${nextRequestUsd.toFixed(4)} (an estimate).`,
    };
  return null;
}

export type SessionStatus = "unarmed" | "invalid" | "unclaimed" | "not_this_browser" | "active" | "expired" | "stopped" | "exhausted";

export interface SessionView {
  status: SessionStatus;
  message: string;
  id: string | null;
  armedAt: string | null;
  expiresAt: string | null;
  limits: typeof LIVE_SESSION_LIMITS;
  used: { runs: number; requests: number; attempts: number; spentUsd: number; retainedUsd: number; committedUsd: number };
  remaining: { runs: number; requests: number; usd: number };
  runInProgress: boolean;
  nextRequestUsd: number;
  history: Omit<RunSummary, "id">[];
}

const zeroUsed = { runs: 0, requests: 0, attempts: 0, spentUsd: 0, retainedUsd: 0, committedUsd: 0 };

/** The session as a caller may see it: no hashes, tokens or cookies. `cookie` is this browser's session cookie, if any. */
export function viewOf(loaded: Loaded, now: Date, cookie: string | null, nextRequestUsd = 0): SessionView {
  const base = { limits: LIVE_SESSION_LIMITS, nextRequestUsd: round(nextRequestUsd) };
  if (loaded.kind !== "ok")
    return {
      ...base,
      status: loaded.kind === "none" ? "unarmed" : "invalid",
      message:
        loaded.kind === "none"
          ? "No live test session is armed. The owner arms one in a local terminal: npm run live-session -- arm."
          : "The live session record can't be read, so live requests are refused. Arm a new session from the terminal.",
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
    runs: Math.max(0, LIVE_SESSION_LIMITS.runs - s.runs),
    requests: Math.max(0, LIVE_SESSION_LIMITS.requests - s.requests),
    usd: round(Math.max(0, LIVE_SESSION_LIMITS.usd - committed)),
  };
  const closedNow = closedReason(s, now, nextRequestUsd) ?? (s.runs >= LIVE_SESSION_LIMITS.runs && !s.active ? ({ ok: false, code: "exhausted", error: `The session's ${LIVE_SESSION_LIMITS.runs} agent runs are used up.` } as const) : null);
  // Mid-run, an in-flight reservation makes the budget look spent; that is "in progress", not "exhausted".
  const closed = closedNow && s.active && closedNow.code === "exhausted" ? null : closedNow;
  let status: SessionStatus;
  let message: string;
  if (closed) {
    status = closed.code === "stopped" ? "stopped" : closed.code === "expired" ? "expired" : "exhausted";
    message = closed.error;
  } else if (!s.cookieHash) {
    status = "unclaimed";
    message = "A session is armed but no browser has claimed it. Open the claim link printed in the terminal when it was armed.";
  } else if (!cookie || !sameHash(hash(cookie), s.cookieHash)) {
    status = "not_this_browser";
    message = "This session was claimed by another browser (or this browser's session cookie is missing).";
  } else {
    status = "active";
    message = s.active ? "A run is in progress." : "Ready: live requests will use this session's allowance.";
  }
  return { ...base, status, message, id: s.id, armedAt: s.armedAt, expiresAt: expiresAt(s).toISOString(), used, remaining, runInProgress: !!s.active, history: s.history.map(({ id: _id, ...h }) => h) };
}

// --- Operations ---------------------------------------------------------------

export async function readView(file: string, now: Date, cookie: string | null, nextRequestUsd = 0): Promise<SessionView> {
  return withLock(file, () => viewOf(load(file), now, cookie, nextRequestUsd));
}

/** Arms a new session. Refused while one is armed and still usable: stop it first. Returns the one-time claim token. */
export async function armSession(file: string, now: Date): Promise<Result<{ token: string; state: SessionState }>> {
  return withLock(file, () => {
    const prev = load(file);
    if (prev.kind === "ok") {
      const s = prev.state;
      reapStale(s, now);
      if (!s.stopped && now < expiresAt(s) && (s.active || s.runs < LIVE_SESSION_LIMITS.runs))
        return { ok: false, code: "already_armed", error: `A live session is armed until ${expiresAt(s).toISOString()}. Stop it first (npm run live-session -- stop).` } as const;
    }
    const token = randomBytes(32).toString("base64url");
    const state: SessionState = {
      version: 1,
      id: randomUUID(),
      armedAt: now.toISOString(),
      claimHash: hash(token),
      cookieHash: null,
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
    return { ok: true, token, state };
  });
}

/** Binds the armed session to one browser: the one-time claim token becomes a session cookie (only its hash is kept). */
export async function claimSession(file: string, now: Date, token: string): Promise<Result<{ cookie: string; expiresAt: Date }>> {
  return withLock(file, () => {
    const l = load(file);
    if (l.kind === "none") return { ok: false, code: "no_session", error: "No live session is armed." } as const;
    if (l.kind === "invalid") return { ok: false, code: "invalid_session", error: "The live session record can't be read." } as const;
    const s = l.state;
    if (s.stopped) return { ok: false, code: "stopped", error: "This live session was stopped." } as const;
    if (now >= expiresAt(s)) return { ok: false, code: "expired", error: "This live session has expired." } as const;
    if (s.cookieHash) return { ok: false, code: "already_claimed", error: "This live session has already been claimed." } as const;
    if (!token || !sameHash(hash(token), s.claimHash)) return { ok: false, code: "bad_token", error: "The claim link isn't valid for the armed session." } as const;
    const cookie = randomBytes(32).toString("base64url");
    s.cookieHash = hash(cookie);
    save(file, s);
    return { ok: true, cookie, expiresAt: expiresAt(s) };
  });
}

/** Stops the session for good. In-flight reservations stay counted until they settle. */
export async function stopSession(file: string, now: Date, reason: string): Promise<Result<{ state: SessionState }>> {
  return withLock(file, () => {
    const l = load(file);
    if (l.kind === "none") return { ok: false, code: "no_session", error: "No live session is armed." } as const;
    if (l.kind === "invalid") return { ok: false, code: "invalid_session", error: "The live session record can't be read." } as const;
    const s = l.state;
    if (!s.stopped) s.stopped = { at: now.toISOString(), reason: reason.slice(0, 120) };
    save(file, s);
    return { ok: true, state: s };
  });
}

/** Admits one run: this browser's claimed, unexpired, unstopped session, with no run active and allowance left. Counts the run. */
export async function admitRun(file: string, now: Date, cookie: string | null, nextRequestUsd: number): Promise<Result<{ runId: string; view: SessionView }>> {
  return withLock(file, () => {
    const l = load(file);
    if (l.kind === "none") return { ok: false, code: "no_session", error: "No live test session is armed. The owner arms one in a local terminal: npm run live-session -- arm." } as const;
    if (l.kind === "invalid") return { ok: false, code: "invalid_session", error: "The live session record can't be read, so live requests are refused." } as const;
    const s = l.state;
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
    if (s.runs >= LIVE_SESSION_LIMITS.runs) return { ok: false, code: "exhausted", error: `The session's ${LIVE_SESSION_LIMITS.runs} agent runs are used up.` } as const;
    const runId = randomUUID();
    s.runs += 1;
    s.active = { id: runId, startedAt: now.toISOString(), requests: 0, attempts: 0, usd: 0, retainedUsd: 0, models: [] };
    save(file, s);
    return { ok: true, runId, view: viewOf({ kind: "ok", state: s }, now, cookie, nextRequestUsd) };
  });
}

/**
 * Reserves one provider request for the active run, atomically: it counts the
 * request and holds `price(largestInputSoFar)` USD until the request settles.
 * Refused when the run isn't the active one, or the session is stopped,
 * expired or out of requests or budget.
 */
export async function reserveRequest(file: string, now: Date, runId: string, price: (largestInput: number) => number): Promise<Result<{ reservationId: string; usd: number }>> {
  return withLock(file, () => {
    const l = load(file);
    if (l.kind !== "ok") return { ok: false, code: l.kind === "none" ? "no_session" : "invalid_session", error: "The live session is no longer available." } as const;
    const s = l.state;
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
