// The main-process side of the workspace bridge (#116). desktop/main.ts wires
// these handlers to Electron's ipcMain; the tests drive the same handlers
// through an in-memory IPC with a real workspace file. Node built-ins only.

import { SaveQueue, type ReadResult, type Recovery, type WorkspaceFileStore, type WriteResult } from "./workspaceFile";

export const WORKSPACE_CHANNELS = {
  read: "stratovell:workspace:read",
  write: "stratovell:workspace:write",
  writeNow: "stratovell:workspace:write-now",
  remove: "stratovell:workspace:remove",
  saveProblem: "stratovell:workspace:save-problem",
} as const;

/** Largest string accepted over the bridge (far above any real workspace). */
export const MAX_IPC_STRING = 64 * 1024 * 1024;

/** The parts of an Electron IPC event the handlers use. */
export interface IpcEventLike {
  sender: { id: number };
  senderFrame?: { url: string } | null;
  returnValue?: unknown;
}
export interface IpcMainLike {
  on(channel: string, listener: (e: IpcEventLike, ...args: unknown[]) => void): unknown;
}

type FileStore = Pick<WorkspaceFileStore, "read" | "write" | "remove">;

/** The workspace as the main process holds it: what was read at launch, the newest value, and the save queue. */
export class WorkspaceService {
  value: string | null = null;
  recovery: Recovery | null = null;
  firstRun = false;
  readonly queue: SaveQueue;

  constructor(
    readonly store: FileStore,
    opts: { delayMs?: number; onSaveResult?: (r: WriteResult) => void } = {}
  ) {
    this.queue = new SaveQueue(store, opts.delayMs ?? 300, opts.onSaveResult);
  }

  /** Reads the saved workspace at launch. */
  load(): ReadResult {
    const r = this.store.read();
    this.value = r.value;
    this.recovery = r.recovery;
    this.firstRun = r.value === null;
    return r;
  }

  read(): string | null {
    return this.value;
  }

  /** A change from a window: kept as the newest value and saved by the queue. */
  write(value: string) {
    this.value = value;
    this.queue.save(value);
  }

  /**
   * Saves at once (restore), reporting the outcome. Codex finding C: a change
   * still queued is written first (so the workspace being replaced becomes the
   * previous copy), and the queue is cleared only once the replacement is on
   * disk. A failed replacement leaves the earlier change saved or still queued
   * for the retry, never discarded.
   */
  writeNow(value: string): WriteResult {
    this.queue.flush();
    const r = this.store.write(value);
    if (!r.ok) return r;
    this.queue.clear();
    this.value = value;
    return r;
  }

  /** Removes the saved workspace; anything queued stays queued unless the removal succeeds. */
  remove(): boolean {
    const r = this.store.remove();
    if (!r.ok) return false;
    this.queue.clear();
    this.value = null;
    return true;
  }

  /** Writes anything queued (quit, retries). */
  flush(): WriteResult {
    return this.queue.flush();
  }
}

/**
 * Registers the workspace channels. `allowed` is the sender check (only the
 * app's own pages, in windows this process created); `onSaveProblem` reports
 * the outcome of a save made at once.
 */
export function registerWorkspaceIpc(
  ipc: IpcMainLike,
  service: WorkspaceService,
  opts: { allowed: (e: IpcEventLike) => boolean; onSaveProblem?: (error: string | null) => void }
) {
  const { allowed, onSaveProblem = () => {} } = opts;
  ipc.on(WORKSPACE_CHANNELS.read, (e) => {
    e.returnValue = allowed(e) ? service.read() : null;
  });
  ipc.on(WORKSPACE_CHANNELS.write, (e, value) => {
    if (!allowed(e) || typeof value !== "string" || value.length > MAX_IPC_STRING) return;
    service.write(value);
  });
  ipc.on(WORKSPACE_CHANNELS.writeNow, (e, value) => {
    if (!allowed(e)) return void (e.returnValue = { ok: false, error: "This page can't save the workspace." });
    if (typeof value !== "string" || value.length > MAX_IPC_STRING) return void (e.returnValue = { ok: false, error: "The workspace to save isn't valid." });
    const r = service.writeNow(value);
    onSaveProblem(r.ok ? null : r.error);
    e.returnValue = r;
  });
  ipc.on(WORKSPACE_CHANNELS.remove, (e) => {
    if (!allowed(e)) return void (e.returnValue = false);
    e.returnValue = service.remove();
  });
}
