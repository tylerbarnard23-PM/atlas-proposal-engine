import type { CurrencyCode } from "@/domain/types";

const CURRENCY_HINTS: Record<string, CurrencyCode> = {
  $: "USD",
  US$: "USD",
  USD: "USD",
  CAD: "CAD",
  C$: "CAD",
  EUR: "EUR",
  "€": "EUR",
  GBP: "GBP",
  "£": "GBP",
  CHF: "CHF",
  "¥": "JPY",
  JPY: "JPY",
  AUD: "AUD",
  A$: "AUD",
  SGD: "SGD",
  HKD: "HKD",
  MXN: "MXN",
};

export function detectCurrency(text: string | undefined): CurrencyCode | undefined {
  if (!text) return undefined;
  const upper = text.toUpperCase();
  for (const [hint, code] of Object.entries(CURRENCY_HINTS)) {
    if (upper.includes(hint.toUpperCase())) return code;
  }
  return undefined;
}
