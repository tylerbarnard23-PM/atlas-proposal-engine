import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { runLiveCopilot } from "@/copilot/agent";
import { runDemoCopilot } from "@/copilot/demo";
import { parseCopilotRequest } from "@/copilot/snapshot";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_BODY_BYTES = 1_000_000;

// Live mode is opt-in: it needs both ANTHROPIC_API_KEY and COPILOT_MODE=live.
// This route has no auth, so a key that lands on a public deployment by
// mistake must not be enough to start spending it.
function liveEnabled(): boolean {
  return !!process.env.ANTHROPIC_API_KEY && process.env.COPILOT_MODE === "live";
}

export async function GET() {
  return NextResponse.json({ mode: liveEnabled() ? "live" : "demo" });
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
  const { question, snapshot } = parsed.value;

  if (!liveEnabled()) {
    return NextResponse.json(runDemoCopilot(snapshot, question));
  }
  try {
    return NextResponse.json(await runLiveCopilot(snapshot, question));
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({ error: "The Anthropic API key was rejected." }, { status: 502 });
    }
    if (err instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "Rate limited by the Anthropic API. Try again shortly." }, { status: 429 });
    }
    if (err instanceof Anthropic.APIError) {
      return NextResponse.json({ error: `Anthropic API error (${err.status ?? "network"}).` }, { status: 502 });
    }
    throw err;
  }
}
