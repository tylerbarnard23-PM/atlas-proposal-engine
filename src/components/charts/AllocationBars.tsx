"use client";

import * as React from "react";
import { formatCurrency, formatPercent } from "@/utils/formatting";

interface Row {
  label: string;
  value: number;
  pct: number;
}

const COLOR = ["bg-navy-700", "bg-navy-500", "bg-gold-500", "bg-gold-300", "bg-ink-500", "bg-slatey-400"];

export function AllocationBars({ rows, currency = "USD" }: { rows: Row[]; currency?: string }) {
  const max = Math.max(...rows.map((r) => r.pct), 1);
  return (
    <div className="space-y-2.5">
      {rows.map((r, i) => (
        <div key={r.label} className="flex items-center gap-3">
          <div className="text-[13px] text-ink-700 w-40 shrink-0 truncate">{r.label}</div>
          <div className="flex-1 h-2 rounded-full bg-slatey-100 overflow-hidden">
            <div
              className={`h-full ${COLOR[i % COLOR.length]}`}
              style={{ width: `${(r.pct / max) * 100}%` }}
            />
          </div>
          <div className="text-[13px] tabular w-24 text-right text-ink-700">{formatPercent(r.pct, 1)}</div>
          <div className="text-[13px] tabular w-28 text-right text-ink-500">
            {formatCurrency(r.value, currency, { compact: true })}
          </div>
        </div>
      ))}
    </div>
  );
}
