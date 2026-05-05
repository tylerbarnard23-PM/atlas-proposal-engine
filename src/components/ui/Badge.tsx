import * as React from "react";
import { cn } from "@/utils/cn";

type Tone = "neutral" | "navy" | "positive" | "warning" | "negative" | "info" | "gold" | "ink";

const TONE: Record<Tone, string> = {
  neutral: "bg-slatey-100 text-ink-700 ring-ink-200",
  navy: "bg-navy-50 text-navy-700 ring-navy-200",
  positive: "bg-positive-50 text-positive-600 ring-positive-500/30",
  warning: "bg-warning-50 text-warning-600 ring-warning-500/30",
  negative: "bg-negative-50 text-negative-600 ring-negative-500/30",
  info: "bg-slatey-100 text-ink-700 ring-ink-200",
  gold: "bg-gold-50 text-gold-700 ring-gold-200",
  ink: "bg-ink-900 text-white ring-ink-900",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-medium tracking-wider uppercase ring-1 ring-inset",
        TONE[tone],
        className
      )}
      {...props}
    />
  );
}
