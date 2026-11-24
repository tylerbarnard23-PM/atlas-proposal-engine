// The only bridge between Stratovell's pages and the desktop application (#116).
// It runs sandboxed with context isolation and exposes four workspace calls and
// the app's own information. No credential, key, file path choice or Node API
// reaches the page: the main process validates every call and answers only
// pages served by this app's own local server.

import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("stratovellDesktop", {
  workspace: {
    read: (): string | null => ipcRenderer.sendSync("stratovell:workspace:read"),
    write: (value: string): void => {
      if (typeof value === "string") ipcRenderer.send("stratovell:workspace:write", value);
    },
    writeNow: (value: string): { ok: true } | { ok: false; error: string } =>
      typeof value === "string" ? ipcRenderer.sendSync("stratovell:workspace:write-now", value) : { ok: false, error: "The workspace to save isn't valid." },
    remove: (): void => {
      ipcRenderer.sendSync("stratovell:workspace:remove");
    },
  },
  info: () => ipcRenderer.sendSync("stratovell:app:info"),
  onSaveProblem: (cb: (error: string | null) => void) => {
    if (typeof cb !== "function") return () => {};
    const handler = (_e: unknown, error: unknown) => cb(typeof error === "string" ? error : null);
    ipcRenderer.on("stratovell:workspace:save-problem", handler);
    return () => ipcRenderer.removeListener("stratovell:workspace:save-problem", handler);
  },
});
