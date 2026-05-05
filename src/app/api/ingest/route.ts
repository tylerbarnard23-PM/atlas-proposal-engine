import { NextResponse } from "next/server";
import { ingestionProviderFor } from "@/ingestion/providers/registry";
import type { IngestionInput } from "@/ingestion/types/ingestionTypes";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const body = (await req.json()) as IngestionInput;
  if (!body?.sourceType) return NextResponse.json({ error: "Missing sourceType" }, { status: 400 });
  const provider = ingestionProviderFor(body.sourceType);
  if (!provider) return NextResponse.json({ error: `No provider for ${body.sourceType}` }, { status: 400 });
  try {
    const result = await provider.extract(body);
    return NextResponse.json({ result });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message ?? "Extraction failed" }, { status: 500 });
  }
}
