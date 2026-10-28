"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { useAtlasStore } from "@/store/useStore";
import { ProposalPdfTemplate } from "@/pdf/templates/ProposalPdfTemplate";
import { ClientOnly } from "@/components/layout/ClientOnly";
import { snapshotTemplateProps } from "@/engines/approvedSnapshot";

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
};

function Inner() {
  const params = useParams<{ id: string }>();
  const snapshot = useAtlasStore((s) => s.snapshots.find((x) => x.id === params?.id));
  const props = React.useMemo(
    () => (snapshot ? snapshotTemplateProps(snapshot, { variant: "final", presentation: "meeting", timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }) : null),
    [snapshot]
  );
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
        <a href="/review" style={{ color: "white", textDecoration: "underline" }}>
          Back to Review &amp; present
        </a>
      </div>
      <ProposalPdfTemplate {...props} />
    </>
  );
}
