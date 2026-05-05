import { NextResponse } from "next/server";
import { resolveQuote, holdingsEligibleForEnrichment } from "@/engines/marketDataEngine";
import type { Holding, MarketDataResult } from "@/domain/types";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { holdings, preferredProviderId, forceRefresh } = (await req.json()) as {
    holdings: Holding[];
    preferredProviderId?: string;
    forceRefresh?: boolean;
  };
  const eligible = holdingsEligibleForEnrichment(holdings ?? []);
  const results: { holdingId: string; result: MarketDataResult }[] = [];
  for (const h of eligible) {
    if (!h.identifier) continue;
    const result = await resolveQuote(
      { identifier: h.identifier, assetType: h.assetType, preferredCurrency: h.currency },
      { preferredProviderId, forceRefresh }
    );
    results.push({ holdingId: h.id, result });
  }
  return NextResponse.json({ results });
}
