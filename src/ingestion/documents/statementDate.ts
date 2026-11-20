import { calendarDay, formatCalendarDate } from "@/utils/formatting";

// #104: a statement's own valuation date, read only from a clearly labelled
// cell ("Statement Date: April 30, 2026", "As of 30 April 2026", "Valuation
// date 2026-04-30"). A date in prose (a trade or settlement date) is never
// used. A label whose date is impossible, unreadable or could be read two ways
// (04/05/2026), or labelled dates that disagree, leave the date unknown and
// say why: the advisor records it, nothing assumes the import day.

export interface StatementDateReading {
  /** The calendar day (YYYY-MM-DD), when exactly one clear date is stated. */
  date?: string;
  /** Why no date could be used, for the advisor; absent when a date was read or none is stated. */
  problem?: string;
}

// The label must start its cell; the date must be the rest of the cell.
const LABEL = /^(?:statement\s+date|as\s+of(?:\s+date)?|valuation\s+date|valued\s+as\s+of|(?:positions|holdings|balances)\s+as\s+of)\s*(?::|-|–)?\s*(.*)$/i;

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const MONTH_NAME = String.raw`(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?`;
const MONTH_FIRST = new RegExp(String.raw`^${MONTH_NAME}\s+(\d{1,2}),?\s+(\d{4})$`, "i");
const DAY_FIRST = new RegExp(String.raw`^(\d{1,2})\s+${MONTH_NAME},?\s+(\d{4})$`, "i");
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const NUMERIC = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/;

const monthNumber = (name: string) => MONTHS.findIndex((m) => m.startsWith(name.toLowerCase().replace(/\.$/, "").slice(0, 3))) + 1;
const iso = (y: number, m: number, d: number) => calendarDay(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`) ?? undefined;
const monthDay = (m: number, d: number) => `${MONTHS[m - 1][0].toUpperCase()}${MONTHS[m - 1].slice(1)} ${d}`;

/** One labelled value: a day, a reason it can't be used, or nothing to say. */
function readValue(raw: string): { date?: string; problem?: string } {
  const value = raw.trim().replace(/\.$/, "");
  let m: RegExpMatchArray | null;
  let date: string | undefined;
  if ((m = value.match(MONTH_FIRST))) date = iso(+m[3], monthNumber(m[1]), +m[2]);
  else if ((m = value.match(DAY_FIRST))) date = iso(+m[3], monthNumber(m[2]), +m[1]);
  else if ((m = value.match(ISO))) date = iso(+m[1], +m[2], +m[3]);
  else if ((m = value.match(NUMERIC))) {
    const [a, b, y] = [+m[1], +m[2], +m[3]];
    // Month first (US) or day first: only a date that reads one way is used.
    if (a > 12 && b <= 12) date = iso(y, b, a);
    else if (b > 12 && a <= 12) date = iso(y, a, b);
    else if (a === b) date = iso(y, a, b);
    else if (a <= 12 && b <= 12) {
      return { problem: `The statement's date "${value}" could be ${monthDay(a, b)} or ${monthDay(b, a)}, ${y}, so it isn't used.` };
    }
  }
  return date ? { date } : { problem: `The statement's date "${value}" couldn't be read as a date, so it isn't used.` };
}

export function statementDateOf(lines: string[]): StatementDateReading {
  const dates = new Set<string>();
  const problems: string[] = [];
  for (const line of lines) {
    const cells = line.split(/ {2,}/).map((c) => c.trim()).filter(Boolean);
    for (let i = 0; i < cells.length; i++) {
      const label = cells[i].match(LABEL);
      if (!label) continue;
      const inline = label[1].trim();
      // "Statement Date:" in one cell and its date in the next. A bare label
      // followed by something else (a column header "As of") says nothing.
      if (!inline && !(cells[i + 1] && readValue(cells[i + 1]).date)) continue;
      const read = readValue(inline || cells[i + 1]);
      if (read.date) dates.add(read.date);
      if (read.problem) problems.push(read.problem);
    }
  }
  if (problems.length > 0) return { problem: problems[0] };
  if (dates.size > 1) {
    return { problem: `The statement states different dates (${[...dates].map((d) => formatCalendarDate(d, { month: "long" })).join(" and ")}), so neither is used.` };
  }
  return dates.size === 1 ? { date: [...dates][0] } : {};
}
