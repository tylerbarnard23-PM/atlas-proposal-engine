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
  /** Queues a save (coalesced by the main process; flushed on quit). Refused when another window saved a newer workspace first. */
  write(value: string): void;
  /** Saves at once and reports the outcome (used by restore, which must know whether the save succeeded). */
  writeNow(value: string): { ok: true } | { ok: false; error: string };
  /** Removes the saved workspace (its previous copy and dated backups are kept). */
  remove(): void;
  /** The saved workspace text without adopting its revision (a restore's rollback copy). */
  peek(): string | null;
  /** After a load problem: keeps a copy of every unreadable file, then allows saving again. */
  continueAfterLoadProblem(): { ok: true } | { ok: false; error: string };
  /** Whether the saved workspace is unreadable and saving is paused, so this window holds only the fictional sample (#118). */
  loadProblem(): boolean;
}

export interface DesktopAppInfo {
  name: string;
  version: string;
  /** "unsigned private UAT build" or the signing status of this build. */
  build: string;
  /** Where the workspace, its backups and the local Claude connection record are kept. */
  dataFolder: string;
  platform: string;
  /** True on the first launch of this installation (nothing saved yet: no workspace file, previous copy or backup). */
  firstRun: boolean;
  /** A recovery made when the workspace was read at launch, described for the advisor; null when none. movedAside is the folder holding copies of the unreadable files. */
  recovery: { from: "previous" | "daily"; savedAt: string; movedAside: string | null } | null;
  /**
   * Saved files exist but none could be read (malformed, or reading failed). Nothing was changed on disk and
   * nothing is saved until the advisor restores a backup or chooses to start over. Null when there is no problem.
   */
  loadProblem: { folder: string; files: { name: string; kind: "malformed" | "read-failed" | "list-failed" }[] } | null;
  /** Whether this window's server answers with the labelled test provider instead of Claude. */
  testProvider: boolean;
}

export interface DesktopBridge {
  workspace: DesktopWorkspaceBridge;
  info(): DesktopAppInfo;
  /** Called when a queued save failed; returns an unsubscribe function. */
  onSaveProblem(cb: (error: string | null) => void): () => void;
  /**
   * Called when another Stratovell window saved a newer workspace ("other-window"), or when this page's own
   * change was refused because of it ("stale"). Returns an unsubscribe function.
   */
  onWorkspaceChanged(cb: (reason: "other-window" | "stale") => void): () => void;
}

// While the store reloads a workspace another window saved, it writes nothing back (Codex finding B).
let reloading = 0;

/**
 * In the desktop application, keeps this window's store in step with the
 * others: when another window saves a newer workspace, or this window's change
 * is refused as stale, `reload` reads the latest workspace without saving it back.
 */
export function followDesktopWorkspace(reload: () => unknown) {
  const desktop = desktopBridge();
  if (!desktop || typeof desktop.onWorkspaceChanged !== "function") return;
  desktop.onWorkspaceChanged(() => {
    reloading++;
    try {
      reload();
    } finally {
      reloading--;
    }
  });
}

/** The desktop bridge when running inside the Stratovell desktop application, else null. */
export function desktopBridge(): DesktopBridge | null {
  if (typeof window === "undefined") return null;
  const b = (window as unknown as { stratovellDesktop?: DesktopBridge }).stratovellDesktop;
  return b && typeof b.workspace?.read === "function" ? b : null;
}

/**
 * #118: whether this window's saved workspace couldn't be read (desktop only). While it can't, saving is paused and the
 * store holds the fictional sample, plus any edits that weren't saved, rather than the advisor's own workspace.
 */
export function desktopWorkspaceUnreadable(): boolean {
  const desktop = desktopBridge();
  return !!desktop && typeof desktop.workspace.loadProblem === "function" && desktop.workspace.loadProblem() === true;
}

/** The storage the store persists through: the desktop file for `key`, or the browser's localStorage. */
export function workspaceStorage(key: string): StateStorage | undefined {
  const desktop = desktopBridge();
  if (desktop)
    return {
      getItem: (name) => (name === key ? desktop.workspace.read() : null),
      setItem: (name, value) => {
        if (name === key && !reloading) desktop.workspace.write(value);
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
export function strictWorkspaceStorage(key: string): { get(): string | null; set(value: string): void; remove(): void; desktop: boolean } | null {
  const desktop = desktopBridge();
  if (desktop)
    return {
      desktop: true,
      // Re-review finding 1: the rollback copy is peeked, never read, so this window's revision stays tied to the
      // state the restore was prepared from, and a restore built from older state is refused as stale.
      get: () => (typeof desktop.workspace.peek === "function" ? desktop.workspace.peek() : null),
      set: (value) => {
        const r = desktop.workspace.writeNow(value);
        if (!r.ok) throw new Error(r.error);
      },
      remove: () => desktop.workspace.remove(),
    };
  if (typeof window === "undefined") return null;
  const ls = window.localStorage;
  return { desktop: false, get: () => ls.getItem(key), set: (value) => ls.setItem(key, value), remove: () => ls.removeItem(key) };
}
