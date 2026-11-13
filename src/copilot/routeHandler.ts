import { NextResponse } from "next/server";
import { COPILOT_MODEL, runAgent, type CopilotMode } from "./agent";
import { contextMismatch } from "./context";
import { runDemoCopilot } from "./demo";
import { parseCopilotRequest } from "./snapshot";
import { TEST_PROVIDER_MODEL, createTestProvider } from "./testProvider";
import { admitLiveRun, anthropicClient, claimLiveSession, clearedSessionCookie, liveSessionStatus, sessionCookie, stopLiveSession, type LiveDeps, type LiveRunReport } from "./liveGate";
import { sessionFilePath } from "./liveSessionStore";
import { keychainStore, memoryStore } from "./credentialStore";
import { connectionFilePath, pairingFilePath } from "./localFiles";
import { MAX_KEY_BODY_BYTES, authorizeLocal, disconnect, localInfo, pairBrowser, pairingCookie, saveKey, startSession, useEnvironmentKey } from "./localConnect";

// The Copilot API's request handling, kept out of the route files so tests
// can drive it with a fake provider. Modes:
//   - demo (default): the scripted planner. No key, no model.
//   - test (COPILOT_MODE=test): the deterministic test provider through the
//     real loop. No key, no spend, not a model.
//   - live (COPILOT_MODE=live): local use only, through the live session
//     gate (liveGate.ts). Without a connected key and a session of this
//     browser with allowance left, every live request is refused before any
//     provider call. The key and the session are managed by a paired browser
//     (localConnect.ts); none of that contacts the provider.

const MAX_BODY_BYTES = 1_000_000;

export function copilotMode(env: Record<string, string | undefined>): CopilotMode {
  if (env.COPILOT_MODE === "live") return "live";
  if (env.COPILOT_MODE === "test") return "test";
  return "demo";
}

export const defaultDeps = (): LiveDeps => ({
  env: process.env,
  now: () => new Date(),
  sessionFile: sessionFilePath(process.env),
  pairingFile: pairingFilePath(process.env),
  connectionFile: connectionFilePath(process.env),
  secrets: { session: memoryStore(), keychain: keychainStore() },
  makeClient: anthropicClient,
});

export async function handleCopilotGet(req: Request, deps: LiveDeps = defaultDeps()) {
  const mode = copilotMode(deps.env);
  if (mode !== "live") return NextResponse.json({ mode, model: mode === "test" ? TEST_PROVIDER_MODEL : null });
  const live = await liveSessionStatus(req, deps);
  // `local` is this browser's view of the connection: the key itself is never part of it.
  return NextResponse.json({ mode, model: live.provider === "fake" ? TEST_PROVIDER_MODEL : COPILOT_MODEL, live, local: await localInfo(req, deps) }, { headers: { "cache-control": "no-store" } });
}

export async function handleCopilotPost(req: Request, deps: LiveDeps = defaultDeps()) {
  const read = await readLimited(req, MAX_BODY_BYTES);
  if (!read.ok) {
    if (read.tooLarge) return NextResponse.json({ error: "Workspace too large for one Copilot request." }, { status: 413 });
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  let body: unknown;
  try {
    body = JSON.parse(read.text);
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const parsed = parseCopilotRequest(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { question, snapshot, context } = parsed.value;
  // The answer must be about the client, alternative and inputs the advisor is looking at.
  const mismatch = contextMismatch(context, snapshot);
  if (mismatch) return NextResponse.json({ error: mismatch, code: "stale_context" }, { status: 409 });

  const mode = copilotMode(deps.env);
  if (mode === "demo") {
    try {
      return NextResponse.json(runDemoCopilot(snapshot, question));
    } catch {
      return unreadable();
    }
  }
  if (mode === "test") {
    try {
      return NextResponse.json(
        await runAgent(snapshot, question, {
          mode,
          provider: "test",
          // The test provider is requested by its own name, so it is never reported as a fallback.
          model: TEST_PROVIDER_MODEL,
          client: createTestProvider(),
          signal: req.signal,
        })
      );
    } catch {
      return unreadable();
    }
  }

  // Live: nothing below reaches a provider unless the session admits this run.
  const admitted = await admitLiveRun(req, deps);
  if (!admitted.ok) return NextResponse.json({ error: admitted.error, code: admitted.code, live: admitted.session ?? null }, { status: admitted.status });
  const run = admitted.run;
  let status = "failed";
  let report: LiveRunReport | null = null;
  try {
    const result = await runAgent(snapshot, question, {
      mode,
      provider: run.provider === "fake" ? "test" : "anthropic",
      model: run.model,
      // The loop bounds retries itself (each one passes the gate), so the SDK's are off.
      client: run.client,
      signal: run.signal,
    });
    status = result.status;
    report = await run.finish(status);
    return NextResponse.json({ ...result, live: report });
  } catch {
    return unreadable();
  } finally {
    if (!report) await run.finish(status);
  }
}

// A workspace record the engines can't read: say so, without the error's
// message or any of the workspace. Nothing was saved.
const unreadable = () => NextResponse.json({ error: "Copilot couldn't read this workspace (a record is malformed). Nothing was changed." }, { status: 422 });

/** GET /api/copilot/live-session/claim?token=… : the owner's one-time claim link. */
export async function handleLiveSessionClaim(req: Request, deps: LiveDeps = defaultDeps()) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const r = await claimLiveSession(req, deps, token);
  if (!r.ok) {
    return new NextResponse(`Live session not claimed: ${r.error}`, { status: r.status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
  }
  // Redirect to the Copilot page on the same origin, without the token in the address.
  const to = new URL("/copilot", `http://${req.headers.get("host")}`);
  return new NextResponse(null, { status: 303, headers: { location: to.pathname, "set-cookie": sessionCookie(deps.env, r.cookie, r.expiresAt), "cache-control": "no-store", "referrer-policy": "no-referrer" } });
}

const NO_STORE = { "cache-control": "no-store" };
const refused = (r: { status: number; code: string; error: string }) => NextResponse.json({ error: r.error, code: r.code }, { status: r.status, headers: NO_STORE });

/**
 * Reads at most `max` bytes of the body, enforcing the limit **as it reads**:
 * the stream is abandoned once the limit is passed, so neither a missing nor a
 * misleading Content-Length can make the server buffer more than that. The
 * text is never logged: it may carry a key.
 */
async function readLimited(req: Request, max: number): Promise<{ ok: true; text: string } | { ok: false; tooLarge: boolean }> {
  const stream = req.body;
  if (!stream) {
    try {
      const text = await req.text();
      return text.length > max ? { ok: false, tooLarge: true } : { ok: true, text };
    } catch {
      return { ok: false, tooLarge: false };
    }
  }
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) {
        await reader.cancel().catch(() => {});
        return { ok: false, tooLarge: true };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, tooLarge: false };
  }
  return { ok: true, text: Buffer.concat(chunks).toString("utf8") };
}

type SmallJson = { ok: true; body: Record<string, unknown> } | { ok: false; refusal: { status: number; code: string; error: string } };

/** A small JSON object body, read under its limit, or why not. */
async function smallJson(req: Request): Promise<SmallJson> {
  const bad = { ok: false, refusal: { status: 400, code: "bad_body", error: "Send a small JSON object." } } as const;
  const read = await readLimited(req, MAX_KEY_BODY_BYTES);
  if (!read.ok) return read.tooLarge ? { ok: false, refusal: { status: 413, code: "body_too_large", error: `Send less than ${MAX_KEY_BODY_BYTES} bytes of JSON.` } } : bad;
  try {
    const body = JSON.parse(read.text);
    return body && typeof body === "object" && !Array.isArray(body) ? { ok: true, body } : bad;
  } catch {
    return bad;
  }
}

/** GET /api/copilot/local/pair?token=… : the launcher's one-time bootstrap link. Pairs this browser; starts no session. */
export async function handleLocalPair(req: Request, deps: LiveDeps = defaultDeps()) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const r = await pairBrowser(req, deps, token);
  if (!r.ok) return new NextResponse(`Atlas wasn't paired with this browser: ${r.error}`, { status: r.status, headers: { "content-type": "text/plain; charset=utf-8", ...NO_STORE } });
  // To the Copilot page on the same origin, without the token in the address.
  return new NextResponse(null, { status: 303, headers: { location: "/copilot", "set-cookie": pairingCookie(deps.env, r.cookie, r.expiresAt), ...NO_STORE, "referrer-policy": "no-referrer" } });
}

/** POST /api/copilot/local/connection {"action":"save"|"use_environment"|"disconnect"} : a paired browser manages the key. No provider request. */
export async function handleLocalConnection(req: Request, deps: LiveDeps = defaultDeps()) {
  // Authorized from its headers and cookies alone, before the body is read: an
  // unauthorized request never makes the server read what it sent.
  const auth = await authorizeLocal(req, deps);
  if (!auth.ok) return refused(auth);
  const read = await smallJson(req);
  if (!read.ok) return refused(read.refusal);
  const body = read.body;
  const r = body.action === "save" ? await saveKey(deps, auth.provider, body) : body.action === "use_environment" ? await useEnvironmentKey(deps, auth.provider) : body.action === "disconnect" ? await disconnect(deps, auth.provider) : null;
  if (!r) return NextResponse.json({ error: 'The action must be "save", "use_environment" or "disconnect".', code: "bad_action" }, { status: 400, headers: NO_STORE });
  if (!r.ok) return refused(r);
  // The key is never echoed: only where it is kept and its status.
  return NextResponse.json({ connection: r.connection, warning: r.warning }, { headers: NO_STORE });
}

/** POST /api/copilot/live-session {"action":"start","allowance":{…}} or {"action":"stop"} : the session's Start and Stop controls. */
export async function handleLiveSessionPost(req: Request, deps: LiveDeps = defaultDeps()) {
  // Authorized from headers and cookies first. Starting a session needs that to
  // pass; Stop stays open to any request from this machine, by design, so that
  // spending can always be halted — its body is read under the same limit, which
  // is the only body an unauthorized caller here can make the server hold.
  const auth = await authorizeLocal(req, deps);
  const read = await smallJson(req);
  if (!read.ok) return refused(read.refusal);
  const action = read.body.action;
  if (action === "start") {
    if (!auth.ok) return refused(auth);
    const r = await startSession(deps, auth.provider, read.body);
    if (!r.ok) return refused(r);
    return NextResponse.json({ live: { session: r.session } }, { headers: { "set-cookie": sessionCookie(deps.env, r.cookie, r.expiresAt), ...NO_STORE } });
  }
  if (action !== "stop") return NextResponse.json({ error: 'The action must be "start" or "stop".' }, { status: 400 });
  const r = await stopLiveSession(req, deps, "stopped from the browser");
  if (!r.ok) return NextResponse.json({ error: r.error, code: r.code }, { status: r.status });
  // A stopped session is over: this browser's cookie goes too.
  return NextResponse.json({ live: { session: r.session } }, { headers: { "set-cookie": clearedSessionCookie(deps.env) } });
}
