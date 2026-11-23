// The pricing convention every quantity × price check uses (#46). Shares are
// priced per unit; bonds per 100 of face value, so 250,000 face at 100.42 is
// 251,050. One helper so the import, its classification and the holding
// quality check can't disagree about the same row.

/** How far `gross` is from `value`, as a fraction of the value (at least 1 unit). */
export const relativeGap = (gross: number, value: number) => Math.abs(gross - value) / Math.max(1, Math.abs(value));

/**
 * Whether quantity × price matches the value per unit, only per 100 of face
 * value, or neither, within `tolerance` (a fraction). Null when a figure is missing.
 */
export function quantityPriceBasis(
  quantity: number | null | undefined,
  price: number | null | undefined,
  value: number | null | undefined,
  tolerance: number
): "per_unit" | "per_100" | "mismatch" | null {
  if (quantity == null || price == null || value == null) return null;
  if (relativeGap(quantity * price, value) <= tolerance) return "per_unit";
  if (relativeGap((quantity * price) / 100, value) <= tolerance) return "per_100";
  return "mismatch";
}

const BOND_TYPES = new Set(["bond", "treasury", "municipal_bond", "corporate_bond", "sovereign_bond"]);

/**
 * An instrument whose price may be quoted per 100 of face value (PR #110 review): the instrument is the evidence,
 * not its asset class. A recorded instrument type decides: a bond type is per 100; an ETF, a mutual fund, a share
 * or any other type is per unit, even when it's classed as fixed income. With no instrument type recorded, only
 * fixed income identified by a CUSIP or ISIN (as the import records a bond) may be per 100; a ticker means per unit.
 */
export const quotedPer100 = (h: { assetClass?: string; assetType?: string; identifier?: { type: string } }) =>
  h.assetType ? BOND_TYPES.has(h.assetType) : h.assetClass === "fixed_income" && (h.identifier?.type === "cusip" || h.identifier?.type === "isin");
