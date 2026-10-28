import type { ApprovedSnapshot, SnapshotResults, WorkingDraft } from "@/domain/types";
import { evaluateDesk } from "./allocationDesk";
import { normalizeHoldings } from "./normalizationEngine";

// D3: what identifies an approved version and what it computes. Kept apart
// from the store and the backup so both (and the PDF route) check a version
// the same way.

/** Canonical JSON (sorted keys, undefined dropped): the same contents always serialize the same, whatever the key order after a restore. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map((v) => (v === undefined ? "null" : canonicalJson(v))).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

function fnv1a(text: string, seed: number): string {
  let h = seed;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Two FNV-1a passes (64 bits): tells versions apart and catches accidental change; not a security measure. */
export const contentHash = (value: unknown) => {
  const text = canonicalJson(value);
  return fnv1a(text, 0x811c9dc5) + fnv1a(text, 0x01000193);
};

/** The fingerprint of an approved version's alternative and inputs. */
export const snapshotFingerprint = (s: Pick<ApprovedSnapshot, "alternative" | "inputs">) => contentHash({ alternative: s.alternative, inputs: s.inputs });

/** The alternative as the shared evaluator reads it: its scope and targets, with the approved actions as members. */
export function snapshotDraft(s: Pick<ApprovedSnapshot, "approvedAt" | "alternative" | "inputs">): WorkingDraft {
  const a = s.alternative;
  return { id: a.id, name: a.name, scopeAccountIds: a.scopeAccountIds, memberIds: s.inputs.recommendations.map((r) => r.id), targets: a.targets, inputBasis: a.inputBasis, model: a.model, createdAt: s.approvedAt, updatedAt: s.approvedAt };
}

/**
 * The version's results, from its own inputs with the shared evaluator (the
 * Allocation desk's approved view over the version's scope). Recomputed on
 * restore and by the PDF route, so a stored result can't drift from its inputs.
 */
export function snapshotResults(s: Pick<ApprovedSnapshot, "approvedAt" | "alternative" | "inputs">): SnapshotResults {
  const { inputs } = s;
  const reportingCurrency = inputs.client.proposalOutputCurrency;
  const d = evaluateDesk({
    holdings: normalizeHoldings(inputs.holdings, inputs.fxRates, reportingCurrency),
    accounts: inputs.accounts,
    recommendations: inputs.recommendations,
    draft: snapshotDraft(s),
    fx: { reportingCurrency, rates: inputs.fxRates },
    view: "approved",
  });
  const byClass = (k: "current" | "proposed") =>
    d.rows
      .filter((r) => Math.abs(r[k]) > 1e-9)
      .map((r) => ({ assetClass: r.assetClass, value: r[k] }))
      .sort((a, b) => a.assetClass.localeCompare(b.assetClass));
  const complete = d.unvalued.length === 0;
  return {
    reportingCurrency,
    current: { total: complete ? d.totals.current : null, byClass: byClass("current") },
    proposed: { total: complete ? d.totals.proposed : null, byClass: byClass("proposed") },
    blocked: d.blocked.length,
    unresolved: d.unresolved.length,
  };
}

/** Why a stored version doesn't match its own contents, or null when it does. */
export function snapshotIntegrity(s: ApprovedSnapshot): string | null {
  if (snapshotFingerprint(s) !== s.fingerprint) return `Approved version ${s.version}'s contents don't match its fingerprint.`;
  if (canonicalJson(snapshotResults(s)) !== canonicalJson(s.results)) return `Approved version ${s.version}'s results don't match its inputs.`;
  return null;
}
