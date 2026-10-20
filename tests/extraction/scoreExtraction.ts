import type { ExtractedHolding } from "@/domain/types";
import { parseCsvText } from "@/ingestion/parsers/parseCsv";
import { parsePastedText } from "@/ingestion/parsers/parsePastedText";
import type { EvalCase } from "./groundTruth";

export interface CaseScore {
  name: string;
  expected: number;
  extracted: number;
  found: number; // expected holdings matched by value
  labelCorrect: number;
  currencyCorrect: number;
  currencyMissing: number; // left blank for the advisor to fill, not wrong
  spurious: number; // extracted holdings with a value that matched nothing
  misses: string[];
}

const VALUE_TOLERANCE = 0.005;

export function extract(c: EvalCase): ExtractedHolding[] {
  return c.parser === "csv" ? parseCsvText(c.text, c.name).account.holdings : parsePastedText(c.text, c.name).holdings;
}

export function scoreCase(c: EvalCase): CaseScore {
  const holdings = extract(c);
  const unused = new Set(holdings.map((_, i) => i));
  const score: CaseScore = {
    name: c.name,
    expected: c.expected.length,
    extracted: holdings.length,
    found: 0,
    labelCorrect: 0,
    currencyCorrect: 0,
    currencyMissing: 0,
    spurious: 0,
    misses: [],
  };
  for (const exp of c.expected) {
    const idx = [...unused].find((i) => {
      const mv = holdings[i].marketValue;
      return mv != null && Math.abs(mv - exp.marketValue) <= exp.marketValue * VALUE_TOLERANCE;
    });
    if (idx === undefined) {
      score.misses.push(exp.label);
      continue;
    }
    unused.delete(idx);
    const h = holdings[idx];
    score.found++;
    const haystack = `${h.symbol ?? ""} ${h.assetName ?? ""} ${h.identifier?.value ?? ""}`.toLowerCase();
    if (haystack.includes(exp.label.toLowerCase())) score.labelCorrect++;
    if (h.currency === exp.currency) score.currencyCorrect++;
    else if (!h.currency) score.currencyMissing++;
  }
  score.spurious = [...unused].filter((i) => (holdings[i].marketValue ?? 0) > 0).length;
  return score;
}

export function summarize(scores: CaseScore[]) {
  const sum = (k: "expected" | "found" | "labelCorrect" | "currencyCorrect" | "currencyMissing" | "spurious") =>
    scores.reduce((s, x) => s + x[k], 0);
  const expected = sum("expected");
  const found = sum("found");
  return {
    holdingRecall: found / expected,
    labelAccuracy: found ? sum("labelCorrect") / found : 0,
    currencyAccuracy: found ? sum("currencyCorrect") / found : 0,
    // Wrong currency, as opposed to missing (which the data-quality engine flags).
    currencyWrong: found - sum("currencyCorrect") - sum("currencyMissing"),
    spurious: sum("spurious"),
  };
}
