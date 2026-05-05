import { NextResponse } from "next/server";
import { resolveQuote } from "@/engines/marketDataEngine";
import type { MarketDataRequest } from "@/domain/types";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json()) as { request: MarketDataRequest; preferredProviderId?: string; forceRefresh?: boolean };
  if (!body?.request?.identifier?.value) {
    return NextResponse.json({ error: "Missing identifier" }, { status: 400 });
  }
  const result = await resolveQuote(body.request, {
    preferredProviderId: body.preferredProviderId,
    forceRefresh: body.forceRefresh,
  });
  return NextResponse.json({ result });
}
