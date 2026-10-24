"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, RefreshCw, Upload } from "lucide-react";
import { useAtlasStore } from "@/store/useStore";
import { useFxNow } from "@/hooks/useFxNow";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import type { Holding, Insight } from "@/domain/types";
import { buildIdentifier } from "@/ingestion/normalizers/detectIdentifier";
import { staleRateLeg, staleThresholdDays } from "@/engines/dataTasks";
import { fxAgeDays, utcDate } from "@/engines/fxAge";
import { normalizeHoldings } from "@/engines/normalizationEngine";
import { formatNative } from "@/engines/valuationTotals";
import { resolveValuation } from "@/engines/valuationEngine";
import { formatCalendarDate, formatCurrency, localCalendarDay } from "@/utils/formatting";

// One "Data to complete" item: what's missing, why it matters, and the fix
// for each affected holding right here, instead of a link to another page.
export function DataTaskItem({ insight, onDismiss }: { insight: Insight; onDismiss: () => void }) {
  const task = insight.task!;
  const holdings = useAtlasStore((s) => s.holdings);
  const accounts = useAtlasStore((s) => s.accounts);
  const patch = useAtlasStore((s) => s.patchHolding);
  const reportingCurrency = useAtlasStore((s) => s.client.proposalOutputCurrency);
  const byId = React.useMemo(() => new Map(holdings.map((h) => [h.id, h])), [holdings]);
  // The account's name, unless it's just the holding's own name again.
  const accountName = (h: Holding) => {
    const name = accounts.find((a) => a.id === h.accountId)?.name;
    return name && name !== h.assetName ? name : undefined;
  };
  const open = task.openIds.map((id) => byId.get(id)).filter(Boolean) as Holding[];
  const done = task.doneIds.map((id) => byId.get(id)).filter(Boolean) as Holding[];
  const total = open.length + done.length;

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[14px] font-medium text-ink-900">{insight.title}</div>
          <div className="text-sm text-ink-600 mt-1 leading-relaxed">{insight.detail}</div>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <Badge tone="warning">to do</Badge>
          {done.length > 0 && (
            <span className="text-[12px] text-ink-500 tabular">
              {done.length} of {total} done
            </span>
          )}
          <button className="text-[12px] text-ink-500 hover:text-ink-800 hover:underline" onClick={onDismiss}>
            Dismiss
          </button>
        </div>
      </div>

      <ul className="mt-3 rounded-md ring-1 ring-ink-100 divide-y divide-ink-100">
        {open.map((h) => (
          <li key={h.id} className="px-3 py-2.5">
            {task.kind === "missing_fx_rate" && <MissingRateRow h={h} reportingCurrency={reportingCurrency} />}
            {task.kind === "stale_fx_rate" && <StaleRateRow h={h} />}
            {task.kind === "balance_only" && <BalanceOnlyRow h={h} onKeep={() => patch(h.id, { dataAcks: { ...h.dataAcks, keepAsBalance: true } })} />}
            {task.kind === "missing_identifier" && <IdentifierRow h={h} account={accountName(h)} onSave={(v) => patch(h.id, { identifier: buildIdentifier(v) })} />}
            {task.kind === "stale_value" && (
              <StaleRow
                h={h}
                onAccept={() => patch(h.id, { dataAcks: { ...h.dataAcks, acceptedValuationDate: h.valuationDate } })}
                onUpdate={(value, date) =>
                  patch(h.id, {
                    nativeMarketValue: value,
                    valuationDate: date,
                    proposalApprovedValue: undefined,
                    valuationSource: { kind: "advisor_entered", asOf: date, confidence: "high", note: `Updated by advisor (was ${formatCurrency(h.nativeMarketValue, h.currency)} as of ${formatCalendarDate(h.valuationDate)})` },
                    quoteType: "advisor_entered",
                    priceFreshness: "manual",
                    advisorVerification: "advisor_reviewed",
                  })
                }
              />
            )}
          </li>
        ))}
        {done.map((h) => (
          <li key={h.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 bg-positive-50/60 text-[13px]">
            <CheckCircle2 className="h-4 w-4 text-positive-500 shrink-0" />
            <span className="text-ink-700">{h.assetName}</span>
            <span className="text-[12px] text-positive-600">
              {task.kind === "balance_only" ? "Kept as one balance" : `Keeping the value as of ${formatCalendarDate(h.valuationDate)}`}
            </span>
            <button
              className="ml-auto text-[12px] text-ink-500 hover:text-ink-800 hover:underline"
              onClick={() =>
                patch(h.id, {
                  dataAcks: task.kind === "balance_only" ? { ...h.dataAcks, keepAsBalance: undefined } : { ...h.dataAcks, acceptedValuationDate: undefined },
                })
              }
            >
              Undo
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Name({ h, sub }: { h: Holding; sub?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[13px] font-medium text-ink-900 truncate">{h.assetName}</div>
      <div className="text-[12px] text-ink-500 truncate">{sub}</div>
    </div>
  );
}

// No usable exchange rate: the native amount is known, the reporting value
// isn't. The fix is the rate itself, on the Exchange rates page.
function MissingRateRow({ h, reportingCurrency }: { h: Holding; reportingCurrency: string }) {
  // The value that needs converting: a locked approved value in its own
  // currency, else the statement amount.
  const v = resolveValuation(h);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Name
        h={h}
        sub={
          <span className="tabular">
            {h.isLiability ? "Liability · " : ""}
            {formatNative({ currency: v.currency, amount: v.amount })} · no {v.currency}/{reportingCurrency} rate
          </span>
        }
      />
      <Link href="/market-data">
        <Button size="sm" iconLeft={<RefreshCw className="h-3.5 w-3.5" />}>Add the rate in Exchange rates</Button>
      </Link>
    </div>
  );
}

// A holding valued with a rate older than the FX policy or unverified (#26):
// the rate's date and age, and where to refresh or confirm it.
function StaleRateRow({ h }: { h: Holding }) {
  const fxRates = useAtlasStore((s) => s.fxRates);
  const reportingCurrency = useAtlasStore((s) => s.client.proposalOutputCurrency);
  const now = useFxNow();
  const leg = staleRateLeg(normalizeHoldings([h], fxRates, reportingCurrency)[0], now);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Name
        h={h}
        sub={
          <span className="tabular">
            {leg ? (
              <>
                {leg.base}/{leg.quote} {leg.source === "Mock" ? "unverified fallback data" : `as of ${utcDate(leg.asOf)}, ${fxAgeDays(leg.asOf, now)} days old`}
              </>
            ) : (
              "rate confirmed"
            )}
          </span>
        }
      />
      <Link href="/market-data">
        <Button size="sm" iconLeft={<RefreshCw className="h-3.5 w-3.5" />}>Refresh or confirm in Exchange rates</Button>
      </Link>
    </div>
  );
}

function BalanceOnlyRow({ h, onKeep }: { h: Holding; onKeep: () => void }) {
  const href = `/import-center?account=${encodeURIComponent(h.accountId)}&replace=${encodeURIComponent(h.id)}`;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Name h={h} sub={<span className="tabular">{formatCurrency(h.nativeMarketValue, h.currency)} as one balance</span>} />
      <div className="flex flex-wrap gap-2">
        <Link href={href}>
          <Button size="sm" iconLeft={<Upload className="h-3.5 w-3.5" />}>Upload positions</Button>
        </Link>
        <Button size="sm" variant="secondary" onClick={onKeep}>Keep as one balance</Button>
      </div>
    </div>
  );
}

function IdentifierRow({ h, account, onSave }: { h: Holding; account?: string; onSave: (v: string) => void }) {
  const [value, setValue] = React.useState("");
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Name h={h} sub={account} />
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) onSave(value.trim());
        }}
      >
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Ticker, CUSIP or ISIN"
          aria-label={`Ticker or CUSIP for ${h.assetName}`}
          className="w-44 rounded border border-ink-200 px-2.5 py-1.5 text-[13px] uppercase placeholder:normal-case focus:outline-none focus:ring-2 focus:ring-navy-500/30"
        />
        <Button size="sm" type="submit" disabled={!value.trim()}>Save</Button>
      </form>
    </div>
  );
}

function StaleRow({ h, onAccept, onUpdate }: { h: Holding; onAccept: () => void; onUpdate: (value: number, date: string) => void }) {
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState(String(h.nativeMarketValue));
  const [date, setDate] = React.useState(() => localCalendarDay());
  const months = Math.max(1, Math.round((Date.now() - new Date(h.valuationDate ?? 0).getTime()) / (30.4 * 86_400_000)));
  const limit = staleThresholdDays(h) > 35 ? "12 months" : "35 days";
  const n = Number(value.replace(/[$,\s]/g, ""));
  const valid = Number.isFinite(n) && value.trim() !== "" && !!date;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Name
          h={h}
          sub={
            <>
              <span className="tabular">{formatCurrency(h.nativeMarketValue, h.currency)}</span> as of {formatCalendarDate(h.valuationDate)} ·{" "}
              {h.valuationDate ? `${months} month${months === 1 ? "" : "s"} old` : "no date"} (limit {limit})
            </>
          }
        />
        {!editing && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setEditing(true)}>Update value</Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={onAccept}
              disabled={!h.valuationDate}
              title="Keeps the value and its recorded date as they are; it doesn't make the value current."
            >
              Keep recorded date
            </Button>
          </div>
        )}
      </div>
      {editing && (
        <form
          className="flex flex-wrap items-end gap-2 rounded-md bg-slatey-50 px-3 py-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) {
              onUpdate(n, date);
              setEditing(false);
            }
          }}
        >
          <label className="text-[12px] text-ink-600">
            New value ({h.currency})
            <input
              autoFocus
              onFocus={(e) => e.target.select()}
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="mt-0.5 block w-36 rounded border border-ink-200 bg-white px-2.5 py-1.5 text-right text-[13px] tabular focus:outline-none focus:ring-2 focus:ring-navy-500/30"
            />
          </label>
          <label className="text-[12px] text-ink-600">
            As of
            <input
              type="date"
              value={date}
              max={localCalendarDay()}
              onChange={(e) => setDate(e.target.value)}
              className="mt-0.5 block rounded border border-ink-200 bg-white px-2 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-navy-500/30"
            />
          </label>
          <Button size="sm" type="submit" disabled={!valid}>Save</Button>
          <Button size="sm" variant="ghost" type="button" onClick={() => setEditing(false)}>Cancel</Button>
        </form>
      )}
    </div>
  );
}
