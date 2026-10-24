"use client";

import * as React from "react";
import { AlertTriangle, Calculator } from "lucide-react";
import type { RecommendationPreview, Movement } from "@/engines/recommendationPreview";
import { formatCurrency } from "@/utils/formatting";
import { cn } from "@/utils/cn";
import { describeMovement, signedMoney, signedPct, summarizePreview } from "./recEffect";

// The editor's live preview: this recommendation simulated with the complete
// proposal engine, before anything is saved. Updates as the holding, action,
// amount, percentage, currency or target change.

const STATE_LABEL: Record<RecommendationPreview["state"], { text: string; tone: string }> = {
  simulated: { text: "Simulated, not saved", tone: "bg-navy-50 text-navy-700 ring-navy-200" },
  no_change: { text: "No change", tone: "bg-slatey-100 text-ink-700 ring-ink-200" },
  advisory: { text: "Advisory only", tone: "bg-slatey-100 text-ink-700 ring-ink-200" },
  linked: { text: "Linked, see Allocation desk", tone: "bg-navy-50 text-navy-700 ring-navy-200" },
  missing_holding: { text: "Can't be applied", tone: "bg-warning-50 text-warning-600 ring-warning-500/40" },
  cannot_apply: { text: "Can't be applied", tone: "bg-warning-50 text-warning-600 ring-warning-500/40" },
};

const money = (n: number, cur: string) => (n < 0 ? `−${formatCurrency(-n, cur)}` : formatCurrency(n, cur));

function Figures({ m, cur }: { m: Movement; cur: string }) {
  const cells: [string, string, string?][] = [
    ["Current value", money(m.before, cur)],
    ["Proposed value", money(m.after, cur)],
    ["Change", signedMoney(m.change, cur), m.change < 0 ? "text-negative-600" : m.change > 0 ? "text-positive-600" : undefined],
    ["Change %", signedPct(m.pctChange), m.change < 0 ? "text-negative-600" : m.change > 0 ? "text-positive-600" : undefined],
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 mt-2">
      {cells.map(([label, value, tone]) => (
        <div key={label}>
          <dt className="text-2xs uppercase tracking-wider text-ink-500">{label}</dt>
          <dd className={cn("text-[15px] font-semibold tabular text-ink-900", tone)} data-testid={`preview-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`}>
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function RecPreview({ preview }: { preview: RecommendationPreview }) {
  const cur = preview.reportingCurrency;
  const summary = summarizePreview(preview);
  const state = STATE_LABEL[preview.state];
  const s = preview.standalone;
  // The reason it can't be applied is already the headline.
  const warnings = preview.warnings.filter((w) => !(preview.state === "cannot_apply" && (w.kind === "missing_rate" || w.kind === "unvalued")));
  return (
    <section aria-label="Live preview" className="rounded-lg ring-1 ring-inset ring-navy-200 bg-white p-3 space-y-3" data-testid="rec-preview">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-900">
          <Calculator className="h-4 w-4 text-navy-600" /> Live preview
        </div>
        <span className={cn("text-2xs font-medium uppercase tracking-wider rounded-full px-2 py-0.5 ring-1 ring-inset", state.tone)}>{state.text}</span>
      </div>

      {preview.holding && (
        <div className="text-[12px] text-ink-600">
          <span className="font-medium text-ink-900">{preview.holding.name}</span> · {preview.holding.accountName}
          {preview.holding.valueDate ? ` · value as of ${preview.holding.valueDate}` : ""} · reported in {cur}
        </div>
      )}

      <div className="text-[12px] text-ink-700">{summary.headline}</div>

      {s?.applied && s.position && <Figures m={s.position} cur={cur} />}

      {s?.applied && summary.cash && <div className="text-[12px] text-ink-700 tabular">{summary.cash}</div>}

      {preview.amounts && <div className="text-[12px] text-ink-600 tabular">Amount: {preview.amounts}.</div>}

      {preview.targetOverridesAction && (
        <div className="text-[12px] text-ink-600">The target value takes precedence; the action amount is ignored.</div>
      )}

      {preview.combined && (
        <div className="rounded-md bg-slatey-50 ring-1 ring-inset ring-ink-200 p-2.5 text-[12px] text-ink-700 space-y-1">
          <div className="font-semibold text-ink-800">
            Combined with {preview.combined.others.length} other approved recommendation{preview.combined.others.length === 1 ? "" : "s"}, in proposal
            order: {preview.combined.others.map((o) => o.title).join("; ")}
          </div>
          {preview.combined.position && <div className="tabular">{describeMovement(preview.combined.position, cur)}</div>}
          <div className="tabular">Adding this recommendation changes the combined result by {signedMoney(preview.combined.thisChange, cur)}</div>
          {preview.combined.cash.length > 0 && (
            <div className="tabular">
              Cash:{" "}
              {preview.combined.cash
                .map((c) => (c.synthetic ? `new cash line in ${c.accountName} ${money(c.after, cur)}` : `${c.name} ${money(c.before, cur)} → ${money(c.after, cur)}`))
                .join("; ")}
            </div>
          )}
          {preview.combined.shortfalls.length > 0 && (
            <div className="tabular text-warning-600">
              Shortfall: {preview.combined.shortfalls.map((sf) => `${sf.accountName} short ${formatCurrency(sf.shortfall, cur)}`).join("; ")}
            </div>
          )}
        </div>
      )}

      {warnings.length > 0 && (
        <ul className="space-y-1.5">
          {warnings.map((w, i) => (
            <li key={i} role="alert" className="flex items-start gap-1.5 text-[12px] text-ink-800">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-warning-500" />
              <span>
                {w.message}
                {w.blocksFinal && <span className="ml-1.5 text-2xs font-semibold uppercase tracking-wider text-warning-600">Blocks final PDF</span>}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="text-2xs text-ink-500">Preview only: nothing is saved, approved or applied to the holdings until you save and approve.</div>
    </section>
  );
}
