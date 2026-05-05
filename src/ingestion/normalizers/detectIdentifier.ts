import type { AssetIdentifier, IdentifierType } from "@/domain/types";

const CUSIP_RE = /^[0-9A-Z]{9}$/;
const ISIN_RE = /^[A-Z]{2}[0-9A-Z]{9}\d$/;
const SEDOL_RE = /^[0-9A-Z]{7}$/;
const TICKER_RE = /^[A-Z][A-Z0-9.\-]{0,10}$/;

export function detectIdentifierType(value: string): IdentifierType {
  const v = value.trim().toUpperCase();
  if (!v) return "none";
  if (ISIN_RE.test(v)) return "isin";
  if (CUSIP_RE.test(v)) return "cusip";
  if (SEDOL_RE.test(v)) return "sedol";
  if (TICKER_RE.test(v)) return "ticker";
  return "custom";
}

export function buildIdentifier(value: string | undefined): AssetIdentifier | undefined {
  if (!value) return undefined;
  return { type: detectIdentifierType(value), value: value.trim().toUpperCase() };
}
