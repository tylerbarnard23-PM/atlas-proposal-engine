import type { Disclosure } from "./types";

export const DISCLOSURE_LIBRARY: Disclosure[] = [
  {
    id: "general_risk",
    jurisdiction: "GLOBAL",
    category: "general",
    title: "General Investment Risk",
    body: "All investments involve risk, including potential loss of principal. Diversification does not guarantee a profit or protect against loss in declining markets. Past performance is not indicative of future results.",
    required: true,
  },
  {
    id: "no_guarantee",
    jurisdiction: "GLOBAL",
    category: "no_guarantee",
    title: "No Guarantee of Outcomes",
    body: "Recommendations contained in this proposal reflect the advisor's professional judgment based on currently available information. No outcome, return, or tax result is guaranteed.",
    required: true,
  },
  {
    id: "tax_legal",
    jurisdiction: "GLOBAL",
    category: "tax_legal",
    title: "Not Tax, Legal, or Accounting Advice",
    body: "This proposal does not constitute tax, legal, or accounting advice. Clients should consult qualified tax, legal, and accounting professionals before implementing any strategy.",
    required: true,
  },
  {
    id: "data_source",
    jurisdiction: "GLOBAL",
    category: "data_source",
    title: "Data Sources",
    body: "Holdings information was sourced from client-provided statements, advisor entry, document extraction and optical character recognition, and some values may be carried over from earlier market-data records. Each value's source and recorded date are listed in this proposal. Information obtained from third-party sources is believed to be reliable, but its accuracy and completeness are not guaranteed.",
    required: true,
  },
  {
    id: "valuation_disclaimer",
    jurisdiction: "GLOBAL",
    category: "valuation",
    title: "Valuation",
    body: "Privately held, illiquid, or alternative investments are valued using advisor-entered, sponsor-provided, or manually estimated figures. Such values are not market-derived and may not reflect realizable values upon sale.",
    required: true,
  },
  {
    id: "market_data_disclaimer",
    jurisdiction: "GLOBAL",
    category: "market_data",
    title: "Market Prices",
    body: "Security values in this proposal come from statements, advisor entry or advisor-approved values; they are not live market prices, and they may differ from current prices. A value carried over from an earlier market-data record is shown with the provider and date recorded at the time, and any mock or placeholder values are labeled as such.",
    required: true,
  },
  {
    id: "delayed_quote",
    jurisdiction: "GLOBAL",
    category: "delayed_quote",
    title: "Delayed and EOD Quotes",
    body: "Where this proposal incorporates delayed or end-of-day quotes, such values may differ from prevailing market prices. Quote timestamps are disclosed alongside each enriched holding.",
    required: false,
  },
  {
    id: "mock_fallback",
    jurisdiction: "GLOBAL",
    category: "mock_fallback",
    title: "Mock and Fallback Data",
    body: "Mock or placeholder values may appear in sample or legacy data. Such values are clearly labeled and should not be relied upon as market prices.",
    required: false,
  },
  {
    id: "fx_disclaimer",
    jurisdiction: "GLOBAL",
    category: "fx",
    title: "FX Rates",
    body: "Foreign exchange rates used to convert holdings to the proposal's reporting currency are reference rates obtained from public sources such as the European Central Bank or equivalent. These are not transaction rates and do not reflect bid/ask spreads or execution costs.",
    required: true,
  },
  {
    id: "alternatives",
    jurisdiction: "GLOBAL",
    category: "alternatives",
    title: "Alternative Investments",
    body: "Alternative investments may carry significant illiquidity, valuation uncertainty, leverage, and structural risks. Capital may be locked up, subject to gates, or callable. Stated values often reflect periodic sponsor reporting rather than continuous market quotation.",
    required: false,
  },
  {
    id: "illiquid",
    jurisdiction: "GLOBAL",
    category: "illiquid",
    title: "Illiquidity",
    body: "Holdings designated as illiquid may not be readily redeemable. Realized values upon disposition may differ materially from values shown.",
    required: false,
  },
  {
    id: "crypto",
    jurisdiction: "GLOBAL",
    category: "crypto",
    title: "Digital Assets",
    body: "Digital assets are highly volatile, may be subject to custody, regulatory, and operational risks, and may not benefit from investor protections applicable to traditional securities.",
    required: false,
  },
  {
    id: "cross_border",
    jurisdiction: "GLOBAL",
    category: "cross_border",
    title: "Cross-Border Considerations",
    body: "Cross-border tax, regulatory, succession, and reporting considerations may apply. Coordination with qualified cross-border tax and legal counsel is recommended.",
    required: false,
  },
  {
    id: "advisor_approval",
    jurisdiction: "GLOBAL",
    category: "advisor_approval",
    title: "Advisor Approval",
    body: "Recommendations included in this proposal have been reviewed and approved by the advisor of record. The advisor remains responsible for implementation, suitability, and ongoing monitoring.",
    required: true,
  },
  {
    id: "ocr_extraction",
    jurisdiction: "GLOBAL",
    category: "ocr_extraction",
    title: "OCR and Document Extraction",
    body: "Holdings extracted from images, scanned PDFs, or screenshots were processed using optical character recognition. Such values were reviewed by the advisor before inclusion. Residual extraction error is possible.",
    required: false,
  },
  {
    id: "statement_data",
    jurisdiction: "GLOBAL",
    category: "statement_data",
    title: "Statement Data",
    body: "Account holdings derived from custodian or institutional statements reflect the values shown on those statements as of the dates indicated. Prices and balances may have changed since the statement date.",
    required: false,
  },
  // --- Added after reviewing common industry proposal disclosures. "[Firm]"
  // is a deliberate placeholder: a firm adopting Atlas must substitute its own
  // name and point to its own Form ADV / Form CRS. Concrete wording ("creates
  // conflicts") follows SEC staff guidance against hedged "may" disclosure.
  {
    id: "fees_expenses",
    jurisdiction: "GLOBAL",
    category: "fees",
    title: "Fees and Expenses",
    body: "Advisory fees, fund expenses, transaction costs and other charges reduce investment returns and are not deducted from the values shown in this proposal. [Firm]'s advisory fees and how they are charged are described in its Form ADV Part 2A brochure and Form CRS, available on request and at adviserinfo.sec.gov.",
    required: true,
  },
  {
    id: "conflicts_of_interest",
    jurisdiction: "GLOBAL",
    category: "conflicts",
    title: "Conflicts of Interest",
    body: "[Firm] and its representatives are compensated for advisory services, which creates conflicts of interest, including an incentive to recommend placing more assets under [Firm]'s management. [Firm]'s material conflicts and how it addresses them are described in its Form ADV Part 2A brochure and Form CRS.",
    required: true,
  },
  {
    id: "not_an_offer",
    jurisdiction: "GLOBAL",
    category: "not_an_offer",
    title: "Not an Offer or Agreement",
    body: "This proposal is provided for discussion only. It is not an offer to buy or sell any security and is not an investment advisory agreement. An advisory relationship with [Firm] begins only when both parties have signed an investment advisory agreement.",
    required: true,
  },
  {
    id: "client_information",
    jurisdiction: "GLOBAL",
    category: "client_information",
    title: "Client-Provided Information",
    body: "This proposal relies on information you provided about your finances, goals, risk tolerance and circumstances. Its recommendations may not be appropriate if that information is incomplete, inaccurate or changes. Please tell [Firm] promptly about any changes.",
    required: false,
  },
  {
    id: "held_away_assets",
    jurisdiction: "GLOBAL",
    category: "held_away",
    title: "Assets Held Elsewhere",
    body: "Some accounts shown are held at other institutions and are not managed or held in custody by [Firm]. Their values come from statements or information you supplied and have not been independently verified. Statements from your custodians are the official record of your holdings.",
    required: false,
  },
];

export function requiredDisclosures(): Disclosure[] {
  return DISCLOSURE_LIBRARY.filter((d) => d.required);
}

// The proposal shows the library's current wording for each disclosure, so a
// copy saved by an earlier version (the library has no in-app editor) is never
// rendered with outdated text. A disclosure the library doesn't have keeps its own.
const BY_ID = new Map(DISCLOSURE_LIBRARY.map((d) => [d.id, d]));
export const currentDisclosure = (d: Disclosure): Disclosure => BY_ID.get(d.id) ?? d;
