import type {
  ClientProfile,
  AdvisorProfile,
  Account,
  Holding,
  Recommendation,
  Disclosure,
  ComplianceCheck,
  FxConfirmation,
  FxRate,
  SourceDocument,
  WorkingDraft,
} from "@/domain/types";
import { describeLink, linksNeedingReview } from "./recommendationLinks";
import { applyRecommendationsToProposed, cashShortfallsOf, reserveStatus, type BlockedUnit, type CashShortfall, type ReserveStatus, type UnresolvedConversion } from "./proposalEngine";
import { normalizeHoldings } from "./normalizationEngine";
import { missingPairs, valuationSummary, type ValuationSummary } from "./valuationTotals";
import { describeImportIssue, importIssues, type ImportIssue } from "./importCompleteness";
import { openCurrencyReviews } from "./recommendationAmounts";
import { describeFreshness, fxFreshness, type FxFreshness } from "./fxPolicy";

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
  // Approved recommendations that couldn't be applied for lack of an FX rate.
  unresolvedConversions?: UnresolvedConversion[];
  // Holdings that couldn't be valued in the reporting currency.
  valuation?: ValuationSummary;
  // Imported documents whose rows don't account for the whole document.
  importIssues?: ImportIssue[];
  // Age and confirmation of the exchange rates the calculations use (#26).
  fxFreshness?: FxFreshness;
  /** D2: approved units left out whole, and reserve breaches, in the approved proposal. */
  blockedUnits?: BlockedUnit[];
  reserveBreaches?: ReserveStatus[];
  /** D2: names of the alternatives that hold approved actions, when more than one. */
  approvedAlternatives?: string[];
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
  const valuation = inp.valuation;
  checks.push({
    code: "holdings_valued",
    label: "All holdings valued in the reporting currency",
    passed: !valuation || valuation.complete,
    detail:
      valuation && !valuation.complete
        ? `${valuation.net.unvaluedCount} not valued: ${missingPairs(valuation.net, inp.client.proposalOutputCurrency).join(", ")} rate missing`
        : undefined,
  });
  const issues = inp.importIssues ?? [];
  checks.push({
    code: "imports_complete",
    label: "Imported documents fully accounted for",
    passed: issues.length === 0,
    detail: issues.length > 0 ? issues.map(describeImportIssue).join("; ") : undefined,
  });
  checks.push({
    code: "unverified_holdings",
    label: "All holding values confirmed",
    passed: inp.unverifiedHoldingsCount === 0,
    detail: inp.unverifiedHoldingsCount > 0 ? `${inp.unverifiedHoldingsCount} holding value(s) not yet confirmed` : undefined,
  });
  checks.push({
    code: "stale_valuations",
    label: "Out-of-date values reviewed",
    passed: inp.staleValuationsCount === 0,
    detail: inp.staleValuationsCount > 0 ? `${inp.staleValuationsCount} out-of-date value(s) not yet reviewed` : undefined,
  });
  checks.push({
    code: "market_data",
    label: "Placeholder values reviewed",
    passed: inp.marketDataIssuesCount === 0,
    detail: inp.marketDataIssuesCount > 0 ? `${inp.marketDataIssuesCount} placeholder value(s) not yet reviewed` : undefined,
  });
  checks.push({
    code: "approved_recs",
    label: "At least one approved recommendation included in PDF",
    passed: inp.recommendations.some((r) => r.approvedByAdvisor && r.includeInPdf),
  });
  // Saved before amounts had their own currency (#24): the old label differs
  // from the currency the amounts were calculated in, and the advisor hasn't
  // said which is meant. Confirming holdings doesn't touch this.
  const reviews = openCurrencyReviews(inp.recommendations);
  checks.push({
    code: "recommendation_currency",
    label: "Recommendation currencies confirmed",
    passed: reviews.length === 0,
    detail:
      reviews.length > 0
        ? reviews.map((r) => `${r.title}: calculated in ${r.currencyReview!.calculatedIn}, saved label ${r.currencyReview!.legacyLabel}`).join("; ")
        : undefined,
  });
  // A recommendation whose holding or account was removed is kept for review
  // (engines/recommendationLinks): what it would do can't be shown, so the
  // final PDF waits until the advisor relinks, rejects or deletes it.
  const orphaned = linksNeedingReview(inp);
  checks.push({
    code: "recommendation_links",
    label: "Recommendations linked to current holdings and accounts",
    passed: orphaned.length === 0,
    detail: orphaned.length > 0 ? `${orphaned.map(describeLink).join("; ")}. Relink, reject or delete it in Recommendations.` : undefined,
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
  // D2: a linked replacement or proposed-investment purchase is applied whole
  // or not at all, and an account's eligible cash keeps its reserve.
  const blockedUnits = inp.blockedUnits ?? [];
  const breaches = inp.reserveBreaches ?? [];
  const money = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  checks.push({
    code: "funding_reserves",
    label: "Linked replacements applied whole and cash reserves kept",
    passed: blockedUnits.length === 0 && breaches.length === 0,
    detail:
      blockedUnits.length + breaches.length > 0
        ? [
            ...blockedUnits.map((b) => b.reason),
            ...breaches.map((b) =>
              b.problem === "removed"
                ? `${b.accountName}: its eligible cash ${b.cashHoldingId} was removed; choose its eligible cash again (reserve ${money(b.reserve)} kept)`
                : b.problem === "not_cash"
                ? `${b.accountName}: its eligible cash ${b.cashHoldingId} is no longer a cash line in this account; choose its eligible cash again (reserve ${money(b.reserve)} kept)`
                : b.available == null
                ? `${b.accountName}: eligible cash unknown, so its ${money(b.reserve)} reserve can't be confirmed`
                : `${b.accountName}: eligible cash ${b.currency} ${money(b.available)} is below its ${money(b.reserve)} reserve`
            ),
          ].join("; ")
        : undefined,
  });
  const mixed = inp.approvedAlternatives ?? [];
  checks.push({
    code: "approved_alternative",
    label: "Approved actions come from one alternative",
    passed: mixed.length <= 1,
    detail: mixed.length > 1 ? `Approved actions are in ${mixed.join(", ")}. Approve one alternative's actions for the PDF.` : undefined,
  });
  const unresolved = inp.unresolvedConversions ?? [];
  if (inp.fxFreshness) {
    checks.push({
      code: "fx_current",
      label: "Exchange rates current",
      passed: inp.fxFreshness.current,
      detail: describeFreshness(inp.fxFreshness),
    });
  }
  checks.push({
    code: "fx_available",
    label: "Exchange rates available for proposed trades",
    passed: unresolved.length === 0,
    detail:
      unresolved.length > 0
        ? [...new Set(unresolved.map((u) => `${u.currency}/${u.reportingCurrency}`))].join(", ") + " rate missing"
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
  /** Rates used to express proposed trades in each holding's own currency. */
  fxRates: FxRate[];
  /** Imported documents, to check each import accounted for its whole document. */
  sourceDocuments: SourceDocument[];
  /** The advisor's confirmation of stale rates in use, if any (#26). */
  fxConfirmation?: FxConfirmation | null;
  /** The clock for rate age and confirmation expiry; the server's own when omitted. */
  now?: Date;
  /** D2: the working draft and the other alternatives, to tell whether approvals mix them. */
  drafts?: WorkingDraft[];
}

export function evaluateWorkspaceReadiness(ws: WorkspaceReadinessInputs): ComplianceCheck[] {
  const fx = { reportingCurrency: ws.client.proposalOutputCurrency, rates: ws.fxRates };
  // Value the holdings here, from their amounts and the current rates, rather
  // than trusting any reporting value they arrive with: the UI, the PDF route
  // and the Copilot then all gate on the same valuation.
  const holdings = normalizeHoldings(ws.holdings, ws.fxRates, fx.reportingCurrency);
  const pending = holdingsNeedingReview(holdings);
  const approved = ws.recommendations.filter((r) => r.approvedByAdvisor);
  const proposed = applyRecommendationsToProposed(holdings, approved, ws.accounts, fx);
  const approvedIds = new Set(approved.map((r) => r.id));
  const approvedAlternatives = (ws.drafts ?? []).filter((d) => d.memberIds.some((id) => approvedIds.has(id))).map((d) => d.name);
  return evaluateReadiness({
    blockedUnits: proposed.blocked,
    reserveBreaches: reserveStatus(proposed.holdings, ws.accounts).filter((r) => r.breached),
    approvedAlternatives,
    cashShortfalls: cashShortfallsOf(proposed.holdings, ws.accounts, fx),
    unresolvedConversions: proposed.unresolved,
    valuation: valuationSummary(holdings),
    importIssues: importIssues(ws.sourceDocuments ?? [], ws.holdings),
    fxFreshness: fxFreshness({
      holdings: ws.holdings,
      accounts: ws.accounts,
      recommendations: ws.recommendations,
      fxRates: ws.fxRates,
      reportingCurrency: fx.reportingCurrency,
      confirmation: ws.fxConfirmation ?? null,
      now: ws.now ?? new Date(),
    }),
    ...ws,
    holdings,
    disclosures: ws.disclosures.filter((d) => d.required),
    unverifiedHoldingsCount: pending.length,
    staleValuationsCount: pending.filter((p) => p.reasons.includes("stale")).length,
    marketDataIssuesCount: pending.filter((p) => p.reasons.includes("mock")).length,
    insightsReviewedCount: 0,
    totalInsightsCount: 0,
  });
}
