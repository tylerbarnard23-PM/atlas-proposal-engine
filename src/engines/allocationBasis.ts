import type { Account, AllocationStrategy, AssetClass, ClassWeight, ClientProfile, CurrencyCode, FxRate, Holding, MaterialBasis, WorkingDraft } from "@/domain/types";
import { ASSET_CLASS_LABELS } from "@/domain/assetTaxonomy";
import { answerValue, conflictsOf, QUESTIONS, questionStatus } from "./clientDiscovery";
import { contentHash } from "./snapshotRecord";
import { scopeAccountIds } from "./allocationDesk";

// #119 (review of d004791, findings 4 and 6): what an allocation strategy was
// decided on, whether those facts have changed since, and whether a strategy
// record is internally consistent. Shared by the Copilot tool (creation), the
// store (re-review), readiness (before a new version or final PDF) and the
// backup/version parser (restore), so all of them apply the same rules.

const label = (c: AssetClass) => ASSET_CLASS_LABELS[c] ?? c;
const round1 = (n: number) => Math.round(n * 10) / 10;

/** The facts a material change of which needs the advisor's re-review. */
export interface BasisSource {
  client: ClientProfile;
  accounts: Account[];
  holdings: Holding[];
  fxRates: FxRate[];
  reportingCurrency: CurrencyCode;
}

/** Fingerprints of the brief, the strategy's in-scope holdings and values, and the rates they use; plus the alternative's scope. */
export function materialBasis(src: BasisSource, strategyScope: string[], alternativeScope: string[]): MaterialBasis {
  const inScope = new Set(strategyScope);
  const lines = src.holdings
    .filter((h) => inScope.has(h.accountId) && !h.isLiability && h.assetClass !== "liability")
    .map((h) => [h.id, h.accountId, h.assetClass, h.nativeMarketValue, h.currency, h.valuationDate ?? null, h.proposalApprovedValue ?? null, h.liquidity ?? null, h.restrictions?.trim() || null])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  const currencies = new Set<string>([src.reportingCurrency, ...src.holdings.filter((h) => inScope.has(h.accountId)).map((h) => h.currency)]);
  const rates = src.fxRates
    .filter((r) => currencies.has(r.base) && currencies.has(r.quote))
    .map((r) => [r.base, r.quote, r.rate, r.asOf, r.source])
    .sort((a, b) => `${a[0]}/${a[1]}`.localeCompare(`${b[0]}/${b[1]}`));
  const c = src.client;
  const brief = {
    answers: QUESTIONS.map(({ id }) => [id, answerValue(c, id), questionStatus(c, id)]),
    conflicts: conflictsOf(c),
    restrictionsOnFile: [...(c.restrictedSecurities ?? [])].sort(),
    reportingCurrency: src.reportingCurrency,
  };
  return {
    scope: contentHash([...alternativeScope].sort()),
    brief: contentHash(brief),
    holdings: contentHash({ scope: [...strategyScope].sort(), lines }),
    fx: contentHash(rates),
  };
}

/** The alternative a strategy belongs to: the draft that has it as a member, else the first one (the active alternative). */
export function strategyAlternative(recId: string, drafts: WorkingDraft[]): WorkingDraft | undefined {
  return drafts.find((d) => d.memberIds.includes(recId)) ?? drafts[0];
}

const PART_LABEL: Record<keyof MaterialBasis, string> = {
  scope: "the alternative's accounts (scope)",
  brief: "the client brief",
  holdings: "the holdings or values in its scope",
  fx: "the exchange rates",
};

/**
 * What changed since the strategy was decided (or last re-reviewed by the advisor), in words; empty when nothing material did.
 * A record from before this check (no recorded basis) needs one re-review.
 */
export function strategyChanges(s: AllocationStrategy, src: BasisSource, alternativeScope: string[]): string[] {
  const last = s.reviews?.length ? s.reviews[s.reviews.length - 1] : null;
  const recorded = last?.material ?? s.basis.material;
  if (!recorded || !s.basis.scopeAccountIds) return ["its basis wasn't recorded (prepared before this check)"];
  const now = materialBasis(src, s.basis.scopeAccountIds, alternativeScope);
  return (Object.keys(PART_LABEL) as (keyof MaterialBasis)[]).filter((k) => recorded[k] !== now[k]).map((k) => PART_LABEL[k]);
}

/** Approved strategies whose facts changed, for readiness. */
export function strategiesNeedingReview(ws: BasisSource & { recommendations: { id: string; title: string; approvedByAdvisor: boolean; allocationStrategy?: AllocationStrategy }[]; drafts: WorkingDraft[] }) {
  return ws.recommendations
    .filter((r) => r.approvedByAdvisor && r.allocationStrategy)
    .map((r) => {
      const alt = strategyAlternative(r.id, ws.drafts);
      const altScope = alt ? scopeAccountIds(ws.accounts, alt) : ws.accounts.filter((a) => !a.isLiabilityAccount).map((a) => a.id);
      return { id: r.id, title: r.title, changes: strategyChanges(r.allocationStrategy!, ws, altScope) };
    })
    .filter((x) => x.changes.length > 0);
}

// ---------------------------------------------------------------------------
// Weights and record validation (creation and restore)
// ---------------------------------------------------------------------------

/**
 * Why a set of proposed weights can't be used, or an empty list. Percentages of
 * the same in-scope portfolio: one per allowed class, 0–100, totalling 100
 * (cash included, within `tolerance`), and every class held must be listed, even
 * at 0, so nothing (an unclassified holding included) is silently dropped.
 */
export function weightProblems(weights: ClassWeight[], held: AssetClass[], tolerance = 0.1): string[] {
  const out: string[] = [];
  const seen = new Set<AssetClass>();
  for (const w of weights) {
    if (!(w.assetClass in ASSET_CLASS_LABELS) || w.assetClass === "liability") out.push(`${w.assetClass} isn't an investment asset class.`);
    if (seen.has(w.assetClass)) out.push(`${label(w.assetClass)} is listed twice.`);
    seen.add(w.assetClass);
    if (!Number.isFinite(w.pct) || w.pct < 0 || w.pct > 100) out.push(`${label(w.assetClass)}: ${w.pct} isn't a percentage between 0 and 100.`);
  }
  const total = weights.reduce((a, w) => a + (Number.isFinite(w.pct) ? w.pct : 0), 0);
  if (Math.abs(total - 100) > tolerance) out.push(`The weights total ${round1(total)}%, not 100% (cash included).`);
  const missing = held.filter((c) => !seen.has(c));
  if (missing.length) out.push(`Every class held in scope needs a weight (0 to exit it): missing ${missing.map(label).join(", ")}.`);
  return out;
}

/**
 * Why a strategy record is inconsistent, or an empty list (finding 6). The
 * weights when proposed may carry the earlier one-decimal display rounding
 * (each class within 0.05), so their total is allowed that much per class.
 */
export function strategyRecordProblems(s: Pick<AllocationStrategy, "outcome" | "proposedWeights" | "currentWeights" | "alternative">): string[] {
  const held = s.currentWeights.filter((w) => w.pct > 0.005).map((w) => w.assetClass);
  const roundingTolerance = 0.05 * Math.max(1, s.currentWeights.length) + 0.01;
  const out = [
    ...weightProblems(s.currentWeights, [], roundingTolerance).map((p) => `When proposed: ${p}`),
    ...weightProblems(s.proposedWeights, held).map((p) => `Proposed: ${p}`),
  ];
  if (s.outcome === "maintain") {
    const differs = new Set([...s.proposedWeights, ...s.currentWeights].map((w) => w.assetClass));
    for (const c of differs) {
      const p = s.proposedWeights.find((w) => w.assetClass === c)?.pct ?? 0;
      const k = s.currentWeights.find((w) => w.assetClass === c)?.pct ?? 0;
      if (Math.abs(p - k) > 0.051) out.push(`A hold keeps the mix, but its ${label(c)} weight (${p}%) differs from the ${k}% when proposed.`);
    }
  }
  if (s.alternative?.weights) out.push(...weightProblems(s.alternative.weights, held).map((p) => `Alternative: ${p}`));
  return out;
}
