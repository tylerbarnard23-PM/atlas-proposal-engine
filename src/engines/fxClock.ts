import { nextFxBoundary } from "./fxPolicy";

// The time the browser evaluates FX freshness at (#26 review). Status changes
// with time alone at UTC midnight (a rate's age) and at deadlines such as a
// confirmation's expiry, so the clock ticks exactly at the next of those and
// notifies its subscribers; refresh() catches up at once, e.g. when the user
// returns to the page after the machine slept. With no subscribers it keeps
// no timer.

export interface FxClockEnv {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
}

export interface FxClock {
  subscribe(listener: () => void): () => void;
  /** Epoch milliseconds; stable between ticks. */
  getSnapshot(): number;
  /** Tick at `at` (epoch ms) as well; null removes the deadline. */
  setDeadline(key: string, at: number | null): void;
  refresh(): void;
}

const browserEnv: FxClockEnv = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};

export function createFxClock(env: FxClockEnv = browserEnv): FxClock {
  let snapshot = env.now();
  const listeners = new Set<() => void>();
  const deadlines = new Map<string, number>();
  let timer: unknown = null;

  function schedule() {
    if (timer !== null) env.clearTimeout(timer);
    timer = null;
    if (listeners.size === 0) return;
    const now = env.now();
    // 1 ms past the boundary, so the tick lands on its far side.
    timer = env.setTimeout(tick, Math.max(0, nextFxBoundary(now, [...deadlines.values()]) - now) + 1);
  }
  function tick() {
    timer = null;
    refresh();
  }
  function refresh() {
    const now = env.now();
    const changed = now !== snapshot;
    snapshot = now;
    if (changed) listeners.forEach((l) => l());
    schedule();
  }

  return {
    subscribe(listener) {
      if (listeners.size === 0) snapshot = env.now(); // the first subscriber starts from the current time
      listeners.add(listener);
      schedule();
      return () => {
        listeners.delete(listener);
        schedule();
      };
    },
    getSnapshot: () => snapshot,
    setDeadline(key, at) {
      if (at === null || !Number.isFinite(at)) deadlines.delete(key);
      else deadlines.set(key, at);
      schedule();
    },
    refresh,
  };
}
