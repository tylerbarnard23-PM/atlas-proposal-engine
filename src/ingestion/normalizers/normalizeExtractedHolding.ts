import type { ExtractedHolding } from "@/domain/types";
import { detectAssetClass } from "./detectAssetClass";
import { detectCurrency } from "./detectCurrency";
import { buildIdentifier } from "./detectIdentifier";

export function normalizeExtractedHolding(h: ExtractedHolding): ExtractedHolding {
  const guessedClass = h.assetClass ?? detectAssetClass([h.assetName, h.notes].filter(Boolean).join(" "));
  const guessedCur = h.currency ?? detectCurrency(h.assetName);
  const id = h.identifier ?? buildIdentifier(h.symbol);
  return {
    ...h,
    identifier: id,
    assetClass: guessedClass,
    currency: guessedCur,
  };
}
