import type { MarketDataProvider } from "../types/marketDataTypes";
import { normalizeQuote } from "../normalize/normalizeQuote";
import { normalizeFundamentals } from "../normalize/normalizeFundamentalData";

// SEC EDGAR is not a price source — it's a filings/fundamentals source.
// We expose fetchFundamentals via the company tickers map + companyfacts endpoint.

const USER_AGENT =
  process.env.SEC_USER_AGENT ?? "Atlas Proposal Engine research-contact@atlas-advisors.example";

let TICKERS_CACHE: Map<string, string> | null = null;

async function loadTickerToCik(): Promise<Map<string, string>> {
  if (TICKERS_CACHE) return TICKERS_CACHE;
  try {
    const res = await fetch("https://www.sec.gov/files/company_tickers.json", {
      headers: { "User-Agent": USER_AGENT },
      next: { revalidate: 60 * 60 * 24 } as never,
    } as RequestInit);
    if (!res.ok) return new Map();
    const json = (await res.json()) as Record<string, { ticker: string; cik_str: number; title: string }>;
    const map = new Map<string, string>();
    for (const k of Object.keys(json)) {
      const v = json[k]!;
      map.set(v.ticker.toUpperCase(), String(v.cik_str).padStart(10, "0"));
    }
    TICKERS_CACHE = map;
    return map;
  } catch {
    return new Map();
  }
}

export const SecEdgarProvider: MarketDataProvider = {
  id: "sec_edgar",
  name: "SEC EDGAR",
  sourceType: "official",
  attributionLine: "U.S. Securities and Exchange Commission EDGAR.",
  supportedAssetTypes: ["stock", "etf", "mutual_fund"],
  supportedIdentifiers: ["ticker"],
  requiresApiKey: false,
  async fetchQuote(req) {
    // Not a quote source.
    return normalizeQuote({
      ok: false,
      providerId: "sec_edgar",
      providerName: "SEC EDGAR",
      identifier: req.identifier,
      warning: "SEC EDGAR is a filings source, not a price source.",
    });
  },
  async fetchFundamentals(req) {
    if (req.identifier.type !== "ticker") {
      return normalizeFundamentals({
        ok: false,
        providerId: "sec_edgar",
        identifier: req.identifier,
        warning: "Only ticker lookups supported.",
      });
    }
    const map = await loadTickerToCik();
    const cik = map.get(req.identifier.value.toUpperCase());
    if (!cik) {
      return normalizeFundamentals({
        ok: false,
        providerId: "sec_edgar",
        identifier: req.identifier,
        warning: "Ticker not found in EDGAR company list.",
      });
    }
    try {
      const res = await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, {
        headers: { "User-Agent": USER_AGENT },
        next: { revalidate: 60 * 60 } as never,
      } as RequestInit);
      if (!res.ok) {
        return normalizeFundamentals({
          ok: false,
          providerId: "sec_edgar",
          identifier: req.identifier,
          warning: `HTTP ${res.status}`,
        });
      }
      const data = (await res.json()) as {
        name: string;
        sicDescription?: string;
        addresses?: { mailing?: { country?: string } };
      };
      return normalizeFundamentals({
        ok: true,
        providerId: "sec_edgar",
        identifier: req.identifier,
        name: data.name,
        industry: data.sicDescription,
        country: data.addresses?.mailing?.country ?? "US",
      });
    } catch (err) {
      return normalizeFundamentals({
        ok: false,
        providerId: "sec_edgar",
        identifier: req.identifier,
        warning: (err as Error).message,
      });
    }
  },
};
