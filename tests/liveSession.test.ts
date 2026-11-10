import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CopilotSnapshot } from "@/copilot/snapshot";
import type { WorkingDraft } from "@/domain/types";
import { COPILOT_MODEL, DEFAULT_LIMITS, type MessagesClient } from "@/copilot/agent";
import { costOf } from "@/copilot/eval/budget";
import { FIRST_REQUEST_USD, LIVE_COOKIE, liveReadiness, localRequestProblem } from "@/copilot/liveGate";
import * as store from "@/copilot/liveSessionStore";
import { handleCopilotGet, handleCopilotPost, handleLiveSessionClaim, handleLiveSessionPost } from "@/copilot/routeHandler";
import { newWorkingDraft } from "@/engines/allocationDesk";
import { STORY_ACCOUNTS, STORY_HOLDINGS } from "@/data/allocationStory";
import { SEED_ADVISOR, SEED_CLIENT } from "@/data/seedClient";
import { DISCLOSURE_LIBRARY } from "@/domain/disclosureLibrary";
import { copilotRequest } from "./support/copilotRequest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LiveSessionBar, liveReady } from "@/components/copilot/LiveSessionBar";

// The local live-testing session gate (10 November 2026), through the real
// handlers and session store with fake providers only: no Anthropic call is
// made anywhere in this file. Synthetic data only.

const T0 = new Date("2026-11-10T12:00:00Z");
const QUESTION = "Which position is most concentrated in this scope? (synthetic test question)";
let dir: string;
let file: string;
let clock: Date;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "atlas-live-"));
  file = join(dir, "live-session.json");
  clock = T0;
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function snap(): CopilotSnapshot & { workingDraft: WorkingDraft } {
  return {
    client: { ...SEED_CLIENT, id: "cli_live", fullName: "Live Gate Household", proposalOutputCurrency: "USD" },
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

// --- Fake provider ---------------------------------------------------------------

type Step = "answer" | "tool" | "error529" | "timeout" | "wait_abort" | { huge: true };
const USAGE = { input_tokens: 1_000, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
let ids = 0;
const message = (content: unknown[], stop: string, usage = USAGE) => ({ id: `msg_${++ids}`, type: "message", role: "assistant", model: COPILOT_MODEL, content, stop_reason: stop, stop_sequence: null, usage }) as unknown as Anthropic.Beta.BetaMessage;

/** A fake Anthropic client following a script, recording every call it receives. */
function fakeProvider(script: Step[] | ((n: number) => Step)) {
  const calls: { model: string; timeout?: number }[] = [];
  const client: MessagesClient = {
    beta: {
      messages: {
        async create(params, options) {
          const n = calls.length;
          calls.push({ model: params.model, timeout: options?.timeout });
          const step = typeof script === "function" ? script(n) : script[Math.min(n, script.length - 1)];
          if (step === "error529") throw new Anthropic.InternalServerError(529, { error: { message: "overloaded" } }, "overloaded", new Headers());
          if (step === "timeout") throw new Anthropic.APIConnectionTimeoutError();
          if (step === "wait_abort") {
            await new Promise<void>((_, reject) => options?.signal?.addEventListener("abort", () => reject(new Anthropic.APIUserAbortError())));
          }
          if (typeof step === "object") return message([{ type: "text", text: "A long answer.", citations: null }], "end_turn", { ...USAGE, output_tokens: 120_000 });
          if (step === "tool") return message([{ type: "tool_use", id: `toolu_${++ids}`, name: "get_scope_overview", input: {} }], "tool_use");
          return message([{ type: "text", text: "Synthetic answer for human review: Equity ETF A is the largest position.", citations: null }], "end_turn");
        },
      },
    },
  };
  return { client, calls };
}

// --- Requests ----------------------------------------------------------------------

const LOCAL = { host: "localhost:3000", origin: "http://localhost:3000", "sec-fetch-site": "same-origin" };
const ENV = { COPILOT_MODE: "live", ANTHROPIC_API_KEY: "test-placeholder-not-a-key" };

function deps(client: MessagesClient, env: Record<string, string | undefined> = ENV) {
  const made = { count: 0 };
  return {
    made,
    d: {
      env,
      now: () => clock,
      sessionFile: file,
      makeClient: () => {
        made.count++;
        return client;
      },
    },
  };
}

const ask = (d: ReturnType<typeof deps>["d"], cookie: string | null, headers: Record<string, string> = LOCAL, signal?: AbortSignal) =>
  handleCopilotPost(
    new Request("http://localhost:3000/api/copilot", {
      method: "POST",
      headers: { ...headers, ...(cookie ? { cookie: `${LIVE_COOKIE}=${cookie}` } : {}), "content-type": "application/json" },
      body: JSON.stringify(copilotRequest(QUESTION, snap())),
      signal,
    }),
    d
  );

/** Arms a session as the owner's terminal does, and claims it in "the browser". Returns the cookie. */
async function armAndClaim(d: ReturnType<typeof deps>["d"]) {
  const armed = await store.armSession(file, clock);
  if (!armed.ok) throw new Error(armed.error);
  const res = await handleLiveSessionClaim(new Request(`http://localhost:3000/api/copilot/live-session/claim?token=${armed.token}`, { headers: { host: "localhost:3000", "sec-fetch-site": "none" } }), d);
  expect(res.status).toBe(303);
  const set = res.headers.get("set-cookie")!;
  expect(set).toMatch(/HttpOnly/);
  expect(set).toMatch(/SameSite=Strict/);
  expect(set).toMatch(/Path=\/api\/copilot/);
  return { cookie: decodeURIComponent(set.split(";")[0].split("=").slice(1).join("=")), token: armed.token };
}

const view = () => store.readView(file, clock, null);

// --- Tests -------------------------------------------------------------------------

describe("server readiness and locality", () => {
  it("live mode needs a local server set-up: not hosted, no base-URL override, a key (or the fake provider)", () => {
    expect(liveReadiness(ENV)).toEqual({ ok: true, provider: "anthropic" });
    expect(liveReadiness({ COPILOT_MODE: "live", COPILOT_LIVE_PROVIDER: "fake" })).toEqual({ ok: true, provider: "fake" });
    expect(liveReadiness({ COPILOT_MODE: "live" })).toMatchObject({ ok: false, reasons: ["ANTHROPIC_API_KEY isn't set."] });
    expect(liveReadiness({ ...ENV, VERCEL: "1" }).ok).toBe(false);
    expect(liveReadiness({ ...ENV, VERCEL_ENV: "production" }).ok).toBe(false);
    expect(liveReadiness({ ...ENV, ANTHROPIC_BASE_URL: "https://proxy.example" }).ok).toBe(false);
    expect(liveReadiness({ ...ENV, COPILOT_LIVE_PROVIDER: "other" }).ok).toBe(false);
    expect(liveReadiness({ ANTHROPIC_API_KEY: "x" }).ok).toBe(false);
  });

  it("only same-origin requests from this machine pass", () => {
    const req = (h: Record<string, string>) => new Request("http://localhost:3000/api/copilot", { method: "POST", headers: h });
    expect(localRequestProblem(req(LOCAL), "write")).toBeNull();
    expect(localRequestProblem(req({ ...LOCAL, host: "flow.localhost:3107", origin: "http://flow.localhost:3107" }), "write")).toBeNull();
    expect(localRequestProblem(req({ ...LOCAL, host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" }), "write")).toBeNull();
    expect(localRequestProblem(req({ ...LOCAL, host: "192.168.1.20:3000", origin: "http://192.168.1.20:3000" }), "write")).toMatch(/localhost/);
    expect(localRequestProblem(req({ ...LOCAL, host: "atlas.example.com", origin: "https://atlas.example.com" }), "write")).toMatch(/localhost/);
    expect(localRequestProblem(req({ ...LOCAL, origin: "https://evil.example" }), "write")).toMatch(/another origin/);
    expect(localRequestProblem(req({ ...LOCAL, origin: "http://localhost:4000" }), "write")).toMatch(/another origin/);
    expect(localRequestProblem(req({ host: LOCAL.host }), "write")).toMatch(/same-origin/);
    expect(localRequestProblem(req({ ...LOCAL, "sec-fetch-site": "cross-site" }), "write")).toMatch(/cross-site/);
    expect(localRequestProblem(req({ ...LOCAL, "x-forwarded-for": "203.0.113.9" }), "write")).toMatch(/this machine/);
    expect(localRequestProblem(req({ ...LOCAL, "x-forwarded-for": "127.0.0.1, ::1" }), "write")).toBeNull();
    expect(localRequestProblem(req({ ...LOCAL, "x-forwarded-host": "atlas.example.com" }), "write")).toMatch(/forwarded/);
  });
});

describe("fails closed before any provider call", () => {
  it("no session, an unreadable session, an unclaimed one, another browser's cookie: refused, and no client is ever made", async () => {
    const fake = fakeProvider(["answer"]);
    const { d, made } = deps(fake.client);
    expect((await ask(d, null)).status).toBe(403);
    expect(await (await ask(d, "made-up")).json()).toMatchObject({ code: "no_session" });

    writeFileSync(file, "{ not json");
    expect(await (await ask(d, "made-up")).json()).toMatchObject({ code: "invalid_session" });
    writeFileSync(file, JSON.stringify({ version: 1, id: "x", armedAt: T0.toISOString(), claimHash: "h", cookieHash: null, stopped: null, runs: -1 }));
    expect(await (await ask(d, "made-up")).json()).toMatchObject({ code: "invalid_session" });
    rmSync(file);

    expect((await store.armSession(file, clock)).ok).toBe(true);
    expect(await (await ask(d, null)).json()).toMatchObject({ code: "not_claimed" });

    await store.stopSession(file, clock, "test");
    const { cookie } = await armAndClaim(d);
    expect(await (await ask(d, `${cookie}x`)).json()).toMatchObject({ code: "not_this_browser" });
    expect(await (await ask(d, null)).json()).toMatchObject({ code: "not_this_browser" });

    expect(made.count).toBe(0);
    expect(fake.calls).toHaveLength(0);
    expect((await view()).used).toMatchObject({ runs: 0, requests: 0 });
  });

  it("claim links are local, single-use and bound to the armed session", async () => {
    const { d } = deps(fakeProvider(["answer"]).client);
    const armed = await store.armSession(file, clock);
    if (!armed.ok) throw new Error();
    const claim = (token: string, h: Record<string, string> = { host: "localhost:3000", "sec-fetch-site": "none" }) =>
      handleLiveSessionClaim(new Request(`http://localhost:3000/api/copilot/live-session/claim?token=${token}`, { headers: h }), d);
    expect((await claim(armed.token, { host: "192.168.1.20:3000" })).status).toBe(403);
    expect((await claim(armed.token, { host: "localhost:3000", "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect((await claim("wrong-token")).status).toBe(403);
    expect((await claim(armed.token)).status).toBe(303);
    expect((await claim(armed.token)).status).toBe(403); // already claimed
    expect((await store.armSession(file, clock)).ok).toBe(false); // can't re-arm while armed
  });
});

describe("the allowance", () => {
  it("three runs, then refused; answers come back for review; counters are server-side and priced from usage", async () => {
    const fake = fakeProvider(["answer"]);
    const { d } = deps(fake.client);
    const { cookie } = await armAndClaim(d);
    for (let i = 1; i <= 3; i++) {
      const res = await ask(d, cookie);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("completed");
      expect(body.answer).toMatch(/Synthetic answer for human review/);
      expect(body.live).toMatchObject({ provider: "anthropic", run: { requests: 1, attempts: 1, status: "completed" }, stoppedBy: null, session: { used: { runs: i, requests: i } } });
    }
    const fourth = await ask(d, cookie);
    expect(fourth.status).toBe(429);
    expect(await fourth.json()).toMatchObject({ code: "exhausted", error: expect.stringMatching(/3 agent runs/) });
    expect(fake.calls).toHaveLength(3);
    // The run asked for the reviewed model, within the existing 100-second deadline.
    for (const c of fake.calls) {
      expect(c.model).toBe(COPILOT_MODEL);
      expect(c.timeout).toBeLessThanOrEqual(DEFAULT_LIMITS.deadlineMs);
      expect(c.timeout).toBeGreaterThan(DEFAULT_LIMITS.deadlineMs - 5_000);
    }
    const v = await view();
    expect(v.used).toMatchObject({ runs: 3, requests: 3, attempts: 3, retainedUsd: 0 });
    expect(v.used.spentUsd).toBeCloseTo(3 * costOf(COPILOT_MODEL, USAGE), 9);
    expect(v.status).toBe("exhausted");
  });

  it("at most 10 HTTP requests across the session: the 11th is refused mid-run and the run ends", async () => {
    // Every request asks for another tool call, so a run would go on until a limit stops it.
    const fake = fakeProvider(() => "tool");
    const { d } = deps(fake.client);
    const { cookie } = await armAndClaim(d);
    const first = await (await ask(d, cookie)).json();
    // The loop's own limit (10 turns) ends the first run at 10 requests.
    expect(first.status).toBe("turn_limit");
    expect(first.live.run.requests).toBe(10);
    const second = await ask(d, cookie);
    expect(second.status).toBe(429);
    expect(await second.json()).toMatchObject({ code: "exhausted", error: expect.stringMatching(/10 provider requests/) });
    expect(fake.calls).toHaveLength(10);
    expect((await view()).used).toMatchObject({ runs: 1, requests: 10 });
  });

  it("the cap holds across runs: a later run is stopped at the session's 10th request", async () => {
    let n = 0;
    // Run 1: 6 tool calls then an answer (7 requests); run 2 keeps calling tools.
    const fake = fakeProvider(() => (n++ < 6 ? "tool" : n === 7 ? "answer" : "tool"));
    const { d } = deps(fake.client);
    const { cookie } = await armAndClaim(d);
    expect((await (await ask(d, cookie)).json()).live.run.requests).toBe(7);
    const second = await (await ask(d, cookie)).json();
    expect(second.status).toBe("failed");
    expect(second.live.run.requests).toBe(3);
    expect(second.live.stoppedBy).toMatch(/10 provider requests/);
    // The answer says the session stopped it, not that the provider failed.
    expect(second.answer).toMatch(/The live test session stopped this run: The session's 10 provider requests are used up/);
    expect(second.answer).not.toMatch(/provider failed/);
    expect(fake.calls).toHaveLength(10);
  });

  it("concurrent requests: exactly one run is admitted; the others are refused, not queued", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const fake = fakeProvider(["answer"]);
    const slow: MessagesClient = { beta: { messages: { create: async (p, o) => (await gate, fake.client.beta.messages.create(p, o)) } } };
    const { d } = deps(slow);
    const { cookie } = await armAndClaim(d);
    const all = Promise.all(Array.from({ length: 5 }, () => ask(d, cookie)));
    await new Promise((r) => setTimeout(r, 200));
    release();
    const statuses = (await all).map((r) => r.status).sort();
    expect(statuses).toEqual([200, 409, 409, 409, 409]);
    expect((await view()).used).toMatchObject({ runs: 1, requests: 1 });
  });

  it("concurrent reservations never exceed the request cap", async () => {
    await store.armSession(file, clock);
    const s = JSON.parse(readFileSync(file, "utf8"));
    s.cookieHash = "x".repeat(64);
    writeFileSync(file, JSON.stringify(s));
    // Admit directly (bypassing the cookie check is fine at store level: this tests the counter's atomicity).
    const raw = JSON.parse(readFileSync(file, "utf8"));
    raw.active = { id: "run-1", startedAt: clock.toISOString(), requests: 0, attempts: 0, usd: 0, retainedUsd: 0, models: [] };
    raw.runs = 1;
    writeFileSync(file, JSON.stringify(raw));
    const results = await Promise.all(Array.from({ length: 25 }, () => store.reserveRequest(file, clock, "run-1", () => 0.01)));
    expect(results.filter((r) => r.ok)).toHaveLength(10);
    expect(results.filter((r) => !r.ok && r.code === "exhausted")).toHaveLength(15);
    expect(JSON.parse(readFileSync(file, "utf8")).requests).toBe(10);
  });

  it("a stale lock left by a crashed process doesn't wedge the session", async () => {
    await store.armSession(file, clock);
    writeFileSync(`${file}.lock`, "");
    const old = new Date(Date.now() - 60_000);
    utimesSync(`${file}.lock`, old, old);
    expect((await store.readView(file, clock, null)).status).toBe("unclaimed");
    expect(existsSync(`${file}.lock`)).toBe(false);
  });
});

describe("failures, cancellation, timeout and expiry", () => {
  it("a failed request counts and its worst-case reservation is kept, so the guard refuses the retry", async () => {
    const fake = fakeProvider(["error529", "answer"]);
    const { d } = deps(fake.client);
    const { cookie } = await armAndClaim(d);
    const body = await (await ask(d, cookie)).json();
    expect(body.status).toBe("failed");
    // The loop did retry: the retry went through the gate and was refused there, before the provider.
    expect(fake.calls).toHaveLength(1);
    expect(body.live.stoppedBy).toMatch(/spending guard would be at risk/);
    expect(body.live.run).toMatchObject({ requests: 1, attempts: 0, usd: 0 });
    expect(body.live.run.retainedUsd).toBeCloseTo(FIRST_REQUEST_USD, 6);
    const v = await view();
    expect(v.used).toMatchObject({ requests: 1, spentUsd: 0 });
    expect(v.used.retainedUsd).toBeCloseTo(FIRST_REQUEST_USD, 6);
    expect(v.remaining.usd).toBeCloseTo(5 - FIRST_REQUEST_USD, 6);
  });

  it("a timed-out request counts and keeps its reservation", async () => {
    const fake = fakeProvider(["timeout", "answer"]);
    const { d } = deps(fake.client);
    const { cookie } = await armAndClaim(d);
    const body = await (await ask(d, cookie)).json();
    expect(body.status).toBe("failed");
    expect(fake.calls).toHaveLength(1);
    expect((await view()).used.retainedUsd).toBeCloseTo(FIRST_REQUEST_USD, 6);
  });

  it("cancelling the browser request cancels the run; the run and its request stay counted, the reservation kept", async () => {
    const fake = fakeProvider(["wait_abort"]);
    const { d } = deps(fake.client);
    const { cookie } = await armAndClaim(d);
    const ac = new AbortController();
    const pending = ask(d, cookie, LOCAL, ac.signal);
    await new Promise((r) => setTimeout(r, 100));
    ac.abort();
    const body = await (await pending).json();
    expect(body.status).toBe("cancelled");
    const v = await view();
    expect(v.used).toMatchObject({ runs: 1, requests: 1 });
    expect(v.used.retainedUsd).toBeCloseTo(FIRST_REQUEST_USD, 6);
    expect(v.runInProgress).toBe(false);
  });

  it("the session expires 30 minutes after arming: new runs and mid-run requests are refused", async () => {
    const fake = fakeProvider(["tool", "answer"]);
    const { d } = deps(fake.client);
    const { cookie } = await armAndClaim(d);
    // Expiry arrives during the run's first request.
    const expiring: MessagesClient = {
      beta: {
        messages: {
          create: async (p, o) => {
            const r = await fake.client.beta.messages.create(p, o);
            clock = new Date(T0.getTime() + 30 * 60_000);
            return r;
          },
        },
      },
    };
    const d2 = { ...d, makeClient: () => expiring };
    const body = await (await ask(d2, cookie)).json();
    expect(body.status).toBe("failed");
    expect(body.live.stoppedBy).toMatch(/expired/);
    expect(fake.calls).toHaveLength(1);
    const later = await ask(d2, cookie);
    expect(later.status).toBe(403);
    expect(await later.json()).toMatchObject({ code: "expired" });
    expect((await view()).status).toBe("expired");
  });
});

describe("stop, restart and budget", () => {
  it("Stop refuses later runs and cancels the run in progress", async () => {
    const fake = fakeProvider(["wait_abort"]);
    const { d } = deps(fake.client);
    const { cookie } = await armAndClaim(d);
    const pending = ask(d, cookie);
    await new Promise((r) => setTimeout(r, 100));
    const stop = (h: Record<string, string>) => handleLiveSessionPost(new Request("http://localhost:3000/api/copilot/live-session", { method: "POST", headers: h, body: JSON.stringify({ action: "stop" }) }), d);
    expect((await stop({ host: "192.168.1.20:3000", origin: "http://192.168.1.20:3000" })).status).toBe(403);
    const stopped = await stop(LOCAL);
    expect(stopped.status).toBe(200);
    expect(stopped.headers.get("set-cookie")).toMatch(new RegExp(`^${LIVE_COOKIE}=;.*Max-Age=0`));
    expect((await (await pending).json()).status).toBe("cancelled");
    const after = await ask(d, cookie);
    expect(after.status).toBe(403);
    expect(await after.json()).toMatchObject({ code: "stopped" });
    expect((await view()).status).toBe("stopped");
  });

  it("a restart keeps the allowance; a run left active by a crash is ended after the deadline, its reservation kept", async () => {
    const fake = fakeProvider(["answer"]);
    const { d } = deps(fake.client);
    const { cookie } = await armAndClaim(d);
    expect((await ask(d, cookie)).status).toBe(200);

    // A run admitted and mid-request when the server died: nothing settled it.
    const admitted = await store.admitRun(file, clock, cookie, FIRST_REQUEST_USD);
    if (!admitted.ok) throw new Error(admitted.error);
    expect((await store.reserveRequest(file, clock, admitted.runId, () => FIRST_REQUEST_USD)).ok).toBe(true);

    // "Restart": fresh modules read the same file.
    vi.resetModules();
    const fresh = await import("@/copilot/routeHandler");
    const freshStore = await import("@/copilot/liveSessionStore");
    const again = (h = LOCAL) => fresh.handleCopilotPost(new Request("http://localhost:3000/api/copilot", { method: "POST", headers: { ...h, cookie: `${LIVE_COOKIE}=${cookie}` }, body: JSON.stringify(copilotRequest(QUESTION, snap())) }), d);
    expect((await freshStore.readView(file, clock, cookie)).used).toMatchObject({ runs: 2, requests: 2 });
    expect((await again()).status).toBe(409); // still within the run's deadline: in progress
    clock = new Date(T0.getTime() + store.STALE_RUN_MS + 1_000);
    const v = await freshStore.readView(file, clock, cookie);
    expect(v.runInProgress).toBe(false);
    expect(v.used.retainedUsd).toBeCloseTo(FIRST_REQUEST_USD, 6);
    // The kept reservation plus the next worst case would pass the guard: the session is spent, conservatively.
    const res = await again();
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ code: "exhausted" });
    expect(JSON.parse(readFileSync(file, "utf8")).history.map((h: { status: string }) => h.status)).toEqual(["completed", "abandoned"]);
  });

  it("reported usage near the guard exhausts the session for the next request", async () => {
    const fake = fakeProvider([{ huge: true }, "answer"]);
    const { d } = deps(fake.client);
    const { cookie } = await armAndClaim(d);
    const first = await (await ask(d, cookie)).json();
    expect(first.live.run.usd).toBeCloseTo(costOf(COPILOT_MODEL, { ...USAGE, output_tokens: 120_000 }), 6);
    const second = await ask(d, cookie);
    expect(second.status).toBe(429);
    expect(await second.json()).toMatchObject({ code: "exhausted", error: expect.stringMatching(/spending guard/) });
    expect(fake.calls).toHaveLength(1);
  });
});

describe("no way around the gate", () => {
  it("non-local or cross-origin requests are refused even with a valid cookie, and the status isn't shown to them", async () => {
    const fake = fakeProvider(["answer"]);
    const { d, made } = deps(fake.client);
    const { cookie } = await armAndClaim(d);
    for (const h of [
      { ...LOCAL, host: "192.168.1.20:3000", origin: "http://192.168.1.20:3000" },
      { ...LOCAL, origin: "https://evil.example", "sec-fetch-site": "cross-site" },
      { ...LOCAL, "x-forwarded-for": "203.0.113.9" },
      { host: LOCAL.host },
    ]) {
      const res = await ask(d, cookie, h);
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({ code: "not_local" });
    }
    const remote = await (await handleCopilotGet(new Request("http://192.168.1.20:3000/api/copilot", { headers: { host: "192.168.1.20:3000" } }), d)).json();
    expect(remote.live).toMatchObject({ available: false, session: null });
    expect(made.count).toBe(0);
    expect((await view()).used.runs).toBe(0);
  });

  it("a hosted deployment or a base-URL override refuses live even with an armed, claimed session", async () => {
    const fake = fakeProvider(["answer"]);
    const { d, made } = deps(fake.client);
    const { cookie } = await armAndClaim(d);
    for (const env of [{ ...ENV, VERCEL: "1" }, { ...ENV, ANTHROPIC_BASE_URL: "https://proxy.example" }, { COPILOT_MODE: "live" }]) {
      const res = await ask({ ...d, env }, cookie);
      expect(res.status).toBe(503);
    }
    expect(made.count).toBe(0);
  });

  it("the gated client refuses a different model before reserving anything", async () => {
    const fake = fakeProvider(["answer"]);
    const { d } = deps(fake.client);
    const { cookie } = await armAndClaim(d);
    const { admitLiveRun } = await import("@/copilot/liveGate");
    const admitted = await admitLiveRun(new Request("http://localhost:3000/api/copilot", { method: "POST", headers: { ...LOCAL, cookie: `${LIVE_COOKIE}=${cookie}` } }), d);
    if (!admitted.ok) throw new Error(admitted.error);
    await expect(admitted.run.client.beta.messages.create({ model: "claude-haiku-5-5", max_tokens: 100, messages: [] } as never)).rejects.toThrow(/not the configured/);
    await admitted.run.finish("failed");
    expect(fake.calls).toHaveLength(0);
    expect((await view()).used.requests).toBe(0);
  });

  it("nothing else in the app constructs an Anthropic client: the gate is the only live browser path", () => {
    const files: string[] = [];
    const walk = (p: string) => {
      for (const f of readdirSync(p)) {
        const full = join(p, f);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(f)) files.push(full);
      }
    };
    walk("src");
    const constructing = files.filter((f) => /new Anthropic\(/.test(readFileSync(f, "utf8"))).map((f) => f.replace(/\\/g, "/"));
    expect(constructing).toEqual(["src/copilot/liveGate.ts"]);
    const route = readFileSync("src/app/api/copilot/route.ts", "utf8");
    expect(route).not.toMatch(/@anthropic-ai\/sdk|runAgent/);
  });

  it("the fake provider runs the whole gate with no key and no Anthropic client", async () => {
    const { d, made } = deps(fakeProvider(["answer"]).client, { COPILOT_MODE: "live", COPILOT_LIVE_PROVIDER: "fake" });
    const { cookie } = await armAndClaim(d);
    const body = await (await ask(d, cookie)).json();
    expect(body).toMatchObject({ mode: "live", status: "completed", live: { provider: "fake", run: { status: "completed" } } });
    expect(body.live.run.requests).toBeGreaterThanOrEqual(2);
    expect(made.count).toBe(0);
  });
});

describe("what is kept", () => {
  it("the session record holds counters, timestamps and hashes only: no question, answer, token or cookie", async () => {
    const fake = fakeProvider(["answer"]);
    const { d } = deps(fake.client);
    const { cookie, token } = await armAndClaim(d);
    await ask(d, cookie);
    const text = readFileSync(file, "utf8");
    for (const secret of [QUESTION, "Synthetic answer for human review", token, cookie, "Live Gate Household", ENV.ANTHROPIC_API_KEY]) expect(text).not.toContain(secret);
    expect(Object.keys(JSON.parse(text)).sort()).toEqual(["active", "armedAt", "attempts", "claimHash", "cookieHash", "history", "id", "largestInput", "pending", "requests", "retainedUsd", "runs", "spentUsd", "stopped", "version"]);
  });

  it("the owner's terminal script arms, reports and stops, against the same record (no provider call)", () => {
    const env = { ...process.env, ATLAS_LIVE_SESSION_FILE: file };
    const run = (...args: string[]) => execFileSync(process.execPath, ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "scripts/live-session.mjs", ...args], { env, encoding: "utf8" });
    expect(() => run("arm", "--origin", "http://192.168.1.20:3000")).toThrow();
    const armed = run("arm", "--origin", "http://flow.localhost:3107");
    expect(armed).toMatch(/Armed a live test session until/);
    expect(armed).toMatch(/http:\/\/flow\.localhost:3107\/api\/copilot\/live-session\/claim\?token=[\w-]{20,}/);
    expect(() => run("arm")).toThrow(); // already armed
    expect(run("status")).toMatch(/Session: unclaimed/);
    expect(run("stop")).toMatch(/Session: stopped/);
    expect(run("arm")).toMatch(/Armed/); // a new allowance only by an explicit new arming
  });
});

describe("what the tester sees", () => {
  const text = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
  const render = (live: Parameters<typeof LiveSessionBar>[0]["live"], lastRun: Parameters<typeof LiveSessionBar>[0]["lastRun"] = null) => text(renderToStaticMarkup(React.createElement(LiveSessionBar, { live, lastRun, onChanged: () => {} })));

  it("an active session shows the allowance, the expiry and Stop; asking is allowed only then", async () => {
    const fake = fakeProvider(["answer"]);
    const { d } = deps(fake.client);
    const { cookie } = await armAndClaim(d);
    await ask(d, cookie);
    const session = await store.readView(file, clock, cookie, FIRST_REQUEST_USD);
    const live = { available: true, reasons: [], provider: "anthropic" as const, session };
    expect(liveReady(live)).toBe(true);
    const t = render(live, { provider: "anthropic", run: { requests: 1, attempts: 1, usd: 0.006, retainedUsd: 0, status: "completed" }, stoppedBy: null });
    expect(t).toContain("Live test session Active");
    expect(t).toContain("Runs left 2 of 3");
    expect(t).toContain("HTTP requests left 9 of 10");
    expect(t).toContain("Model attempts so far 1");
    expect(t).toMatch(/Estimated USD left USD 4\.99 of USD 5\.00/);
    expect(t).toMatch(/Expires in \d+:\d\d/);
    expect(t).toContain("Stop live session");
    expect(t).toContain("Last run: 1 HTTP request (retries included), 1 model attempt");
    expect(t).toContain("not billing");
  });

  it("closed sessions say why, and asking is blocked", async () => {
    const unarmed = { available: true, reasons: [], provider: "anthropic" as const, session: await view() };
    expect(liveReady(unarmed)).toBe(false);
    expect(render(unarmed)).toContain("npm run live-session -- arm");
    const off = { available: false, reasons: ["ANTHROPIC_API_KEY isn't set."], provider: null, session: null };
    expect(liveReady(off)).toBe(false);
    expect(render(off)).toContain("Live testing isn't available here: ANTHROPIC_API_KEY isn't set.");
    const { d } = deps(fakeProvider(["answer"]).client);
    const { cookie } = await armAndClaim(d);
    await store.stopSession(file, clock, "test");
    const stopped = { available: true, reasons: [], provider: "fake" as const, session: await store.readView(file, clock, cookie) };
    expect(liveReady(stopped)).toBe(false);
    const t = render(stopped);
    expect(t).toContain("Stopped");
    expect(t).toContain("Fake provider · no API calls");
    expect(t).not.toContain("Stop live session");
  });
});
