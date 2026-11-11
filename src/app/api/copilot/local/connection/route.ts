import { handleLocalConnection } from "@/copilot/routeHandler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Connect Claude: a paired browser saves, selects or removes the API key
// (local only). The key is never returned, and no provider request is made.
export async function POST(req: Request) {
  return handleLocalConnection(req);
}
