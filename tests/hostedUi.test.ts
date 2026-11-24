import { describe, expect, it, vi } from "vitest";
import * as React from "react";
import * as fs from "node:fs";
import * as path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import type { HostedInfo } from "@/server/hosted/hosted";

// #113: what the page says and offers in hosted mode, from the server's
// status alone. A public visitor sees the scripted demonstration and a way in;
// only a signed-in user with a usable key and an active session is offered
// Claude, and the scripted example stays a separate action. Synthetic data.

vi.mock("zustand", async (orig) => ({ ...(await orig<typeof import("zustand")>()), create: (await import("./support/liveStore")).liveCreate }));
vi.hoisted(() => {
  const data = new Map<string, string>();
  (globalThis as { window?: unknown }).window = {
    localStorage: { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k), clear: () => data.clear(), key: () => null, length: 0 },
    location: { search: "", href: "http://localhost/", pathname: "/", hash: "" },
    history: { pushState() {}, replaceState() {} },
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return true;
    },
  };
});

const session = (over: Partial<NonNullable<HostedInfo["session"]>> = {}) =>
  ({ status: "active", message: "", provider: "anthropic", id: "s", armedAt: null, expiresAt: null, limits: { minutes: 30, runs: 3, requests: 10, usd: 5, activeRuns: 1 }, used: { runs: 0, requests: 0, attempts: 0, spentUsd: 0, retainedUsd: 0, committedUsd: 0 }, remaining: { runs: 3, requests: 10, usd: 5 }, runInProgress: false, nextRequestUsd: 0, history: [], ...over }) as NonNullable<HostedInfo["session"]>;
const info = (over: Partial<HostedInfo> = {}): HostedInfo => ({
  available: true,
  message: null,
  provider: "anthropic",
  model: "claude-opus-5-5",
  signIn: { github: true, dev: false },
  user: { login: "advisor-a", provider: "github" },
  connection: { status: "saved", label: "Saved · not yet verified", message: "", savedAt: null, verifiedAt: null },
  session: session(),
  ceilings: { minutes: 30, runs: 3, requests: 10, usd: 5 },
  minimumUsd: 2.71,
  ...over,
});

describe("hosted mode on the page", () => {
  it("only a signed-in user with a usable key and an active session is offered Claude", async () => {
    const { hostedReady } = await import("@/components/copilot/HostedConnection");
    const { analysisRun } = await import("@/components/copilot/CopilotWorkspace");
    expect(hostedReady(info())).toBe(true);
    for (const [name, h] of [
      ["unavailable", info({ available: false })],
      ["signed out", info({ user: null })],
      ["no key", info({ connection: { status: "none", label: "", message: "", savedAt: null, verifiedAt: null } })],
      ["rejected key", info({ connection: { status: "rejected", label: "", message: "", savedAt: null, verifiedAt: null } })],
      ["no session", info({ session: null })],
      ["stopped", info({ session: session({ status: "stopped" }) })],
      ["run in progress", info({ session: session({ runInProgress: true }) })],
    ] as const) {
      expect(hostedReady(h), name).toBe(false);
      const run = analysisRun({ mode: "hosted", live: null, hosted: h });
      expect(run?.runAs, name).toBe("scripted_example");
      expect(run?.claudeAvailable, name).toBe(false);
      expect(run?.note, name).toMatch(/isn't Claude's analysis/);
    }
    expect(analysisRun({ mode: "hosted", live: null, hosted: info() })).toMatchObject({ runAs: "claude", claudeAvailable: true, label: "Run Claude analysis" });
    expect(analysisRun({ mode: "hosted", live: null, hosted: info({ provider: "fake" }) })).toMatchObject({ runAs: "test_provider", claudeAvailable: false });
  });

  it("the badge says 'Scripted demonstration · Claude is not connected' until the user is ready, then names Claude and the model", async () => {
    const { ModeBadge } = await import("@/components/copilot/CopilotWorkspace");
    expect(renderToStaticMarkup(React.createElement(ModeBadge, { mode: "hosted", model: null, hosted: info({ user: null }) }))).toContain("Scripted demonstration · Claude is not connected");
    expect(renderToStaticMarkup(React.createElement(ModeBadge, { mode: "hosted", model: "claude-opus-5-5", hosted: info() }))).toContain("Claude · claude-opus-5-5");
  });

  it("every mode badge on a page passes the hosted status (the header badge once didn't)", () => {
    const src = path.join(__dirname, "..", "src");
    // Settings renders its badge only for the non-hosted modes, so it needs no hosted status.
    for (const f of ["app/copilot/page.tsx", "components/copilot/CopilotWorkspace.tsx"]) {
      const uses = [...fs.readFileSync(path.join(src, f), "utf8").matchAll(/<ModeBadge\b[^>]*\/>/g)].map((m) => m[0]);
      expect(uses.length, f).toBeGreaterThan(0);
      for (const u of uses) expect(u, f).toContain("hosted={mode.hosted}");
    }
  });

  it("the public preview's card shows the plain headline and a way to sign in; signed in, the key field is masked", async () => {
    const { HostedConnection, PUBLIC_PREVIEW, DATA_NOTE } = await import("@/components/copilot/HostedConnection");
    const out = renderToStaticMarkup(React.createElement(HostedConnection, { info: info({ user: null, connection: null, session: null }), onChanged: () => {} }));
    expect(out).toContain(PUBLIC_PREVIEW);
    expect(PUBLIC_PREVIEW).toBe("Scripted demonstration · Claude is not connected.");
    expect(out).toContain("/api/auth/github/start");
    expect(out).toContain("Statement PDFs are read in your browser without a model.");
    expect(DATA_NOTE).toMatch(/never your private discovery notes/);
    const signedIn = renderToStaticMarkup(React.createElement(HostedConnection, { info: info({ session: null }), onChanged: () => {} }));
    expect(signedIn).toMatch(/<input[^>]*type="password"[^>]*data-testid="hosted-key-input"|<input[^>]*data-testid="hosted-key-input"[^>]*type="password"/);
    expect(signedIn).toContain("Saved · not yet verified");
    expect(signedIn).toContain("an estimate-based guard, not a billing cap");
  });

  it("the empty Recommendations wording follows the hosted state and never says no analysis has run", async () => {
    const { emptyRecommendationsCopy } = await import("@/components/recommendations/EmptyRecommendations");
    const { analysisRun } = await import("@/components/copilot/CopilotWorkspace");
    const out = emptyRecommendationsCopy(analysisRun({ mode: "hosted", live: null, hosted: info({ user: null }) }));
    expect(out).toMatch(/sign in and connect your own Anthropic API key/);
    expect(out).toMatch(/labelled scripted example, not Claude/);
    expect(out).not.toMatch(/no analysis has run/i);
    expect(emptyRecommendationsCopy(analysisRun({ mode: "hosted", live: null, hosted: info() }))).toMatch(/With Claude connected/);
  });
});
