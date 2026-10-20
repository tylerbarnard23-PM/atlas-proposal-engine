"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, ChevronDown, CircleAlert } from "lucide-react";
import { useWorkspaceReadiness } from "@/hooks/useWorkspaceReadiness";
import { readinessSteps } from "@/components/proposal/ReadinessBanner";
import { readinessTodo } from "@/components/proposal/ReadinessChecklist";
import { cn } from "@/utils/cn";

// Always-visible proposal status in the top bar: amber with a count while
// work remains (click for where to go), green once the final PDF is unlocked.
export function ReadinessPill() {
  const { failing, ready } = useWorkspaceReadiness();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  if (ready) {
    return (
      <Link
        href="/pdf-preview"
        className="inline-flex items-center gap-1.5 rounded-full bg-positive-50 text-positive-600 ring-1 ring-positive-500/50 shadow-[0_0_0_4px_rgba(46,125,79,0.10)] px-3 h-7 text-[12px] font-semibold"
      >
        <CheckCircle2 className="h-3.5 w-3.5" /> Ready for final PDF
      </Link>
    );
  }

  const steps = readinessSteps(failing);
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-full bg-warning-50 text-warning-600 ring-1 ring-warning-500/40 px-3 h-7 text-[12px] font-semibold"
      >
        <CircleAlert className="h-3.5 w-3.5" />
        Final PDF: {failing.length} to resolve
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 rounded-lg bg-paper shadow-elevated ring-1 ring-ink-100 p-3 z-50">
          <div className="text-2xs uppercase tracking-widest text-ink-500 mb-2">Where to go next</div>
          <ol className="space-y-2">
            {steps.map((s, i) => (
              <li key={s.href}>
                <Link
                  href={s.href}
                  onClick={() => setOpen(false)}
                  className="flex items-start gap-2 rounded-md p-2 hover:bg-slatey-50"
                >
                  <span className="h-5 w-5 rounded-full bg-warning-500 text-white text-[11px] font-semibold flex items-center justify-center shrink-0">
                    {i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium text-navy-700">{s.label} →</span>
                    <span className="block text-2xs text-ink-600">{s.items.map(readinessTodo).join(" · ")}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
