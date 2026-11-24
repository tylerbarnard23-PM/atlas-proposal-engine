// The desktop application's workspace file (#116). The browser build keeps the
// workspace in localStorage; the desktop build keeps the same saved string, as
// zustand's persist middleware writes it ({"state": …, "version": n}), in a file
// under the user's application-data folder, outside the installation folder.
// So the workspace never depends on which localhost port the app happens to use,
// and survives relaunches, port changes and upgrades.
//
// Every save is atomic: written to a temporary file, flushed to disk, then
// renamed over the current file. The copy it replaces is kept as
// workspace.previous.json, and the first save of each day also keeps a dated
// copy in backups/ (the newest 14 are kept). Reading falls back from the
// current file to the previous copy and then to the newest dated copy; an
// unreadable file is moved aside (never deleted) and the recovery is reported.
//
// Node built-ins only: the Electron main process bundles this module, and the
// tests drive it directly. It never holds an API key: keys stay in the OS
// credential store or in the server's memory (see src/copilot/credentialStore.ts).

import { closeSync, copyFileSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

export const WORKSPACE_FILE = "workspace.json";
export const PREVIOUS_FILE = "workspace.previous.json";
export const BACKUP_DIR = "backups";
export const DAILY_BACKUPS_KEPT = 14;
/** Far above any real workspace (the largest fixture is well under 1 MB); refuses runaway input instead of filling the disk. */
export const MAX_WORKSPACE_BYTES = 64 * 1024 * 1024;

export type Recovery = { from: "previous" | "daily"; file: string; savedAt: string; movedAside: string | null };
export type ReadResult = { value: string | null; recovery: Recovery | null };
export type WriteResult = { ok: true } | { ok: false; error: string };

/** Why a saved string isn't a workspace persist record, or null when it is one. */
export function workspaceProblem(value: unknown): string | null {
  if (typeof value !== "string") return "The workspace to save isn't text.";
  if (Buffer.byteLength(value, "utf8") > MAX_WORKSPACE_BYTES) return `The workspace is larger than ${MAX_WORKSPACE_BYTES / 1024 / 1024} MB, so it wasn't saved.`;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return "The workspace to save isn't valid JSON.";
  }
  const p = parsed as { state?: unknown; version?: unknown } | null;
  if (!p || typeof p !== "object" || Array.isArray(p)) return "The workspace to save isn't a saved workspace.";
  if (!p.state || typeof p.state !== "object" || Array.isArray(p.state)) return "The workspace to save has no state.";
  if (typeof p.version !== "number" || !Number.isInteger(p.version)) return "The workspace to save has no version.";
  return null;
}

const dayOf = (d: Date) => d.toISOString().slice(0, 10);

export class WorkspaceFileStore {
  readonly file: string;
  readonly previous: string;
  readonly backups: string;

  constructor(readonly dir: string, private readonly now: () => Date = () => new Date()) {
    this.file = join(dir, WORKSPACE_FILE);
    this.previous = join(dir, PREVIOUS_FILE);
    this.backups = join(dir, BACKUP_DIR);
  }

  /** The text of `file` when it is a readable workspace record, else null. */
  private readValid(file: string): string | null {
    if (!existsSync(file)) return null;
    try {
      const text = readFileSync(file, "utf8");
      return workspaceProblem(text) ? null : text;
    } catch {
      return null;
    }
  }

  private dailyCopies(): string[] {
    if (!existsSync(this.backups)) return [];
    return readdirSync(this.backups)
      .filter((n) => /^workspace-\d{4}-\d{2}-\d{2}\.json$/.test(n))
      .sort()
      .reverse()
      .map((n) => join(this.backups, n));
  }

  /**
   * The saved workspace, or null when there is none yet. An unreadable current
   * file is moved aside (workspace.unreadable-<time>.json) and the newest
   * readable copy is returned with a description of the recovery.
   */
  read(): ReadResult {
    const current = this.readValid(this.file);
    if (current !== null) return { value: current, recovery: null };
    const hadFile = existsSync(this.file);
    const candidates: { from: Recovery["from"]; file: string }[] = [{ from: "previous", file: this.previous }, ...this.dailyCopies().map((file) => ({ from: "daily" as const, file }))];
    for (const c of candidates) {
      const text = this.readValid(c.file);
      if (text === null) continue;
      let movedAside: string | null = null;
      if (hadFile) {
        movedAside = join(this.dir, `workspace.unreadable-${this.now().toISOString().replace(/[:.]/g, "-")}.json`);
        try {
          renameSync(this.file, movedAside);
        } catch {
          movedAside = null;
        }
      }
      // Restore the recovered copy as the current file, so the next launch reads it directly.
      try {
        this.writeAtomic(this.file, text);
      } catch {
        /* it is still returned; the next save writes the file */
      }
      return { value: text, recovery: { from: c.from, file: c.file, savedAt: statSync(c.file).mtime.toISOString(), movedAside } };
    }
    return { value: null, recovery: null };
  }

  /** Saves the workspace atomically, keeping the copy it replaces. Refuses anything that isn't a workspace record. */
  write(value: unknown): WriteResult {
    const problem = workspaceProblem(value);
    if (problem) return { ok: false, error: problem };
    try {
      mkdirSync(this.dir, { recursive: true });
      if (this.readValid(this.file) !== null) {
        copyFileSync(this.file, this.previous);
        this.keepDailyCopy();
      }
      this.writeAtomic(this.file, value as string);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: `Stratovell couldn't save the workspace to ${this.dir} (${(err as Error).message}).` };
    }
  }

  /** Removes the saved workspace (Reset everything), keeping the previous copy and the dated backups. */
  remove(): WriteResult {
    try {
      if (existsSync(this.file)) {
        copyFileSync(this.file, this.previous);
        rmSync(this.file, { force: true });
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: `Stratovell couldn't clear the saved workspace (${(err as Error).message}).` };
    }
  }

  /** The first save of each day keeps the day's starting point; older dated copies beyond the newest 14 are removed. */
  private keepDailyCopy() {
    const target = join(this.backups, `workspace-${dayOf(this.now())}.json`);
    if (existsSync(target)) return;
    mkdirSync(this.backups, { recursive: true });
    copyFileSync(this.file, target);
    for (const old of this.dailyCopies().slice(DAILY_BACKUPS_KEPT)) rmSync(old, { force: true });
  }

  private writeAtomic(file: string, text: string) {
    mkdirSync(this.dir, { recursive: true });
    const tmp = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
    const fd = openSync(tmp, "w", 0o600);
    try {
      writeSync(fd, text, null, "utf8");
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    for (let i = 0; ; i++) {
      try {
        renameSync(tmp, file);
        return;
      } catch (err) {
        // Windows can briefly refuse to replace a file another program (an indexer, an antivirus scan) has open.
        if (i >= 20) {
          rmSync(tmp, { force: true });
          throw err;
        }
        const until = Date.now() + 15;
        while (Date.now() < until) {
          /* brief wait before retrying the rename */
        }
      }
    }
  }
}

/**
 * Coalesces frequent saves (zustand writes on every change) into at most one
 * file write per `delayMs`, always writing the newest value. `flush()` writes
 * anything pending at once (quit, before a restore). A failed write is reported
 * through `onResult` and the value stays pending, so the next save or flush retries it.
 */
export class SaveQueue {
  private pending: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly store: Pick<WorkspaceFileStore, "write">,
    private readonly delayMs = 300,
    private readonly onResult: (r: WriteResult) => void = () => {}
  ) {}

  save(value: string) {
    this.pending = value;
    if (!this.timer) this.timer = setTimeout(() => this.flush(), this.delayMs);
  }

  /** Whether a value is waiting to be written. */
  get dirty() {
    return this.pending !== null;
  }

  flush(): WriteResult {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.pending === null) return { ok: true };
    const value = this.pending;
    const r = this.store.write(value);
    // Keep the value for a retry unless a newer one arrived meanwhile (writes are synchronous, so none can).
    if (r.ok && this.pending === value) this.pending = null;
    this.onResult(r);
    return r;
  }

  /** Drops anything pending (used when the saved workspace is removed). */
  clear() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.pending = null;
  }
}
