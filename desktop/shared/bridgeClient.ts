// The page-side half of the workspace bridge (#116): the object the preload
// script exposes as window.stratovellDesktop. It is built from an IPC client so
// the tests can drive exactly this code. It must import nothing: the preload
// runs sandboxed, and only Electron's ipcRenderer is passed in.
//
// Codex finding B: the bridge remembers the workspace revision this page last
// read and sends it with every change. When the main process refuses a change
// as stale, or says another window changed the workspace, the page's listeners
// are told, and the store reloads the latest workspace without writing it back.

export interface IpcRendererLike {
  sendSync(channel: string, ...args: unknown[]): unknown;
  send(channel: string, ...args: unknown[]): void;
  on(channel: string, listener: (e: unknown, ...args: unknown[]) => void): unknown;
  removeListener(channel: string, listener: (e: unknown, ...args: unknown[]) => void): unknown;
}

type SaveResult = { ok: true } | { ok: false; error: string };
type Ack = { ok: true; revision: number } | { ok: false; error: string; stale?: boolean; revision?: number };
/** "other-window": another window saved a newer workspace. "stale": this page's own change was refused because of it. */
export type WorkspaceChange = "other-window" | "stale";

export function createDesktopBridge(ipc: IpcRendererLike) {
  let revision = -1;
  const listeners = new Set<(reason: WorkspaceChange) => void>();
  const tell = (reason: WorkspaceChange) => listeners.forEach((l) => l(reason));
  const settle = (ack: unknown): Ack => {
    const a = (ack ?? { ok: false, error: "Stratovell didn't answer." }) as Ack;
    if (a.ok) revision = a.revision;
    else if (a.stale) tell("stale");
    return a;
  };
  ipc.on("stratovell:workspace:changed", (_e, newRevision) => {
    if (typeof newRevision === "number" && newRevision !== revision) tell("other-window");
  });

  return {
    workspace: {
      read: (): string | null => {
        const r = ipc.sendSync("stratovell:workspace:read") as { value: string | null; revision: number } | null;
        if (!r) return null;
        revision = r.revision;
        return r.value;
      },
      /**
       * The saved workspace text without adopting its revision: for a restore's rollback copy. Re-review finding 1:
       * reading it must not let a restore built from this page's older state pass as up to date.
       */
      peek: (): string | null => ipc.sendSync("stratovell:workspace:peek") as string | null,
      write: (value: string): void => {
        if (typeof value === "string") settle(ipc.sendSync("stratovell:workspace:write", value, revision));
      },
      writeNow: (value: string): SaveResult => {
        if (typeof value !== "string") return { ok: false, error: "The workspace to save isn't valid." };
        const a = settle(ipc.sendSync("stratovell:workspace:write-now", value, revision));
        return a.ok ? { ok: true } : { ok: false, error: a.error };
      },
      remove: (): void => {
        settle(ipc.sendSync("stratovell:workspace:remove", revision));
      },
      /** Whether the saved workspace is unreadable and saving is paused (#118). False for a page the app doesn't serve. */
      loadProblem: (): boolean => (ipc.sendSync("stratovell:workspace:status") as { loadProblem?: unknown } | null)?.loadProblem === true,
      /** After a load problem: keeps the unreadable files aside, then allows saving again. */
      continueAfterLoadProblem: (): SaveResult => ipc.sendSync("stratovell:workspace:continue-after-load-problem") as SaveResult,
    },
    info: () => ipc.sendSync("stratovell:app:info"),
    onSaveProblem: (cb: (error: string | null) => void) => {
      if (typeof cb !== "function") return () => {};
      const handler = (_e: unknown, error: unknown) => cb(typeof error === "string" ? error : null);
      ipc.on("stratovell:workspace:save-problem", handler);
      return () => void ipc.removeListener("stratovell:workspace:save-problem", handler);
    },
    /** Called when another window saved a newer workspace, or this page's change was refused as stale; returns an unsubscribe function. */
    onWorkspaceChanged: (cb: (reason: WorkspaceChange) => void) => {
      if (typeof cb !== "function") return () => {};
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
  };
}
