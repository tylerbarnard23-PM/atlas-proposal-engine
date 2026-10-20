import { describe, expect, it } from "vitest";
import { EXTRACTION_CASES } from "./extraction/groundTruth";
import { scoreCase, summarize } from "./extraction/scoreExtraction";

// Extraction-accuracy eval over the sample statements. Prints a scorecard and
// fails if accuracy drops below the recorded baseline, so parser changes can't
// silently regress. Run on its own with `npm run eval`.

// History: the first run scored 61.9% recall with 5 spurious rows (ISO-prefixed
// amounts like "CHF 193,864.00" didn't parse, and bond face value was read as
// market value). After the header-aware parser fix: 100% recall, 0 spurious.
// Currency sits at 81% only because the retirement CSV has no currency column;
// those rows are left blank and flagged for the advisor rather than guessed.
const BASELINE = {
  holdingRecall: 1,
  labelAccuracy: 1,
  currencyAccuracy: 0.8,
};

describe("statement extraction eval", () => {
  const scores = EXTRACTION_CASES.map(scoreCase);
  const totals = summarize(scores);

  it("prints the scorecard", () => {
    console.table(
      scores.map((s) => ({
        statement: s.name,
        expected: s.expected,
        found: s.found,
        label_ok: s.labelCorrect,
        currency_ok: s.currencyCorrect,
        currency_blank: s.currencyMissing,
        spurious: s.spurious,
        missed: s.misses.join(", "),
      }))
    );
    console.log(
      `recall ${(totals.holdingRecall * 100).toFixed(1)}% · label ${(totals.labelAccuracy * 100).toFixed(1)}% · currency ${(totals.currencyAccuracy * 100).toFixed(1)}% · wrong currency ${totals.currencyWrong} · spurious ${totals.spurious}`
    );
  });

  it("does not regress below baseline", () => {
    expect(totals.holdingRecall).toBeGreaterThanOrEqual(BASELINE.holdingRecall);
    expect(totals.labelAccuracy).toBeGreaterThanOrEqual(BASELINE.labelAccuracy);
    expect(totals.currencyAccuracy).toBeGreaterThanOrEqual(BASELINE.currencyAccuracy);
    expect(totals.currencyWrong).toBe(0);
    expect(totals.spurious).toBe(0);
  });
});
