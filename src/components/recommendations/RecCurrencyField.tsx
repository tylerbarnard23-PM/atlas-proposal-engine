"use client";

import * as React from "react";
import type { CurrencyCode, Recommendation } from "@/domain/types";
import { CURRENCIES } from "@/domain/currencyConfigs";
import { Button } from "@/components/ui/Button";
import { Label, Select } from "@/components/ui/Input";
import type { FxContext } from "@/engines/proposalEngine";
import { changeRecommendationCurrency, describeConversion, hasMoneyAmounts, money } from "@/engines/recommendationAmounts";

// The currency a recommendation's amounts are entered in. With amounts set,
// changing it asks: convert them at the shown rate (same economic value) or
// enter replacement amounts. The label never changes on its own.
export function RecCurrencyField({
  value,
  fx,
  onChange,
}: {
  value: Recommendation;
  fx: FxContext;
  onChange: (next: Recommendation) => void;
}) {
  const [pending, setPending] = React.useState<CurrencyCode | null>(null);
  const preview = pending ? changeRecommendationCurrency(value, pending, "convert", fx) : null;
  const amountsText = (r: Recommendation) =>
    [
      r.actionAmount != null && r.actionAmountUnit !== "percent" ? money(r.actionAmount, r.currency) : null,
      r.proposedValue != null ? `target ${money(r.proposedValue, r.currency)}` : null,
    ]
      .filter(Boolean)
      .join(", ");

  return (
    <div>
      <Label>Currency of the amounts</Label>
      <Select
        value={value.currency}
        aria-label="Currency of the amounts"
        onChange={(e) => {
          const to = e.target.value;
          if (to === value.currency) return;
          if (!hasMoneyAmounts(value)) {
            const r = changeRecommendationCurrency(value, to, "relabel", fx);
            if (r.ok) onChange(r.rec);
          } else setPending(to);
        }}
      >
        {CURRENCIES.map((c) => (
          <option key={c.code} value={c.code}>
            {c.code} — {c.name}
          </option>
        ))}
      </Select>
      {pending && preview && (
        <div role="alert" className="mt-2 rounded-md bg-slatey-50 ring-1 ring-inset ring-ink-200 p-2.5 text-[12px] text-ink-700 space-y-2">
          <div>
            This recommendation has amounts in {value.currency} ({amountsText(value)}). Choose how to move them to {pending}:
          </div>
          {preview.ok ? (
            <div>
              <strong>Convert:</strong> {amountsText(preview.rec)}, at {describeConversion(preview.conversion!)}.
            </div>
          ) : (
            <div className="text-warning-600">{preview.reason}</div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={!preview.ok}
              onClick={() => {
                if (preview.ok) onChange(preview.rec);
                setPending(null);
              }}
            >
              Convert to {pending}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                const r = changeRecommendationCurrency(value, pending, "replace", fx);
                if (r.ok) onChange(r.rec);
                setPending(null);
              }}
            >
              Enter new {pending} amounts
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPending(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
