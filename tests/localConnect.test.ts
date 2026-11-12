import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CopilotSnapshot } from "@/copilot/snapshot";
import type { WorkingDraft } from "@/domain/types";
import { COPILOT_MODEL, type MessagesClient } from "@/copilot/agent";
import { keychainStore } from "@/copilot/credentialStore";
import { execFileSync } from "node:child_process";
import { FIRST_REQUEST_USD, liveCookieName, resolveCredential, type LiveDeps } from "@/copilot/liveGate";
import * as sessions from "@/copilot/liveSessionStore";
import { accountFor, keyShapeProblem, keychainAccount, readConnection, recordConnection } from "@/copilot/localConnection";
import { PAIR_TOKEN_MINUTES, issuePairingToken } from "@/copilot/localPairing";
import { CSRF_HEADER, pairCookieName } from "@/copilot/localConnect";
import { instanceId } from "@/copilot/localFiles";
import { handleCopilotGet, handleCopilotPost, handleLiveSessionPost, handleLocalConnection, handleLocalPair } from "@/copilot/routeHandler";
import { ConnectClaude } from "@/components/copilot/ConnectClaude";
import { newWorkingDraft } from "@/engines/allocationDesk";
import { STORY_ACCOUNTS, STORY_HOLDINGS } from "@/data/allocationStory";
import { SEED_ADVISOR, SEED_CLIENT } from "@/data/seedClient";
import { DISCLOSURE_LIBRARY } from "@/domain/disclosureLibrary";
import { copilotRequest } from "./support/copilotRequest";
import { fakeKeychain, localDeps, type TestDeps } from "./support/localDeps";
// @ts-expect-error a plain .mjs script without types; only its pure helpers are used here
import { choosePort, doctor, openCommand, pairingLink, serverEnv } from "../scripts/atlas-local.mjs";

// Route 1 local onboarding (11 November 2026): pairing, Connect Claude and
// in-app sessions, through the real handlers, the real session store and the
// real accounting, with fake providers and fake credential stores only. No
// Anthropic call is made anywhere in this file, and no real key is used: the
// canary below is a made-up string. Synthetic data only.

const CANARY = "sk-ant-api03-CANARY-made-up-not-a-key-7f3a9d2c5b8e41";
const ENV_CANARY = "sk-ant-api03-ENVCANARY-made-up-not-a-key-0b1c2d3e4f";
const T0 = new Date("2026-11-11T12:00:00Z");
const ORIGIN = "http://127.0.0.1:3000";
const HOST = "127.0.0.1:3000";
const SAME = { host: HOST, origin: ORIGIN, "sec-fetch-site": "same-origin" };
const ENV = { COPILOT_MODE: "live" };
const FAKE_ENV = { COPILOT_MODE: "live", COPILOT_LIVE_PROVIDER: "fake" };
const FULL = { minutes: 30, runs: 3, requests: 10, usd: 5 };
const QUESTION = "Which position is most concentrated in this scope? (synthetic test question)";

let dir: string;
let clock: Date;
let logged: string[];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "atlas-connect-"));
  clock = T0;
  logged = [];
  for (const level of ["log", "info", "warn", "error", "debug"] as const) vi.spyOn(console, level).mockImplementation((...args: unknown[]) => void logged.push(args.map((a) => (a instanceof Error ? `${a.message} ${a.stack}` : typeof a === "string" ? a : JSON.stringify(a))).join(" ")));
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

function snap(): CopilotSnapshot & { workingDraft: WorkingDraft } {
  return {
    client: { ...SEED_CLIENT, id: "cli_connect", fullName: "Connect Test Household", proposalOutputCurrency: "USD" },
    advisor: SEED_ADVISOR,
    accounts: STORY_ACCOUNTS,
    holdings: STORY_HOLDINGS,
    fxRates: [],
    recommendations: [],
    disclosures: DISCLOSURE_LIBRARY,
    sourceDocuments: [],
    fxConfirmation: null,
    workingDraft: { ...newWorkingDraft(T0.toISOString()), scopeAccountIds: ["acc_story_invest"] },
    alternatives: [],
  } as CopilotSnapshot & { workingDraft: WorkingDraft };
}

// --- Fake provider and set-up -------------------------------------------------------

type Step = "answer" | "tool" | "auth_error" | "wait_abort" | (() => Promise<void> | void);
const USAGE = { input_tokens: 1_000, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
let ids = 0;
const message = (content: unknown[], stop: string) => ({ id: `msg_${++ids}`, type: "message", role: "assistant", model: COPILOT_MODEL, content, stop_reason: stop, stop_sequence: null, usage: USAGE }) as unknown as Anthropic.Beta.BetaMessage;

function fakeProvider(script: Step[] = ["answer"]) {
  const calls: string[] = [];
  const client: MessagesClient = {
    beta: {
      messages: {
        async create(params, options) {
          const step = script[Math.min(calls.length, script.length - 1)];
          calls.push(params.model);
          if (step === "auth_error") throw new Anthropic.AuthenticationError(401, { error: { message: "invalid x-api-key" } }, "invalid x-api-key", new Headers());
          if (step === "wait_abort") await new Promise<void>((_, reject) => options?.signal?.addEventListener("abort", () => reject(new Anthropic.APIUserAbortError())));
          if (typeof step === "function") {
            await step();
            return message([{ type: "tool_use", id: `toolu_${++ids}`, name: "get_scope_overview", input: {} }], "tool_use");
          }
          if (step === "tool") return message([{ type: "tool_use", id: `toolu_${++ids}`, name: "get_scope_overview", input: {} }], "tool_use");
          return message([{ type: "text", text: "Synthetic answer for human review: Equity ETF A is the largest position.", citations: null }], "end_turn");
        },
      },
    },
  };
  return { client, calls };
}

function setup(opts: { env?: Record<string, string | undefined>; script?: Step[]; keychain?: ReturnType<typeof fakeKeychain>; session?: Map<string, string> } = {}) {
  const fake = fakeProvider(opts.script);
  const t = localDeps({ dir, client: fake.client, env: opts.env ?? ENV, now: () => clock, keychain: opts.keychain, session: opts.session });
  return { ...t, fake };
}

/** This "browser": its cookies and the CSRF token the page holds. */
interface Browser {
  pair: string | null;
  live: string | null;
  csrf: string | null;
}
const browser = (): Browser => ({ pair: null, live: null, csrf: null });
/** One browser's cookie jar, as a header: instance-scoped names, so two Atlas instances don't overwrite each other. */
const cookieHeader = (b: Browser, env: Record<string, string | undefined> = { ATLAS_LOCAL_DIR: dir }) =>
  [b.pair && `${pairCookieName(env)}=${b.pair}`, b.live && `${liveCookieName(env)}=${b.live}`].filter(Boolean).join("; ");
const cookieValue = (res: Response) => decodeURIComponent(res.headers.get("set-cookie")!.split(";")[0].split("=").slice(1).join("="));

async function status(d: LiveDeps, b: Browser, headers: Record<string, string> = { host: HOST, "sec-fetch-site": "same-origin" }) {
  const res = await handleCopilotGet(new Request(`${ORIGIN}/api/copilot`, { headers: { ...headers, cookie: cookieHeader(b, d.env) } }), d);
  return (await res.json()) as { mode: string; live: { available: boolean; session: sessions.SessionView | null }; local: import("@/copilot/localConnect").LocalInfo | null };
}

/** Pairs as the launcher does: a one-time token, redeemed by a top-level navigation. */
async function pair(d: LiveDeps, b: Browser = browser()) {
  const { token } = await issuePairingToken(d.pairingFile, clock);
  const res = await handleLocalPair(new Request(`${ORIGIN}/api/copilot/local/pair?token=${token}`, { headers: { host: HOST, "sec-fetch-site": "none" } }), d);
  expect(res.status).toBe(303);
  b.pair = cookieValue(res);
  b.csrf = (await status(d, b)).local!.csrf;
  return { b, token, res };
}

const post = (handler: (req: Request, d: LiveDeps) => Promise<Response>, path: string) => (d: LiveDeps, b: Browser, body: unknown, over: { headers?: Record<string, string>; csrf?: string | null; contentType?: string } = {}) => {
  const csrf = over.csrf === undefined ? b.csrf : over.csrf;
  return handler(
    new Request(`${ORIGIN}${path}`, {
      method: "POST",
      headers: { ...(over.headers ?? SAME), "content-type": over.contentType ?? "application/json", ...(csrf ? { "x-atlas-csrf": csrf } : {}), cookie: cookieHeader(b, d.env) },
      body: JSON.stringify(body),
    }),
    d
  );
};
const connection = post(handleLocalConnection, "/api/copilot/local/connection");
const session = post(handleLiveSessionPost, "/api/copilot/live-session");
const save = (d: LiveDeps, b: Browser, key = CANARY, storage: "session" | "keychain" = "session") => connection(d, b, { action: "save", key, storage });

async function start(d: LiveDeps, b: Browser, allowance: unknown = FULL) {
  const res = await session(d, b, { action: "start", allowance });
  if (res.ok) b.live = cookieValue(res);
  return res;
}

const ask = (d: LiveDeps, b: Browser, signal?: AbortSignal) =>
  handleCopilotPost(new Request(`${ORIGIN}/api/copilot`, { method: "POST", headers: { ...SAME, "content-type": "application/json", cookie: cookieHeader(b, d.env) }, body: JSON.stringify(copilotRequest(QUESTION, snap())), signal }), d);

const view = (d: LiveDeps) => sessions.readView(d.sessionFile, clock, null);
/** Every file Atlas wrote for this "installation", as text. */
const everythingOnDisk = () =>
  readdirSync(dir)
    .map((f) => readFileSync(join(dir, f), "utf8"))
    .join("\n");

// --- Pairing ---------------------------------------------------------------------------

describe("trusted browser pairing", () => {
  it("pairs before any key exists, sets an HttpOnly cookie, and starts no session", async () => {
    const { d, made, fake } = setup();
    const unpaired = await status(d, browser());
    expect(unpaired.local).toMatchObject({ paired: false, csrf: null, connection: null, remember: null, environmentKey: false });

    const { b, token, res } = await pair(d);
    const set = res.headers.get("set-cookie")!;
    expect(set).toMatch(/HttpOnly/);
    expect(set).toMatch(/SameSite=Strict/);
    expect(set).toMatch(/Path=\/api\/copilot/);
    expect(res.headers.get("location")).toBe("/copilot");
    expect(res.headers.get("cache-control")).toBe("no-store");

    const paired = await status(d, b);
    expect(paired.local).toMatchObject({ paired: true, connection: { source: "none", status: "none" }, ceilings: FULL });
    expect(paired.local!.csrf).toMatch(/^[0-9a-f]{64}$/);
    // Pairing is permission to manage the connection, not an allowance.
    expect(existsSync(d.sessionFile)).toBe(false);
    expect(paired.live.session).toMatchObject({ status: "unarmed" });
    expect(made.count).toBe(0);
    expect(fake.calls).toHaveLength(0);
    // Only hashes are stored.
    const record = readFileSync(d.pairingFile, "utf8");
    for (const secret of [token, b.pair!, b.csrf!]) expect(record).not.toContain(secret);
  });

  it("refuses a replayed, expired, superseded or made-up link, and a link opened from another site or host", async () => {
    const { d } = setup();
    const open = (token: string, headers: Record<string, string> = { host: HOST, "sec-fetch-site": "none" }, deps = d) => handleLocalPair(new Request(`${ORIGIN}/api/copilot/local/pair?token=${token}`, { headers }), deps);

    const first = await issuePairingToken(d.pairingFile, clock);
    expect((await open(first.token)).status).toBe(303);
    const replay = await open(first.token);
    expect(replay.status).toBe(403);
    expect(replay.headers.get("set-cookie")).toBeNull();
    expect(await replay.text()).toMatch(/already used/);

    const stale = await issuePairingToken(d.pairingFile, clock);
    clock = new Date(T0.getTime() + (PAIR_TOKEN_MINUTES + 1) * 60_000);
    expect((await open(stale.token)).status).toBe(403);

    const older = await issuePairingToken(d.pairingFile, clock);
    const newer = await issuePairingToken(d.pairingFile, clock);
    expect((await open(older.token)).status).toBe(403);
    expect((await open("made-up")).status).toBe(403);
    expect((await open("")).status).toBe(403);
    // Refusals don't burn the valid link, and it isn't accepted from elsewhere.
    expect((await open(newer.token, { host: HOST, "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect((await open(newer.token, { host: "atlas.example:3000", "sec-fetch-site": "none" })).status).toBe(403);
    expect((await open(newer.token, { host: HOST, "sec-fetch-site": "none", "x-forwarded-for": "203.0.113.9" })).status).toBe(403);
    expect((await open(newer.token, undefined, { ...d, env: { ...ENV, VERCEL: "1" } })).status).toBe(503);
    expect((await open(newer.token, undefined, { ...d, env: {} })).status).toBe(503);
    expect((await open(newer.token)).status).toBe(303);
  });

  it("an expired pairing no longer manages anything", async () => {
    const { d } = setup();
    const { b } = await pair(d);
    clock = new Date(T0.getTime() + 8 * 86_400_000);
    expect((await status(d, b)).local).toMatchObject({ paired: false, csrf: null });
    expect((await save(d, b)).status).toBe(401);
  });
});

// --- Authorization of every change -------------------------------------------------------

describe("credential changes and session starts need pairing, a CSRF token and a local same-origin request", () => {
  const actions: [string, (d: LiveDeps, b: Browser, over?: Parameters<typeof connection>[3]) => Promise<Response>][] = [
    ["save a key", (d, b, over) => connection(d, b, { action: "save", key: CANARY, storage: "session" }, over)],
    ["remember a key", (d, b, over) => connection(d, b, { action: "save", key: CANARY, storage: "keychain" }, over)],
    ["use the environment key", (d, b, over) => connection(d, b, { action: "use_environment" }, over)],
    ["disconnect", (d, b, over) => connection(d, b, { action: "disconnect" }, over)],
    ["start a session", (d, b, over) => session(d, b, { action: "start", allowance: FULL }, over)],
  ];

  for (const [name, act] of actions) {
    it(`${name}: refused unpaired, without or with another browser's token, cross-origin, forwarded, rebound or hosted, before anything is touched`, async () => {
      const t = setup({ env: { ...ENV, ANTHROPIC_API_KEY: ENV_CANARY } });
      const { d } = t;
      const code = async (res: Response) => ({ status: res.status, code: (await res.json()).code });

      // Not paired: a local address and a same-origin header are not authentication.
      expect(await code(await act(d, browser()))).toEqual({ status: 401, code: "not_paired" });
      expect(await code(await act(d, { pair: "made-up-cookie", live: null, csrf: "made-up" }))).toEqual({ status: 401, code: "not_paired" });

      const { b } = await pair(d);
      const other = (await pair(d)).b;
      expect(await code(await act(d, b, { csrf: null }))).toEqual({ status: 403, code: "bad_csrf" });
      expect(await code(await act(d, b, { csrf: "0".repeat(64) }))).toEqual({ status: 403, code: "bad_csrf" });
      expect(await code(await act(d, b, { csrf: other.csrf }))).toEqual({ status: 403, code: "bad_csrf" });

      const foreign: Record<string, string>[] = [
        { host: HOST, origin: "http://evil.example", "sec-fetch-site": "cross-site" },
        { host: HOST, origin: "http://evil.example" },
        { host: HOST, origin: "http://127.0.0.1:9999", "sec-fetch-site": "same-site" },
        { host: HOST, "sec-fetch-site": "same-origin" }, // no Origin at all
        { host: "atlas.example:3000", origin: "http://atlas.example:3000", "sec-fetch-site": "same-origin" }, // DNS rebinding: a foreign name resolving here
        { ...SAME, "x-forwarded-for": "203.0.113.9" },
        { ...SAME, "x-forwarded-host": "atlas.example" },
      ];
      for (const headers of foreign)
        expect(await code(await act(d, b, { headers })), JSON.stringify(headers)).toEqual({ status: 403, code: "not_local" });

      expect((await act(d, b, { contentType: "text/plain" })).status).toBe(415);
      for (const env of [{ ...ENV, VERCEL: "1" }, { ...ENV, VERCEL_ENV: "preview" }, { ...ENV, ANTHROPIC_BASE_URL: "https://proxy.example" }, { COPILOT_MODE: "demo" }, {}]) expect((await act({ ...d, env }, b)).status).toBe(503);

      // Nothing was read, stored, started or sent.
      expect(await readConnection(d.connectionFile)).toMatchObject({ source: "none", revision: null });
      expect(t.session.size).toBe(0);
      expect(t.keychain.calls).toEqual({ get: 0, set: 0, delete: 0 });
      expect(existsSync(d.sessionFile)).toBe(false);
      expect(t.made.count).toBe(0);
      expect(t.fake.calls).toHaveLength(0);
    });
  }

  it("an asking request without a connected key or a session never reaches a provider", async () => {
    const t = setup({ env: { ...ENV, ANTHROPIC_API_KEY: ENV_CANARY } });
    const { b } = await pair(t.d);
    // A key in the environment is not used just because it is there.
    const res = await ask(t.d, b);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "no_credential" });
    expect((await start(t.d, b)).status).toBe(409);
    expect(t.made.count).toBe(0);
  });
});

// --- Saving, remembering and removing the key ------------------------------------------------

describe("the key is kept server-side, where the user chose, and never comes back", () => {
  it("saving makes no provider request, says the connection isn't verified, and leaves no trace of the key outside its store", async () => {
    const t = setup();
    const { b } = await pair(t.d);
    const res = await save(t.d, b);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).not.toContain(CANARY);
    expect(JSON.parse(body).connection).toMatchObject({ source: "session", status: "saved", verifiedAt: null, message: expect.stringMatching(/not yet verified/) });
    expect(res.headers.get("cache-control")).toBe("no-store");

    // No provider client was built, and nothing was sent.
    expect(t.made.count).toBe(0);
    expect(t.fake.calls).toHaveLength(0);
    // In the chosen store only.
    expect([...t.session.values()]).toEqual([CANARY]);
    expect(t.keychain.map.size).toBe(0);
    // Not in any record, status response or log, in whole or in part.
    const s = await status(t.d, b);
    for (const text of [everythingOnDisk(), JSON.stringify(s), logged.join("\n")]) {
      expect(text).not.toContain(CANARY);
      expect(text).not.toContain(CANARY.slice(-8));
      expect(text).not.toContain("CANARY");
    }
    expect(Object.keys(JSON.parse(readFileSync(t.d.connectionFile, "utf8"))).sort()).toEqual(["fingerprint", "pending", "rejectedAt", "revision", "salt", "savedAt", "slot", "source", "verifiedAt", "version"]);
    expect(s.local!.connection).toMatchObject({ status: "saved" });
    // Loading the screen again changes nothing and still sends nothing.
    await status(t.d, b);
    expect(t.made.count).toBe(0);
  });

  it("refuses Admin keys and things that aren't keys, storing nothing", async () => {
    expect(keyShapeProblem("sk-ant-admin01-abcdefghijklmnopqrstuvwxyz")).toMatch(/Admin API key/);
    expect(keyShapeProblem(CANARY)).toBeNull();
    const t = setup();
    const { b } = await pair(t.d);
    for (const key of ["sk-ant-admin01-CANARY-abcdefghijklmnopqrstuvwxyz", "not a key", "", "sk-ant-short", `sk-ant-${"x".repeat(600)}`, 42, null]) {
      const res = await connection(t.d, b, { action: "save", key, storage: "session" });
      expect(res.status, String(key)).toBe(400);
      expect(await res.text()).not.toContain("CANARY");
    }
    expect((await connection(t.d, b, { action: "save", key: CANARY, storage: "a-file" })).status).toBe(400);
    expect((await connection(t.d, b, { action: "export" })).status).toBe(400);
    // Past the body limit it never reaches the key check: it is refused as oversized.
    expect((await connection(t.d, b, { action: "save", key: `sk-ant-${"x".repeat(5_000)}`, storage: "session" })).status).toBe(413);
    expect(t.session.size).toBe(0);
    expect(await readConnection(t.d.connectionFile)).toMatchObject({ source: "none" });
  });

  it("remembers in the OS credential store when asked, and nowhere else", async () => {
    const t = setup();
    const { b } = await pair(t.d);
    expect((await status(t.d, b)).local!.remember).toEqual({ available: true, reason: null });
    const res = await save(t.d, b, CANARY, "keychain");
    expect(res.status).toBe(200);
    expect((await res.json()).connection).toMatchObject({ source: "keychain", status: "saved" });
    expect([...t.keychain.map.values()]).toEqual([CANARY]);
    expect(t.session.size).toBe(0);
    expect(everythingOnDisk()).not.toContain(CANARY);
    // The status read never opens the OS store.
    const gets = t.keychain.calls.get;
    await status(t.d, b);
    expect(t.keychain.calls.get).toBe(gets);
  });

  it("an unsupported or locked credential store refuses the save with a reason, falls back to nothing, and session-only still works", async () => {
    for (const state of [{ unsupported: true }, { locked: true }]) {
      rmSync(dir, { recursive: true, force: true });
      dir = mkdtempSync(join(tmpdir(), "atlas-connect-"));
      const t = setup({ keychain: fakeKeychain(state) });
      const { b } = await pair(t.d);
      if (state.unsupported) expect((await status(t.d, b)).local!.remember).toMatchObject({ available: false, reason: expect.stringMatching(/isn't available/) });
      const res = await save(t.d, b, CANARY, "keychain");
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body).toMatchObject({ code: "remember_unavailable", error: expect.stringMatching(/Nothing was saved.*this server session only/) });
      // No plaintext fallback, no memory fallback, no connection.
      expect(t.keychain.map.size).toBe(0);
      expect(t.session.size).toBe(0);
      expect(everythingOnDisk()).not.toContain("CANARY");
      expect(await readConnection(t.d.connectionFile)).toMatchObject({ source: "none" });
      // The user's explicit second choice works.
      expect((await save(t.d, b, CANARY, "session")).status).toBe(200);
      expect(await readConnection(t.d.connectionFile)).toMatchObject({ source: "session" });
    }
  });

  it("a failed replacement leaves the earlier connection and its session standing", async () => {
    const keychain = fakeKeychain();
    const t = setup({ keychain });
    const { b } = await pair(t.d);
    await save(t.d, b, CANARY, "session");
    const before = await readConnection(t.d.connectionFile);
    expect((await start(t.d, b)).status).toBe(200);
    keychain.state.locked = true;
    expect((await save(t.d, b, `${CANARY}-second`, "keychain")).status).toBe(503);
    expect(await readConnection(t.d.connectionFile)).toEqual(before);
    expect((await ask(t.d, b)).status).toBe(200);
    expect(t.made.keys).toEqual([CANARY]);
  });

  it("the real credential-store adapter fails closed when the component is missing or the store errors, without echoing the key", async () => {
    const missing = keychainStore("Atlas test", async () => null);
    expect(await missing.available()).toMatchObject({ ok: false });
    // Nothing was attempted, so this is the one case that can honestly say nothing was stored.
    expect(await missing.set("a", CANARY)).toMatchObject({ ok: false, maybeStored: false, reason: expect.stringMatching(/isn't available/) });

    class Locked {
      async setPassword(): Promise<void> {
        throw new Error(`native failure mentioning ${CANARY}`);
      }
      async getPassword(): Promise<string | null> {
        throw new Error(`native failure mentioning ${CANARY}`);
      }
      async deletePassword(): Promise<boolean> {
        throw new Error("locked");
      }
    }
    const locked = keychainStore("Atlas test", async () => ({ AsyncEntry: Locked }));
    const write = await locked.set("a", CANARY);
    // A native write that throws may still have stored something, so it is never reported as "nothing stored".
    expect(write).toMatchObject({ ok: false, maybeStored: true, reason: expect.stringMatching(/credential store couldn't/) });
    expect(JSON.stringify(write)).not.toContain("CANARY");
    expect(await locked.delete("a")).toMatchObject({ ok: false, reason: expect.stringMatching(/credential store couldn't/) });
    const readErr = await locked.get("a").then(
      () => null,
      (e: Error) => e
    );
    expect(readErr?.message).toMatch(/credential store couldn't/);
    expect(readErr?.message).not.toContain("CANARY");
    // A write that doesn't read back the same value is never reported as remembered.
    class Forgetful extends Locked {
      async setPassword() {}
      async getPassword() {
        return null;
      }
    }
    expect(await keychainStore("Atlas test", async () => ({ AsyncEntry: Forgetful })).set("a", CANARY)).toMatchObject({ ok: false, maybeStored: true, reason: expect.stringMatching(/couldn't keep/) });
  });

  it("the environment key is an explicit, externally managed choice; Atlas never switches to it on its own", async () => {
    const keychain = fakeKeychain();
    const t = setup({ env: { ...ENV, ANTHROPIC_API_KEY: ENV_CANARY }, keychain });
    const { b } = await pair(t.d);
    expect((await status(t.d, b)).local).toMatchObject({ environmentKey: true, connection: { source: "none" } });

    // A remembered key that has gone missing doesn't fall back to the environment key.
    await save(t.d, b, CANARY, "keychain");
    keychain.map.clear();
    const refusedStart = await start(t.d, b);
    expect(refusedStart.status).toBe(409);
    expect(await refusedStart.json()).toMatchObject({ code: "credential_missing" });
    expect(t.made.count).toBe(0);

    // Selected explicitly: used, labelled as managed outside Atlas, and still never echoed.
    const chosen = await connection(t.d, b, { action: "use_environment" });
    expect(chosen.status).toBe(200);
    const text = await chosen.text();
    expect(text).not.toContain("ENVCANARY");
    expect(JSON.parse(text).connection).toMatchObject({ source: "environment", message: expect.stringMatching(/managed outside Atlas/) });
    expect((await start(t.d, b)).status).toBe(200);
    expect((await ask(t.d, b)).status).toBe(200);
    expect(t.made.keys).toEqual([ENV_CANARY]);

    // A different environment value isn't picked up silently.
    const changed = { ...t.d, env: { ...ENV, ANTHROPIC_API_KEY: `${ENV_CANARY}-rotated` } };
    expect(await (await ask(changed, b)).json()).toMatchObject({ code: "credential_changed" });
    expect((await status(changed, b)).local!.connection).toMatchObject({ status: "changed" });
    // Disconnecting stops using it; Atlas can't remove it and says so.
    const off = await connection(t.d, b, { action: "disconnect" });
    expect(await off.json()).toMatchObject({ connection: { source: "none" }, warning: expect.stringMatching(/still set there/) });
    expect(await (await ask(t.d, b)).json()).toMatchObject({ code: "no_credential" });
    expect(t.made.keys).toEqual([ENV_CANARY]);
    expect(everythingOnDisk()).not.toContain("ENVCANARY");
  });

  it("\"saved\" becomes \"verified\" only after a real request succeeds, and \"rejected\" when the provider refuses the key", async () => {
    const t = setup({ script: ["answer", "auth_error"] });
    const { b } = await pair(t.d);
    await save(t.d, b);
    await start(t.d, b);
    expect((await status(t.d, b)).local!.connection).toMatchObject({ status: "saved", verifiedAt: null });

    const first = await ask(t.d, b);
    expect(first.status).toBe(200);
    expect(await first.text()).not.toContain("CANARY");
    expect(t.made.keys).toEqual([CANARY]);
    expect((await status(t.d, b)).local!.connection).toMatchObject({ status: "verified", verifiedAt: T0.toISOString() });

    clock = new Date(T0.getTime() + 60_000);
    const second = await ask(t.d, b);
    expect((await second.json()).status).toBe("failed");
    expect((await status(t.d, b)).local!.connection).toMatchObject({ status: "rejected", message: expect.stringMatching(/rejected this key/) });
    // The rejected request's charge is unknown: its reservation is kept.
    expect((await view(t.d)).used.retainedUsd).toBeCloseTo(FIRST_REQUEST_USD, 6);
    expect(logged.join("\n")).not.toContain("CANARY");
  });
});

// --- Sessions started in Atlas ---------------------------------------------------------------

describe("a session starts in Atlas only with an explicit, confirmed allowance at or below the ceilings", () => {
  it("needs every limit confirmed, never raises one, and makes no provider request", async () => {
    const t = setup();
    const { b } = await pair(t.d);
    await save(t.d, b);
    const bad = async (allowance: unknown) => {
      const res = await start(t.d, b, allowance);
      expect(res.status, JSON.stringify(allowance)).toBe(400);
      expect(res.headers.get("set-cookie")).toBeNull();
      return (await res.json()).error as string;
    };
    await bad(null);
    expect((await session(t.d, b, { action: "start" })).status).toBe(400);
    await bad({ minutes: 30, runs: 3, requests: 10 }); // the USD guard not confirmed
    expect(await bad({ ...FULL, usd: 5.01 })).toMatch(/lowered, not raised/);
    await bad({ ...FULL, runs: 4 });
    await bad({ ...FULL, requests: 11 });
    await bad({ ...FULL, minutes: 31 });
    await bad({ ...FULL, runs: 1.5 });
    await bad({ ...FULL, requests: 0 });
    await bad({ ...FULL, minutes: -5 });
    await bad({ ...FULL, usd: "5" });
    expect(await bad({ ...FULL, usd: 1 })).toMatch(/couldn't admit one request/);
    expect(existsSync(t.d.sessionFile)).toBe(false);

    const lowered = { minutes: 10, runs: 1, requests: 5, usd: 4 };
    const res = await start(t.d, b, lowered);
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/HttpOnly; SameSite=Strict/);
    const body = await res.json();
    expect(body.live.session).toMatchObject({ status: "active", limits: { ...lowered, activeRuns: 1 }, used: { runs: 0, requests: 0 }, remaining: { runs: 1, requests: 5, usd: 4 } });
    expect(body.live.session.expiresAt).toBe(new Date(T0.getTime() + 10 * 60_000).toISOString());
    expect(JSON.stringify(body)).not.toContain(b.live!);
    expect(t.made.count).toBe(0);
    expect(t.fake.calls).toHaveLength(0);

    // The lowered limits are the ones enforced.
    expect((await ask(t.d, b)).status).toBe(200);
    const again = await ask(t.d, b);
    expect(again.status).toBe(429);
    expect(await again.json()).toMatchObject({ code: "exhausted", error: expect.stringMatching(/1 agent run is used up/) });
    clock = new Date(T0.getTime() + 11 * 60_000);
    expect((await view(t.d)).status).toBe("expired");
  });

  it("a stored allowance above a ceiling is never honoured", async () => {
    const t = setup();
    const { b } = await pair(t.d);
    await save(t.d, b);
    await start(t.d, b);
    const record = JSON.parse(readFileSync(t.d.sessionFile, "utf8"));
    const { saveJson } = await import("@/copilot/localFiles");
    saveJson(t.d.sessionFile, { ...record, limits: { ...record.limits, usd: 500, requests: 1_000 } });
    expect(await (await ask(t.d, b)).json()).toMatchObject({ code: "invalid_session" });
    expect(t.made.count).toBe(0);
  });

  it("of several starts at once, one succeeds; a refresh or another start never resets the counters", async () => {
    const t = setup();
    const { b } = await pair(t.d);
    await save(t.d, b);
    const results = await Promise.all(Array.from({ length: 6 }, () => session(t.d, b, { action: "start", allowance: FULL })));
    const won = results.filter((r) => r.status === 200);
    expect(won).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(5);
    b.live = cookieValue(won[0]);

    expect((await ask(t.d, b)).status).toBe(200);
    const used = (await view(t.d)).used;
    expect(used).toMatchObject({ runs: 1, requests: 1 });
    // Reloading the page, pairing another tab's worth of status reads, or asking to start again changes nothing.
    await status(t.d, b);
    await status(t.d, b);
    const restart = await start(t.d, { ...b });
    expect(restart.status).toBe(409);
    expect(await restart.json()).toMatchObject({ code: "already_armed" });
    expect((await view(t.d)).used).toEqual(used);
    // A new allowance needs the explicit steps: stop, then start.
    expect((await session(t.d, b, { action: "stop" })).status).toBe(200);
    expect((await start(t.d, b)).status).toBe(200);
    expect((await view(t.d)).used).toMatchObject({ runs: 0, requests: 0 });
  });

  it("the fake provider can be rehearsed with no key at all, and never becomes a paid session", async () => {
    const t = setup({ env: FAKE_ENV });
    const { b } = await pair(t.d);
    expect((await status(t.d, b)).local!.connection).toMatchObject({ status: "none", message: expect.stringMatching(/fake provider needs none/) });
    expect((await start(t.d, b)).status).toBe(200);
    expect((await ask(t.d, b)).status).toBe(200);
    expect(t.made.count).toBe(0);
    // The same session under Anthropic: no key, then a key, and it is still refused before any client exists.
    const paid = { ...t.d, env: ENV };
    expect(await (await ask(paid, b)).json()).toMatchObject({ code: "no_credential" });
    await save(paid, b);
    expect((await ask(paid, b)).status).toBe(403);
    expect(t.made.count).toBe(0);
    expect(t.session.size).toBe(1);
  });
});

describe("a session is bound to the key it started under", () => {
  it("replacing the key stops the session; its counters stay; a new allowance needs a new start", async () => {
    const t = setup({ script: ["tool", "answer"] });
    const { b } = await pair(t.d);
    await save(t.d, b);
    await start(t.d, b);
    expect((await ask(t.d, b)).status).toBe(200);
    const before = (await view(t.d)).used;
    expect(before).toMatchObject({ runs: 1, requests: 2 });

    const replaced = await save(t.d, b, `${CANARY}-replacement`, "session");
    expect(replaced.status).toBe(200);
    expect([...t.session.values()]).toEqual([`${CANARY}-replacement`]);
    const stopped = await view(t.d);
    expect(stopped.status).toBe("stopped");
    expect(stopped.message).toMatch(/API key was replaced/);
    expect(stopped.used).toEqual(before);

    const res = await ask(t.d, b);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "stopped" });
    expect(t.made.count).toBe(1);
    // Explicitly started again, under the new key.
    expect((await start(t.d, b)).status).toBe(200);
    expect((await ask(t.d, b)).status).toBe(200);
    expect(t.made.keys).toEqual([CANARY, `${CANARY}-replacement`]);
  });

  it("disconnecting stops the session and removes the stored key", async () => {
    const t = setup();
    const { b } = await pair(t.d);
    await save(t.d, b, CANARY, "keychain");
    await start(t.d, b);
    const res = await connection(t.d, b, { action: "disconnect" });
    expect(await res.json()).toMatchObject({ connection: { source: "none", status: "none" }, warning: null });
    expect(t.keychain.map.size).toBe(0);
    expect((await view(t.d)).status).toBe("stopped");
    expect((await ask(t.d, b)).status).toBe(403);
    expect((await start(t.d, b)).status).toBe(409);
    expect(t.made.count).toBe(0);
  });

  it("a key changed without the session being stopped is still refused, at admission and before the next request of a run in flight", async () => {
    // At admission: the connection's revision moved on (as if the stop had failed).
    const t = setup();
    const { b } = await pair(t.d);
    await save(t.d, b);
    await start(t.d, b);
    const conn = await recordConnection(t.d.connectionFile, clock, "session", `${CANARY}-other`, "b");
    t.session.clear();
    t.session.set(accountFor(conn.salt, conn.slot!), `${CANARY}-other`);
    const res = await ask(t.d, b);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toMatchObject({ code: "credential_mismatch", live: { status: "credential_mismatch" } });
    expect(t.made.count).toBe(0);

    // Mid-run: the key is replaced while the first request is in flight; the second request is never sent.
    rmSync(dir, { recursive: true, force: true });
    dir = mkdtempSync(join(tmpdir(), "atlas-connect-"));
    let swap: () => Promise<unknown> = async () => {};
    const u = setup({ script: [() => void swap(), "answer"] });
    const paired = await pair(u.d);
    await save(u.d, paired.b);
    await start(u.d, paired.b);
    swap = () => recordConnection(u.d.connectionFile, clock, "session", `${CANARY}-other`, "b");
    const run = await (await ask(u.d, paired.b)).json();
    expect(u.fake.calls).toHaveLength(1);
    expect(run.status).toBe("failed");
    expect(run.live.stoppedBy).toMatch(/API key connection changed/);
    expect((await view(u.d)).used).toMatchObject({ runs: 1, requests: 1 });
  });

  it("replacing the key cancels a request in flight and keeps its reservation", async () => {
    const t = setup({ script: ["wait_abort"] });
    const { b } = await pair(t.d);
    await save(t.d, b);
    await start(t.d, b);
    const pending = ask(t.d, b);
    await vi.waitFor(() => expect(t.fake.calls).toHaveLength(1));
    expect((await save(t.d, b, `${CANARY}-replacement`)).status).toBe(200);
    const result = await (await pending).json();
    expect(result.status).toBe("cancelled");
    const v = await view(t.d);
    expect(v.status).toBe("stopped");
    expect(v.used).toMatchObject({ runs: 1, requests: 1, spentUsd: 0 });
    expect(v.used.retainedUsd).toBeCloseTo(FIRST_REQUEST_USD, 6);
  });

  it("a restart keeps the allowance; a remembered key carries on, a session-only key must be pasted again and never resumes silently", async () => {
    // Remembered in the OS store: the same session and counters after a restart.
    const keychain = fakeKeychain();
    const t = setup({ keychain });
    const { b } = await pair(t.d);
    await save(t.d, b, CANARY, "keychain");
    await start(t.d, b);
    expect((await ask(t.d, b)).status).toBe(200);
    vi.resetModules();
    const fresh = await import("@/copilot/routeHandler");
    const restarted = setup({ keychain }); // new process memory, same files and OS store
    const again = await fresh.handleCopilotPost(new Request(`${ORIGIN}/api/copilot`, { method: "POST", headers: { ...SAME, "content-type": "application/json", cookie: cookieHeader(b, restarted.d.env) }, body: JSON.stringify(copilotRequest(QUESTION, snap())) }), restarted.d);
    expect(again.status).toBe(200);
    expect((await view(restarted.d)).used).toMatchObject({ runs: 2, requests: 2 });
    expect((await status(restarted.d, b)).local).toMatchObject({ paired: true });

    // Session-only: after a restart the key is gone, and nothing is used in its place.
    rmSync(dir, { recursive: true, force: true });
    dir = mkdtempSync(join(tmpdir(), "atlas-connect-"));
    const u = setup({ env: { ...ENV, ANTHROPIC_API_KEY: ENV_CANARY } });
    const paired = await pair(u.d);
    await save(u.d, paired.b);
    await start(u.d, paired.b);
    expect((await ask(u.d, paired.b)).status).toBe(200);
    const after = setup({ env: { ...ENV, ANTHROPIC_API_KEY: ENV_CANARY } });
    expect((await status(after.d, paired.b)).local!.connection).toMatchObject({ status: "missing", message: expect.stringMatching(/Paste the key again/) });
    const refused = await ask(after.d, paired.b);
    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({ code: "credential_missing" });
    expect(after.made.count).toBe(0);
    expect((await view(after.d)).used).toMatchObject({ runs: 1, requests: 1 });
    // Pasting it again is a new connection: the old session ends with its counters, and a new one is explicit.
    await save(after.d, paired.b);
    expect((await view(after.d)).status).toBe("stopped");
    expect((await view(after.d)).used).toMatchObject({ runs: 1, requests: 1 });
    expect((await ask(after.d, paired.b)).status).toBe(403);
  });

  it("a session armed in a terminal before the key changed isn't usable either, and one armed after it is", async () => {
    const t = setup();
    const { b } = await pair(t.d);
    await save(t.d, b);
    const stale = await sessions.armSession(t.d.sessionFile, clock, "anthropic", { credentialRevision: "an-earlier-revision", claim: true });
    if (!stale.ok) throw new Error(stale.error);
    expect(await (await ask(t.d, { ...b, live: stale.cookie })).json()).toMatchObject({ code: "credential_mismatch" });
    await sessions.stopSession(t.d.sessionFile, clock, "test");
    const current = await sessions.armSession(t.d.sessionFile, clock, "anthropic", { credentialRevision: (await readConnection(t.d.connectionFile)).revision, claim: true });
    if (!current.ok) throw new Error(current.error);
    expect((await ask(t.d, { ...b, live: current.cookie })).status).toBe(200);
  });
});

// --- The proposal contracts ---------------------------------------------------------------------

const storage = vi.hoisted(() => {
  const data = new Map<string, string>();
  const s = {
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() {
      return data.size;
    },
    dump: () => [...data.entries()].map(([k, v]) => `${k}=${v}`).join("\n"),
  };
  (globalThis as { window?: unknown }).window = { localStorage: s };
  return s;
});

describe("connecting Claude leaves the proposal contracts alone", () => {
  it("a live answer is a preview; adding creates unapproved drafts only; the key is in no workspace state or backup", async () => {
    vi.resetModules();
    storage.clear();
    const m = { ...(await import("@/store/useStore")), ...(await import("@/copilot/request")), ...(await import("@/engines/workspaceBackup")), ...(await import("@/copilot/routeHandler")) };
    const store = () => m.useAtlasStore.getState();
    store().startNewClient();
    m.useAtlasStore.setState({ client: { ...store().client, fullName: "Connect Story Household", proposalOutputCurrency: "USD" }, accounts: STORY_ACCOUNTS, holdings: STORY_HOLDINGS, recommendations: [], fxRates: [] });
    store().setDraftScope(["acc_story_invest"]);
    const holdingsBefore = JSON.stringify(store().holdings);

    // The whole journey through the handlers, with the fake live provider (the deterministic test provider behind the real gate).
    const t = setup({ env: FAKE_ENV });
    const { b } = await pair(t.d);
    expect((await save(t.d, b)).status).toBe(200);
    expect((await start(t.d, b)).status).toBe(200);
    const request = m.copilotRequest(store(), "Review this alternative.");
    const res = await m.handleCopilotPost(new Request(`${ORIGIN}/api/copilot`, { method: "POST", headers: { ...SAME, "content-type": "application/json", cookie: cookieHeader(b, t.d.env) }, body: JSON.stringify(request) }), t.d);
    expect(res.status).toBe(200);
    const result = await res.json();
    expect(result.context).toEqual(request.context);
    expect(result.drafts.length).toBeGreaterThan(0);
    for (const draft of result.drafts) expect(draft).toMatchObject({ approvedByAdvisor: false, includeInPdf: false });
    // A preview: the workspace is untouched until the advisor adds it.
    expect(store().recommendations).toHaveLength(0);

    const added = store().acceptAgentDrafts(result.drafts, result.context);
    expect(added).toMatchObject({ ok: true });
    for (const rec of store().recommendations) expect(rec).toMatchObject({ approvedByAdvisor: false, includeInPdf: false, status: "needs_review" });
    expect(JSON.stringify(store().holdings)).toBe(holdingsBefore);
    // Adding the same answer again adds nothing; a stale answer is refused.
    expect(store().acceptAgentDrafts(result.drafts, result.context)).toMatchObject({ ok: true, added: [] });
    store().setDraftScope([]);
    expect(store().acceptAgentDrafts([{ ...result.drafts[0], id: "rec_after_scope_change" }], result.context).ok).toBe(false);

    // The key is in no workspace state, persisted storage or backup.
    const exported = m.exportBackup(store(), T0, { disclosureIds: DISCLOSURE_LIBRARY.map((d) => d.id) });
    expect(exported.ok).toBe(true);
    for (const text of [JSON.stringify(store()), storage.dump(), exported.ok ? exported.text : "", JSON.stringify(result), JSON.stringify(request)]) expect(text).not.toContain("CANARY");
    expect(m.BACKUP_WORKSPACE_VERSION).toBe(10);
  });
});

// --- What the user sees --------------------------------------------------------------------------

describe("the Connect Claude panel", () => {
  const render = async (t: TestDeps, b: Browser) => {
    const s = await status(t.d, b);
    return renderToStaticMarkup(React.createElement(ConnectClaude, { live: s.live as never, local: s.local, onChanged: () => {} }));
  };

  it("an unpaired browser is told how to pair, and is offered no key field", async () => {
    const t = setup();
    const html = await render(t, browser());
    expect(html).toContain("isn&#x27;t paired with Atlas");
    expect(html).toContain("npm run local");
    expect(html).not.toContain('type="password"');
  });

  it("walks through the workspace, its spend limit, a standard key, storage and billing, with a masked field", async () => {
    const t = setup({ keychain: fakeKeychain({ unsupported: true }) });
    const { b } = await pair(t.d);
    const html = await render(t, b);
    for (const text of ["create a workspace just for Atlas", "spend limit", "Never use an Admin key", "billed to your Console organization", "Max, Ultra and Team plans include monthly API credits", "Free, Pro and Enterprise", "For this server session only", "Atlas never falls back to a plain file", "not complete anonymization"]) expect(html, text).toContain(text);
    expect(html).toMatch(/<input[^>]*type="password"[^>]*autoComplete="off"/);
    expect(html).toMatch(/<input[^>]*type="radio"[^>]*disabled=""[^>]*data-testid="connect-storage-keychain"/);
    expect(html).not.toContain("Start a limited session");
  });

  it("after saving, says the connection isn't verified, offers Replace and Disconnect and an explicit session start, and never shows the key", async () => {
    const t = setup();
    const { b } = await pair(t.d);
    await save(t.d, b);
    const html = await render(t, b);
    expect(html).toContain("Key saved · not yet verified");
    expect(html).toContain("Key saved; connection not yet verified");
    expect(html).toContain("Replace key");
    expect(html).toContain("Disconnect");
    expect(html).toContain("Start a limited session");
    expect(html).toContain("not a billing limit");
    expect(html).toContain("lower these limits, not raise them");
    expect(html).not.toContain('type="password"');
    expect(html).not.toContain("CANARY");
    expect(html).not.toContain(b.csrf!);

    await start(t.d, b);
    const active = await render(t, b);
    // Settled: the set-up folds away, and a new start isn't offered while a session is active.
    expect(active).toContain("Manage connection");
    expect(active).not.toContain("Start a limited session");
  });
});

// --- Launcher and doctor ----------------------------------------------------------------------------

describe("the local launcher and doctor", () => {
  it("a busy port is skipped, not freed: the other server keeps running", async () => {
    const other = createServer();
    const port: number = await new Promise((done) => other.listen(0, "127.0.0.1", () => done((other.address() as { port: number }).port)));
    try {
      const chosen = await choosePort(port);
      expect(chosen).not.toBe(port);
      expect(chosen).toBeGreaterThan(port);
      expect(other.listening).toBe(true);
      expect(await choosePort(port, 1)).toBeNull();
      expect(await choosePort(4000, 3, async (p: number) => p === 4002)).toBe(4002);
    } finally {
      await new Promise((done) => other.close(done));
    }
  });

  it("opens the pairing link with each platform's own command, and nowhere but this machine", () => {
    const link = pairingLink("http://127.0.0.1:3000", "tok");
    expect(openCommand("win32", link)).toEqual(["cmd", ["/c", "start", "", link]]);
    expect(openCommand("darwin", link)).toEqual(["open", [link]]);
    expect(openCommand("linux", link)).toEqual(["xdg-open", [link]]);
    for (const [, args] of [openCommand("win32", link), openCommand("darwin", link), openCommand("linux", link)]) expect(args.join(" ")).toContain("127.0.0.1");
  });

  it("the server gets live mode on 127.0.0.1 with no base-URL override; a key in the terminal is passed through unread", () => {
    const env = serverEnv({ PATH: "x", ANTHROPIC_BASE_URL: "https://proxy.example", ANTHROPIC_API_KEY: ENV_CANARY, COPILOT_LIVE_PROVIDER: "fake" }, { fake: false });
    expect(env).toEqual({ PATH: "x", ANTHROPIC_API_KEY: ENV_CANARY, COPILOT_MODE: "live" });
    expect(serverEnv({}, { fake: true })).toEqual({ COPILOT_MODE: "live", COPILOT_LIVE_PROVIDER: "fake" });
    expect(pairingLink("http://127.0.0.1:3000", "tok")).toBe("http://127.0.0.1:3000/api/copilot/local/pair?token=tok");
  });

  it("the doctor reports local facts only and never prints a key", async () => {
    const t = setup();
    const { b } = await pair(t.d);
    await save(t.d, b);
    const r = await doctor({ ATLAS_LOCAL_DIR: dir, ATLAS_LIVE_SESSION_FILE: t.d.sessionFile, ANTHROPIC_API_KEY: ENV_CANARY, ANTHROPIC_BASE_URL: "https://proxy.example" });
    const text = r.lines.join("\n");
    expect(text).not.toContain("CANARY");
    expect(text).toMatch(/ANTHROPIC_API_KEY is set in this terminal \(not read or shown\)/);
    expect(text).toMatch(/A key is connected \(kept in: session; not yet verified\)/);
    expect(text).toMatch(/ANTHROPIC_BASE_URL is set/);
    expect(text).toMatch(/Nothing contacted Anthropic/);
    expect((await doctor({ ATLAS_LOCAL_DIR: dir, ATLAS_LIVE_SESSION_FILE: t.d.sessionFile, VERCEL: "1" })).problems).toBeGreaterThan(0);
  });
});

// --- Review fixes (12 November 2026) ----------------------------------------------------

describe("fix 1: credential validation refuses what it can identify, and doesn't invent a format", () => {
  const long = "x".repeat(60);

  it("refuses Admin keys and the Claude Code OAuth/refresh token forms, and stores nothing", async () => {
    // The one prefix Anthropic documents is the Admin key's; the token forms are community-sourced and refused as a guard.
    for (const bad of [`sk-ant-admin01-${long}`, `SK-ANT-ADMIN01-${long}`, `sk-ant-oat01-${long}`, `sk-ant-ort01-${long}`, `sk-ant-oat-${long}`]) {
      expect(keyShapeProblem(bad), bad.slice(0, 16)).toBeTruthy();
    }
    expect(keyShapeProblem(`sk-ant-admin01-${long}`)).toMatch(/Admin API key/);
    expect(keyShapeProblem(`sk-ant-oat01-${long}`)).toMatch(/Claude subscription|Claude Code/i);

    const t = setup();
    const { b } = await pair(t.d);
    for (const bad of [`sk-ant-oat01-${long}`, `sk-ant-ort01-${long}`]) {
      const res = await connection(t.d, b, { action: "save", key: bad, storage: "session" });
      expect(res.status).toBe(400);
      expect(await res.text()).not.toContain(long);
    }
    expect(t.session.size).toBe(0);
    expect(await readConnection(t.d.connectionFile)).toMatchObject({ source: "none" });
  });

  it("accepts a key whose shape the documentation doesn't establish, since a prefix isn't proof", async () => {
    // Anthropic documents no format for standard API keys: refusing an unfamiliar shape would block a valid key.
    for (const plausible of [`sk-ant-api03-${long}`, `sk-ant-${long}`, `sk-future-format-${long}`, long + long]) {
      expect(keyShapeProblem(plausible), plausible.slice(0, 16)).toBeNull();
    }
    const t = setup();
    const { b } = await pair(t.d);
    const res = await connection(t.d, b, { action: "save", key: `sk-future-format-${long}`, storage: "session" });
    expect(res.status).toBe(200);
    expect(await readConnection(t.d.connectionFile)).toMatchObject({ source: "session" });
    expect(t.made.count).toBe(0);
  });

  it("still refuses what cannot be a credential at all", () => {
    for (const bad of ["", "   ", "not a key", `sk-ant-api03-${long} trailing`, "sk-ant\nmultiline", "short", `sk-ant-${"x".repeat(600)}`, 42, null, undefined]) {
      expect(keyShapeProblem(bad), String(bad).slice(0, 20)).toBeTruthy();
    }
  });

  it("neither the guide nor the panel states a standard-key prefix as fact", async () => {
    const t = setup();
    const { b } = await pair(t.d);
    const s = await status(t.d, b);
    const html = renderToStaticMarkup(React.createElement(ConnectClaude, { live: s.live as never, local: s.local, onChanged: () => {} }));
    expect(html).toContain("Never use an Admin key");
    expect(html).not.toMatch(/starts with\s*<code>sk-ant-<\/code>/);
    expect(html).not.toContain("it starts with");
    const guide = readFileSync("docs/roadmap/LOCAL_CLAUDE_SETUP.md", "utf8");
    expect(guide).not.toMatch(/standard key \(it starts with/);
  });
});

describe("fix 2: no credential is read until a session could admit the run", () => {
  const cases: [string, (t: ReturnType<typeof setup>, b: Browser) => Promise<unknown>, string][] = [
    ["no session at all", async () => {}, "no_session"],
    ["a stopped session", async (t, b) => void (await session(t.d, b, { action: "stop" })), "stopped"],
    ["an expired session", async () => void (clock = new Date(T0.getTime() + 31 * 60_000)), "expired"],
    ["another browser's session", async (t, b) => void (b.live = `${b.live}x`), "not_this_browser"],
  ];

  for (const [name, breakIt, code] of cases) {
    it(`${name}: refused without opening the credential store or making a client`, async () => {
      const t = setup();
      const { b } = await pair(t.d);
      await save(t.d, b, CANARY, "keychain");
      if (name !== "no session at all") await start(t.d, b);
      await breakIt(t, b);
      const reads = t.keychain.calls.get;
      const res = await ask(t.d, b);
      expect(res.status).toBe(code === "exhausted" ? 429 : 403);
      expect(await res.json()).toMatchObject({ code });
      // The decisive assertion: the OS credential store was never opened for a request that couldn't run.
      expect(t.keychain.calls.get).toBe(reads);
      expect(t.made.count).toBe(0);
      expect(t.fake.calls).toHaveLength(0);
    });
  }

  it("an exhausted session is refused before the store is opened, and an admitted run still reads the key once", async () => {
    const t = setup({ script: ["answer"] });
    const { b } = await pair(t.d);
    await save(t.d, b, CANARY, "keychain");
    await start(t.d, b, { minutes: 30, runs: 1, requests: 10, usd: 5 });
    const before = t.keychain.calls.get;
    expect((await ask(t.d, b)).status).toBe(200);
    // One admitted run reads the key; the gate doesn't re-open the store per request.
    expect(t.keychain.calls.get).toBe(before + 1);
    expect(t.made.keys).toEqual([CANARY]);

    const reads = t.keychain.calls.get;
    const used = await ask(t.d, b);
    expect(used.status).toBe(429);
    expect(await used.json()).toMatchObject({ code: "exhausted" });
    expect(t.keychain.calls.get).toBe(reads);
    expect(t.made.count).toBe(1);
  });

  it("an unpaired or cross-origin asking request reads no credential and makes no client", async () => {
    const t = setup();
    const { b } = await pair(t.d);
    await save(t.d, b, CANARY, "keychain");
    await start(t.d, b);
    const reads = t.keychain.calls.get;
    for (const headers of [{ host: HOST, origin: "http://evil.example", "sec-fetch-site": "cross-site" }, { host: "atlas.example:3000", origin: "http://atlas.example:3000", "sec-fetch-site": "same-origin" }]) {
      const res = await handleCopilotPost(new Request(`${ORIGIN}/api/copilot`, { method: "POST", headers: { ...headers, "content-type": "application/json", cookie: cookieHeader(b, t.d.env) }, body: JSON.stringify(copilotRequest(QUESTION, snap())) }), t.d);
      expect(res.status).toBe(403);
    }
    expect(t.keychain.calls.get).toBe(reads);
    expect(t.made.count).toBe(0);
  });

  it("the credential revision still binds the session, and a locked store is still reported", async () => {
    const t = setup();
    const { b } = await pair(t.d);
    await save(t.d, b, CANARY, "keychain");
    await start(t.d, b);
    t.keychain.state.locked = true;
    const res = await ask(t.d, b);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "credential_unreadable" });
    expect(t.made.count).toBe(0);
    t.keychain.state.locked = false;
    // A key replaced under the running session is still refused by revision, before the store is opened.
    await recordConnection(t.d.connectionFile, clock, "session", `${CANARY}-other`, "b");
    const reads = t.keychain.calls.get;
    expect(await (await ask(t.d, b)).json()).toMatchObject({ code: "credential_mismatch" });
    expect(t.keychain.calls.get).toBe(reads);
  });
});

describe("fix 4: two Atlas instances on one host stay separate", () => {
  it("one browser keeps both pairings and both sessions, each with its own counters", async () => {
    // Reproduces the collision: fixed cookie names would make the second pairing overwrite the first.
    const second = mkdtempSync(join(tmpdir(), "atlas-connect-b-"));
    try {
      const a = setup();
      const two = localDeps({ dir: second, client: fakeProvider(["answer"]).client, env: ENV, now: () => clock });
      // Different state directories, so different cookie names: with one fixed name the second pairing would unseat the first.
      expect(instanceId(a.d.env)).not.toBe(instanceId(two.d.env));
      expect(pairCookieName(a.d.env)).not.toBe(pairCookieName(two.d.env));
      expect(liveCookieName(a.d.env)).not.toBe(liveCookieName(two.d.env));

      const jar = browser();
      await pair(a.d, jar);
      const csrfA = jar.csrf;
      const pairA = jar.pair;
      // Pairing with the second instance must not unseat the first.
      const jarB = browser();
      await pair(two.d, jarB);
      jar.pair = pairA;

      await save(a.d, jar, CANARY, "session");
      await save(two.d, jarB, `${CANARY}-two`, "session");
      expect((await start(a.d, jar)).status).toBe(200);
      expect((await start(two.d, jarB)).status).toBe(200);

      // One jar holding both instances' cookies: each instance sees its own.
      const both: Browser = { pair: jar.pair, live: jar.live, csrf: csrfA };
      expect((await status(a.d, both)).local).toMatchObject({ paired: true });
      expect((await ask(a.d, both)).status).toBe(200);
      expect((await ask(two.d, jarB)).status).toBe(200);
      expect((await view(a.d)).used).toMatchObject({ runs: 1 });
      expect((await view(two.d)).used).toMatchObject({ runs: 1 });
      expect(a.made.keys).toEqual([CANARY]);
    } finally {
      rmSync(second, { recursive: true, force: true });
    }
  });
});

describe("fix 7: privileged handlers authorize before reading a body, and limit it as they read", () => {
  const bigBody = (bytes: number) => JSON.stringify({ action: "save", storage: "session", key: `sk-ant-api03-${"x".repeat(bytes)}` });

  it("an unpaired request is refused without its body being read", async () => {
    const t = setup();
    let pulled = 0;
    const body = new ReadableStream({
      pull(c) {
        pulled++;
        c.enqueue(new TextEncoder().encode(bigBody(10_000)));
        c.close();
      },
    });
    const res = await handleLocalConnection(new Request(`${ORIGIN}/api/copilot/local/connection`, { method: "POST", headers: { ...SAME, "content-type": "application/json" }, body, duplex: "half" } as RequestInit), t.d);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "not_paired" });
    // A stream fills its own one-chunk queue before any reader exists; the handler asked for nothing beyond that.
    expect(pulled).toBeLessThanOrEqual(1);
    expect(t.session.size).toBe(0);
  });

  it("a body past the limit is refused while it is read, with a missing or a lying Content-Length", async () => {
    const t = setup();
    const { b } = await pair(t.d);
    let sent = 0;
    const stream = () =>
      new ReadableStream({
        pull(c) {
          // Far more than the limit, in chunks: a correct reader stops early.
          sent += 1;
          c.enqueue(new TextEncoder().encode("x".repeat(8_192)));
          if (sent > 400) c.close();
        },
      });
    for (const extra of [{}, { "content-length": "12" }]) {
      sent = 0;
      const res = await handleLocalConnection(
        new Request(`${ORIGIN}/api/copilot/local/connection`, { method: "POST", headers: { ...SAME, "content-type": "application/json", ...(b.csrf ? { [CSRF_HEADER]: b.csrf } : {}), cookie: cookieHeader(b, t.d.env), ...extra }, body: stream(), duplex: "half" } as RequestInit),
        t.d
      );
      expect(res.status).toBe(413);
      expect(await res.json()).toMatchObject({ code: "body_too_large" });
      // It stopped reading instead of buffering the whole stream.
      expect(sent).toBeLessThan(100);
    }
    expect(t.session.size).toBe(0);
  });

  it("an ordinary body still works, and a malformed one is a plain refusal", async () => {
    const t = setup();
    const { b } = await pair(t.d);
    expect((await save(t.d, b)).status).toBe(200);
    const res = await handleLocalConnection(new Request(`${ORIGIN}/api/copilot/local/connection`, { method: "POST", headers: { ...SAME, "content-type": "application/json", [CSRF_HEADER]: b.csrf!, cookie: cookieHeader(b, t.d.env) }, body: "{ not json" }), t.d);
    expect(res.status).toBe(400);
  });
});

describe("fix 8: an environment key is normalized and validated like a pasted one", () => {
  it("surrounding whitespace is trimmed, and the same values are refused", async () => {
    const t = setup({ env: { ...ENV, ANTHROPIC_API_KEY: `  ${ENV_CANARY}\n` } });
    const { b } = await pair(t.d);
    expect((await connection(t.d, b, { action: "use_environment" })).status).toBe(200);
    await start(t.d, b);
    expect((await ask(t.d, b)).status).toBe(200);
    // The provider gets the trimmed value, and the whitespace never makes it look like a changed key.
    expect(t.made.keys).toEqual([ENV_CANARY]);
    expect((await status(t.d, b)).local!.connection).toMatchObject({ source: "environment", status: "verified" });

    // An Admin or subscription token in the environment is refused there too, without being echoed.
    for (const bad of [`sk-ant-admin01-${"x".repeat(40)}`, `sk-ant-oat01-${"x".repeat(40)}`]) {
      rmSync(dir, { recursive: true, force: true });
      dir = mkdtempSync(join(tmpdir(), "atlas-connect-"));
      const u = setup({ env: { ...ENV, ANTHROPIC_API_KEY: bad } });
      const paired = await pair(u.d);
      const res = await connection(u.d, paired.b, { action: "use_environment" });
      expect(res.status).toBe(400);
      const text = await res.text();
      expect(text).not.toContain("xxxx");
      expect(await readConnection(u.d.connectionFile)).toMatchObject({ source: "none" });
      expect(u.made.count).toBe(0);
    }
    expect(logged.join("\n")).not.toContain("ENVCANARY");
  });
});

// --- Partial credential-store writes and relative state overrides (12 November 2026) ----------

/**
 * A fake of the native credential backend the real adapter talks to, so the
 * adapter itself is under test. `state` is flipped between calls to stage a
 * failure: `failWrite` never stores, `failAfterWrite` stores and then throws
 * (the case that matters), `failRead` and `failDelete` break those steps.
 */
function fakeNative(state: { failWrite?: boolean; failAfterWrite?: boolean; failRead?: boolean; failDelete?: boolean } = {}) {
  const map = new Map<string, string>();
  const calls = { set: 0, get: 0, delete: 0 };
  class Entry {
    account: string;
    constructor(_service: string, account: string) {
      this.account = account;
    }
    async setPassword(secret: string) {
      calls.set++;
      if (state.failWrite) throw new Error("native write failure");
      map.set(this.account, secret);
      if (state.failAfterWrite) throw new Error("native failure after the write landed");
    }
    async getPassword() {
      calls.get++;
      if (state.failRead) throw new Error("native read failure");
      return map.get(this.account) ?? null;
    }
    async deletePassword() {
      calls.delete++;
      if (state.failDelete) throw new Error("native delete failure");
      return map.delete(this.account);
    }
  }
  return { store: keychainStore("Atlas test", async () => ({ AsyncEntry: Entry }) as never), map, calls, state };
}

/** The gate's own view of whether the connection can be used right now. */
const credentialNow = async (d: LiveDeps) => resolveCredential(d, undefined, true);

describe("a credential write that lands but can't be confirmed never loses the previous key", () => {
  it("a failed replacement leaves the earlier key, its revision and its session working", async () => {
    const native = fakeNative();
    const t = setup({ keychain: { store: native.store, map: native.map, calls: native.calls, state: {} } as never });
    const { b } = await pair(t.d);
    expect((await save(t.d, b, CANARY, "keychain")).status).toBe(200);
    await start(t.d, b);
    const before = await readConnection(t.d.connectionFile);
    const liveBefore = await credentialNow(t.d);
    expect(liveBefore).toMatchObject({ ok: true, key: CANARY });

    // The replacement is written and then can't be read back.
    native.state.failAfterWrite = true;
    const res = await save(t.d, b, `${CANARY}-new`, "keychain");
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).not.toContain("CANARY");
    // It must not claim nothing was stored when a write may have landed.
    expect(body.error).not.toMatch(/Nothing was saved/);
    expect(body.error).toMatch(/previous|earlier|unchanged/i);

    native.state.failAfterWrite = false;
    // The connection is exactly as it was, and the old key still resolves.
    const after = await readConnection(t.d.connectionFile);
    expect(after.revision).toBe(before.revision);
    expect(after.fingerprint).toBe(before.fingerprint);
    expect(await credentialNow(t.d)).toMatchObject({ ok: true, key: CANARY });
    // The session was never bound to a key that stopped existing.
    expect((await status(t.d, b)).live.session).toMatchObject({ status: "active" });
    expect((await ask(t.d, b)).status).toBe(200);
    expect(t.made.keys).toEqual([CANARY]);
    // No abandoned entry is left holding the new key.
    expect([...native.map.values()]).toEqual([CANARY]);
  });

  it("a failed first save leaves nothing connected, and Disconnect still removes the abandoned entry", async () => {
    const native = fakeNative({ failAfterWrite: true, failDelete: true });
    const t = setup({ keychain: { store: native.store, map: native.map, calls: native.calls, state: {} } as never });
    const { b } = await pair(t.d);
    const res = await save(t.d, b, CANARY, "keychain");
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).not.toMatch(/Nothing was saved/);
    // Cleanup failed too, so the message must say an entry may remain.
    expect(body.error).toMatch(/may (still )?(be|remain|exist)|couldn't be removed|unconfirmed/i);
    expect(native.map.size).toBe(1);

    // Nothing is connected, and the abandoned slot is remembered by name only.
    const conn = await readConnection(t.d.connectionFile);
    expect(conn).toMatchObject({ source: "none", revision: null });
    expect(JSON.stringify(conn)).not.toContain("CANARY");
    expect(everythingOnDisk()).not.toContain("CANARY");

    // Disconnect cleans it up even though the record was never connected.
    native.state.failDelete = false;
    native.state.failAfterWrite = false;
    const off = await connection(t.d, b, { action: "disconnect" });
    expect(off.status).toBe(200);
    expect(native.map.size).toBe(0);
    expect((await readConnection(t.d.connectionFile)).source).toBe("none");
  });

  it("an entry that can't be cleaned up is reported and cleared by the next successful save", async () => {
    const native = fakeNative({ failAfterWrite: true, failDelete: true });
    const t = setup({ keychain: { store: native.store, map: native.map, calls: native.calls, state: {} } as never });
    const { b } = await pair(t.d);
    expect((await save(t.d, b, CANARY, "keychain")).status).toBe(503);
    expect(native.map.size).toBe(1);

    native.state.failAfterWrite = false;
    native.state.failDelete = false;
    // A later save succeeds, and the abandoned entry goes with it.
    expect((await save(t.d, b, `${CANARY}-second`, "keychain")).status).toBe(200);
    expect([...native.map.values()]).toEqual([`${CANARY}-second`]);
    expect(await credentialNow(t.d)).toMatchObject({ ok: true, key: `${CANARY}-second` });
    await start(t.d, b);
    expect((await ask(t.d, b)).status).toBe(200);
    expect(t.made.keys).toEqual([`${CANARY}-second`]);
  });

  it("a record written before slots existed keeps working, and its entry is replaced safely", async () => {
    const native = fakeNative();
    const t = setup({ keychain: { store: native.store, map: native.map, calls: native.calls, state: {} } as never });
    const { b } = await pair(t.d);
    await save(t.d, b, CANARY, "keychain");
    // Rewrite the record as the earlier code wrote it: version 1, no slot, key under the un-slotted name.
    const current = JSON.parse(readFileSync(t.d.connectionFile, "utf8"));
    const legacyAccount = keychainAccount(current.salt);
    native.map.clear();
    native.map.set(legacyAccount, CANARY);
    const { saveJson } = await import("@/copilot/localFiles");
    saveJson(t.d.connectionFile, { version: 1, salt: current.salt, source: "keychain", revision: current.revision, fingerprint: current.fingerprint, savedAt: current.savedAt, verifiedAt: null, rejectedAt: null });

    // The remembered key is still found, under the name that record used.
    const migrated = await readConnection(t.d.connectionFile);
    expect(migrated).toMatchObject({ version: 2, slot: "legacy", pending: [] });
    expect(await credentialNow(t.d)).toMatchObject({ ok: true, key: CANARY });
    expect((await start(t.d, b)).status).toBe(200);
    expect((await ask(t.d, b)).status).toBe(200);

    // Replacing it writes to a fresh slot and clears the old entry out.
    expect((await save(t.d, b, `${CANARY}-next`, "keychain")).status).toBe(200);
    expect(await readConnection(t.d.connectionFile)).toMatchObject({ slot: "a", pending: [] });
    expect([...native.map.entries()]).toEqual([[accountFor(current.salt, "a"), `${CANARY}-next`]]);
    expect(await credentialNow(t.d)).toMatchObject({ ok: true, key: `${CANARY}-next` });
  });

  it("a refused write never claims nothing was stored, and leaves the live key in place", async () => {
    const native = fakeNative();
    const t = setup({ keychain: { store: native.store, map: native.map, calls: native.calls, state: {} } as never });
    const { b } = await pair(t.d);
    await save(t.d, b, CANARY, "keychain");
    native.state.failWrite = true;
    const res = await save(t.d, b, `${CANARY}-new`, "keychain");
    expect(res.status).toBe(503);
    const text = await res.text();
    // The adapter can't know whether a throwing native write stored, so it must not claim it didn't.
    expect(text).not.toMatch(/Nothing was saved/);
    expect(text).toMatch(/previous connection is unchanged/i);
    expect([...native.map.values()]).toEqual([CANARY]);
    native.state.failWrite = false;
    expect(await credentialNow(t.d)).toMatchObject({ ok: true, key: CANARY });
  });

  it("the adapter reports outcomes instead of leaving the caller to guess", async () => {
    const landed = fakeNative({ failAfterWrite: true });
    const w = await landed.store.set("slot", CANARY);
    expect(w).toMatchObject({ ok: false, maybeStored: true });
    expect(JSON.stringify(w)).not.toContain("CANARY");
    // A refused write is also "may have stored": the native call gives no way to tell.
    const never = fakeNative({ failWrite: true });
    expect(await never.store.set("slot", CANARY)).toMatchObject({ ok: false, maybeStored: true });
    const good = fakeNative();
    expect(await good.store.set("slot", CANARY)).toEqual({ ok: true });
    expect(await good.store.delete("slot")).toEqual({ ok: true });
    const stuck = fakeNative({ failDelete: true });
    await stuck.store.set("slot", CANARY);
    expect(await stuck.store.delete("slot")).toMatchObject({ ok: false });
  });
});

describe("a relative state-directory override resolves the same way everywhere", () => {
  it("both scripts and the server agree when run by absolute path from another folder", () => {
    const elsewhere = mkdtempSync(join(tmpdir(), "atlas-elsewhere-"));
    const repo = process.cwd();
    try {
      const run = (script: string, args: string[]) =>
        execFileSync(process.execPath, ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", join(repo, "scripts", script), ...args], {
          cwd: elsewhere,
          encoding: "utf8",
          env: { ...process.env, ATLAS_LOCAL_DIR: "relative-state", ATLAS_LIVE_SESSION_FILE: "", COPILOT_MODE: "live", COPILOT_LIVE_PROVIDER: "fake" },
        });

      // The launcher's own check, and the owner's session script, must use the repository's folder.
      const report = run("atlas-local.mjs", ["doctor"]);
      expect(report).toContain(join(repo, "relative-state"));
      expect(report).not.toContain(join(elsewhere, "relative-state"));
      run("live-session.mjs", ["arm", "--provider", "fake", "--origin", "http://localhost:3000"]);
      // The session record went to the repository's folder, where the server looks.
      expect(existsSync(join(repo, "relative-state", "live-session.json"))).toBe(true);
      expect(existsSync(join(elsewhere, "relative-state"))).toBe(false);
      expect(run("live-session.mjs", ["status"])).toMatch(/Session: (unclaimed|active)/);
      run("live-session.mjs", ["stop"]);
      // A check leaves no state of its own behind.
      rmSync(join(repo, "relative-state"), { recursive: true, force: true });
      run("atlas-local.mjs", ["doctor"]);
      expect(existsSync(join(repo, "relative-state"))).toBe(false);
    } finally {
      rmSync(join(repo, "relative-state"), { recursive: true, force: true });
      rmSync(elsewhere, { recursive: true, force: true });
    }
  }, 60_000);

  it("an absolute override is used as given", () => {
    const where = mkdtempSync(join(tmpdir(), "atlas-abs-"));
    try {
      const out = execFileSync(process.execPath, ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", join(process.cwd(), "scripts", "atlas-local.mjs"), "doctor"], {
        cwd: tmpdir(),
        encoding: "utf8",
        env: { ...process.env, ATLAS_LOCAL_DIR: where, ATLAS_LIVE_SESSION_FILE: "" },
      });
      expect(out).toContain(where);
    } finally {
      rmSync(where, { recursive: true, force: true });
    }
  }, 60_000);
});
