import { handleSignInCallback } from "@/server/hosted/hosted";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Hosted mode (#113): GitHub's redirect back. Checks the state, signs the user in; the GitHub token is never stored.
export async function GET(req: Request) {
  return handleSignInCallback(req);
}
