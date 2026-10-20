import Papa from "papaparse";
import type { ExtractedHolding, ExtractedAccount, DataQualityIssue } from "@/domain/types";
import { safeId } from "@/utils/formatting";
import { buildIdentifier } from "../normalizers/detectIdentifier";
import { detectCurrency } from "../normalizers/detectCurrency";
import { detectAssetClass } from "../normalizers/detectAssetClass";
import { detectAccountType } from "../normalizers/detectAccountType";
import { validateExtractedHolding } from "../validation/validateExtractedHolding";

// Aliases in priority order. A header matches an alias exactly (best), by
// starting with it ("Cost Basis Total"), or by ending with it ("Last Price").
// Never a match in the middle, so "Security Type" isn't read as the security
// name and "% Of Account" isn't the account. German/French aliases cover the
// Swiss and EU custodian exports the CHF samples come from.
const COLUMN_ALIASES: Record<keyof ColumnMap, string[]> = {
  symbol: ["symbol", "ticker", "security symbol", "security id", "valor", "valoren"],
  name: [
    "security description", "description", "security name", "investment name", "security", "investment",
    "fund name", "holding", "asset name", "asset", "name", "bezeichnung", "titel", "désignation",
  ],
  quantity: ["quantity", "shares", "units", "qty", "share/par", "par value", "nominal", "anzahl", "menge", "stück", "quantité"],
  price: ["price", "market price", "unit price", "last price", "share price", "closing price", "nav", "kurs", "cours"],
  marketValue: [
    "market value", "current value", "total value", "value", "balance", "amount", "marktwert", "kurswert", "wert",
    "valeur", "valeur de marché",
  ],
  costBasis: ["cost basis", "total cost", "cost", "book value", "einstandswert"],
  currency: ["currency", "ccy", "denomination", "währung", "devise"],
  cusip: ["cusip"],
  isin: ["isin"],
  account: ["account number", "account #", "account no", "account", "account name", "konto", "depot"],
  assetClass: ["asset class", "asset type", "security type", "asset category", "category", "anlageklasse"],
};

// Columns that describe a change or a share rather than a level: never the
// price, value, quantity or cost of a holding.
const DERIVED_HEADER = /%|change|gain|loss|percent|day|yield|ratio|weight/i;
const NUMERIC_FIELDS = new Set<keyof ColumnMap>(["quantity", "price", "marketValue", "costBasis"]);

export type ColumnMap = {
  symbol?: string;
  name?: string;
  quantity?: string;
  price?: string;
  marketValue?: string;
  costBasis?: string;
  currency?: string;
  cusip?: string;
  isin?: string;
  account?: string;
  assetClass?: string;
};

function matchScore(header: string, alias: string): number {
  if (header === alias) return 3;
  if (header.startsWith(alias + " ") || header.startsWith(alias + "(")) return 2;
  if (header.endsWith(" " + alias)) return 1;
  return 0;
}

export function autoDetectColumns(headers: string[]): ColumnMap {
  const lowered = headers.map((h) => h.toLowerCase().replace(/\s+/g, " ").trim());
  const candidates: { key: keyof ColumnMap; idx: number; rank: number }[] = [];
  for (const [key, aliases] of Object.entries(COLUMN_ALIASES) as [keyof ColumnMap, string[]][]) {
    aliases.forEach((alias, aliasIdx) => {
      lowered.forEach((h, idx) => {
        if (!h || /%|percent/.test(h) || (NUMERIC_FIELDS.has(key) && DERIVED_HEADER.test(h))) return;
        const score = matchScore(h, alias);
        // Match quality first, then alias priority.
        if (score) candidates.push({ key, idx, rank: score * 100 - aliasIdx });
      });
    });
  }
  // Best matches claim their header first; each header maps to one field.
  candidates.sort((a, b) => b.rank - a.rank);
  const out: ColumnMap = {};
  const used = new Set<number>();
  for (const c of candidates) {
    if (out[c.key] || used.has(c.idx)) continue;
    out[c.key] = headers[c.idx];
    used.add(c.idx);
  }
  return out;
}

const EMPTY_VALUE = /^(--?|—|n\/?a|null|none|-)$/i;

function parseLooseNumber(v: unknown): number | undefined {
  if (v == null) return undefined;
  let s = String(v).trim();
  if (s === "" || EMPTY_VALUE.test(s)) return undefined;
  s = s.replace(/[$£€¥\s ']|CHF|USD|EUR|GBP/gi, "").replace(/^\+/, "");
  const negative = /^\(.*\)$/.test(s) || /-$/.test(s);
  s = s.replace(/^\((.*)\)$/, "$1").replace(/-$/, "");
  // European formats: "9.550,00" and "95,50" (a comma followed by other than
  // exactly three digits is a decimal comma).
  if (/^-?\d{1,3}(\.\d{3})+,\d+$/.test(s) || /^-?\d+,(\d{1,2}|\d{4,})$/.test(s)) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    s = s.replace(/,/g, "");
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return undefined;
  return negative ? -Math.abs(n) : n;
}

// Rows that summarize or annotate rather than hold a position.
const SUMMARY_ROW = /^(account total|total|totals|grand total|subtotal|sub-total|portfolio total|pending activity|gesamt|total général)\b/i;

function isHeaderLike(cells: string[]): boolean {
  const map = autoDetectColumns(cells);
  const hasValue = map.marketValue || map.quantity;
  const hasLabel = map.name || map.symbol || map.isin || map.cusip;
  return Boolean(hasValue && hasLabel);
}

const filled = (cells: string[]) => cells.filter((c) => c != null && String(c).trim() !== "").length;

export interface ParseCsvResult {
  headers: string[];
  rows: Record<string, string>[];
  columnMap: ColumnMap;
  /** Every holding in the file, in one account (kept for callers that want one). */
  account: ExtractedAccount;
  /** One account per value of the file's account column, else the single account. */
  accounts: ExtractedAccount[];
  warnings: DataQualityIssue[];
}

export function parseCsvText(text: string, accountHint?: string): ParseCsvResult {
  const clean = text.replace(/^﻿/, "");
  const toGrid = (delimiter?: string) =>
    (Papa.parse<string[]>(clean, { header: false, skipEmptyLines: false, delimiter }).data ?? []).map((r) =>
      Array.isArray(r) ? r.map((c) => (c ?? "").toString()) : []
    );
  // Custodian exports often open with a title line ("Positions for account
  // ... as of ..."); the header is the first row that names both a label and
  // a value column. Try each delimiter: papaparse's guess picks "," for
  // European files whose decimal commas outnumber the semicolons.
  const findHeader = (g: string[][]) => g.findIndex((r, i) => i < 30 && isHeaderLike(r));
  let grid = toGrid();
  let headerIdx = findHeader(grid);
  for (const d of [",", ";", "\t", "|"]) {
    if (headerIdx !== -1) break;
    grid = toGrid(d);
    headerIdx = findHeader(grid);
  }
  if (headerIdx === -1) grid = toGrid();
  const warnings: DataQualityIssue[] = [];
  if (headerIdx === -1) headerIdx = grid.findIndex((r) => filled(r) > 0);
  const headers = (headerIdx === -1 ? [] : grid[headerIdx]).map((h) => h.trim());
  if (headerIdx > 0) {
    warnings.push({
      code: "ADVISOR_EDITED_VALUE",
      severity: "info",
      message: `Skipped ${headerIdx} line(s) above the column headers.`,
    });
  }

  // Data runs until the positions section ends: a blank line followed by a
  // new section (another header, e.g. Vanguard's transactions) or by notes
  // (Fidelity's disclaimer lines).
  const rows: Record<string, string>[] = [];
  let skippedSummary = 0;
  const columnMap = autoDetectColumns(headers);
  for (let i = headerIdx + 1; headerIdx !== -1 && i < grid.length; i++) {
    const cells = grid[i];
    if (filled(cells) === 0) {
      const next = grid.slice(i + 1).find((r) => filled(r) > 0);
      if (!next || isHeaderLike(next) || filled(next) === 1) break;
      continue;
    }
    if (filled(cells) === 1 && headers.length > 2) continue; // a note, not a position
    const row = Object.fromEntries(headers.map((h, j) => [h, (cells[j] ?? "").trim()]));
    const label = [columnMap.symbol, columnMap.name].map((k) => (k ? row[k] : "")).find(Boolean) ?? cells.find((c) => c.trim()) ?? "";
    if (SUMMARY_ROW.test(label.trim())) {
      skippedSummary++;
      continue;
    }
    rows.push(row);
  }
  if (skippedSummary) {
    warnings.push({
      code: "ADVISOR_EDITED_VALUE",
      severity: "info",
      message: `Skipped ${skippedSummary} total / pending-activity row(s); they aren't positions.`,
    });
  }

  const holdingsByAccount = new Map<string, ExtractedHolding[]>();
  for (const row of rows) {
    const get = (k: keyof ColumnMap) => {
      const col = columnMap[k];
      const v = col ? row[col]?.trim() : undefined;
      return v && !EMPTY_VALUE.test(v) ? v : undefined;
    };
    let symbol = get("symbol")?.replace(/\*+$/, "");
    let name = get("name");
    // Schwab puts its cash line in the Symbol column with no description.
    if (!name && symbol && /\s/.test(symbol) && !get("quantity")) {
      name = symbol;
      symbol = undefined;
    }
    const idStr = symbol || get("cusip") || get("isin");
    const quantity = parseLooseNumber(get("quantity"));
    const price = parseLooseNumber(get("price"));
    const marketValue = parseLooseNumber(get("marketValue"));
    const costBasis = parseLooseNumber(get("costBasis"));
    if (!name && !idStr && marketValue === undefined && quantity === undefined) continue;
    const ccyRaw = get("currency")?.toUpperCase();
    const currency = (ccyRaw && /^[A-Z]{3}$/.test(ccyRaw) ? ccyRaw : undefined) ?? detectCurrency([symbol, name].filter(Boolean).join(" "));
    const assetClass = detectAssetClass(get("assetClass")) ?? detectAssetClass(name) ?? detectAssetClass(symbol);
    const holding: ExtractedHolding = {
      id: safeId("eh"),
      symbol,
      identifier: buildIdentifier(idStr ?? get("isin") ?? undefined),
      assetName: name ?? symbol,
      quantity,
      price,
      marketValue,
      costBasis,
      currency,
      assetClass,
      fields: Object.fromEntries(
        headers.filter(Boolean).map((h) => [h, { fieldName: h, raw: row[h] ?? "", confidence: "medium" as const }])
      ),
      warnings: [],
      confidence: "medium",
      sourceTrace: { sourceType: "csv", extractionMethod: "papaparse", extractionConfidence: "high" },
      status: "extracted",
    };
    const key = get("account") ?? "";
    holdingsByAccount.set(key, [...(holdingsByAccount.get(key) ?? []), validateExtractedHolding(holding)]);
  }

  const makeAccount = (holdings: ExtractedHolding[], name?: string, accountWarnings: DataQualityIssue[] = []): ExtractedAccount => ({
    id: safeId("ea"),
    accountName: name,
    accountType: detectAccountType(name),
    holdings,
    fields: {},
    warnings: accountWarnings,
    confidence: holdings.length === 0 ? "low" : "medium",
  });
  const all = [...holdingsByAccount.values()].flat();
  const account = makeAccount(all, accountHint, warnings);
  const keys = [...holdingsByAccount.keys()];
  const accounts =
    keys.length > 1
      ? keys.map((k) => makeAccount(holdingsByAccount.get(k)!, accountLabel(k, rows, columnMap, headers) ?? accountHint))
      : [account];
  if (accounts.length > 1) accounts[0].warnings = warnings;
  return { headers, rows, columnMap, account, accounts, warnings };
}

// "Z12345678" + a name column ("ROTH IRA") reads better as "ROTH IRA ···5678".
function accountLabel(key: string, rows: Record<string, string>[], map: ColumnMap, headers: string[]): string | undefined {
  if (!key) return undefined;
  const nameCol = headers.find((h) => /^account (name|title|type)$/i.test(h.trim()) && h !== map.account);
  const row = rows.find((r) => map.account && r[map.account]?.trim() === key);
  const name = nameCol && row ? row[nameCol]?.trim() : undefined;
  const isNumber = /^[A-Z]{0,3}[\d-]{4,}$/i.test(key);
  const masked = isNumber ? `···${key.replace(/\D/g, "").slice(-4)}` : key;
  return name && name !== key ? `${name} ${isNumber ? masked : `(${key})`}` : isNumber ? `Account ${masked}` : key;
}
