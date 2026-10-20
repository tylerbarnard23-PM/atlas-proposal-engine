"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Circle } from "lucide-react";
import type { ComplianceCheck } from "@/domain/types";
import { cn } from "@/utils/cn";

// Where each readiness check gets resolved. Keeps the "what do I do next?"
// answer next to the check instead of making the advisor hunt for it.
export const READINESS_FIX: Record<string, { href: string; label: string; hint: string }> = {
  client_profile: { href: "/client-profile", label: "Client Profile", hint: "Add the client's name, base currency and country of residence." },
  advisor_profile: { href: "/client-profile", label: "Client Profile", hint: "Fill in the advisor name and firm name." },
  accounts_present: { href: "/accounts-assets", label: "Accounts & Assets", hint: "Add an account, or import one from a statement." },
  holdings_present: { href: "/import-center", label: "Import Center", hint: "Import holdings from a statement or add them by hand." },
  output_currency: { href: "/client-profile", label: "Client Profile", hint: "Choose the proposal's output currency." },
  unverified_holdings: { href: "/accounts-assets?review=1", label: "Accounts & Assets", hint: "Open each flagged holding, check its value, then mark it advisor approved." },
  stale_valuations: { href: "/accounts-assets?review=1", label: "Accounts & Assets", hint: "Review stale prices: refresh them in Market Data or confirm the value on the holding." },
  market_data: { href: "/accounts-assets?review=1", label: "Accounts & Assets", hint: "Review holdings priced from mock data and confirm or override their values." },
  approved_recs: { href: "/recommendations", label: "Recommendations", hint: "Approve at least one recommendation and include it in the PDF." },
  disclosures_included: { href: "/assumptions-disclosures", label: "Assumptions & Disclosures", hint: "Include the required disclosures." },
};

export function ReadinessChecklist({
  checks,
  compact = false,
  className,
}: {
  checks: ComplianceCheck[];
  compact?: boolean;
  className?: string;
}) {
  return (
    <ul className={cn("space-y-2", className)}>
      {checks.map((c) => {
        const fix = READINESS_FIX[c.code];
        return (
          <li
            key={c.code}
            className={cn(
              "flex items-start gap-2 text-[13px] rounded-md",
              !c.passed && "bg-warning-50 ring-1 ring-inset ring-warning-500/30 px-2 py-1.5 -mx-2"
            )}
          >
            {c.passed ? (
              <CheckCircle2 className="h-4 w-4 mt-px shrink-0 text-positive-500" aria-label="Passed" />
            ) : (
              <Circle className="h-4 w-4 mt-px shrink-0 text-warning-500" aria-label="Needs work" />
            )}
            <div className="flex-1 min-w-0">
              <div className={c.passed ? "text-ink-700" : "text-ink-900 font-medium"}>{c.label}</div>
              {!c.passed && (
                <>
                  {c.detail && <div className="text-2xs text-warning-600">{c.detail}</div>}
                  {!compact && fix && <div className="text-2xs text-ink-600 mt-0.5">{fix.hint}</div>}
                  {fix && (
                    <Link
                      href={fix.href}
                      className="inline-flex items-center gap-1 text-[12px] font-medium text-navy-700 hover:underline mt-0.5"
                    >
                      Fix in {fix.label} <ArrowRight className="h-3 w-3" />
                    </Link>
                  )}
                </>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
