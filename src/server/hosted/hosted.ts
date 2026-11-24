import { COPILOT_MODEL, runAgent, type MessagesClient } from "@/copilot/agent";
import { FIRST_REQUEST_USD, anthropicClient, cancelRun, cookieOf, meteredRun, sessionRefusal, type AdmittedRun, type LiveRunReport } from "@/copilot/liveGate";
import * as sessions from "@/copilot/liveSessionStore";
import { MAX_KEY_BODY_BYTES, ceilings, confirmedAllowance, minimumUsd } from "@/copilot/localConnect";
import type { CopilotRequest } from "@/copilot/snapshot";
import { TEST_PROVIDER_MODEL, createTestProvider } from "@/copilot/testProvider";
import { readBodyLimited } from "../requestLimits";
import { hostedReadiness, type Env, type HostedConfig, type HostedProvider } from "./config";
import { schemaReady, sqlFor, type Sql } from "./db";
import { keyRingFrom, type KeyRing } from "./crypto";
import { currentUser, devSignIn, finishGitHubSignIn, signOut, startGitHubSignIn, writeProblem, type HostedUser } from "./auth";
import { connectionView, currentRevision, deleteCredential, markOutcome, readKey, saveCredential, type HostedConnectionView } from "./credentials";
import { userSessionBackend } from "./sessionBackend";

// #113: hosted Claude analysis (COPILOT_MODE=hosted). The public preview runs
// only the labelled scripted example. A signed-in user connects their own
// Anthropic API key, starts a session with a confirmed allowance, and every
// analysis they ask for passes this gate: their sign-in, their key, their
// session (one per user, locked in the database), and the same metering as
// the local path (liveGate.meteredRun). Everything fails closed, and nothing
// here falls back to the scripted example or the test provider.

export interface HostedDeps {
  env: Env;
  now: () => Date;
  openSql: (databaseUrl: string) => Promise<Sql>;
  fetch: typeof fetch;
  /** The Anthropic client factory, given the user's key (tests pass a fake). */
  makeClient: (apiKey: string) => MessagesClient;
}

export const defaultHostedDeps = (): HostedDeps => ({ env: process.env, now: () => new Date(), openSql: sqlFor, fetch: globalThis.fetch.bind(globalThis), makeClient: anthropicClient });

export const HOSTED_LIVE_COOKIE = "stratovell_live_session";
const NO_STORE = { "cache-control": "no-store" };
const UNAVAILABLE = "Claude isn't connected on this site yet. The scripted example still runs; it isn't Claude's analysis.";
const STORAGE_DOWN = "Live analysis is unavailable right now (its storage can't be reached). Nothing ran and nothing was spent.";

type Refusal = { ok: false; status: number; code: string; error: string };
type Ctx = { ok: true; cfg: HostedConfig; sql: Sql; ring: KeyRing; user: HostedUser | null };

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => Response.json(body, { status, headers: { ...NO_STORE, ...headers } });
const refused = (r: { status: number; code: string; error: string }) => json({ error: r.error, code: r.code }, r.status);

const reportedReasons = new Set<string>();
/** Configuration problems go to the server log once (names only, never values); the public page shows a plain message. */
function logReasons(reasons: string[]) {
  const key = reasons.join("|");
  if (reportedReasons.has(key)) return;
  reportedReasons.add(key);
  console.warn(`[stratovell hosted] live analysis unavailable: ${reasons.join(" ")}`);
}

/** Configuration, storage, schema, key ring and the signed-in user: all checked on every hosted request. */
async function contextOf(req: Request, deps: HostedDeps): Promise<Ctx | Refusal> {
  const ready = hostedReadiness(deps.env);
  if (!ready.ok) {
    logReasons(ready.reasons);
    return { ok: false, status: 503, code: "live_unavailable", error: UNAVAILABLE };
  }
  const cfg = ready.config;
  let sql: Sql;
  try {
    sql = await deps.openSql(cfg.databaseUrl);
    if (!(await schemaReady(sql))) {
      logReasons(["The database has no Stratovell schema yet: run npm run hosted:migrate."]);
      return { ok: false, status: 503, code: "storage_not_ready", error: STORAGE_DOWN };
    }
    const ring = keyRingFrom(deps.env.STRATOVELL_CREDENTIAL_KEYS);
    const user = await currentUser(req, cfg, { now: deps.now, sql: async () => sql, fetch: deps.fetch });
    return { ok: true, cfg, sql, ring, user };
  } catch {
    return { ok: false, status: 503, code: "storage_unavailable", error: STORAGE_DOWN };
  }
}

const liveCookie = (cfg: HostedConfig, value: string, expires: Date) => `${HOSTED_LIVE_COOKIE}=${encodeURIComponent(value)}; Path=/api/copilot; HttpOnly; SameSite=Strict${cfg.secure ? "; Secure" : ""}; Expires=${expires.toUTCString()}`;
const clearedLiveCookie = (cfg: HostedConfig) => `${HOSTED_LIVE_COOKIE}=; Path=/api/copilot; HttpOnly; SameSite=Strict${cfg.secure ? "; Secure" : ""}; Max-Age=0`;

/** What the browser is told about hosted analysis: never a key, a token or a hash. */
export interface HostedInfo {
  available: boolean;
  message: string | null;
  provider: HostedProvider | null;
  model: string | null;
  signIn: { github: boolean; dev: boolean };
  user: { login: string; provider: HostedUser["provider"] } | null;
  connection: HostedConnectionView | null;
  session: sessions.SessionView | null;
  ceilings: sessions.AllowanceChoice;
  minimumUsd: number;
}

const modelFor = (p: HostedProvider) => (p === "fake" ? TEST_PROVIDER_MODEL : COPILOT_MODEL);

/** GET /api/copilot in hosted mode: reads only (no provider request, no spending, no write). */
export async function hostedInfo(req: Request, deps: HostedDeps): Promise<HostedInfo> {
  const base = { ceilings: ceilings(), minimumUsd: minimumUsd() };
  const ctx = await contextOf(req, deps);
  if (!ctx.ok) return { ...base, available: false, message: ctx.error, provider: null, model: null, signIn: { github: false, dev: false }, user: null, connection: null, session: null };
  const { cfg, sql, ring, user } = ctx;
  const info = { ...base, available: true, message: null, provider: cfg.provider, model: modelFor(cfg.provider), signIn: { github: !!cfg.github, dev: cfg.devSignIn } };
  if (!user) return { ...info, user: null, connection: null, session: null };
  try {
    const revision = await currentRevision(sql, user.id);
    return {
      ...info,
      user: { login: user.login, provider: user.provider },
      connection: await connectionView(sql, ring, user.id, cfg.provider),
      session: await sessions.readView(userSessionBackend(sql, user.id), deps.now(), cookieOf(req, HOSTED_LIVE_COOKIE), FIRST_REQUEST_USD, cfg.provider, revision),
    };
  } catch {
    return { ...base, available: false, message: STORAGE_DOWN, provider: null, model: null, signIn: info.signIn, user: { login: user.login, provider: user.provider }, connection: null, session: null };
  }
}

/** Admits one analysis for the signed-in user, or says why not. Nothing reaches a provider unless this returns ok. */
async function admitHostedRun(req: Request, ctx: Ctx, deps: HostedDeps): Promise<{ ok: true; run: AdmittedRun } | (Refusal & { session?: sessions.SessionView })> {
  const { cfg, sql, ring, user } = ctx;
  if (!user) return { ok: false, status: 401, code: "sign_in_required", error: "Sign in to run Claude analysis with your own API key." };
  const origin = writeProblem(req, cfg);
  if (origin) return { ok: false, status: 403, code: "not_same_origin", error: origin };
  const provider = cfg.provider;
  const backend = userSessionBackend(sql, user.id);
  const cookie = cookieOf(req, HOSTED_LIVE_COOKIE);
  await sessions.reapAbandonedRun(backend, deps.now());
  const revision = await currentRevision(sql, user.id);
  const sessionNow = () => sessions.readView(backend, deps.now(), cookie, FIRST_REQUEST_USD, provider, revision);
  if (provider === "anthropic" && !revision) return { ok: false, status: 403, code: "no_credential", error: "No API key is connected. Connect your Anthropic API key first.", session: await sessionNow() };
  // A session that couldn't admit a run is refused before the key is decrypted.
  const view = await sessionNow();
  const closed = sessionRefusal(view);
  if (closed) return { ...closed, session: view };
  let key: string | null = null;
  if (provider === "anthropic") {
    const k = await readKey(sql, ring, user.id);
    if (!k.ok) return { ok: false, status: 403, code: k.code, error: k.error, session: view };
    if (k.revision !== revision) return { ok: false, status: 409, code: "credential_changed", error: "The API key was replaced while this request was being checked. Ask again.", session: view };
    key = k.key;
  }
  // The authoritative, atomic step (the row is locked): of concurrent requests, one run is admitted.
  const admitted = await sessions.admitRun(backend, deps.now(), cookie, FIRST_REQUEST_USD, provider, revision);
  if (!admitted.ok) {
    const status = admitted.code === "run_in_progress" ? 409 : admitted.code === "exhausted" ? 429 : 403;
    return { ok: false, status, code: admitted.code, error: admitted.error, session: await sessionNow() };
  }
  return {
    ok: true,
    run: meteredRun({
      runId: admitted.runId,
      provider,
      revision,
      cookie,
      requestSignal: req.signal,
      inner: provider === "fake" ? createTestProvider() : deps.makeClient(key!),
      meter: {
        session: backend,
        now: deps.now,
        currentRevision: () => currentRevision(sql, user.id),
        recordOutcome: (rev, outcome) => markOutcome(sql, user.id, rev, outcome, deps.now()),
      },
    }),
  };
}

/** POST /api/copilot in hosted mode, after the body was parsed and its context checked. */
export async function hostedAnalysis(req: Request, deps: HostedDeps, value: Pick<CopilotRequest, "question" | "snapshot">, asked: "claude" | "test_provider"): Promise<Response> {
  const ctx = await contextOf(req, deps);
  if (!ctx.ok) return json({ error: ctx.error, code: ctx.code, live: null }, ctx.status);
  // Only what the user chose runs: the test provider never answers a Claude request, nor the reverse.
  const runs = ctx.cfg.provider === "fake" ? "test_provider" : "claude";
  if (asked !== runs)
    return json(
      { error: runs === "claude" ? "This site runs Claude only. Nothing ran." : "This server answers with the test provider, not Claude, so nothing ran. Choose the test-provider run explicitly.", code: "run_mode_mismatch", runs },
      409
    );
  let admitted: Awaited<ReturnType<typeof admitHostedRun>>;
  try {
    admitted = await admitHostedRun(req, ctx, deps);
  } catch {
    return json({ error: STORAGE_DOWN, code: "storage_unavailable", live: null }, 503);
  }
  if (!admitted.ok) return json({ error: admitted.error, code: admitted.code, live: admitted.session ? { session: admitted.session } : null }, admitted.status);
  const run = admitted.run;
  let status = "failed";
  let report: LiveRunReport | null = null;
  try {
    const result = await runAgent(value.snapshot, value.question, { mode: "live", provider: run.provider === "fake" ? "test" : "anthropic", model: run.model, client: run.client, signal: run.signal });
    status = result.status;
    report = await run.finish(status);
    return json({ ...result, live: report });
  } catch {
    return json({ error: "Stratovell AI couldn't read this workspace (a record is malformed). Nothing was changed." }, 422);
  } finally {
    if (!report) await run.finish(status).catch(() => {});
  }
}

/** A small JSON object body, read under its limit. Called only after the request was authorized. */
async function smallJson(req: Request): Promise<{ ok: true; body: Record<string, unknown> } | Refusal> {
  const bad: Refusal = { ok: false, status: 400, code: "bad_body", error: "Send a small JSON object." };
  const read = await readBodyLimited(req, MAX_KEY_BODY_BYTES);
  if (!read.ok) return read.tooLarge ? { ok: false, status: 413, code: "body_too_large", error: `Send less than ${MAX_KEY_BODY_BYTES} bytes of JSON.` } : bad;
  try {
    const body = JSON.parse(read.text);
    return body && typeof body === "object" && !Array.isArray(body) ? { ok: true, body } : bad;
  } catch {
    return bad;
  }
}

/** Signed in, from this site, JSON: checked from headers and cookies before any body is read. */
async function authorized(req: Request, deps: HostedDeps): Promise<{ ok: true; ctx: Ctx & { user: HostedUser } } | Refusal> {
  const ctx = await contextOf(req, deps);
  if (!ctx.ok) return ctx;
  const origin = writeProblem(req, ctx.cfg);
  if (origin) return { ok: false, status: 403, code: "not_same_origin", error: origin };
  if (!ctx.user) return { ok: false, status: 401, code: "sign_in_required", error: "Sign in first." };
  return { ok: true, ctx: ctx as Ctx & { user: HostedUser } };
}

/** Ends the user's session (and cancels its run here, if it runs on this instance), keeping its counters. */
async function endUserSession(ctx: Ctx & { user: HostedUser }, deps: HostedDeps, reason: string) {
  const backend = userSessionBackend(ctx.sql, ctx.user.id);
  const active = await backend.transact((l) => (l.kind === "ok" ? l.state.active?.id ?? null : null), true);
  await sessions.stopSession(backend, deps.now(), reason);
  cancelRun(active);
}

/** POST /api/copilot/hosted/connection {"action":"save","key"} | {"action":"disconnect"}. Never echoes the key; no provider request. */
export async function handleHostedConnection(req: Request, deps: HostedDeps = defaultHostedDeps()): Promise<Response> {
  const auth = await authorized(req, deps);
  if (!auth.ok) return refused(auth);
  const read = await smallJson(req);
  if (!read.ok) return refused(read);
  const { ctx } = auth;
  try {
    if (read.body.action === "save") {
      const saved = await saveCredential(ctx.sql, ctx.ring, ctx.user.id, read.body.key, deps.now());
      if (!saved.ok) return refused(saved);
      // A replaced key ends the session started under the old one (it would be refused anyway; this says why).
      await endUserSession(ctx, deps, "the API key was replaced");
    } else if (read.body.action === "disconnect") {
      await deleteCredential(ctx.sql, ctx.user.id);
      await endUserSession(ctx, deps, "the API key was disconnected");
    } else return json({ error: 'The action must be "save" or "disconnect".', code: "bad_action" }, 400);
    return json({ connection: await connectionView(ctx.sql, ctx.ring, ctx.user.id, ctx.cfg.provider) });
  } catch {
    return json({ error: STORAGE_DOWN, code: "storage_unavailable" }, 503);
  }
}

/** POST /api/copilot/hosted/session {"action":"start","allowance":{…}} | {"action":"stop"}. Starting sends nothing to a provider. */
export async function handleHostedSession(req: Request, deps: HostedDeps = defaultHostedDeps()): Promise<Response> {
  const auth = await authorized(req, deps);
  if (!auth.ok) return refused(auth);
  const read = await smallJson(req);
  if (!read.ok) return refused(read);
  const { ctx } = auth;
  const { cfg, sql, ring, user } = ctx;
  const backend = userSessionBackend(sql, user.id);
  try {
    if (read.body.action === "stop") {
      await endUserSession(ctx, deps, "stopped from the browser");
      const view = await sessions.readView(backend, deps.now(), null, FIRST_REQUEST_USD, cfg.provider, await currentRevision(sql, user.id));
      return json({ live: { session: view } }, 200, { "set-cookie": clearedLiveCookie(cfg) });
    }
    if (read.body.action !== "start") return json({ error: 'The action must be "start" or "stop".', code: "bad_action" }, 400);
    const allowance = confirmedAllowance(read.body);
    if (!allowance.ok) return refused(allowance);
    const revision = await currentRevision(sql, user.id);
    if (cfg.provider === "anthropic") {
      // The key must be usable now; it is decrypted to check, and sent nowhere.
      const k = await readKey(sql, ring, user.id);
      if (!k.ok) return json({ error: k.error, code: k.code }, 409);
    }
    const now = deps.now();
    const armed = await sessions.armSession(backend, now, cfg.provider, { allowance: allowance.allowance, credentialRevision: revision, claim: true });
    if (!armed.ok) return json({ error: armed.error, code: armed.code }, armed.code === "already_armed" || armed.code === "run_in_progress" ? 409 : 400);
    const view = await sessions.readView(backend, now, armed.cookie, FIRST_REQUEST_USD, cfg.provider, revision);
    return json({ live: { session: view } }, 200, { "set-cookie": liveCookie(cfg, armed.cookie!, sessions.expiresAt(armed.state)) });
  } catch {
    return json({ error: STORAGE_DOWN, code: "storage_unavailable" }, 503);
  }
}

// --- Sign-in routes -------------------------------------------------------------

async function configured(deps: HostedDeps): Promise<{ ok: true; cfg: HostedConfig; sql: () => Promise<Sql> } | Refusal> {
  const ready = hostedReadiness(deps.env);
  if (!ready.ok) return { ok: false, status: 404, code: "live_unavailable", error: "Sign-in isn't available on this site." };
  return { ok: true, cfg: ready.config, sql: () => deps.openSql(ready.config.databaseUrl) };
}

export async function handleSignInStart(_req: Request, deps: HostedDeps = defaultHostedDeps()): Promise<Response> {
  const c = await configured(deps);
  if (!c.ok) return new Response(c.error, { status: c.status, headers: NO_STORE });
  return startGitHubSignIn(c.cfg);
}

export async function handleSignInCallback(req: Request, deps: HostedDeps = defaultHostedDeps()): Promise<Response> {
  const c = await configured(deps);
  if (!c.ok) return new Response(c.error, { status: c.status, headers: NO_STORE });
  try {
    return await finishGitHubSignIn(req, c.cfg, { now: deps.now, sql: c.sql, fetch: deps.fetch });
  } catch {
    return new Response("Sign-in isn't available right now. Try again later.", { status: 503, headers: NO_STORE });
  }
}

export async function handleDevSignIn(req: Request, deps: HostedDeps = defaultHostedDeps()): Promise<Response> {
  const c = await configured(deps);
  if (!c.ok) return refused(c);
  const origin = writeProblem(req, c.cfg);
  if (origin) return refused({ status: 403, code: "not_same_origin", error: origin });
  const read = await smallJson(req);
  if (!read.ok) return refused(read);
  try {
    return await devSignIn(c.cfg, { now: deps.now, sql: c.sql, fetch: deps.fetch }, read.body);
  } catch {
    return json({ error: STORAGE_DOWN, code: "storage_unavailable" }, 503);
  }
}

export async function handleSignOut(req: Request, deps: HostedDeps = defaultHostedDeps()): Promise<Response> {
  const c = await configured(deps);
  if (!c.ok) return refused(c);
  const origin = writeProblem(req, c.cfg, false);
  if (origin) return refused({ status: 403, code: "not_same_origin", error: origin });
  try {
    return await signOut(req, c.cfg, { now: deps.now, sql: c.sql, fetch: deps.fetch });
  } catch {
    return json({ error: STORAGE_DOWN, code: "storage_unavailable" }, 503);
  }
}
