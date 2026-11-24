"use client";

import * as React from "react";
import Link from "next/link";
import { desktopBridge, type DesktopAppInfo } from "@/store/workspaceStorage";
import { useCopilotMode } from "@/components/copilot/CopilotWorkspace";

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
