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
}

// The text of a PDF: one array of lines per page.
export interface PdfText {
  pageCount: number;
  pages: string[][];
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
    let prevEnd: number | undefined;
    for (const f of row) {
      if (prevEnd !== undefined) {
        const gap = f.x - prevEnd;
        const size = f.height && f.height > 0 ? f.height : 10;
        line += gap > size * 1.5 ? "  " : gap > 0.5 ? " " : "";
      }
      line += f.str;
      prevEnd = f.width !== undefined ? f.x + f.width : undefined;
    }
    return line.replace(/\s+$/, "");
  });
}

// Collapses runs of whitespace, for parsers that match on single spaces.
export function squash(line: string): string {
  return line.replace(/\s+/g, " ").trim();
}
