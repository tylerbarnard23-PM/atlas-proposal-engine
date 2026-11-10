import Anthropic from "@anthropic-ai/sdk";
import { COPILOT_MODEL, type MessagesClient } from "./agent";
import { pricedUsage, worstRequestCost } from "./eval/budget";
import { TEST_PROVIDER_MODEL, createTestProvider } from "./testProvider";
import * as store from "./liveSessionStore";

// The gate every live Copilot request passes before any provider call.
//
// Live mode (COPILOT_MODE=live) is local testing only. It fails closed unless:
//   1. the server is set up for it: not a public deployment (VERCEL), no
//      ANTHROPIC_BASE_URL override, and a key present (its value is never
//      read here beyond its presence) or the fake provider chosen;
//   2. the request is local: a loopback or *.localhost Host, a same-origin
//      Origin on writes, no cross-site fetch, and no non-loopback forwarding;
//   3. the owner has armed a session in a terminal for the provider the
//      server runs now (a session armed for the fake provider never admits a
//      paid request, nor the reverse), this browser has claimed it (an
//      HttpOnly cookie), and it is unexpired, unstopped and has allowance left: 30 minutes, 3 runs, 10 HTTP requests, one run at a
//      time, a USD 5 estimate-based guard.
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

export const LIVE_COOKIE = "atlas_live_session";
const INPUT_HEADROOM = 30_000;

export type LiveProvider = "anthropic" | "fake";
type Env = Record<string, string | undefined>;

/** Whether this server may run the live mode at all, and with which provider. Never reads the key's value. */
export function liveReadiness(env: Env): { ok: true; provider: LiveProvider } | { ok: false; reasons: string[] } {
  const reasons: string[] = [];
  if (env.COPILOT_MODE !== "live") reasons.push("COPILOT_MODE isn't live.");
  if (env.VERCEL || env.VERCEL_ENV) reasons.push("Live testing is local only; this looks like a hosted deployment.");
  if (env.ANTHROPIC_BASE_URL) reasons.push("ANTHROPIC_BASE_URL is set; live testing only calls the default Anthropic endpoint.");
  const provider = env.COPILOT_LIVE_PROVIDER ?? "anthropic";
  if (provider !== "anthropic" && provider !== "fake") reasons.push(`COPILOT_LIVE_PROVIDER must be "anthropic" or "fake".`);
  if (provider === "anthropic" && !env.ANTHROPIC_API_KEY) reasons.push("ANTHROPIC_API_KEY isn't set.");
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

export function cookieOf(req: Request): string | null {
  const raw = req.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === LIVE_COOKIE) return decodeURIComponent(v.join("="));
  }
  return null;
}

export function sessionCookie(value: string, expires: Date): string {
  return `${LIVE_COOKIE}=${encodeURIComponent(value)}; Path=/api/copilot; HttpOnly; SameSite=Strict; Expires=${expires.toUTCString()}`;
}

/** Removes this browser's session cookie (sent with Stop). */
export const clearedSessionCookie = () => `${LIVE_COOKIE}=; Path=/api/copilot; HttpOnly; SameSite=Strict; Max-Age=0`;

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

/** The production client for live runs. Only this gate constructs it, and only for an admitted run. */
export const anthropicClient = (): MessagesClient => new Anthropic({ maxRetries: 0 });

export interface LiveDeps {
  env: Env;
  now: () => Date;
  sessionFile: string;
  /** The Anthropic client factory (tests pass a fake). Unused with the fake provider. */
  makeClient: () => MessagesClient;
}

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

type Refusal = { ok: false; status: number; code: string; error: string; session?: store.SessionView };

/** Admits one live run for this request, or says why not. Nothing reaches a provider unless this returns ok. */
export async function admitLiveRun(req: Request, deps: LiveDeps): Promise<{ ok: true; run: AdmittedRun } | Refusal> {
  const ready = liveReadiness(deps.env);
  if (!ready.ok) return { ok: false, status: 503, code: "live_unavailable", error: `Live testing isn't available: ${ready.reasons.join(" ")}` };
  const local = localRequestProblem(req, "write");
  if (local) return { ok: false, status: 403, code: "not_local", error: local };
  const cookie = cookieOf(req);
  const provider = ready.provider;
  // The session must have been armed for this provider; checked before any client exists.
  const admitted = await store.admitRun(deps.sessionFile, deps.now(), cookie, FIRST_REQUEST_USD, provider);
  if (!admitted.ok) {
    const status = admitted.code === "run_in_progress" ? 409 : admitted.code === "exhausted" ? 429 : 403;
    return { ok: false, status, code: admitted.code, error: admitted.error, session: await store.readView(deps.sessionFile, deps.now(), cookie, FIRST_REQUEST_USD, provider) };
  }

  const runId = admitted.runId;
  const model = provider === "fake" ? TEST_PROVIDER_MODEL : COPILOT_MODEL;
  const inner = provider === "fake" ? createTestProvider() : deps.makeClient();
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
          const r = await store.reserveRequest(deps.sessionFile, deps.now(), runId, provider, (largest) => worstNextRequest(largest, params.max_tokens, fallbacks));
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
            throw err;
          }
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
          session: await store.readView(deps.sessionFile, deps.now(), cookie, FIRST_REQUEST_USD, provider),
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
  return { provider: ready.provider, available: true, reasons: [], session: await store.readView(deps.sessionFile, deps.now(), cookieOf(req), FIRST_REQUEST_USD, ready.provider) };
}

/** Stops the session (from this machine) and cancels its run in progress here. Stopping is always allowed locally. */
export async function stopLiveSession(req: Request, deps: LiveDeps, reason: string): Promise<{ ok: true; session: store.SessionView } | Refusal> {
  const local = localRequestProblem(req, "write");
  if (local) return { ok: false, status: 403, code: "not_local", error: local };
  const r = await store.stopSession(deps.sessionFile, deps.now(), reason);
  if (!r.ok) return { ok: false, status: 404, code: r.code, error: r.error };
  for (const c of running().values()) c.abort();
  const ready = liveReadiness(deps.env);
  return { ok: true, session: await store.readView(deps.sessionFile, deps.now(), cookieOf(req), FIRST_REQUEST_USD, ready.ok ? ready.provider : undefined) };
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
