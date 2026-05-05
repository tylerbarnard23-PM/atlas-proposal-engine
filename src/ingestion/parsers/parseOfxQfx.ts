import type { ExtractedAccount, ExtractedHolding } from "@/domain/types";
import { safeId } from "@/utils/formatting";
import { buildIdentifier } from "../normalizers/detectIdentifier";
import { validateExtractedHolding } from "../validation/validateExtractedHolding";

// Minimal OFX/QFX text parser — extracts <POSSTOCK>/<INVPOS> blocks and <CASHBAL> entries.
// Real-world OFX is complex; this gives advisors a starting extraction that they review.

export function parseOfxText(text: string, accountHint?: string): ExtractedAccount {
  const holdings: ExtractedHolding[] = [];
  const blocks = text.match(/<INVPOS>[\s\S]*?<\/INVPOS>/gi) ?? [];
  for (const block of blocks) {
    const get = (tag: string) => {
      const m = block.match(new RegExp(`<${tag}>([^\\n<]+)`, "i"));
      return m ? m[1].trim() : undefined;
    };
    const ticker = get("UNIQUEID");
    const units = parseFloat(get("UNITS") ?? "");
    const price = parseFloat(get("UNITPRICE") ?? "");
    const mkt = parseFloat(get("MKTVAL") ?? "");
    const h: ExtractedHolding = {
      id: safeId("eh"),
      symbol: ticker,
      identifier: buildIdentifier(ticker),
      quantity: Number.isFinite(units) ? units : undefined,
      price: Number.isFinite(price) ? price : undefined,
      marketValue: Number.isFinite(mkt) ? mkt : undefined,
      fields: {},
      warnings: [],
      confidence: "medium",
      sourceTrace: { sourceType: "ofx_qfx", extractionMethod: "regex", extractionConfidence: "medium" },
      status: "extracted",
    };
    holdings.push(validateExtractedHolding(h));
  }
  return {
    id: safeId("ea"),
    accountName: accountHint,
    holdings,
    fields: {},
    warnings: [],
    confidence: holdings.length === 0 ? "low" : "medium",
  };
}
