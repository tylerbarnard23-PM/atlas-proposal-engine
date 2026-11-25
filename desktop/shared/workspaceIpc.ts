// The main-process side of the workspace bridge (#116). desktop/main.ts wires
// these handlers to Electron's ipcMain; the tests drive the same handlers
// through an in-memory IPC with a real workspace file. Node built-ins only.
//
// Codex finding B: every window holds a whole copy of the workspace, so each
// change carries the revision its window last read. A change based on an older
// revision is refused (that window reloads the latest and says so), an
// unchanged write is a no-op, and after an accepted change the other windows
// are told to reload, which they do without writing anything back.

import { filesToKeep, SaveQueue, type LoadProblem, type ReadResult, type Recovery, type WorkspaceFileStore, type WriteResult } from "./workspaceFile";

export const WORKSPACE_CHANNELS = {
  read: "stratovell:workspace:read",
  peek: "stratovell:workspace:peek",
  write: "stratovell:workspace:write",
  writeNow: "stratovell:workspace:write-now",
  remove: "stratovell:workspace:remove",
  continueAfterLoadProblem: "stratovell:workspace:continue-after-load-problem",
  saveProblem: "stratovell:workspace:save-problem",
  changed: "stratovell:workspace:changed",
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
const STALE = "Another Stratovell window changed the workspace first.";
const STALE_RESTORE = "Another Stratovell window changed the workspace a moment ago, so nothing was restored. This window now shows the latest workspace; try again.";

/** The main process's answer to a change: accepted (with the new revision), or refused. */
export type WorkspaceAck = { ok: true; revision: number; changed: boolean } | { ok: false; error: string; stale: boolean; revision: number };

/** The workspace as the main process holds it: what was read at launch, the newest value and its revision, and the save queue. */
export class WorkspaceService {
  value: string | null = null;
  /** Counts accepted changes since launch. A window's change must be based on the current revision. */
  revision = 0;
  recovery: Recovery | null = null;
  firstRun = false;
  /**
   * Set when saved files exist but none could be read (Codex finding A): saves are refused until the advisor's
   * choice succeeds. keptIn: the folder the unreadable files were already copied to (undefined until then).
   */
  loadProblem: { problems: LoadProblem[]; keptIn?: string | null } | null = null;
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

  read(): { value: string | null; revision: number } {
    return { value: this.value, revision: this.revision };
  }

  private refused(error: string, stale = false): WorkspaceAck {
    return { ok: false, error, stale, revision: this.revision };
  }
  private accepted(changed: boolean): WorkspaceAck {
    return { ok: true, revision: this.revision, changed };
  }

  /**
   * A change from a window, based on revision `base`: kept as the newest value
   * and saved by the queue. An unchanged value is a no-op; a change based on an
   * older revision is refused. Refused while the load problem is open.
   */
  write(value: string, base: unknown): WorkspaceAck {
    if (this.loadProblem) return this.refused(BLOCKED);
    if (value === this.value) return this.accepted(false);
    if (base !== this.revision) return this.refused(STALE, true);
    this.value = value;
    this.revision++;
    this.queue.save(value);
    return this.accepted(true);
  }

  /**
   * The advisor's explicit choice after a load problem: every unreadable file is
   * kept in unreadable-<time>/ first; only then are saves accepted again.
   */
  continueAfterLoadProblem(): WriteResult {
    if (!this.loadProblem) return { ok: true };
    const kept = this.keepUnreadable();
    if (!kept.ok) return kept;
    this.loadProblem = null;
    return { ok: true };
  }

  /** Copies the unreadable files aside once; later attempts (a retried restore) reuse that folder. The problem stays open. */
  private keepUnreadable(): WriteResult {
    const p = this.loadProblem;
    if (!p || p.keptIn !== undefined) return { ok: true };
    const kept = this.store.keepAside(filesToKeep(p.problems));
    if (!kept.ok) return kept;
    p.keptIn = kept.folder;
    return { ok: true };
  }

  /**
   * Saves at once (restore), reporting the outcome. Codex finding C: a change
   * still queued is written first (so the workspace being replaced becomes the
   * previous copy), and the queue is cleared only once the replacement is on
   * disk. A failed replacement leaves the earlier change saved or still queued
   * for the retry, never discarded. A restore from a window that hasn't seen the
   * latest change is refused (finding B).
   */
  writeNow(value: string, base: unknown): WorkspaceAck {
    if (base !== this.revision && value !== this.value) return this.refused(STALE_RESTORE, true);
    // Restoring a backup is an explicit choice too: the unreadable files are kept first. Re-review finding 2: the
    // load problem stays open (saving blocked, the recovery notice up) until the replacement is actually on disk.
    if (this.loadProblem) {
      const kept = this.keepUnreadable();
      if (!kept.ok) return this.refused(kept.error);
    }
    this.queue.flush();
    const r = this.store.write(value);
    if (!r.ok) return this.refused(r.error);
    this.loadProblem = null;
    this.queue.clear();
    const changed = value !== this.value;
    this.value = value;
    if (changed) this.revision++;
    return this.accepted(changed);
  }

  /** Removes the saved workspace; anything queued stays queued unless the removal succeeds. */
  remove(base: unknown): WorkspaceAck {
    if (this.loadProblem) return this.refused(BLOCKED);
    if (base !== this.revision) return this.refused(STALE, true);
    const r = this.store.remove();
    if (!r.ok) return this.refused(r.error);
    this.queue.clear();
    this.value = null;
    this.revision++;
    return this.accepted(true);
  }

  /** Writes anything queued (quit, retries). */
  flush(): WriteResult {
    return this.queue.flush();
  }
}

/**
 * Registers the workspace channels. `allowed` is the sender check (only the
 * app's own pages, in windows this process created); `onSaveProblem` reports
 * the outcome of a save made at once; `broadcast` sends a message to every
 * window except the sender (Electron's webContents.send).
 */
export function registerWorkspaceIpc(
  ipc: IpcMainLike,
  service: WorkspaceService,
  opts: {
    allowed: (e: IpcEventLike) => boolean;
    onSaveProblem?: (error: string | null) => void;
    broadcast?: (exceptSender: number, channel: string, ...args: unknown[]) => void;
  }
) {
  const { allowed, onSaveProblem = () => {}, broadcast = () => {} } = opts;
  const answer = (e: IpcEventLike, ack: WorkspaceAck) => {
    if (ack.ok && ack.changed) broadcast(e.sender.id, WORKSPACE_CHANNELS.changed, ack.revision);
    e.returnValue = ack;
  };
  const notAllowed = (error: string): WorkspaceAck => ({ ok: false, error, stale: false, revision: service.revision });
  ipc.on(WORKSPACE_CHANNELS.read, (e) => {
    e.returnValue = allowed(e) ? service.read() : null;
  });
  // The saved value only, for a restore's rollback copy: it never moves the window's revision (re-review finding 1).
  ipc.on(WORKSPACE_CHANNELS.peek, (e) => {
    e.returnValue = allowed(e) ? service.value : null;
  });
  ipc.on(WORKSPACE_CHANNELS.write, (e, value, base) => {
    if (!allowed(e)) return void (e.returnValue = notAllowed("This page can't save the workspace."));
    if (typeof value !== "string" || value.length > MAX_IPC_STRING) return void (e.returnValue = notAllowed("The workspace to save isn't valid."));
    answer(e, service.write(value, base));
  });
  ipc.on(WORKSPACE_CHANNELS.writeNow, (e, value, base) => {
    if (!allowed(e)) return void (e.returnValue = notAllowed("This page can't save the workspace."));
    if (typeof value !== "string" || value.length > MAX_IPC_STRING) return void (e.returnValue = notAllowed("The workspace to save isn't valid."));
    const ack = service.writeNow(value, base);
    if (!ack.ok && ack.stale) return answer(e, ack);
    onSaveProblem(ack.ok ? null : ack.error);
    answer(e, ack);
  });
  ipc.on(WORKSPACE_CHANNELS.remove, (e, base) => {
    if (!allowed(e)) return void (e.returnValue = notAllowed("This page can't change the workspace."));
    answer(e, service.remove(base));
  });
  ipc.on(WORKSPACE_CHANNELS.continueAfterLoadProblem, (e) => {
    if (!allowed(e)) return void (e.returnValue = { ok: false, error: "This page can't change the workspace." });
    e.returnValue = service.continueAfterLoadProblem();
  });
}
