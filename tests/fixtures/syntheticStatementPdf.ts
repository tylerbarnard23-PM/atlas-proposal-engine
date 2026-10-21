// Deterministic one-page text PDF for statement-extraction tests (issue #29).
// Letter size, Courier at a given size, one text line per row starting at
// x=36 / y=744 with 18pt spacing, the layout of the synthetic statement the
// production bug was found with. Synthetic data only.

export const ISSUE_29_LINES = [
  "Atlas QA Custodian - Synthetic Holdings Statement",
  "Account: Atlas QA Brokerage - SYNTHETIC DATA ONLY",
  "Statement Date: October 21, 2026",
  "Amounts shown in USD. No real client data.",
  "",
  "Holding                         Symbol      Qty       Price       Market Value",
  "NVIDIA Corp QA Import           NVDA        10000     USD 800.00  USD 8,000,000.00",
  "Vanguard Bond QA Import         BND         1000      USD 100.00  USD 100,000.00",
  "QA Settlement Cash              CASH        200000    USD 1.00    USD 200,000.00",
  "Total Account Value                                           USD 8,300,000.00",
];

const escape = (s: string) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

export interface PlacedText {
  text: string;
  /** Display coordinates: x from the left edge, y from the top, as the page is seen. */
  x: number;
  y: number;
  size?: number;
  bold?: boolean;
  /** Right-align at x instead of starting at x (numeric columns). */
  align?: "left" | "right";
}

/**
 * Multi-page PDF with individually placed text, optionally on landscape pages
 * stored as portrait with /Rotate 90 and rotated text matrices, the way some
 * report generators write them. Courier throughout (Courier-Bold for bold), so
 * every character is 0.6 em wide and right alignment is exact.
 */
export function placedTextPdf(pages: { rotate?: 0 | 90; items: PlacedText[] }[]): Uint8Array {
  const W = 612;
  const H = 792;
  const objects: string[] = ["<< /Type /Catalog /Pages 2 0 R >>", ""];
  const pageIds: number[] = [];
  const fontRegular = 3;
  const fontBold = 4;
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding >>");
  for (const page of pages) {
    const rotated = page.rotate === 90;
    const ops: string[] = [];
    for (const it of page.items) {
      const size = it.size ?? 8;
      // Courier's space is exactly 0.6 em, pdf.js's upper bound for a space
      // inside a run; rounding then splits long phrases into words. A slightly
      // narrower space (word spacing) keeps each phrase one item, as a
      // proportional font's would be.
      const tw = -0.02 * size;
      const width = it.text.length * 0.6 * size + (it.text.split(" ").length - 1) * tw;
      const dx = it.align === "right" ? it.x - width : it.x;
      // /Rotate 90 maps display (x, yTop) to user space (yTop, x), with the
      // text direction along user +y: Tm = [0 1 -1 0 yTop x], size set by Tf.
      const tm = rotated ? `0 1 -1 0 ${it.y} ${dx}` : `1 0 0 1 ${dx} ${H - it.y}`;
      ops.push(`BT /${it.bold ? "F2" : "F1"} ${size} Tf ${tw} Tw ${tm} Tm (${escape(it.text)}) Tj ET`);
    }
    const content = ops.join("\n");
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    const contentId = objects.length;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}]${rotated ? " /Rotate 90" : ""} /Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> >> /Contents ${contentId} 0 R >>`
    );
    pageIds.push(objects.length);
  }
  objects[1] = `<< /Type /Pages /Kids [${pageIds.map((i) => `${i} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) pdf += `${String(o).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

/** Builds the PDF bytes: each line drawn with one Tj, as common PDF libraries do. */
export function textPdf(lines: string[], opts: { fontSize?: number; x?: number; y?: number; leading?: number } = {}): Uint8Array {
  const { fontSize = 9, x = 36, y = 744, leading = 18 } = opts;
  const ops = [`BT /F1 ${fontSize} Tf ${x} ${y} Td`];
  lines.forEach((line, i) => {
    if (i > 0) ops.push(`0 -${leading} Td`);
    if (line) ops.push(`(${escape(line)}) Tj`);
  });
  ops.push("ET");
  const content = ops.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) pdf += `${String(o).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}
