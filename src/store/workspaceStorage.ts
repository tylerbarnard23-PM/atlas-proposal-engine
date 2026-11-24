import type { StateStorage } from "zustand/middleware";

// Where the persisted workspace lives (#116). In a browser it is localStorage,
// as before. In the Stratovell desktop application the preload script exposes
// a narrow bridge (window.stratovellDesktop) and the workspace is saved to a
// file in the user's application-data folder by the main process, written
// atomically with a previous copy and dated backups (desktop/shared/workspaceFile.ts).
// The saved string is identical in both: zustand's {"state": …, "version": n}.

export interface DesktopWorkspaceBridge {
  /** The saved workspace text, or null for a fresh installation. Synchronous, so hydration matches localStorage. */
  read(): string | null;
  /** Queues a save (coalesced by the main process; flushed on quit). */
  write(value: string): void;
  /** Saves at once and reports the outcome (used by restore, which must know whether the save succeeded). */
  writeNow(value: string): { ok: true } | { ok: false; error: string };
  /** Removes the saved workspace (its previous copy and dated backups are kept). */
  remove(): void;
}

export interface DesktopAppInfo {
  name: string;
  version: string;
  /** "unsigned private UAT build" or the signing status of this build. */
  build: string;
  /** Where the workspace, its backups and the local Claude connection record are kept. */
  dataFolder: string;
  platform: string;
  /** True on the first launch of this installation (no saved workspace yet). */
  firstRun: boolean;
  /** A recovery made when the workspace was read at launch, described for the advisor; null when none. */
  recovery: { from: "previous" | "daily"; savedAt: string; movedAside: string | null } | null;
  /** Whether this window's server answers with the labelled test provider instead of Claude. */
  testProvider: boolean;
}

export interface DesktopBridge {
  workspace: DesktopWorkspaceBridge;
  info(): DesktopAppInfo;
  /** Called when a queued save failed; returns an unsubscribe function. */
  onSaveProblem(cb: (error: string | null) => void): () => void;
}

/** The desktop bridge when running inside the Stratovell desktop application, else null. */
export function desktopBridge(): DesktopBridge | null {
  if (typeof window === "undefined") return null;
  const b = (window as unknown as { stratovellDesktop?: DesktopBridge }).stratovellDesktop;
  return b && typeof b.workspace?.read === "function" ? b : null;
}

/** The storage the store persists through: the desktop file for `key`, or the browser's localStorage. */
export function workspaceStorage(key: string): StateStorage | undefined {
  const desktop = desktopBridge();
  if (desktop)
    return {
      getItem: (name) => (name === key ? desktop.workspace.read() : null),
      setItem: (name, value) => {
        if (name === key) desktop.workspace.write(value);
      },
      removeItem: (name) => {
        if (name === key) desktop.workspace.remove();
      },
    };
  return typeof window !== "undefined" ? window.localStorage : undefined;
}

/**
 * Reads and saves the workspace record immediately, reporting failure: used by
 * restore, which checks the save before changing anything. Null outside a
 * browser or the desktop application.
 */
export function strictWorkspaceStorage(key: string): { get(): string | null; set(value: string): void; remove(): void } | null {
  const desktop = desktopBridge();
  if (desktop)
    return {
      get: () => desktop.workspace.read(),
      set: (value) => {
        const r = desktop.workspace.writeNow(value);
        if (!r.ok) throw new Error(r.error);
      },
      remove: () => desktop.workspace.remove(),
    };
  if (typeof window === "undefined") return null;
  const ls = window.localStorage;
  return { get: () => ls.getItem(key), set: (value) => ls.setItem(key, value), remove: () => ls.removeItem(key) };
}
