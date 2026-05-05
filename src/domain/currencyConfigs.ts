import type { CurrencyConfig } from "./types";

export const CURRENCIES: CurrencyConfig[] = [
  { code: "USD", symbol: "$", name: "US Dollar", decimals: 2, group: "major" },
  { code: "EUR", symbol: "€", name: "Euro", decimals: 2, group: "major" },
  { code: "GBP", symbol: "£", name: "British Pound", decimals: 2, group: "major" },
  { code: "CHF", symbol: "CHF", name: "Swiss Franc", decimals: 2, group: "major" },
  { code: "JPY", symbol: "¥", name: "Japanese Yen", decimals: 0, group: "major" },
  { code: "CAD", symbol: "C$", name: "Canadian Dollar", decimals: 2, group: "regional" },
  { code: "AUD", symbol: "A$", name: "Australian Dollar", decimals: 2, group: "regional" },
  { code: "SGD", symbol: "S$", name: "Singapore Dollar", decimals: 2, group: "regional" },
  { code: "HKD", symbol: "HK$", name: "Hong Kong Dollar", decimals: 2, group: "regional" },
  { code: "MXN", symbol: "Mex$", name: "Mexican Peso", decimals: 2, group: "regional" },
];

export function getCurrencyConfig(code: string): CurrencyConfig {
  return (
    CURRENCIES.find((c) => c.code === code) ?? {
      code,
      symbol: code,
      name: code,
      decimals: 2,
      group: "custom",
    }
  );
}
