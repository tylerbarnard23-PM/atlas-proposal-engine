import { NextResponse } from "next/server";
import { providerRegistry } from "@/market-data/providers/registry";
import type { FundamentalsRequest, FundamentalsResult } from "@/domain/types";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json()) as { request: FundamentalsRequest };
  if (!body?.request?.identifier?.value) {
    return NextResponse.json({ error: "Missing identifier" }, { status: 400 });
  }
  const providers = providerRegistry();
  let last: FundamentalsResult | null = null;
  for (const p of providers) {
    if (!p.fetchFundamentals) continue;
    if (p.requiresApiKey && !p.hasApiKey?.()) continue;
    if (!p.supportedIdentifiers.includes(body.request.identifier.type)) continue;
    try {
      const r = await p.fetchFundamentals(body.request);
      last = r;
      if (r.ok) return NextResponse.json({ result: r });
    } catch {
      continue;
    }
  }
  return NextResponse.json({ result: last ?? { ok: false, providerId: "none", identifier: body.request.identifier, warning: "No fundamentals provider available." } });
}
