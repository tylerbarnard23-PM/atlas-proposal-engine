"use client";
import * as React from "react";
import { cn } from "@/utils/cn";

interface TabsProps {
  tabs: { key: string; label: string; disabled?: boolean; badge?: React.ReactNode }[];
  active: string;
  onChange: (key: string) => void;
  size?: "sm" | "md";
  className?: string;
}

export function Tabs({ tabs, active, onChange, size = "md", className }: TabsProps) {
  return (
    <div className={cn("border-b border-ink-100 flex gap-2 overflow-x-auto", className)}>
      {tabs.map((t) => {
        const isActive = t.key === active;
        return (
          <button
            key={t.key}
            disabled={t.disabled}
            onClick={() => onChange(t.key)}
            className={cn(
              "relative -mb-px flex items-center gap-2 border-b-2 px-3 transition-colors disabled:opacity-50",
              size === "sm" ? "h-8 text-[13px]" : "h-10 text-sm",
              isActive
                ? "border-navy-700 text-ink-900 font-semibold"
                : "border-transparent text-ink-500 hover:text-ink-800 hover:border-ink-200"
            )}
          >
            {t.label}
            {t.badge}
          </button>
        );
      })}
    </div>
  );
}
