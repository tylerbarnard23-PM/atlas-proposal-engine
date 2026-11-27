import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DAILY_BACKUPS_KEPT, SaveQueue, WorkspaceFileStore, workspaceProblem } from "../desktop/shared/workspaceFile";
import { loadSampleRecommendations } from "./support/sampleRecommendations";

// #116: the desktop application's workspace file. The workspace is the same
// saved string the browser keeps in localStorage, in a file under the user's
// application-data folder: written atomically, with the replaced copy and daily
// backups kept, and recovered from them when the current file can't be read.
// It never depends on which localhost port the app's server uses.

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "stratovell-ws-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const record = (n: number, extra: Record<string, unknown> = {}) => JSON.stringify({ state: { n, ...extra }, version: 11 });

describe("the workspace file", () => {
  it("saves and reads back exactly what the store wrote; a fresh installation has none", () => {
    const s = new WorkspaceFileStore(dir);
    expect(s.read()).toEqual({ status: "new", value: null, recovery: null, problems: [] });
    expect(s.write(record(1))).toEqual({ ok: true });
    expect(s.read()).toEqual({ status: "ok", value: record(1), recovery: null, problems: [] });
    // Only the file and its temporary siblings' absence: no temporary file is left behind.
    expect(readdirSync(dir).filter((f) => f.endsWith(".tmp"))).toEqual([]);
  });

  it("refuses anything that isn't a saved workspace, and keeps the current file", () => {
    const s = new WorkspaceFileStore(dir);
    s.write(record(1));
    for (const bad of ["", "{", "[]", JSON.stringify({ state: [] , version: 11 }), JSON.stringify({ state: {}, version: "11" }), 42 as unknown as string]) {
      const r = s.write(bad);
      expect(r.ok).toBe(false);
    }
    expect(s.read().value).toBe(record(1));
    expect(workspaceProblem(record(2))).toBeNull();
  });

  it("keeps the replaced copy, and the first save of each day as a dated backup (the newest 14)", () => {
    let now = new Date("2026-11-01T09:00:00Z");
    const s = new WorkspaceFileStore(dir, () => now);
    s.write(record(1));
    s.write(record(2));
    expect(readFileSync(s.previous, "utf8")).toBe(record(1));
    expect(readdirSync(s.backups)).toEqual(["workspace-2026-11-01.json"]);
    s.write(record(3));
    // Still the day's starting point, not the latest.
    expect(readFileSync(join(s.backups, "workspace-2026-11-01.json"), "utf8")).toBe(record(1));
    for (let d = 2; d <= 20; d++) {
      now = new Date(`2026-11-${String(d).padStart(2, "0")}T09:00:00Z`);
      s.write(record(100 + d));
    }
    const kept = readdirSync(s.backups).sort();
    expect(kept).toHaveLength(DAILY_BACKUPS_KEPT);
    expect(kept.at(-1)).toBe("workspace-2026-11-20.json");
  });

  it("recovers from an unreadable file: the previous copy is opened and restored, the unreadable file kept (copied aside), not deleted", () => {
    const s = new WorkspaceFileStore(dir, () => new Date("2026-11-24T12:00:00Z"));
    s.write(record(1));
    s.write(record(2));
    writeFileSync(s.file, '{"state": {"n": 3}, "vers'); // a write cut off mid-way (e.g. by a power loss on another tool)
    const r = s.read();
    expect(r.value).toBe(record(1));
    expect(r.recovery?.from).toBe("previous");
    expect(r.recovery?.movedAside).toMatch(/unreadable-2026-11-24T12-00-00-000Z$/);
    expect(readFileSync(join(r.recovery!.movedAside!, "workspace.json"), "utf8")).toContain('"vers');
    // The recovered copy is the current file again: the next launch reads it directly.
    expect(new WorkspaceFileStore(dir).read()).toEqual({ status: "ok", value: record(1), recovery: null, problems: [] });
  });

  it("falls back to the newest readable daily backup when the previous copy is unreadable too", () => {
    let now = new Date("2026-11-01T09:00:00Z");
    const s = new WorkspaceFileStore(dir, () => now);
    s.write(record(1));
    s.write(record(2)); // backup of 1 on 1 Nov
    now = new Date("2026-11-02T09:00:00Z");
    s.write(record(3)); // backup of 2 on 2 Nov
    writeFileSync(s.file, "garbage");
    writeFileSync(s.previous, "garbage");
    const r = s.read();
    expect(r.value).toBe(record(2));
    expect(r.recovery?.from).toBe("daily");
  });

  it("Reset keeps the previous copy and the backups", () => {
    const s = new WorkspaceFileStore(dir);
    s.write(record(1));
    expect(s.remove()).toEqual({ ok: true });
    expect(existsSync(s.file)).toBe(false);
    expect(readFileSync(s.previous, "utf8")).toBe(record(1));
  });
});

describe("the save queue", () => {
  it("coalesces rapid saves into one write of the newest value, and flush writes at once", () => {
    vi.useFakeTimers();
    try {
      const writes: string[] = [];
      const q = new SaveQueue({ write: (v) => (writes.push(v as string), { ok: true }) }, 300);
      q.save(record(1));
      q.save(record(2));
      q.save(record(3));
      expect(writes).toEqual([]);
      vi.advanceTimersByTime(300);
      expect(writes).toEqual([record(3)]);
      q.save(record(4));
      expect(q.flush()).toEqual({ ok: true });
      expect(writes).toEqual([record(3), record(4)]);
      expect(q.dirty).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a failed write is reported and kept for a retry", () => {
    let fail = true;
    const results: boolean[] = [];
    const writes: string[] = [];
    const q = new SaveQueue({ write: (v) => (fail ? { ok: false, error: "locked" } : (writes.push(v as string), { ok: true })) }, 300, (r) => results.push(r.ok));
    q.save(record(1));
    expect(q.flush()).toEqual({ ok: false, error: "locked" });
    expect(q.dirty).toBe(true);
    fail = false;
    expect(q.flush()).toEqual({ ok: true });
    expect(writes).toEqual([record(1)]);
    expect(results).toEqual([false, true]);
  });
});

// The store itself, persisting through the desktop bridge (as the preload exposes it) into a real workspace file.
describe("the store in the desktop application", () => {
  function installBridge(store: WorkspaceFileStore, opts: { failNow?: boolean } = {}) {
    let value = store.read().value;
    const bridge = {
      workspace: {
        read: () => value,
        write: (v: string) => {
          value = v;
          store.write(v);
        },
        writeNow: (v: string) => {
          if (opts.failNow) return { ok: false as const, error: "the disk is full" };
          const r = store.write(v);
          if (r.ok) value = v;
          return r;
        },
        remove: () => {
          value = null;
          store.remove();
        },
      },
      info: () => ({}),
      onSaveProblem: () => () => {},
    };
    // No localStorage at all: the desktop store must not need it.
    (globalThis as { window?: unknown }).window = { stratovellDesktop: bridge };
    return bridge;
  }

  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
    vi.resetModules();
  });

  it("saves to the file, and a relaunch (a fresh store, any port) opens the same workspace with origins and approved-version fingerprints", async () => {
    const files = new WorkspaceFileStore(dir);
    installBridge(files);
    const m = await import("@/store/useStore");
    loadSampleRecommendations(m.useAtlasStore);
    const s = m.useAtlasStore.getState();
    const rec = s.recommendations[0];
    s.upsertRecommendation({ ...rec, approvedByAdvisor: true, includeInPdf: true, status: "approved" });
    const before = m.useAtlasStore.getState();
    const saved = JSON.parse(files.read().value!);
    expect(saved.version).toBeGreaterThanOrEqual(11);
    expect(saved.state.recommendations.map((r: { id: string; origin?: unknown }) => [r.id, r.origin])).toEqual(before.recommendations.map((r) => [r.id, r.origin]));

    // Relaunch: a new process reads the file through the bridge; nothing depends on the server's origin or port.
    vi.resetModules();
    installBridge(new WorkspaceFileStore(dir));
    const again = await import("@/store/useStore");
    const after = again.useAtlasStore.getState();
    expect(after.hasHydrated).toBe(true);
    expect(after.client).toEqual(before.client);
    expect(after.recommendations).toEqual(before.recommendations);
    expect(after.snapshots).toEqual(before.snapshots);
  });

  it("restore saves to the file at once, and changes nothing when the save fails", async () => {
    const files = new WorkspaceFileStore(dir);
    installBridge(files);
    const m = await import("@/store/useStore");
    const backup = await import("@/engines/workspaceBackup");
    const { DISCLOSURE_LIBRARY } = await import("@/domain/disclosureLibrary");
    const ids = { disclosureIds: DISCLOSURE_LIBRARY.map((d) => d.id) };
    const NOW = new Date("2026-11-24T12:00:00Z");
    loadSampleRecommendations(m.useAtlasStore);
    const exported = backup.exportBackup(m.useAtlasStore.getState(), NOW, ids);
    if (!exported.ok) throw new Error(exported.errors.join("; "));
    const parsed = backup.parseBackup(exported.text, ids);
    if (!parsed.ok) throw new Error(parsed.errors.join("; "));

    m.useAtlasStore.getState().startNewClient();
    const restored = backup.restoredState(parsed.backup, m.useAtlasStore.getState(), { replaceFirm: false });
    expect(m.useAtlasStore.getState().restoreWorkspace(restored)).toEqual({ ok: true });
    const onDisk = JSON.parse(files.read().value!);
    expect(onDisk.state.recommendations.map((r: { id: string }) => r.id)).toEqual(m.useAtlasStore.getState().recommendations.map((r) => r.id));

    // A refused save leaves the workspace exactly as it was.
    vi.resetModules();
    installBridge(new WorkspaceFileStore(dir), { failNow: true });
    const m2 = await import("@/store/useStore");
    const was = m2.useAtlasStore.getState();
    m2.useAtlasStore.getState().startNewClient();
    const blank = m2.useAtlasStore.getState();
    const r = m2.useAtlasStore.getState().restoreWorkspace(restored);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("the disk is full");
    expect(m2.useAtlasStore.getState().recommendations).toEqual(blank.recommendations);
    expect(was.recommendations.length).toBeGreaterThan(0);
  });
});
