import type { ExtractedAccount, ExtractedHolding } from "@/domain/types";
import { safeId } from "@/utils/formatting";
import { buildIdentifier } from "../normalizers/detectIdentifier";
import { detectCurrency } from "../normalizers/detectCurrency";
import { detectAssetClass } from "../normalizers/detectAssetClass";
import { validateExtractedHolding } from "../validation/validateExtractedHolding";

// Heuristic parser for messy pasted holdings tables. Handles tab-, multi-space-, or pipe-separated rows.

function splitRow(line: string): string[] {
  // Prefer tabs, then 2+ spaces, then pipe.
  if (line.includes("\t")) return line.split("\t").map((s) => s.trim());
  if (line.includes("|")) return line.split("|").map((s) => s.trim()).filter(Boolean);
  return line.split(/ {2,}/).map((s) => s.trim()).filter(Boolean);
}

function isLikelyHeader(cells: string[]): boolean {
  const joined = cells.join(" ").toLowerCase();
  return /(symbol|ticker|security|description|qty|quantity|price|value|market|cost|basis|account)/.test(joined);
}

function parseLooseNumber(v: string): number | undefined {
  if (!v) return undefined;
  const s = v.replace(/[$£€¥,\s%]/g, "").replace(/^\((.*)\)$/, "-$1");
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

export function parsePastedText(text: string, accountHint?: string): ExtractedAccount {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const holdings: ExtractedHolding[] = [];
  let headerCells: string[] | null = null;

  for (const line of lines) {
    const cells = splitRow(line);
    if (cells.length < 2) continue;
    if (!headerCells && isLikelyHeader(cells)) {
      headerCells = cells.map((c) => c.toLowerCase());
      continue;
    }
    // Heuristic mapping: first cell that looks like a ticker (1-6 uppercase letters, optional dot/dash)
    let symbol: string | undefined;
    let name: string | undefined;
    const numericCells: number[] = [];
    for (const cell of cells) {
      if (!symbol && /^[A-Z][A-Z0-9.\-]{0,9}$/.test(cell)) {
        symbol = cell;
        continue;
      }
      const n = parseLooseNumber(cell);
      if (n != null) numericCells.push(n);
      else if (!name && /[A-Za-z]/.test(cell)) name = name ? `${name} ${cell}` : cell;
    }
    if (!symbol && !name) continue;
    // Heuristic: largest numeric is market value; smallest is price; middle is quantity.
    numericCells.sort((a, b) => a - b);
    const marketValue = numericCells.length > 0 ? numericCells[numericCells.length - 1] : undefined;
    const price = numericCells.length >= 2 ? numericCells[0] : undefined;
    const quantity = numericCells.length >= 3 ? numericCells[1] : undefined;

    const holding: ExtractedHolding = {
      id: safeId("eh"),
      symbol,
      identifier: buildIdentifier(symbol),
      assetName: name,
      quantity,
      price,
      marketValue,
      currency: detectCurrency([symbol, name, line].filter(Boolean).join(" ")),
      assetClass: detectAssetClass(name),
      fields: { _line: { fieldName: "_line", raw: line, confidence: "low" } },
      warnings: [],
      confidence: "low",
      sourceTrace: { sourceType: "pasted_text", extractionMethod: "heuristic", extractionConfidence: "low", rawText: line },
      status: "extracted",
    };
    holdings.push(validateExtractedHolding(holding));
  }

  return {
    id: safeId("ea"),
    accountName: accountHint,
    holdings,
    fields: {},
    warnings: [],
    confidence: holdings.length === 0 ? "low" : "low",
  };
}
