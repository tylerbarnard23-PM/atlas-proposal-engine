import type { ExtractedAccount } from "@/domain/types";
import { detectAccountType } from "./detectAccountType";
import { detectCurrency } from "./detectCurrency";
import { normalizeExtractedHolding } from "./normalizeExtractedHolding";

export function normalizeExtractedAccount(a: ExtractedAccount): ExtractedAccount {
  return {
    ...a,
    accountType: a.accountType ?? detectAccountType(a.accountName),
    currency: a.currency ?? detectCurrency(a.accountName),
    holdings: a.holdings.map(normalizeExtractedHolding),
  };
}
