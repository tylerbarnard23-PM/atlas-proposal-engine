import type { Account, Holding, Recommendation } from "@/domain/types";

// Recommendations whose linked holding or account no longer exists (PR #66
// review). Deleting a holding or an account is a normal workflow; the
// recommendations that pointed at it are kept with their content and the
// link they were given (the evidence of what was proposed), never deleted or
// redirected. Their approval is cleared, since the action they describe no
// longer applies as approved, and the readiness check "Recommendations
// linked to current holdings and accounts" blocks the final PDF until the
// advisor reviews them (edit the link, reject or delete).

export interface UnresolvedLink {
  recommendationId: string;
  /** The linked holding that no longer exists. */
  holdingId?: string;
  /** The linked account that no longer exists. */
  accountId?: string;
  /** D2: the account a proposed investment is bought into, which no longer exists. */
  destinationAccountId?: string;
}

type Workspace = { recommendations: Recommendation[]; holdings: Pick<Holding, "id">[]; accounts: Pick<Account, "id">[] };

/** Every recommendation link that doesn't resolve, in recommendation order. */
export function unresolvedRecommendationLinks(ws: Workspace): UnresolvedLink[] {
  const holdings = new Set(ws.holdings.map((h) => h.id));
  const accounts = new Set(ws.accounts.map((a) => a.id));
  const out: UnresolvedLink[] = [];
  for (const r of ws.recommendations) {
    const holdingId = r.relatedHoldingId && !holdings.has(r.relatedHoldingId) ? r.relatedHoldingId : undefined;
    const accountId = r.relatedAccountId && !accounts.has(r.relatedAccountId) ? r.relatedAccountId : undefined;
    const destinationAccountId = r.destination && !accounts.has(r.destination.accountId) ? r.destination.accountId : undefined;
    if (holdingId || accountId || destinationAccountId) {
      out.push({ recommendationId: r.id, ...(holdingId ? { holdingId } : {}), ...(accountId ? { accountId } : {}), ...(destinationAccountId ? { destinationAccountId } : {}) });
    }
  }
  return out;
}

/** Unresolved links that need the advisor's review: those of recommendations not rejected. */
export function linksNeedingReview(ws: Workspace): (UnresolvedLink & { title: string })[] {
  const byId = new Map(ws.recommendations.map((r) => [r.id, r]));
  return unresolvedRecommendationLinks(ws)
    .map((l) => ({ ...l, rec: byId.get(l.recommendationId)! }))
    .filter((l) => l.rec.status !== "excluded")
    .map(({ rec, ...l }) => ({ ...l, title: rec.title }));
}

/** "holding h_aapl and account acc_1": what an unresolved link pointed at. */
export const linkTargets = (l: UnresolvedLink) =>
  [l.holdingId && `holding ${l.holdingId}`, l.accountId && `account ${l.accountId}`, l.destinationAccountId && `destination account ${l.destinationAccountId}`].filter(Boolean).join(" and ");

/** "Trim Apple: its holding h_aapl was removed" */
export function describeLink(l: UnresolvedLink & { title: string }): string {
  return `${l.title}: its ${linkTargets(l)} was removed`;
}

/**
 * D2: an account's eligible-cash rule whose cash line was removed, or is no
 * longer a cash line in that account (reclassified). The rule and its reserve
 * are kept as the advisor set them, never cleared or pointed at other cash;
 * nothing is spent from it, and readiness blocks the final PDF until the
 * advisor chooses valid eligible cash (or the line is a cash line again).
 */
export interface UnresolvedFunding {
  accountId: string;
  cashHoldingId: string;
  reason: "removed" | "not_cash";
}

type FundingHolding = Pick<Holding, "id" | "accountId" | "assetClass" | "isLiability">;

/** Why an account's eligible-cash rule doesn't resolve, or null (no rule, or a cash line in that account). */
export function fundingProblem(account: Pick<Account, "id" | "funding">, holdings: FundingHolding[]): UnresolvedFunding["reason"] | null {
  const id = account.funding?.cashHoldingId;
  if (!id) return null;
  const h = holdings.find((x) => x.id === id);
  if (!h) return "removed";
  return h.accountId === account.id && h.assetClass === "cash" && !h.isLiability ? null : "not_cash";
}

/** Every eligible-cash rule that doesn't resolve, in account order. */
export function unresolvedFundingOf(ws: { accounts: Pick<Account, "id" | "funding">[]; holdings: FundingHolding[] }): UnresolvedFunding[] {
  return ws.accounts.flatMap((a) => {
    const reason = fundingProblem(a, ws.holdings);
    return reason ? [{ accountId: a.id, cashHoldingId: a.funding!.cashHoldingId, reason }] : [];
  });
}

/**
 * The link after the advisor picks a holding (or None) for a recommendation
 * in the editor; the one place that decides it, so the two fields can't
 * disagree. A holding link carries that holding's account. None clears a
 * holding-derived account link and a link to a removed account; an
 * account-only recommendation (no holding) keeps its link to an existing
 * account. Re-picking a removed holding (shown so it isn't hidden) changes
 * nothing.
 */
export function linkToHolding(
  rec: Pick<Recommendation, "relatedHoldingId" | "relatedAccountId">,
  holdingId: string | undefined,
  ws: { holdings: Pick<Holding, "id" | "accountId">[]; accounts: Pick<Account, "id">[] }
): Pick<Recommendation, "relatedHoldingId" | "relatedAccountId"> {
  if (holdingId) {
    const h = ws.holdings.find((x) => x.id === holdingId);
    if (!h) return { relatedHoldingId: rec.relatedHoldingId, relatedAccountId: rec.relatedAccountId };
    return { relatedHoldingId: h.id, relatedAccountId: h.accountId };
  }
  const accountOnly = !rec.relatedHoldingId && !!rec.relatedAccountId && ws.accounts.some((a) => a.id === rec.relatedAccountId);
  return { relatedHoldingId: undefined, relatedAccountId: accountOnly ? rec.relatedAccountId : undefined };
}

/**
 * Recommendations after their linked holdings or accounts are removed: kept
 * as they are, with the link as evidence, but no longer approved and marked
 * for review. Rejected ones stay rejected.
 */
export function markRemovedLinks(recs: Recommendation[], removed: { holdingIds: Set<string>; accountIds: Set<string> }, now: string): Recommendation[] {
  return recs.map((r) => {
    const affected =
      (r.relatedHoldingId && removed.holdingIds.has(r.relatedHoldingId)) ||
      (r.relatedAccountId && removed.accountIds.has(r.relatedAccountId)) ||
      (r.destination && removed.accountIds.has(r.destination.accountId));
    if (!affected || r.status === "excluded") return r;
    return { ...r, approvedByAdvisor: false, status: "needs_review", updatedAt: now };
  });
}
