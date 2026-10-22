"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCheck, CheckCircle2, ChevronDown, ChevronRight, Pencil, ShieldAlert, Undo2 } from "lucide-react";
import { useAtlasStore } from "@/store/useStore";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ACCOUNT_TYPE_LABELS } from "@/domain/accountTaxonomy";
import type { Account, Holding, SourceDocument } from "@/domain/types";
import type { NormalizedHolding } from "@/engines/normalizationEngine";
import { formatTotal, valuationTotal } from "@/engines/valuationTotals";
import { formatCalendarDate, formatCurrency, todayIso } from "@/utils/formatting";
import { cn } from "@/utils/cn";

// Line-by-line value check. Every holding is shown with what's needed to
// compare it against its source (quantity × price, value, as-of date, the
// document line it came from), grouped by account. Rows are confirmed or
// corrected in place and stay visible, marked, so the advisor can see what's
// done. Details opens the full holding drawer.

type Flag = { label: string; blocksBulk: boolean; title?: string };

// Flags are worked out from the holding's own numbers, not its stored
// data-quality list: that list goes stale after a correction, and one of its
// codes also just means "not reviewed yet", which every imported row is.
function flagsFor(h: Holding & { valuation?: NormalizedHolding["valuation"] }): Flag[] {
  const out: Flag[] = [];
  // The native value can still be confirmed; it just can't be converted.
  if (h.valuation?.status === "unvalued")
    out.push({ label: "No FX rate", blocksBulk: false, title: `No ${h.valuation.currency}/${h.valuation.reportingCurrency} exchange rate: left out of totals until one is added in Market Data.` });
  if (h.priceFreshness === "stale") out.push({ label: "Price out of date", blocksBulk: true });
  if (h.valuationSource.kind === "mock") out.push({ label: "Placeholder price", blocksBulk: true });
  if (!h.nativeMarketValue) out.push({ label: "No value", blocksBulk: true, title: "The source gave no value for this holding." });
  if (h.quantity != null && h.price != null && h.nativeMarketValue && h.valuationSource.kind !== "advisor_override") {
    // Bonds are priced per 100 of face value: 250,000 × 100.42 = $251,050.
    const off = (gross: number) => Math.abs(gross - h.nativeMarketValue) / Math.abs(h.nativeMarketValue);
    const gross = h.quantity * h.price;
    if (off(gross) > 0.02 && off(gross / 100) > 0.02) out.push({ label: "Qty × price ≠ value", blocksBulk: true, title: "Quantity × price differs from the value by more than 2%." });
  }
  const mismatch = h.dataQuality.find((d) => d.code === "DOCUMENT_TOTAL_MISMATCH");
  if (mismatch) out.push({ label: "Statement total mismatch", blocksBulk: true, title: mismatch.message });
  const balanceOnly = h.dataQuality.find((d) => /only this account's balance/.test(d.message));
  if (balanceOnly) out.push({ label: "Balance only", blocksBulk: false, title: balanceOnly.message });
  return out;
}

const isConfirmed = (h: Holding) => h.advisorVerification !== "unverified";
const isClean = (h: Holding) => flagsFor(h).every((f) => !f.blocksBulk);

// "3656146_ClientOnly_-_LVPWA_Marketing_Sample_070324_FINAL.pdf" -> "3656146_ClientOn…FINAL.pdf"
function shortName(name: string, max = 30): string {
  if (name.length <= max) return name;
  const keep = max - 1;
  return name.slice(0, Math.ceil(keep * 0.55)) + "…" + name.slice(-Math.floor(keep * 0.45));
}

function sourceLine(h: Holding, docs: Map<string, SourceDocument>): string {
  const doc = h.sourceTrace?.sourceDocumentId ? docs.get(h.sourceTrace.sourceDocumentId) : undefined;
  const parts: string[] = [];
  if (h.valuationSource.kind === "advisor_override") parts.push(h.valuationSource.note ?? "Corrected by advisor");
  else if (doc) parts.push(shortName(doc.fileName));
  else parts.push(h.valuationSource.note ?? h.valuationSource.providerName ?? h.valuationSource.kind.replace(/_/g, " "));
  if (h.sourceTrace?.page && h.valuationSource.kind !== "advisor_override") parts.push(`page ${h.sourceTrace.page}`);
  return parts.join(" · ");
}

export function ValueReviewTable({
  holdings,
  accounts,
  reportingCurrency,
  onDetails,
  highlight,
}: {
  holdings: NormalizedHolding[];
  accounts: Account[];
  reportingCurrency: string;
  onDetails: (h: Holding) => void;
  highlight?: boolean;
}) {
  const rawHoldings = useAtlasStore((s) => s.holdings);
  const upsertHolding = useAtlasStore((s) => s.upsertHolding);
  const setVerification = useAtlasStore((s) => s.setHoldingsVerification);
  const sourceDocuments = useAtlasStore((s) => s.sourceDocuments);
  const docs = React.useMemo(() => new Map(sourceDocuments.map((d) => [d.id, d])), [sourceDocuments]);
  const rawById = React.useMemo(() => new Map(rawHoldings.map((h) => [h.id, h])), [rawHoldings]);

  // Snapshots taken before each change made here, for Undo.
  const [snapshots, setSnapshots] = React.useState<Map<string, Holding>>(new Map());
  const [lastBulk, setLastBulk] = React.useState<string[] | null>(null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [hideConfirmed, setHideConfirmed] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set());

  const pending = holdings.filter((h) => !isConfirmed(h));
  const confirmedCount = holdings.length - pending.length;
  const cleanPending = pending.filter(isClean);

  function remember(ids: string[]) {
    setSnapshots((prev) => {
      const next = new Map(prev);
      for (const id of ids) {
        const raw = rawById.get(id);
        if (raw && !next.has(id)) next.set(id, raw);
      }
      return next;
    });
  }

  function confirm(ids: string[]) {
    remember(ids);
    setVerification(ids, "advisor_approved");
    setSelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
  }

  function undo(ids: string[]) {
    for (const id of ids) {
      const snap = snapshots.get(id);
      if (snap) upsertHolding(snap);
    }
    setSnapshots((prev) => {
      const next = new Map(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
    if (lastBulk && ids.length === lastBulk.length) setLastBulk(null);
  }

  function correct(h: Holding, value: number) {
    const raw = rawById.get(h.id);
    if (!raw) return;
    remember([h.id]);
    const was = formatCurrency(h.nativeMarketValue, h.currency);
    const from = raw.valuationSource.note ?? (raw.sourceTrace?.sourceDocumentId ? docs.get(raw.sourceTrace.sourceDocumentId)?.fileName : undefined);
    upsertHolding({
      ...raw,
      nativeMarketValue: value,
      proposalApprovedValue: undefined,
      valuationSource: {
        kind: "advisor_override",
        asOf: todayIso(),
        confidence: "high",
        note: `Corrected by advisor from ${was}${from ? ` (${from})` : ""}`,
      },
      quoteType: "advisor_entered",
      priceFreshness: "manual",
      advisorVerification: "advisor_reviewed",
      updatedAt: todayIso(),
    });
  }

  function bulkConfirm(ids: string[], label: string) {
    const t = valuationTotal(holdings.filter((h) => ids.includes(h.id)));
    const amount =
      t.status === "complete"
        ? `${formatTotal(t, reportingCurrency, { compact: true })} in total`
        : t.status === "partial"
        ? `${formatTotal(t, reportingCurrency, { compact: true })} for the valued ones; ${t.unvaluedCount} not valued in ${reportingCurrency}`
        : `not valued in ${reportingCurrency}`;
    const ok = window.confirm(
      `Confirm ${ids.length} ${label} (${amount}) as shown?\n\n` +
        "Only do this if you've compared them with their source documents."
    );
    if (!ok) return;
    confirm(ids);
    setLastBulk(ids);
  }

  // Group by account, in the order accounts are listed.
  const groups = React.useMemo(() => {
    const byAccount = new Map<string, NormalizedHolding[]>();
    for (const h of holdings) byAccount.set(h.accountId, [...(byAccount.get(h.accountId) ?? []), h]);
    const ordered = accounts.filter((a) => byAccount.has(a.id)).map((a) => ({ account: a as Account | undefined, id: a.id, rows: byAccount.get(a.id)! }));
    const orphans = [...byAccount.keys()].filter((id) => !accounts.some((a) => a.id === id));
    for (const id of orphans) ordered.push({ account: undefined, id, rows: byAccount.get(id)! });
    return ordered;
  }, [holdings, accounts]);

  // Documents whose totals were checked on import.
  const reconciled = sourceDocuments.filter(
    (d) => d.extraction?.reconciliation && d.extraction.reconciliation.status !== "unavailable" && holdings.some((h) => h.sourceTrace?.sourceDocumentId === d.id)
  );

  function renderRow(h: NormalizedHolding, subtitle?: string) {
    return (
      <ReviewRow
        key={h.id}
        holding={h}
        flags={flagsFor(h)}
        source={sourceLine(h, docs)}
        subtitle={subtitle}
        selected={selected.has(h.id)}
        onSelect={(on) =>
          setSelected((prev) => {
            const next = new Set(prev);
            if (on) next.add(h.id);
            else next.delete(h.id);
            return next;
          })
        }
        canUndo={snapshots.has(h.id)}
        onConfirm={() => confirm([h.id])}
        onUndo={() => undo([h.id])}
        onCorrect={(v) => correct(h, v)}
        onDetails={() => onDetails(rawById.get(h.id) ?? h)}
      />
    );
  }

  const pct = holdings.length ? Math.round((confirmedCount / holdings.length) * 100) : 100;
  const selectedClean = [...selected].filter((id) => cleanPending.some((h) => h.id === id));

  return (
    <Card className={cn(highlight && pending.length > 0 && "ring-2 ring-warning-500/60")}>
      <CardHeader className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {pending.length > 0 ? <ShieldAlert className="h-4 w-4 text-warning-500" /> : <CheckCircle2 className="h-4 w-4 text-positive-500" />}
        <CardTitle>Confirm holding values</CardTitle>
        <div className="ml-auto flex items-center gap-2 text-[12px] text-ink-600" role="status">
          <div className="h-1.5 w-28 rounded-full bg-ink-100 overflow-hidden" aria-hidden>
            <div className="h-full bg-positive-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <span className="tabular">
            <span className="font-semibold text-ink-900">{confirmedCount}</span> of {holdings.length} confirmed
          </span>
        </div>
      </CardHeader>
      <CardBody className="space-y-3">
        <p className="text-[13px] text-ink-600">
          Compare each value with its source, then click <span className="font-medium text-ink-800">Confirm</span>. If a value
          is wrong, click it to type the correct amount. <span className="font-medium text-ink-800">Details</span> shows
          everything about a holding. This is a data check; recommendations are approved separately on{" "}
          <Link href="/recommendations" className="font-medium text-navy-700 hover:underline">Recommendations →</Link>
        </p>

        {reconciled.map((d) => {
          const r = d.extraction!.reconciliation!;
          return (
            <div
              key={d.id}
              className={cn(
                "flex items-start gap-2 rounded-md px-3 py-2 text-[12px]",
                r.status === "matched" ? "bg-positive-50 text-ink-800" : "bg-negative-50 text-ink-800"
              )}
            >
              {r.status === "matched" ? <CheckCircle2 className="h-4 w-4 mt-px text-positive-500 shrink-0" /> : <ShieldAlert className="h-4 w-4 mt-px text-negative-500 shrink-0" />}
              <span>
                <span className="font-medium">{d.fileName}</span>:{" "}
                {r.status === "matched"
                  ? `the imported lines add up to the document's own totals (assets ${formatCurrency(r.assetsStated ?? r.assetsExtracted, "USD")}).`
                  : `the imported lines don't add up to the document's totals (assets ${formatCurrency(r.assetsExtracted, "USD")} vs ${formatCurrency(r.assetsStated ?? 0, "USD")} stated). Check for missing lines.`}
              </span>
            </div>
          );
        })}

        {pending.length === 0 ? (
          <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-positive-50 ring-1 ring-inset ring-positive-500/40 px-3 py-2 text-[13px]">
            <span className="inline-flex items-center gap-1.5 font-semibold text-positive-600">
              <CheckCircle2 className="h-4 w-4" /> All {holdings.length} holding values are confirmed.
            </span>
            <Link href="/pdf-preview" className="font-medium text-navy-700 hover:underline">Check readiness in PDF Preview →</Link>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2 rounded-md bg-slatey-50 px-3 py-2">
            <label className="inline-flex items-center gap-1.5 text-[12px] text-ink-700">
              <input
                type="checkbox"
                checked={cleanPending.length > 0 && selectedClean.length === cleanPending.length}
                onChange={(e) => setSelected(e.target.checked ? new Set(cleanPending.map((h) => h.id)) : new Set())}
              />
              Select all
            </label>
            <Button size="sm" variant="secondary" disabled={selectedClean.length === 0} onClick={() => bulkConfirm(selectedClean, "selected values")}>
              Confirm selected ({selectedClean.length})
            </Button>
            {cleanPending.length > 1 && (
              <Button size="sm" variant="secondary" iconLeft={<CheckCheck className="h-4 w-4" />} onClick={() => bulkConfirm(cleanPending.map((h) => h.id), "values")}>
                Confirm all without flags ({cleanPending.length})
              </Button>
            )}
            <label className="ml-auto inline-flex items-center gap-1.5 text-[12px] text-ink-700">
              <input type="checkbox" checked={hideConfirmed} onChange={(e) => setHideConfirmed(e.target.checked)} />
              Hide confirmed
            </label>
          </div>
        )}

        {lastBulk && (
          <div role="status" className="flex flex-wrap items-center gap-x-3 rounded-md bg-positive-50 ring-1 ring-inset ring-positive-500/40 px-3 py-2 text-[13px]">
            <span className="inline-flex items-center gap-1.5 font-semibold text-positive-600">
              <CheckCircle2 className="h-4 w-4" /> Confirmed {lastBulk.length} value{lastBulk.length === 1 ? "" : "s"}.
            </span>
            <button className="font-medium text-navy-700 hover:underline" onClick={() => undo(lastBulk)}>Undo</button>
            <button className="ml-auto text-ink-500 hover:text-ink-800" onClick={() => setLastBulk(null)}>Dismiss</button>
          </div>
        )}

        {cleanPending.length < pending.length && (
          <p className="text-[12px] text-ink-500">
            {pending.length - cleanPending.length} flagged value{pending.length - cleanPending.length === 1 ? " needs" : "s need"} its own
            check and {pending.length - cleanPending.length === 1 ? "isn't" : "aren't"} included in bulk confirm.
          </p>
        )}

        <div className="rounded-md ring-1 ring-ink-100 overflow-hidden">
          {/* Column headings (wide screens only; rows stack on phones). */}
          <div className="hidden md:grid grid-cols-[28px_minmax(0,2.4fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,0.8fr)_auto] gap-3 px-3 py-1.5 bg-slatey-50 text-2xs uppercase tracking-widest text-ink-500">
            <span />
            <span>Holding · source</span>
            <span className="text-right">Qty × price</span>
            <span className="text-right">Value</span>
            <span>As of</span>
            <span className="w-[178px] text-right">Status</span>
          </div>
          {groups.map(({ account, id, rows }) => {
            const shown = hideConfirmed ? rows.filter((h) => !isConfirmed(h)) : rows;
            const done = rows.filter(isConfirmed).length;
            const groupClean = rows.filter((h) => !isConfirmed(h) && isClean(h)).map((h) => h.id);
            const isCollapsed = collapsed.has(id);
            const subtotal = valuationTotal(rows);
            if (hideConfirmed && shown.length === 0) return null;
            // An account holding just itself (a plan's balance line) needs no
            // header: one row, with the account type underneath.
            const solo = rows.length === 1 && account && rows[0].assetName === account.name;
            if (solo) {
              const h = rows[0];
              return (
                <section key={id} aria-label={account.name}>
                  {renderRow(h, ACCOUNT_TYPE_LABELS[account.type])}
                </section>
              );
            }
            return (
              <section key={id} aria-label={account?.name ?? "Unassigned holdings"}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 bg-navy-50/60 border-t border-ink-100 first:border-t-0">
                  <button
                    className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-900 min-w-0"
                    aria-expanded={!isCollapsed}
                    onClick={() =>
                      setCollapsed((prev) => {
                        const next = new Set(prev);
                        if (next.has(id)) next.delete(id);
                        else next.add(id);
                        return next;
                      })
                    }
                  >
                    {isCollapsed ? <ChevronRight className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
                    <span className="truncate">{account?.name ?? "Unassigned holdings"}</span>
                  </button>
                  {account && <span className="text-2xs text-ink-500">{ACCOUNT_TYPE_LABELS[account.type]}</span>}
                  <span className="text-2xs text-ink-500 tabular">
                    {rows.length} holding{rows.length === 1 ? "" : "s"} · {formatTotal(subtotal, reportingCurrency, { compact: true })}
                    {subtotal.status === "partial" && ` (valued only; ${subtotal.unvaluedCount} not valued)`}
                  </span>
                  <span className={cn("text-2xs font-medium tabular", done === rows.length ? "text-positive-600" : "text-ink-600")}>
                    {done === rows.length ? "✓ all confirmed" : `${done} of ${rows.length} confirmed`}
                  </span>
                  {groupClean.length > 1 && (
                    <button className="ml-auto text-[12px] font-medium text-navy-700 hover:underline" onClick={() => bulkConfirm(groupClean, `values in ${account?.name ?? "this group"}`)}>
                      Confirm this account ({groupClean.length})
                    </button>
                  )}
                </div>
                {!isCollapsed && shown.map((h) => renderRow(h))}
              </section>
            );
          })}
        </div>
      </CardBody>
    </Card>
  );
}

function ReviewRow({
  holding: h,
  flags,
  source,
  subtitle,
  selected,
  onSelect,
  canUndo,
  onConfirm,
  onUndo,
  onCorrect,
  onDetails,
}: {
  holding: NormalizedHolding;
  flags: Flag[];
  source: string;
  subtitle?: string;
  selected: boolean;
  onSelect: (on: boolean) => void;
  canUndo: boolean;
  onConfirm: () => void;
  onUndo: () => void;
  onCorrect: (value: number) => void;
  onDetails: () => void;
}) {
  const confirmed = isConfirmed(h);
  const corrected = h.valuationSource.kind === "advisor_override";
  const blocking = flags.some((f) => f.blocksBulk);
  const rawLine = h.sourceTrace?.rawText?.trim();
  return (
    <div
      className={cn(
        "grid grid-cols-[28px_minmax(0,1fr)] md:grid-cols-[28px_minmax(0,2.4fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,0.8fr)_auto] gap-x-3 gap-y-1 items-center px-3 py-2 border-t border-ink-100 border-l-4 transition-colors",
        confirmed ? "bg-positive-50/70 border-l-positive-500" : blocking ? "border-l-warning-500" : "border-l-transparent"
      )}
    >
      <span className="flex justify-center">
        {confirmed ? (
          <CheckCircle2 className="h-4 w-4 text-positive-500" aria-label="Confirmed" />
        ) : (
          <input type="checkbox" aria-label={`Select ${h.assetName}`} checked={selected} disabled={blocking} onChange={(e) => onSelect(e.target.checked)} />
        )}
      </span>

      <div className="min-w-0">
        <div className={cn("text-[13px] font-medium truncate", confirmed ? "text-ink-700" : "text-ink-900")}>
          {h.assetName}
          {h.identifier && <span className="ml-1.5 text-2xs font-normal text-ink-500">{h.identifier.value}</span>}
        </div>
        {subtitle && <div className="text-[11px] text-ink-500 truncate">{subtitle}</div>}
        <div className="text-[11px] text-ink-500 truncate" title={source}>{source}</div>
        {rawLine && (
          <div className="text-[11px] text-ink-600 truncate" title={rawLine}>
            <span className="text-ink-400">Document line: </span>
            <span className="font-mono">{rawLine}</span>
          </div>
        )}
        {flags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-0.5">
            {flags.map((f) => (
              <span key={f.label} title={f.title}>
                <Badge tone={f.blocksBulk ? "warning" : "neutral"}>{f.label}</Badge>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* On phones the numbers sit under the name; on wide screens in columns. */}
      <div className="col-start-2 md:col-start-auto text-[12px] text-ink-600 tabular md:text-right">
        {h.quantity != null && h.price != null ? (
          <>
            {h.quantity.toLocaleString()} × {formatCurrency(h.price, h.currency)}
          </>
        ) : h.quantity != null ? (
          `${h.quantity.toLocaleString()} units`
        ) : (
          <span className="text-ink-400 md:inline hidden">—</span>
        )}
      </div>

      <div className="col-start-2 md:col-start-auto md:text-right">
        <InlineValue value={h.nativeMarketValue} currency={h.currency} corrected={corrected} onSave={onCorrect} />
      </div>

      <div className="col-start-2 md:col-start-auto text-[12px] text-ink-600">
        <span className="md:hidden text-ink-400">As of </span>
        {formatCalendarDate(h.valuationDate)}
      </div>

      <div className="col-start-2 md:col-start-auto flex items-center justify-start md:justify-end gap-2 md:w-[178px]">
        {confirmed ? (
          <>
            <span className="inline-flex items-center gap-1 rounded-full bg-positive-500/15 px-2 py-0.5 text-[12px] font-semibold text-positive-600">
              <CheckCircle2 className="h-3.5 w-3.5" /> {corrected ? "Corrected" : "Confirmed"}
            </span>
            {canUndo && (
              <button className="inline-flex items-center gap-0.5 text-[12px] text-ink-500 hover:text-ink-800" onClick={onUndo} aria-label={`Undo ${h.assetName}`}>
                <Undo2 className="h-3.5 w-3.5" /> Undo
              </button>
            )}
          </>
        ) : (
          <Button size="sm" onClick={onConfirm} aria-label={`Confirm ${h.assetName}`}>Confirm</Button>
        )}
        <button className="text-[12px] font-medium text-navy-700 hover:underline" onClick={onDetails}>Details</button>
      </div>
    </div>
  );
}

// The value reads as text with a pencil; clicking turns it into a field.
// Enter or ✓ saves the correction, Esc cancels.
function InlineValue({ value, currency, corrected, onSave }: { value: number; currency: string; corrected: boolean; onSave: (v: number) => void }) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  function start() {
    setDraft(String(Math.round(value * 100) / 100));
    setError(null);
    setEditing(true);
  }
  function save() {
    const n = Number(draft.replace(/[$,\s]/g, ""));
    if (!Number.isFinite(n)) {
      setError("Enter a number");
      return;
    }
    setEditing(false);
    if (Math.abs(n - value) >= 0.005) onSave(n);
  }

  if (!editing) {
    return (
      <button
        onClick={start}
        title="Click to correct this value"
        className="group inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 -mx-1.5 text-[13px] font-semibold tabular text-ink-900 hover:bg-navy-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-navy-500"
      >
        {formatCurrency(value, currency)}
        <Pencil className={cn("h-3 w-3 text-ink-400 group-hover:text-navy-700", !corrected && "opacity-60")} />
      </button>
    );
  }
  return (
    <span className="inline-flex flex-col items-start md:items-end gap-0.5">
      <span className="inline-flex items-center gap-1">
        <input
          autoFocus
          onFocus={(e) => e.target.select()}
          inputMode="decimal"
          aria-label="Corrected value"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") setEditing(false);
          }}
          className="w-32 rounded border border-navy-300 px-2 py-1 text-right text-[13px] tabular focus:outline-none focus:ring-2 focus:ring-navy-500/40"
        />
        <button onClick={save} className="rounded bg-navy-800 px-2 py-1 text-[12px] font-medium text-white" aria-label="Save corrected value">✓</button>
        <button onClick={() => setEditing(false)} className="rounded px-1.5 py-1 text-[12px] text-ink-500 hover:text-ink-800" aria-label="Cancel">✕</button>
      </span>
      <span className={cn("text-[11px]", error ? "text-negative-600" : "text-ink-500")}>{error ?? "Enter to save · Esc to cancel"}</span>
    </span>
  );
}
