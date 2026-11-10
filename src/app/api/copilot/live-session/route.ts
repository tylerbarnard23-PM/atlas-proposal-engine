import { handleLiveSessionPost } from "@/copilot/routeHandler";

export const runtime = "nodejs";

// The live session's Stop control (local only). Arming happens in a terminal, never here.
export async function POST(req: Request) {
  return handleLiveSessionPost(req);
}
