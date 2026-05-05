import * as React from "react";
import { cn } from "@/utils/cn";
import { Card } from "./Card";

interface KpiCardProps {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  delta?: React.ReactNode;
  tone?: "default" | "positive" | "warning" | "negative" | "navy";
  icon?: React.ReactNode;
}

export function KpiCard({ label, value, hint, delta, tone = "default", icon }: KpiCardProps) {
  const accent =
    tone === "positive"
      ? "before:bg-positive-500"
      : tone === "warning"
      ? "before:bg-warning-500"
      : tone === "negative"
      ? "before:bg-negative-500"
      : tone === "navy"
      ? "before:bg-navy-700"
      : "before:bg-gold-400";
  return (
    <Card className={cn("relative overflow-hidden before:content-[''] before:absolute before:inset-y-0 before:left-0 before:w-[3px]", accent)}>
      <div className="px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-2xs uppercase tracking-widest text-ink-500 font-medium">{label}</span>
          {icon && <span className="text-ink-400">{icon}</span>}
        </div>
        <div className="font-serif text-[26px] leading-tight tabular text-ink-900 mt-1">{value}</div>
        <div className="flex items-center justify-between gap-2 mt-1">
          {hint && <span className="text-xs text-ink-500">{hint}</span>}
          {delta && <span className="text-xs font-medium tabular">{delta}</span>}
        </div>
      </div>
    </Card>
  );
}
