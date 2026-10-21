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

// Money amounts carry an explicit currency marker: "USD 800.00", "$800.00",
// "800.00 USD". A bare number ("10000") is not money: it may be a quantity.
const ISO = "USD|EUR|GBP|CHF|CAD|JPY|AUD|SGD|HKD|MXN";
const NUMBER = /^\(?-?\d[\d,]*(?:\.\d+)?\)?$/;
const SYMBOL_MONEY = /^\(?-?[$£€¥]\s?\d[\d,]*(?:\.\d+)?\)?$|^[$£€¥]\(?-?\d[\d,]*(?:\.\d+)?\)?$/;
const ISO_CODE = new RegExp(`^(?:${ISO})$`, "i");

/**
 * The money amounts a cell consists of, or null if it isn't made only of
 * money amounts. Two adjacent amounts the layout ran together
 * ("USD 800.00 USD 8,000,000.00") come back as two.
 */
export function moneyAmounts(cell: string): number[] | null {
  const t = cell.trim().split(/\s+/).filter(Boolean);
  if (t.length === 0) return null;
  const out: number[] = [];
  // Codes written after the number ("800.00 USD") or before it ("USD 800.00").
  const suffix = t.length >= 2 && NUMBER.test(t[0]) && ISO_CODE.test(t[1]);
  for (let i = 0; i < t.length; ) {
    if (SYMBOL_MONEY.test(t[i])) {
      out.push(parseLooseNumber(t[i])!);
      i += 1;
    } else if (!suffix && ISO_CODE.test(t[i]) && t[i + 1] && (NUMBER.test(t[i + 1]) || SYMBOL_MONEY.test(t[i + 1]))) {
      out.push(parseLooseNumber(t[i + 1])!);
      i += 2;
    } else if (suffix && NUMBER.test(t[i]) && t[i + 1] && ISO_CODE.test(t[i + 1])) {
      out.push(parseLooseNumber(t[i])!);
      i += 2;
    } else {
      return null;
    }
  }
  return out.every((n) => Number.isFinite(n)) ? out : null;
}

// Splits any cell made of several money amounts into one cell per amount.
function expandMoneyCells(cells: string[]): string[] {
  return cells.flatMap((c) => {
    const amounts = moneyAmounts(c);
    if (!amounts || amounts.length < 2) return [c];
    // Re-split on the original text so each new cell keeps its marker.
    const parts = c.trim().split(/\s+/);
    const suffix = NUMBER.test(parts[0]) && parts.length >= 2 && ISO_CODE.test(parts[1]);
    const cellsOut: string[] = [];
    for (let i = 0; i < parts.length; ) {
      if (SYMBOL_MONEY.test(parts[i])) cellsOut.push(parts[i++]);
      else {
        cellsOut.push(suffix ? `${parts[i]} ${parts[i + 1]}` : `${parts[i]} ${parts[i + 1]}`);
        i += 2;
      }
    }
    return cellsOut;
  });
}

const AMBIGUOUS_MESSAGE =
  "Couldn't tell which number is the market value (a single amount next to a bare number could be a price or a value); check this row against the statement and enter the value by hand.";

function isLikelyHeader(cells: string[]): boolean {
  const joined = cells.join(" ").toLowerCase();
  return /(symbol|ticker|security|description|qty|quantity|price|value|market|cost|basis|account)/.test(joined);
}

function parseLooseNumber(v: string): number | undefined {
  if (!v) return undefined;
  // Strip ISO codes as well as symbols, so "CHF 193,864.00" and "1,200 EUR" parse.
  const s = v
    .replace(/\b(USD|EUR|GBP|CHF|CAD|JPY|AUD|SGD|HKD|MXN)\b/gi, "")
    .replace(/[$£€¥,\s%]/g, "")
    .replace(/^\((.*)\)$/, "-$1");
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

type ColumnRole = "symbol" | "identifier" | "name" | "quantity" | "price" | "marketValue";

// Order matters: "market value" must win over the bare "value" and "price" patterns.
const ROLE_PATTERNS: [ColumnRole, RegExp][] = [
  ["marketValue", /(market value|mkt value|usd value|value|balance|nav)/],
  ["price", /(price)/],
  ["quantity", /(qty|quantity|shares|units|amount|par|face)/],
  ["identifier", /(cusip|isin|sedol)/],
  ["symbol", /(symbol|ticker)/],
  ["name", /(holding|description|security|name|asset|account type|type)/],
];

function columnRoles(headerCells: string[]): (ColumnRole | undefined)[] {
  return headerCells.map((h) => ROLE_PATTERNS.find(([, re]) => re.test(h))?.[0]);
}

const TICKER_CELL = /^[A-Z][A-Z0-9.\-]{0,9}$/;

export function parsePastedText(text: string, accountHint?: string): ExtractedAccount {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const holdings: ExtractedHolding[] = [];
  let headerCells: string[] | null = null;
  let roles: (ColumnRole | undefined)[] = [];

  for (const line of lines) {
    const cells = expandMoneyCells(splitRow(line));
    if (cells.length < 2) continue;
    if (!headerCells && isLikelyHeader(cells)) {
      headerCells = cells.map((c) => c.toLowerCase());
      roles = columnRoles(headerCells);
      continue;
    }
    let symbol: string | undefined;
    let identifierRaw: string | undefined;
    let name: string | undefined;
    let marketValue: number | undefined;
    let price: number | undefined;
    let quantity: number | undefined;
    let ambiguous = false;

    if (headerCells && cells.length === headerCells.length && roles.includes("marketValue")) {
      // Row lines up with the header: trust the column labels. This keeps bond
      // rows right, where face value (quantity) exceeds market value.
      cells.forEach((cell, i) => {
        switch (roles[i]) {
          case "symbol":
            symbol = cell || undefined;
            break;
          case "identifier":
            identifierRaw = cell || undefined;
            break;
          case "name":
            name = cell || undefined;
            if (!symbol && TICKER_CELL.test(cell)) symbol = cell;
            break;
          case "quantity":
            quantity = parseLooseNumber(cell);
            break;
          case "price":
            price = parseLooseNumber(cell);
            break;
          case "marketValue":
            marketValue = parseLooseNumber(cell);
            break;
        }
      });
    } else {
      // Heuristic mapping: first cell that looks like a ticker (1-6 uppercase letters, optional dot/dash)
      const money: number[] = [];
      const bare: number[] = [];
      for (const cell of cells) {
        if (!symbol && TICKER_CELL.test(cell)) {
          symbol = cell;
          continue;
        }
        const amounts = moneyAmounts(cell);
        if (amounts) {
          money.push(...amounts);
          continue;
        }
        const n = NUMBER.test(cell.trim()) ? parseLooseNumber(cell) : undefined;
        if (n != null) bare.push(n);
        else if (!name && /[A-Za-z]/.test(cell)) name = name ? `${name} ${cell}` : cell;
      }
      if (money.length >= 2) {
        // Explicit amounts: the largest is the value, the smallest the price;
        // a bare number is the quantity. A bare number is never the value.
        const sorted = [...money].sort((a, b) => Math.abs(a) - Math.abs(b));
        marketValue = sorted[sorted.length - 1];
        price = sorted[0];
        quantity = bare[0];
      } else if (money.length === 1) {
        if (bare.length === 0) marketValue = money[0];
        else ambiguous = true; // a price or a value? Don't guess.
      } else {
        // No currency markers at all (a typical pasted table): largest number
        // is the market value, smallest the price, the middle the quantity.
        bare.sort((a, b) => a - b);
        marketValue = bare.length > 0 ? bare[bare.length - 1] : undefined;
        price = bare.length >= 2 ? bare[0] : undefined;
        quantity = bare.length >= 3 ? bare[1] : undefined;
      }
    }
    if (!symbol && !name && !identifierRaw) continue;

    const holding: ExtractedHolding = {
      id: safeId("eh"),
      symbol,
      identifier: buildIdentifier(identifierRaw ?? symbol),
      assetName: name,
      quantity,
      price,
      marketValue,
      currency: detectCurrency([symbol, name, line].filter(Boolean).join(" ")),
      assetClass: detectAssetClass(name),
      fields: { _line: { fieldName: "_line", raw: line, confidence: "low" } },
      warnings: ambiguous ? [{ code: "CUSTOM_REQUIRES_REVIEW", severity: "warning", message: AMBIGUOUS_MESSAGE }] : [],
      confidence: "low",
      sourceTrace: { sourceType: "pasted_text", extractionMethod: "heuristic", extractionConfidence: "low", rawText: line },
      status: ambiguous ? "needs_review" : "extracted",
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
