import { handleLocalPair } from "@/copilot/routeHandler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The launcher's one-time bootstrap link (`npm run local`, local only). It
// pairs this browser with Atlas on this machine; it starts no session.
export async function GET(req: Request) {
  return handleLocalPair(req);
}
