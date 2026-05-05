import { NextResponse } from "next/server";
import { fetchFrankfurterRates } from "@/market-data/providers/FrankfurterFxProvider";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const base = (url.searchParams.get("base") ?? "USD").toUpperCase();
  const quotes = (url.searchParams.get("quotes") ?? "EUR,GBP,CHF,JPY,CAD,AUD,SGD,HKD,MXN")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const rates = await fetchFrankfurterRates(base, quotes);
  return NextResponse.json({ rates });
}
