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
