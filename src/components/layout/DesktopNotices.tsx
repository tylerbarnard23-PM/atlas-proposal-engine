"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { desktopBridge, type DesktopAppInfo } from "@/store/workspaceStorage";
import { useCopilotMode } from "@/components/copilot/CopilotWorkspace";
import { useAtlasStore } from "@/store/useStore";
import { Button } from "@/components/ui/Button";

// #116: notices that depend on where Stratovell runs.
//   - In the desktop application: a workspace recovered at launch, a save that
//     failed, and the labelled test provider.
//   - On the website's scripted preview: that Stratovell is a desktop
//     application, with the download page one click away.
// Read after mount only, so server and client render the same first frame.

/** The desktop application's own information, or null in a browser (and until mounted). */
export function useDesktopInfo(): DesktopAppInfo | null {
  const [info, setInfo] = React.useState<DesktopAppInfo | null>(null);
  React.useEffect(() => {
    const b = desktopBridge();
    if (b) setInfo(b.info());
  }, []);
  return info;
}

export function DesktopNotices() {
  const info = useDesktopInfo();
  const [saveProblem, setSaveProblem] = React.useState<string | null>(null);
  const [recoveryOpen, setRecoveryOpen] = React.useState(true);
  const [isBrowser, setIsBrowser] = React.useState(false);
  React.useEffect(() => {
    const b = desktopBridge();
    setIsBrowser(!b);
    return b ? b.onSaveProblem(setSaveProblem) : undefined;
  }, []);
  const mode = useCopilotMode();

  if (isBrowser)
    return mode?.mode === "demo" ? (
      <div className="border-b border-gold-200 bg-gold-50 px-6 lg:px-10 py-2 text-[12.5px] text-ink-800" data-testid="web-preview-banner">
        <p className="max-w-[1500px] mx-auto">
          This website is a scripted preview of Stratovell, a desktop application that runs on your own computer.{" "}
          <Link href="/download" className="font-medium text-navy-700 hover:underline">
            Get Stratovell for Windows
          </Link>
        </p>
      </div>
    ) : null;
  if (!info) return null;
  return (
    <>
      {info.loadProblem && <LoadProblemNotice problem={info.loadProblem} />}
      {saveProblem && (
        <div role="alert" className="border-b border-negative-500 bg-negative-50 px-6 lg:px-10 py-2 text-[12.5px] text-negative-600" data-testid="desktop-save-problem">
          <p className="max-w-[1500px] mx-auto">
            Stratovell couldn&apos;t save your latest changes: {saveProblem} They are still open in this window and Stratovell keeps trying; to be safe, export a backup from{" "}
            <Link href="/settings#backup" className="font-medium underline">
              Settings
            </Link>
            .
          </p>
        </div>
      )}
      {info.recovery && recoveryOpen && (
        <div className="border-b border-gold-200 bg-gold-50 px-6 lg:px-10 py-2 text-[12.5px] text-ink-800" data-testid="desktop-recovery">
          <p className="max-w-[1500px] mx-auto">
            Your workspace file couldn&apos;t be read at launch, so Stratovell opened the {info.recovery.from === "previous" ? "copy saved just before it" : "daily backup"} from{" "}
            {new Date(info.recovery.savedAt).toLocaleString()}.{info.recovery.movedAside ? " The unreadable file was kept, not deleted." : ""} Check your latest changes.{" "}
            <button type="button" className="font-medium text-navy-700 hover:underline" onClick={() => setRecoveryOpen(false)}>
              Dismiss
            </button>
          </p>
        </div>
      )}
      {info.testProvider && (
        <div className="border-b border-warning-500 bg-warning-50 px-6 lg:px-10 py-1.5 text-[12px] text-ink-800" data-testid="desktop-test-provider">
          <p className="max-w-[1500px] mx-auto">Test provider: this window answers analyses with a deterministic test provider. No model, no API calls; its drafts are labelled as test examples.</p>
        </div>
      )}
    </>
  );
}

/**
 * Codex finding A: saved files exist but none could be read. Nothing was changed
 * on disk and the application saves nothing until the advisor chooses: restore a
 * backup (Settings), start over with the fictional sample after the unreadable
 * files are copied aside, or quit. Blocking until a choice is made.
 */
function LoadProblemNotice({ problem }: { problem: NonNullable<DesktopAppInfo["loadProblem"]> }) {
  const router = useRouter();
  const resetSeed = useAtlasStore((s) => s.resetSeed);
  const [view, setView] = React.useState<"blocking" | "restoring" | "resolved">("blocking");
  const [error, setError] = React.useState<string | null>(null);

  // While the advisor restores a backup in Settings, watch for the restore to clear the problem.
  React.useEffect(() => {
    if (view !== "restoring") return;
    const t = setInterval(() => {
      if (!desktopBridge()?.info().loadProblem) setView("resolved");
    }, 1500);
    return () => clearInterval(t);
  }, [view]);

  if (view === "resolved") return null;

  function startOver() {
    const r = desktopBridge()?.workspace.continueAfterLoadProblem();
    if (!r || !r.ok) return setError(r ? r.error : "Stratovell couldn't change the workspace.");
    resetSeed();
    setView("resolved");
    router.push("/welcome");
  }
  const files = problem.files.map((f) => `${f.name} (${f.kind === "malformed" ? "not a readable workspace" : "couldn't be read"})`).join(", ");

  if (view === "restoring")
    return (
      <div role="alert" className="border-b border-negative-500 bg-negative-50 px-6 lg:px-10 py-2 text-[12.5px] text-ink-800" data-testid="desktop-load-problem-banner">
        <p className="max-w-[1500px] mx-auto">
          Saving is paused: your saved workspace couldn&apos;t be read, and nothing has been changed. Restore a backup in{" "}
          <Link href="/settings#backup" className="font-medium underline">
            Settings
          </Link>
          , or{" "}
          <button type="button" className="font-medium text-navy-700 hover:underline" onClick={startOver}>
            start over with the fictional sample
          </button>{" "}
          (the unreadable files are kept). Nothing else you change here is saved.
          {error && <span className="block text-negative-600">{error}</span>}
        </p>
      </div>
    );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-6" data-testid="desktop-load-problem">
      <div role="alertdialog" aria-modal="true" aria-labelledby="load-problem-title" className="max-w-xl rounded-lg bg-white p-6 shadow-xl ring-1 ring-ink-100 space-y-3 text-[13px] text-ink-700">
        <h2 id="load-problem-title" className="text-[15px] font-semibold text-ink-900">
          Stratovell couldn&apos;t open your saved workspace
        </h2>
        <p>
          None of the saved copies in <span className="font-mono text-[12px] break-all">{problem.folder}</span> could be read: {files}.
        </p>
        <p>
          <strong>Nothing was changed or deleted</strong>, and Stratovell saves nothing until you choose how to continue.
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>Restore a backup</strong> you exported earlier (Settings → Backup &amp; restore). The unreadable files are kept first.
          </li>
          <li>
            <strong>Start over with the fictional sample.</strong> Copies of the unreadable files are kept in an &ldquo;unreadable-…&rdquo; folder beside them first.
          </li>
          <li>
            <strong>Quit</strong> and keep everything as it is, for example to ask for help with the files.
          </li>
        </ul>
        {error && (
          <p role="alert" className="text-negative-600">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            variant="secondary"
            onClick={() => {
              setView("restoring");
              router.push("/settings#backup");
            }}
            data-testid="load-problem-restore"
          >
            Restore a backup
          </Button>
          <Button onClick={startOver} data-testid="load-problem-start-over">
            Start over with the fictional sample
          </Button>
          <Button variant="secondary" onClick={() => window.close()} data-testid="load-problem-quit">
            Quit Stratovell
          </Button>
        </div>
      </div>
    </div>
  );
}
