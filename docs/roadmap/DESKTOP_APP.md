# Stratovell desktop application (#116)

Stratovell is a desktop application: it is downloaded and runs on the user's own computer. Real Claude analysis runs inside it with the user's own Anthropic API key. The public website is the product and download entry, with a separately labelled scripted preview. Hosted Claude connectivity (#113) is retired ([HOSTED_CLAUDE.md](HOSTED_CLAUDE.md)).

**Review status (25 November 2026):**
- Codex's review of `fd2db60` was **not approved**, with four findings: A, an unreadable workspace; B, several windows; C, a failed restore; D, the first-session confirmation.
- All four are fixed on PR #117 with regression tests.
- Codex's re-review of `055f99b` found three more problems, now fixed:
  - a stale Settings restore;
  - a failed recovery restore that cleared the guard;
  - an unlistable backups path.
- Everything awaits an independent Codex re-review.
- The 0.1.0 UAT installer was built from `476e71d`, **before** these fixes.
- *Install as app* was assessed in [INSTALL_AS_APP_ASSESSMENT.md](INSTALL_AS_APP_ASSESSMENT.md). This Electron route stays: it is implemented, and a migration is still uncertain.

**Status (24 November 2026):** a Windows x64 build exists for **private UAT only**. It is **unsigned**, and there is **no public download**. The website states this ([`src/domain/desktopRelease.ts`](../../src/domain/desktopRelease.ts) holds no release). MCP is planned, not built.

## How it works

- **Electron 45.4.1** (Node 24.22.3, Chromium 156) wraps the existing Next.js production server, unchanged in its engines, gates and agent authority.
  - [`desktop/main.ts`](../../desktop/main.ts) starts the standalone server as an Electron *utility process* on `127.0.0.1`. The preferred port is 47613; if it is busy, the next free port is used and nothing else is stopped.
  - The server runs in live mode, with an allow-listed environment ([`desktop/shared/policy.ts`](../../desktop/shared/policy.ts)): no `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, hosting, database or `NODE_OPTIONS` value is inherited.
  - The window pairs itself through the existing one-time pairing link. Loopback access alone still grants nothing: every key or session change needs the pairing cookie and the CSRF token.
  - Credentials stay in the Windows Credential Manager (`@napi-rs/keyring`) or, by choice, in this session's memory. The session limits, reservations and `meteredRun` are unchanged.
- **Workspace persistence** ([`desktop/shared/workspaceFile.ts`](../../desktop/shared/workspaceFile.ts), [`src/store/workspaceStorage.ts`](../../src/store/workspaceStorage.ts)):
  - **What is saved:** the same persisted string (store v11) that the browser keeps in `localStorage`, saved by the main process in `%APPDATA%\Stratovell\workspace\workspace.json`. That is outside the installation folder and independent of the port.
  - **How:** saves are coalesced (300 ms) and atomic (temporary file, fsync, rename). The replaced copy is kept as `workspace.previous.json`, and the first save of each day goes to `backups/` (the newest 14 are kept).
  - **Recovery:**
    - Every unreadable file met on the way is copied into `unreadable-<time>/`, or moved there when it can't even be read; nothing is deleted. The newest readable copy then opens, with a notice.
    - **When files exist but none is readable** (malformed, or reading fails), that is never treated as a new installation. Nothing on disk changes, and the main process refuses saves and removal. A blocking notice offers three choices: restore a backup, start over with the fictional sample, or quit. Restore and start over each keep the unreadable files first.
    - A failed save shows an alert and is retried every 5 seconds.
  - **Restore:** saves at once and changes nothing if the save fails.
    - A change still queued is written first and is never discarded by a failed restore.
    - A restore built in a window that hasn't seen a newer change is refused; that window refreshes and the advisor retries.
    - While the workspace is unreadable, a failed restore leaves saving blocked and the notice open.
  - **Reading:** the current file is read first. A backups folder that can't be listed never blocks a healthy workspace, and the daily copy made on save is best-effort.
  - **Several windows** (the meeting view and the template preview are Stratovell windows too): each change carries the workspace revision its window last read.
    - A change based on an older revision is refused, and that window reloads the latest workspace and says so. An unchanged save is a no-op.
    - After an accepted change, the other windows reload without saving anything back.
  - **Getting started** replaces the workspace without a question only while it is still the untouched fictional sample, judged by its content.
- **Local Claude state** (pairing, connection record without the key, session counters) lives in `%APPDATA%\Stratovell\local-state`; logs are in `logs\`.
- **PDFs:**
  - The final-PDF route builds and re-gates the proposal exactly as before, then hands the finished HTML to the main process.
  - The main process prints it with Electron's own Chromium: Letter, backgrounds, zero margins, so the document's own `@page` rules apply.
  - The print runs in a hidden window with JavaScript off, in an isolated in-memory session that may load only that one temporary file. No installed browser is used.
- **Shutdown:** closing the window saves everything queued, stops the local service (cancelling a run in flight) and stops any live session for good, with its counters kept.
- **Single instance:** opening Stratovell again brings the open window forward.
- **Graphics:** hardware acceleration is off; Stratovell needs no GPU. This is a **mitigation, not a guarantee**:
  - On 24 November 2026 the computer froze during the first visible desktop-window test of an unpacked Electron 45 build. The owner forced a restart.
  - **The cause is unconfirmed.** A graphics-driver hang on the hybrid AMD/NVIDIA laptop (2022 NVIDIA driver) is a hypothesis only.
  - Later automated checks ran off-screen with `--disable-gpu` and a watchdog, and nothing froze again. That does not show a full-machine freeze cannot recur, and those scripted checks are not a recovery test of the original incident.
  - The original evidence (the app log of that run and its file list) is kept outside Git, in `evidence/pr116-desktop-2026-11-24/incident-and-run-logs/` and REPORT.md section 33.
- **Application-service boundary for a future MCP adapter:**
  - Every capability is reached through the same server routes and engines: the copilot tools in `src/copilot/tools.ts`, readiness in `src/engines/complianceEngine.ts`, and backups in `src/engines/workspaceBackup.ts`.
  - The workspace is one documented file.
  - An MCP adapter would read that file through `WorkspaceFileStore`, call the same engines, and hold the same advisor-authority rules (drafts only, explicit approval).

## Security boundary

- **Renderer:** sandboxed, context-isolated, no Node integration. It reaches the main process only through the preload bridge ([`desktop/preload.ts`](../../desktop/preload.ts), built in [`desktop/shared/bridgeClient.ts`](../../desktop/shared/bridgeClient.ts)). The bridge offers read, save, save-now, remove and continue-after-a-load-problem calls for the workspace (handled in [`desktop/shared/workspaceIpc.ts`](../../desktop/shared/workspaceIpc.ts)), plus the app's own information. Every call is validated and answered only for pages served by the app's own origin.
- **Navigation and network:**
  - Pages may navigate and send requests only within the app's own origin.
  - https links open in the user's browser; nothing else opens.
  - Permissions are denied, apart from sanitized clipboard writes.
  - Same-origin pop-ups (meeting view, template preview) open as Stratovell windows with the same protections.
- **Electron fuses:**
  - `RunAsNode`, `NODE_OPTIONS` and the inspect arguments are off;
  - cookies are encrypted;
  - the app loads only from its ASAR archive, with embedded integrity validation;
  - `file://` has no extra privileges.

  Remote debugging is ignored unless `STRATOVELL_E2E=1` is set; that variable exists for automated checks only.
- **Contents check:** [`desktop/build.mjs`](../../desktop/build.mjs) refuses to package if what would ship contains any of these:
  - an environment file, `.atlas-local`, `.vercel`, Git data or `.claude`;
  - private fixtures, reports or handoffs, evaluation or scratch folders;
  - keys or certificates, or local connection state;
  - any symbolic link or junction.

  Turbopack's links to external packages are replaced with real copies. Links are removed with non-recursive `rmdir`, never followed.

## Build (reproducible)

On Windows x64 with Node 24 and Git, starting from a clean checkout of the reviewed commit:

```powershell
git checkout <reviewed commit>
npm ci
npm run desktop:build
```

- **Output:** `dist-desktop\<version>\Stratovell-Setup-<version>-x64-unsigned-UAT.exe` (and `win-unpacked\`).
- `npm run desktop:start` builds the unpacked application only, without the installer.
- `STRATOVELL_DESKTOP_VERSION=<semver>` builds another version number, for update checks.
- **Signing:** the build is unsigned unless a certificate is supplied through electron-builder's standard variables (`CSC_LINK` and `CSC_KEY_PASSWORD`, or `WIN_CSC_LINK`). Then the installer is named without "unsigned-UAT", and Settings says "signed build".
- **No purchase or account was made.** An unsigned installer triggers Windows SmartScreen ("Windows protected your PC") when downloaded from the internet. A public release needs a code-signing certificate and a decision on how to obtain one; users should never be told to bypass the warning.
- **Known build-time advisory:** a moderate `minimatch` advisory in electron-builder's own toolchain (development only, not shipped). `npm audit --omit=dev` reports 0.

## Install, update and uninstall

- **Install:** per-user and without elevation, to `%LOCALAPPDATA%\Programs\Stratovell`, with a Start menu entry, a desktop shortcut and an "Apps & features" uninstall entry. Installing creates no data.
- **Update:** run the newer installer; it replaces the program files only. The data folder (`%APPDATA%\Stratovell`) is never touched by install, update or uninstall. Export a backup first, as a precaution. Stratovell has no automatic update check.
- **Uninstall:** "Apps & features", or `Uninstall Stratovell.exe`. The data folder is kept; delete it yourself to remove all data.
- **Moving from the browser:** export a backup in the browser's Stratovell (Settings → Backup & restore), then restore it in the application. Stratovell never reads a browser profile.

## Tested so far

Windows 11 Home 10.0.26200 x64, the build machine, which also has Node and Chrome installed; the app uses neither. No clean-machine test has run: Windows Sandbox and a VM aren't available here. That gap remains, and the owner's UAT on a second computer would close it. The results, the evidence folder and the UAT checklist are recorded in REPORT.md section 33 (outside Git) and on the PR.
