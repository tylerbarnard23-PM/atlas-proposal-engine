import type { CountryConfig } from "./types";

export const COUNTRIES: CountryConfig[] = [
  { code: "US", name: "United States", defaultCurrency: "USD", region: "North America" },
  { code: "CA", name: "Canada", defaultCurrency: "CAD", region: "North America" },
  { code: "GB", name: "United Kingdom", defaultCurrency: "GBP", region: "Europe", crossBorderReviewSuggested: true },
  { code: "DE", name: "Germany", defaultCurrency: "EUR", region: "Europe", crossBorderReviewSuggested: true },
  { code: "FR", name: "France", defaultCurrency: "EUR", region: "Europe", crossBorderReviewSuggested: true },
  { code: "CH", name: "Switzerland", defaultCurrency: "CHF", region: "Europe", crossBorderReviewSuggested: true },
  { code: "JP", name: "Japan", defaultCurrency: "JPY", region: "Asia Pacific", crossBorderReviewSuggested: true },
  { code: "AU", name: "Australia", defaultCurrency: "AUD", region: "Asia Pacific", crossBorderReviewSuggested: true },
  { code: "SG", name: "Singapore", defaultCurrency: "SGD", region: "Asia Pacific", crossBorderReviewSuggested: true },
  { code: "HK", name: "Hong Kong SAR", defaultCurrency: "HKD", region: "Asia Pacific", crossBorderReviewSuggested: true },
  { code: "MX", name: "Mexico", defaultCurrency: "MXN", region: "Latin America", crossBorderReviewSuggested: true },
];

export function getCountryConfig(code: string): CountryConfig {
  return (
    COUNTRIES.find((c) => c.code === code) ?? {
      code,
      name: code,
      defaultCurrency: "USD",
      region: "Custom",
    }
  );
}
