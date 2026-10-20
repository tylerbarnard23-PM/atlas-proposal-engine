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
    const cells = splitRow(line);
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
      const numericCells: number[] = [];
      for (const cell of cells) {
        if (!symbol && TICKER_CELL.test(cell)) {
          symbol = cell;
          continue;
        }
        const n = parseLooseNumber(cell);
        if (n != null) numericCells.push(n);
        else if (!name && /[A-Za-z]/.test(cell)) name = name ? `${name} ${cell}` : cell;
      }
      // Heuristic: largest numeric is market value; smallest is price; middle is quantity.
      numericCells.sort((a, b) => a - b);
      marketValue = numericCells.length > 0 ? numericCells[numericCells.length - 1] : undefined;
      price = numericCells.length >= 2 ? numericCells[0] : undefined;
      quantity = numericCells.length >= 3 ? numericCells[1] : undefined;
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
