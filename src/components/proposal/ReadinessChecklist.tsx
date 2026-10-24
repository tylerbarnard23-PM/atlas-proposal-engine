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
  advisor_profile: { href: "/firm-branding", label: "Firm & Branding", hint: "Fill in the advisor name and firm name." },
  accounts_present: { href: "/accounts-assets", label: "Accounts & Assets", hint: "Add an account, or import one from a statement." },
  holdings_present: { href: "/import-center", label: "Import Center", hint: "Import holdings from a statement or add them by hand." },
  output_currency: { href: "/client-profile", label: "Client Profile", hint: "Choose the proposal's output currency." },
  unverified_holdings: { href: "/accounts-assets?review=1", label: "Accounts & Assets", hint: "Open each flagged holding, check its value, then click Confirm value." },
  stale_valuations: { href: "/accounts-assets?review=1", label: "Accounts & Assets", hint: "Review each out-of-date value: update it from a newer statement or your own figure, or confirm it on the holding. Confirming doesn't change its date." },
  market_data: { href: "/accounts-assets?review=1", label: "Accounts & Assets", hint: "Review holdings carrying placeholder values, then confirm or correct each value." },
  approved_recs: { href: "/recommendations", label: "Recommendations", hint: "Approve at least one recommendation and include it in the PDF." },
  trades_funded: { href: "/recommendations", label: "Recommendations", hint: "A proposed purchase is larger than the cash in its account. Reduce it or add a sale in the same account to fund it." },
  holdings_valued: { href: "/market-data", label: "Exchange rates", hint: "Some holdings are in a currency with no exchange rate to the reporting currency, so they're left out of every total. Add or refresh the rate in Exchange rates." },
  fx_current: {
    href: "/market-data",
    label: "Exchange rates",
    hint: "An exchange rate the proposal uses is older than the 7-day policy (or is unverified fallback data). Refresh the rates in Exchange rates, or confirm the rates you want to keep; a confirmation lapses after 7 days or when those rates or their use change.",
  },
  fx_available: { href: "/market-data", label: "Exchange rates", hint: "A proposed trade is in a currency with no exchange rate to the reporting currency, so it isn't applied. Refresh the rates in Exchange rates." },
  imports_complete: {
    href: "/accounts-assets?review=1",
    label: "Accounts & Assets",
    hint: "An imported document wasn't fully accounted for (its rows don't reach its stated total, or some rows couldn't be read). Confirming the imported rows doesn't fix that: import a complete copy of the document, or remove that import's holdings and enter the positions from the document by hand.",
  },
  recommendation_currency: {
    href: "/recommendations",
    label: "Recommendations",
    hint: "A recommendation saved before amounts had their own currency has an old currency label that differs from the currency its amounts were calculated in. On its card, keep the amounts as calculated, treat them as the old label's currency (converted at the shown rate), or edit them.",
  },
  disclosures_included: { href: "/assumptions-disclosures", label: "Assumptions & Disclosures", hint: "Include the required disclosures." },
};

// Each open check phrased as the thing to do, for banners and menus where a
// rule name reads like jargon.
export function readinessTodo(c: ComplianceCheck): string {
  const n = c.detail?.match(/\d[\d,]*/)?.[0];
  switch (c.code) {
    case "client_profile": return "Complete the client profile";
    case "advisor_profile": return "Add the advisor name and firm";
    case "accounts_present": return "Add at least one account";
    case "holdings_present": return "Add or import holdings";
    case "output_currency": return "Choose the output currency";
    case "unverified_holdings": return n ? `Confirm values for ${n} holding${n === "1" ? "" : "s"}` : "Confirm holding values";
    case "stale_valuations": return n ? `Review ${n} out-of-date value${n === "1" ? "" : "s"}` : "Review out-of-date values";
    case "market_data": return n ? `Review ${n} placeholder value${n === "1" ? "" : "s"}` : "Review placeholder values";
    case "approved_recs": return "Approve a recommendation and include it in the PDF";
    case "trades_funded": return c.detail ? `Fund proposed purchases (${c.detail})` : "Fund proposed purchases";
    case "holdings_valued": return c.detail ? `Value all holdings (${c.detail})` : "Value all holdings in the reporting currency";
    case "fx_current": return "Refresh or confirm exchange rates in use";
    case "fx_available": return c.detail ? `Add exchange rates (${c.detail})` : "Add exchange rates for proposed trades";
    case "imports_complete": return c.detail ? `Account for every imported document (${c.detail})` : "Account for every imported document";
    case "recommendation_currency": return "Confirm recommendation currencies";
    case "disclosures_included": return "Include the required disclosures";
    default: return c.label;
  }
}

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
