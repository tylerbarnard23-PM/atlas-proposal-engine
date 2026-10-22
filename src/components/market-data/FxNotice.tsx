"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { useFxFreshness } from "@/hooks/useFxFreshness";
import { describeLeg, utcMinute } from "@/engines/fxPolicy";
import { cn } from "@/utils/cn";

// Shown where totals appear while an exchange rate the proposal uses is older
// than the FX policy (or unverified) and not confirmed (#26). The values still
// use those rates; this says how old they are and where to act.
export function FxNotice({ className }: { className?: string }) {
  const f = useFxFreshness();
  if (f.current) return null;
  const c = f.confirmation;
  return (
    <div
      role="alert"
      data-testid="fx-notice"
      className={cn(
        "flex flex-wrap items-start gap-x-3 gap-y-1 rounded-md bg-warning-50 ring-1 ring-inset ring-warning-500/40 px-4 py-2.5 text-[13px] text-ink-800",
        className
      )}
    >
      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-warning-500" />
      <div className="min-w-0 flex-1">
        <span className="font-semibold text-warning-600">Exchange rates older than {f.policyDays} days in use:</span> {f.attention.map(describeLeg).join("; ")}.
        Values use them as stored.
        {c.state === "expired" && <> The confirmation expired {utcMinute(c.expiresAt!)}.</>}
        {c.state === "invalid" && <> The stored confirmation isn&apos;t valid (its times are unreadable, in the future or inconsistent).</>}
        {c.state === "changed" && <> The earlier confirmation no longer applies (rates or their use changed).</>} The final PDF waits for a refresh or your
        confirmation.
      </div>
      <Link href="/market-data" className="font-medium text-navy-700 hover:underline">
        Refresh or confirm in Market Data →
      </Link>
    </div>
  );
}
