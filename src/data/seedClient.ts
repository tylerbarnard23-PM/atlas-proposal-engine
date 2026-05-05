import type { ClientProfile, AdvisorProfile, Household } from "@/domain/types";

export const SEED_ADVISOR: AdvisorProfile = {
  id: "adv_atlas_01",
  name: "Margaret S. Whitfield, CFA, CFP®",
  email: "mwhitfield@atlas-advisors.example",
  firmName: "Atlas Private Wealth Advisors",
  phone: "+1 415 555 0117",
  jurisdictions: ["US", "GB", "CH"],
};

export const SEED_CLIENT: ClientProfile = {
  id: "cli_blackwell",
  fullName: "Jonathan & Helena Blackwell",
  preferredName: "The Blackwells",
  householdName: "Blackwell Family Office",
  countryOfResidence: "US",
  taxResidency: "US",
  reportingCountry: "US",
  baseCurrency: "USD",
  proposalOutputCurrency: "USD",
  locale: "en-US",
  riskTolerance: "growth",
  investmentObjective:
    "Multi-generational capital preservation with measured growth, balanced cross-border exposure, and tax-efficient income.",
  timeHorizonYears: 25,
  liquidityNeeds: "moderate",
  incomeNeeds: "modest",
  taxSensitivity: "high",
  esgPreferences: "Avoid controlled tobacco and controversial weapons; tilt toward governance leaders.",
  restrictedSecurities: ["BAYN.DE"],
  specialInstructions:
    "Coordinate Swiss CHF cash position with Zurich-based estate counsel before any reallocation.",
  advisorDiscoveryNotes:
    "Family operates a privately held biotech consulting business in Cambridge, MA. Daughter resides in London (UK tax). Son resides in Geneva (CH tax). Outside trust counsel: Withers LLP. CPA: Marcum LLP.",
};

export const SEED_HOUSEHOLD: Household = {
  id: "hh_blackwell",
  name: "Blackwell Family Office",
  primaryClientId: SEED_CLIENT.id,
  memberClientIds: [SEED_CLIENT.id],
  reportingCurrency: "USD",
  reportingCountry: "US",
};
