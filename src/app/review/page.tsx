"use client";

import * as React from "react";
import Link from "next/link";
import { BadgeCheck, ExternalLink, Lock } from "lucide-react";
import { useAtlasStore } from "@/store/useStore";
import { ClientOnly } from "@/components/layout/ClientOnly";
import { PageHeader } from "@/components/ui/Section";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Label, Textarea } from "@/components/ui/Input";
import { ReadinessChecklist } from "@/components/proposal/ReadinessChecklist";
import { ReadinessBanner, nudgeReadiness } from "@/components/proposal/ReadinessBanner";
import { requestPdf } from "@/components/proposal/requestPdf";
import { useWorkspaceReadiness } from "@/hooks/useWorkspaceReadiness";
import { useFxNow } from "@/hooks/useFxNow";
import { reviewedAlternative, snapshotStatus } from "@/engines/approvedSnapshot";
import { scopeAccountIds } from "@/engines/allocationDesk";
import { findRevision } from "@/engines/strategyProposals";
import { cn } from "@/utils/cn";
import { formatDateTime } from "@/utils/formatting";
import type { ApprovedSnapshot } from "@/domain/types";

// D3 — review once, present consistently. The advisor approves a version of
// the economic package once the shared readiness passes, presents it in a
// read-only meeting view, and issues final documents from that version. An
// approved version never changes; a changed proposal is approved again.

export default function ReviewPage() {
  return (
    <ClientOnly>
      <Inner />
    </ClientOnly>
  );
}

function Inner() {
  const state = useAtlasStore();
  const { checks, failing, ready } = useWorkspaceReadiness();
  const now = useFxNow();
  const [note, setNote] = React.useState("");
  const [message, setMessage] = React.useState<{ tone: "positive" | "negative"; text: string } | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  const draft = reviewedAlternative(state);
  const approvedCount = state.recommendations.filter((r) => r.approvedByAdvisor).length;
  const scope = scopeAccountIds(state.accounts, draft).length;
  const versions = [...state.snapshots].reverse();
  const nextVersion = Math.max(0, ...state.snapshots.map((s) => s.version)) + 1;

  function approve() {
    if (!ready) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      nudgeReadiness();
      return;
    }
    const r = state.approveVersion(note);
    if (r.ok) {
      setNote("");
      setMessage({ tone: "positive", text: `Version ${r.snapshot.version} approved. It won't change when the workspace does.` });
    } else {
      setMessage({ tone: "negative", text: `Not approved: ${r.failing.join("; ")}.` });
    }
  }

  async function issue(s: ApprovedSnapshot, variant: "draft" | "final") {
    setBusy(`${s.id}:${variant}`);
    setMessage(null);
    const r = await requestPdf({ proposalId: s.inputs.proposal.id, variant, body: { snapshot: s }, record: state.recordPdfJob, snapshot: { id: s.id, version: s.version } });
    setBusy(null);
    setMessage(r.ok ? { tone: "positive", text: `${r.fileName} downloaded from version ${s.version}.` } : { tone: "negative", text: r.error });
  }

  return (
    <>
      <PageHeader
        eyebrow="Proposal Output"
        title="Review & present"
        description="Approve a version of the economic package once every readiness check passes, present it read-only, and issue the final PDF from that version. Approving a version doesn't change action approvals or drafts, and later edits never change an approved version."
      />

      <ReadinessBanner checks={checks} className="mb-5" readyAction={<span className="text-[13px] text-ink-600">Approve a version below.</span>} />

      {message && (
        <div
          role="status"
          className={cn(
            "mb-5 rounded-md px-4 py-3 text-[13px] ring-1 ring-inset",
            message.tone === "positive" ? "bg-positive-50 text-positive-600 ring-positive-500/30" : "bg-negative-50 text-negative-600 ring-negative-500/30"
          )}
        >
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-5">
        <div className="space-y-5">
          <Card className={cn(ready && "ring-2 ring-positive-500/50")}>
            <CardHeader>
              <CardTitle>Approve version {nextVersion}</CardTitle>
            </CardHeader>
            <CardBody className="space-y-3">
              <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-[13px]">
                <dt className="text-ink-500">Alternative</dt>
                <dd>{draft.name}</dd>
                <dt className="text-ink-500">Scope</dt>
                <dd>{draft.scopeAccountIds == null ? `Every investment account (${scope})` : `${scope} account${scope === 1 ? "" : "s"}`}</dd>
                <dt className="text-ink-500">Approved actions</dt>
                <dd>{approvedCount}</dd>
                <dt className="text-ink-500">Model</dt>
                <dd>{draft.model ? `${findRevision(state.models, draft.model.id, draft.model.revision)?.name ?? draft.model.id} (rev ${draft.model.revision})` : "None pinned"}</dd>
              </dl>
              <p className="text-[12px] text-ink-600">
                The version freezes the accepted values and their dates, the exact exchange rates, the approved actions in order, funding and reserves, the
                current and proposed results, the disclosures, the model and strategy revisions used, and who approved it and when.
              </p>
              <div>
                <Label htmlFor="version-note">Note (optional)</Label>
                <Textarea id="version-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Reviewed with the household" />
              </div>
              <Button
                onClick={approve}
                aria-disabled={!ready}
                iconLeft={ready ? <BadgeCheck className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                className={cn(ready ? "bg-positive-600 hover:bg-positive-500 active:bg-positive-600" : "bg-slatey-300 text-ink-700 hover:bg-slatey-300")}
              >
                Approve version {nextVersion}
              </Button>
              {!ready && (
                <p className="text-[12px] text-warning-600">
                  {failing.length} readiness item{failing.length === 1 ? "" : "s"} to resolve first. A watermarked draft is always available from{" "}
                  <Link href="/pdf-preview" className="font-medium text-navy-700 hover:underline">PDF Preview</Link>.
                </p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Approved versions</CardTitle>
            </CardHeader>
            <CardBody className="p-0!">
              {versions.length === 0 ? (
                <div className="px-5 py-4 text-sm text-ink-500">No version approved yet.</div>
              ) : (
                <ul className="divide-y divide-ink-100">
                  {versions.map((s) => {
                    const status = snapshotStatus(s, state, now);
                    const docs = state.pdfHistory.filter((j) => j.snapshotId === s.id);
                    return (
                      <li key={s.id} className="px-5 py-4 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-serif text-base text-ink-900">Version {s.version}</span>
                          {status.kind === "matches" ? (
                            <Badge tone="positive">Matches the workspace</Badge>
                          ) : (
                            <Badge tone="warning">Workspace changed since: {status.parts.join(", ")}</Badge>
                          )}
                        </div>
                        <div className="text-[12px] text-ink-600">
                          Approved {formatDateTime(s.approvedAt)} by {s.approvedBy.name || "the advisor"} · {s.alternative.name} · {s.inputs.recommendations.length} action
                          {s.inputs.recommendations.length === 1 ? "" : "s"} · fingerprint {s.fingerprint}
                          {s.note ? ` · “${s.note}”` : ""}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <a
                            href={`/meeting/${s.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 bg-white px-3 h-8 text-[12px] font-medium text-ink-900 hover:bg-slatey-50"
                          >
                            Open meeting view <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                          <Button size="sm" onClick={() => issue(s, "final")} loading={busy === `${s.id}:final`} className="bg-positive-600 hover:bg-positive-500 active:bg-positive-600">
                            Issue final PDF
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => issue(s, "draft")} loading={busy === `${s.id}:draft`}>
                            Draft copy
                          </Button>
                        </div>
                        {docs.length > 0 && (
                          <ul className="text-[12px] text-ink-600">
                            {docs.map((j) => (
                              <li key={j.id}>
                                {j.variant === "final" ? "Issued" : "Draft copy"} {formatDateTime(j.completedAt ?? j.startedAt)}: {j.filename ?? j.errorMessage ?? j.status}
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Readiness now</CardTitle>
                <Badge tone={ready ? "positive" : "warning"}>
                  {checks.filter((c) => c.passed).length}/{checks.length}
                </Badge>
              </div>
            </CardHeader>
            <CardBody>
              <ReadinessChecklist checks={checks} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Viewing and issuing</CardTitle>
            </CardHeader>
            <CardBody className="space-y-2 text-[12px] text-ink-600">
              <p>The meeting view shows a version exactly as approved. It is read-only and is not an issued document.</p>
              <p>
                Issuing a final PDF re-checks readiness on the version&apos;s own inputs with the server&apos;s clock. Nothing is refreshed: if its exchange
                rates have aged past policy, approve a new version.
              </p>
              <p>Versions are local Atlas records, kept in this browser and in workspace backups. They are not tamper-proof and record no client acknowledgement.</p>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
