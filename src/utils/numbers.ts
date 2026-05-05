export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function safeDivide(num: number, den: number, fallback = 0): number {
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return fallback;
  return num / den;
}

export function sumBy<T>(arr: T[], fn: (t: T) => number): number {
  return arr.reduce((acc, x) => acc + (fn(x) || 0), 0);
}

export function groupBy<T, K extends string | number>(
  arr: T[],
  keyFn: (t: T) => K
): Record<K, T[]> {
  const out = {} as Record<K, T[]>;
  for (const item of arr) {
    const k = keyFn(item);
    (out[k] ??= []).push(item);
  }
  return out;
}

export function pickHighestBy<T>(arr: T[], fn: (t: T) => number, n: number): T[] {
  return [...arr].sort((a, b) => fn(b) - fn(a)).slice(0, n);
}
