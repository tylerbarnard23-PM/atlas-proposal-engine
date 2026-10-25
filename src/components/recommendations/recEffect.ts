import type { Movement, RecommendationPreview } from "@/engines/recommendationPreview";
import { formatCurrency } from "@/utils/formatting";

// Text for the editor's live preview and the saved recommendation cards, from
// one engine simulation (previewRecommendation), so they can't disagree with
// each other or with the proposal. Full currency precision throughout; cash
// lines are the ones the engine actually moved, never a negated position
// change.

export interface PreviewSummary {
  /** What the simulation is: applied, not applicable, advisory… */
  headline: string;
  tone: "neutral" | "positive" | "negative" | "warning";
  position: string | null;
  cash: string | null;
  combined: string | null;
}

const MINUS = "−";

export function signedMoney(n: number, currency: string): string {
  const abs = formatCurrency(Math.abs(n), currency);
  if (Math.abs(n) < 0.005) return abs;
  return `${n < 0 ? MINUS : "+"}${abs}`;
}

export function signedPct(p: number | null): string {
  if (p == null) return "N/A";
  const abs = Math.abs(p);
  if (abs === 0) return "0.00%";
  const digits = abs >= 0.01 ? abs.toFixed(2) : abs.toPrecision(2);
  return `${p < 0 ? MINUS : "+"}${digits}%`;
}

const money = (n: number, currency: string) => (n < 0 ? `${MINUS}${formatCurrency(-n, currency)}` : formatCurrency(n, currency));

export function describeMovement(m: Movement, currency: string, withPct = true): string {
  const change = withPct ? `${signedMoney(m.change, currency)}, ${signedPct(m.pctChange)}` : signedMoney(m.change, currency);
  return `${m.name}: ${money(m.before, currency)} → ${money(m.after, currency)} (${change})`;
}

function describeCash(cash: Movement[], currency: string, positionIsCash: boolean): string {
  if (cash.length === 0) return positionIsCash ? "No other cash moves: this is a cash position." : "No cash moves.";
  return `Cash: ${cash
    .map((c) =>
      c.synthetic
        ? `new cash line in ${c.accountName} ${money(c.after, currency)}`
        : `${c.name} (${c.accountName}) ${money(c.before, currency)} → ${money(c.after, currency)} (${signedMoney(c.change, currency)})`
    )
    .join("; ")}`;
}

export function summarizePreview(p: RecommendationPreview): PreviewSummary {
  const cur = p.reportingCurrency;
  const empty = { position: null, cash: null, combined: null };
  switch (p.state) {
    case "advisory":
      return { headline: "Advisory only: appears in the proposal text and doesn't change any holding.", tone: "neutral", ...empty };
    case "linked":
      return { headline: "Part of a linked replacement or a new investment: applied together with its other actions, or not at all. See its effect on the Allocation desk.", tone: "neutral", ...empty };
    case "missing_holding":
      return { headline: "The linked holding no longer exists, so this can't be applied.", tone: "warning", ...empty };
    case "cannot_apply":
      return {
        headline: `Can't be applied: ${p.warnings.find((w) => w.kind === "missing_rate" || w.kind === "unvalued" || w.kind === "funding")?.message ?? "a rate is missing."}`,
        tone: "warning",
        ...empty,
      };
    default:
      break;
  }
  const s = p.standalone!;
  const positionIsCash = !!p.holding && p.holding.assetClass === "cash" && !p.holding.isLiability;
  const position = s.position ? describeMovement(s.position, cur) : null;
  const cash = describeCash(s.cash, cur, positionIsCash);
  let combined: string | null = null;
  if (p.combined) {
    const n = p.combined.others.length;
    const pos = p.combined.position ? describeMovement(p.combined.position, cur) : "";
    const short = p.combined.shortfalls.map((sf) => ` Shortfall: ${sf.accountName} short ${formatCurrency(sf.shortfall, cur)}.`).join("");
    combined = `With ${n} other approved recommendation${n === 1 ? "" : "s"} (in proposal order): ${pos}; adding this recommendation changes it by ${signedMoney(p.combined.thisChange, cur)}. ${describeCash(p.combined.cash, cur, positionIsCash)}${short}`;
  }
  if (p.state === "no_change") {
    return {
      headline: p.allocationNeutral
        ? "Allocation-neutral: same exposure, different vehicle or lot. No holding or cash value changes."
        : "No change yet: set an action amount, a percentage or a target value.",
      tone: p.allocationNeutral ? "neutral" : "warning",
      position,
      cash,
      combined,
    };
  }
  const change = s.position?.change ?? 0;
  return {
    headline: "This recommendation alone (simulated; nothing is saved or applied until you save and approve):",
    tone: change < 0 ? "negative" : "positive",
    position,
    cash,
    combined,
  };
}
