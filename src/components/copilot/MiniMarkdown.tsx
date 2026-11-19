import * as React from "react";

// Renders the small Markdown subset Copilot answers use (paragraphs, "- "
// lists, "#" headings, pipe tables, **bold**, *italic*, `code`) as React
// elements, so model output is never injected as HTML: every piece of text is
// a React text node and is escaped. No links, images, HTML or external content
// are produced. The answer string itself is never changed (the figure check
// reads it as written).

/** A table's column alignment, from its separator row (":---", ":---:", "---:"). */
type Align = "left" | "center" | "right" | undefined;

// A row: starts and ends with a pipe (the form models write), or has at least one inner pipe.
const ROW = /^\s*\|.*\|\s*$/;
// The separator under the header: cells of dashes, with optional colons (as in GitHub Markdown).
const SEPARATOR = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;

/** Splits a table row into its cells: the outer pipes are dropped and "\|" stays a literal pipe. */
export function tableCells(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
  const cells: string[] = [];
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\\" && s[i + 1] === "|") {
      cur += "|";
      i++;
    } else if (s[i] === "|") {
      cells.push(cur.trim());
      cur = "";
    } else cur += s[i];
  }
  cells.push(cur.trim());
  return cells;
}

const alignOf = (cell: string): Align => {
  const c = cell.trim();
  if (c.startsWith(":") && c.endsWith(":")) return "center";
  if (c.endsWith(":")) return "right";
  if (c.startsWith(":")) return "left";
  return undefined;
};

const ALIGN_CLASS: Record<string, string> = { left: "text-left", center: "text-center", right: "text-right" };

export type Block =
  | { kind: "p"; text: string }
  | { kind: "h"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "table"; header: string[]; align: Align[]; rows: string[][] };

/** The answer as blocks. A table needs a header row directly followed by a separator row; anything else stays text. */
export function parseBlocks(text: string): Block[] {
  const lines = text.split("\n");
  const blocks: Block[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) blocks.push({ kind: "ul", items: list });
    list = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (ROW.test(line) && i + 1 < lines.length && SEPARATOR.test(lines[i + 1])) {
      flush();
      const header = tableCells(line);
      const align = tableCells(lines[i + 1]).map(alignOf);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && ROW.test(lines[i])) {
        const cells = tableCells(lines[i]);
        // As in GitHub Markdown: a short row is padded, extra cells are kept in the last column.
        rows.push(header.map((_, c) => (c === header.length - 1 ? cells.slice(c).join(" | ") : cells[c] ?? "")));
        i++;
      }
      i--;
      blocks.push({ kind: "table", header, align: header.map((_, c) => align[c]), rows });
      continue;
    }
    const item = line.match(/^\s*[-*]\s+(.*)$/);
    if (item) {
      list.push(item[1]);
      continue;
    }
    flush();
    const heading = line.match(/^#{1,4}\s+(.*)$/);
    if (heading) blocks.push({ kind: "h", text: heading[1] });
    else if (line.trim()) blocks.push({ kind: "p", text: line });
  }
  flush();
  return blocks;
}

export function MiniMarkdown({ text }: { text: string }) {
  return (
    <div className="space-y-2 text-sm text-ink-700 leading-relaxed">
      {parseBlocks(text).map((b, k) => {
        if (b.kind === "h") return <h4 key={k} className="font-semibold text-ink-900">{inline(b.text)}</h4>;
        if (b.kind === "p") return <p key={k}>{inline(b.text)}</p>;
        if (b.kind === "ul")
          return (
            <ul key={k} className="list-disc pl-5 space-y-1">
              {b.items.map((l, i) => <li key={i}>{inline(l)}</li>)}
            </ul>
          );
        return (
          <div key={k} className="overflow-x-auto rounded-md ring-1 ring-inset ring-ink-100" data-testid="copilot-answer-table">
            <table className="min-w-full border-collapse text-[13px]">
              <thead className="bg-slatey-50">
                <tr>
                  {b.header.map((h, c) => (
                    <th key={c} scope="col" className={`px-3 py-1.5 align-bottom font-semibold text-ink-900 ${ALIGN_CLASS[b.align[c] ?? "left"]}`}>
                      {inline(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {b.rows.map((r, i) => (
                  <tr key={i} className="border-t border-ink-100">
                    {r.map((cell, c) => (
                      <td key={c} className={`px-3 py-1.5 align-top wrap-break-word ${ALIGN_CLASS[b.align[c] ?? "left"]}`}>
                        {inline(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

export function inline(s: string): React.ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i} className="text-ink-900">{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={i} className="text-[12px]">{part.slice(1, -1)}</code>;
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) return <em key={i}>{part.slice(1, -1)}</em>;
    return part;
  });
}
