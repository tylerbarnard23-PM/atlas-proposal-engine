import * as React from "react";
import { cn } from "@/utils/cn";

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  eyebrow?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6", className)}>
      <div>
        {eyebrow && (
          <div className="text-2xs font-medium tracking-widest uppercase text-gold-500 mb-1">{eyebrow}</div>
        )}
        <h1 className="font-serif text-2xl md:text-[28px] text-ink-900 leading-tight">{title}</h1>
        {description && <p className="text-sm text-ink-500 mt-1.5 max-w-3xl">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}

export function SectionDivider({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 my-6">
      <div className="h-px bg-ink-100 flex-1" />
      {children && (
        <span className="text-2xs tracking-widest uppercase text-ink-500 font-semibold">{children}</span>
      )}
      <div className="h-px bg-ink-100 flex-1" />
    </div>
  );
}

export function StatPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "default" | "positive" | "warning" | "negative";
}) {
  const toneClass =
    tone === "positive"
      ? "text-positive-600"
      : tone === "warning"
      ? "text-warning-600"
      : tone === "negative"
      ? "text-negative-600"
      : "text-ink-900";
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-2xs uppercase tracking-widest text-ink-500 font-medium">{label}</span>
      <span className={cn("font-serif text-xl tabular leading-none", toneClass)}>{value}</span>
    </div>
  );
}
