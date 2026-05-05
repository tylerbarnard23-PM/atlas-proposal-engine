import type { FundamentalsResult } from "@/domain/types";

export function normalizeFundamentals(partial: Partial<FundamentalsResult> & { providerId: string; identifier: FundamentalsResult["identifier"] }): FundamentalsResult {
  return {
    ok: partial.ok ?? true,
    providerId: partial.providerId,
    identifier: partial.identifier,
    name: partial.name,
    sector: partial.sector,
    industry: partial.industry,
    country: partial.country,
    marketCap: partial.marketCap,
    peRatio: partial.peRatio,
    dividendYield: partial.dividendYield,
    expenseRatio: partial.expenseRatio,
    beta: partial.beta,
    asOf: partial.asOf ?? new Date().toISOString(),
    warning: partial.warning,
    raw: partial.raw,
  };
}
