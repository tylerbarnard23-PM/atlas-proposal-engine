import type { CountryCode } from "@/domain/types";
import { COUNTRIES, getCountryConfig } from "@/domain/countryConfigs";

export function isCrossBorderHousehold(countries: CountryCode[]): boolean {
  const set = new Set(countries.filter(Boolean));
  return set.size > 1;
}

export function countryNotes(country: CountryCode): string | undefined {
  return getCountryConfig(country).notes;
}

export function listCountries() {
  return COUNTRIES;
}
