import { handleDevSignIn } from "@/server/hosted/hosted";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Hosted mode (#113): a test sign-in for local *.localhost checks only. Off unless STRATOVELL_DEV_SIGNIN=1, and never on Vercel.
export async function POST(req: Request) {
  return handleDevSignIn(req);
}
