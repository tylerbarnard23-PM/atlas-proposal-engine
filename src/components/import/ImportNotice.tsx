"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { useAtlasStore } from "@/store/useStore";
import { describeImportIssue, importIssues } from "@/engines/importCompleteness";
import { cn } from "@/utils/cn";

// Shown wherever the portfolio is summarized while an imported document
// isn't fully accounted for: the workspace may be missing positions, so its
// totals aren't the whole portfolio. Confirming the imported rows doesn't
// clear it; only a complete import (or removing the incomplete one) does.
export function ImportNotice({ className }: { className?: string }) {
  const docs = useAtlasStore((s) => s.sourceDocuments);
  const holdings = useAtlasStore((s) => s.holdings);
  const issues = importIssues(docs, holdings);
  if (issues.length === 0) return null;
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-wrap items-start gap-x-3 gap-y-1 rounded-md bg-warning-50 ring-1 ring-inset ring-warning-500/40 px-4 py-2.5 text-[13px] text-ink-800",
        className
      )}
    >
      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-warning-500" />
      <div className="min-w-0 flex-1">
        <span className="font-semibold text-warning-600">Import incomplete:</span> {issues.map(describeImportIssue).join("; ")}. The
        workspace may be missing positions, so its totals aren&apos;t the whole portfolio, and the final PDF stays blocked. Confirming the
        imported rows doesn&apos;t change this.
      </div>
      <Link href="/accounts-assets?review=1" className="font-medium text-navy-700 hover:underline">
        Review the import →
      </Link>
    </div>
  );
}

/** Marks a recommendation whose holding came from an incomplete import. */
export function IncompleteImportTag() {
  return (
    <Badge tone="warning" title="This holding came from an import that doesn't account for the whole document; the trade may be sized against an incomplete portfolio.">
      From an incomplete import
    </Badge>
  );
}
