import type { AssetClass } from "@/domain/types";

const KEYWORDS: { class: AssetClass; words: string[] }[] = [
  { class: "fixed_income", words: ["TREAS", "TREASURY", "BOND", "MUNI", "MUNICIPAL", "AGENCY", "T-BILL", "T-NOTE", "CD", "CERTIFICATE OF DEPOSIT"] },
  { class: "equity", words: ["ETF", "STOCK", "FUND", "EQUITY", "ADR", "MUTUAL FUND"] },
  { class: "cash", words: ["CASH", "MONEY MARKET", "MMKT", "SWEEP"] },
  { class: "crypto", words: ["BITCOIN", "BTC", "ETHEREUM", "ETH", "USDC", "USDT", "STABLECOIN", "CRYPTO"] },
  { class: "real_estate", words: ["REIT", "REAL ESTATE", "PROPERTY"] },
  { class: "private_equity", words: ["PRIVATE EQUITY", "LP INTEREST", "BUYOUT"] },
  { class: "private_credit", words: ["PRIVATE CREDIT", "DIRECT LENDING", "CREDIT FUND"] },
  { class: "hedge_fund", words: ["HEDGE FUND"] },
  { class: "insurance", words: ["ANNUITY", "INSURANCE", "WHOLE LIFE", "VARIABLE LIFE", "UL"] },
  { class: "liability", words: ["MORTGAGE", "LOAN", "LIABILITY", "LINE OF CREDIT", "HELOC"] },
  { class: "commodity", words: ["GOLD", "SILVER", "PLATINUM", "COMMODITY"] },
];

export function detectAssetClass(text: string | undefined): AssetClass | undefined {
  if (!text) return undefined;
  const upper = text.toUpperCase();
  for (const { class: c, words } of KEYWORDS) {
    if (words.some((w) => matches(upper, w))) return c;
  }
  return undefined;
}

// Short tokens must be whole words (plurals allowed): "CD" isn't in
// "MCDONALD'S", "GOLD" isn't in "GOLDMAN SACHS", "UL" isn't in "ULTA".
function matches(upper: string, word: string): boolean {
  if (word.length > 4) return upper.includes(word);
  return new RegExp(`(^|[^A-Z0-9])${word}S?($|[^A-Z0-9])`).test(upper);
}
