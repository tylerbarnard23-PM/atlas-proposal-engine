// The page-side half of the workspace bridge (#116): the object the preload
// script exposes as window.stratovellDesktop. It is built from an IPC client so
// the tests can drive exactly this code. It must import nothing: the preload
// runs sandboxed, and only Electron's ipcRenderer is passed in.

export interface IpcRendererLike {
  sendSync(channel: string, ...args: unknown[]): unknown;
  send(channel: string, ...args: unknown[]): void;
  on(channel: string, listener: (e: unknown, ...args: unknown[]) => void): unknown;
  removeListener(channel: string, listener: (e: unknown, ...args: unknown[]) => void): unknown;
}

type SaveResult = { ok: true } | { ok: false; error: string };

export function createDesktopBridge(ipc: IpcRendererLike) {
  return {
    workspace: {
      read: (): string | null => ipc.sendSync("stratovell:workspace:read") as string | null,
      write: (value: string): void => {
        if (typeof value === "string") ipc.send("stratovell:workspace:write", value);
      },
      writeNow: (value: string): SaveResult =>
        typeof value === "string" ? (ipc.sendSync("stratovell:workspace:write-now", value) as SaveResult) : { ok: false, error: "The workspace to save isn't valid." },
      remove: (): void => {
        ipc.sendSync("stratovell:workspace:remove");
      },
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
  };
}
