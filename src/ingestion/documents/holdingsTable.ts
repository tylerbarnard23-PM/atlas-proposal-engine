import type { AssetClass, CurrencyCode, DataQualityIssue, ExtractedHolding } from "@/domain/types";
import type { PdfText, PositionedText } from "../pdf/layoutLines";
import { validateExtractedHolding } from "../validation/validateExtractedHolding";
import { safeId } from "@/utils/formatting";

// Reads a holdings report laid out as a positioned table: right-aligned
// numeric columns under (possibly stacked, multi-line) headers, bold section
// headings, wrapped security names, totals and summary sections. Columns are
// found from the header labels' geometry rather than from spacing, so a cell
// that's empty (an unbundled fund slice has no quantity) can't shift the
// others. Returns null when the document isn't such a table, so the
// line-based reader handles it instead.

export interface TableTotal {
  label: string;
  amount: number;
  page: number;
  /** "portfolio": the whole report (or account); "section": a subtotal. */
  kind: "portfolio" | "section";
}

export interface HoldingsTable {
  holdings: ExtractedHolding[];
  totals: TableTotal[];
  asOfDate?: string;
  currency?: CurrencyCode;
}

type Role = "quantity" | "price" | "costBasis" | "marketValue";
interface Column {
  right: number;
  left: number;
  label: string;
  role?: Role;
}
interface Row {
  y: number;
  page: number;
  items: PositionedText[];
  text: string;
}

const SAME_ROW = 2.5; // points
const ALIGN = 8; // right edges within this many points are the same column

const NUMBER = /^\(?-?\$?\s?-?\(?\d[\d,]*(?:\.\d+)?\)?$/;
const PERCENT = /%$/;
const DATE = /\b(\d{2})\/(\d{2})\/(\d{4})\b/;
const MARKET_VALUE_LABEL = /^(?:market|current)\s+value\b/i;
const ANNOTATION = /^[A-Za-z][A-Za-z .'/-]{1,40}:\s*\$?\s?-?[\d(]/; // "Client investment: $0.00"
const FOOTNOTE = /^\(\d+\)$|^\[.*\]$|^\*\s+[A-Za-z]/; // "(1)", "[Outside Account @…]", "* Balanced funds are…"
const TOTAL = /^\s*(?:(?:grand|account|portfolio|sub)[\s-]*)?total\b/i;
const PORTFOLIO_TOTAL =
  /^(?:grand total|(?:account|portfolio) total|total|total (?:account|portfolio)(?: value)?|total (?:market value|value|holdings|assets))$/i;
const SUMMARY_HEADING = /\bsummary\b/i;
const DETAILS_HEADING = /\bdetails? of\b/i;

const SECTION_CLASS: [RegExp, AssetClass][] = [
  [/^cash\b|money market/i, "cash"],
  [/fixed income|^bonds?\b/i, "fixed_income"],
  [/^equit/i, "equity"],
  [/commodit/i, "commodity"],
  [/non-traditional|alternative/i, "alternatives"],
  [/insur|annuit/i, "insurance"],
];
const classOf = (section?: string) => (section ? SECTION_CLASS.find(([re]) => re.test(section))?.[1] : undefined);

const num = (s: string) => {
  const t = s.replace(/[$,\s]/g, "");
  const neg = /^\(.*\)$/.test(t) || t.startsWith("-");
  const n = Number(t.replace(/[()]/g, "").replace(/^-/, ""));
  return Number.isFinite(n) ? (neg ? -n : n) : undefined;
};
const right = (i: PositionedText) => i.x + (i.width ?? 0);

function rowsOf(items: PositionedText[], page: number): Row[] {
  const sorted = items.filter((i) => i.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: Row[] = [];
  for (const it of sorted) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(last.y - it.y) <= SAME_ROW) last.items.push(it);
    else rows.push({ y: it.y, page, items: [it], text: "" });
  }
  for (const r of rows) {
    r.items.sort((a, b) => a.x - b.x);
    r.text = r.items.map((i) => i.str.trim()).join(" ").replace(/\s+/g, " ").trim();
  }
  return rows;
}

// The rows a header occupies: the row with the market-value label and the
// label rows stacked just above it (no numbers, within a few lines).
function headerBlock(pageRows: Row[], headerIdx: number): Row[] {
  const header = pageRows[headerIdx];
  const block = [header];
  for (let i = headerIdx - 1; i >= 0 && header.y - pageRows[i].y <= 30 && block.length < 4; i--) {
    if (pageRows[i].items.some((it) => NUMBER.test(it.str.trim()))) break;
    block.unshift(pageRows[i]);
  }
  return block;
}

// Labels are clustered into columns by right edge. Anything left of the first
// column with a role is not a column label: on the header row it names the
// section ("Fixed Income  Quantity  …").
function columnsFrom(block: Row[]): { columns: Column[]; nameRight: number; section?: string; asOf?: string; currency?: CurrencyCode } {
  const header = block[block.length - 1];
  const mv = header.items.find((i) => MARKET_VALUE_LABEL.test(i.str.trim()))!;
  const labels = block.flatMap((r) => r.items);
  // A page title or running heading can sit just above the labels ("Portfolio
  // holdings - as of … (continued)"); it starts at the left margin and is far
  // wider than a column label, so it isn't clustered into a column.
  const margin = Math.min(...header.items.map((i) => i.x));
  const isLabel = (it: PositionedText, r: Row) => r === header || (it.x > margin + 2 && it.str.trim().split(/\s+/).length <= 4);
  let columns: Column[] = [];
  for (const it of block.flatMap((r) => r.items.filter((i) => isLabel(i, r)))) {
    const c = columns.find((col) => Math.abs(col.right - right(it)) <= ALIGN);
    if (c) {
      c.label = `${c.label} ${it.str.trim()}`;
      c.left = Math.min(c.left, it.x);
      c.right = Math.max(c.right, right(it));
    } else columns.push({ right: right(it), left: it.x, label: it.str.trim() });
  }
  for (const c of columns) {
    const l = c.label.toLowerCase();
    if (MARKET_VALUE_LABEL.test(l) || /(^| )market value/.test(l)) c.role = "marketValue";
    else if (/cost basis|total cost/.test(l)) c.role = "costBasis";
    else if (/quantity|shares|units/.test(l)) c.role = "quantity";
    else if (/price/.test(l) && !/purchase|avg|average|cost/.test(l)) c.role = "price";
  }
  const firstRoleLeft = Math.min(...columns.filter((c) => c.role).map((c) => c.left));
  const sectionItem = header.items.find((i) => right(i) < firstRoleLeft - 5 && !MARKET_VALUE_LABEL.test(i.str.trim()));
  columns = columns.filter((c) => c.right >= firstRoleLeft - 5);
  const dateLabel = labels.map((i) => i.str).join(" ").match(DATE);
  const asOf = dateLabel ? `${dateLabel[3]}-${dateLabel[1]}-${dateLabel[2]}` : undefined;
  const cur = mv.str.match(/\((\$|€|£|USD|EUR|GBP|CHF)\)/)?.[1];
  const currency = cur ? ({ $: "USD", "€": "EUR", "£": "GBP" } as Record<string, string>)[cur] ?? cur : undefined;
  return { columns, nameRight: firstRoleLeft - 5, section: sectionItem?.str.trim(), asOf, currency };
}

export function extractHoldingsTable(pdf: PdfText): HoldingsTable | null {
  if (!pdf.items) return null;
  const pages = pdf.items.map((items, i) => rowsOf(items, i + 1));
  const rows = pages.flat();
  // Header blocks, found up front so their stacked label rows are never read
  // as a security name's continuation.
  const headerOf = new Map<Row, Row[]>();
  const inHeader = new Set<Row>();
  for (const pageRows of pages) {
    pageRows.forEach((r, idx) => {
      if (!r.items.some((it) => MARKET_VALUE_LABEL.test(it.str.trim()))) return;
      const block = headerBlock(pageRows, idx);
      headerOf.set(r, block);
      for (const b of block) inHeader.add(b);
    });
  }

  // The body font: the one most numbers are set in (data rows). Text in
  // another font is a heading or a total, not a security name.
  const fontCount = new Map<string, number>();
  for (const r of rows) for (const it of r.items) if (it.font && NUMBER.test(it.str.trim())) fontCount.set(it.font, (fontCount.get(it.font) ?? 0) + 1);
  const bodyFont = [...fontCount].sort((a, b) => b[1] - a[1])[0]?.[0];
  const isBody = (r: Row) => !bodyFont || r.items.every((i) => !i.font || i.font === bodyFont);

  let mode: "detail" | "summary" = "detail";
  let columns: Column[] | null = null;
  let mvColumn: Column | undefined;
  let nameRight = 0;
  let topSection: string | undefined;
  let subSection: string | undefined;
  let asOfDate: string | undefined;
  let currency: CurrencyCode | undefined;
  let aligned = 0; // numbers that sit exactly under the market-value label

  const holdings: ExtractedHolding[] = [];
  const totals: TableTotal[] = [];
  let current: { h: ExtractedHolding; accepting: boolean; nameParts: string[]; rawParts: string[] } | null = null;
  let pendingName: string[] = [];

  const flush = () => {
    if (current) {
      current.h.assetName = current.nameParts.join(" ").replace(/\s+/g, " ").trim();
      current.h.sourceTrace = { ...current.h.sourceTrace, rawText: current.rawParts.join(" | ") };
      current.h.fields._line = { fieldName: "_line", raw: current.rawParts.join(" | "), confidence: "medium" };
      holdings.push(validateExtractedHolding(current.h));
    }
    current = null;
  };

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const hasNumber = r.items.some((it) => NUMBER.test(it.str.trim()) || PERCENT.test(it.str.trim()));

    // Section switches: summaries are never positions; details are.
    if (!hasNumber && r.text.split(" ").length <= 6 && DETAILS_HEADING.test(r.text)) {
      flush();
      mode = "detail";
      continue;
    }
    if (!hasNumber && r.text.split(" ").length <= 6 && SUMMARY_HEADING.test(r.text) && !/^\*/.test(r.text)) {
      flush();
      pendingName = [];
      mode = "summary";
      columns = null;
      continue;
    }

    // A header: the row with the market-value label (its stacked label rows
    // above are skipped).
    const block = headerOf.get(r);
    if (block) {
      flush();
      pendingName = [];
      const h = columnsFrom(block);
      columns = h.columns;
      nameRight = h.nameRight;
      mvColumn = columns.find((c) => c.role === "marketValue");
      if (h.section) {
        topSection = h.section;
        subSection = undefined;
      }
      asOfDate = h.asOf ?? asOfDate;
      currency = h.currency ?? currency;
      continue;
    }
    if (inHeader.has(r)) continue;
    if (!columns || !mvColumn) continue;

    // Cells by column: a number belongs to the column whose right edge it
    // sits on (the columns are right-aligned).
    const cells: Partial<Record<Role, string>> = {};
    const nameItems: PositionedText[] = [];
    for (const it of r.items) {
      const s = it.str.trim();
      if ((NUMBER.test(s) || PERCENT.test(s)) && right(it) > nameRight) {
        const col = columns.reduce((best, c) => (Math.abs(c.right - right(it)) < Math.abs(best.right - right(it)) ? c : best));
        if (Math.abs(col.right - right(it)) <= ALIGN && col.role && !PERCENT.test(s)) cells[col.role] = s;
        if (col === mvColumn && Math.abs(col.right - right(it)) <= 3) aligned++;
      } else if (it.x < nameRight) nameItems.push(it);
    }
    const label = nameItems.map((n) => n.str.trim()).join(" ").replace(/\s+/g, " ").trim();
    const mv = cells.marketValue !== undefined ? num(cells.marketValue) : undefined;

    if (mode === "summary") continue;

    // Totals: recorded, never positions.
    if (label && TOTAL.test(label)) {
      flush();
      pendingName = [];
      if (mv !== undefined) {
        totals.push({ label, amount: mv, page: r.page, kind: PORTFOLIO_TOTAL.test(label) ? "portfolio" : "section" });
      }
      continue;
    }

    if (mv === undefined) {
      if (Object.keys(cells).length > 0 || hasNumber) continue; // numbers, but none is a value
      const text = r.text;
      if (ANNOTATION.test(text) || FOOTNOTE.test(text)) {
        if (current) current.accepting = false;
        continue;
      }
      if (!isBody(r)) {
        // A heading in the heading font: a sub-section ("US", "Insured Solutions").
        flush();
        pendingName = [];
        subSection = text;
        continue;
      }
      if (current?.accepting) {
        current.nameParts.push(text);
        current.rawParts.push(text);
      } else pendingName.push(text);
      continue;
    }

    // A position row.
    flush();
    const unbundled = /^\*\s*/.test(label);
    const ownName = label.replace(/^\*\s*/, "");
    const nameParts = ownName ? [ownName] : pendingName;
    pendingName = [];
    const section = classOf(subSection) ?? classOf(topSection);
    const quantity = cells.quantity !== undefined ? num(cells.quantity) : undefined;
    // 0.00 shown for price or cost basis next to a real value means "not available".
    const zeroIsMissing = (v?: number) => (v === 0 && (mv ?? 0) !== 0 ? undefined : v);
    const price = zeroIsMissing(cells.price !== undefined ? num(cells.price) : undefined);
    const costBasis = zeroIsMissing(cells.costBasis !== undefined ? num(cells.costBasis) : undefined);
    const warnings: DataQualityIssue[] = [];
    if (nameParts.length === 0) {
      warnings.push({ code: "CUSTOM_REQUIRES_REVIEW", severity: "warning", message: "A value row with no security name; check it against the report." });
    }
    const notes = [
      [...new Set([topSection, subSection].filter(Boolean))].join(" › ") || undefined,
      unbundled ? "Unbundled slice of a balanced mutual fund (the report allocates the fund across asset classes)" : undefined,
    ]
      .filter(Boolean)
      .join(". ");
    current = {
      h: {
        id: safeId("eh"),
        assetName: undefined,
        quantity,
        price,
        costBasis,
        marketValue: mv,
        currency: currency ?? "USD",
        assetClass: section,
        valuationDate: asOfDate,
        notes: notes || undefined,
        fields: {},
        warnings,
        confidence: "medium",
        sourceTrace: { sourceType: "pdf_text", page: r.page, extractionMethod: "pdf-positioned-table", extractionConfidence: "medium" },
        status: nameParts.length === 0 ? "needs_review" : "extracted",
      },
      accepting: true,
      nameParts: [...nameParts],
      rawParts: [r.text],
    };
  }
  flush();

  // Only a real right-aligned table: the values must sit under the label.
  if (holdings.length === 0 || aligned < 2) return null;
  return { holdings, totals, asOfDate, currency };
}
