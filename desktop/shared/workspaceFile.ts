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
// current file to the previous copy and then to the newest dated copy; every
// unreadable file met on the way is first kept in unreadable-<time>/ (never
// deleted) and the recovery is reported.
//
// Codex finding A: when files exist but none can be read, reading reports
// "unreadable", not a new installation, and changes nothing on disk. The main
// process then refuses saves until the advisor chooses how to continue
// (desktop/shared/workspaceIpc.ts).
//
// Node built-ins only: the Electron main process bundles this module, and the
// tests drive it directly. It never holds an API key: keys stay in the OS
// credential store or in the server's memory (see src/copilot/credentialStore.ts).

import { closeSync, copyFileSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeSync } from "node:fs";
import { basename, join } from "node:path";
import { randomBytes } from "node:crypto";

export const WORKSPACE_FILE = "workspace.json";
export const PREVIOUS_FILE = "workspace.previous.json";
export const BACKUP_DIR = "backups";
export const DAILY_BACKUPS_KEPT = 14;
/** Far above any real workspace (the largest fixture is well under 1 MB); refuses runaway input instead of filling the disk. */
export const MAX_WORKSPACE_BYTES = 64 * 1024 * 1024;

/** movedAside: the unreadable-<time> folder holding copies of the unreadable files met first, or null when there were none. */
export type Recovery = { from: "previous" | "daily"; file: string; savedAt: string; movedAside: string | null };
/** Why one saved file couldn't be used: its content isn't a workspace record, or reading it failed. */
export type LoadProblem = { file: string; kind: "malformed" | "read-failed"; detail: string };
/**
 * new: nothing has been saved yet (no workspace file, previous copy or dated backup).
 * ok: a workspace was read, perhaps recovered from a copy.
 * unreadable: saved files exist but none can be read; nothing was changed on disk.
 */
export type ReadResult =
  | { status: "new"; value: null; recovery: null; problems: [] }
  | { status: "ok"; value: string; recovery: Recovery | null; problems: LoadProblem[] }
  | { status: "unreadable"; value: null; recovery: null; problems: LoadProblem[] };
export type KeepResult = { ok: true; folder: string | null } | { ok: false; error: string };
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
    const r = this.inspect(file);
    return r.state === "ok" ? r.text : null;
  }

  /** Whether `file` is missing, a readable workspace record, or present but unusable (and why). */
  private inspect(file: string): { state: "missing" } | { state: "ok"; text: string } | { state: "bad"; problem: LoadProblem } {
    if (!existsSync(file)) return { state: "missing" };
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch (err) {
      return { state: "bad", problem: { file, kind: "read-failed", detail: (err as NodeJS.ErrnoException).code ?? (err as Error).message } };
    }
    const problem = workspaceProblem(text);
    return problem ? { state: "bad", problem: { file, kind: "malformed", detail: problem } } : { state: "ok", text };
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
   * The saved workspace. Falls back from the current file to the previous copy
   * and then to the newest readable dated copy; the unreadable files met first
   * are kept in unreadable-<time>/ before the recovered copy becomes the current
   * file. When files exist but none is readable, nothing on disk is changed and
   * the result is "unreadable", never "new".
   */
  read(): ReadResult {
    const candidates: { from: "current" | Recovery["from"]; file: string }[] = [
      { from: "current", file: this.file },
      { from: "previous", file: this.previous },
      ...this.dailyCopies().map((file) => ({ from: "daily" as const, file })),
    ];
    const problems: LoadProblem[] = [];
    for (const c of candidates) {
      const r = this.inspect(c.file);
      if (r.state === "missing") continue;
      if (r.state === "bad") {
        problems.push(r.problem);
        continue;
      }
      if (c.from === "current") return { status: "ok", value: r.text, recovery: null, problems: [] };
      // Recovering: keep every unreadable file first. If that fails, nothing is replaced.
      const kept = this.keepAside(problems.map((p) => p.file));
      if (!kept.ok) return { status: "unreadable", value: null, recovery: null, problems: [...problems, { file: c.file, kind: "read-failed", detail: kept.error }] };
      // The recovered copy becomes the current file, so the next launch reads it directly.
      try {
        this.writeAtomic(this.file, r.text);
      } catch {
        /* it is still returned; the next save writes the file */
      }
      return { status: "ok", value: r.text, recovery: { from: c.from, file: c.file, savedAt: statSync(c.file).mtime.toISOString(), movedAside: kept.folder }, problems };
    }
    return problems.length ? { status: "unreadable", value: null, recovery: null, problems } : { status: "new", value: null, recovery: null, problems: [] };
  }

  /**
   * Keeps the given files in a new unreadable-<time>/ folder: copied, or moved
   * when they can't even be read (moving needs no read access). Never deletes.
   */
  keepAside(files: string[]): KeepResult {
    if (!files.length) return { ok: true, folder: null };
    const stamp = this.now().toISOString().replace(/[:.]/g, "-");
    let folder = join(this.dir, `unreadable-${stamp}`);
    for (let i = 2; existsSync(folder); i++) folder = join(this.dir, `unreadable-${stamp}-${i}`);
    try {
      mkdirSync(folder, { recursive: true });
    } catch (err) {
      return { ok: false, error: `Stratovell couldn't create ${folder} to keep the unreadable files (${(err as Error).message}).` };
    }
    for (const file of files) {
      const target = join(folder, basename(file));
      try {
        copyFileSync(file, target);
      } catch {
        try {
          renameSync(file, target);
        } catch (err) {
          return { ok: false, error: `Stratovell couldn't keep a copy of ${file} (${(err as Error).message}), so it changed nothing.` };
        }
      }
    }
    return { ok: true, folder };
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
