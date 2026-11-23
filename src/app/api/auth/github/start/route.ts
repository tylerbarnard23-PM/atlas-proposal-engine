import { handleSignInStart } from "@/server/hosted/hosted";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Hosted mode (#113): starts GitHub sign-in. Reads nothing from the browser but its request.
export async function GET(req: Request) {
  return handleSignInStart(req);
}
