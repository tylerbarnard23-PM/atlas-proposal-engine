import * as React from "react";
import Link from "next/link";
import { KeyRound, LogIn, LogOut, Square } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import type { HostedInfo } from "@/server/hosted/hosted";
import type { LiveRunInfo } from "./LiveSessionBar";

// #113: the hosted AI connection, shown in Settings (AI connection) and on the
// Stratovell AI page. It says plainly whether this is the scripted
// demonstration or the signed-in user's own Claude connection. The API key is
// typed into a masked field, sent once over HTTPS to be encrypted on the
// server, and never shown, stored in the browser or sent back.

export const PUBLIC_PREVIEW = "Scripted demonstration · Claude is not connected.";
export const DATA_NOTE =
  "Live analysis sends your question, the client brief (never your private discovery notes) and the portfolio information Claude needs to Anthropic, using your own API key. Statement PDFs are read in your browser without a model.";

/** Whether the hosted user can run an analysis now: signed in, a usable key (or the test provider), an active session with no run in flight. */
export function hostedReady(h: HostedInfo | null | undefined): boolean {
  if (!h?.available || !h.user || h.session?.status !== "active" || h.session.runInProgress) return false;
  return h.provider === "fake" || h.connection?.status === "saved" || h.connection?.status === "verified";
}

async function post(url: string, body: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" });
  let data: Record<string, unknown> = {};
  try {
    data = await res.json();
  } catch {
    /* no body */
  }
  return { ok: res.ok, data };
}

const usd = (n: number) => `USD ${n.toFixed(2)}`;

export function HostedConnection({ info, onChanged, lastRun = null, compact = false }: { info: HostedInfo | null; onChanged: () => void; lastRun?: LiveRunInfo | null; compact?: boolean }) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [key, setKey] = React.useState("");
  const [devName, setDevName] = React.useState("");
  const [allowance, setAllowance] = React.useState(info?.ceilings ?? { minutes: 30, runs: 3, requests: 10, usd: 5 });
  const [confirmed, setConfirmed] = React.useState(false);

  async function act(url: string, body: unknown, after?: () => void) {
    setBusy(true);
    setError(null);
    try {
      const r = await post(url, body);
      if (!r.ok) setError(typeof r.data.error === "string" ? r.data.error : "That didn't work. Nothing changed.");
      else after?.();
    } catch {
      setError("The server couldn't be reached. Nothing changed.");
    } finally {
      setBusy(false);
      onChanged();
    }
  }

  if (!info) return <p className="text-[13px] text-ink-500">Checking the AI connection…</p>;

  const headline = !info.available || !info.user ? PUBLIC_PREVIEW : info.provider === "fake" ? "Signed in · test provider (no model, no API calls)" : info.session?.status === "active" ? "Claude connected · session active" : "Signed in · Claude not running yet";
  const s = info.session;

  return (
    <div className="space-y-3 text-[13px] text-ink-800" data-testid="hosted-connection">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={info.user && info.available ? (info.session?.status === "active" ? "positive" : "navy") : "gold"} data-testid="hosted-headline">
          {headline}
        </Badge>
        {info.user && (
          <span className="text-ink-600">
            Signed in as <strong>{info.user.login}</strong>
            {info.user.provider === "dev" ? " (local test sign-in)" : ""}
          </span>
        )}
        {info.user && (
          <Button size="sm" variant="ghost" iconLeft={<LogOut className="h-4 w-4" />} disabled={busy} onClick={() => act("/api/auth/signout", {})} data-testid="hosted-signout">
            Sign out
          </Button>
        )}
      </div>

      {!info.available && (
        <p className="text-ink-600" data-testid="hosted-unavailable">
          {info.message} The scripted example below is a fixed script over the engine tools, labelled as an example.
        </p>
      )}

      {info.available && !info.user && (
        <div className="space-y-2" data-testid="hosted-signin">
          <p className="text-ink-700">To analyze a portfolio with Claude, sign in and connect your own Anthropic API key. Without signing in you can still run the scripted example.</p>
          <div className="flex flex-wrap items-end gap-2">
            {info.signIn.github && (
              <a href="/api/auth/github/start" data-testid="hosted-signin-github">
                <Button iconLeft={<LogIn className="h-4 w-4" />}>Sign in with GitHub to use Claude</Button>
              </a>
            )}
            {info.signIn.dev && (
              <form
                className="flex items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  act("/api/auth/dev-signin", { login: devName });
                }}
              >
                <div>
                  <Label htmlFor="dev-login">Local test sign-in (this computer only)</Label>
                  <Input id="dev-login" value={devName} onChange={(e) => setDevName(e.target.value)} placeholder="test-advisor" autoComplete="off" data-testid="hosted-dev-login" />
                </div>
                <Button type="submit" variant="secondary" disabled={busy || !devName.trim()} data-testid="hosted-dev-signin">
                  Sign in for testing
                </Button>
              </form>
            )}
          </div>
        </div>
      )}

      {info.available && info.user && (
        <>
          <section className="space-y-2" aria-labelledby="hosted-key-h">
            <div className="flex flex-wrap items-center gap-2">
              <h3 id="hosted-key-h" className="font-semibold text-ink-900">
                Your Anthropic API key
              </h3>
              <Badge tone={info.connection?.status === "verified" ? "positive" : info.connection?.status === "rejected" || info.connection?.status === "unreadable" ? "warning" : "neutral"} data-testid="hosted-key-status">
                {info.connection?.label ?? "Not connected"}
              </Badge>
            </div>
            {info.connection && <p className="text-ink-600">{info.connection.message}</p>}
            {!compact && (
              <form
                className="flex flex-wrap items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  act("/api/copilot/hosted/connection", { action: "save", key }, () => setKey(""));
                  // The typed key leaves the page's memory as soon as it is sent.
                  setKey("");
                }}
              >
                <div className="min-w-[260px] flex-1">
                  <Label htmlFor="hosted-key">{info.connection && info.connection.status !== "none" ? "Replace with a new key" : "Connect Claude: paste your API key"}</Label>
                  <Input
                    id="hosted-key"
                    type="password"
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="From the Claude Console (console.anthropic.com)"
                    data-testid="hosted-key-input"
                  />
                </div>
                <Button type="submit" disabled={busy || !key.trim()} iconLeft={<KeyRound className="h-4 w-4" />} data-testid="hosted-key-save">
                  {info.connection && info.connection.status !== "none" ? "Replace key" : "Save key"}
                </Button>
                {info.connection && info.connection.status !== "none" && (
                  <Button
                    type="button"
                    variant="danger"
                    disabled={busy}
                    data-testid="hosted-disconnect"
                    onClick={() => {
                      if (confirm("Disconnect Claude?\n\nYour saved key is deleted from this site and any session in progress stops. Its usage counters are kept.")) act("/api/copilot/hosted/connection", { action: "disconnect" });
                    }}
                  >
                    Disconnect
                  </Button>
                )}
              </form>
            )}
            {!compact && <p className="text-2xs text-ink-500">Saved encrypted on this site&apos;s server and never shown again. Saving doesn&apos;t contact Anthropic; your first analysis does.</p>}
          </section>

          <section className="space-y-2" aria-labelledby="hosted-session-h">
            <h3 id="hosted-session-h" className="font-semibold text-ink-900">
              Session{info.model ? <span className="font-normal text-ink-600"> · model {info.model}</span> : null}
            </h3>
            {s && (s.status === "active" || s.used.runs > 0 || s.status === "stopped" || s.status === "expired" || s.status === "exhausted") && (
              <dl className="flex flex-wrap gap-x-5 gap-y-1 text-ink-700" data-testid="hosted-session">
                <div>
                  <dt className="inline text-ink-500">Status </dt>
                  <dd className="inline">{s.status === "active" ? (s.runInProgress ? "running" : "active") : s.status}</dd>
                </div>
                <div>
                  <dt className="inline text-ink-500">Runs left </dt>
                  <dd className="inline tabular">
                    {s.remaining.runs} of {s.limits.runs}
                  </dd>
                </div>
                <div>
                  <dt className="inline text-ink-500">Requests left </dt>
                  <dd className="inline tabular">
                    {s.remaining.requests} of {s.limits.requests}
                  </dd>
                </div>
                <div>
                  <dt className="inline text-ink-500">Estimated use </dt>
                  <dd className="inline tabular" data-testid="hosted-usage">
                    {usd(s.used.committedUsd)} of a {usd(s.limits.usd)} guard
                  </dd>
                </div>
                {s.expiresAt && (
                  <div>
                    <dt className="inline text-ink-500">Ends </dt>
                    <dd className="inline">{new Date(s.expiresAt).toLocaleTimeString()}</dd>
                  </div>
                )}
              </dl>
            )}
            {s && s.status !== "active" && s.status !== "unarmed" && <p className="text-ink-600">{s.message}</p>}
            {lastRun?.run && (
              <p className="text-ink-600" data-testid="hosted-last-run">
                Last run: {lastRun.run.requests} request{lastRun.run.requests === 1 ? "" : "s"}, {usd(lastRun.run.usd + lastRun.run.retainedUsd)} estimated ({lastRun.run.status}).
              </p>
            )}
            {s?.status === "active" ? (
              <Button variant="danger" size="sm" iconLeft={<Square className="h-4 w-4" />} disabled={busy} onClick={() => act("/api/copilot/hosted/session", { action: "stop" })} data-testid="hosted-stop">
                Stop session
              </Button>
            ) : (
              !compact && (
                <div className="space-y-2" data-testid="hosted-start">
                  <p className="text-ink-600">A session limits what analyses can use: each request is reserved at its worst case before it is sent. The USD figure is an estimate-based guard, not a billing cap.</p>
                  <div className="flex flex-wrap gap-3">
                    {(["minutes", "runs", "requests", "usd"] as const).map((k) => (
                      <div key={k} className="w-28">
                        <Label htmlFor={`allow-${k}`}>{k === "usd" ? "USD guard" : k[0].toUpperCase() + k.slice(1)}</Label>
                        <Input
                          id={`allow-${k}`}
                          type="number"
                          min={k === "usd" ? info.minimumUsd : 1}
                          max={info.ceilings[k]}
                          step={k === "usd" ? 0.01 : 1}
                          value={allowance[k]}
                          onChange={(e) => setAllowance((a) => ({ ...a, [k]: Number(e.target.value) }))}
                        />
                      </div>
                    ))}
                  </div>
                  <label className="inline-flex items-start gap-2">
                    <input type="checkbox" className="mt-0.5" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} data-testid="hosted-allowance-confirm" />
                    <span>
                      I confirm this allowance for my own API key: at most {allowance.runs} analyses, {allowance.requests} requests and an estimated {usd(allowance.usd)}, within {allowance.minutes} minutes.
                    </span>
                  </label>
                  <div>
                    <Button
                      disabled={busy || !confirmed || (info.provider !== "fake" && !(info.connection?.status === "saved" || info.connection?.status === "verified"))}
                      onClick={() => act("/api/copilot/hosted/session", { action: "start", allowance }, () => setConfirmed(false))}
                      data-testid="hosted-start-session"
                    >
                      Start session
                    </Button>
                  </div>
                </div>
              )
            )}
            {compact && s?.status !== "active" && (
              <p className="text-ink-600">
                Manage the key and session in <Link className="font-medium text-navy-700 hover:underline" href="/settings#ai-connection">Settings · AI connection</Link>.
              </p>
            )}
          </section>
        </>
      )}

      {error && (
        <p role="alert" className="text-negative-600" data-testid="hosted-error">
          {error}
        </p>
      )}
      {!compact && <p className="text-2xs text-ink-500">{DATA_NOTE}</p>}
    </div>
  );
}
