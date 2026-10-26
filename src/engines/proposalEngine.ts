import type { Account, CurrencyCode, FxRate, Holding, Proposal, ProposalSection, Recommendation } from "@/domain/types";
import { sumBy } from "@/utils/numbers";
import { resolveFxRate } from "./currencyEngine";
import type { HoldingValuation } from "./normalizationEngine";
import { amountsInReporting, type ReportingAmounts } from "./recommendationAmounts";
import { cashBasisCurrency, fundingProblem, fundingProblemText, type UnresolvedFunding } from "./recommendationLinks";

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
  { key: "market_data_sources", label: "Valuation Sources & Dates", enabled: true, required: true },
  { key: "assumptions", label: "Assumptions", enabled: true, required: true },
  { key: "disclosures", label: "Disclosures", enabled: true, required: true },
  { key: "appendix_holdings", label: "Appendix — Holdings", enabled: true },
  { key: "appendix_accounts", label: "Appendix — Accounts", enabled: true },
  { key: "appendix_market_data", label: "Appendix — Valuation & Exchange-Rate Sources", enabled: true },
  { key: "appendix_compliance", label: "Appendix — Compliance Checklist", enabled: false },
];

// A section's visible name comes from its key, so a label saved with an older
// version (R18 renamed the market-data sections) needs no migration. Only
// keys this version doesn't know keep their saved label.
const SECTION_LABELS = new Map(DEFAULT_PROPOSAL_SECTIONS.map((s) => [s.key, s.label]));
export const sectionLabel = (s: ProposalSection) => SECTION_LABELS.get(s.key) ?? s.label;

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
  /**
   * D2 units (a linked replacement, or a purchase of a proposed investment)
   * left out whole because they can't be applied as a unit: incomplete,
   * across accounts, no eligible cash, an unsupported currency change, a
   * missing rate, or a reserve breach. Never half-applied.
   */
  blocked: BlockedUnit[];
}

export interface BlockedUnit {
  unitId: string;
  recommendationIds: string[];
  accountId?: string;
  reason: string;
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
  return applyAtomically(current, approvedRecommendations, accounts, fx);
}

// The core: legacy per-holding application, plus D2 proposed investments
// (each a zero-valued line that exists only in the proposal) and an account's
// designated eligible cash line receiving its offsets.
function applyCore(
  current0: Holding[],
  approvedRecommendations: Recommendation[],
  accounts: Account[],
  fx: FxContext
): { holdings: Holding[]; unresolved: UnresolvedConversion[]; blocked: BlockedUnit[] } {
  const accountById = new Map(accounts.map((a) => [a.id, a] as const));
  const unresolved: UnresolvedConversion[] = [];
  const blockedCore: BlockedUnit[] = [];
  // Proposed investments: validated, then added as zero-valued lines the
  // purchase grows. They exist only in this result.
  const destinations = new Map<string, MaybeNormalized>();
  const recs: Recommendation[] = [];
  for (const rec of approvedRecommendations) {
    if (!rec.destination || rec.relatedHoldingId) {
      recs.push(rec);
      continue;
    }
    const d = rec.destination;
    const problem = destinationProblem(rec, current0, accountById, fx);
    if (problem) {
      blockedCore.push({ unitId: unitIdOf(rec), recommendationIds: [rec.id], accountId: d.accountId, reason: problem });
      continue;
    }
    if (!destinations.has(d.id)) {
      const rate = rateToReporting(fx, d.currency)!;
      const account = accountById.get(d.accountId)!;
      destinations.set(d.id, {
        id: d.id,
        accountId: d.accountId,
        assetName: d.name,
        assetClass: d.assetClass,
        currency: d.currency,
        country: account.country,
        nativeMarketValue: 0,
        reportingMarketValue: 0,
        valuation: { status: "valued", currency: d.currency, amount: 0, rate, rateAsOf: "", rateSource: "", rateLegs: [] },
        valuationSource: { kind: "advisor_entered", note: "Proposed investment (not currently held)" },
        quoteType: "advisor_entered",
        priceFreshness: "manual",
        advisorVerification: "advisor_reviewed",
        dataQuality: [],
        proposedOnly: true,
        createdAt: "",
        updatedAt: "",
      } as MaybeNormalized);
    }
    recs.push({ ...rec, relatedHoldingId: d.id });
  }
  const current: Holding[] = [...current0, ...destinations.values()];
  // Each recommendation's amounts, converted into the reporting currency once.
  const amountsById = new Map<string, ReportingAmounts>();
  const byHolding = new Map<string, Recommendation[]>();
  for (const rec of recs) {
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
  // line in the account's base currency. An account with an explicit funding
  // rule (D2) uses its designated eligible cash only: never another line or a
  // new one, even when the designated line is removed, reclassified or unvalued.
  const ruled = (accountId: string) => !!accountById.get(accountId)?.funding;
  const cashLine = (accountId: string): MaybeNormalized | undefined => {
    const account = accountById.get(accountId);
    if (account?.funding) return eligibleCashOf(account, current);
    return current.find((h) => h.accountId === accountId && h.assetClass === "cash" && !h.isLiability);
  };
  const cashCurrency = (accountId: string): CurrencyCode =>
    cashLine(accountId)?.currency ?? accountById.get(accountId)?.baseCurrency ?? fx.reportingCurrency;
  // Why an account can't take a cash credit or debit, as the currency that
  // blocks it, or null. Its cash line must be valued, with a usable rate for
  // the currency it is valued in (a locked approved value's own currency);
  // a new line needs the rate for the account's base currency. A zero-valued
  // approved line can't be scaled, so its statement currency is needed too.
  // An account with a funding rule whose designated cash can't take it says
  // so as a funding problem, not a missing rate.
  type OffsetBlock = { kind: "fx"; currency: CurrencyCode } | { kind: "funding"; reason: string };
  const offsetBlocker = (accountId: string): OffsetBlock | null => {
    const line = cashLine(accountId);
    const account = accountById.get(accountId);
    if (account?.funding) {
      const problem = fundingProblem(account, current);
      if (problem) {
        return {
          kind: "funding",
          reason: `${account.name}'s eligible cash ${account.funding.cashHoldingId} ${fundingProblemText(account, current)}, so this action can't be funded. ${problem === "reserve_currency" ? "Restate its reserve in the Allocation desk." : "Choose its eligible cash again."}`,
        };
      }
      if (line && reportingValueOf(line, fx) == null) {
        return { kind: "funding", reason: `${account.name}'s eligible cash ${line.assetName} can't be valued, so this action can't be funded from it.` };
      }
    }
    if (!line) return rateToReporting(fx, cashCurrency(accountId)) == null ? { kind: "fx", currency: cashCurrency(accountId) } : null;
    const value = reportingValueOf(line, fx);
    const vc = valuationCurrencyOf(line);
    if (value == null || rateToReporting(fx, vc) == null) return { kind: "fx", currency: vc };
    if (line.proposalApprovedValue && value === 0 && rateToReporting(fx, line.currency) == null) return { kind: "fx", currency: line.currency };
    return null;
  };
  // Actions left unapplied because their account's funding rule can't fund them.
  const fundingBlock = (recs: Recommendation[], accountId: string, reason: string) => {
    for (const rec of recs) blockedCore.push({ unitId: unitIdOf(rec), recommendationIds: [rec.id], accountId, reason });
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
      const amounts = amountsById.get(rec.id)!;
      value = applyRecToValue(value, amounts, !!h.isLiability);

      // Record the cash side of this rec.
      const change = value - before;
      // A unit's sale must fit the position as it stands here: a clamped sale
      // would fund the unit's purchase with proceeds that don't exist.
      if (isUnit(rec) && SALE.has(rec.type) && amounts.actionAmount != null && !h.isLiability) {
        const raw = Math.abs(amounts.actionAmount);
        const wanted = amounts.actionAmountUnit === "percent" ? Math.abs(before) * (raw / 100) : raw;
        if (wanted - (before - value) > 0.005) {
          blockedCore.push({
            unitId: unitIdOf(rec),
            recommendationIds: [rec.id],
            accountId: h.accountId,
            reason: `the sale of ${fx.reportingCurrency} ${amountText(wanted)} of ${h.assetName} is more than its ${fx.reportingCurrency} ${amountText(Math.max(0, before))} value in the draft.`,
          });
        }
      }
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
    if (blocked?.kind === "funding") {
      fundingBlock(recs, h.accountId, blocked.reason);
      continue;
    }
    if (blocked) {
      unresolve(recs, h, blocked.currency);
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
      // An account with a funding rule offers its valid eligible cash only.
      if (ruled(h.accountId) && cashLine(h.accountId)?.id !== h.id) continue;
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
        if (loanBlocked.kind === "funding") fundingBlock(p.recs, loanAccount, loanBlocked.reason);
        else unresolve(p.recs, p.holding, loanBlocked.currency);
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
    const line = cashLine(accountId);
    const cashIdx = line ? result.findIndex((h) => h.id === line.id) : -1;
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

  // A proposed investment nothing was bought into isn't part of the proposal.
  const kept = result.filter((h) => !(h.proposedOnly && !newValueById.has(h.id)));
  return { holdings: kept, unresolved, blocked: blockedCore };
}

const unitIdOf = (r: Recommendation) => r.linked?.groupId ?? `unit:${r.id}`;
const isUnit = (r: Recommendation) => !!r.linked || (!!r.destination && !r.relatedHoldingId);
const PURCHASE = new Set<Recommendation["type"]>(["buy", "increase"]);
// How a unit is named in its reason: a sale with purchases is a replacement; purchases alone are a purchase.
const unitKind = (legs: Recommendation[]) => (legs.length === 1 ? "Purchase" : legs.some((r) => SALE.has(r.type)) ? "Linked replacement" : "Linked purchase");
const SALE = new Set<Recommendation["type"]>(["sell", "raise_cash", "reduce", "reduce_concentration"]);

/** Why a proposed-investment purchase can't be applied, or null (D2 rules). */
function destinationProblem(rec: Recommendation, current: Holding[], accounts: Map<string, Account>, fx: FxContext): string | null {
  const d = rec.destination!;
  const account = accounts.get(d.accountId);
  if (!account || account.isLiabilityAccount) return `The account for ${d.name} isn't a supported investment account.`;
  if (!PURCHASE.has(rec.type)) return `${d.name} isn't held yet, so it can only be bought.`;
  if (d.assetClass === "cash" || d.assetClass === "liability") return `${d.name} must be an investment, not cash or a liability.`;
  const source = eligibleCashOf(account, current);
  const problem = fundingProblem(account, current);
  if (problem) return `The eligible cash chosen for ${account.name} ${fundingProblemText(account, current)}, so ${d.name} can't be funded. ${problem === "reserve_currency" ? "Restate its reserve." : "Choose its eligible cash again."}`;
  if (!source) return `${account.name} has no eligible cash source chosen, so ${d.name} can't be funded. Choose its eligible cash first.`;
  const sourceCurrency = (source as MaybeNormalized).valuation?.currency ?? source.proposalApprovedValue?.currency ?? source.currency;
  if (sourceCurrency !== d.currency) return `${d.name} is in ${d.currency} but the eligible cash in ${account.name} is in ${sourceCurrency}; currency conversion inside the account isn't supported.`;
  if (rateToReporting(fx, d.currency) == null) return `No ${d.currency}/${fx.reportingCurrency} exchange rate, so ${d.name} can't be valued.`;
  return null;
}

/** An account's designated eligible cash: a cash line in that account, or nothing (removed, or since reclassified: not spendable). */
const eligibleCashOf = (account: Account, holdings: Holding[]): Holding | undefined =>
  fundingProblem(account, holdings) ? undefined : holdings.find((h) => h.id === account.funding?.cashHoldingId);

/** An account's reserve against its designated eligible cash in a (proposed) portfolio. */
export interface ReserveStatus {
  accountId: string;
  accountName: string;
  cashHoldingId: string;
  cashName: string | null;
  currency: CurrencyCode | null;
  reserve: number;
  /** The eligible cash in its own currency, or null when unknown (missing or unvalued): unknown is never spendable. */
  available: number | null;
  /** Why the rule doesn't resolve: its cash line was removed, is no longer a cash line in the account, or the reserve isn't in its currency. */
  problem: UnresolvedFunding["reason"] | null;
  /** The currency the reserve was stated in, or null when none was recorded (unknown). */
  reserveCurrency: CurrencyCode | null;
  /** The designated line's currency basis when it still exists, else null. */
  sourceCurrency: CurrencyCode | null;
  headroom: number | null;
  breached: boolean;
}

export function reserveStatus(holdings: Holding[], accounts: Account[]): ReserveStatus[] {
  return accounts
    .filter((a) => a.funding)
    .map((a) => {
      const h = eligibleCashOf(a, holdings) as MaybeNormalized | undefined;
      const problem = fundingProblem(a, holdings);
      const designated = holdings.find((x) => x.id === a.funding!.cashHoldingId);
      const available = !h ? null : h.valuation ? (h.valuation.status === "valued" ? h.valuation.amount : null) : h.nativeMarketValue;
      const reserve = a.funding!.reserve;
      const headroom = available == null ? null : available - reserve;
      return {
        accountId: a.id,
        accountName: a.name,
        cashHoldingId: a.funding!.cashHoldingId,
        cashName: h?.assetName ?? null,
        currency: h ? h.valuation?.currency ?? h.currency : null,
        reserve,
        available,
        problem,
        reserveCurrency: a.funding!.reserveCurrency ?? null,
        sourceCurrency: designated ? cashBasisCurrency(designated) : null,
        headroom,
        breached: headroom == null || headroom < -0.005,
      };
    });
}

const amountText = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

// D2 atomicity. A unit (a linked replacement, or a purchase of a proposed
// investment) applies whole or not at all: it is left out, with its reason,
// when it is incomplete, spans accounts, has a leg the core can't apply, or
// leaves its account's eligible cash below the reserve. Units are dropped
// one at a time (the latest in saved order first) and the rest re-evaluated.
// Ordinary legacy actions are never dropped; a breach they cause is reported
// by reserveStatus.
function applyAtomically(current: Holding[], recs: Recommendation[], accounts: Account[], fx: FxContext): ProposedPortfolio {
  const blocked: BlockedUnit[] = [];
  const extraUnresolved: UnresolvedConversion[] = [];
  const holdingAccount = new Map(current.map((h) => [h.id, h.accountId] as const));
  const accountOf = (r: Recommendation) =>
    r.destination && !r.relatedHoldingId ? r.destination.accountId : r.relatedHoldingId ? holdingAccount.get(r.relatedHoldingId) : r.relatedAccountId;
  const units = new Map<string, Recommendation[]>();
  for (const r of recs) if (isUnit(r)) units.set(unitIdOf(r), [...(units.get(unitIdOf(r)) ?? []), r]);
  const drop = new Set<string>();
  const block = (id: string, reason: string, accountId?: string) => {
    drop.add(id);
    blocked.push({ unitId: id, recommendationIds: units.get(id)!.map((r) => r.id), accountId, reason });
  };
  for (const [id, legs] of units) {
    const expected = legs[0].linked?.legs ?? legs.length;
    const accts = new Set(legs.map(accountOf));
    if (legs.length !== expected) {
      block(id, `Linked replacement incomplete: ${legs.length} of its ${expected} actions are included. All of its actions must be included (and approved) together.`, accountOf(legs[0]));
    } else if (accts.size > 1 || accts.has(undefined)) {
      block(id, "A linked replacement across accounts isn't supported: both sides must be in the same account.");
    }
  }
  const order = [...units.keys()];
  for (let pass = 0; pass <= units.size; pass++) {
    const active = recs.filter((r) => !isUnit(r) || !drop.has(unitIdOf(r)));
    const core = applyCore(current, active, accounts, fx);
    const failed = new Map<string, string>();
    // A legacy action the core couldn't fund (its account's funding rule) is
    // simply unapplied and reported; only units are dropped and re-evaluated.
    const legacyBlocked = core.blocked.filter((b) => !units.has(b.unitId));
    for (const b of core.blocked) if (units.has(b.unitId)) failed.set(b.unitId, b.reason);
    for (const u of core.unresolved) {
      const r = recs.find((x) => x.id === u.recommendationId);
      if (r && isUnit(r) && !failed.has(unitIdOf(r))) failed.set(unitIdOf(r), u.reason);
    }
    if (failed.size > 0) {
      for (const [id, reason] of failed) {
        const legs = units.get(id)!;
        block(id, legs.length > 1 ? `${unitKind(legs)} not applied: ${reason}` : reason, accountOf(legs[0]));
        // Keep missing-rate legs visible to the FX checks.
        for (const u of core.unresolved) if (legs.some((r) => r.id === u.recommendationId)) extraUnresolved.push(u);
      }
      continue;
    }
    // D2a: a sleeve's known minimum applies to its actual proposed commitment
    // (the destination's value in its own currency). Below it, the latest unit
    // buying into that sleeve is left out whole; never presented as completed.
    const below = new Map<string, { name: string; minimum: number; value: number; currency: CurrencyCode }>();
    for (const r of active) {
      const s = r.destination?.strategy;
      if (!s || r.relatedHoldingId || s.minimum == null || below.has(r.destination!.id)) continue;
      const h = core.holdings.find((x) => x.id === r.destination!.id) as MaybeNormalized | undefined;
      const value = h?.valuation?.status === "valued" ? h.valuation.amount : 0;
      if (value + 0.005 < s.minimum) below.set(r.destination!.id, { name: `${s.manager} — ${s.name}`, minimum: s.minimum, value, currency: r.destination!.currency });
    }
    const intoBelow = (id: string) => units.get(id)!.some((r) => r.destination && below.has(r.destination.id));
    const short = [...order].reverse().find((id) => !drop.has(id) && intoBelow(id));
    if (short) {
      const legs = units.get(short)!;
      const m = below.get(legs.find((r) => r.destination && below.has(r.destination.id))!.destination!.id)!;
      block(short, `${unitKind(legs)} not applied: ${m.name} would hold ${m.currency} ${amountText(m.value)}, below its ${m.currency} ${amountText(m.minimum)} minimum.`, accountOf(legs[0]));
      continue;
    }
    const breaches = reserveStatus(core.holdings, accounts).filter((x) => x.breached);
    const draws = (id: string) => units.get(id)!.some((r) => PURCHASE.has(r.type) && breaches.some((b) => b.accountId === accountOf(r)));
    const offender = [...order].reverse().find((id) => !drop.has(id) && draws(id));
    if (offender) {
      const legs = units.get(offender)!;
      const b = breaches.find((x) => legs.some((r) => accountOf(r) === x.accountId))!;
      const left = b.available == null ? "an unknown amount" : `${b.currency} ${amountText(b.available)}`;
      block(offender, `${unitKind(legs)} not applied: it would leave the eligible cash in ${b.accountName} at ${left}, below its ${b.currency ?? ""} ${amountText(b.reserve)} reserve.`, b.accountId);
      continue;
    }
    return { holdings: core.holdings, unresolved: [...core.unresolved, ...extraUnresolved], blocked: [...blocked, ...legacyBlocked] };
  }
  const core = applyCore(current, recs.filter((r) => !isUnit(r)), accounts, fx);
  return { holdings: core.holdings, unresolved: [...core.unresolved, ...extraUnresolved], blocked: [...blocked, ...core.blocked] };
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
