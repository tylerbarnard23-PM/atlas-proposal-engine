import { describe, expect, it } from "vitest";
import { checkFigures, parseFigures, type EvidenceValue } from "@/copilot/evidence";

// Amount abbreviations in Copilot answers ("$250k", "$2.5m", "$1.2bn", "$3 million"). The checker must keep
// the multiplier whatever its case or spelling, so a shorthand amount is checked at its full size: correct
// evidence supports it, and a smaller engine figure never does. Seen in a real answer on 19 November 2026:
// "Sell $250k Apple stock" was read as USD 250 and reported unsupported, and USD 250 evidence would have
// "matched" it.
const usd = (value: number, change = false): EvidenceValue => ({ value, unit: "money", currency: "USD", change });
const check = (text: string, evidence: EvidenceValue[]) => checkFigures([text], [evidence]);

describe("amount multipliers keep their size in any case", () => {
  it("reads $250k as USD 250,000: correct evidence supports it, USD 250 does not", () => {
    expect(check("Sell $250k Apple stock", [usd(250_000)])).toMatchObject({ claims: 1, matched: 1, unsupported: [], unchecked: [] });
    expect(check("Sell $250k Apple stock", [usd(250)])).toMatchObject({ claims: 1, matched: 0, unsupported: ["$250k"] });
  });

  it("keeps $470k and lowercase m and b", () => {
    expect(check("The $470k sale", [usd(470_000)]).matched).toBe(1);
    expect(check("The $470k sale", [usd(470)]).matched).toBe(0);
    expect(check("about $2.5m", [usd(2_500_000)]).matched).toBe(1);
    expect(check("about $2.5m", [usd(2.5)]).matched).toBe(0);
    expect(check("over $1.2b", [usd(1_200_000_000)]).matched).toBe(1);
    expect(check("over $1.2b", [usd(1.2)]).matched).toBe(0);
  });

  it("keeps uppercase K, M and B as before", () => {
    expect(check("$60.0K and $1.5M and $2B", [usd(60_000), usd(1_500_000), usd(2_000_000_000)])).toMatchObject({ claims: 3, matched: 3 });
  });

  it("reads bn, mn, mm and the words thousand, million and billion", () => {
    expect(check("$1.2bn", [usd(1_200_000_000)]).matched).toBe(1);
    expect(check("$3mn", [usd(3_000_000)]).matched).toBe(1);
    expect(check("$3mm", [usd(3_000_000)]).matched).toBe(1);
    expect(check("$250 thousand", [usd(250_000)]).matched).toBe(1);
    expect(check("$250 thousand", [usd(250)]).matched).toBe(0);
    expect(check("$2.5 million", [usd(2_500_000)]).matched).toBe(1);
    expect(check("USD 1 billion", [usd(1_000_000_000)]).matched).toBe(1);
  });

  it("applies the multiplier with currency codes, other currencies and signs", () => {
    expect(check("USD 250k", [usd(250_000)]).matched).toBe(1);
    expect(check("€3.4m", [{ value: 3_400_000, unit: "money", currency: "EUR" }]).matched).toBe(1);
    expect(check("$250k", [{ value: 250_000, unit: "money", currency: "EUR" }]).unsupported).toEqual(["$250k"]);
    expect(check("-$250k", [usd(-250_000, true)]).matched).toBe(1);
    expect(check("−$250k", [usd(-250, true)]).unsupported).toEqual(["-$250k"]); // the checker reports "−" as "-", as before
    expect(check("+$250k", [usd(250_000, true)]).matched).toBe(1);
  });

  // Review of #102: a multiplier after one or more spaces, or written in capitals, was still left behind
  // ("$250 k" read as USD 250), so smaller-value evidence matched.
  it.each([
    ["$250 k", 250_000, 250],
    ["$2.5 MILLION", 2_500_000, 2.5],
    ["$1 bn", 1_000_000_000, 1],
    ["$3 mm", 3_000_000, 3],
    ["$250  K", 250_000, 250],
    ["$2.5 Billion", 2_500_000_000, 2.5],
    ["USD 4 THOUSAND", 4_000, 4],
    ["$1.2 BN", 1_200_000_000, 1.2],
  ])("reads %s at full size and rejects smaller-value evidence", (text, full, small) => {
    expect(check(`Sell ${text} of stock`, [usd(full)])).toMatchObject({ claims: 1, matched: 1, unsupported: [] });
    expect(check(`Sell ${text} of stock`, [usd(small)])).toMatchObject({ claims: 1, matched: 0 });
    expect(parseFigures(`Sell ${text} of stock`)[0]).toMatchObject({ value: full, unit: "money" });
  });

  it("keeps ordinary words after an amount as prose, not multipliers", () => {
    for (const text of ["$250 by Friday", "$250 more", "$250 bonus", "$250 kits", "$250 million-dollar", "$5 Microsoft shares"]) {
      const f = parseFigures(text)[0];
      if (text === "$250 million-dollar") expect(f.value).toBe(250_000_000); // the word itself is a multiplier
      else expect(f).toMatchObject({ value: Number(text.match(/\d+/)![0]), unit: "money" });
    }
  });

  it("keeps the multiplier after a non-breaking space or tab, but not across a line break", () => {
    expect(parseFigures("$250\u00a0k")[0]).toMatchObject({ value: 250_000 });
    expect(parseFigures("$250\tM")[0]).toMatchObject({ value: 250_000_000 });
    expect(parseFigures("Option A: $250\nB: keep the position")[0]).toMatchObject({ value: 250 });
  });

  it("rounds at the precision shown, scaled by the multiplier", () => {
    expect(check("$1.25k", [usd(1_249)]).matched).toBe(1); // within half of the last shown digit (USD 5)
    expect(check("$1.25k", [usd(1_300)]).matched).toBe(0);
    expect(check("$0.5m", [usd(540_000)]).matched).toBe(1); // "0.5m" covers 450,000 to 550,000
    expect(check("$0.5m", [usd(560_000)]).matched).toBe(0);
  });

  it("never drops an unknown suffix and validates a smaller amount", () => {
    // A letter glued to the amount that is not a known multiplier makes the size undecidable: unchecked, never matched.
    expect(check("$250x", [usd(250)])).toMatchObject({ matched: 0, unchecked: ["$250x"] });
    expect(check("$250kk", [usd(250), usd(250_000)])).toMatchObject({ matched: 0, unchecked: ["$250kk"] });
    expect(check("$5km away", [usd(5), usd(5_000)])).toMatchObject({ matched: 0, unchecked: ["$5km"] });
  });

  it("leaves ordinary text after an amount alone", () => {
    expect(check("$250 of fees", [usd(250)]).matched).toBe(1);
    expect(check("$250,000 bond", [usd(250_000)]).matched).toBe(1);
    expect(check("$250k.", [usd(250_000)]).matched).toBe(1);
    expect(check("($250k)", [usd(250_000)]).matched).toBe(1);
    expect(check("$250k/yr", [usd(250_000)]).matched).toBe(1);
  });

  it("does not change percentages or grouped numbers", () => {
    expect(check("4.9% and 12.5%", [{ value: 4.9, unit: "percent" }, { value: 0.125, unit: "ratio" }])).toMatchObject({ claims: 2, matched: 2 });
    expect(check("60,000", [usd(60_000)])).toMatchObject({ unchecked: ["60,000"] });
    expect(parseFigures("Apple Inc. 4.40% 2033")).toHaveLength(1);
  });

  it("reads engine wording with lowercase multipliers as evidence at full size", async () => {
    const { figuresIn } = await import("@/copilot/evidence");
    expect(figuresIn("trims $250k from the position")).toEqual([{ value: 250_000, unit: "money", currency: "USD", change: false }]);
  });
});
