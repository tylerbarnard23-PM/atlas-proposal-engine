"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, ListChecks } from "lucide-react";
import type { ComplianceCheck } from "@/domain/types";
import { READINESS_FIX, readinessTodo } from "./ReadinessChecklist";
import { cn } from "@/utils/cn";

// "Show me what's left": fired when someone tries a locked action (e.g. the
// final PDF button). The banner and the sidebar items that need work pulse
// briefly so the eye goes to where the work is.
export const READINESS_NUDGE_EVENT = "atlas:readiness-nudge";

export function nudgeReadiness() {
  window.dispatchEvent(new Event(READINESS_NUDGE_EVENT));
}

export function useReadinessNudge(durationMs = 3500): boolean {
  const [active, setActive] = React.useState(false);
  React.useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const on = () => {
      setActive(true);
      clearTimeout(t);
      t = setTimeout(() => setActive(false), durationMs);
    };
    window.addEventListener(READINESS_NUDGE_EVENT, on);
    return () => {
      window.removeEventListener(READINESS_NUDGE_EVENT, on);
      clearTimeout(t);
    };
  }, [durationMs]);
  return active;
}

export interface ReadinessStep {
  href: string;
  label: string;
  items: ComplianceCheck[];
}

// Groups open checks by the page that resolves them, in checklist order, so
// the advisor sees "go here, then here" rather than a list of rule names.
export function readinessSteps(failing: ComplianceCheck[]): ReadinessStep[] {
  const steps = new Map<string, ReadinessStep>();
  for (const c of failing) {
    const fix = READINESS_FIX[c.code];
    if (!fix) continue;
    const step = steps.get(fix.href) ?? { href: fix.href, label: fix.label, items: [] };
    step.items.push(c);
    steps.set(fix.href, step);
  }
  return [...steps.values()];
}

export function ReadinessBanner({
  checks,
  readyAction,
  className,
}: {
  checks: ComplianceCheck[];
  // What the green "ready" state offers: a link elsewhere, or an inline button.
  readyAction?: React.ReactNode;
  className?: string;
}) {
  const failing = checks.filter((c) => !c.passed);
  const nudged = useReadinessNudge();

  if (failing.length === 0) {
    return (
      <div
        role="status"
        className={cn(
          "rounded-lg bg-positive-50 ring-2 ring-positive-500/50 shadow-[0_0_0_6px_rgba(46,125,79,0.08)] px-5 py-4 flex flex-wrap items-center gap-4",
          className
        )}
      >
        <CheckCircle2 className="h-7 w-7 text-positive-500 shrink-0" />
        <div className="flex-1 min-w-[220px]">
          <div className="font-serif text-lg text-ink-900">Ready for final generation</div>
          <div className="text-[13px] text-ink-600">
            All {checks.length} readiness checks pass. The final PDF is unlocked.
          </div>
        </div>
        {readyAction ?? (
          <Link
            href="/pdf-preview"
            className="inline-flex items-center gap-1.5 rounded-md bg-positive-600 text-white px-4 h-9 text-[13px] font-medium hover:bg-positive-500"
          >
            Generate final PDF <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </div>
    );
  }

  const steps = readinessSteps(failing);
  return (
    <div
      role="status"
      className={cn(
        "rounded-lg bg-warning-50 ring-1 ring-warning-500/40 px-5 py-4 transition-shadow",
        nudged && "ring-2 ring-warning-500 shadow-[0_0_0_6px_rgba(160,120,21,0.18)] animate-pulse",
        className
      )}
    >
      <div className="flex items-center gap-2">
        <ListChecks className="h-5 w-5 text-warning-500" />
        <div className="font-medium text-ink-900">
          {failing.length} item{failing.length === 1 ? "" : "s"} left before the final PDF
        </div>
        <span className="text-[12px] text-ink-600 ml-1">
          · each is done on another page: use the buttons here or the highlighted items in the left menu
        </span>
      </div>
      <ol className="mt-3 space-y-2">
        {steps.map((step, i) => (
          <li key={step.href} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
            <span className="h-5 w-5 rounded-full bg-warning-500 text-white text-[11px] font-semibold flex items-center justify-center shrink-0">
              {i + 1}
            </span>
            <span className="text-ink-800 flex-1 min-w-[200px]">
              {step.items.map(readinessTodo).join(" · ")}
            </span>
            <Link
              href={step.href}
              className="inline-flex items-center gap-1 rounded-md bg-paper ring-1 ring-ink-200 px-2.5 h-7 text-[12px] font-medium text-navy-700 hover:ring-navy-300"
            >
              Go to {step.label} <ArrowRight className="h-3 w-3" />
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
