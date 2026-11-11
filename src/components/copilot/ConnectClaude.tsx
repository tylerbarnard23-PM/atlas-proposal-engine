"use client";

import * as React from "react";
import { KeyRound, Play } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { cn } from "@/utils/cn";
import type { ConnectionStatus, LocalInfo } from "@/copilot/localConnect";
import type { AllowanceChoice, SessionStatus } from "@/copilot/liveSessionStore";
import type { LiveInfo } from "./LiveSessionBar";

// Connect Claude: the guided local set-up, shared by the Copilot page and the
// desk panel. It walks through getting a key, saving it, and starting a
// limited session. Nothing here contacts Anthropic: the first request is the
// first question the user asks.
//
// The key lives in this component's state only while it is being typed. It is
// posted once to the local server and cleared; it is never put in the Atlas
// store, browser storage, a URL or a backup, and the server never returns it.

const CONNECTION_BADGE: Record<ConnectionStatus, { text: string; tone: "positive" | "warning" | "neutral" }> = {
  none: { text: "No key yet", tone: "warning" },
  saved: { text: "Key saved · not yet verified", tone: "neutral" },
  verified: { text: "Connected", tone: "positive" },
  rejected: { text: "Key rejected", tone: "warning" },
  missing: { text: "Key needed again", tone: "warning" },
  changed: { text: "Key changed", tone: "warning" },
  unreadable: { text: "Key store locked", tone: "warning" },
};

/** Session states from which a new session may be started (anything else must be stopped first, so counters are never reset silently). */
const STARTABLE: SessionStatus[] = ["unarmed", "invalid", "unbound", "expired", "stopped", "exhausted"];

const MINUTES = [30, 20, 10];
const RUNS = [3, 2, 1];
const REQUESTS = [10, 8, 5];

async function post(url: string, csrf: string | null, body: unknown): Promise<{ ok: boolean; data: { error?: string; warning?: string | null } }> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "X-Atlas-CSRF": csrf ?? "" }, body: JSON.stringify(body) });
    return { ok: res.ok, data: await res.json().catch(() => ({ error: `The request failed (${res.status}).` })) };
  } catch {
    return { ok: false, data: { error: "Couldn't reach the Atlas server on this machine. Check that it is still running." } };
  }
}

export function ConnectClaude({ live, local, onChanged }: { live: LiveInfo; local: LocalInfo | null; onChanged: () => void }) {
  const id = React.useId();
  const [key, setKey] = React.useState("");
  const [storage, setStorage] = React.useState<"session" | "keychain">("session");
  const [editing, setEditing] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [confirming, setConfirming] = React.useState(false);
  const [open, setOpen] = React.useState<boolean | null>(null);
  const ceilings = local?.ceilings ?? { minutes: 30, runs: 3, requests: 10, usd: 5 };
  const [allowance, setAllowance] = React.useState<AllowanceChoice>(ceilings);
  // The key never outlives this form.
  React.useEffect(() => () => setKey(""), []);

  if (!live.available || !local) return null;

  const fake = live.provider === "fake";
  const connection = local.connection;
  const status: ConnectionStatus = connection?.status ?? "none";
  const session = live.session;
  const sessionActive = session?.status === "active";
  const keyUsable = fake || status === "saved" || status === "verified" || status === "rejected";
  const needsKey = !connection || connection.source === "none" || status === "missing" || status === "changed";
  const showForm = local.paired && (editing || (needsKey && !fake) || (fake && editing));
  // Once connected with a session running, the set-up folds away; it opens again whenever something needs attention.
  const settled = local.paired && sessionActive && keyUsable && !editing;
  const expanded = open ?? !settled;
  const usdOptions = [...new Set([ceilings.usd, 4, 3].filter((v) => v <= ceilings.usd && v >= local.minimumUsd))];

  async function run(name: string, fn: () => Promise<{ ok: boolean; data: { error?: string; warning?: string | null } }>, done?: string) {
    setBusy(name);
    setError(null);
    setNotice(null);
    const r = await fn();
    setBusy(null);
    if (!r.ok) setError(r.data.error ?? "That didn't work.");
    else setNotice([done, r.data.warning].filter(Boolean).join(" ") || null);
    onChanged();
    return r.ok;
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const pasted = key;
    const ok = await run("save", () => post("/api/copilot/local/connection", local!.csrf, { action: "save", key: pasted, storage }), "Key saved. Atlas hasn't contacted Anthropic: your first question will be the first request.");
    if (ok) {
      setKey("");
      setEditing(false);
    }
  }

  const badge = !local.paired ? { text: "Not paired", tone: "warning" as const } : fake && status === "none" ? { text: "Fake provider · no key needed", tone: "neutral" as const } : CONNECTION_BADGE[status];

  return (
    <section aria-label="Connect Claude" data-testid="connect-claude" data-paired={local.paired} data-connection={status} className="rounded-md bg-white px-3 py-2 text-[13px] ring-1 ring-inset ring-ink-200">
      <div className="flex flex-wrap items-center gap-2">
        <KeyRound className="h-4 w-4 text-ink-500" aria-hidden />
        <strong className="text-ink-900">Connect Claude</strong>
        <Badge tone={badge.tone} data-testid="connect-status">
          {badge.text}
        </Badge>
        {local.paired && (
          <Button size="sm" variant="ghost" className="ml-auto" aria-expanded={expanded} aria-controls={`${id}-body`} onClick={() => setOpen(!expanded)} data-testid="connect-toggle">
            {expanded ? "Hide set-up" : "Manage connection"}
          </Button>
        )}
      </div>

      {!local.paired && (
        <div className="mt-1.5 space-y-1 text-ink-800" role="status" data-testid="connect-unpaired">
          <p>This browser isn&apos;t paired with Atlas on this machine yet, so it can&apos;t manage the Claude connection.</p>
          <p>
            Start Atlas with <code className="rounded bg-slatey-100 px-1">npm run local</code>, which opens a paired window. If Atlas is already running, run <code className="rounded bg-slatey-100 px-1">npm run local:pair</code> in a terminal and open the one-time link it prints.
          </p>
          <p className="text-2xs text-ink-500">Pairing only lets this browser manage the connection. It starts no session and spends nothing.</p>
        </div>
      )}

      {local.paired && expanded && (
        <div id={`${id}-body`} className="mt-2 space-y-3">
          <p className="text-ink-800" role="status" data-testid="connect-message">
            {connection?.message}
          </p>

          {!fake && (
            <details className="rounded-md bg-slatey-50 px-3 py-2" open={needsKey && !editing ? true : undefined} data-testid="connect-guide">
              <summary className="cursor-pointer font-medium text-ink-900">How to get a key for Atlas</summary>
              <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-ink-800">
                <li>
                  In the Claude Console (platform.claude.com), open <strong>Workspaces</strong> and create a workspace just for Atlas. The Default Workspace can&apos;t have a spend limit, so a dedicated one matters.
                </li>
                <li>
                  Select that workspace and set its monthly <strong>spend limit</strong>. This is the control that actually caps what you can be billed; Atlas&apos;s own guard is only an estimate.
                </li>
                <li>
                  Create an <strong>API key in that workspace</strong>. Use a standard key (it starts with <code>sk-ant-</code>). Never use an Admin key (<code>sk-ant-admin…</code>): it manages your whole organization.
                </li>
                <li>Paste the key below and choose how long Atlas keeps it.</li>
              </ol>
              <p className="mt-2 text-2xs text-ink-600">
                API usage is billed to your Console organization, separately from a Claude subscription. Max, Ultra and Team plans include monthly API credits, which you claim by linking your plan to a Console organization in claude.ai billing settings; Free, Pro and Enterprise plans don&apos;t include them. When credits
                run out, requests stop unless you have bought credits or turned on auto-reload.
              </p>
            </details>
          )}

          {showForm ? (
            <form onSubmit={save} className="space-y-2" data-testid="connect-form" autoComplete="off">
              <div>
                <label htmlFor={`${id}-key`} className="mb-1 block font-medium text-ink-900">
                  Anthropic API key
                </label>
                <Input
                  id={`${id}-key`}
                  type="password"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  data-1p-ignore
                  data-lpignore="true"
                  placeholder="sk-ant-…"
                  aria-describedby={`${id}-key-help`}
                  data-testid="connect-key"
                />
                <p id={`${id}-key-help`} className="mt-1 text-2xs text-ink-500">
                  The key goes to the Atlas server on this machine only. It isn&apos;t kept in the browser, the workspace or backups, and Atlas never shows it again.
                </p>
              </div>
              <fieldset className="space-y-1">
                <legend className="font-medium text-ink-900">Keep the key</legend>
                <label className="flex items-start gap-2">
                  <input type="radio" name={`${id}-storage`} className="mt-1" checked={storage === "session"} onChange={() => setStorage("session")} data-testid="connect-storage-session" />
                  <span>
                    For this server session only <span className="text-ink-500">(in memory; you paste it again after Atlas restarts)</span>
                  </span>
                </label>
                <label className={cn("flex items-start gap-2", !local.remember?.available && "text-ink-500")}>
                  <input type="radio" name={`${id}-storage`} className="mt-1" checked={storage === "keychain"} disabled={!local.remember?.available} onChange={() => setStorage("keychain")} data-testid="connect-storage-keychain" />
                  <span>
                    Remember it securely on this computer <span className="text-ink-500">(your operating system&apos;s credential store)</span>
                    {!local.remember?.available && <span className="block text-2xs">{local.remember?.reason ?? "Not available here."} Atlas never falls back to a plain file.</span>}
                  </span>
                </label>
              </fieldset>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" size="sm" loading={busy === "save"} disabled={!key.trim()} data-testid="connect-save">
                  Save key
                </Button>
                {editing && (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setKey("");
                      setEditing(false);
                      setError(null);
                    }}
                  >
                    Cancel
                  </Button>
                )}
                {local.environmentKey && connection?.source !== "environment" && (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    loading={busy === "env"}
                    onClick={async () => {
                      if (await run("env", () => post("/api/copilot/local/connection", local.csrf, { action: "use_environment" }), "Using the key from the server's environment. Atlas hasn't contacted Anthropic.")) setEditing(false);
                    }}
                    data-testid="connect-use-env"
                  >
                    Use the server&apos;s environment key (advanced)
                  </Button>
                )}
              </div>
              {local.environmentKey && <p className="text-2xs text-ink-500">A key is also set in the server&apos;s environment. It is managed outside Atlas and is used only if you choose it here.</p>}
            </form>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => setEditing(true)} data-testid="connect-replace">
                {connection?.source === "none" ? "Add a key" : "Replace key"}
              </Button>
              {connection && connection.source !== "none" && (
                <Button size="sm" variant="secondary" loading={busy === "disconnect"} onClick={() => run("disconnect", () => post("/api/copilot/local/connection", local.csrf, { action: "disconnect" }), "Disconnected. Any session under that key was stopped.")} data-testid="connect-disconnect">
                  Disconnect
                </Button>
              )}
            </div>
          )}

          {!showForm && keyUsable && session && STARTABLE.includes(session.status) && (
            <div className="space-y-2 rounded-md bg-slatey-50 px-3 py-2" data-testid="connect-start">
              <p className="font-medium text-ink-900">Start a limited session</p>
              <p className="text-ink-800">A session is an allowance you give Atlas for asking Claude. You can lower these limits, not raise them. Each new session is a new allowance and needs your say-so.</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <AllowanceSelect label="Minutes" value={allowance.minutes} options={MINUTES.filter((v) => v <= ceilings.minutes)} onChange={(minutes) => setAllowance({ ...allowance, minutes })} testid="allow-minutes" />
                <AllowanceSelect label="Copilot runs" value={allowance.runs} options={RUNS.filter((v) => v <= ceilings.runs)} onChange={(runs) => setAllowance({ ...allowance, runs })} testid="allow-runs" />
                <AllowanceSelect label="Requests" value={allowance.requests} options={REQUESTS.filter((v) => v <= ceilings.requests)} onChange={(requests) => setAllowance({ ...allowance, requests })} testid="allow-requests" />
                <AllowanceSelect label="USD guard" value={allowance.usd} options={usdOptions} onChange={(usd) => setAllowance({ ...allowance, usd })} testid="allow-usd" />
              </div>
              <p className="text-2xs text-ink-600">
                The USD guard is Atlas&apos;s estimate from list prices, not a billing limit. Each request is first reserved at its worst case (about USD {local.minimumUsd.toFixed(2)}), so the guard stops requests well before the figure is spent. Your Console workspace&apos;s spend limit is what caps real charges.
              </p>
              {!confirming ? (
                <Button size="sm" onClick={() => setConfirming(true)} iconLeft={<Play className="h-4 w-4" />} data-testid="connect-start-review">
                  Start a session…
                </Button>
              ) : (
                <div className="space-y-2 rounded-md bg-white px-3 py-2 ring-1 ring-inset ring-ink-200" role="group" aria-label="Confirm the session allowance" data-testid="connect-start-confirm">
                  <p className="text-ink-900">
                    Allow up to <strong>{allowance.runs}</strong> Copilot run{allowance.runs === 1 ? "" : "s"} and <strong>{allowance.requests}</strong> requests to {fake ? "the fake provider (no API calls)" : "Anthropic"} over <strong>{allowance.minutes} minutes</strong>, with a <strong>USD {allowance.usd}</strong> estimated guard?
                  </p>
                  <p className="text-2xs text-ink-600">Starting sends nothing to Anthropic. Requests are made only when you ask a question. You can stop the session at any time.</p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      loading={busy === "start"}
                      autoFocus
                      onClick={async () => {
                        if (await run("start", () => post("/api/copilot/live-session", local.csrf, { action: "start", allowance }), "Session started.")) setOpen(null);
                        setConfirming(false);
                      }}
                      data-testid="connect-start-confirm-button"
                    >
                      Confirm and start
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setConfirming(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
          {!showForm && keyUsable && session && !STARTABLE.includes(session.status) && session.status !== "active" && (
            <p className="text-ink-800" data-testid="connect-stop-first">
              A session already exists but can&apos;t be used from here. Stop it below before starting a new one; its counters are kept until then.
            </p>
          )}

          <p className="text-2xs text-ink-500">
            What reaches Anthropic when you ask: your question and the figures the Atlas engines return to Claude&apos;s tool calls. Names Atlas recognizes are replaced first, which is not complete anonymization, so use sample or synthetic data.
          </p>
        </div>
      )}
      {error && (
        <p className="mt-2 text-negative-600" role="alert" data-testid="connect-error">
          {error}
        </p>
      )}
      {notice && !error && (
        <p className="mt-2 text-ink-800" role="status" data-testid="connect-notice">
          {notice}
        </p>
      )}
    </section>
  );
}

function AllowanceSelect({ label, value, options, onChange, testid }: { label: string; value: number; options: number[]; onChange: (v: number) => void; testid: string }) {
  const id = React.useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-2xs text-ink-600">
        {label}
      </label>
      <Select id={id} value={value} onChange={(e) => onChange(Number(e.target.value))} className="h-8" data-testid={testid}>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </Select>
    </div>
  );
}
