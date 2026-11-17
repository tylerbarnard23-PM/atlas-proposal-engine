"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { useAtlasStore } from "@/store/useStore";
import { ProposalPdfTemplate } from "@/pdf/templates/ProposalPdfTemplate";
import { ClientOnly } from "@/components/layout/ClientOnly";
import { snapshotTemplateProps } from "@/engines/approvedSnapshot";
import { MEETING_SCREEN_CSS, MeetingDocumentRegion, useFitScale, type MeetingFitMode } from "./meetingFit";

// D3: the read-only meeting view of one approved version. It renders the
// shared template from the version's frozen inputs at its approval time,
// exactly as a final PDF from it would, and never reads the live workspace.
// Viewing is not issuing: the document says so.

export default function MeetingPage() {
  return (
    <ClientOnly fallback={<div style={{ padding: 24, fontFamily: "ui-sans-serif" }}>Loading approved version…</div>}>
      <Inner />
    </ClientOnly>
  );
}

const bar: React.CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 10,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "8px 16px",
  background: "#172F52",
  color: "white",
  fontFamily: "ui-sans-serif, system-ui, sans-serif",
  fontSize: 13,
  flexWrap: "wrap",
};

const toggle: React.CSSProperties = {
  background: "transparent",
  color: "white",
  border: "1px solid rgba(255,255,255,0.6)",
  borderRadius: 6,
  padding: "4px 10px",
  font: "inherit",
  cursor: "pointer",
};

function Inner() {
  const params = useParams<{ id: string }>();
  const snapshot = useAtlasStore((s) => s.snapshots.find((x) => x.id === params?.id));
  const props = React.useMemo(
    () => (snapshot ? snapshotTemplateProps(snapshot, { variant: "final", presentation: "meeting", timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }) : null),
    [snapshot]
  );
  const region = React.useRef<HTMLDivElement>(null);
  const scale = useFitScale(region, props !== null);
  const [mode, setMode] = React.useState<MeetingFitMode>("fit");
  if (!snapshot || !props) {
    return (
      <div style={{ padding: 24, fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
        This approved version isn&apos;t in this browser&apos;s workspace. <a href="/review">Back to Review &amp; present</a>
      </div>
    );
  }
  return (
    <>
      <div style={bar} className="no-print" role="banner">
        <span>
          Approved version {snapshot.version} · read-only meeting view, not an issued document
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {scale < 1 && (
            <button type="button" style={toggle} onClick={() => setMode(mode === "fit" ? "actual" : "fit")}>
              {mode === "fit" ? "Actual size" : "Fit to screen"}
            </button>
          )}
          <a href="/review" style={{ color: "white", textDecoration: "underline" }}>
            Back to Review &amp; present
          </a>
        </span>
      </div>
      <style dangerouslySetInnerHTML={{ __html: MEETING_SCREEN_CSS }} />
      <MeetingDocumentRegion ref={region} scale={scale} mode={mode}>
        <ProposalPdfTemplate {...props} />
      </MeetingDocumentRegion>
    </>
  );
}
