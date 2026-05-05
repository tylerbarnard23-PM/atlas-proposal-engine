import type { Holding } from "@/domain/types";
import { isStale } from "@/utils/dates";

export function isHoldingPriceStale(h: Holding, dayThreshold = 5): boolean {
  if (h.priceFreshness === "stale") return true;
  if (h.valuationDate && isStale(h.valuationDate, dayThreshold)) return true;
  return false;
}
