"use client";
import * as React from "react";
import { cn } from "@/utils/cn";

export function Drawer({
  open,
  onClose,
  title,
  children,
  width = "max-w-xl",
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  width?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-ink-950/40" onClick={onClose} />
      <div
        className={cn(
          "absolute right-0 top-0 h-full w-full bg-paper border-l border-ink-100 shadow-elevated overflow-y-auto",
          width
        )}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 h-12 border-b border-ink-100 bg-paper">
          <h3 className="text-sm font-semibold text-ink-900">{title}</h3>
          <button onClick={onClose} className="text-ink-500 text-sm hover:text-ink-900">
            Close
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
