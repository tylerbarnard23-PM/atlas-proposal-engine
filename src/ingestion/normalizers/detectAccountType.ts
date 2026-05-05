import type { AccountType } from "@/domain/types";

export function detectAccountType(text: string | undefined): AccountType | undefined {
  if (!text) return undefined;
  const u = text.toUpperCase();
  if (u.includes("ROTH IRA")) return "ira_roth";
  if (u.includes("TRADITIONAL IRA") || u.includes("ROLLOVER IRA") || u.includes("IRA")) return "ira_traditional";
  if (u.includes("401(K)") || u.includes("401K")) return "401k";
  if (u.includes("TRUST")) return "trust";
  if (u.includes("CHECKING")) return "bank_checking";
  if (u.includes("SAVINGS")) return "bank_savings";
  if (u.includes("BROKERAGE") || u.includes("TAXABLE")) return "brokerage";
  if (u.includes("PENSION")) return "pension";
  if (u.includes("CUSTODIAL") || u.includes("UTMA") || u.includes("UGMA")) return "custodial";
  if (u.includes("ANNUITY")) return "annuity_account";
  if (u.includes("CRYPTO") || u.includes("WALLET")) return "crypto_wallet";
  if (u.includes("MORTGAGE") || u.includes("LOAN")) return "liability_account";
  return undefined;
}
