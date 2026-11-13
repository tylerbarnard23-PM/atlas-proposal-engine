import { handleLiveSessionClaim } from "@/copilot/routeHandler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The owner's one-time claim link, printed by `npm run live-session -- arm` (local only).
export async function GET(req: Request) {
  return handleLiveSessionClaim(req);
}
