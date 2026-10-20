import type { CurrencyCode } from "@/domain/types";
import type { PdfText } from "@/ingestion/pdf/layoutLines";
import { PLAN_EXPECTED, PLAN_PDF } from "../fixtures/financialPlanSample";
import { SAMPLE_BROKERAGE_CSV } from "@/ingestion/sampleSources/sampleBrokerageStatement";
import { SAMPLE_RETIREMENT_CSV } from "@/ingestion/sampleSources/sampleRetirementStatement";
import { SAMPLE_MESSY_TEXT } from "@/ingestion/sampleSources/sampleMessyStatement";
import { SAMPLE_CRYPTO_WALLET } from "@/ingestion/sampleSources/sampleCryptoWalletScreenshot";
import { SAMPLE_TRUST_STATEMENT } from "@/ingestion/sampleSources/sampleTrustStatement";
import { SAMPLE_BANK_STATEMENT } from "@/ingestion/sampleSources/sampleBankStatement";

// Hand-labelled answers for the sample statements that ship with the app.
// Each expected holding is matched to an extracted one by market value
// (within 0.5%), then name/symbol and currency are scored separately.

export interface ExpectedHolding {
  label: string; // symbol or short name, matched case-insensitively against symbol/name
  marketValue: number;
  currency: CurrencyCode;
}

export interface EvalCase {
  name: string;
  parser: "csv" | "pasted" | "pdf";
  text: string;
  pdf?: PdfText; // layout lines, for parser "pdf"
  expected: ExpectedHolding[];
}

export const EXTRACTION_CASES: EvalCase[] = [
  {
    name: "Brokerage CSV",
    parser: "csv",
    text: SAMPLE_BROKERAGE_CSV,
    expected: [
      { label: "AAPL", marketValue: 941556, currency: "USD" },
      { label: "MSFT", marketValue: 856050.5, currency: "USD" },
      { label: "VTI", marketValue: 916544, currency: "USD" },
      { label: "BRK.B", marketValue: 518155, currency: "USD" },
      { label: "Cash", marketValue: 184200, currency: "USD" },
    ],
  },
  {
    name: "Retirement CSV",
    parser: "csv",
    text: SAMPLE_RETIREMENT_CSV,
    expected: [
      { label: "VOO", marketValue: 754040, currency: "USD" },
      { label: "VFORX", marketValue: 407622, currency: "USD" },
      { label: "MARGX", marketValue: 181760, currency: "USD" },
      { label: "Cash", marketValue: 4250, currency: "USD" },
    ],
  },
  {
    name: "Swiss private bank (messy paste)",
    parser: "pasted",
    text: SAMPLE_MESSY_TEXT,
    expected: [
      { label: "NESN.SW", marketValue: 193864, currency: "CHF" },
      { label: "ROG.SW", marketValue: 48312, currency: "CHF" },
      { label: "ABBN.SW", marketValue: 20172, currency: "CHF" },
      { label: "Cash", marketValue: 12400, currency: "CHF" },
    ],
  },
  {
    name: "Crypto wallet (OCR text)",
    parser: "pasted",
    text: SAMPLE_CRYPTO_WALLET,
    expected: [
      { label: "BTC", marketValue: 657408, currency: "USD" },
      { label: "ETH", marketValue: 311520, currency: "USD" },
      { label: "USDC", marketValue: 42000, currency: "USD" },
    ],
  },
  {
    name: "Trust statement (bonds by CUSIP)",
    parser: "pasted",
    text: SAMPLE_TRUST_STATEMENT,
    expected: [
      { label: "Apple", marketValue: 493000, currency: "USD" },
      { label: "Treasury", marketValue: 743850, currency: "USD" },
      { label: "MA State", marketValue: 251050, currency: "USD" },
    ],
  },
  {
    name: "Bank statement (EUR)",
    parser: "pasted",
    text: SAMPLE_BANK_STATEMENT,
    expected: [
      { label: "Checking", marketValue: 12500, currency: "EUR" },
      { label: "Savings", marketValue: 73900, currency: "EUR" },
    ],
  },
  {
    name: "Financial plan (Balance Sheet, synthetic)",
    parser: "pdf",
    text: "",
    pdf: PLAN_PDF,
    expected: PLAN_EXPECTED.lines.map((l) => ({ label: l.name, marketValue: l.value, currency: "USD" as const })),
  },
];
