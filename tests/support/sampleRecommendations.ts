import type { Recommendation } from "@/domain/types";
import { SEED_RECOMMENDATIONS } from "@/data/seedRecommendations";

// #111: a fresh or restored sample workspace has no recommendations. Suites
// whose fixtures and baselines were built on the sample's six prewritten
// recommendations load them here, explicitly, so their figures stay as they
// were. The working workspace never preloads them.

type Store = { setState: (partial: { recommendations: Recommendation[] }) => void };

/** Puts the prewritten sample recommendations (a copy) into the store, as the sample workspace used to start. */
export function loadSampleRecommendations(store: Store): void {
  store.setState({ recommendations: structuredClone(SEED_RECOMMENDATIONS) });
}

/** The store's saved-workspace key (src/store/useStore.ts STORAGE_KEY), read without importing the store. */
const STORAGE_KEY = "atlas-proposal-engine";

/**
 * True before the store module is imported with nothing saved: a fresh
 * start. Zustand's persist writes the initial state on import, so this must be
 * asked first. A re-import that hydrates a saved workspace (a simulated
 * reload) is not fresh and is left exactly as saved.
 */
export function nothingSaved(): boolean {
  const storage = (globalThis as { window?: { localStorage?: { getItem(k: string): string | null } } }).window?.localStorage;
  return storage?.getItem(STORAGE_KEY) == null;
}
