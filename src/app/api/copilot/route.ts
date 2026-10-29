import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { COPILOT_MODEL, runAgent, type CopilotMode } from "@/copilot/agent";
import { contextMismatch } from "@/copilot/context";
import { runDemoCopilot } from "@/copilot/demo";
import { parseCopilotRequest } from "@/copilot/snapshot";
import { TEST_PROVIDER_MODEL, createTestProvider } from "@/copilot/testProvider";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_BODY_BYTES = 1_000_000;

// Live mode is opt-in: it needs both ANTHROPIC_API_KEY and COPILOT_MODE=live.
// This route has no auth, so a key that lands on a public deployment by
// mistake must not be enough to start spending it. COPILOT_MODE=test runs the
// deterministic test provider through the real loop (no key, no spend, not a
// model). Anything else is the scripted demo.
function copilotMode(): CopilotMode {
  if (process.env.COPILOT_MODE === "live" && process.env.ANTHROPIC_API_KEY) return "live";
  if (process.env.COPILOT_MODE === "test") return "test";
  return "demo";
}

export async function GET() {
  const mode = copilotMode();
  return NextResponse.json({ mode, model: mode === "live" ? COPILOT_MODEL : mode === "test" ? TEST_PROVIDER_MODEL : null });
}

export async function POST(req: Request) {
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

  const mode = copilotMode();
  try {
    if (mode === "demo") return NextResponse.json(runDemoCopilot(snapshot, question));
    const result = await runAgent(snapshot, question, {
      mode,
      provider: mode === "live" ? "anthropic" : "test",
      // The test provider is requested by its own name, so it is never reported as a fallback.
      model: mode === "live" ? COPILOT_MODEL : TEST_PROVIDER_MODEL,
      // The loop bounds retries itself, so the SDK's are off.
      client: mode === "live" ? new Anthropic({ maxRetries: 0 }) : createTestProvider(),
      signal: req.signal,
    });
    return NextResponse.json(result);
  } catch {
    // A workspace record the engines can't read: say so, without the error's
    // message or any of the workspace. Nothing was saved.
    return NextResponse.json({ error: "Copilot couldn't read this workspace (a record is malformed). Nothing was changed." }, { status: 422 });
  }
}
