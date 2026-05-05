import type { ExtractedHolding } from "@/domain/types";

export function detectDuplicates(holdings: ExtractedHolding[]): Set<string> {
  const dups = new Set<string>();
  const seen = new Map<string, string>(); // key -> id of first occurrence
  for (const h of holdings) {
    const key = (h.identifier?.value ?? h.symbol ?? h.assetName ?? "").toUpperCase().trim();
    if (!key) continue;
    const prev = seen.get(key);
    if (prev) {
      dups.add(prev);
      dups.add(h.id);
    } else {
      seen.set(key, h.id);
    }
  }
  return dups;
}
