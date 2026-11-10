import { handleCopilotGet, handleCopilotPost } from "@/copilot/routeHandler";

export const runtime = "nodejs";
export const maxDuration = 120;

// Demo by default; COPILOT_MODE=test runs the deterministic test provider;
// COPILOT_MODE=live is local testing through the live session gate only.
// This route has no auth, so a key on a public deployment must never be
// enough to start spending it: see src/copilot/routeHandler.ts and liveGate.ts.

export async function GET(req: Request) {
  return handleCopilotGet(req);
}

export async function POST(req: Request) {
  return handleCopilotPost(req);
}
