// D4: figures a Copilot answer states, checked against the numbers the
// engine tools returned in the same run. A model is told to cite tool
// results; this checks it in code. A figure with no matching tool number is
// reported as unsupported, never presented as verified. It is a check on
// stated amounts and percentages, not on the reasoning around them.

export interface FigureCheck {
  /** Amounts and percentages found in the checked text. */
  claims: number;
  /** The ones no tool result supports, as written. */
  unsupported: string[];
}

// A currency amount ($1,234.56, USD 1,234, €1.2M, -$50.0K), a percentage
// (12.5%), or a grouped number (1,234,567). Years and small bare integers are
// not claims.
const FIGURE =
  /(?:US\$|[$€£¥]|\b(?:USD|EUR|GBP|CHF|JPY|CAD|AUD|NOK|SEK|DKK)\s?)\s?[-−]?\d[\d,]*(?:\.\d+)?(?:\s?[KMB]\b)?|[-−]?\d[\d,]*(?:\.\d+)?\s?%|\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b/g;

const MULTIPLIER: Record<string, number> = { K: 1e3, M: 1e6, B: 1e9 };

interface Parsed {
  value: number;
  percent: boolean;
  /** Half a unit of the last digit shown, in the figure's own scale. */
  tolerance: number;
}

function parse(text: string): Parsed | null {
  const percent = text.includes("%");
  const suffix = text.match(/([KMB])\s*$/)?.[1];
  const digits = text.replace(/[−]/g, "-").match(/-?\d[\d,]*(?:\.\d+)?/)?.[0];
  if (!digits) return null;
  const plain = digits.replace(/,/g, "");
  const value = Number(plain);
  if (!Number.isFinite(value)) return null;
  const decimals = plain.includes(".") ? plain.split(".")[1].length : 0;
  const scale = suffix ? MULTIPLIER[suffix] : 1;
  return { value: Math.abs(value * scale), percent, tolerance: 0.5 * 10 ** -decimals * scale };
}

function supported(p: Parsed, evidence: number[]): boolean {
  const tol = p.tolerance + Math.abs(p.value) * 1e-4;
  for (const raw of evidence) {
    const n = Math.abs(raw);
    if (Math.abs(n - p.value) <= tol) return true;
    // A share the engine returned as a fraction (0.125), stated as a percentage (12.5%).
    if (p.percent && Math.abs(n * 100 - p.value) <= tol) return true;
  }
  return false;
}

/**
 * The figures stated inside a text, as numbers (an insight title's "60%" is
 * 60). Engine results carry some figures in their own wording (insight
 * titles, readiness details); those count as evidence too.
 */
export function figuresIn(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(FIGURE)) {
    const p = parse(m[0]);
    if (p) out.push(p.value);
  }
  return out;
}

/** Checks every amount and percentage in the texts against the numbers in the evidence. */
export function checkFigures(texts: string[], evidence: number[][]): FigureCheck {
  const numbers = evidence.flat();
  const unsupported: string[] = [];
  let claims = 0;
  for (const text of texts) {
    for (const m of text.matchAll(FIGURE)) {
      const p = parse(m[0]);
      if (!p) continue;
      claims += 1;
      if (!supported(p, numbers)) unsupported.push(m[0].trim());
    }
  }
  return { claims, unsupported: [...new Set(unsupported)] };
}
