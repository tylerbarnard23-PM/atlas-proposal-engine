import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MiniMarkdown, parseBlocks, tableCells } from "@/components/copilot/MiniMarkdown";

// #84: Copilot answers with Markdown tables were shown as raw pipe text. The shapes below are the ones seen
// in recorded real answers on synthetic data (19 November 2026): a heading, a table directly under it, bold
// cells, long cells, and prose and lists around it.
const html = (text: string) => renderToStaticMarkup(React.createElement(MiniMarkdown, { text }));

const RECORDED = [
  "I recommend selling about **$250,000 of the Apple stock in the taxable brokerage as a first tranche**, then deciding on the bond.",
  "",
  "## Apple exposure",
  "| Position | Account | Value | % of investible |",
  "|---|---|---|---|",
  "| Apple Inc. stock | Taxable Brokerage | $941,556 | 4.9% |",
  "| Apple Inc. 4.40% 2033 bond | Family Trust | $493,000 | 2.6% |",
  "",
  "- **Tax drag:** the stock's cost basis is $412,000 against a $941,556 value.",
  "",
  "## Options I tested (all can be drafted, no blocks or cash shortfalls)",
  "| Option | Position before → after | Cash after | Allocation effect |",
  "|---|---|---|---|",
  "| **Sell $250k Apple stock** | $941,556 → $691,556 | Brokerage cash $184,200 → $434,200 | Stocks 28% → 26.7%; cash 1.4% → 2.7% |",
  "| Sell $470k Apple stock | $941,556 → $471,556 | Brokerage cash $184,200 → $654,200 | Stocks 28% → 25.6%; cash 1.4% → 3.9% |",
  "",
  "**Why the $250k stock sale:** it cuts the more volatile Apple holding.",
].join("\n");

describe("Copilot answer tables (#84)", () => {
  it("renders the recorded answer's tables as semantic tables, with the prose around them", () => {
    const out = html(RECORDED);
    expect(out.match(/<table/g)).toHaveLength(2);
    expect(out).toContain('<th scope="col"');
    expect(out).toContain(">Position</th>");
    expect(out).toContain("<td");
    expect(out).toContain("$941,556");
    expect(out).toContain("<strong class=\"text-ink-900\">Sell $250k Apple stock</strong>");
    expect(out).not.toContain("|---|");
    expect(out).not.toContain("| Apple Inc. stock |");
    // the prose, heading and list around the tables are kept
    expect(out).toContain("<h4");
    expect(out).toContain("Apple exposure");
    expect(out).toContain("<li><strong class=\"text-ink-900\">Tax drag:</strong>");
    expect(out).toContain("Why the $250k stock sale:");
    const kinds = parseBlocks(RECORDED).map((b) => b.kind);
    expect(kinds).toEqual(["p", "h", "table", "ul", "h", "table", "p"]);
  });

  it("keeps long cells whole and lets them wrap", () => {
    const b = parseBlocks(RECORDED).filter((x) => x.kind === "table")[1];
    expect(b.kind === "table" && b.rows[0][3]).toBe("Stocks 28% → 26.7%; cash 1.4% → 2.7%");
    expect(html(RECORDED)).toContain("wrap-break-word");
    expect(html(RECORDED)).toContain("overflow-x-auto");
  });

  it("applies column alignment from the separator row", () => {
    const out = html("| a | b | c |\n|:--|--:|:-:|\n| 1 | 2 | 3 |");
    expect(out).toMatch(/<td class="[^"]*text-left[^"]*">1<\/td>/);
    expect(out).toMatch(/<td class="[^"]*text-right[^"]*">2<\/td>/);
    expect(out).toMatch(/<td class="[^"]*text-center[^"]*">3<\/td>/);
  });

  it("escapes everything and creates no HTML, links or external content", () => {
    const out = html("| x | y |\n|---|---|\n| <script>alert(1)</script> | <img src=x onerror=alert(1)> [a](https://example.com) |");
    expect(out).not.toContain("<script");
    expect(out).not.toContain("<img");
    expect(out).not.toContain("<a ");
    expect(out).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(out).toContain("[a](https://example.com)");
  });

  it("leaves pipes that are not a table as text, as before", () => {
    expect(parseBlocks("a | b\nc | d").map((b) => b.kind)).toEqual(["p", "p"]);
    expect(parseBlocks("| only a header |\nnext line").map((b) => b.kind)).toEqual(["p", "p"]);
  });

  it("handles escaped pipes and ragged rows like GitHub Markdown", () => {
    expect(tableCells("| a \\| b | c |")).toEqual(["a | b", "c"]);
    const t = parseBlocks("| a | b |\n|---|---|\n| 1 |\n| 1 | 2 | 3 |")[0];
    expect(t.kind === "table" && t.rows).toEqual([["1", ""], ["1", "2 | 3"]]);
  });

  it("never changes the answer text it is given", () => {
    const before = RECORDED.slice();
    html(RECORDED);
    expect(RECORDED).toBe(before);
  });
});
