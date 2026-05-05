import Papa from "papaparse";
import type { ExtractedHolding, ExtractedAccount, DataQualityIssue } from "@/domain/types";
import { safeId } from "@/utils/formatting";
import { buildIdentifier } from "../normalizers/detectIdentifier";
import { detectCurrency } from "../normalizers/detectCurrency";
import { detectAssetClass } from "../normalizers/detectAssetClass";
import { validateExtractedHolding } from "../validation/validateExtractedHolding";

const COLUMN_ALIASES: Record<keyof ColumnMap, string[]> = {
  symbol: ["symbol", "ticker", "security symbol", "security id"],
  name: ["security", "security description", "description", "name", "asset", "investment"],
  quantity: ["quantity", "shares", "units", "qty", "share/par"],
  price: ["price", "market price", "unit price", "last price"],
  marketValue: ["market value", "value", "current value", "total value", "balance"],
  costBasis: ["cost basis", "total cost", "cost", "book value"],
  currency: ["currency", "ccy", "denomination"],
  cusip: ["cusip"],
  isin: ["isin"],
  account: ["account", "account name", "account number"],
  assetClass: ["asset class", "asset type", "type", "category"],
};

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

export function autoDetectColumns(headers: string[]): ColumnMap {
  const lowered = headers.map((h) => h.toLowerCase().trim());
  const out: ColumnMap = {};
  for (const [key, aliases] of Object.entries(COLUMN_ALIASES)) {
    for (const alias of aliases) {
      const idx = lowered.findIndex((h) => h === alias || h.includes(alias));
      if (idx !== -1) {
        out[key as keyof ColumnMap] = headers[idx];
        break;
      }
    }
  }
  return out;
}

function parseLooseNumber(v: unknown): number | undefined {
  if (v == null || v === "") return undefined;
  const s = String(v).replace(/[$£€¥,\s]/g, "").replace(/^\((.*)\)$/, "-$1");
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

export interface ParseCsvResult {
  headers: string[];
  rows: Record<string, string>[];
  columnMap: ColumnMap;
  account: ExtractedAccount;
  warnings: DataQualityIssue[];
}

export function parseCsvText(text: string, accountHint?: string): ParseCsvResult {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  const rows = (parsed.data ?? []).filter((r) => Object.values(r).some((v) => v != null && v !== ""));
  const headers = parsed.meta?.fields ?? Object.keys(rows[0] ?? {});
  const columnMap = autoDetectColumns(headers);
  const warnings: DataQualityIssue[] = [];
  if (parsed.errors?.length) {
    warnings.push({
      code: "ADVISOR_EDITED_VALUE",
      severity: "info",
      message: `${parsed.errors.length} CSV parse warning(s). First: ${parsed.errors[0]?.message}`,
    });
  }
  const holdings: ExtractedHolding[] = rows.map((row) => {
    const symbol = columnMap.symbol ? row[columnMap.symbol]?.toString().trim() : undefined;
    const name = columnMap.name ? row[columnMap.name]?.toString().trim() : undefined;
    const idStr = symbol || (columnMap.cusip ? row[columnMap.cusip] : undefined) || (columnMap.isin ? row[columnMap.isin] : undefined);
    const quantity = columnMap.quantity ? parseLooseNumber(row[columnMap.quantity]) : undefined;
    const price = columnMap.price ? parseLooseNumber(row[columnMap.price]) : undefined;
    const marketValue = columnMap.marketValue ? parseLooseNumber(row[columnMap.marketValue]) : undefined;
    const costBasis = columnMap.costBasis ? parseLooseNumber(row[columnMap.costBasis]) : undefined;
    const currency = (columnMap.currency ? row[columnMap.currency]?.toUpperCase() : undefined) ?? detectCurrency([symbol, name].filter(Boolean).join(" "));
    const assetClass = (columnMap.assetClass ? detectAssetClass(row[columnMap.assetClass]) : undefined) ?? detectAssetClass(name);
    const holding: ExtractedHolding = {
      id: safeId("eh"),
      symbol,
      identifier: buildIdentifier(idStr ?? undefined),
      assetName: name,
      quantity,
      price,
      marketValue,
      costBasis,
      currency,
      assetClass,
      fields: Object.fromEntries(
        headers.map((h) => [h, { fieldName: h, raw: row[h] ?? "", confidence: "medium" as const }])
      ),
      warnings: [],
      confidence: "medium",
      sourceTrace: { sourceType: "csv", extractionMethod: "papaparse", extractionConfidence: "high" },
      status: "extracted",
    };
    return validateExtractedHolding(holding);
  });

  const account: ExtractedAccount = {
    id: safeId("ea"),
    accountName: accountHint,
    holdings,
    fields: {},
    warnings,
    confidence: holdings.length === 0 ? "low" : "medium",
  };
  return { headers, rows, columnMap, account, warnings };
}
