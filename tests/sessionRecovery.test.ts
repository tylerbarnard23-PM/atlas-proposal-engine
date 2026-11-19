import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as store from "@/copilot/liveSessionStore";

// #101: a stopped or expired session armed for the other provider blocked starting a new one from the browser
// (it showed as "Other provider", which isn't startable, and Stop had nothing to change). A session that is
// over now says so and can be replaced by an explicitly started new one, without moving or deleting state
// files. It is never used for the other provider: arming, admission and every request check again. Open or
// in-flight sessions are still refused, and counters stay until the explicit new-session transition.
const T0 = new Date("2026-11-19T12:00:00Z");
const later = (min: number) => new Date(T0.getTime() + min * 60_000);
const ALLOW = { minutes: 10, runs: 1, requests: 10, usd: 3 };
const PRICE = () => 0.5;
let dir: string, file: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "stratovell-recovery-"));
  file = join(dir, store.SESSION_FILE_NAME);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** Arms a session for `provider`, claimed by its browser, and runs one request through it (counters non-zero). */
async function usedSession(provider: store.SessionProvider, rev: string | null) {
  const armed = await store.armSession(file, T0, provider, { allowance: ALLOW, credentialRevision: rev, claim: true });
  if (!armed.ok) throw new Error(armed.error);
  const admitted = await store.admitRun(file, T0, armed.cookie, 0.5, provider, rev);
  if (!admitted.ok) throw new Error(admitted.error);
  const res = await store.reserveRequest(file, T0, admitted.runId, provider, PRICE, rev);
  if (!res.ok) throw new Error(res.error);
  return { cookie: armed.cookie!, runId: admitted.runId, reservationId: res.reservationId };
}
const finish = async (u: { runId: string; reservationId: string }) => {
  await store.settleRequest(file, u.reservationId, { known: true, usd: 0.16, attempts: 1, largestInput: 20_000, models: ["m"] });
  await store.finishRun(file, T0, u.runId, "completed");
};

describe.each([
  { from: "fake", fromRev: null, to: "anthropic", toRev: "rev-1" },
  { from: "anthropic", fromRev: "rev-1", to: "fake", toRev: null },
] as const)("a $from session that is over, seen by a $to server", ({ from, fromRev, to, toRev }) => {
  it("shows as stopped (not 'other provider'), keeps its counters, and is replaced only by an explicit new session", async () => {
    const u = await usedSession(from, fromRev);
    await finish(u);
    expect((await store.stopSession(file, T0, "stopped from the browser")).ok).toBe(true);
    const view = await store.readView(file, later(1), null, 0.5, to, toRev);
    expect(view.status).toBe("stopped");
    expect(view.provider).toBe(from);
    expect(view.message).toContain(`armed for ${store.providerName(from)}`);
    expect(view.used).toMatchObject({ runs: 1, requests: 1 }); // counters kept until the new session
    // never usable for the other provider, at admission or for a request
    expect(await store.admitRun(file, later(1), u.cookie, 0.5, to, toRev)).toMatchObject({ ok: false, code: "provider_mismatch" });
    expect(await store.reserveRequest(file, later(1), u.runId, to, PRICE, toRev)).toMatchObject({ ok: false, code: "provider_mismatch" });
    // the explicit new session for this server's provider
    const next = await store.armSession(file, later(2), to, { allowance: ALLOW, credentialRevision: toRev, claim: true });
    expect(next.ok).toBe(true);
    const fresh = await store.readView(file, later(2), next.ok ? next.cookie : null, 0.5, to, toRev);
    expect(fresh).toMatchObject({ status: "active", provider: to, used: { runs: 0, requests: 0 } });
  });

  it("shows an expired session as expired and lets a new one start", async () => {
    const u = await usedSession(from, fromRev);
    await finish(u);
    const view = await store.readView(file, later(11), null, 0.5, to, toRev);
    expect(view.status).toBe("expired");
    expect(view.used.requests).toBe(1);
    expect((await store.armSession(file, later(11), to, { allowance: ALLOW, credentialRevision: toRev, claim: true })).ok).toBe(true);
  });

  it("still refuses while the other provider's session is open", async () => {
    await store.armSession(file, T0, from, { allowance: ALLOW, credentialRevision: fromRev, claim: true });
    expect((await store.readView(file, later(1), null, 0.5, to, toRev)).status).toBe("provider_mismatch");
    expect(await store.armSession(file, later(1), to, { allowance: ALLOW, credentialRevision: toRev, claim: true })).toMatchObject({ ok: false, code: "already_armed" });
  });

  it("refuses a new session while a run is in flight, even after Stop, so its reservation stays counted", async () => {
    await usedSession(from, fromRev); // run active, one request reserved, not settled
    await store.stopSession(file, T0, "stopped from the browser");
    expect((await store.readView(file, later(1), null, 0.5, to, toRev)).status).toBe("provider_mismatch");
    expect(await store.armSession(file, later(1), to, { allowance: ALLOW, credentialRevision: toRev, claim: true })).toMatchObject({ ok: false, code: "run_in_progress" });
    expect((await store.readView(file, later(1), null, 0.5, from, fromRev)).used.requests).toBe(1);
  });
});

describe("same-provider behaviour is unchanged", () => {
  it("a stopped session of the same provider shows as stopped and can be replaced", async () => {
    const u = await usedSession("fake", null);
    await finish(u);
    await store.stopSession(file, T0, "stopped from the browser");
    expect((await store.readView(file, later(1), null, 0.5, "fake", null)).status).toBe("stopped");
    expect((await store.armSession(file, later(1), "fake", { allowance: ALLOW, claim: true })).ok).toBe(true);
  });

  it("an in-flight run of the same provider also blocks a new session after Stop", async () => {
    await usedSession("fake", null);
    await store.stopSession(file, T0, "stopped from the browser");
    expect(await store.armSession(file, later(1), "fake", { allowance: ALLOW, claim: true })).toMatchObject({ ok: false, code: "run_in_progress" });
  });
});
