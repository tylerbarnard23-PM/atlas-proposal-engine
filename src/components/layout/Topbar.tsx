"use client";

import * as React from "react";
import { useAtlasStore } from "@/store/useStore";
import { Badge } from "@/components/ui/Badge";
import { ReadinessPill } from "./ReadinessPill";

export function Topbar() {
  const client = useAtlasStore((s) => s.client);
  const advisor = useAtlasStore((s) => s.advisor);
  const accounts = useAtlasStore((s) => s.accounts);
  const holdings = useAtlasStore((s) => s.holdings);
  const hydrated = useAtlasStore((s) => s.hasHydrated);

  return (
    <header className="sticky top-0 z-40 h-14 bg-paper/95 backdrop-blur-sm border-b border-ink-100 flex items-center px-6 gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <div className="text-[13px] text-ink-500">Engagement</div>
        <div className="font-medium text-ink-900 text-sm truncate">{client.householdName ?? client.fullName}</div>
        <Badge tone="navy" className="hidden md:inline-flex">{client.reportingCountry} · {client.proposalOutputCurrency}</Badge>
      </div>
      <div className="ml-auto flex items-center gap-4 text-xs text-ink-500">
        {/* Rendered after the saved workspace loads, so it never flashes the seed state. */}
        {hydrated && <ReadinessPill />}
        <div className="hidden lg:flex gap-4">
          <span><span className="text-ink-700 font-medium tabular">{accounts.length}</span> accounts</span>
          <span><span className="text-ink-700 font-medium tabular">{holdings.length}</span> holdings</span>
        </div>
        <div className="hidden md:flex flex-col items-end leading-tight">
          <span className="text-ink-900 text-[13px] font-medium">{advisor.name}</span>
          <span className="text-2xs">{advisor.firmName}</span>
        </div>
        <div className="h-8 w-8 rounded-full bg-navy-700 text-white text-[12px] font-medium flex items-center justify-center">
          {advisor.name
            .split(" ")
            .filter(Boolean)
            .slice(0, 2)
            .map((s) => s[0])
            .join("")}
        </div>
      </div>
    </header>
  );
}
