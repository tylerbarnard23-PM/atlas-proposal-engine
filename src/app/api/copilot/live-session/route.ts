import { handleLiveSessionPost } from "@/copilot/routeHandler";

export const runtime = "nodejs";

// The live session's Start and Stop controls (local only). Starting needs a paired browser and a confirmed allowance.
export async function POST(req: Request) {
  return handleLiveSessionPost(req);
}
