import type {
  ClientProfile,
  AdvisorProfile,
  Account,
  Holding,
  Recommendation,
  Disclosure,
  ComplianceCheck,
} from "@/domain/types";
import { proposedCashShortfalls, type CashShortfall } from "./proposalEngine";

export interface ReadinessInputs {
  client: ClientProfile;
  advisor: AdvisorProfile;
  accounts: Account[];
  holdings: Holding[];
  recommendations: Recommendation[];
  disclosures: Disclosure[];
  unverifiedHoldingsCount: number;
  staleValuationsCount: number;
  marketDataIssuesCount: number;
  insightsReviewedCount: number;
  totalInsightsCount: number;
  // Accounts whose proposed cash goes negative (purchases exceed cash).
  cashShortfalls?: CashShortfall[];
}

export function evaluateReadiness(inp: ReadinessInputs): ComplianceCheck[] {
  const checks: ComplianceCheck[] = [];
  checks.push({
    code: "client_profile",
    label: "Client profile complete",
    passed: !!inp.client.fullName && !!inp.client.baseCurrency && !!inp.client.countryOfResidence,
  });
  checks.push({
    code: "advisor_profile",
    label: "Advisor profile complete",
    passed: !!inp.advisor.name && !!inp.advisor.firmName,
  });
  checks.push({
    code: "accounts_present",
    label: "At least one account added",
    passed: inp.accounts.length > 0,
  });
  checks.push({
    code: "holdings_present",
    label: "At least one holding added",
    passed: inp.holdings.length > 0,
  });
  checks.push({
    code: "output_currency",
    label: "Output currency selected",
    passed: !!inp.client.proposalOutputCurrency,
  });
  checks.push({
    code: "unverified_holdings",
    label: "All holding values confirmed",
    passed: inp.unverifiedHoldingsCount === 0,
    detail: inp.unverifiedHoldingsCount > 0 ? `${inp.unverifiedHoldingsCount} holding value(s) not yet confirmed` : undefined,
  });
  checks.push({
    code: "stale_valuations",
    label: "Out-of-date prices checked",
    passed: inp.staleValuationsCount === 0,
    detail: inp.staleValuationsCount > 0 ? `${inp.staleValuationsCount} out-of-date price(s)` : undefined,
  });
  checks.push({
    code: "market_data",
    label: "Placeholder prices checked",
    passed: inp.marketDataIssuesCount === 0,
    detail: inp.marketDataIssuesCount > 0 ? `${inp.marketDataIssuesCount} placeholder price(s)` : undefined,
  });
  checks.push({
    code: "approved_recs",
    label: "At least one approved recommendation included in PDF",
    passed: inp.recommendations.some((r) => r.approvedByAdvisor && r.includeInPdf),
  });
  const shortfalls = inp.cashShortfalls ?? [];
  checks.push({
    code: "trades_funded",
    label: "Proposed trades are funded",
    passed: shortfalls.length === 0,
    detail:
      shortfalls.length > 0
        ? shortfalls.map((s) => `${s.accountName} short ${Math.round(s.shortfall).toLocaleString()}`).join("; ")
        : undefined,
  });
  checks.push({
    code: "disclosures_included",
    label: "Required disclosures included",
    passed: inp.disclosures.length > 0,
  });
  return checks;
}

export function readinessOk(checks: ComplianceCheck[]): boolean {
  return checks.every((c) => c.passed);
}

// --- Workspace-level readiness --------------------------------------------
// One place that derives the counts above from the workspace, so the
// dashboard, Proposal Builder, PDF Preview, the Copilot and the PDF API all
// agree on what blocks a final PDF.

export type ReviewReason = "unverified" | "stale" | "mock";

export interface HoldingNeedingReview {
  holding: Holding;
  reasons: ReviewReason[];
}

// A holding the advisor has looked at (reviewed, approved, locked or
// rejected) no longer blocks the PDF for staleness or mock pricing: the
// checklist asks for those to be *reviewed*, not eliminated.
function isReviewed(h: Holding): boolean {
  return h.advisorVerification !== "unverified";
}

export function holdingsNeedingReview(holdings: Holding[]): HoldingNeedingReview[] {
  const out: HoldingNeedingReview[] = [];
  for (const h of holdings) {
    if (isReviewed(h)) continue;
    const reasons: ReviewReason[] = ["unverified"];
    if (h.priceFreshness === "stale") reasons.push("stale");
    if (h.valuationSource.kind === "mock") reasons.push("mock");
    out.push({ holding: h, reasons });
  }
  return out;
}

export interface WorkspaceReadinessInputs {
  client: ClientProfile;
  advisor: AdvisorProfile;
  accounts: Account[];
  holdings: Holding[];
  recommendations: Recommendation[];
  disclosures: Disclosure[];
}

export function evaluateWorkspaceReadiness(ws: WorkspaceReadinessInputs): ComplianceCheck[] {
  const pending = holdingsNeedingReview(ws.holdings);
  const approved = ws.recommendations.filter((r) => r.approvedByAdvisor);
  return evaluateReadiness({
    cashShortfalls: proposedCashShortfalls(ws.holdings, approved, ws.accounts),
    ...ws,
    disclosures: ws.disclosures.filter((d) => d.required),
    unverifiedHoldingsCount: pending.length,
    staleValuationsCount: pending.filter((p) => p.reasons.includes("stale")).length,
    marketDataIssuesCount: pending.filter((p) => p.reasons.includes("mock")).length,
    insightsReviewedCount: 0,
    totalInsightsCount: 0,
  });
}
