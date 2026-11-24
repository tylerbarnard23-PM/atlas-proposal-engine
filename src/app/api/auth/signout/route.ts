import { handleSignOut } from "@/server/hosted/hosted";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Hosted mode (#113): ends this browser's sign-in.
export async function POST(req: Request) {
  return handleSignOut(req);
}
