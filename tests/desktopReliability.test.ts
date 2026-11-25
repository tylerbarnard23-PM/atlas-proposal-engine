import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WorkspaceFileStore, type WriteResult } from "../desktop/shared/workspaceFile";
import { registerWorkspaceIpc, WorkspaceService } from "../desktop/shared/workspaceIpc";
import { ipcHub } from "./support/desktopIpc";

// #116, Codex's review of fd2db60 (not approved): regressions for findings A–D.
// They drive the real main-process handlers and the real preload bridge over an
// in-memory IPC, with a real workspace file and, where it matters, the real store.

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "stratovell-rel-"));
});
afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
  vi.resetModules();
  rmSync(dir, { recursive: true, force: true });
});

const record = (n: number, extra: Record<string, unknown> = {}) => JSON.stringify({ state: { n, ...extra }, version: 11 });

/** A real workspace file whose disk can be made to refuse writes. */
function failingDisk(files: WorkspaceFileStore) {
  const disk = { full: false };
  const store = {
    read: () => files.read(),
    write: (v: unknown): WriteResult => (disk.full ? { ok: false, error: "the disk is full" } : files.write(v)),
    remove: () => files.remove(),
    keepAside: (list: string[]) => files.keepAside(list),
  };
  return { disk, store };
}

function desktop(store: ConstructorParameters<typeof WorkspaceService>[0]) {
  const service = new WorkspaceService(store, { delayMs: 60_000 });
  service.load();
  const hub = ipcHub();
  registerWorkspaceIpc(hub.main, service, { allowed: () => true });
  return { service, hub };
}

describe("C. a failed restore keeps the earlier unsaved workspace", () => {
  it("the save-now handler, with a change still queued: a refused restore leaves that change waiting, and it is saved once the disk recovers", () => {
    const files = new WorkspaceFileStore(dir);
    files.write(record(1));
    const { disk, store } = failingDisk(files);
    const { service, hub } = desktop(store);
    const w = hub.connect();
    w.bridge.workspace.write(record(2)); // the advisor's latest change, not yet on disk
    expect(service.queue.dirty).toBe(true);
    disk.full = true;
    const r = w.bridge.workspace.writeNow(record(3)); // restore a backup
    expect(r.ok).toBe(false);
    expect(service.queue.dirty).toBe(true);
    expect(w.bridge.workspace.read()).toBe(record(2));
    disk.full = false;
    expect(service.flush()).toEqual({ ok: true });
    expect(files.read().value).toBe(record(2));
  });

  it("a restore refused for its own content saves the earlier change first, so nothing is lost", () => {
    const files = new WorkspaceFileStore(dir);
    files.write(record(1));
    const { service, hub } = desktop(files);
    const w = hub.connect();
    w.bridge.workspace.write(record(2));
    const r = w.bridge.workspace.writeNow(JSON.stringify({ state: [], version: 11 }));
    expect(r.ok).toBe(false);
    service.flush();
    expect(files.read().value).toBe(record(2));
  });

  it("a successful restore replaces the queued change, which is kept as the previous copy", () => {
    const files = new WorkspaceFileStore(dir);
    files.write(record(1));
    const { service, hub } = desktop(files);
    const w = hub.connect();
    w.bridge.workspace.write(record(2));
    expect(w.bridge.workspace.writeNow(record(3)).ok).toBe(true);
    expect(service.queue.dirty).toBe(false);
    expect(files.read().value).toBe(record(3));
    expect(new WorkspaceFileStore(dir).read().value).toBe(record(3));
    expect(JSON.parse(readFileSync(files.previous, "utf8")).state.n).toBe(2);
  });

  it("the store: a restore that can't be saved changes nothing, and the advisor's unsaved edit still reaches the file", async () => {
    const files = new WorkspaceFileStore(dir);
    const { disk, store } = failingDisk(files);
    const { service, hub } = desktop(store);
    const w = hub.connect();
    (globalThis as { window?: unknown }).window = { stratovellDesktop: w.bridge };
    const m = await import("@/store/useStore");
    const backup = await import("@/engines/workspaceBackup");
    const { DISCLOSURE_LIBRARY } = await import("@/domain/disclosureLibrary");
    const ids = { disclosureIds: DISCLOSURE_LIBRARY.map((d) => d.id) };
    const exported = backup.exportBackup(m.useAtlasStore.getState(), new Date("2026-11-25T12:00:00Z"), ids);
    if (!exported.ok) throw new Error(exported.errors.join("; "));
    const parsed = backup.parseBackup(exported.text, ids);
    if (!parsed.ok) throw new Error(parsed.errors.join("; "));
    service.flush();

    m.useAtlasStore.getState().setClient({ fullName: "Unsaved Edit Household" }); // queued, not yet written
    disk.full = true;
    const restored = backup.restoredState(parsed.backup, m.useAtlasStore.getState(), { replaceFirm: false });
    const r = m.useAtlasStore.getState().restoreWorkspace(restored);
    expect(r.ok).toBe(false);
    expect(m.useAtlasStore.getState().client.fullName).toBe("Unsaved Edit Household");
    disk.full = false;
    service.flush();
    expect(JSON.parse(files.read().value!).state.client.fullName).toBe("Unsaved Edit Household");
  });
});

describe("A. an unreadable workspace is never mistaken for a new installation", () => {
  const snapshot = (d: string) => {
    const out: Record<string, string> = {};
    const walk = (p: string, rel: string) => {
      for (const n of readdirSync(p)) {
        const full = join(p, n);
        if (statSync(full).isDirectory()) walk(full, `${rel}${n}/`);
        else out[`${rel}${n}`] = readFileSync(full, "utf8");
      }
    };
    walk(d, "");
    return out;
  };

  it("a new installation is the only state with nothing saved", () => {
    expect(new WorkspaceFileStore(dir).read()).toMatchObject({ status: "new", value: null, recovery: null });
  });

  it("a malformed workspace with no readable copy is reported as unreadable, and nothing on disk changes", () => {
    const files = new WorkspaceFileStore(dir);
    files.write(record(1));
    files.write(record(2));
    writeFileSync(files.file, '{"state": {"n": 3}, "vers');
    writeFileSync(files.previous, "not json");
    writeFileSync(join(files.backups, readdirSync(files.backups)[0]), JSON.stringify({ state: [], version: 11 }));
    const before = snapshot(dir);
    const r = new WorkspaceFileStore(dir).read();
    expect(r.status).toBe("unreadable");
    expect(r.value).toBeNull();
    expect(r.problems.map((p) => [p.file.replace(dir, "").split("\\").join("/"), p.kind])).toEqual([
      ["/workspace.json", "malformed"],
      ["/workspace.previous.json", "malformed"],
      [`/backups/${readdirSync(files.backups)[0]}`, "malformed"],
    ]);
    expect(snapshot(dir)).toEqual(before);
  });

  it("a workspace that can't be read at all (a read failure, not bad content) is unreadable too, never new", () => {
    mkdirSync(join(dir, "workspace.json")); // reading it fails
    const r = new WorkspaceFileStore(dir).read();
    expect(r.status).toBe("unreadable");
    expect(r.problems[0].kind).toBe("read-failed");
  });

  it("hydration never writes the sample over it: the store's saves are refused until the advisor chooses, and the files stay byte for byte", async () => {
    const files = new WorkspaceFileStore(dir);
    files.write(record(1));
    writeFileSync(files.file, "garbage that was a workspace");
    writeFileSync(files.previous, "garbage too");
    const before = snapshot(dir);
    const { service, hub } = desktop(new WorkspaceFileStore(dir));
    expect(service.firstRun).toBe(false);
    expect(service.loadProblem?.problems.length).toBeGreaterThan(0);
    const w = hub.connect();
    (globalThis as { window?: unknown }).window = { stratovellDesktop: w.bridge };
    const m = await import("@/store/useStore");
    expect(m.useAtlasStore.getState().hasHydrated).toBe(true);
    m.useAtlasStore.getState().setClient({ fullName: "Typed while the notice was open" });
    service.flush();
    expect(snapshot(dir)).toEqual(before);
    // Reset can't remove it either.
    w.bridge.workspace.remove();
    expect(snapshot(dir)).toEqual(before);
  });

  it("continuing keeps a copy of every unreadable file first; only then are saves accepted", async () => {
    const files = new WorkspaceFileStore(dir, () => new Date("2026-11-25T09:00:00Z"));
    files.write(record(1));
    writeFileSync(files.file, "garbage A");
    writeFileSync(files.previous, "garbage B");
    const { service, hub } = desktop(new WorkspaceFileStore(dir, () => new Date("2026-11-25T09:00:00Z")));
    const w = hub.connect();
    expect(w.bridge.workspace.continueAfterLoadProblem()).toEqual({ ok: true });
    expect(service.loadProblem).toBeNull();
    const kept = join(dir, "unreadable-2026-11-25T09-00-00-000Z");
    expect(readFileSync(join(kept, "workspace.json"), "utf8")).toBe("garbage A");
    expect(readFileSync(join(kept, "workspace.previous.json"), "utf8")).toBe("garbage B");
    w.bridge.workspace.write(record(5));
    service.flush();
    expect(files.read().value).toBe(record(5));
    expect(readFileSync(join(kept, "workspace.json"), "utf8")).toBe("garbage A");
  });

  it("restoring a backup is an explicit choice too: the unreadable files are kept first, then the restore is saved", () => {
    const files = new WorkspaceFileStore(dir, () => new Date("2026-11-25T09:00:00Z"));
    writeFileSync(join(dir, "workspace.json"), "garbage A");
    const { service, hub } = desktop(files);
    const w = hub.connect();
    expect(w.bridge.workspace.writeNow(record(7))).toEqual({ ok: true });
    expect(service.loadProblem).toBeNull();
    expect(readFileSync(join(dir, "unreadable-2026-11-25T09-00-00-000Z", "workspace.json"), "utf8")).toBe("garbage A");
    expect(files.read().value).toBe(record(7));
  });

  it("recovering from a daily backup also keeps the unreadable previous copy, which a later save would otherwise replace", () => {
    let now = new Date("2026-11-01T09:00:00Z");
    const s = new WorkspaceFileStore(dir, () => now);
    s.write(record(1));
    s.write(record(2));
    now = new Date("2026-11-02T09:00:00Z");
    s.write(record(3));
    writeFileSync(s.file, "garbage current");
    writeFileSync(s.previous, "garbage previous");
    const r = s.read();
    expect(r.status).toBe("ok");
    expect(r.value).toBe(record(2));
    expect(r.recovery?.from).toBe("daily");
    expect(readFileSync(join(r.recovery!.movedAside!, "workspace.json"), "utf8")).toBe("garbage current");
    expect(readFileSync(join(r.recovery!.movedAside!, "workspace.previous.json"), "utf8")).toBe("garbage previous");
    s.write(record(4));
    s.write(record(5));
    expect(readFileSync(join(r.recovery!.movedAside!, "workspace.previous.json"), "utf8")).toBe("garbage previous");
  });
});
