// D4: figures a Copilot answer states, checked against the typed figures the
// engine tools returned in the same run. A model is told to cite tool
// results; this checks it in code, by value, unit, currency and sign:
// - a money claim needs a money result in the same currency;
// - a percentage needs a percentage result (or a fraction, as its percentage);
// - a claim with a written sign (+ or -) needs a result with that sign.
// What can't be decided is reported as unchecked, never as matched: a bare
// number with no unit, or an unsigned amount the engine only has as a
// negative change (the wording may say "falls by"). A figure with no
// matching result is unsupported. It checks stated figures, not the
// reasoning around them.

export type EvidenceUnit = "money" | "percent" | "ratio" | "other";

/** One engine figure: its value (signed), what it measures and, for money, its currency. */
export interface EvidenceValue {
  value: number;
  unit: EvidenceUnit;
  currency?: string;
  /** A signed change (delta, drift), not a level or a size: only these support a written "+" or "-". */
  change?: boolean;
  /**
   * #109: a figure the advisor recorded in the client brief (a planned
   * withdrawal, an income need): a client instruction, not an engine result.
   * A claim it alone supports is reported as client-stated, never matched.
   */
  source?: "client_brief";
}

export interface FigureCheck {
  /** Amounts, percentages and grouped numbers found in the checked text. */
  claims: number;
  /** Claims a typed engine result supports. */
  matched: number;
  /** Claims no engine result supports, as written. */
  unsupported: string[];
  /** Claims whose unit or direction can't be decided from the text, as written. */
  unchecked: string[];
  /** #109: claims that only restate a figure from the client brief (the advisor's records, not an engine result), as written. */
  clientStated: string[];
}

// A currency amount ($1,234.56, USD 1,234, €1.2M, -$50.0K, +CHF 300, $250k,
// $1.2bn, $3 million), a percentage (12.5%, -0.4%), or a grouped number
// (1,234,567). Years and small bare integers are not claims.
// An amount takes every letter glued to it, and a known multiplier written as a
// separate word after spaces on the same line (k, m, b, bn, mn, mm, thousand,
// million, billion, in any case), so a multiplier is never left behind: neither
// "$250k" nor "$250 k" nor "$2.5 MILLION" is read at the smaller size. Letters
// glued to the amount that aren't a known multiplier make its size undecidable
// (see parse); an ordinary word after a space ("$250 more") is just prose.
const FIGURE =
  /(?<![\w.,])(?:[+\-−]\s?)?(?:US\$|CA\$|A\$|NZ\$|HK\$|S\$|[$€£¥]|\b(?:USD|EUR|GBP|CHF|JPY|CAD|AUD|NOK|SEK|DKK)\s?)\s?[+\-−]?\d[\d,]*(?:\.\d+)?(?:[A-Za-z]+|[^\S\r\n]+(?:[Tt][Hh][Oo][Uu][Ss][Aa][Nn][Dd]|[Mm][Ii][Ll][Ll][Ii][Oo][Nn]|[Bb][Ii][Ll][Ll][Ii][Oo][Nn]|[Bb][Nn]|[Mm][Nn]|[Mm][Mm]|[KkMmBb])\b)?|(?<![\w.,])[+\-−]?\d[\d,]*(?:\.\d+)?\s?%|(?<![\w.,])[+\-−]?\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b/g;

/** Amount multipliers, by their lowercase spelling (k and K, m and M, b and B are the same). */
const MULTIPLIER: Record<string, number> = { k: 1e3, thousand: 1e3, m: 1e6, mm: 1e6, mn: 1e6, million: 1e6, b: 1e9, bn: 1e9, billion: 1e9 };
const SYMBOL: Record<string, string> = { US$: "USD", CA$: "CAD", A$: "AUD", NZ$: "NZD", HK$: "HKD", S$: "SGD", $: "USD", "€": "EUR", "£": "GBP", "¥": "JPY" };

export interface Figure {
  text: string;
  /** Signed when a sign is written; otherwise the magnitude. */
  value: number;
  unit: "money" | "percent" | "number";
  currency?: string;
  signed: boolean;
  /** Half a unit of the last digit shown, in the figure's own scale. */
  tolerance: number;
}

function parse(text: string): Figure | null {
  const t = text.replace(/−/g, "-").trim();
  const percent = t.includes("%");
  const code = t.match(/\b(USD|EUR|GBP|CHF|JPY|CAD|AUD|NOK|SEK|DKK)\b/)?.[1];
  const symbol = t.match(/US\$|CA\$|A\$|NZ\$|HK\$|S\$|[$€£¥]/)?.[0];
  const currency = code ?? (symbol ? SYMBOL[symbol] : undefined);
  const negative = /^-|[$€£¥A-Z]\s?-/.test(t);
  const signed = negative || /^\+|[$€£¥A-Z]\s?\+/.test(t);
  const digits = t.match(/\d[\d,]*(?:\.\d+)?/)?.[0];
  if (!digits) return null;
  // Letters after the number: a multiplier, or something that isn't one.
  const suffix = percent ? undefined : t.slice(t.indexOf(digits) + digits.length).trim();
  const known = suffix ? MULTIPLIER[suffix.toLowerCase()] : 1;
  const plain = digits.replace(/,/g, "");
  const magnitude = Number(plain);
  if (!Number.isFinite(magnitude)) return null;
  const decimals = plain.includes(".") ? plain.split(".")[1].length : 0;
  // An unknown suffix ("$250x", "$5km") leaves the size undecidable: no unit, so it is reported as unchecked, never matched.
  const scale = known ?? 1;
  const unit = percent ? "percent" : currency && known !== undefined ? "money" : "number";
  return { text: t, value: (negative ? -1 : 1) * magnitude * scale, unit, currency: unit === "money" ? currency : undefined, signed, tolerance: 0.5 * 10 ** -decimals * scale };
}

/** Every figure stated in a text, typed. */
export function parseFigures(text: string): Figure[] {
  const out: Figure[] = [];
  for (const m of text.matchAll(FIGURE)) {
    const f = parse(m[0]);
    if (f) out.push(f);
  }
  return out;
}

/**
 * The figures an engine wrote in its own words (an insight title's "60%"),
 * as evidence. A bare number carries no unit and supports nothing.
 */
export function figuresIn(text: string): EvidenceValue[] {
  return parseFigures(text).flatMap((f): EvidenceValue[] =>
    f.unit === "money" ? [{ value: f.value, unit: "money", currency: f.currency, change: f.signed }] : f.unit === "percent" ? [{ value: f.value, unit: "percent", change: f.signed }] : []
  );
}

type Verdict = "matched" | "unsupported" | "unchecked" | "client_stated";

// Engine evidence decides first; a claim only client-stated figures support is reported as such.
function verdict(f: Figure, evidence: EvidenceValue[]): Verdict {
  const engine = engineVerdict(f, evidence.filter((e) => e.source !== "client_brief"));
  if (engine !== "unsupported") return engine;
  const stated = engineVerdict(f, evidence.filter((e) => e.source === "client_brief"));
  return stated === "matched" ? "client_stated" : "unsupported";
}

function engineVerdict(f: Figure, evidence: EvidenceValue[]): Exclude<Verdict, "client_stated"> {
  if (f.unit === "number") return "unchecked";
  const tol = f.tolerance + Math.abs(f.value) * 1e-4;
  const typed = evidence.flatMap((e): { v: number; change: boolean }[] => {
    if (f.unit === "money") return e.unit === "money" && e.currency === f.currency ? [{ v: e.value, change: !!e.change }] : [];
    return e.unit === "percent" ? [{ v: e.value, change: !!e.change }] : e.unit === "ratio" ? [{ v: e.value * 100, change: !!e.change }] : [];
  });
  const candidates = typed.map((t) => t.v);
  // A written sign is a claim about direction: only a change of that sign, or a level that is itself negative (a liability), supports it.
  if (f.signed) return typed.some((t) => (t.change || (t.v < 0 && f.value < 0)) && Math.abs(t.v - f.value) <= tol) ? "matched" : "unsupported";
  if (candidates.some((v) => v >= 0 && Math.abs(v - f.value) <= tol)) return "matched";
  // Only a negative engine figure of this size: the direction is in the wording, which isn't checked.
  if (candidates.some((v) => v < 0 && Math.abs(-v - f.value) <= tol)) return "unchecked";
  return "unsupported";
}

/** Checks every stated figure in the texts against the typed evidence. */
export function checkFigures(texts: string[], evidence: EvidenceValue[][]): FigureCheck {
  const all = evidence.flat();
  const unsupported: string[] = [];
  const unchecked: string[] = [];
  const clientStated: string[] = [];
  let claims = 0;
  let matched = 0;
  for (const text of texts) {
    for (const f of parseFigures(text)) {
      claims += 1;
      const v = verdict(f, all);
      if (v === "matched") matched += 1;
      else if (v === "unsupported") unsupported.push(f.text);
      else if (v === "client_stated") clientStated.push(f.text);
      else unchecked.push(f.text);
    }
  }
  return { claims, matched, unsupported: [...new Set(unsupported)], unchecked: [...new Set(unchecked)], clientStated: [...new Set(clientStated)] };
}
