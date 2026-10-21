import type { Account, CurrencyCode, FxRate, Holding, Proposal, ProposalSection, Recommendation } from "@/domain/types";
import { sumBy } from "@/utils/numbers";
import { resolveFxRate } from "./currencyEngine";

export const DEFAULT_PROPOSAL_SECTIONS: ProposalSection[] = [
  { key: "executive_summary", label: "Executive Summary", enabled: true, required: true },
  { key: "client_profile", label: "Client Profile", enabled: true },
  { key: "current_portfolio", label: "Current Portfolio", enabled: true, required: true },
  { key: "proposed_portfolio", label: "Proposed Portfolio", enabled: true },
  { key: "recommendations", label: "Advisor Recommendations", enabled: true, required: true },
  { key: "before_after_allocation", label: "Before / After Allocation", enabled: true },
  { key: "currency_exposure", label: "Currency Exposure", enabled: true },
  { key: "country_exposure", label: "Country Exposure", enabled: true },
  { key: "risk_review", label: "Risk Review", enabled: true },
  { key: "liquidity", label: "Liquidity Profile", enabled: true },
  { key: "fee_analysis", label: "Fee Analysis", enabled: true },
  { key: "income_analysis", label: "Income Analysis", enabled: true },
  { key: "tax_considerations", label: "Tax Considerations", enabled: true },
  { key: "implementation", label: "Implementation Plan", enabled: true },
  { key: "data_sources", label: "Data Sources & Quality", enabled: true, required: true },
  { key: "market_data_sources", label: "Market Data & Valuation Sources", enabled: true, required: true },
  { key: "assumptions", label: "Assumptions", enabled: true, required: true },
  { key: "disclosures", label: "Disclosures", enabled: true, required: true },
  { key: "appendix_holdings", label: "Appendix — Holdings", enabled: true },
  { key: "appendix_accounts", label: "Appendix — Accounts", enabled: true },
  { key: "appendix_market_data", label: "Appendix — Market Data Sources", enabled: true },
  { key: "appendix_compliance", label: "Appendix — Compliance Checklist", enabled: false },
];

// Compute the post-rec value for a single holding given its current value,
// the recommendation, and whether the holding is a liability. Pure function:
// no cash flow side-effects, no mutation. Used by both the engine
// (applyRecommendationsToProposed) and the UI (per-rec effect summary on
// recommendation cards) so the two stay in sync.
export function applyRecToValue(value: number, rec: Recommendation, isLiability: boolean): number {
  if (rec.proposedValue != null) return rec.proposedValue;

  // Resolve the effective dollar magnitude, honoring the % vs. $ unit.
  let amount: number | null = null;
  if (rec.actionAmount != null) {
    const raw = Math.abs(rec.actionAmount);
    amount = rec.actionAmountUnit === "percent" ? Math.abs(value) * (raw / 100) : raw;
  }
  // Signed equivalent for types that need direction (rebalance).
  const signedAmount =
    rec.actionAmount != null
      ? rec.actionAmountUnit === "percent"
        ? Math.abs(value) * (rec.actionAmount / 100)
        : rec.actionAmount
      : null;

  switch (rec.type) {
    case "sell":
    case "raise_cash":
      // With an action amount (dollars or %), treat as a partial sale —
      // matches natural advisor language like "sell 40% of AAPL". Without
      // an amount, fully exit the position.
      return amount != null ? Math.max(0, value - amount) : 0;
    case "reduce":
    case "reduce_concentration":
      return amount != null ? Math.max(0, value - amount) : value * 0.5;
    case "pay_down_debt":
      if (isLiability) return amount != null ? Math.min(0, value + amount) : value * 0.5;
      return value;
    case "increase":
    case "buy":
      return amount != null ? value + amount : value;
    case "rebalance":
      return signedAmount != null ? value + signedAmount : value;
    case "tax_loss_harvest":
    case "replace_high_fee_fund":
    case "improve_asset_location":
      // Net-flat on allocation: same exposure, different vehicle/lot.
      return value;
    default:
      return value;
  }
}

// Currency contract for the proposed portfolio
// ---------------------------------------------
// - Holding.nativeMarketValue is in Holding.currency.
// - Holding.reportingMarketValue is in the proposal's reporting currency
//   (fx.reportingCurrency), as produced by normalizeHoldings.
// - Recommendation.actionAmount (unit "amount") and proposedValue are in the
//   reporting currency; a "percent" amount is a share of the holding's value.
//   Recommendation.currency is descriptive and not used by this engine.
// - Cash offsets are computed in the reporting currency per account, then
//   converted into the native currency of the account's cash line: its
//   existing cash holding, else a new line in the account's base currency.
// - Every native value is derived from the reporting value with an explicit
//   rate from fx.rates. A missing rate never falls back to 1:1: the affected
//   recommendation is left unapplied and reported in `unresolved`.

export interface FxContext {
  reportingCurrency: CurrencyCode;
  rates: FxRate[];
}

export interface UnresolvedConversion {
  recommendationId: string;
  holdingId: string;
  accountId: string;
  /** The currency that couldn't be converted to or from the reporting currency. */
  currency: CurrencyCode;
  reportingCurrency: CurrencyCode;
  reason: string;
}

export interface ProposedPortfolio {
  holdings: Holding[];
  /** Approved recommendations that couldn't be applied for lack of an FX rate. */
  unresolved: UnresolvedConversion[];
}

// Rate to convert 1 unit of `ccy` into the reporting currency, or null.
function rateToReporting(fx: FxContext, ccy: CurrencyCode): number | null {
  if (ccy === fx.reportingCurrency) return 1;
  const r = resolveFxRate(fx.rates, ccy, fx.reportingCurrency);
  return r && r.rate > 0 ? r.rate : null;
}

// Apply approved recommendations to produce the proposed holdings view.
// Hierarchy of intent for any single recommendation:
//   1. Explicit proposedValue → set the holding to that value.
//   2. Recommendation type → infer effect (sell zeroes, reduce subtracts, etc.).
//   3. actionAmount (with optional percent unit) when type implies signed delta.
// Multiple recs on the same holding compose in order. Recs with no
// relatedHoldingId are advisory-only and don't shift the proposed allocation.
//
// Cash flow: every value change on an asset holding produces an offsetting
// cash flow in the same account (sale → cash credit, purchase → cash debit).
// Pay-down-debt on a liability uses cash from that account to retire debt.
// Net cash deltas are applied to the account's existing cash holding when one
// exists; otherwise a synthetic "Net Proposed Cash" line is added so the
// proposed total equals the current total (modulo external cash flows).
export function applyRecommendationsToProposed(
  current: Holding[],
  approvedRecommendations: Recommendation[],
  accounts: Account[],
  fx: FxContext
): ProposedPortfolio {
  const accountById = new Map(accounts.map((a) => [a.id, a] as const));
  const byHolding = new Map<string, Recommendation[]>();
  for (const rec of approvedRecommendations) {
    if (!rec.relatedHoldingId) continue;
    const arr = byHolding.get(rec.relatedHoldingId) ?? [];
    arr.push(rec);
    byHolding.set(rec.relatedHoldingId, arr);
  }

  // The native currency an account's cash offsets land in.
  const cashLine = (accountId: string) =>
    current.find((h) => h.accountId === accountId && h.assetClass === "cash" && !h.isLiability);
  const cashCurrency = (accountId: string): CurrencyCode =>
    cashLine(accountId)?.currency ?? accountById.get(accountId)?.baseCurrency ?? fx.reportingCurrency;

  const unresolved: UnresolvedConversion[] = [];
  const unresolve = (recs: Recommendation[], h: Holding, currency: CurrencyCode) => {
    for (const rec of recs) {
      unresolved.push({
        recommendationId: rec.id,
        holdingId: h.id,
        accountId: h.accountId,
        currency,
        reportingCurrency: fx.reportingCurrency,
        reason: `No ${currency}/${fx.reportingCurrency} exchange rate, so this recommendation was not applied.`,
      });
    }
  };

  // First pass: compute new values for each touched holding and record the
  // resulting cash impact per account (all in the reporting currency).
  const newValueById = new Map<string, number>();
  const cashByAccount = new Map<string, number>();
  const bump = (acctId: string, delta: number) =>
    cashByAccount.set(acctId, (cashByAccount.get(acctId) ?? 0) + delta);
  // Debt paydowns per liability account, funded after trades settle (below).
  const paydowns: { accountId: string; amount: number }[] = [];

  for (const h of current) {
    const recs = byHolding.get(h.id);
    if (!recs?.length) continue;
    // Both the holding's currency and the currency its cash offset lands in
    // must convert, or the rec can't be expressed in native terms.
    const missing = [h.currency, cashCurrency(h.accountId)].find((c) => rateToReporting(fx, c) == null);
    if (missing) {
      unresolve(recs, h, missing);
      continue;
    }
    let value = h.reportingMarketValue ?? h.nativeMarketValue * rateToReporting(fx, h.currency)!;

    for (const rec of recs) {
      const before = value;
      value = applyRecToValue(value, rec, !!h.isLiability);

      // Record the cash side of this rec.
      const change = value - before;
      if (h.isLiability) {
        // change is positive when paying down debt (moving toward 0).
        if (change > 0) paydowns.push({ accountId: h.accountId, amount: change });
      } else if (h.assetClass !== "cash") {
        // Asset trades produce cash in the opposite direction, in the same account.
        if (change !== 0) bump(h.accountId, -change);
      }
    }

    newValueById.set(h.id, value);
  }

  // A loan account rarely holds cash, so a paydown is funded from household
  // cash: accounts with the most available cash (after this proposal's trades)
  // are drawn first. Anything the household can't cover stays on the loan's
  // own account, where it shows up as a cash shortfall. Cash in a currency
  // with no rate can't be valued, so it isn't drawn on.
  if (paydowns.length > 0) {
    const available = new Map<string, number>();
    for (const h of current) {
      if (h.isLiability || h.assetClass !== "cash" || rateToReporting(fx, h.currency) == null) continue;
      available.set(h.accountId, (available.get(h.accountId) ?? 0) + (h.reportingMarketValue ?? h.nativeMarketValue));
    }
    for (const [acct, delta] of cashByAccount) available.set(acct, (available.get(acct) ?? 0) + delta);
    for (const p of paydowns) {
      let remaining = p.amount;
      const sources = [...available]
        .filter(([acct, cash]) => cash > 0 && rateToReporting(fx, cashCurrency(acct)) != null)
        .sort((a, b) => b[1] - a[1]);
      for (const [acct, cash] of sources) {
        if (remaining <= 0) break;
        const draw = Math.min(cash, remaining);
        bump(acct, -draw);
        available.set(acct, cash - draw);
        remaining -= draw;
      }
      if (remaining > 0) bump(p.accountId, -remaining);
    }
  }

  // Second pass: write the new values, keeping each in its own currency.
  const result: Holding[] = current.map((h) => {
    const newVal = newValueById.get(h.id);
    if (newVal === undefined) return h;
    return { ...h, reportingMarketValue: newVal, nativeMarketValue: newVal / rateToReporting(fx, h.currency)! };
  });

  // Third pass: apply each account's net cash delta, converted into the
  // native currency of the line it lands in. Every account that receives a
  // delta had its cash currency's rate checked above.
  for (const [accountId, delta] of cashByAccount) {
    if (Math.abs(delta) < 1) continue; // ignore sub-dollar noise
    const account = accountById.get(accountId);
    const cashIdx = result.findIndex(
      (h) => h.accountId === accountId && h.assetClass === "cash" && !h.isLiability
    );
    if (cashIdx >= 0) {
      const existing = result[cashIdx];
      const rate = rateToReporting(fx, existing.currency)!;
      const updated: Holding = {
        ...existing,
        reportingMarketValue: (existing.reportingMarketValue ?? existing.nativeMarketValue * rate) + delta,
        nativeMarketValue: existing.nativeMarketValue + delta / rate,
        valuationSource: {
          ...existing.valuationSource,
          note: [existing.valuationSource.note, "Adjusted by proposed actions"]
            .filter(Boolean)
            .join(" · "),
        },
        advisorNotes: [existing.advisorNotes, "Includes proposed-action cash flow"]
          .filter(Boolean)
          .join("\n"),
      };
      result[cashIdx] = updated;
    } else {
      const currency = cashCurrency(accountId);
      const rate = rateToReporting(fx, currency)!;
      result.push({
        id: `synth_cash_${accountId}`,
        accountId,
        assetName: "Net Proposed Cash",
        assetClass: "cash",
        subAssetClass: "cash_equivalents",
        country: account?.country,
        currency,
        nativeMarketValue: delta / rate,
        reportingMarketValue: delta,
        liquidity: "cash",
        valuationDate: new Date().toISOString().slice(0, 10),
        valuationSource: {
          kind: "advisor_entered",
          asOf: new Date().toISOString(),
          confidence: "high",
          note: "Synthetic cash position: net of proposed actions in this account",
        },
        quoteType: "advisor_entered",
        priceFreshness: "manual",
        advisorVerification: "advisor_reviewed",
        dataQuality: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  }

  return { holdings: result, unresolved };
}

export interface CashShortfall {
  accountId: string;
  accountName: string;
  shortfall: number; // positive amount of cash missing, in the reporting currency
}

// Accounts whose cash would go negative in a proposed portfolio, i.e.
// purchases (or debt paydowns) larger than the cash available in that
// account. The proposal must not present negative cash as an allocation.
export function cashShortfallsOf(proposed: Holding[], accounts: Account[]): CashShortfall[] {
  const cashByAccount = new Map<string, number>();
  for (const h of proposed) {
    if (h.isLiability || h.assetClass !== "cash") continue;
    cashByAccount.set(h.accountId, (cashByAccount.get(h.accountId) ?? 0) + (h.reportingMarketValue ?? h.nativeMarketValue));
  }
  const names = new Map(accounts.map((a) => [a.id, a.name] as const));
  return [...cashByAccount]
    .filter(([, cash]) => cash < -0.5)
    .map(([accountId, cash]) => ({ accountId, accountName: names.get(accountId) ?? accountId, shortfall: -cash }));
}

export function proposedCashShortfalls(
  current: Holding[],
  approvedRecommendations: Recommendation[],
  accounts: Account[],
  fx: FxContext
): CashShortfall[] {
  return cashShortfallsOf(applyRecommendationsToProposed(current, approvedRecommendations, accounts, fx).holdings, accounts);
}

export function netWorth(holdings: Holding[]): { gross: number; liabilities: number; net: number } {
  const assets = sumBy(holdings.filter((h) => !h.isLiability), (h) => h.reportingMarketValue ?? h.nativeMarketValue);
  const liabilities = sumBy(holdings.filter((h) => h.isLiability), (h) => h.reportingMarketValue ?? h.nativeMarketValue);
  return { gross: assets, liabilities: Math.abs(liabilities), net: assets + liabilities };
}

export function buildProposal(opts: {
  clientId: string;
  advisorId: string;
  outputCurrency: string;
  outputCountry: string;
  recommendationIds: string[];
  assumptionIds: string[];
  disclosureIds: string[];
  title?: string;
}): Proposal {
  const now = new Date().toISOString();
  return {
    id: `prop_${Math.random().toString(36).slice(2, 10)}`,
    clientId: opts.clientId,
    advisorId: opts.advisorId,
    title: opts.title ?? "Family Wealth Proposal",
    outputCurrency: opts.outputCurrency,
    outputCountry: opts.outputCountry,
    createdAt: now,
    updatedAt: now,
    approvalStatus: "draft",
    sections: DEFAULT_PROPOSAL_SECTIONS,
    recommendationIds: opts.recommendationIds,
    assumptionIds: opts.assumptionIds,
    disclosureIds: opts.disclosureIds,
  };
}
