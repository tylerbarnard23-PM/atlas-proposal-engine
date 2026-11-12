import Anthropic from "@anthropic-ai/sdk";
import { COPILOT_MODEL, type MessagesClient } from "./agent";
import { pricedUsage, worstRequestCost } from "./eval/budget";
import { TEST_PROVIDER_MODEL, createTestProvider } from "./testProvider";
import * as store from "./liveSessionStore";
import type { SecretStore } from "./credentialStore";
import { instanceId } from "./localFiles";
import { normalizeKey } from "./localConnection";
import { fingerprintOf, keychainAccount, markOutcome, readConnection, type ConnectionState, type CredentialSource } from "./localConnection";

// The gate every live Copilot request passes before any provider call.
//
// Live mode (COPILOT_MODE=live) is local use only. It fails closed unless:
//   1. the server is set up for it: not a public deployment (VERCEL) and no
//      ANTHROPIC_BASE_URL override;
//   2. the request is local: a loopback or *.localhost Host, a same-origin
//      Origin on writes, no cross-site fetch, and no non-loopback forwarding;
//   3. a key is connected (localConnect.ts) and can be read from where the
//      user chose to keep it, unless the fake provider is chosen. The key is
//      read only here, for an admitted run, and is never logged or returned;
//   4. a session exists for the provider the server runs now and the
//      credential revision in use now (a session for the fake provider never
//      admits a paid request, nor the reverse, and replacing the key ends the
//      old session), this browser holds it (an HttpOnly cookie), and it is
//      unexpired, unstopped and has allowance left: at most 30 minutes, 3
//      runs, 10 HTTP requests, one run at a time, a USD 5 estimate-based guard.
// Each provider request is then reserved atomically against the session:
// counted (retries and failures included) and priced at its worst case with
// the evaluation's own estimate, then settled to the priced usage only when
// that accounting is complete (pricedUsage); otherwise, and on any error,
// timeout or cancellation, the reservation is kept as spend and the run ends. The USD figure is a guard on an
// estimate, not a billing ceiling.
//
// COPILOT_LIVE_PROVIDER=fake runs the same gate with the deterministic test
// provider in place of Anthropic: no key, no provider call, no spend. It
// exists to check the controls themselves.

/** The base name; the cookie itself is scoped to this installation (see instanceId). */
export const LIVE_COOKIE = "atlas_live_session";
/** This instance's session cookie name, so two Atlas instances on one host don't overwrite each other's. */
export const liveCookieName = (env: Env) => `${LIVE_COOKIE}_${instanceId(env)}`;
const INPUT_HEADROOM = 30_000;

export type LiveProvider = "anthropic" | "fake";
type Env = Record<string, string | undefined>;

/**
 * Whether this server may run the live mode at all, and with which provider.
 * A key isn't part of this: it is connected in Atlas (or selected from the
 * environment) and checked when a session starts and a run is admitted.
 */
export function liveReadiness(env: Env): { ok: true; provider: LiveProvider } | { ok: false; reasons: string[] } {
  const reasons: string[] = [];
  if (env.COPILOT_MODE !== "live") reasons.push("COPILOT_MODE isn't live.");
  if (env.VERCEL || env.VERCEL_ENV) reasons.push("Live mode is local only; this looks like a hosted deployment.");
  if (env.ANTHROPIC_BASE_URL) reasons.push("ANTHROPIC_BASE_URL is set; live mode only calls the default Anthropic endpoint.");
  const provider = env.COPILOT_LIVE_PROVIDER ?? "anthropic";
  if (provider !== "anthropic" && provider !== "fake") reasons.push(`COPILOT_LIVE_PROVIDER must be "anthropic" or "fake".`);
  return reasons.length ? { ok: false, reasons } : { ok: true, provider: provider as LiveProvider };
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const localHostname = (h: string) => LOOPBACK_HOSTS.has(h) || h.endsWith(".localhost");
const loopbackAddress = (a: string) => /^127\./.test(a) || a === "::1" || a === "[::1]" || /^::ffff:127\./.test(a);

function hostnameOf(hostHeader: string): string | null {
  try {
    return new URL(`http://${hostHeader}`).hostname;
  } catch {
    return null;
  }
}

/**
 * Why this request isn't a local, same-origin one, or null. "write" needs a
 * same-origin Origin header; "navigate" is a link opened from outside the app
 * (the claim link); "read" is a same-origin fetch.
 */
export function localRequestProblem(req: Request, kind: "read" | "write" | "navigate"): string | null {
  const host = req.headers.get("host") ?? "";
  const hostname = hostnameOf(host);
  if (!hostname || !localHostname(hostname)) return "Live testing only answers on this machine (localhost).";
  const forwardedHost = req.headers.get("x-forwarded-host");
  if (forwardedHost && !localHostname(hostnameOf(forwardedHost.split(",")[0].trim()) ?? "")) return "Live testing doesn't accept forwarded requests from another host.";
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor && !forwardedFor.split(",").every((a) => loopbackAddress(a.trim()))) return "Live testing only accepts requests from this machine.";
  const site = req.headers.get("sec-fetch-site");
  if (site && !(site === "same-origin" || (kind !== "write" && site === "none"))) return "Live testing refuses cross-site requests.";
  const origin = req.headers.get("origin");
  if (kind === "write" && !origin) return "Live testing needs a same-origin request.";
  if (origin) {
    let o: URL;
    try {
      o = new URL(origin);
    } catch {
      return "Live testing needs a same-origin request.";
    }
    if (o.host !== host || !localHostname(o.hostname)) return "Live testing refuses requests from another origin.";
  }
  return null;
}

export function cookieOf(req: Request, name: string): string | null {
  const raw = req.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) {
      try {
        return decodeURIComponent(v.join("="));
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function sessionCookie(env: Env, value: string, expires: Date): string {
  return `${liveCookieName(env)}=${encodeURIComponent(value)}; Path=/api/copilot; HttpOnly; SameSite=Strict; Expires=${expires.toUTCString()}`;
}

/** Removes this browser's session cookie (sent with Stop). */
export const clearedSessionCookie = (env: Env) => `${liveCookieName(env)}=; Path=/api/copilot; HttpOnly; SameSite=Strict; Max-Age=0`;

/** The worst case the session reserves for one request (the evaluation's estimate, priced for the configured model). */
export const worstNextRequest = (largestInput: number, maxTokens: number, fallbacks: boolean) => worstRequestCost(COPILOT_MODEL, largestInput + INPUT_HEADROOM, maxTokens, fallbacks);
/** The first request's worst case with the loop's per-response output limit and fallbacks on: the threshold admission checks. */
export const FIRST_REQUEST_USD = worstNextRequest(20_000, 16_000, true);

/** What the browser is told about one live run. */
export interface LiveRunReport {
  provider: LiveProvider;
  run: { requests: number; attempts: number; usd: number; retainedUsd: number; status: string } | null;
  /** Why the session stopped the run early, if it did. */
  stoppedBy: string | null;
  session: store.SessionView;
}

export class LiveSessionRefused extends Error {
  constructor(
    message: string,
    readonly code: string
  ) {
    super(message);
    this.name = "LiveSessionRefused";
  }
}

// Runs in progress in this process, so Stop can cancel one (shared across route bundles).
const g = globalThis as typeof globalThis & { __atlasLiveRuns?: Map<string, AbortController> };
const running = () => (g.__atlasLiveRuns ??= new Map());

/** Cancels every run in progress in this process (Stop, and any change of key). Their open reservations are kept as spend. */
export function cancelRunningRuns() {
  for (const c of running().values()) c.abort();
}

/**
 * The production client for live runs. Only this gate constructs it, only for
 * an admitted run, and only with the key the user connected: nothing is read
 * from the environment implicitly (no ambient key and no auth token).
 */
export const anthropicClient = (apiKey: string): MessagesClient => new Anthropic({ apiKey, authToken: null, maxRetries: 0 });

export interface LiveDeps {
  env: Env;
  now: () => Date;
  sessionFile: string;
  /** Which browsers may manage the connection (localPairing.ts). */
  pairingFile: string;
  /** Where the key is kept and its revision; never the key (localConnection.ts). */
  connectionFile: string;
  /** The two places a key can be kept (tests pass fakes). */
  secrets: { session: SecretStore; keychain: SecretStore };
  /** The Anthropic client factory, given the connected key (tests pass a fake). Unused with the fake provider. */
  makeClient: (apiKey: string) => MessagesClient;
}

export type CredentialProblem = "no_credential" | "credential_missing" | "credential_changed" | "credential_unreadable";
export type ResolvedCredential =
  | { ok: true; source: CredentialSource; revision: string | null; key: string | null }
  | { ok: false; code: CredentialProblem; error: string; source: CredentialSource; revision: string | null };

/**
 * The key in use now, read from where the user chose to keep it, or why it
 * can't be used. Atlas never switches source on its own: a missing stored key
 * doesn't fall back to the environment, and an environment key is used only
 * once selected. `read: false` checks what can be checked without opening the
 * OS credential store (the status read).
 */
export async function resolveCredential(deps: LiveDeps, conn?: ConnectionState, read = true): Promise<ResolvedCredential> {
  const c = conn ?? (await readConnection(deps.connectionFile));
  const fail = (code: CredentialProblem, error: string) => ({ ok: false, code, error, source: c.source, revision: c.revision }) as const;
  if (c.source === "none" || !c.revision || !c.fingerprint) return fail("no_credential", "No API key is connected. Connect one in Atlas (Connect Claude) before starting a session.");
  let key: string | null;
  if (c.source === "environment") {
    key = normalizeKey(deps.env.ANTHROPIC_API_KEY) || null;
    if (!key) return fail("credential_missing", "The environment key was selected, but ANTHROPIC_API_KEY isn't set in the server's environment any more. Set it and restart, or connect a key in Atlas.");
  } else if (c.source === "session") {
    key = await deps.secrets.session.get(keychainAccount(c.salt));
    if (!key) return fail("credential_missing", "The key was kept for this server session only, and the server has restarted since. Paste the key again to continue.");
  } else {
    if (!read) return { ok: true, source: c.source, revision: c.revision, key: null };
    try {
      key = await deps.secrets.keychain.get(keychainAccount(c.salt));
    } catch (err) {
      return fail("credential_unreadable", `${err instanceof Error ? err.message : "The operating system's credential store couldn't be read."} Unlock it and try again, or replace the key.`);
    }
    if (!key) return fail("credential_missing", "The remembered key is no longer in the operating system's credential store. Paste the key again to continue.");
  }
  if (fingerprintOf(c.salt, key) !== c.fingerprint)
    return fail("credential_changed", c.source === "environment" ? "ANTHROPIC_API_KEY in the server's environment changed after it was selected. Select it again to use the new key." : "The stored key changed outside Atlas. Replace the key in Atlas to continue.");
  return { ok: true, source: c.source, revision: c.revision, key };
}

/** The credential revision a session must match under this provider, without reading any key. */
const currentRevision = async (deps: LiveDeps) => (await readConnection(deps.connectionFile)).revision;

export interface AdmittedRun {
  id: string;
  provider: LiveProvider;
  /** The model the run asks for: the reviewed Copilot model, or the test provider's own name. */
  model: string;
  client: MessagesClient;
  /** Aborts when the request is cancelled or the session is stopped. */
  signal: AbortSignal;
  stoppedBy: () => string | null;
  finish: (status: string) => Promise<LiveRunReport>;
}

export type Refusal = { ok: false; status: number; code: string; error: string; session?: store.SessionView };

/** The refusal a session's own state implies, without touching a credential, or null when it could admit a run. */
const SESSION_REFUSAL: Record<Exclude<store.SessionStatus, "active">, { status: number; code: string }> = {
  unarmed: { status: 403, code: "no_session" },
  invalid: { status: 403, code: "invalid_session" },
  unbound: { status: 403, code: "unbound_session" },
  provider_mismatch: { status: 403, code: "provider_mismatch" },
  credential_mismatch: { status: 403, code: "credential_mismatch" },
  unclaimed: { status: 403, code: "not_claimed" },
  not_this_browser: { status: 403, code: "not_this_browser" },
  expired: { status: 403, code: "expired" },
  stopped: { status: 403, code: "stopped" },
  exhausted: { status: 429, code: "exhausted" },
};

function sessionRefusal(v: store.SessionView): Omit<Refusal, "session"> | null {
  if (v.status !== "active") return { ok: false, ...SESSION_REFUSAL[v.status], error: v.message };
  if (v.runInProgress) return { ok: false, status: 409, code: "run_in_progress", error: "A live run is already in progress; only one runs at a time." };
  return null;
}

/** Admits one live run for this request, or says why not. Nothing reaches a provider unless this returns ok. */
export async function admitLiveRun(req: Request, deps: LiveDeps): Promise<{ ok: true; run: AdmittedRun } | Refusal> {
  const ready = liveReadiness(deps.env);
  if (!ready.ok) return { ok: false, status: 503, code: "live_unavailable", error: `Live testing isn't available: ${ready.reasons.join(" ")}` };
  const local = localRequestProblem(req, "write");
  if (local) return { ok: false, status: 403, code: "not_local", error: local };
  const cookie = cookieOf(req, liveCookieName(deps.env));
  const provider = ready.provider;
  // A run abandoned by a crash is finalized first, so the session's own state is
  // current before it is judged. This reads and writes the session record only.
  await store.reapAbandonedRun(deps.sessionFile, deps.now());
  // Which key is in use, from the record alone: this opens no credential store.
  const conn = await readConnection(deps.connectionFile);
  const revision = conn.revision;
  const sessionNow = () => store.readView(deps.sessionFile, deps.now(), cookie, FIRST_REQUEST_USD, provider, revision);
  if (provider === "anthropic" && conn.source === "none")
    return { ok: false, status: 403, code: "no_credential", error: "No API key is connected. Connect one in Atlas (Connect Claude) before starting a session.", session: await sessionNow() };
  // A session that could not admit a run is refused HERE, before any credential is read:
  // a missing, unreadable, stopped, expired, exhausted or another browser's session never
  // opens the operating system's credential store.
  const view = await sessionNow();
  const closed = sessionRefusal(view);
  if (closed) return { ...closed, session: view };
  // Only now, for a run the session could admit, is the key read.
  const cred: ResolvedCredential = provider === "fake" ? { ok: true, source: conn.source, revision, key: null } : await resolveCredential(deps, conn);
  if (!cred.ok) return { ok: false, status: 403, code: cred.code, error: cred.error, session: view };
  // Admission itself stays one atomic step, and is authoritative: the check above is only a cheap gate.
  const admitted = await store.admitRun(deps.sessionFile, deps.now(), cookie, FIRST_REQUEST_USD, provider, revision);
  if (!admitted.ok) {
    const status = admitted.code === "run_in_progress" ? 409 : admitted.code === "exhausted" ? 429 : 403;
    return { ok: false, status, code: admitted.code, error: admitted.error, session: await sessionNow() };
  }

  const runId = admitted.runId;
  const model = provider === "fake" ? TEST_PROVIDER_MODEL : COPILOT_MODEL;
  const inner = provider === "fake" ? createTestProvider() : deps.makeClient(cred.key!);
  // Whether a real provider answer has been recorded for this key yet (once per run is enough).
  let outcomeRecorded = false;
  const recordOutcome = async (outcome: "verified" | "rejected") => {
    if (provider !== "anthropic" || !revision || outcomeRecorded) return;
    outcomeRecorded = true;
    await markOutcome(deps.connectionFile, deps.now(), revision, outcome);
  };
  const stop = new AbortController();
  running().set(runId, stop);
  const signal = AbortSignal.any([req.signal, stop.signal]);
  let stoppedBy: string | null = null;

  const client: MessagesClient = {
    beta: {
      messages: {
        async create(params, options) {
          if (params.model !== model) {
            stoppedBy = `The run asked for ${params.model}, not the configured ${model}.`;
            throw new LiveSessionRefused(stoppedBy, "wrong_model");
          }
          const fallbacks = (params as { fallbacks?: unknown }).fallbacks != null;
          // The credential is re-checked for every request: replacing or removing the key ends this run before another request is sent.
          const r = await store.reserveRequest(deps.sessionFile, deps.now(), runId, provider, (largest) => worstNextRequest(largest, params.max_tokens, fallbacks), await currentRevision(deps));
          if (!r.ok) {
            stoppedBy = r.error;
            throw new LiveSessionRefused(r.error, r.code);
          }
          let res: Anthropic.Beta.BetaMessage;
          try {
            res = await inner.beta.messages.create(params, { ...options, signal: options?.signal ?? signal });
          } catch (err) {
            // An error, timeout or cancellation: the usage is unknown, so the reservation is kept as spend.
            await store.settleRequest(deps.sessionFile, r.reservationId, { known: false });
            if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) await recordOutcome("rejected");
            throw err;
          }
          // Any response from the provider means the key was accepted.
          await recordOutcome("verified");
          // The cost counts as known only with complete accounting; otherwise it is never read as zero.
          const priced = pricedUsage(res);
          if (!priced.ok) {
            await store.settleRequest(deps.sessionFile, r.reservationId, { known: false });
            stoppedBy = `The provider's response had no valid usage accounting (${priced.reason}), so its USD ${r.usd.toFixed(4)} reservation is kept and the run ends.`;
            throw new LiveSessionRefused(stoppedBy, "unknown_usage");
          }
          await store.settleRequest(deps.sessionFile, r.reservationId, { known: true, usd: priced.usd, attempts: priced.attempts, largestInput: priced.largestInput, models: priced.models });
          return res;
        },
      },
    },
  };

  return {
    ok: true,
    run: {
      id: runId,
      provider,
      model,
      client,
      signal,
      stoppedBy: () => stoppedBy,
      async finish(status) {
        running().delete(runId);
        const summary = await store.finishRun(deps.sessionFile, deps.now(), runId, status);
        return {
          provider,
          run: summary ? { requests: summary.requests, attempts: summary.attempts, usd: summary.usd, retainedUsd: summary.retainedUsd, status: summary.status } : null,
          stoppedBy,
          session: await store.readView(deps.sessionFile, deps.now(), cookie, FIRST_REQUEST_USD, provider, await currentRevision(deps)),
        };
      },
    },
  };
}

/** The session as this browser may see it (GET), or why live testing isn't available here. */
export async function liveSessionStatus(req: Request, deps: LiveDeps): Promise<{ provider: LiveProvider | null; available: boolean; reasons: string[]; session: store.SessionView | null }> {
  const ready = liveReadiness(deps.env);
  if (!ready.ok) return { provider: null, available: false, reasons: ready.reasons, session: null };
  const local = localRequestProblem(req, "read");
  if (local) return { provider: ready.provider, available: false, reasons: [local], session: null };
  return { provider: ready.provider, available: true, reasons: [], session: await store.readView(deps.sessionFile, deps.now(), cookieOf(req, liveCookieName(deps.env)), FIRST_REQUEST_USD, ready.provider, await currentRevision(deps)) };
}

/** Stops the session (from this machine) and cancels its run in progress here. Stopping is always allowed locally. */
export async function stopLiveSession(req: Request, deps: LiveDeps, reason: string): Promise<{ ok: true; session: store.SessionView } | Refusal> {
  const local = localRequestProblem(req, "write");
  if (local) return { ok: false, status: 403, code: "not_local", error: local };
  const r = await store.stopSession(deps.sessionFile, deps.now(), reason);
  if (!r.ok) return { ok: false, status: 404, code: r.code, error: r.error };
  cancelRunningRuns();
  const ready = liveReadiness(deps.env);
  return { ok: true, session: await store.readView(deps.sessionFile, deps.now(), cookieOf(req, liveCookieName(deps.env)), FIRST_REQUEST_USD, ready.ok ? ready.provider : undefined) };
}

/** Exchanges the one-time claim link for this browser's session cookie. */
export async function claimLiveSession(req: Request, deps: LiveDeps, token: string): Promise<{ ok: true; cookie: string; expiresAt: Date } | Refusal> {
  const ready = liveReadiness(deps.env);
  if (!ready.ok) return { ok: false, status: 503, code: "live_unavailable", error: `Live testing isn't available: ${ready.reasons.join(" ")}` };
  const local = localRequestProblem(req, "navigate");
  if (local) return { ok: false, status: 403, code: "not_local", error: local };
  const r = await store.claimSession(deps.sessionFile, deps.now(), token, ready.provider);
  if (!r.ok) return { ok: false, status: 403, code: r.code, error: r.error };
  return { ok: true, cookie: r.cookie, expiresAt: r.expiresAt };
}
