import type { Recommendation } from "@/domain/types";
import { needsIntentRestatement } from "./allocationDesk";
import { knownOrigin } from "./recommendationOrigin";

/**
 * #113: which records in a view "Approve all eligible" approves. One rule for the button's count, its confirmation
 * and the ids it submits. Eligible: pending (not approved, not rejected), with a known Claude or advisor origin, and
 * sized explicitly (a record saved without an amount needs an explicit size first, R07, which the store enforces).
 * Records whose origin wasn't recorded stay listed for individual review, never relabelled or approved in bulk;
 * examples (prewritten, scripted or test) are never eligible.
 */
export function bulkApproval(inView: Recommendation[]): { eligible: Recommendation[]; unknownPending: Recommendation[]; needsSize: Recommendation[]; anyEligibleApproved: boolean } {
  const pending = (r: Recommendation) => !r.approvedByAdvisor && r.status !== "excluded";
  const kind = (r: Recommendation) => knownOrigin(r)?.kind;
  const authored = inView.filter((r) => kind(r) === "claude" || kind(r) === "advisor");
  return {
    eligible: authored.filter((r) => pending(r) && !needsIntentRestatement(r)),
    unknownPending: inView.filter((r) => pending(r) && (kind(r) == null || kind(r) === "unrecorded")),
    needsSize: authored.filter((r) => pending(r) && needsIntentRestatement(r)),
    anyEligibleApproved: authored.some((r) => r.approvedByAdvisor && r.status !== "excluded"),
  };
}
