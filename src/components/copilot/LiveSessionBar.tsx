"use client";

import * as React from "react";
import { CircleStop } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { cn } from "@/utils/cn";
import type { SessionStatus, SessionView } from "@/copilot/liveSessionStore";

// The local live-testing session as the tester sees it: what's armed, what's
// left, when it expires, and a Stop control. The numbers come from the
// server's session record after every run; this bar keeps none of its own.

export interface LiveInfo {
  available: boolean;
  reasons: string[];
  provider: "anthropic" | "fake" | null;
  session: SessionView | null;
}

/** What one live run used, as the server reported it. */
export interface LiveRunInfo {
  provider: "anthropic" | "fake";
  run: { requests: number; attempts: number; usd: number; retainedUsd: number; status: string } | null;
  stoppedBy: string | null;
}

const STATUS_TEXT: Record<SessionStatus, string> = {
  unarmed: "Not armed",
  invalid: "Unreadable",
  unbound: "Needs re-arming",
  provider_mismatch: "Other provider",
  credential_mismatch: "Key changed",
  unclaimed: "Not claimed",
  not_this_browser: "Another browser",
  active: "Active",
  expired: "Expired",
  stopped: "Stopped",
  exhausted: "Used up",
};

/** Whether a live question may be asked from this browser right now. */
export const liveReady = (live: LiveInfo | null | undefined) => !!live?.available && live.session?.status === "active" && !live.session.runInProgress;

function useNow(active: boolean) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

const usd = (n: number) => `USD ${n.toFixed(2)}`;

export function LiveSessionBar({ live, lastRun, onChanged }: { live: LiveInfo; lastRun: LiveRunInfo | null; onChanged: () => void }) {
  const s = live.session;
  const now = useNow(!!s?.expiresAt && s.status === "active");
  const [stopping, setStopping] = React.useState(false);
  const [stopError, setStopError] = React.useState<string | null>(null);
  const leftMs = s?.expiresAt ? Date.parse(s.expiresAt) - now : 0;
  const clock = leftMs > 0 ? `${Math.floor(leftMs / 60_000)}:${String(Math.floor((leftMs % 60_000) / 1_000)).padStart(2, "0")}` : "0:00";
  const ready = liveReady(live);

  async function stop() {
    setStopping(true);
    setStopError(null);
    try {
      const res = await fetch("/api/copilot/live-session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "stop" }) });
      if (!res.ok) setStopError((await res.json()).error ?? `Stop failed (${res.status}).`);
    } catch {
      setStopError("Couldn't reach the server to stop the session. Use: npm run live-session -- stop");
    } finally {
      setStopping(false);
      onChanged();
    }
  }

  return (
    <section aria-label="Live test session" data-testid="live-session" data-status={s?.status ?? "unavailable"} className={cn("rounded-md px-3 py-2 text-[13px] ring-1 ring-inset", ready ? "bg-positive-50 ring-positive-500/40" : "bg-warning-50 ring-warning-500/40")}>
      <div className="flex flex-wrap items-center gap-2">
        <strong className="text-ink-900">Live test session</strong>
        <Badge tone={ready ? "positive" : "warning"}>{live.available ? (s ? STATUS_TEXT[s.status] : "Unavailable") : "Unavailable"}</Badge>
        {live.provider === "fake" && <Badge tone="neutral">Fake provider · no API calls</Badge>}
        {live.available && s?.id && s.status !== "stopped" && s.status !== "expired" && (
          <Button size="sm" variant="secondary" className="ml-auto" onClick={stop} loading={stopping} iconLeft={<CircleStop className="h-4 w-4" />} data-testid="live-stop">
            Stop live session
          </Button>
        )}
      </div>
      <p className="mt-1 text-ink-800" role={ready ? "status" : "alert"} data-testid="live-message">
        {live.available ? s?.message : `Live testing isn't available here: ${live.reasons.join(" ")}`}
      </p>
      {s?.id && (
        <dl className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5 text-2xs text-ink-700 sm:grid-cols-3" data-testid="live-allowance">
          <div>
            <dt className="inline text-ink-500">Runs left </dt>
            <dd className="inline tabular">{s.remaining.runs} of {s.limits.runs}</dd>
          </div>
          <div>
            <dt className="inline text-ink-500">HTTP requests left </dt>
            <dd className="inline tabular">{s.remaining.requests} of {s.limits.requests}</dd>
          </div>
          <div>
            <dt className="inline text-ink-500">Model attempts so far </dt>
            <dd className="inline tabular">{s.used.attempts}</dd>
          </div>
          <div>
            <dt className="inline text-ink-500">Estimated USD left </dt>
            <dd className="inline tabular">{usd(s.remaining.usd)} of {usd(s.limits.usd)}</dd>
          </div>
          <div>
            <dt className="inline text-ink-500">{s.status === "expired" ? "Expired at " : "Expires in "}</dt>
            <dd className="inline tabular">{s.status === "expired" && s.expiresAt ? new Date(s.expiresAt).toLocaleTimeString() : clock}</dd>
          </div>
          <div>
            <dt className="inline text-ink-500">One run at a time </dt>
            <dd className="inline">{s.runInProgress ? "running now" : "idle"}</dd>
          </div>
        </dl>
      )}
      {lastRun?.run && (
        <p className="mt-1 text-2xs text-ink-600" data-testid="live-last-run">
          Last run: {lastRun.run.requests} HTTP request{lastRun.run.requests === 1 ? "" : "s"} (retries included), {lastRun.run.attempts} model attempt{lastRun.run.attempts === 1 ? "" : "s"}, {usd(lastRun.run.usd)} priced from usage
          {lastRun.run.retainedUsd > 0 ? ` + ${usd(lastRun.run.retainedUsd)} kept for requests whose usage is unknown` : ""}.
          {lastRun.stoppedBy ? ` Stopped by the session: ${lastRun.stoppedBy}` : ""}
        </p>
      )}
      {stopError && <p className="mt-1 text-negative-600" role="alert">{stopError}</p>}
      <p className="mt-1 text-2xs text-ink-500">
        USD figures are list-price estimates, not billing; check actual charges in the Anthropic Console. Answers stay on this page for review; the server keeps counters only.
      </p>
    </section>
  );
}
