import * as React from "react";
import { createStore, type StateCreator, type StoreApi } from "zustand/vanilla";

// Test support: a drop-in for zustand's `create` whose hooks read the live
// store state during server rendering too. Zustand's own hook renders its
// initial state on the server (before persistence hydrates and before any
// test setup), which would hide everything a page shows. With this, the real
// pages and components can be rendered with react-dom/server against the real
// store, its actions and its persistence, in the node test environment.
// Use with: vi.mock("zustand", async (orig) => ({ ...(await orig()), create: (await import("./support/liveStore")).liveCreate })).

type Bound<T> = (<U = T>(selector?: (s: T) => U) => U) & StoreApi<T>;

function bind<T>(initializer: StateCreator<T, [], []>): Bound<T> {
  const api = createStore(initializer);
  const hook = <U,>(selector: (s: T) => U = (s) => s as unknown as U) => {
    const read = () => selector(api.getState());
    return React.useSyncExternalStore(api.subscribe, read, read);
  };
  return Object.assign(hook, api) as Bound<T>;
}

export function liveCreate<T>(initializer?: StateCreator<T, [], []>) {
  return initializer ? bind(initializer) : (i: StateCreator<T, [], []>) => bind(i);
}
