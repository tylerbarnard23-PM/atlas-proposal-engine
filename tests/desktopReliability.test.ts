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
  registerWorkspaceIpc(hub.main, service, {
    allowed: () => true,
    broadcast: (except, channel, ...args) => hub.windowIds().filter((id) => id !== except).forEach((id) => hub.sendTo(id, channel, ...args)),
  });
  return { service, hub };
}

describe("C. a failed restore keeps the earlier unsaved workspace", () => {
  it("the save-now handler, with a change still queued: a refused restore leaves that change waiting, and it is saved once the disk recovers", () => {
    const files = new WorkspaceFileStore(dir);
    files.write(record(1));
    const { disk, store } = failingDisk(files);
    const { service, hub } = desktop(store);
    const w = hub.connect();
    w.bridge.workspace.read(); // a page reads the workspace (hydration) before changing it
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
    w.bridge.workspace.read(); // a page reads the workspace (hydration) before changing it
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
    w.bridge.workspace.read(); // a page reads the workspace (hydration) before changing it
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
    w.bridge.workspace.read(); // a page reads the workspace (hydration) before changing it
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
    w.bridge.workspace.read(); // a page reads the workspace (hydration) before changing it
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
    w.bridge.workspace.read(); // a page reads the workspace (hydration) before changing it
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
    w.bridge.workspace.read(); // a page reads the workspace (hydration) before changing it
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

describe("B. several windows can't overwrite newer changes with a stale workspace", () => {
  /** Opens a Stratovell window (a new page with its own store) on the shared main process. */
  async function openWindow(hub: ReturnType<typeof ipcHub>) {
    const w = hub.connect();
    w.bridge.workspace.read(); // a page reads the workspace (hydration) before changing it
    vi.resetModules();
    (globalThis as { window?: unknown }).window = { stratovellDesktop: w.bridge };
    const m = await import("@/store/useStore");
    return { w, m, store: m.useAtlasStore, s: () => m.useAtlasStore.getState() };
  }
  const onDisk = (files: WorkspaceFileStore, service: WorkspaceService) => (service.flush(), JSON.parse(files.read().value!).state);

  function twoWindows() {
    const files = new WorkspaceFileStore(dir);
    const { service, hub } = desktop(files);
    return { files, service, hub };
  }

  it("hydration in a second window (the meeting view) writes nothing, and the first window's next change is saved", async () => {
    const { files, service, hub } = twoWindows();
    const review = await openWindow(hub);
    review.s().setClient({ fullName: "Edited in Review" });
    const rev = service.revision;
    service.flush();
    const saved = files.read().value;
    const meeting = await openWindow(hub);
    expect(meeting.s().client.fullName).toBe("Edited in Review");
    expect(service.revision).toBe(rev);
    service.flush();
    expect(files.read().value).toBe(saved);
    review.s().setClient({ fullName: "Edited again in Review" });
    expect(onDisk(files, service).client.fullName).toBe("Edited again in Review");
    // The meeting view follows: it reloads the newer workspace without writing it back.
    expect(meeting.s().client.fullName).toBe("Edited again in Review");
    expect(service.revision).toBe(rev + 1);
  });

  it("a stale window's change is refused: the newer change stays on disk, and that window reloads the latest and says why", async () => {
    const { files, service, hub } = twoWindows();
    const review = await openWindow(hub);
    const meeting = await openWindow(hub);
    const told: string[] = [];
    meeting.w.bridge.onWorkspaceChanged((reason) => told.push(reason));
    meeting.w.hold(); // the meeting view hasn't processed "the workspace changed" yet
    review.s().setClient({ fullName: "Newer, from Review" });
    meeting.s().setAdvisor({ name: "Stale edit from the meeting view" });
    const disk = onDisk(files, service);
    expect(disk.client.fullName).toBe("Newer, from Review");
    expect(disk.advisor.name).not.toBe("Stale edit from the meeting view");
    expect(told).toEqual(["stale"]);
    expect(meeting.s().client.fullName).toBe("Newer, from Review");
    expect(meeting.s().advisor.name).not.toBe("Stale edit from the meeting view");
    meeting.w.deliver(); // the late notice changes nothing more
    expect(told).toEqual(["stale"]);
    expect(meeting.s().client.fullName).toBe("Newer, from Review");
    expect(onDisk(files, service).client.fullName).toBe("Newer, from Review");
  });

  it("synchronized windows keep each other's unrelated edits", async () => {
    const { files, service, hub } = twoWindows();
    const a = await openWindow(hub);
    const b = await openWindow(hub);
    a.s().setClient({ fullName: "Client edited in A" });
    b.s().setAdvisor({ name: "Advisor edited in B" });
    a.s().setClient({ investmentObjective: "Objective edited in A" });
    const disk = onDisk(files, service);
    expect([disk.client.fullName, disk.client.investmentObjective, disk.advisor.name]).toEqual(["Client edited in A", "Objective edited in A", "Advisor edited in B"]);
    for (const w of [a, b]) expect([w.s().client.fullName, w.s().advisor.name]).toEqual(["Client edited in A", "Advisor edited in B"]);
  });

  it("an approved version made in one window survives a stale write from another, and both windows keep it afterwards", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-26T12:00:00Z"));
    try {
      const { files, service, hub } = twoWindows();
      const review = await openWindow(hub);
      const other = await openWindow(hub);
      await approvedStory(review.m);
      const r = review.s().approveVersion("Approved in Review (synthetic).");
      if (!r.ok) throw new Error(r.failing.join("; "));
      other.w.hold();
      review.s().setClient({ fullName: "After approval" });
      other.s().setClient({ fullName: "Stale window, before the approval" }); // refused
      let disk = onDisk(files, service);
      expect(disk.snapshots.map((x: { id: string }) => x.id)).toEqual([r.snapshot.id]);
      expect(disk.client.fullName).toBe("After approval");
      other.w.deliver();
      other.s().setAdvisor({ name: "Later edit from the other window" });
      disk = onDisk(files, service);
      expect(disk.snapshots).toEqual([JSON.parse(JSON.stringify(r.snapshot))]);
      expect(disk.advisor.name).toBe("Later edit from the other window");
      expect(review.s().snapshots).toHaveLength(1);
      expect(other.s().snapshots).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a restore from a stale window is refused, and changes nothing", async () => {
    const { files, service, hub } = twoWindows();
    const a = await openWindow(hub);
    const b = await openWindow(hub);
    b.w.hold();
    a.s().setClient({ fullName: "Newer, from A" });
    const r = b.w.bridge.workspace.writeNow(JSON.stringify({ state: { ...b.s(), client: { ...b.s().client, fullName: "Restored in stale B" } }, version: 11 }));
    expect(r.ok).toBe(false);
    expect(onDisk(files, service).client.fullName).toBe("Newer, from A");
  });
});

/** The managed-account story from approvedSnapshot.test.ts: every readiness check passes, so a version can be approved. */
async function approvedStory(m: typeof import("@/store/useStore")) {
  const desk = await import("@/engines/allocationDesk");
  const proposals = await import("@/engines/strategyProposals");
  const { normalizeHoldings } = await import("@/engines/normalizationEngine");
  const story = await import("@/data/umaStory");
  const store = () => m.useAtlasStore.getState();
  const ACC = "acc_uma_story";
  store().startNewClient();
  m.useAtlasStore.setState({
    client: { ...store().client, fullName: "Managed Story Household", proposalOutputCurrency: "USD" },
    accounts: [story.UMA_ACCOUNT],
    holdings: [story.UMA_CASH],
    recommendations: [],
    fxRates: [],
  });
  store().setDraftScope([ACC]);
  store().setAccountFunding(ACC, { cashHoldingId: "h_uma_cash", reserve: 5_000, reserveCurrency: "USD" });
  store().addSyntheticLibrary();
  store().pinModel({ id: "mdl_uma_core", revision: 1 });
  const s = store();
  const { sleevePlan, sleevePurchases, accountBasis } = { ...desk, ...proposals } as unknown as Record<string, (a: unknown) => never>;
  const plan = sleevePlan({
    model: story.UMA_STRATEGY_MODEL,
    strategies: s.strategies,
    basis: accountBasis({ account: s.accounts.find((a) => a.id === ACC), holdings: normalizeHoldings(s.holdings, s.fxRates, "USD"), fx: { reportingCurrency: "USD", rates: s.fxRates } }),
  });
  store().addDraftEdit(sleevePurchases({ plan, accountId: ACC, ids: { group: "grp_story", rec: (sid: string) => `rec_story_${sid}` }, now: new Date().toISOString() }));
  for (const id of store().workingDraft.memberIds) {
    const r = store().recommendations.find((x) => x.id === id)!;
    store().upsertRecommendation({ ...r, approvedByAdvisor: true, status: "approved", includeInPdf: true });
  }
  const cRec = store().recommendations.find((r) => r.destination?.id === "sleeve_acc_uma_story_str_etf_c_r1");
  if (cRec) store().recordSleeveReview(cRec.id, "No published minimum; reviewed with the sponsor's terms (synthetic).");
}

describe("the workspace bridge still answers only the app's own pages", () => {
  it("a page from anywhere else reads nothing and can't save, restore, remove or continue; nothing on disk changes", async () => {
    const { isAppUrl } = await import("../desktop/shared/policy");
    const files = new WorkspaceFileStore(dir);
    files.write(record(1));
    const service = new WorkspaceService(files, { delayMs: 60_000 });
    service.load();
    const hub = ipcHub();
    const origin = "http://127.0.0.1:47613";
    registerWorkspaceIpc(hub.main, service, { allowed: (e) => isAppUrl(e.senderFrame?.url ?? "", origin) });
    const before = readFileSync(files.file, "utf8");
    for (const url of ["https://example.com/", "http://127.0.0.1:47614/", "file:///C:/x.html"]) {
      const w = hub.connect(url);
      expect(w.bridge.workspace.read()).toBeNull();
      w.bridge.workspace.write(record(9));
      expect(w.bridge.workspace.writeNow(record(9)).ok).toBe(false);
      w.bridge.workspace.remove();
      expect(w.bridge.workspace.continueAfterLoadProblem().ok).toBe(false);
    }
    service.flush();
    expect(readFileSync(files.file, "utf8")).toBe(before);
    expect(service.revision).toBe(0);
    const own = hub.connect(`${origin}/review`);
    expect(own.bridge.workspace.read()).toBe(record(1));
  });
});
