import { NextResponse } from "next/server";
import { listProviders } from "@/market-data/providers/registry";

export const runtime = "nodejs";

export async function GET() {
  const providers = listProviders().map((p) => ({
    id: p.id,
    name: p.name,
    sourceType: p.sourceType,
    requiresApiKey: p.requiresApiKey,
    hasApiKey: p.hasApiKey ? p.hasApiKey() : false,
    attributionLine: p.attributionLine,
    supportedAssetTypes: p.supportedAssetTypes,
    supportedIdentifiers: p.supportedIdentifiers,
  }));
  return NextResponse.json({ providers });
}
