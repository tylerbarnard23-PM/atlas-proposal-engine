import { handleHostedConnection } from "@/server/hosted/hosted";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Hosted mode (#113): the signed-in user saves, replaces or disconnects their own API key. No provider request; the key is never returned.
export async function POST(req: Request) {
  return handleHostedConnection(req);
}
