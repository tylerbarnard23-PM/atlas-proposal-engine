// Stratovell desktop application: the Electron main process (#116).
//
// Stratovell runs on this computer. This process:
//   - starts the existing Next.js production server as an Electron utility
//     process bound to 127.0.0.1, with an allow-listed environment (no hosting
//     or provider variables are inherited), in live mode;
//   - keeps the workspace in a file under the user's application-data folder
//     (desktop/shared/workspaceFile.ts), so it never depends on the port;
//   - pairs its own window with the local server through the existing one-time
//     pairing link, so loopback access alone still grants nothing;
//   - renders proposal PDFs with Electron's own Chromium (no installed browser);
//   - stops any live Claude session when the app closes, keeping its counters.
// The renderer is sandboxed and context-isolated; it reaches this process only
// through the narrow, validated bridge in preload.ts.

import { app, BrowserWindow, dialog, ipcMain, Menu, session, shell, utilityProcess, type IpcMainEvent, type UtilityProcess, type WebContents } from "electron";
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join, relative } from "node:path";
import { randomBytes } from "node:crypto";
import loadingHtml from "./static/loading.html";
import { WorkspaceFileStore } from "./shared/workspaceFile";
import { MAX_IPC_STRING, registerWorkspaceIpc, WorkspaceService, type IpcEventLike } from "./shared/workspaceIpc";
import { childEnvironment, isAppUrl, parseFlags, safeNextPath, type DesktopFlags } from "./shared/policy";
import { issuePairingToken } from "../src/copilot/localPairing";
import { pairingFilePath } from "../src/copilot/localFiles";
import { sessionFilePath, stopSession } from "../src/copilot/liveSessionStore";

const HOST = "127.0.0.1";
const PREFERRED_PORT = 47613;
const SERVER_START_MS = 90_000;
const PDF_RENDER_MS = 90_000;

const flags: DesktopFlags = parseFlags(process.argv);
// Stratovell draws forms, tables and SVG charts and prints PDFs: it needs no GPU, so rendering is done in software.
// Hardware acceleration is off as a mitigation after the computer froze during the first visible desktop-window test
// (24 November 2026). The cause is unconfirmed; a graphics-driver hang is a hypothesis. This setting reduces that risk
// but does not prove a full-machine freeze cannot recur.
app.disableHardwareAcceleration();
// Automated checks only: keep the window off screen.
const hiddenForChecks = process.env.STRATOVELL_E2E === "1" && process.argv.includes("--stratovell-hidden-window");
const checkDownloads = process.env.STRATOVELL_E2E === "1" ? (process.argv.find((a) => a.startsWith("--stratovell-check-downloads=")) ?? "").slice("--stratovell-check-downloads=".length) || null : null;
// Isolated data folder for tests and UAT (never the default profile when given).
if (flags.dataDir) app.setPath("userData", flags.dataDir);
// Remote debugging is for automated checks of a build only: it is ignored unless explicitly allowed.
if (process.env.STRATOVELL_E2E !== "1") app.commandLine.removeSwitch("remote-debugging-port");

const userData = () => app.getPath("userData");
const paths = {
  workspace: () => join(userData(), "workspace"),
  localState: () => join(userData(), "local-state"),
  logs: () => join(userData(), "logs"),
  tmp: () => join(userData(), "tmp"),
};

function log(line: string) {
  try {
    mkdirSync(paths.logs(), { recursive: true });
    const file = join(paths.logs(), "stratovell.log");
    if (existsSync(file) && statSync(file).size > 5_000_000) renameSync(file, join(paths.logs(), "stratovell.previous.log"));
    appendFileSync(file, `${new Date().toISOString()} ${line}\n`);
  } catch {
    /* logging never stops the app */
  }
}

interface BuildInfo {
  version: string;
  commit: string;
  builtAt: string;
  signing: string;
}
function buildInfo(): BuildInfo {
  try {
    return JSON.parse(readFileSync(join(app.getAppPath(), "build-info.json"), "utf8")) as BuildInfo;
  } catch {
    return { version: app.getVersion(), commit: "development", builtAt: "", signing: "unsigned development build" };
  }
}

// --- Single instance ------------------------------------------------------------

const primaryInstance = app.requestSingleInstanceLock();
if (!primaryInstance) {
  // Another Stratovell window is already open on this computer: it is brought forward instead.
  app.quit();
} else {
  app.on("second-instance", () => {
    const w = mainWindow;
    if (!w) return;
    if (w.isMinimized()) w.restore();
    w.focus();
  });
}

// --- State -----------------------------------------------------------------------

let mainWindow: BrowserWindow | null = null;
let server: UtilityProcess | null = null;
let origin: string | null = null;
let quitting = false;
let workspace: WorkspaceService;
let lastSaveProblem: string | null = null;

function workspaceSender(e: IpcMainEvent | IpcEventLike): boolean {
  // Only pages served by this app's own server, in a window this process created, may use the bridge.
  const url = e.senderFrame?.url ?? "";
  const ok = !!origin && isAppUrl(url, origin) && BrowserWindow.fromWebContents(e.sender as WebContents) !== null;
  if (!ok) log(`refused a bridge call from ${url.slice(0, 80) || "an unknown frame"}`);
  return ok;
}

function notifySaveProblem(error: string | null) {
  if (error === lastSaveProblem) return;
  lastSaveProblem = error;
  if (error) log(`workspace save failed: ${error}`);
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send("stratovell:workspace:save-problem", error);
}

function registerBridge() {
  registerWorkspaceIpc(ipcMain as unknown as Parameters<typeof registerWorkspaceIpc>[0], workspace, {
    allowed: workspaceSender,
    onSaveProblem: notifySaveProblem,
    // Codex finding B: after an accepted change, every other window reloads the latest workspace.
    broadcast: (except, channel, ...args) => {
      for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed() && w.webContents.id !== except) w.webContents.send(channel, ...args);
    },
  });
  ipcMain.on("stratovell:app:info", (e) => {
    if (!workspaceSender(e)) return void (e.returnValue = null);
    const b = buildInfo();
    e.returnValue = {
      name: "Stratovell",
      version: b.version,
      build: `${b.signing}${b.commit ? ` · source ${b.commit.slice(0, 12)}` : ""}`,
      dataFolder: userData(),
      platform: `${process.platform} ${process.arch}`,
      firstRun: workspace.firstRun,
      recovery: workspace.recovery ? { from: workspace.recovery.from, savedAt: workspace.recovery.savedAt, movedAside: workspace.recovery.movedAside } : null,
      loadProblem: workspace.loadProblem
        ? { folder: paths.workspace(), files: workspace.loadProblem.problems.map((p) => ({ name: relative(paths.workspace(), p.file), kind: p.kind })) }
        : null,
      testProvider: flags.testProvider,
    };
  });
}

// --- Local server ---------------------------------------------------------------

const portFree = (port: number) =>
  new Promise<boolean>((done) => {
    const probe = createServer();
    probe.once("error", () => done(false));
    probe.once("listening", () => probe.close(() => done(true)));
    probe.listen(port, HOST);
  });

async function choosePort(preferred: number): Promise<number | null> {
  // A busy port is never freed by stopping another program: the next free one is used.
  for (let p = preferred; p < preferred + 40 && p < 65_536; p++) if (await portFree(p)) return p;
  return null;
}

function serverDir(): string {
  return app.isPackaged ? join(process.resourcesPath, "server") : join(__dirname, "..", "..", ".next-desktop", "standalone");
}

async function waitForServer(base: string, child: UtilityProcess): Promise<boolean> {
  let exited = false;
  child.once("exit", () => (exited = true));
  const until = Date.now() + SERVER_START_MS;
  while (Date.now() < until && !exited) {
    try {
      const res = await fetch(`${base}/api/copilot`, { signal: AbortSignal.timeout(2_000) });
      if (res.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

async function startServer(): Promise<{ ok: true } | { ok: false; reason: string }> {
  const port = await choosePort(flags.port ?? PREFERRED_PORT);
  if (port === null) return { ok: false, reason: "No free local port was found for Stratovell's local service. Nothing was stopped." };
  const dir = serverDir();
  const entry = join(dir, "stratovell-server.js");
  if (!existsSync(entry)) return { ok: false, reason: "Stratovell's local service is missing from this installation. Reinstall Stratovell." };
  mkdirSync(paths.localState(), { recursive: true });
  const env = childEnvironment(process.env, { port, host: HOST, localStateDir: paths.localState(), testProvider: flags.testProvider });
  const child = utilityProcess.fork(entry, [], { cwd: dir, env, stdio: "pipe", serviceName: "Stratovell local service" });
  child.stdout?.on("data", (d: Buffer) => log(`[server] ${d.toString("utf8").trimEnd()}`));
  child.stderr?.on("data", (d: Buffer) => log(`[server:err] ${d.toString("utf8").trimEnd()}`));
  child.on("message", (m: unknown) => void onServerMessage(child, m));
  child.on("exit", (code) => {
    log(`local service exited (${code})`);
    if (server === child) {
      server = null;
      if (!quitting) void serviceStopped();
    }
  });
  server = child;
  const base = `http://${HOST}:${port}`;
  if (!(await waitForServer(base, child))) {
    child.kill();
    return { ok: false, reason: "Stratovell's local service didn't start in time." };
  }
  origin = base;
  if (port !== (flags.port ?? PREFERRED_PORT)) log(`port ${flags.port ?? PREFERRED_PORT} was busy; using ${port}`);
  log(`local service ready at ${base}`);
  return { ok: true };
}

// --- PDF rendering with Electron's own Chromium -----------------------------------

let pdfChain: Promise<unknown> = Promise.resolve();

function renderPdf(html: string): Promise<Buffer> {
  const run = pdfChain.then(() => renderPdfNow(html));
  pdfChain = run.catch(() => undefined);
  return run;
}

async function renderPdfNow(html: string): Promise<Buffer> {
  const dir = join(paths.tmp(), `pdf-${randomBytes(6).toString("hex")}`);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "proposal.html");
  writeFileSync(file, html, "utf8");
  // A separate in-memory session that may load only this one file: the template is self-contained.
  const ses = session.fromPartition(`stratovell-pdf-${randomBytes(4).toString("hex")}`, { cache: false });
  const fileUrl = new URL(`file:///${file.replace(/\\/g, "/")}`).href;
  ses.webRequest.onBeforeRequest((details, cb) => cb({ cancel: !(details.url === fileUrl || details.url.startsWith("data:")) }));
  ses.setPermissionRequestHandler((_wc, _p, cb) => cb(false));
  const win = new BrowserWindow({ show: false, webPreferences: { session: ses, sandbox: true, contextIsolation: true, javascript: false, nodeIntegration: false } });
  try {
    await Promise.race([win.loadFile(file), new Promise((_, rej) => setTimeout(() => rej(new Error("The proposal didn't load for printing in time.")), PDF_RENDER_MS))]);
    // The same page set-up as the browser route (src/pdf/printOptions.ts): Letter, backgrounds, zero margins (the document's own @page rules apply).
    return await win.webContents.printToPDF({ pageSize: "Letter", printBackground: true, margins: { top: 0, bottom: 0, left: 0, right: 0 }, preferCSSPageSize: false });
  } finally {
    win.destroy();
    rmSync(dir, { recursive: true, force: true });
  }
}

async function onServerMessage(child: UtilityProcess, m: unknown) {
  const msg = m as { type?: string; id?: string; html?: unknown };
  if (msg?.type !== "render-pdf" || typeof msg.id !== "string") return;
  if (typeof msg.html !== "string" || msg.html.length > MAX_IPC_STRING) return child.postMessage({ type: "pdf-result", id: msg.id, ok: false, error: "The proposal to print isn't valid." });
  try {
    const pdf = await renderPdf(msg.html);
    child.postMessage({ type: "pdf-result", id: msg.id, ok: true, data: new Uint8Array(pdf) });
  } catch (err) {
    log(`PDF rendering failed: ${(err as Error).message}`);
    child.postMessage({ type: "pdf-result", id: msg.id, ok: false, error: `Stratovell couldn't print the PDF (${(err as Error).message}).` });
  }
}

// --- Windows, navigation and network policy ---------------------------------------

// The loading page is part of the main bundle (no file:// access to the app archive is needed or allowed).
const loadingUrl = (problem?: string) => `data:text/html;charset=utf-8,${encodeURIComponent(problem ? loadingHtml.replace("Its local service is starting; your saved work stays on this computer.", "Its local service couldn't start. Your saved work is not affected.") : loadingHtml)}`;

function lockDownSession() {
  const ses = session.defaultSession;
  // Only this app's own local server (and the bundled loading page) may be reached from a window.
  ses.webRequest.onBeforeRequest((details, cb) => {
    const url = details.url;
    const allowed = (origin && isAppUrl(url, origin)) || url.startsWith("devtools://") || url.startsWith("data:") || url.startsWith("blob:");
    if (!allowed) log(`blocked a request to ${url.slice(0, 120)}`);
    cb({ cancel: !allowed });
  });
  ses.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === "clipboard-sanitized-write"));
  // Downloads (PDFs, backups) are saved where the advisor chooses, starting in Documents.
  ses.on("will-download", (_e, item) => {
    const name = item.getFilename().replace(/[\\/:*?"<>|]/g, "_");
    if (checkDownloads) item.setSavePath(join(checkDownloads, name));
    else item.setSaveDialogOptions({ title: "Save from Stratovell", defaultPath: join(app.getPath("documents"), name) });
    item.once("done", (_ev, state) => log(`download ${state}: ${name}`));
  });
  ses.setPermissionCheckHandler((_wc, permission) => permission === "clipboard-sanitized-write");
}

function guardContents(contents: WebContents) {
  contents.on("will-attach-webview", (e) => e.preventDefault());
  contents.on("will-navigate", (e, url) => {
    // Page-initiated navigation may stay within this app only (the loading page is opened by this process, not by a page).
    if (origin && isAppUrl(url, origin)) return;
    e.preventDefault();
    openOutside(url);
  });
  contents.setWindowOpenHandler(({ url }) => {
    // Same-origin pages (the meeting view, the template preview) open in another Stratovell window with the same protections.
    if (origin && isAppUrl(url, origin)) return { action: "allow", overrideBrowserWindowOptions: windowOptions() };
    openOutside(url);
    return { action: "deny" };
  });
}

/** Links to outside websites open in the user's browser, and only https ones. */
function openOutside(url: string) {
  try {
    const u = new URL(url);
    if (u.protocol === "https:") void shell.openExternal(u.href);
    else log(`refused to open ${u.protocol} link`);
  } catch {
    /* not a URL */
  }
}

function windowOptions(): Electron.BrowserWindowConstructorOptions {
  return {
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#f7f7f5",
    title: flags.testProvider ? "Stratovell (test provider: no model, no API calls)" : "Stratovell",
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
    },
  };
}

function buildMenu() {
  const b = buildInfo();
  const about = () =>
    void dialog.showMessageBox({
      type: "info",
      title: "About Stratovell",
      message: `Stratovell ${b.version}`,
      detail: [
        `Build: ${b.signing}`,
        b.commit ? `Source: ${b.commit}` : null,
        b.builtAt ? `Built: ${b.builtAt}` : null,
        `Electron ${process.versions.electron} · Chromium ${process.versions.chrome} · Node ${process.versions.node}`,
        `Your data: ${userData()}`,
        "Stratovell runs on this computer. Claude analysis uses your own Anthropic API key and sends the displayed analysis inputs to Anthropic only when you start an analysis.",
      ]
        .filter(Boolean)
        .join("\n"),
    });
  const template: Electron.MenuItemConstructorOptions[] = [
    { label: "File", submenu: [{ label: "Open data folder", click: () => void shell.openPath(userData()) }, { type: "separator" }, { role: "quit" }] },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [{ role: "reload" }, { type: "separator" }, { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { type: "separator" }, { role: "togglefullscreen" }, ...(app.isPackaged ? [] : [{ role: "toggleDevTools" } as const])],
    },
    { label: "Help", submenu: [{ label: "About Stratovell", click: about }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function showProblem(reason: string) {
  log(`problem: ${reason}`);
  const w = mainWindow;
  if (w && !w.isDestroyed()) await w.loadURL(loadingUrl(reason)).catch(() => {});
  const r = await dialog.showMessageBox({
    type: "error",
    title: "Stratovell",
    message: "Stratovell couldn't start its local service.",
    detail: `${reason}\n\nYour saved work is not affected. Details are in the log in ${paths.logs()}.`,
    buttons: ["Try again", "Open log folder", "Quit"],
    defaultId: 0,
    cancelId: 2,
  });
  if (r.response === 0) return void boot();
  if (r.response === 1) {
    void shell.openPath(paths.logs());
    return void showProblem(reason);
  }
  app.quit();
}

async function serviceStopped() {
  origin = null;
  await showProblem("Stratovell's local service stopped unexpectedly.");
}

async function openApp() {
  const w = mainWindow!;
  const { token } = await issuePairingToken(pairingFilePath({ ATLAS_LOCAL_DIR: paths.localState() }), new Date());
  // The one-time link pairs this window (an HttpOnly cookie) and redirects without the token in the address.
  const next = safeNextPath(workspace.firstRun ? "/welcome" : "/");
  await w.loadURL(`${origin}/api/copilot/local/pair?token=${encodeURIComponent(token)}&next=${encodeURIComponent(next)}`);
}

async function boot() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = new BrowserWindow({ ...windowOptions(), show: false });
    guardContents(mainWindow.webContents);
    // Automated checks: the window is shown far off-screen without focus, so it paints (in software) but never appears.
    if (hiddenForChecks) mainWindow.setPosition(-20000, -20000);
    mainWindow.once("ready-to-show", () => (hiddenForChecks ? mainWindow?.showInactive() : mainWindow?.show()));
    mainWindow.webContents.on("render-process-gone", (_e, details) => {
      log(`window renderer ended (${details.reason})`);
      if (!quitting && details.reason !== "clean-exit") mainWindow?.reload();
    });
    mainWindow.on("closed", () => (mainWindow = null));
  }
  await mainWindow.loadURL(loadingUrl()).catch(() => {});
  const started = server && origin ? { ok: true as const } : await startServer();
  if (!started.ok) return showProblem(started.reason);
  try {
    await openApp();
  } catch (err) {
    return showProblem(`The app window couldn't open (${(err as Error).message}).`);
  }
}

// --- Shutdown -----------------------------------------------------------------------

async function shutdown() {
  // 1. Every queued change is on disk before anything else stops.
  const r = workspace?.flush();
  if (r && !r.ok) log(`final save failed: ${r.error}`);
  // 2. The local service stops; a run in flight is cancelled with it.
  const child = server;
  server = null;
  if (child) {
    const exited = new Promise<void>((done) => child.once("exit", () => done()));
    child.kill();
    await Promise.race([exited, new Promise((r) => setTimeout(r, 5_000))]);
  }
  // 3. Any live Claude session stops for good. Its counters and reservations are kept, never reset.
  try {
    const file = sessionFilePath({ ATLAS_LOCAL_DIR: paths.localState() });
    if (existsSync(file)) await stopSession(file, new Date(), "Stratovell was closed");
  } catch (err) {
    log(`couldn't record the session stop: ${(err as Error).message}`);
  }
  log("Stratovell closed");
}

app.on("before-quit", (e) => {
  if (quitting || !primaryInstance) return;
  quitting = true;
  e.preventDefault();
  void shutdown().finally(() => app.exit(0));
});

app.on("window-all-closed", () => app.quit());

app.on("web-contents-created", (_e, contents) => guardContents(contents));

app.whenReady().then(() => {
  if (!primaryInstance) return;
  mkdirSync(userData(), { recursive: true });
  log(`Stratovell ${buildInfo().version} starting (${process.platform} ${process.arch}, Electron ${process.versions.electron})${flags.testProvider ? " with the test provider" : ""}`);
  workspace = new WorkspaceService(new WorkspaceFileStore(paths.workspace()), {
    delayMs: 300,
    onSaveResult: (res) => {
      notifySaveProblem(res.ok ? null : res.error);
      // A failed save is kept and retried, so a briefly locked file (an antivirus scan, a sync client) recovers by itself.
      if (!res.ok && !quitting) setTimeout(() => workspace.queue.dirty && workspace.flush(), 5_000);
    },
  });
  workspace.load();
  if (workspace.loadProblem)
    log(`workspace unreadable; nothing changed, saving paused until the advisor chooses: ${workspace.loadProblem.problems.map((p) => `${relative(paths.workspace(), p.file)} (${p.kind}: ${p.detail})`).join("; ")}`);
  const recovery = workspace.recovery;
  if (recovery) log(`workspace recovered from ${recovery.from} copy saved ${recovery.savedAt}${recovery.movedAside ? `; unreadable file kept as ${recovery.movedAside}` : ""}`);
  log(`graphics: ${JSON.stringify(app.getGPUFeatureStatus())}`);
  registerBridge();
  lockDownSession();
  buildMenu();
  void boot();
});
