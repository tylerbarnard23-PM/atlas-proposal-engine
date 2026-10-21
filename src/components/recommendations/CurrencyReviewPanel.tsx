"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import type { Recommendation } from "@/domain/types";
import { Button } from "@/components/ui/Button";
import type { FxContext } from "@/engines/proposalEngine";
import { describeConversion, resolveCurrencyReview } from "@/engines/recommendationAmounts";
import { formatDate, todayIso } from "@/utils/formatting";

// On a recommendation saved before amounts had their own currency (#24), when
// its old label differs from the currency its amounts were calculated in. The
// advisor keeps the amounts as calculated (no economic change), switches them
// to the old label's currency (an explicit change, shown first, which clears
// the approval), or edits them in the form.
export function CurrencyReviewPanel({
  rec,
  fx,
  onResolve,
  onEdit,
}: {
  rec: Recommendation;
  fx: FxContext;
  onResolve: (next: Recommendation) => void;
  onEdit: () => void;
}) {
  const [confirmingLegacy, setConfirmingLegacy] = React.useState(false);
  const review = rec.currencyReview;
  if (!review) return null;

  if (review.status !== "open") {
    return (
      <p className="mt-2 text-2xs text-ink-500">
        Currency confirmed{review.resolvedAt ? ` ${formatDate(review.resolvedAt)}` : ""}:{" "}
        {review.status === "kept" ? `amounts kept in ${review.calculatedIn}` : `amounts changed (now ${rec.currency})`}. Saved label before the
        update: {review.legacyLabel}.
      </p>
    );
  }

  const legacy = resolveCurrencyReview(rec, "legacy", fx, todayIso());
  return (
    <div role="alert" className="mt-3 rounded-md bg-warning-50 ring-1 ring-inset ring-warning-500/40 px-3 py-2.5 text-[13px] text-ink-800">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-warning-500" />
        <div className="min-w-0">
          <span className="font-semibold text-warning-600">Check this recommendation&apos;s currency.</span> Its amounts have been
          calculated in <strong>{review.calculatedIn}</strong>, but it was saved with the label <strong>{review.legacyLabel}</strong>. The
          old label is kept for reference only; it may have been a default and doesn&apos;t prove which currency was meant. Until you
          choose, an approved recommendation in the PDF blocks the final PDF.
        </div>
      </div>
      {confirmingLegacy && legacy.ok && legacy.effect ? (
        <div className="mt-2 pl-6 space-y-2">
          <div>
            Amount changes from <strong>{legacy.effect.from}</strong> to <strong>{legacy.effect.to}</strong>
            {legacy.conversion ? <> at {describeConversion(legacy.conversion)}</> : null}. This changes what the recommendation does,
            so its approval is cleared.
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => onResolve(legacy.rec)}>
              Use {review.legacyLabel} amounts
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmingLegacy(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-2 pl-6 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              const kept = resolveCurrencyReview(rec, "keep", fx, todayIso());
              if (kept.ok) onResolve(kept.rec);
            }}
          >
            Keep {review.calculatedIn} amounts (no change)
          </Button>
          <Button size="sm" variant="secondary" disabled={!legacy.ok} title={legacy.ok ? undefined : legacy.reason} onClick={() => setConfirmingLegacy(true)}>
            Treat as {review.legacyLabel}…
          </Button>
          <Button size="sm" variant="ghost" onClick={onEdit}>
            Edit amounts
          </Button>
          {!legacy.ok && <span className="text-2xs text-ink-500 self-center">{legacy.reason}</span>}
        </div>
      )}
    </div>
  );
}
