// The main-process side of the workspace bridge (#116). desktop/main.ts wires
// these handlers to Electron's ipcMain; the tests drive the same handlers
// through an in-memory IPC with a real workspace file. Node built-ins only.

import { SaveQueue, type LoadProblem, type ReadResult, type Recovery, type WorkspaceFileStore, type WriteResult } from "./workspaceFile";

export const WORKSPACE_CHANNELS = {
  read: "stratovell:workspace:read",
  write: "stratovell:workspace:write",
  writeNow: "stratovell:workspace:write-now",
  remove: "stratovell:workspace:remove",
  continueAfterLoadProblem: "stratovell:workspace:continue-after-load-problem",
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

type FileStore = Pick<WorkspaceFileStore, "read" | "write" | "remove" | "keepAside">;

const BLOCKED = "Stratovell couldn't read your saved workspace, so it saves nothing until you choose how to continue.";

/** The workspace as the main process holds it: what was read at launch, the newest value, and the save queue. */
export class WorkspaceService {
  value: string | null = null;
  recovery: Recovery | null = null;
  firstRun = false;
  /** Set when saved files exist but none could be read (Codex finding A): saves are refused until the advisor chooses. */
  loadProblem: { problems: LoadProblem[] } | null = null;
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
    this.firstRun = r.status === "new";
    this.loadProblem = r.status === "unreadable" ? { problems: r.problems } : null;
    return r;
  }

  read(): string | null {
    return this.value;
  }

  /** A change from a window: kept as the newest value and saved by the queue. Refused while the load problem is open. */
  write(value: string): WriteResult {
    if (this.loadProblem) return { ok: false, error: BLOCKED };
    this.value = value;
    this.queue.save(value);
    return { ok: true };
  }

  /**
   * The advisor's explicit choice after a load problem: every unreadable file is
   * kept in unreadable-<time>/ first; only then are saves accepted again.
   */
  continueAfterLoadProblem(): WriteResult {
    if (!this.loadProblem) return { ok: true };
    const kept = this.store.keepAside(this.loadProblem.problems.map((p) => p.file));
    if (!kept.ok) return kept;
    this.loadProblem = null;
    return { ok: true };
  }

  /**
   * Saves at once (restore), reporting the outcome. Codex finding C: a change
   * still queued is written first (so the workspace being replaced becomes the
   * previous copy), and the queue is cleared only once the replacement is on
   * disk. A failed replacement leaves the earlier change saved or still queued
   * for the retry, never discarded.
   */
  writeNow(value: string): WriteResult {
    // Restoring a backup is an explicit choice too: the unreadable files are kept first.
    if (this.loadProblem) {
      const c = this.continueAfterLoadProblem();
      if (!c.ok) return c;
    }
    this.queue.flush();
    const r = this.store.write(value);
    if (!r.ok) return r;
    this.queue.clear();
    this.value = value;
    return r;
  }

  /** Removes the saved workspace; anything queued stays queued unless the removal succeeds. */
  remove(): boolean {
    if (this.loadProblem) return false;
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
  ipc.on(WORKSPACE_CHANNELS.continueAfterLoadProblem, (e) => {
    if (!allowed(e)) return void (e.returnValue = { ok: false, error: "This page can't change the workspace." });
    e.returnValue = service.continueAfterLoadProblem();
  });
}
