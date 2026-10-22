"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useAtlasStore } from "@/store/useStore";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useFxFreshness } from "@/hooks/useFxFreshness";
import { useFxNow } from "@/hooks/useFxNow";
import {
  DEFAULT_FX_QUOTES,
  FX_CONFIRMATION_DAYS,
  STALE_FX_DAYS,
  confirmStaleRates,
  currenciesToRequest,
  describeLeg,
  fxLegStatus,
  fxPairKey,
  mergeFxRefresh,
  utcDate,
  utcMinute,
  type FxRefreshResponse,
} from "@/engines/fxPolicy";

// Market Data → FX: refresh by merging (#26), every stored rate with its age,
// source and status, the outcome of the last refresh, and the confirmation of
// stale rates in use.
export function FxRatesPanel() {
  const fxRates = useAtlasStore((s) => s.fxRates);
  const holdings = useAtlasStore((s) => s.holdings);
  const accounts = useAtlasStore((s) => s.accounts);
  const recommendations = useAtlasStore((s) => s.recommendations);
  const reportingCurrency = useAtlasStore((s) => s.client.proposalOutputCurrency);
  const lastRefresh = useAtlasStore((s) => s.fxRefresh);
  const applyFxRefresh = useAtlasStore((s) => s.applyFxRefresh);
  const setFxConfirmation = useAtlasStore((s) => s.setFxConfirmation);
  const fresh = useFxFreshness();
  const [busy, setBusy] = React.useState(false);

  const inUse = new Map(fresh.inUse.map((l) => [l.key, l]));
  const now = useFxNow();
  const rows = [...fxRates]
    .filter((r) => r.base !== r.quote)
    .map((r) => ({ r, status: fxLegStatus(r, now), use: inUse.get(fxPairKey(r.base, r.quote)) }))
    .map((x) => ({ ...x, used: !!x.use && x.use.base === x.r.base && x.use.quote === x.r.quote && x.use.asOf === x.r.asOf }))
    .sort((a, b) => Number(b.used) - Number(a.used) || a.status.key.localeCompare(b.status.key));

  async function refreshFx() {
    setBusy(true);
    // The workspace's currencies, the defaults, and every stored pair's currencies (so stored rates are refreshed too).
    const requested = [
      ...new Set([...currenciesToRequest({ holdings, accounts, recommendations, reportingCurrency }), ...DEFAULT_FX_QUOTES, ...fxRates.flatMap((r) => [r.base, r.quote])]),
    ].filter((c) => c !== "USD");
    let response: FxRefreshResponse;
    try {
      const res = await fetch(`/api/market-data/fx?base=USD&quotes=${requested.join(",")}`);
      const body = (await res.json().catch(() => null)) as FxRefreshResponse | null;
      response = body ?? { ok: false, provider: "Rate provider", base: "USD", requested, error: `HTTP ${res.status}` };
    } catch (err) {
      response = { ok: false, provider: "Rate provider", base: "USD", requested, error: (err as Error).message || "Network error" };
    }
    // Merged by pair; a failure leaves every rate as it was.
    applyFxRefresh(mergeFxRefresh(fxRates, response, new Date()));
    setBusy(false);
  }

  const c = fresh.confirmation;
  return (
    <Card className="mb-6">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle>FX reference rates</CardTitle>
        <Button variant="secondary" onClick={refreshFx} loading={busy}>
          Refresh FX
        </Button>
      </CardHeader>
      <CardBody className="space-y-4">
        {lastRefresh && (
          <div
            role="status"
            data-testid="fx-refresh-summary"
            className={`rounded-md px-3 py-2 text-[13px] ring-1 ring-inset ${lastRefresh.ok ? "bg-slatey-50 ring-ink-200 text-ink-700" : "bg-negative-50 ring-negative-500/30 text-ink-800"}`}
          >
            {lastRefresh.ok ? (
              <>
                <span className="font-semibold">Last refresh {utcMinute(lastRefresh.at)}</span> ({lastRefresh.provider}): updated{" "}
                {lastRefresh.updated.length} pair{lastRefresh.updated.length === 1 ? "" : "s"}
                {lastRefresh.updated.length > 0 ? ` (${lastRefresh.updated.join(", ")})` : ""}.
                {lastRefresh.retained.length > 0 && <> Not returned, kept with their own dates: {lastRefresh.retained.join(", ")}.</>}
                {lastRefresh.manualKept.length > 0 && <> Manual rates kept: {lastRefresh.manualKept.join(", ")}.</>}
              </>
            ) : (
              <>
                <span className="font-semibold text-negative-600">Refresh failed {utcMinute(lastRefresh.at)}</span> ({lastRefresh.provider}: {lastRefresh.error}). No rate
                was changed; the rates below are the ones stored before.
              </>
            )}
          </div>
        )}

        {fresh.attention.length > 0 && (
          <div role="alert" data-testid="fx-confirmation" className="rounded-md bg-warning-50 ring-1 ring-inset ring-warning-500/40 px-3 py-2.5 text-[13px] text-ink-800 space-y-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-warning-500" />
              <div>
                <span className="font-semibold text-warning-600">Rates in use need attention.</span> {fresh.attention.map(describeLeg).join("; ")}. The{" "}
                {STALE_FX_DAYS}-day limit is an initial product policy, not a regulatory standard. Values still use these rates; the final PDF waits for a refresh
                or your confirmation.
              </div>
            </div>
            {c.state === "valid" ? (
              <div className="pl-6 flex flex-wrap items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-positive-500" />
                <span>
                  Confirmed {utcMinute(c.record!.confirmedAt)}; expires {utcMinute(c.expiresAt!)}, or sooner if the rates in use or their use change.
                </span>
                <Button size="sm" variant="ghost" onClick={() => setFxConfirmation(null)}>
                  Withdraw confirmation
                </Button>
              </div>
            ) : (
              <div className="pl-6 flex flex-wrap items-center gap-2">
                {c.state === "expired" && <span className="text-warning-600">The earlier confirmation expired {utcMinute(c.expiresAt!)}.</span>}
                {c.state === "changed" && <span className="text-warning-600">The earlier confirmation no longer applies: the rates in use or their use changed.</span>}
                {c.state === "invalid" && (
                  <span className="text-warning-600">The stored confirmation isn&apos;t valid: its times are unreadable, in the future or inconsistent.</span>
                )}
                <Button
                  size="sm"
                  onClick={() => setFxConfirmation(confirmStaleRates({ holdings, accounts, recommendations, fxRates, reportingCurrency, now: new Date() }))}
                >
                  Confirm these rates for {FX_CONFIRMATION_DAYS} days
                </Button>
                <span className="text-2xs text-ink-500">Doesn&apos;t replace missing rates or any other check.</span>
              </div>
            )}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-[13px]" data-testid="fx-rates-table">
            <thead>
              <tr className="text-ink-500">
                <th className="text-left px-3 py-2 font-medium">Rate</th>
                <th className="text-right px-3 py-2 font-medium">Value</th>
                <th className="text-left px-3 py-2 font-medium">As of (UTC)</th>
                <th className="text-right px-3 py-2 font-medium">Age</th>
                <th className="text-left px-3 py-2 font-medium">Source</th>
                <th className="text-left px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ r, status, used, use }) => (
                <tr key={`${r.base}/${r.quote}/${r.asOf}`} className="border-t border-ink-100 tabular">
                  <td className="px-3 py-1.5">{r.base}/{r.quote}</td>
                  <td className="px-3 py-1.5 text-right">{r.rate >= 0.1 ? r.rate.toFixed(4) : r.rate.toPrecision(4)}</td>
                  <td className="px-3 py-1.5">{utcDate(r.asOf)}</td>
                  <td className="px-3 py-1.5 text-right">{status.ageDays} d</td>
                  <td className="px-3 py-1.5">
                    <Badge tone={status.unverified ? "warning" : "navy"}>{r.source}</Badge>
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex flex-wrap gap-1">
                      {used ? <Badge tone="gold" title={use!.uses.map((u) => u.label).join("\n")}>In use ({use!.uses.length})</Badge> : <Badge tone="neutral">Not in use</Badge>}
                      {status.unverified ? (
                        <Badge tone="warning">Unverified fallback</Badge>
                      ) : status.stale ? (
                        <Badge tone="warning">Stale</Badge>
                      ) : (
                        <Badge tone="positive">Current</Badge>
                      )}
                      {status.manual && <Badge tone="neutral">Manual</Badge>}
                      {r.notInLastRefresh && <Badge tone="neutral">Not in last refresh</Badge>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-2xs text-ink-500">
          Reference rates, not transaction rates. A refresh merges by pair: returned rates replace the stored pair in either direction, others keep their own date
          and source, and manual rates are never replaced. Age is in UTC calendar days from each rate&apos;s own date.
        </p>
      </CardBody>
    </Card>
  );
}
