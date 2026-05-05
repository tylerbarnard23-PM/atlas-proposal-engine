"use client";

import * as React from "react";
import { useAtlasStore } from "@/store/useStore";

export function ClientOnly({ children, fallback }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  const hydrated = useAtlasStore((s) => s.hasHydrated);
  if (!hydrated) {
    return <>{fallback ?? <div className="text-sm text-ink-500">Loading workspace…</div>}</>;
  }
  return <>{children}</>;
}
