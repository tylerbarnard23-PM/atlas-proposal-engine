import { NextResponse } from "next/server";
import { fetchFrankfurterRates } from "@/market-data/providers/FrankfurterFxProvider";
import { DEFAULT_FX_QUOTES, type FxRefreshResponse } from "@/engines/fxPolicy";

export const runtime = "nodejs";

const PROVIDER = "Frankfurter (ECB reference rates)";
const CODE = /^[A-Z]{3}$/;

// Fetches reference rates for the requested currencies. The client merges the
// result into its stored rates (engines/fxPolicy mergeFxRefresh); a provider
// failure is reported as such (502) and must leave the stored rates as they are.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const baseParam = (url.searchParams.get("base") ?? "USD").toUpperCase();
  const base = CODE.test(baseParam) ? baseParam : "USD";
  const requested = [
    ...new Set(
      (url.searchParams.get("quotes") ?? DEFAULT_FX_QUOTES.join(","))
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter((q) => CODE.test(q) && q !== base)
    ),
  ];
  const result = await fetchFrankfurterRates(base, requested);
  const body: FxRefreshResponse = result.ok
    ? { ok: true, provider: PROVIDER, base, requested, rates: result.rates }
    : { ok: false, provider: PROVIDER, base, requested, error: result.error };
  return NextResponse.json(body, { status: result.ok ? 200 : 502 });
}
