export function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

export function isStale(iso: string | undefined, dayThreshold: number): boolean {
  if (!iso) return true;
  const days = (Date.now() - new Date(iso).getTime()) / 86_400_000;
  return days > dayThreshold;
}
