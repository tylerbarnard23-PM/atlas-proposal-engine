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
    if (holdingId || accountId) out.push({ recommendationId: r.id, ...(holdingId ? { holdingId } : {}), ...(accountId ? { accountId } : {}) });
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

/** "Trim Apple: its holding h_aapl was removed" */
export function describeLink(l: UnresolvedLink & { title: string }): string {
  const what = [l.holdingId && `holding ${l.holdingId}`, l.accountId && `account ${l.accountId}`].filter(Boolean).join(" and ");
  return `${l.title}: its ${what} was removed`;
}

/**
 * Recommendations after their linked holdings or accounts are removed: kept
 * as they are, with the link as evidence, but no longer approved and marked
 * for review. Rejected ones stay rejected.
 */
export function markRemovedLinks(recs: Recommendation[], removed: { holdingIds: Set<string>; accountIds: Set<string> }, now: string): Recommendation[] {
  return recs.map((r) => {
    const affected = (r.relatedHoldingId && removed.holdingIds.has(r.relatedHoldingId)) || (r.relatedAccountId && removed.accountIds.has(r.relatedAccountId));
    if (!affected || r.status === "excluded") return r;
    return { ...r, approvedByAdvisor: false, status: "needs_review", updatedAt: now };
  });
}
