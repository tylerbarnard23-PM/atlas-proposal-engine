import { randomUUID } from "node:crypto";
import { hash, randomToken, readJson, sameHash, saveJson, withLock } from "./localFiles.ts";

// Pairing: which browsers on this machine may manage the local Claude
// connection (save, replace or remove the key, and start a session). It is
// separate from a session's spending allowance and never starts one, and it
// works before any key exists.
//
// The launcher (or `npm run local:pair`) issues a one-time token and opens a
// bootstrap link; the link exchanges the token for an HttpOnly cookie. The
// token is deleted on use, so a replayed link is refused. Only hashes are
// stored. A local address alone is never authentication: every management
// request must carry this cookie and the CSRF token derived from it.
// Node built-ins only (through localFiles.ts), so the scripts can load it.

export const PAIR_COOKIE = "atlas_local_pair";
export const PAIR_TOKEN_MINUTES = 10;
export const PAIR_DAYS = 7;
const MAX_BROWSERS = 4;

interface PairingState {
  version: 1;
  /** The one outstanding bootstrap token (hash only). */
  pending: { tokenHash: string; expiresAt: string } | null;
  browsers: { id: string; cookieHash: string; pairedAt: string; expiresAt: string }[];
}

const str = (v: unknown) => typeof v === "string" && v.length > 0;

function load(file: string): PairingState {
  const raw = readJson(file) as PairingState | null | undefined;
  const empty: PairingState = { version: 1, pending: null, browsers: [] };
  // A missing or unreadable record pairs nobody.
  if (!raw || raw.version !== 1 || !Array.isArray(raw.browsers)) return empty;
  const pending = raw.pending && str(raw.pending.tokenHash) && str(raw.pending.expiresAt) ? raw.pending : null;
  const browsers = raw.browsers.filter((b) => b && str(b.id) && str(b.cookieHash) && str(b.pairedAt) && str(b.expiresAt));
  return { version: 1, pending, browsers };
}

const live = (s: PairingState, now: Date): PairingState => ({
  version: 1,
  pending: s.pending && Date.parse(s.pending.expiresAt) > now.getTime() ? s.pending : null,
  browsers: s.browsers.filter((b) => Date.parse(b.expiresAt) > now.getTime()),
});

/** Issues the one-time bootstrap token (replacing any unused one). Called from a terminal on this machine only. */
export async function issuePairingToken(file: string, now: Date): Promise<{ token: string; expiresAt: Date }> {
  return withLock(file, () => {
    const s = live(load(file), now);
    const token = randomToken();
    const expiresAt = new Date(now.getTime() + PAIR_TOKEN_MINUTES * 60_000);
    saveJson(file, { ...s, pending: { tokenHash: hash(token), expiresAt: expiresAt.toISOString() } });
    return { token, expiresAt };
  });
}

/** Exchanges the bootstrap token for a browser's pairing cookie. The token works once. */
export async function redeemPairingToken(file: string, now: Date, token: string): Promise<{ ok: true; cookie: string; expiresAt: Date } | { ok: false; error: string }> {
  return withLock(file, () => {
    const s = live(load(file), now);
    if (!token || !s.pending || !sameHash(hash(token), s.pending.tokenHash))
      return { ok: false, error: "This pairing link isn't valid: it was already used, has expired, or was replaced by a newer one. Run the launcher again (npm run local), or npm run local:pair." } as const;
    const cookie = randomToken();
    const expiresAt = new Date(now.getTime() + PAIR_DAYS * 86_400_000);
    const browsers = [...s.browsers, { id: randomUUID(), cookieHash: hash(cookie), pairedAt: now.toISOString(), expiresAt: expiresAt.toISOString() }].slice(-MAX_BROWSERS);
    saveJson(file, { version: 1, pending: null, browsers });
    return { ok: true, cookie, expiresAt };
  });
}

/** Whether this cookie belongs to a paired browser. */
export async function isPaired(file: string, now: Date, cookie: string | null): Promise<boolean> {
  if (!cookie) return false;
  return withLock(file, () => live(load(file), now).browsers.some((b) => sameHash(hash(cookie), b.cookieHash)), true);
}

/** The CSRF token for a pairing cookie: page script can't read the HttpOnly cookie, so only the paired, same-origin status read can hand this out. */
export const csrfTokenFor = (cookie: string) => hash(`atlas-local-csrf:${cookie}`);
export const csrfMatches = (cookie: string, token: string | null) => !!token && sameHash(token, csrfTokenFor(cookie));
