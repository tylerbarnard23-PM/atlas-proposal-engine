"use client";

import * as React from "react";
import { AlertTriangle, Download, Upload } from "lucide-react";
import { useAtlasStore } from "@/store/useStore";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
  BACKUP_NOTICE,
  BACKUP_OMISSIONS,
  backupPreview,
  exportBackup,
  readBackupFile,
  restoredState,
  type BackupPreview,
  type WorkspaceBackup,
} from "@/engines/workspaceBackup";
import { describeLink, linksNeedingReview } from "@/engines/recommendationLinks";
import { formatTotal } from "@/engines/valuationTotals";
import { formatDateTime } from "@/utils/formatting";

// Settings → Backup & restore (R23a, #55). Export writes the current
// engagement to a local file; restore checks a file completely, previews it,
// and replaces the workspace only when the advisor confirms. Nothing is
// uploaded anywhere. The file isn't encrypted (see the notice).

const CONFIRMATION_LABEL: Record<BackupPreview["incoming"]["fxConfirmation"], string> = {
  none: "none needed or recorded",
  valid: "valid now",
  expired: "expired (won't count; confirm again after restoring if still appropriate)",
  changed: "no longer applies to these rates",
  invalid: "not valid (its times are unreadable, in the future or inconsistent)",
};

type Pending = { backup: WorkspaceBackup; preview: BackupPreview; fileName: string };

export function WorkspaceBackupPanel() {
  const restoreWorkspace = useAtlasStore((s) => s.restoreWorkspace);
  const recommendations = useAtlasStore((s) => s.recommendations);
  const holdings = useAtlasStore((s) => s.holdings);
  const accounts = useAtlasStore((s) => s.accounts);
  const needReview = React.useMemo(() => linksNeedingReview({ recommendations, holdings, accounts }), [recommendations, holdings, accounts]);
  const [pending, setPending] = React.useState<Pending | null>(null);
  const [errors, setErrors] = React.useState<string[] | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [replaceFirm, setReplaceFirm] = React.useState(false);
  const fileInput = React.useRef<HTMLInputElement>(null);

  // The exact file is validated as a restore would (engines/workspaceBackup
  // exportBackup) before anything is downloaded or announced.
  function exportWorkspace() {
    setErrors(null);
    setMessage(null);
    const state = useAtlasStore.getState();
    const result = exportBackup(state, new Date(), { disclosureIds: state.disclosures.map((d) => d.id) });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    try {
      const url = URL.createObjectURL(new Blob([result.text], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = result.fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (err) {
      setErrors([`The browser couldn't save the file (${(err as Error).message || "unknown error"}). Nothing was changed.`]);
      return;
    }
    const review = linksNeedingReview(state);
    setMessage(
      `Exported ${result.fileName}. Keep it somewhere private: it isn't encrypted.` +
        (review.length > 0 ? ` It includes ${review.length} recommendation${review.length === 1 ? "" : "s"} still marked for review.` : "")
    );
  }

  function reset() {
    setPending(null);
    setReplaceFirm(false);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function choose(file: File | undefined) {
    setErrors(null);
    setMessage(null);
    reset();
    if (!file) return;
    try {
      const state = useAtlasStore.getState();
      const parsed = await readBackupFile(file, { disclosureIds: state.disclosures.map((d) => d.id) });
      if (!parsed.ok) {
        setErrors(parsed.errors);
        if (fileInput.current) fileInput.current.value = "";
        return;
      }
      setPending({ backup: parsed.backup, preview: backupPreview(parsed.backup, useAtlasStore.getState(), new Date()), fileName: file.name });
    } catch (err) {
      setErrors([`${file.name} couldn't be checked (${(err as Error).message || "unknown error"}).`]);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function replace() {
    if (!pending) return;
    const state = useAtlasStore.getState();
    const result = restoreWorkspace(restoredState(pending.backup, { advisor: state.advisor, disclosures: state.disclosures }, { replaceFirm }));
    if (result.ok) {
      setMessage(`Restored ${pending.preview.incoming.clientName} from ${pending.fileName}. Readiness checks and the FX confirmation were re-evaluated as of now.`);
      reset();
    } else {
      setErrors([result.error]);
    }
  }

  const p = pending?.preview;
  return (
    <Card className="mb-5" data-testid="backup-panel">
      <CardBody className="space-y-3">
        <p className="text-sm text-ink-700">
          Save the current engagement to a file on this computer, or restore one saved earlier. Nothing is uploaded. Restoring replaces the current
          engagement; your firm &amp; branding are kept unless you choose otherwise.
        </p>
        <div className="flex items-start gap-2 rounded-md bg-warning-50 ring-1 ring-inset ring-warning-500/40 px-3 py-2 text-[13px] text-ink-800">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-warning-500" />
          <span>{BACKUP_NOTICE}</span>
        </div>
        {needReview.length > 0 && (
          <div role="status" data-testid="backup-review-note" className="rounded-md bg-warning-50 ring-1 ring-inset ring-warning-500/40 px-3 py-2 text-[13px] text-ink-800">
            {needReview.length} recommendation{needReview.length === 1 ? " refers" : "s refer"} to a holding or account that was removed and{" "}
            {needReview.length === 1 ? "is" : "are"} marked for review ({needReview.map(describeLink).join("; ")}). A backup keeps{" "}
            {needReview.length === 1 ? "it" : "them"} as {needReview.length === 1 ? "it is" : "they are"}, still marked; the final PDF waits until you relink, reject or
            delete {needReview.length === 1 ? "it" : "them"} in Recommendations.
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" iconLeft={<Download className="h-4 w-4" />} onClick={exportWorkspace}>
            Export workspace backup
          </Button>
          <Button variant="secondary" iconLeft={<Upload className="h-4 w-4" />} onClick={() => fileInput.current?.click()}>
            Restore from backup…
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            className="hidden"
            data-testid="backup-file"
            onChange={(e) => {
              void choose(e.target.files?.[0]);
            }}
          />
        </div>
        <details className="text-2xs text-ink-500">
          <summary className="cursor-pointer">What a backup leaves out</summary>
          <ul className="list-disc pl-5 mt-1 space-y-0.5">
            {BACKUP_OMISSIONS.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
        </details>

        {message && (
          <div role="status" data-testid="backup-message" className="rounded-md bg-slatey-50 ring-1 ring-inset ring-ink-200 px-3 py-2 text-[13px] text-ink-700">
            {message}
          </div>
        )}
        {errors && (
          <div role="alert" data-testid="backup-errors" className="rounded-md bg-negative-50 ring-1 ring-inset ring-negative-500/30 px-3 py-2 text-[13px] text-ink-800">
            <div className="font-semibold text-negative-600">Nothing was exported, restored or changed.</div>
            <ul className="list-disc pl-5 mt-1">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}

        {p && pending && (
          <div data-testid="backup-preview" className="rounded-md ring-1 ring-inset ring-ink-200 px-4 py-3 space-y-3 text-[13px] text-ink-800">
            <div className="font-semibold">Restore {pending.fileName}?</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <div className="text-2xs uppercase tracking-wide text-ink-500">From the backup</div>
                <div className="font-medium">{p.incoming.clientName}</div>
                {p.incoming.householdName && p.incoming.householdName !== p.incoming.clientName && <div>{p.incoming.householdName}</div>}
                <div>Exported {formatDateTime(p.incoming.exportedAt)}</div>
                <div>
                  {p.incoming.accounts} accounts · {p.incoming.holdings} holdings · {p.incoming.recommendations} recommendations ({p.incoming.approvedRecommendations} approved)
                </div>
                <div>
                  Net worth {formatTotal(p.incoming.valuation.net, p.incoming.reportingCurrency)}
                  {!p.incoming.valuation.complete && ` (${p.incoming.valuation.holdingsValued} of ${p.incoming.valuation.holdingsTotal} holdings valued)`}
                </div>
                <div>FX confirmation: {CONFIRMATION_LABEL[p.incoming.fxConfirmation]}</div>
                {p.incoming.recommendationsNeedingReview > 0 && (
                  <div>
                    {p.incoming.recommendationsNeedingReview} recommendation{p.incoming.recommendationsNeedingReview === 1 ? "" : "s"} marked for review: the linked
                    holding or account was removed. The final PDF waits for that review.
                  </div>
                )}
                {p.incoming.sourceFilesNotIncluded.length > 0 && (
                  <div>
                    {p.incoming.sourceDocuments} source document{p.incoming.sourceDocuments === 1 ? "" : "s"}; original files not included:{" "}
                    {p.incoming.sourceFilesNotIncluded.join(", ")}
                  </div>
                )}
              </div>
              <div>
                <div className="text-2xs uppercase tracking-wide text-ink-500">Replaces the current workspace</div>
                <div className="font-medium">{p.current.clientName}</div>
                <div>
                  {p.current.accounts} accounts · {p.current.holdings} holdings · {p.current.recommendations} recommendations · {p.current.sourceDocuments} source
                  documents · {p.current.pdfHistory} PDF generations
                </div>
                <div className="mt-1">
                  Firm &amp; branding: <strong>kept</strong> ({p.firm.keptFirmName || "not set"}).
                </div>
                {p.firm.differs && (
                  <label className="mt-1 flex items-start gap-2">
                    <input type="checkbox" checked={replaceFirm} onChange={(e) => setReplaceFirm(e.target.checked)} data-testid="backup-replace-firm" />
                    <span>Also replace firm &amp; branding with the backup&apos;s ({p.firm.backupFirmName || "not set"})</span>
                  </label>
                )}
              </div>
            </div>
            <p className="text-2xs text-ink-500">
              Readiness checks apply as usual after restoring: a recorded FX confirmation is re-checked against today&apos;s date and the rates, never renewed.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="danger" onClick={replace} data-testid="backup-replace">
                Replace current workspace
              </Button>
              <Button variant="secondary" onClick={exportWorkspace}>
                Export current workspace first
              </Button>
              <Button variant="ghost" onClick={reset} data-testid="backup-cancel">
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
