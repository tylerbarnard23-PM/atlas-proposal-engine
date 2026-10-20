"use client";

import * as React from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/utils/cn";

// Inline "why?" step for dismissing or rejecting: quick-pick reasons plus a
// free-text one. The reason is optional; confirming without one is fine.
export function ReasonPicker({
  prompt,
  reasons,
  confirmLabel,
  tone = "neutral",
  onConfirm,
  onCancel,
  className,
}: {
  prompt: string;
  reasons: string[];
  confirmLabel: string;
  tone?: "neutral" | "negative";
  onConfirm: (reason?: string) => void;
  onCancel: () => void;
  className?: string;
}) {
  const [picked, setPicked] = React.useState<string | null>(null);
  const [other, setOther] = React.useState("");
  const reason = other.trim() || picked || undefined;

  return (
    <div className={cn("rounded-md bg-slatey-50 ring-1 ring-inset ring-ink-200 px-3 py-2.5 space-y-2", className)}>
      <div className="text-[12px] font-medium text-ink-700">{prompt}</div>
      <div className="flex flex-wrap gap-1.5">
        {reasons.map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={picked === r}
            onClick={() => setPicked(picked === r ? null : r)}
            className={cn(
              "rounded-full px-2.5 py-1 text-[12px] ring-1 ring-inset transition-colors",
              picked === r ? "bg-navy-800 text-white ring-navy-800" : "bg-white text-ink-700 ring-ink-200 hover:ring-ink-400"
            )}
          >
            {r}
          </button>
        ))}
      </div>
      <input
        value={other}
        onChange={(e) => setOther(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onConfirm(reason);
          if (e.key === "Escape") onCancel();
        }}
        placeholder="Or type a reason"
        aria-label="Reason"
        className="w-full rounded border border-ink-200 bg-white px-2.5 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-navy-500/30"
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          className={cn(tone === "negative" && "bg-negative-600 hover:bg-negative-500 border-negative-600")}
          onClick={() => onConfirm(reason)}
        >
          {confirmLabel}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
