import { handleHostedSession } from "@/server/hosted/hosted";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Hosted mode (#113): starts (with a confirmed allowance) or stops the signed-in user's session. Starting sends nothing to a provider.
export async function POST(req: Request) {
  return handleHostedSession(req);
}
