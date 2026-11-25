// The only bridge between Stratovell's pages and the desktop application (#116).
// It runs sandboxed with context isolation and exposes the workspace calls and
// the app's own information (built in shared/bridgeClient.ts, which the tests
// drive directly). No credential, key, file path choice or Node API reaches the
// page: the main process validates every call and answers only pages served by
// this app's own local server.

import { contextBridge, ipcRenderer } from "electron";
import { createDesktopBridge } from "./shared/bridgeClient";

contextBridge.exposeInMainWorld("stratovellDesktop", createDesktopBridge(ipcRenderer));
