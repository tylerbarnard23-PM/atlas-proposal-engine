import { createDesktopBridge, type IpcRendererLike } from "../../desktop/shared/bridgeClient";
import type { IpcEventLike, IpcMainLike } from "../../desktop/shared/workspaceIpc";

// An in-memory stand-in for Electron's IPC (#116), so tests drive the real
// main-process handlers (desktop/shared/workspaceIpc.ts) and the real page-side
// bridge (desktop/shared/bridgeClient.ts, exactly what the preload exposes).
// Only the transport is replaced; Electron itself is never started.
//
// Messages from the main process to a window (save problems, "the workspace
// changed") are delivered at once, or held for a window until `deliver(id)`,
// which models a window that hasn't processed its IPC queue yet.

type Listener = (e: unknown, ...args: unknown[]) => void;

export const APP_URL = "http://127.0.0.1:47613/";

export function ipcHub() {
  const handlers = new Map<string, (e: IpcEventLike, ...args: unknown[]) => void>();
  const main: IpcMainLike = {
    on(channel, listener) {
      handlers.set(channel, listener);
    },
  };
  const windows = new Map<number, { listeners: Map<string, Set<Listener>>; held: boolean; queue: [string, unknown[]][] }>();
  let nextId = 1;

  function dispatch(id: number, channel: string, args: unknown[]) {
    windows.get(id)?.listeners.get(channel)?.forEach((l) => l({}, ...args));
  }

  /** A new window (a page served from `url`) with its own bridge. */
  function connect(url = APP_URL) {
    const id = nextId++;
    const w = { listeners: new Map<string, Set<Listener>>(), held: false, queue: [] as [string, unknown[]][] };
    windows.set(id, w);
    const call = (channel: string, args: unknown[]) => {
      const e: IpcEventLike = { sender: { id }, senderFrame: { url } };
      const h = handlers.get(channel);
      if (!h) throw new Error(`no handler for ${channel}`);
      h(e, ...args);
      return e.returnValue;
    };
    const renderer: IpcRendererLike = {
      sendSync: (channel, ...args) => call(channel, args),
      send: (channel, ...args) => void call(channel, args),
      on: (channel, l) => {
        if (!w.listeners.has(channel)) w.listeners.set(channel, new Set());
        w.listeners.get(channel)!.add(l);
      },
      removeListener: (channel, l) => w.listeners.get(channel)?.delete(l),
    };
    return {
      id,
      bridge: createDesktopBridge(renderer),
      /** Hold main-process messages to this window until `deliver()`. */
      hold() {
        w.held = true;
      },
      deliver() {
        w.held = false;
        for (const [channel, args] of w.queue.splice(0)) dispatch(id, channel, args);
      },
    };
  }

  /** Sends a main-process message to one window (as webContents.send does). */
  function sendTo(id: number, channel: string, ...args: unknown[]) {
    const w = windows.get(id);
    if (!w) return;
    if (w.held) w.queue.push([channel, args]);
    else dispatch(id, channel, args);
  }

  return { main, connect, sendTo, windowIds: () => [...windows.keys()] };
}
