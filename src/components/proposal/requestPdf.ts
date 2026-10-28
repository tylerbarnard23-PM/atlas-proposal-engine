import type { PdfGenerationJob } from "@/domain/types";
import { safeId, todayIso } from "@/utils/formatting";

/**
 * Asks the server to render a proposal PDF and downloads it, recording the job
 * (running, then succeeded or failed) in the PDF history. Shared by the PDF
 * Preview (live drafts) and Review & present (documents from a version).
 */
export async function requestPdf(input: {
  proposalId: string;
  variant: "draft" | "final";
  body: object;
  record: (job: PdfGenerationJob) => void;
  /** D3: the approved version the document is rendered from. */
  snapshot?: { id: string; version: number };
}): Promise<{ ok: true; fileName: string } | { ok: false; error: string }> {
  const job: PdfGenerationJob = {
    id: safeId("pdf"),
    proposalId: input.proposalId,
    variant: input.variant,
    startedAt: todayIso(),
    status: "running",
    ...(input.snapshot ? { snapshotId: input.snapshot.id, snapshotVersion: input.snapshot.version } : {}),
  };
  input.record(job);
  try {
    const res = await fetch(`/api/proposals/${input.proposalId}/generate-pdf?variant=${input.variant}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Timestamps in the PDF (the prepared date) in this browser's time zone, as in the preview (#28).
      body: JSON.stringify({ ...input.body, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
    });
    if (!res.ok) {
      const text = await res.text();
      let message = text;
      try {
        message = JSON.parse(text).error ?? text;
      } catch {}
      throw new Error(message || `HTTP ${res.status}`);
    }
    const blob = await res.blob();
    const fileName = res.headers.get("X-Filename") ?? `proposal_${input.variant}.pdf`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    input.record({ ...job, status: "succeeded", completedAt: todayIso(), filename: fileName });
    return { ok: true, fileName };
  } catch (err) {
    const error = (err as Error).message;
    input.record({ ...job, status: "failed", completedAt: todayIso(), errorMessage: error });
    return { ok: false, error };
  }
}
