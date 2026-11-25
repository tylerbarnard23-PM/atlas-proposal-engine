import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
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
