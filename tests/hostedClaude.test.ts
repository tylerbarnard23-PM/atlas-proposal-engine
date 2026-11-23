import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { PGlite } from "@electric-sql/pglite";
import { COPILOT_MODEL, type MessagesClient } from "@/copilot/agent";
import { defaultDeps, handleCopilotGet, handleCopilotPost } from "@/copilot/routeHandler";
import { hostedReadiness } from "@/server/hosted/config";
import { migrate, pgliteSql, type Sql } from "@/server/hosted/db";
import { keyRingFrom, open, seal } from "@/server/hosted/crypto";
import { handleDevSignIn, handleHostedConnection, handleHostedSession, handleSignInCallback, handleSignInStart, type HostedDeps } from "@/server/hosted/hosted";
import { userSessionBackend } from "@/server/hosted/sessionBackend";
import * as sessions from "@/copilot/liveSessionStore";

// #113: hosted Claude connectivity through the real HTTP handlers, the real
// session state machine and real Postgres semantics (PGlite: Postgres compiled
// to WASM). Synthetic data, fake keys, a fake GitHub and a fake Anthropic
// client only: nothing here reaches a network or a provider.

// No browser globals here: PGlite would take a `window` for a browser. The workspace store runs in memory.
vi.mock("zustand", async (orig) => ({ ...(await orig<typeof import("zustand")>()), create: (await import("./support/liveStore")).liveCreate }));

const ORIGIN = "https://stratovell.test";
const KEY_A = `sk-ant-api03-SYNTHETIC-USER-A-${"a".repeat(40)}`;
const KEY_B = `sk-ant-api03-SYNTHETIC-USER-B-${"b".repeat(40)}`;
const GH_TOKEN = "gho_SYNTHETIC_GITHUB_TOKEN_never_stored";
const PRIVATE_NOTE = "PRIVATE-DISCOVERY-NOTE-synthetic-do-not-send";
const RING = `k1:${Buffer.alloc(32, 7).toString("base64")}`;
const T0 = new Date("2026-11-23T12:00:00Z");
const ALLOWANCE = { minutes: 30, runs: 3, requests: 10, usd: 5 };

const baseEnv = (over: Record<string, string | undefined> = {}) => ({
  COPILOT_MODE: "hosted",
  STRATOVELL_PUBLIC_ORIGIN: ORIGIN,
  DATABASE_URL: "postgres://synthetic@db.invalid/stratovell",
  STRATOVELL_CREDENTIAL_KEYS: RING,
  GITHUB_CLIENT_ID: "synthetic-client-id",
  GITHUB_CLIENT_SECRET: "synthetic-client-secret",
  ...over,
});

let db: PGlite;
let sql: Sql;
let clock: Date;
let env: Record<string, string | undefined>;
let fetchCalls: string[];
let keysUsed: string[];
let script: (n: number, params: Anthropic.Beta.Messages.MessageCreateParamsNonStreaming, signal?: AbortSignal) => Promise<Anthropic.Beta.BetaMessage>;
let providerCalls: { key: string; messages: string }[];
let logs: string[];
let responses: string[];

const USAGE = { input_tokens: 1_000, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
let mid = 0;
const message = (content: unknown[], stop: string) => ({ id: `msg_${++mid}`, type: "message", role: "assistant", model: COPILOT_MODEL, content, stop_reason: stop, stop_sequence: null, usage: USAGE }) as unknown as Anthropic.Beta.BetaMessage;
const answer = (text: string) => message([{ type: "text", text, citations: null }], "end_turn");
const toolUse = (name: string) => message([{ type: "tool_use", id: `toolu_${++mid}`, name, input: {} }], "tool_use");

/** GitHub as the OAuth exchange sees it: two synthetic accounts, by code. */
const ACCOUNTS: Record<string, { id: number; login: string }> = { "code-a": { id: 101, login: "advisor-a" }, "code-b": { id: 202, login: "advisor-b" } };
async function fakeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = String(input);
  fetchCalls.push(url);
  if (url === "https://github.com/login/oauth/access_token") {
    const code = new URLSearchParams(String(init?.body)).get("code") ?? "";
    return ACCOUNTS[code] ? Response.json({ access_token: `${GH_TOKEN}:${code}` }) : Response.json({ error: "bad_verification_code" });
  }
  if (url === "https://api.github.com/user") {
    const code = String((init?.headers as Record<string, string>).authorization).split(":").pop()!;
    return Response.json(ACCOUNTS[code]);
  }
  throw new Error(`unexpected fetch ${url}`);
}

function deps(over: Partial<HostedDeps> = {}): HostedDeps {
  return {
    env,
    now: () => clock,
    openSql: async () => sql,
    fetch: fakeFetch as typeof fetch,
    makeClient: (key: string): MessagesClient => {
      keysUsed.push(key);
      return {
        beta: {
          messages: {
            async create(params, options) {
              const n = providerCalls.length;
              providerCalls.push({ key, messages: JSON.stringify(params.messages) });
              return script(n, params, options?.signal);
            },
          },
        },
      };
    },
    ...over,
  };
}

const liveDeps = () => ({ ...defaultDeps(), env });
const record = async (res: Response) => {
  const text = await res.clone().text();
  responses.push(text + JSON.stringify([...res.headers]));
  return res;
};
const cookieHeader = (...c: (string | null | undefined)[]) => c.filter(Boolean).join("; ");
const setCookies = (res: Response) => res.headers.getSetCookie();
const cookieValue = (res: Response, name: string) => setCookies(res).map((c) => c.split(";")[0]).find((c) => c.startsWith(`${name}=`)) ?? null;
const post = (path: string, body: unknown, o: { cookie?: string | null; origin?: string | null } = {}) =>
  new Request(ORIGIN + path, { method: "POST", headers: { "content-type": "application/json", ...(o.origin === null ? {} : { origin: o.origin ?? ORIGIN }), ...(o.cookie ? { cookie: o.cookie } : {}) }, body: JSON.stringify(body) });

/** Signs in through the real GitHub flow (start → callback), returning the auth cookie pair "name=value". */
async function signIn(code: string, d = deps()): Promise<string> {
  const start = await handleSignInStart(new Request(`${ORIGIN}/api/auth/github/start`), d);
  const loc = new URL(start.headers.get("location")!);
  const held = cookieValue(start, "stratovell_oauth")!;
  const cb = await record(await handleSignInCallback(new Request(`${ORIGIN}/api/auth/github/callback?code=${code}&state=${loc.searchParams.get("state")}`, { headers: { cookie: held } }), d));
  expect(cb.status).toBe(303);
  return cookieValue(cb, "__Host-stratovell_auth")!;
}

async function status(cookie: string | null) {
  const res = await record(await handleCopilotGet(new Request(`${ORIGIN}/api/copilot`, { headers: cookie ? { cookie } : {} }), liveDeps(), deps()));
  return (await res.json()) as { mode: string; model: string | null; hosted: import("@/server/hosted/hosted").HostedInfo };
}

async function startSession(auth: string, allowance: Record<string, number> = ALLOWANCE): Promise<string> {
  const res = await record(await handleHostedSession(post("/api/copilot/hosted/session", { action: "start", allowance }, { cookie: auth }), deps()));
  expect(res.status, await res.clone().text()).toBe(200);
  return cookieValue(res, "stratovell_live_session")!;
}

/** The page's own request body, from the store as the advisor left it. */
async function analysisBody(runAs = "claude", question = "What matters most for this client? (synthetic)") {
  const { useAtlasStore } = await import("@/store/useStore");
  const { copilotRequest } = await import("@/copilot/request");
  return { ...copilotRequest(useAtlasStore.getState(), ""), question, runAs };
}
const analyze = async (body: unknown, cookie: string, d = deps()) => record(await handleCopilotPost(post("/api/copilot", body, { cookie }), liveDeps(), d));

beforeEach(async () => {
  vi.resetModules();
  db = new PGlite();
  sql = pgliteSql(db as never);
  await migrate(sql);
  clock = T0;
  env = baseEnv();
  fetchCalls = [];
  keysUsed = [];
  providerCalls = [];
  responses = [];
  logs = [];
  script = async () => answer("A synthetic answer.");
  for (const level of ["log", "info", "warn", "error", "debug"] as const) vi.spyOn(console, level).mockImplementation((...args: unknown[]) => void logs.push(args.map(String).join(" ")));
});
afterEach(async () => {
  vi.restoreAllMocks();
  await db.close();
});

describe("configuration fails closed", () => {
  it("each missing or unsafe setting makes live analysis unavailable; the public scripted example still runs and Claude is never substituted", async () => {
    for (const [name, over] of [
      ["no origin", { STRATOVELL_PUBLIC_ORIGIN: undefined }],
      ["http origin", { STRATOVELL_PUBLIC_ORIGIN: "http://stratovell.test" }],
      ["no database", { DATABASE_URL: undefined }],
      ["pglite on Vercel", { DATABASE_URL: "pglite:", VERCEL: "1" }],
      ["no encryption keys", { STRATOVELL_CREDENTIAL_KEYS: undefined }],
      ["short encryption key", { STRATOVELL_CREDENTIAL_KEYS: `k1:${Buffer.alloc(16).toString("base64")}` }],
      ["no sign-in", { GITHUB_CLIENT_ID: undefined }],
      ["dev sign-in on a public origin", { STRATOVELL_DEV_SIGNIN: "1" }],
      ["endpoint override", { ANTHROPIC_BASE_URL: "https://proxy.invalid" }],
    ] as const) {
      env = baseEnv(over as Record<string, string | undefined>);
      expect(hostedReadiness(env).ok, name).toBe(false);
      const info = (await status(null)).hosted;
      expect(info.available, name).toBe(false);
      expect(info.message, name).toMatch(/Claude isn't connected on this site/);
      const refused = await analyze(await analysisBody("claude"), "");
      expect(refused.status, name).toBe(503);
      const scripted = await analyze(await analysisBody("scripted_example"), "");
      expect(scripted.status, name).toBe(200);
      expect(((await scripted.json()) as { mode: string }).mode, name).toBe("demo");
    }
    expect(keysUsed).toEqual([]);
    expect(providerCalls).toEqual([]);
    // Configuration problems are logged by name only.
    expect(logs.join("\n")).not.toContain("synthetic-client-secret");
  });

  it("dev sign-in exists only for a local *.localhost origin off Vercel", () => {
    expect(hostedReadiness(baseEnv({ STRATOVELL_PUBLIC_ORIGIN: "http://hosted.localhost:3975", STRATOVELL_DEV_SIGNIN: "1", GITHUB_CLIENT_ID: undefined })).ok).toBe(true);
    expect(hostedReadiness(baseEnv({ STRATOVELL_PUBLIC_ORIGIN: "http://hosted.localhost:3975", STRATOVELL_DEV_SIGNIN: "1", GITHUB_CLIENT_ID: undefined, VERCEL: "1" })).ok).toBe(false);
  });

  it("an unmigrated database refuses live analysis (503) without touching a key", async () => {
    const bare = new PGlite();
    sql = pgliteSql(bare as never);
    const info = (await status(null)).hosted;
    expect(info.available).toBe(false);
    expect((await analyze(await analysisBody("claude"), "")).status).toBe(503);
    expect(logs.join("\n")).toMatch(/hosted:migrate/);
    await bare.close();
  });

  it("unreachable storage fails closed with 503, never a fallback", async () => {
    const d = deps({ openSql: async () => Promise.reject(new Error("connect ECONNREFUSED")) });
    const res = await record(await handleCopilotPost(post("/api/copilot", await analysisBody("claude"), {}), liveDeps(), d));
    expect(res.status).toBe(503);
    expect(((await res.json()) as { code: string }).code).toBe("storage_unavailable");
    expect(keysUsed).toEqual([]);
  });
});

describe("sign-in", () => {
  it("GitHub sign-in checks the state, stores only a hash of the sign-in token and never the GitHub token", async () => {
    const auth = await signIn("code-a");
    expect(auth).toMatch(/^__Host-stratovell_auth=/);
    const start = await handleSignInStart(new Request(`${ORIGIN}/api/auth/github/start`), deps());
    const set = setCookies(start)[0];
    expect(set).toMatch(/HttpOnly/);
    expect(set).toMatch(/Secure/);
    expect(new URL(start.headers.get("location")!).searchParams.get("code_challenge_method")).toBe("S256");
    const info = (await status(auth)).hosted;
    expect(info.user).toEqual({ login: "advisor-a", provider: "github" });
    // A forged or missing state is refused before GitHub is asked.
    const before = fetchCalls.length;
    const forged = await handleSignInCallback(new Request(`${ORIGIN}/api/auth/github/callback?code=code-a&state=forged`, { headers: { cookie: "stratovell_oauth=real.verifier" } }), deps());
    expect(forged.status).toBe(403);
    expect(fetchCalls.length).toBe(before);
    const dump = JSON.stringify((await sql.query("select * from stratovell_auth_sessions")).rows) + JSON.stringify((await sql.query("select * from stratovell_users")).rows);
    expect(dump).not.toContain(auth.split("=")[1]);
    expect(dump).not.toContain(GH_TOKEN);
  });

  it("an allow-list refuses other GitHub accounts", async () => {
    env = baseEnv({ STRATOVELL_ALLOWED_GITHUB_LOGINS: "Advisor-A" });
    await signIn("code-a");
    const start = await handleSignInStart(new Request(`${ORIGIN}/api/auth/github/start`), deps());
    const res = await handleSignInCallback(new Request(`${ORIGIN}/api/auth/github/callback?code=code-b&state=${new URL(start.headers.get("location")!).searchParams.get("state")}`, { headers: { cookie: cookieValue(start, "stratovell_oauth")! } }), deps());
    expect(res.status).toBe(403);
    expect((await sql.query("select login from stratovell_users")).rows).toEqual([{ login: "advisor-a" }]);
  });

  it("a sign-in expires after 12 hours", async () => {
    const auth = await signIn("code-a");
    clock = new Date(T0.getTime() + 12 * 3_600_000 + 1000);
    expect((await status(auth)).hosted.user).toBeNull();
  });

  it("dev sign-in is refused unless enabled for a local origin", async () => {
    const res = await handleDevSignIn(post("/api/auth/dev-signin", { login: "test-advisor" }), deps());
    expect(res.status).toBe(404);
  });
});

describe("authorization on every credential, session and analysis operation", () => {
  it("signed-out and cross-origin requests are refused before anything is read or spent", async () => {
    const auth = await signIn("code-a");
    expect((await handleHostedConnection(post("/api/copilot/hosted/connection", { action: "save", key: KEY_A }), deps())).status).toBe(401);
    expect((await handleHostedSession(post("/api/copilot/hosted/session", { action: "start", allowance: ALLOWANCE }), deps())).status).toBe(401);
    expect((await analyze(await analysisBody("claude"), "")).status).toBe(401);
    for (const origin of ["https://evil.invalid", null]) {
      expect((await handleHostedConnection(post("/api/copilot/hosted/connection", { action: "save", key: KEY_A }, { cookie: auth, origin }), deps())).status).toBe(403);
      expect((await analyze(await analysisBody("claude"), auth, deps())).status).not.toBe(200);
    }
    expect((await sql.query("select * from stratovell_credentials")).rows).toEqual([]);
    expect(keysUsed).toEqual([]);
  });

  it("users are isolated: one user's key, session and cookie never serve another", async () => {
    const a = await signIn("code-a");
    const b = await signIn("code-b");
    await handleHostedConnection(post("/api/copilot/hosted/connection", { action: "save", key: KEY_A }, { cookie: a }), deps());
    const liveA = await startSession(a);
    // B has no key: B's status shows none, and B can't start a session or run.
    expect((await status(b)).hosted.connection?.status).toBe("none");
    const bStart = await handleHostedSession(post("/api/copilot/hosted/session", { action: "start", allowance: ALLOWANCE }, { cookie: b }), deps());
    expect(bStart.status).toBe(409);
    // B presenting A's session cookie still reaches only B's own (empty) session.
    const stolen = await analyze(await analysisBody("claude"), cookieHeader(b, liveA));
    expect(stolen.status).toBe(403);
    expect(((await stolen.json()) as { code: string }).code).toBe("no_credential");
    // A's run uses A's key only.
    const ok = await analyze(await analysisBody("claude"), cookieHeader(a, liveA));
    expect(ok.status).toBe(200);
    expect(keysUsed).toEqual([KEY_A]);
    await handleHostedConnection(post("/api/copilot/hosted/connection", { action: "save", key: KEY_B }, { cookie: b }), deps());
    const liveB = await startSession(b);
    expect((await analyze(await analysisBody("claude"), cookieHeader(b, liveB))).status).toBe(200);
    expect(keysUsed).toEqual([KEY_A, KEY_B]);
    const [sa, sb] = [(await status(cookieHeader(a, liveA))).hosted.session!, (await status(cookieHeader(b, liveB))).hosted.session!];
    expect(sa.used.runs).toBe(1);
    expect(sb.used.runs).toBe(1);
    expect(sa.id).not.toBe(sb.id);
  });
});

describe("credentials", () => {
  it("saving is masked and offline: never returned, never stored in clear, no provider request; status 'Saved · not yet verified' until an analysis succeeds", async () => {
    const a = await signIn("code-a");
    const before = fetchCalls.length;
    const res = await record(await handleHostedConnection(post("/api/copilot/hosted/connection", { action: "save", key: KEY_A }, { cookie: a }), deps()));
    expect(res.status).toBe(200);
    const view = ((await res.json()) as { connection: { status: string; label: string } }).connection;
    expect(view).toMatchObject({ status: "saved", label: "Saved · not yet verified" });
    expect(fetchCalls.length).toBe(before);
    expect(keysUsed).toEqual([]);
    const row = (await sql.query<Record<string, string>>("select * from stratovell_credentials")).rows[0];
    expect(JSON.stringify(row)).not.toContain(KEY_A);
    expect(JSON.stringify(row)).not.toContain(KEY_A.slice(12, 40));
    // The ciphertext is bound to its user and revision.
    const ring = keyRingFrom(RING);
    const sealed = { keyId: row.key_id, iv: row.iv, tag: row.tag, ciphertext: row.ciphertext };
    expect(open(ring, sealed, String(row.user_id), row.revision)).toBe(KEY_A);
    expect(open(ring, sealed, "another-user", row.revision)).toBeNull();
    expect(open(ring, sealed, String(row.user_id), "older-revision")).toBeNull();
    expect(open(keyRingFrom(`k2:${Buffer.alloc(32, 9).toString("base64")}`), sealed, String(row.user_id), row.revision)).toBeNull();
    // Starting a session reads the key but sends nothing.
    const live = await startSession(a);
    expect(keysUsed).toEqual([]);
    expect(providerCalls).toEqual([]);
    expect((await analyze(await analysisBody("claude"), cookieHeader(a, live))).status).toBe(200);
    expect((await status(a)).hosted.connection).toMatchObject({ status: "verified", label: "Verified" });
  });

  it("a rejected key shows as rejected; a key-shape problem is refused locally without echoing the value", async () => {
    const a = await signIn("code-a");
    const bad = await record(await handleHostedConnection(post("/api/copilot/hosted/connection", { action: "save", key: "sk-ant-admin01-SYNTHETIC-ADMIN-KEY-xxxxxxxxxxxx" }, { cookie: a }), deps()));
    expect(bad.status).toBe(400);
    expect(await bad.text()).not.toContain("SYNTHETIC-ADMIN");
    await handleHostedConnection(post("/api/copilot/hosted/connection", { action: "save", key: KEY_A }, { cookie: a }), deps());
    const live = await startSession(a);
    script = async () => {
      throw new Anthropic.AuthenticationError(401, { error: { message: "invalid x-api-key" } }, "invalid x-api-key", new Headers());
    };
    await analyze(await analysisBody("claude"), cookieHeader(a, live));
    expect((await status(a)).hosted.connection).toMatchObject({ status: "rejected", label: "Rejected" });
  });

  it("Disconnect deletes the key and stops the session; counters are kept; replacing the key ends the old session", async () => {
    const a = await signIn("code-a");
    await handleHostedConnection(post("/api/copilot/hosted/connection", { action: "save", key: KEY_A }, { cookie: a }), deps());
    let live = await startSession(a);
    await analyze(await analysisBody("claude"), cookieHeader(a, live));
    await handleHostedConnection(post("/api/copilot/hosted/connection", { action: "save", key: KEY_B }, { cookie: a }), deps());
    let s = (await status(cookieHeader(a, live))).hosted.session!;
    expect(s.status).toBe("stopped");
    expect(s.message).toMatch(/replaced/);
    expect(s.used.runs).toBe(1);
    live = await startSession(a);
    expect((await sql.query("select count(*)::int as n from stratovell_live_session_archive")).rows[0]).toEqual({ n: 1 });
    const disc = await record(await handleHostedConnection(post("/api/copilot/hosted/connection", { action: "disconnect" }, { cookie: a }), deps()));
    expect(disc.status).toBe(200);
    expect((await sql.query("select * from stratovell_credentials")).rows).toEqual([]);
    s = (await status(cookieHeader(a, live))).hosted.session!;
    expect(s.status).toBe("stopped");
    const refused = await analyze(await analysisBody("claude"), cookieHeader(a, live));
    expect(refused.status).toBe(403);
    expect(keysUsed).toEqual([KEY_A]);
  });
});

describe("sessions and spending", () => {
  async function ready(allowance = ALLOWANCE) {
    const a = await signIn("code-a");
    await handleHostedConnection(post("/api/copilot/hosted/connection", { action: "save", key: KEY_A }, { cookie: a }), deps());
    return { a, live: await startSession(a, allowance) };
  }

  it("the allowance must be confirmed in full and can only be lowered", async () => {
    const a = await signIn("code-a");
    await handleHostedConnection(post("/api/copilot/hosted/connection", { action: "save", key: KEY_A }, { cookie: a }), deps());
    expect((await handleHostedSession(post("/api/copilot/hosted/session", { action: "start" }, { cookie: a }), deps())).status).toBe(400);
    expect((await handleHostedSession(post("/api/copilot/hosted/session", { action: "start", allowance: { ...ALLOWANCE, usd: 50 } }, { cookie: a }), deps())).status).toBe(400);
    expect((await handleHostedSession(post("/api/copilot/hosted/session", { action: "start", allowance: { ...ALLOWANCE, runs: 9 } }, { cookie: a }), deps())).status).toBe(400);
  });

  it("concurrent analyses across two server instances: exactly one runs at a time; the rest are refused before any provider request", async () => {
    const { a, live } = await ready();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    script = async (n) => {
      if (n === 0) await gate;
      return answer("A synthetic answer.");
    };
    const instance1 = deps();
    const instance2 = deps();
    const body = await analysisBody("claude");
    const first = analyze(body, cookieHeader(a, live), instance1);
    await new Promise((r) => setTimeout(r, 50));
    const others = await Promise.all([1, 2, 3, 4].map((i) => analyze(body, cookieHeader(a, live), i % 2 ? instance1 : instance2)));
    expect(others.map((r) => r.status)).toEqual([409, 409, 409, 409]);
    release();
    expect((await first).status).toBe(200);
    expect(providerCalls.length).toBe(1);
    const s = (await status(cookieHeader(a, live))).hosted.session!;
    expect(s.used.runs).toBe(1);
    expect(s.used.requests).toBe(1);
  });

  it("concurrent reservations can't exceed the request limit, even from separate admitted runs' racing requests", async () => {
    const a = await signIn("code-a");
    const userId = String((await sql.query<{ id: string }>("select id from stratovell_users")).rows[0].id);
    const backend = userSessionBackend(sql, userId);
    const armed = await sessions.armSession(backend, clock, "anthropic", { allowance: { ...ALLOWANCE, requests: 3 }, credentialRevision: null, claim: true });
    expect(armed.ok).toBe(true);
    const run = await sessions.admitRun(backend, clock, armed.ok ? armed.cookie : null, 0.1, "anthropic", null);
    expect(run.ok).toBe(true);
    const runId = run.ok ? run.runId : "";
    const results = await Promise.all(Array.from({ length: 8 }, () => sessions.reserveRequest(backend, clock, runId, "anthropic", () => 0.2, null)));
    expect(results.filter((r) => r.ok).length).toBe(3);
    const view = await sessions.readView(backend, clock, null);
    expect(view.used.requests).toBe(3);
    expect(view.used.committedUsd).toBeCloseTo(0.6, 6);
    void a;
  });

  it("a failed request keeps its worst-case reservation as spend, and a retry the guard can't cover is refused before it is sent", async () => {
    const { a, live } = await ready();
    script = async () => {
      throw new Anthropic.InternalServerError(529, { error: { message: "overloaded" } }, "overloaded", new Headers());
    };
    const res = await analyze(await analysisBody("claude"), cookieHeader(a, live));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; live: { stoppedBy: string | null; run: { requests: number; retainedUsd: number } } };
    // Each request is reserved at its worst case (about USD 2.71 here), so the USD 5 guard covers one unsettled request:
    // the failed one keeps its reservation, and the retry is refused by the session before any provider call.
    expect(providerCalls.length).toBe(1);
    expect(body.live.run.requests).toBe(1);
    expect(body.live.stoppedBy).toMatch(/USD 5 spending guard/);
    const s1 = (await status(cookieHeader(a, live))).hosted.session!;
    expect(s1.used.requests).toBe(1);
    expect(s1.used.retainedUsd).toBeCloseTo(body.live.run.retainedUsd, 6);
    expect(s1.used.retainedUsd).toBeGreaterThan(2);
    expect(s1.status).toBe("exhausted");
    // A refresh, or another server instance, reads the same counters; nothing resets them.
    const again = (await status(cookieHeader(a, live))).hosted.session!;
    expect(again.used).toEqual(s1.used);
    expect((await analyze(await analysisBody("claude"), cookieHeader(a, live))).status).toBe(429);
    expect(providerCalls.length).toBe(1);
  });

  it("Stop cancels the run in flight; its reservation is kept as spend and the session refuses further runs", async () => {
    const { a, live } = await ready();
    let started!: () => void;
    const inFlight = new Promise<void>((r) => (started = r));
    script = async (_n, _p, signal) => {
      started();
      await new Promise<void>((_, reject) => signal?.addEventListener("abort", () => reject(new Anthropic.APIUserAbortError())));
      return answer("never");
    };
    const pending = analyze(await analysisBody("claude"), cookieHeader(a, live));
    await inFlight;
    const stop = await handleHostedSession(post("/api/copilot/hosted/session", { action: "stop" }, { cookie: cookieHeader(a, live) }), deps());
    expect(stop.status).toBe(200);
    expect(setCookies(stop).some((c) => /stratovell_live_session=;.*Max-Age=0/.test(c))).toBe(true);
    const done = (await (await pending).json()) as { status: string };
    expect(done.status).toBe("cancelled");
    const s = (await status(cookieHeader(a, live))).hosted.session!;
    expect(s.status).toBe("stopped");
    expect(s.used.requests).toBe(1);
    expect(s.used.retainedUsd).toBeGreaterThan(2);
    expect((await analyze(await analysisBody("claude"), cookieHeader(a, live))).status).toBe(403);
    expect(providerCalls.length).toBe(1);
  });

  it("a session expires after its minutes", async () => {
    const { a, live } = await ready({ ...ALLOWANCE, minutes: 5 });
    clock = new Date(T0.getTime() + 5 * 60_000 + 1);
    const res = await analyze(await analysisBody("claude"), cookieHeader(a, live));
    expect(res.status).toBe(403);
    expect(((await res.json()) as { code: string }).code).toBe("expired");
    expect(keysUsed).toEqual([]);
  });

  it("mode mismatch: the test provider never answers a Claude request, nor Claude a test-provider one", async () => {
    const { a, live } = await ready();
    const asTest = await analyze(await analysisBody("test_provider"), cookieHeader(a, live));
    expect(asTest.status).toBe(409);
    expect(((await asTest.json()) as { code: string }).code).toBe("run_mode_mismatch");
    env = baseEnv({ COPILOT_LIVE_PROVIDER: "fake" });
    const asClaude = await analyze(await analysisBody("claude"), cookieHeader(a, live));
    expect(asClaude.status).toBe(409);
    expect(((await asClaude.json()) as { code: string }).code).toBe("run_mode_mismatch");
    expect(keysUsed).toEqual([]);
  });

  it("reading status, saving a key and starting a session make no provider request and spend nothing", async () => {
    const { a, live } = await ready();
    await status(cookieHeader(a, live));
    await status(null);
    const s = (await status(cookieHeader(a, live))).hosted.session!;
    expect(s.used).toMatchObject({ runs: 0, requests: 0, committedUsd: 0 });
    expect(keysUsed).toEqual([]);
    expect(providerCalls).toEqual([]);
  });
});

describe("objectives and targets reach the real agent loop; private notes never do", () => {
  it("the brief's answers and the advisor-set targets reach the model through the tools; the private note doesn't", async () => {
    const { useAtlasStore } = await import("@/store/useStore");
    const st = useAtlasStore.getState();
    st.setDiscoveryAnswer("objectives", { primary: "preserve_wealth", secondary: ["reduce_concentration"] });
    st.setDiscoveryAnswer("timeHorizon", { years: 12 });
    st.setDiscoveryAnswer("liquidity", { need: "planned", amount: 150_000, currency: "USD", timing: "within_1_year" });
    st.setDiscoveryAnswer("taxSensitivity", { level: "high" });
    st.setDiscoveryAnswer("lossWillingness", { level: "moderate" });
    st.recordDiscoveryReview();
    st.setDiscoveryAnswer("lossAbility", { level: "low" });
    st.setClient({ advisorDiscoveryNotes: PRIVATE_NOTE });
    st.setDraftTarget("equity", 55);
    st.setDraftTarget("fixed_income", 35);
    const a = await signIn("code-a");
    await handleHostedConnection(post("/api/copilot/hosted/connection", { action: "save", key: KEY_A }, { cookie: a }), deps());
    const live = await startSession(a);
    script = async (n) => (n === 0 ? toolUse("get_portfolio_overview") : n === 1 ? toolUse("get_scope_overview") : answer("Synthetic analysis with follow-up questions."));
    const res = await analyze(await analysisBody("claude", "Analyze this portfolio for the client brief (synthetic)."), cookieHeader(a, live));
    expect(res.status).toBe(200);
    const seen = providerCalls.map((c) => c.messages).join("\n");
    expect(seen).toContain("Analyze this portfolio for the client brief (synthetic).");
    expect(seen).toMatch(/Preserve wealth/i);
    expect(seen).toMatch(/12 years/);
    expect(seen).toMatch(/150,000/);
    expect(seen).toMatch(/not_discussed|Not discussed/); // unknowns are sent as unknown
    expect(seen).toMatch(/changed|stale|not yet reviewed/i); // review status travels with the brief
    expect(seen).toContain("target_pct");
    expect(seen).toMatch(/advisor's own allocation target/);
    expect(seen).toMatch(/\\"target_pct\\":55/);
    expect(seen).not.toContain(PRIVATE_NOTE);
    const result = (await res.json()) as { drafts: unknown[]; mode: string; provider: { requestedModel: string } };
    expect(result.drafts).toEqual([]); // nothing is drafted unless Claude drafts it; no fixed trade
    expect(result.provider.requestedModel).toBe(COPILOT_MODEL);
  });

  it("a target edit makes an earlier preview stale, and creates no recommendation and sends nothing", async () => {
    const { useAtlasStore } = await import("@/store/useStore");
    const { agentContextOf, contextMismatch } = await import("@/copilot/context");
    const { copilotRequest } = await import("@/copilot/request");
    const before = copilotRequest(useAtlasStore.getState(), "").context;
    useAtlasStore.getState().setDraftTarget("equity", 50);
    const now = copilotRequest(useAtlasStore.getState(), "");
    expect(now.context.inputRevision).not.toBe(before.inputRevision);
    expect(contextMismatch(before, now.snapshot as never)).toMatch(/targets/);
    expect(agentContextOf(now.snapshot as never).inputRevision).toBe(now.context.inputRevision);
    expect(useAtlasStore.getState().recommendations).toEqual([]);
    expect(providerCalls).toEqual([]);
  });
});

describe("secrets stay out of outputs, logs, storage and backups", () => {
  it("no response, log line, database row or workspace backup ever contains a saved key or the GitHub token", async () => {
    const a = await signIn("code-a");
    await record(await handleHostedConnection(post("/api/copilot/hosted/connection", { action: "save", key: KEY_A }, { cookie: a }), deps()));
    const live = await startSession(a);
    await analyze(await analysisBody("claude"), cookieHeader(a, live));
    await record(await handleHostedConnection(post("/api/copilot/hosted/connection", { action: "save", key: KEY_A }, { cookie: a }), deps()));
    await record(await handleHostedConnection(post("/api/copilot/hosted/connection", { action: "disconnect" }, { cookie: a }), deps()));
    await status(a);
    expect(responses.length).toBeGreaterThan(5);
    const tables = ["stratovell_users", "stratovell_auth_sessions", "stratovell_credentials", "stratovell_live_sessions", "stratovell_live_session_archive"];
    const dump = (await Promise.all(tables.map(async (t) => JSON.stringify((await sql.query(`select * from ${t}`)).rows)))).join("\n");
    const { useAtlasStore } = await import("@/store/useStore");
    const { exportBackup } = await import("@/engines/workspaceBackup");
    const { DISCLOSURE_LIBRARY } = await import("@/domain/disclosureLibrary");
    const backup = exportBackup(useAtlasStore.getState(), T0, { disclosureIds: DISCLOSURE_LIBRARY.map((d) => d.id) });
    const everything = [...responses, ...logs, dump, backup.ok ? backup.text : "", JSON.stringify(useAtlasStore.getState())].join("\n");
    for (const secret of [KEY_A, KEY_A.slice(14, 44), GH_TOKEN]) expect(everything).not.toContain(secret);
  });

  it("seal/open round-trips and rotation: an older key id still decrypts", () => {
    const old = keyRingFrom(`k1:${Buffer.alloc(32, 1).toString("base64")}`);
    const sealed = seal(old, KEY_A, "user-1", "rev-1");
    const rotated = keyRingFrom(`k2:${Buffer.alloc(32, 2).toString("base64")},k1:${Buffer.alloc(32, 1).toString("base64")}`);
    expect(rotated.current.id).toBe("k2");
    expect(open(rotated, sealed, "user-1", "rev-1")).toBe(KEY_A);
  });
});
