import { NextResponse } from "next/server";
import { COPILOT_MODEL, runAgent, type CopilotMode } from "./agent";
import { contextMismatch } from "./context";
import { runDemoCopilot } from "./demo";
import { parseCopilotRequest } from "./snapshot";
import { TEST_PROVIDER_MODEL, createTestProvider } from "./testProvider";
import { admitLiveRun, anthropicClient, claimLiveSession, clearedSessionCookie, liveSessionStatus, sessionCookie, stopLiveSession, type LiveDeps, type LiveRunReport } from "./liveGate";
import { sessionFilePath } from "./liveSessionStore";

// The Copilot API's request handling, kept out of the route files so tests
// can drive it with a fake provider. Modes:
//   - demo (default): the scripted planner. No key, no model.
//   - test (COPILOT_MODE=test): the deterministic test provider through the
//     real loop. No key, no spend, not a model.
//   - live (COPILOT_MODE=live): local testing only, through the live
//     session gate (liveGate.ts). Without an armed, claimed session with
//     allowance left, every live request is refused before any provider call.

const MAX_BODY_BYTES = 1_000_000;

export function copilotMode(env: Record<string, string | undefined>): CopilotMode {
  if (env.COPILOT_MODE === "live") return "live";
  if (env.COPILOT_MODE === "test") return "test";
  return "demo";
}

export const defaultDeps = (): LiveDeps => ({ env: process.env, now: () => new Date(), sessionFile: sessionFilePath(process.env), makeClient: anthropicClient });

export async function handleCopilotGet(req: Request, deps: LiveDeps = defaultDeps()) {
  const mode = copilotMode(deps.env);
  if (mode !== "live") return NextResponse.json({ mode, model: mode === "test" ? TEST_PROVIDER_MODEL : null });
  const live = await liveSessionStatus(req, deps);
  return NextResponse.json({ mode, model: live.provider === "fake" ? TEST_PROVIDER_MODEL : COPILOT_MODEL, live });
}

export async function handleCopilotPost(req: Request, deps: LiveDeps = defaultDeps()) {
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Workspace too large for one Copilot request." }, { status: 413 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
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
  return new NextResponse(null, { status: 303, headers: { location: to.pathname, "set-cookie": sessionCookie(r.cookie, r.expiresAt), "cache-control": "no-store", "referrer-policy": "no-referrer" } });
}

/** POST /api/copilot/live-session {"action":"stop"} : the Stop control. */
export async function handleLiveSessionPost(req: Request, deps: LiveDeps = defaultDeps()) {
  let action: unknown;
  try {
    action = (await req.json())?.action;
  } catch {
    action = null;
  }
  if (action !== "stop") return NextResponse.json({ error: 'The only action is "stop".' }, { status: 400 });
  const r = await stopLiveSession(req, deps, "stopped from the browser");
  if (!r.ok) return NextResponse.json({ error: r.error, code: r.code }, { status: r.status });
  // A stopped session is over: this browser's cookie goes too.
  return NextResponse.json({ live: { session: r.session } }, { headers: { "set-cookie": clearedSessionCookie() } });
}
