// Rate age in UTC calendar days (issue #26). Kept separate from fxPolicy so
// low-level modules (recommendation amounts) can use it without importing the
// proposal engine.

/** Initial product policy: a rate is current through this many UTC calendar days after its date. Not an institutional or regulatory standard. */
export const STALE_FX_DAYS = 7;

const DAY = 86_400_000;

/** The UTC calendar date of an ISO date or instant: "2026-04-30". */
export const utcDate = (iso: string) => new Date(Date.parse(iso)).toISOString().slice(0, 10);

/** Whole UTC calendar days from the rate's date to now's date. */
export function fxAgeDays(asOf: string, now: Date): number {
  const d = new Date(Date.parse(asOf));
  const from = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const to = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((to - from) / DAY);
}
