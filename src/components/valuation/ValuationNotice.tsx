"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { coverageLabel, describeUnvalued, type ValuationSummary } from "@/engines/valuationTotals";
import { cn } from "@/utils/cn";

// Shown wherever totals or charts appear while some holdings can't be valued
// in the reporting currency: what's missing, and where to fix it.
export function ValuationNotice({
  summary,
  reportingCurrency,
  className,
}: {
  summary: ValuationSummary;
  reportingCurrency: string;
  className?: string;
}) {
  if (summary.complete) return null;
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
        <span className="font-semibold text-warning-600">Valuation incomplete: {coverageLabel(summary)}.</span>{" "}
        {describeUnvalued(summary, reportingCurrency)} Totals and charts cover valued holdings only.
      </div>
      <Link href="/market-data" className="font-medium text-navy-700 hover:underline">
        Add the rate in Market Data →
      </Link>
    </div>
  );
}

/** Marks a chart or total that describes only the valued holdings. */
export function ValuedOnlyTag({ summary }: { summary: ValuationSummary }) {
  if (summary.complete) return null;
  return <Badge tone="warning">Valued holdings only</Badge>;
}
