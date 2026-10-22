import type { Account, CurrencyCode, FxRate, Holding, Proposal, ProposalSection, Recommendation } from "@/domain/types";
import { sumBy } from "@/utils/numbers";
import { resolveFxRate } from "./currencyEngine";
import type { HoldingValuation } from "./normalizationEngine";
import { amountsInReporting, type ReportingAmounts } from "./recommendationAmounts";

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
// the recommendation's amounts, and whether the holding is a liability. Pure
// function: no cash flow side-effects, no mutation. Used by both the engine
// (applyRecommendationsToProposed) and the UI (per-rec effect summary on
// recommendation cards) so the two stay in sync. The value and the amounts
// are in the reporting currency: amounts come from amountsInReporting, the
// one place a recommendation's own currency is converted.
export function applyRecToValue(value: number, rec: ReportingAmounts, isLiability: boolean): number {
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
// - Recommendation.actionAmount (unit "amount") and proposedValue are in
//   Recommendation.currency and converted into the reporting currency once,
//   by amountsInReporting; a "percent" amount is a share of the holding's
//   value. A recommendation whose amounts have no rate is left unapplied
//   and reported in `unresolved`.
// - Cash offsets are computed in the reporting currency per account, then
//   converted into the native currency of the account's cash line: its
//   existing cash holding, else a new line in the account's base currency.
// - Every native value is derived from the reporting value with an explicit
//   rate from fx.rates. A missing rate never falls back to 1:1: the affected
//   recommendation is left unapplied and reported in `unresolved`.

export interface FxContext {
  reportingCurrency: CurrencyCode;
  rates: FxRate[];
  /** The current date, for rate-age labels only; no calculation depends on it. */
  now?: Date;
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

type MaybeNormalized = Holding & { valuation?: HoldingValuation };

// A holding's value in the reporting currency, or null.
// - A normalized holding says explicitly whether it is valued: an unvalued
//   one stays unvalued and is never recovered from its statement amount
//   (which may be in a different currency from the value that counts).
// - A raw holding (no valuation) uses its reporting value, else its native
//   value converted with an explicit rate.
// Never the native amount read as if it were the reporting currency.
function reportingValueOf(h: MaybeNormalized, fx: FxContext): number | null {
  if (h.valuation) return h.valuation.status === "valued" && h.reportingMarketValue != null ? h.reportingMarketValue : null;
  if (h.reportingMarketValue != null) return h.reportingMarketValue;
  const rate = rateToReporting(fx, h.currency);
  return rate == null ? null : h.nativeMarketValue * rate;
}

// The currency a holding is valued in: a locked approved value's own
// currency, else the holding's.
const valuationCurrencyOf = (h: MaybeNormalized): CurrencyCode =>
  h.valuation?.currency ?? h.proposalApprovedValue?.currency ?? h.currency;

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
  const unresolved: UnresolvedConversion[] = [];
  // Each recommendation's amounts, converted into the reporting currency once.
  const amountsById = new Map<string, ReportingAmounts>();
  const byHolding = new Map<string, Recommendation[]>();
  for (const rec of approvedRecommendations) {
    if (!rec.relatedHoldingId) continue;
    const h = current.find((x) => x.id === rec.relatedHoldingId);
    const converted = amountsInReporting(rec, fx);
    if (!converted.ok) {
      if (h) {
        unresolved.push({ recommendationId: rec.id, holdingId: h.id, accountId: h.accountId, currency: converted.currency, reportingCurrency: fx.reportingCurrency, reason: converted.reason });
      }
      continue;
    }
    amountsById.set(rec.id, converted.amounts);
    const arr = byHolding.get(rec.relatedHoldingId) ?? [];
    arr.push(rec);
    byHolding.set(rec.relatedHoldingId, arr);
  }

  // Where an account's cash offsets land: its first cash line, else a new
  // line in the account's base currency.
  const cashLine = (accountId: string): MaybeNormalized | undefined =>
    current.find((h) => h.accountId === accountId && h.assetClass === "cash" && !h.isLiability);
  const cashCurrency = (accountId: string): CurrencyCode =>
    cashLine(accountId)?.currency ?? accountById.get(accountId)?.baseCurrency ?? fx.reportingCurrency;
  // Why an account can't take a cash credit or debit, as the currency that
  // blocks it, or null. Its cash line must be valued, with a usable rate for
  // the currency it is valued in (a locked approved value's own currency);
  // a new line needs the rate for the account's base currency. A zero-valued
  // approved line can't be scaled, so its statement currency is needed too.
  const offsetBlocker = (accountId: string): CurrencyCode | null => {
    const line = cashLine(accountId);
    if (!line) return rateToReporting(fx, cashCurrency(accountId)) == null ? cashCurrency(accountId) : null;
    const value = reportingValueOf(line, fx);
    const vc = valuationCurrencyOf(line);
    if (value == null || rateToReporting(fx, vc) == null) return vc;
    if (line.proposalApprovedValue && value === 0 && rateToReporting(fx, line.currency) == null) return line.currency;
    return null;
  };

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
  // resulting cash impact per account (all in the reporting currency). Only
  // conversions an action actually needs are required: an allocation-neutral
  // action (hold, a fee-fund swap) changes nothing and needs no rate.
  const newValueById = new Map<string, number>();
  const startById = new Map<string, number>();
  const cashByAccount = new Map<string, number>();
  const bump = (acctId: string, delta: number) =>
    cashByAccount.set(acctId, (cashByAccount.get(acctId) ?? 0) + delta);
  // Debt paydowns, funded after trades settle (below).
  const paydowns: { holding: Holding; recs: Recommendation[]; amount: number }[] = [];

  for (const h of current) {
    const recs = byHolding.get(h.id);
    if (!recs?.length) continue;
    const start = reportingValueOf(h, fx);
    if (start == null) {
      unresolve(recs, h, valuationCurrencyOf(h));
      continue;
    }
    let value = start;
    let cashOffset = 0; // cash this holding's actions move, in the reporting currency
    let paydown = 0;

    for (const rec of recs) {
      const before = value;
      value = applyRecToValue(value, amountsById.get(rec.id)!, !!h.isLiability);

      // Record the cash side of this rec.
      const change = value - before;
      if (h.isLiability) {
        // change is positive when paying down debt (moving toward 0).
        if (change > 0) paydown += change;
      } else if (h.assetClass !== "cash") {
        // Asset trades produce cash in the opposite direction, in the same account.
        cashOffset -= change;
      }
    }

    // Nothing moved: leave the holding exactly as it is.
    if (value === start && cashOffset === 0 && paydown === 0) continue;

    // Writing the new value needs the rate of the currency it is valued in
    // (an approved value's own currency); a cash offset needs a valued cash
    // line, or a usable rate for the new one it would create.
    const vc = valuationCurrencyOf(h);
    const needed = [vc];
    // A zero-valued approved holding can't be scaled, so its statement currency is needed too.
    if (h.proposalApprovedValue && start === 0 && vc !== h.currency) needed.push(h.currency);
    const blocked = cashOffset !== 0 ? offsetBlocker(h.accountId) : null;
    if (blocked) {
      unresolve(recs, h, blocked);
      continue;
    }
    const missing = needed.find((c) => rateToReporting(fx, c) == null);
    if (missing) {
      unresolve(recs, h, missing);
      continue;
    }
    startById.set(h.id, start);
    if (cashOffset !== 0) bump(h.accountId, cashOffset);
    if (paydown > 0) paydowns.push({ holding: h, recs, amount: paydown });
    newValueById.set(h.id, value);
  }

  // A loan account rarely holds cash, so a paydown is funded from household
  // cash: accounts with the most available cash (after this proposal's trades)
  // are drawn first. Cash is valued in the reporting currency with explicit
  // rates; cash in a currency with no rate can't be valued, so it isn't drawn
  // on. Anything the household can't cover stays on the loan's own account,
  // where it shows up as a cash shortfall, which needs that account's cash
  // currency to convert, or the paydown is left unapplied.
  if (paydowns.length > 0) {
    const available = new Map<string, number>();
    for (const h of current) {
      if (h.isLiability || h.assetClass !== "cash") continue;
      const v = reportingValueOf(h, fx);
      if (v == null || offsetBlocker(h.accountId)) continue;
      available.set(h.accountId, (available.get(h.accountId) ?? 0) + v);
    }
    // Proceeds count too, even in an account with no cash line yet; every
    // account with a cash delta had its cash currency's rate checked above.
    for (const [acct, delta] of cashByAccount) available.set(acct, (available.get(acct) ?? 0) + delta);
    for (const p of paydowns) {
      let remaining = p.amount;
      const draws: [string, number][] = [];
      const sources = [...available].filter(([, cash]) => cash > 0).sort((a, b) => b[1] - a[1]);
      for (const [acct, cash] of sources) {
        if (remaining <= 1e-9) break;
        const draw = Math.min(cash, remaining);
        draws.push([acct, draw]);
        remaining -= draw;
      }
      const loanAccount = p.holding.accountId;
      const loanBlocked = remaining > 1e-9 ? offsetBlocker(loanAccount) : null;
      if (loanBlocked) {
        unresolve(p.recs, p.holding, loanBlocked);
        newValueById.delete(p.holding.id);
        continue;
      }
      for (const [acct, draw] of draws) {
        bump(acct, -draw);
        available.set(acct, available.get(acct)! - draw);
      }
      if (remaining > 1e-9) bump(loanAccount, -remaining);
    }
  }

  // Second pass: write the new values, each in its own currency. A locked
  // approved value moves in its own currency, and the statement amount moves
  // in proportion, so re-valuing the proposed holding gives the same figure.
  const result: Holding[] = current.map((h: MaybeNormalized) => {
    const newVal = newValueById.get(h.id);
    if (newVal === undefined) return h;
    const vc = valuationCurrencyOf(h);
    const inValuationCurrency = newVal / rateToReporting(fx, vc)!;
    const start = startById.get(h.id) ?? 0;
    const nativeMarketValue = !h.proposalApprovedValue
      ? inValuationCurrency
      : start !== 0
      ? h.nativeMarketValue * (newVal / start)
      : newVal / rateToReporting(fx, h.currency)!;
    return {
      ...h,
      reportingMarketValue: newVal,
      nativeMarketValue,
      ...(h.proposalApprovedValue ? { proposalApprovedValue: { ...h.proposalApprovedValue, amount: inValuationCurrency } } : {}),
      ...(h.valuation?.status === "valued" ? { valuation: { ...h.valuation, amount: inValuationCurrency } } : {}),
    };
  });

  // Third pass: apply each account's net cash delta, converted into the
  // native currency of the line it lands in. Every account that receives a
  // delta had its cash currency's rate checked above.
  for (const [accountId, delta] of cashByAccount) {
    // Ignore only floating-point noise: a real offset, however small (a
    // 50-cent sale), moves cash like any other.
    if (Math.abs(delta) < 0.005) continue;
    const account = accountById.get(accountId);
    const cashIdx = result.findIndex(
      (h) => h.accountId === accountId && h.assetClass === "cash" && !h.isLiability
    );
    if (cashIdx >= 0) {
      const existing: MaybeNormalized = result[cashIdx];
      // Every account with a delta passed offsetBlocker: its cash line is
      // valued and its valuation currency has a rate. The delta moves the
      // value in that currency (an approved value's own), and the statement
      // amount in its own currency where a rate exists, else in proportion,
      // so re-valuing the line gives the same figure.
      const before = reportingValueOf(existing, fx)!;
      const after = before + delta;
      const inValuationCurrency = delta / rateToReporting(fx, valuationCurrencyOf(existing))!;
      const nativeRate = rateToReporting(fx, existing.currency);
      const nativeMarketValue =
        nativeRate != null
          ? existing.nativeMarketValue + delta / nativeRate
          : before !== 0
          ? existing.nativeMarketValue * (after / before)
          : existing.nativeMarketValue;
      const updated: MaybeNormalized = {
        ...existing,
        reportingMarketValue: after,
        nativeMarketValue,
        ...(existing.proposalApprovedValue
          ? { proposalApprovedValue: { ...existing.proposalApprovedValue, amount: existing.proposalApprovedValue.amount + inValuationCurrency } }
          : {}),
        ...(existing.valuation?.status === "valued" ? { valuation: { ...existing.valuation, amount: existing.valuation.amount + inValuationCurrency } } : {}),
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
// Cash is valued in the reporting currency with explicit rates; a cash line
// with neither a reporting value nor a rate can't be valued here (the
// current-portfolio side of that gap is #23).
export function cashShortfallsOf(proposed: Holding[], accounts: Account[], fx: FxContext): CashShortfall[] {
  const cashByAccount = new Map<string, number>();
  for (const h of proposed) {
    if (h.isLiability || h.assetClass !== "cash") continue;
    const v = reportingValueOf(h, fx);
    if (v == null) continue;
    cashByAccount.set(h.accountId, (cashByAccount.get(h.accountId) ?? 0) + v);
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
  return cashShortfallsOf(applyRecommendationsToProposed(current, approvedRecommendations, accounts, fx).holdings, accounts, fx);
}


export function buildProposal(opts: {
  clientId: string;
  advisorId: string;
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
    createdAt: now,
    updatedAt: now,
    approvalStatus: "draft",
    sections: DEFAULT_PROPOSAL_SECTIONS,
    recommendationIds: opts.recommendationIds,
    assumptionIds: opts.assumptionIds,
    disclosureIds: opts.disclosureIds,
  };
}
