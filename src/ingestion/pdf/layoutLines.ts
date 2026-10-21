// Rebuilds readable lines from positioned PDF text. A PDF stores text as
// fragments with coordinates, not lines; naive extraction concatenates them
// and table rows fall apart. Grouping fragments by baseline and ordering them
// left-to-right keeps each table row on one line, and a wide horizontal gap
// becomes a double space so column-splitting parsers still see the columns.

export interface PositionedText {
  str: string;
  x: number;
  y: number; // baseline; larger = higher on the page (PDF coordinates)
  width?: number;
  height?: number;
  /** pdf.js font id; distinguishes, e.g., bold headings from body text. */
  font?: string;
}

// The text of a PDF: one array of lines per page, plus (from the PDF readers)
// the positioned text those lines were built from, for table extraction.
export interface PdfText {
  pageCount: number;
  pages: string[][];
  items?: PositionedText[][];
}

// pdf.js text item, as getTextContent returns it.
interface PdfJsTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
  fontName?: string;
}

const multiply = (m1: number[], m2: number[]) => [
  m1[0] * m2[0] + m1[2] * m2[1],
  m1[1] * m2[0] + m1[3] * m2[1],
  m1[0] * m2[2] + m1[2] * m2[3],
  m1[1] * m2[2] + m1[3] * m2[3],
  m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
  m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
];

/**
 * Positions a text item as the page is displayed. Pages can be stored rotated
 * (a landscape table on a portrait page with /Rotate 90 and rotated text);
 * reading raw coordinates then rebuilds table columns as lines. Applying the
 * page's viewport transform puts every item where a reader sees it. For an
 * unrotated page this is the identity (same x, same y).
 */
export function toDisplay(it: PdfJsTextItem, viewport: { transform: number[]; height: number }): PositionedText {
  const m = multiply(viewport.transform, it.transform);
  return { str: it.str, x: m[4], y: viewport.height - m[5], width: it.width, height: it.height, font: it.fontName };
}

const SAME_LINE_TOLERANCE = 2.5; // points

export function itemsToLines(items: PositionedText[]): string[] {
  const fragments = items.filter((i) => i.str.trim().length > 0);
  // Top of the page first, then left to right.
  fragments.sort((a, b) => b.y - a.y || a.x - b.x);

  const rows: PositionedText[][] = [];
  for (const f of fragments) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(row[0].y - f.y) <= SAME_LINE_TOLERANCE) row.push(f);
    else rows.push([f]);
  }

  return rows.map((row) => {
    row.sort((a, b) => a.x - b.x);
    let line = "";
    let prev: PositionedText | undefined;
    for (const f of row) {
      if (prev?.width !== undefined) {
        const gap = f.x - (prev.x + prev.width);
        line += gap > columnGap(prev, f) ? "  " : gap > 0.5 ? " " : "";
      }
      line += f.str;
      prev = f;
    }
    return line.replace(/\s+$/, "");
  });
}

// The gap that separates columns rather than words. Measured against the
// font's own character width: in a monospaced statement two spaces (2 × 5.4pt
// at 9pt Courier) already mark a column, though they're less than 1.5× the
// font size. Bounded so a proportional font's single word space (about a
// quarter of the size) stays a single space.
function columnGap(a: PositionedText, b: PositionedText): number {
  const size = (b.height && b.height > 0 ? b.height : a.height && a.height > 0 ? a.height : 10);
  const widths = [a, b].filter((t) => t.width && t.str.length > 0).map((t) => t.width! / t.str.length);
  if (widths.length === 0) return size * 1.5;
  const charWidth = widths.reduce((s, w) => s + w, 0) / widths.length;
  return Math.min(size * 1.5, Math.max(size * 0.6, charWidth * 1.6));
}

// Collapses runs of whitespace, for parsers that match on single spaces.
export function squash(line: string): string {
  return line.replace(/\s+/g, " ").trim();
}
