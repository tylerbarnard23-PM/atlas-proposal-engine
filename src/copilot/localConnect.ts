import { FIRST_REQUEST_USD, cancelRunningRuns, cookieOf, liveReadiness, localRequestProblem, resolveCredential, type LiveDeps, type LiveProvider, type Refusal } from "./liveGate";
import { KEYCHAIN_SERVICE } from "./credentialStore";
import { instanceId, withAsyncLock } from "./localFiles";
import * as sessions from "./liveSessionStore";
import { accountFor, addPending, clearConnection, clearPending, ensureConnection, entryKey, freeSlot, keyShapeProblem, normalizeKey, readConnection, recordConnection, sameEntry, type ConnectionState, type CredentialSource, type EntryStore, type StoredEntry } from "./localConnection";
import { PAIR_COOKIE, PAIR_DAYS, csrfMatches, csrfTokenFor, isPaired, redeemPairingToken } from "./localPairing";

// Connect Claude: what a paired browser on this machine may do to the local
// Claude connection. Pairing (localPairing.ts) is permission to manage the
// connection; it is separate from a session's spending allowance.
//
// Every change here needs ALL of: a server set up for local live mode (never a
// hosted deployment); a local, same-origin request; the pairing cookie; and
// the CSRF token in a header. A local address or an Origin header alone
// authorizes nothing. None of these operations contacts Anthropic: saving a
// key, selecting one or starting a session makes no provider request, so a
// saved key is "not yet verified" until the user's first question succeeds.
// The key is accepted once, kept where the user chose, and never returned.

export const CSRF_HEADER = "x-atlas-csrf";
export const MAX_KEY_BODY_BYTES = 4_096;

/** This instance's pairing cookie name (see instanceId): one host can run two Atlas instances, each paired on its own. */
export const pairCookieName = (env: Record<string, string | undefined>) => `${PAIR_COOKIE}_${instanceId(env)}`;
export const pairingCookie = (env: Record<string, string | undefined>, value: string, expires: Date) => `${pairCookieName(env)}=${encodeURIComponent(value)}; Path=/api/copilot; HttpOnly; SameSite=Strict; Expires=${expires.toUTCString()}`;

export type ConnectionStatus = "none" | "saved" | "verified" | "rejected" | "missing" | "changed" | "unreadable";

/** The connection as a paired browser may see it. Never the key, nor any part of it. */
export interface ConnectionView {
  source: CredentialSource;
  status: ConnectionStatus;
  message: string;
  savedAt: string | null;
  verifiedAt: string | null;
}

export interface LocalInfo {
  /** Whether this browser may manage the connection. */
  paired: boolean;
  /** Sent back in the X-Atlas-CSRF header on every change. Only a paired browser gets one. */
  csrf: string | null;
  connection: ConnectionView | null;
  /** Whether ANTHROPIC_API_KEY is set in the server's environment (presence only). */
  environmentKey: boolean;
  /** Whether the OS credential store can be used here, and if not, why. */
  remember: { available: boolean; reason: string | null } | null;
  /** The most a session may be given, and the smallest USD guard that still allows one request. */
  ceilings: sessions.AllowanceChoice;
  minimumUsd: number;
}

const SOURCE_LABEL: Record<CredentialSource, string> = {
  none: "No key",
  session: "this server session only",
  keychain: "the operating system's credential store",
  environment: "the server's environment (managed outside Atlas)",
};

function viewOf(conn: ConnectionState, problem: { code: string; error: string } | null, provider: LiveProvider): ConnectionView {
  const base = { source: conn.source, savedAt: conn.savedAt, verifiedAt: conn.verifiedAt };
  if (conn.source === "none") return { ...base, status: "none", message: provider === "fake" ? "No key is connected. The fake provider needs none." : "No key is connected yet." };
  if (problem) {
    const status: ConnectionStatus = problem.code === "credential_changed" ? "changed" : problem.code === "credential_unreadable" ? "unreadable" : "missing";
    return { ...base, status, message: problem.error };
  }
  const where = `Kept in ${SOURCE_LABEL[conn.source]}.`;
  if (provider === "fake") return { ...base, status: "saved", message: `Key saved. ${where} The fake provider is running, so the key isn't used and can't be verified here.` };
  if (conn.rejectedAt && (!conn.verifiedAt || conn.rejectedAt > conn.verifiedAt)) return { ...base, status: "rejected", message: `Anthropic rejected this key on the last request. ${where} Check it in the Claude Console, then replace it.` };
  if (conn.verifiedAt) return { ...base, status: "verified", message: `Connected: Anthropic accepted this key on a request. ${where}` };
  return { ...base, status: "saved", message: `Key saved; connection not yet verified. ${where} Atlas hasn't contacted Anthropic: your first question will be the first request.` };
}

async function connectionView(deps: LiveDeps, provider: LiveProvider, conn?: ConnectionState): Promise<ConnectionView> {
  const c = conn ?? (await readConnection(deps.connectionFile));
  // The status read never opens the OS credential store; a problem there shows when a session starts.
  const r = c.source === "none" ? null : await resolveCredential(deps, c, false);
  return viewOf(c, r && !r.ok ? r : null, provider);
}

const ceilings = (): sessions.AllowanceChoice => ({ minutes: sessions.LIVE_SESSION_LIMITS.minutes, runs: sessions.LIVE_SESSION_LIMITS.runs, requests: sessions.LIVE_SESSION_LIMITS.requests, usd: sessions.LIVE_SESSION_LIMITS.usd });
const minimumUsd = () => Math.ceil(FIRST_REQUEST_USD * 100) / 100;

/** What this browser may know about the local connection (part of the status GET; changes nothing). */
export async function localInfo(req: Request, deps: LiveDeps): Promise<LocalInfo | null> {
  const ready = liveReadiness(deps.env);
  if (!ready.ok || localRequestProblem(req, "read")) return null;
  const cookie = cookieOf(req, pairCookieName(deps.env));
  const base = { ceilings: ceilings(), minimumUsd: minimumUsd() };
  if (!cookie || !(await isPaired(deps.pairingFile, deps.now(), cookie))) return { ...base, paired: false, csrf: null, connection: null, environmentKey: false, remember: null };
  const remember = await deps.secrets.keychain.available();
  return {
    ...base,
    paired: true,
    csrf: csrfTokenFor(cookie),
    connection: await connectionView(deps, ready.provider),
    environmentKey: !!deps.env.ANTHROPIC_API_KEY,
    remember: remember.ok ? { available: true, reason: null } : { available: false, reason: remember.reason },
  };
}

/** GET /api/copilot/local/pair?token=… : exchanges the launcher's one-time link for this browser's pairing cookie. */
export async function pairBrowser(req: Request, deps: LiveDeps, token: string): Promise<{ ok: true; cookie: string; expiresAt: Date } | Refusal> {
  const ready = liveReadiness(deps.env);
  if (!ready.ok) return { ok: false, status: 503, code: "live_unavailable", error: `Local live mode isn't available: ${ready.reasons.join(" ")}` };
  const local = localRequestProblem(req, "navigate");
  if (local) return { ok: false, status: 403, code: "not_local", error: local };
  const r = await redeemPairingToken(deps.pairingFile, deps.now(), token);
  if (!r.ok) return { ok: false, status: 403, code: "bad_pairing_token", error: r.error };
  return { ok: true, cookie: r.cookie, expiresAt: r.expiresAt };
}

/**
 * The checks every change passes, in order, before anything is read or
 * changed — the request body included: the handlers call this first, so an
 * unauthorized request never makes the server read what it sent.
 */
export async function authorizeLocal(req: Request, deps: LiveDeps): Promise<{ ok: true; provider: LiveProvider } | Refusal> {
  const ready = liveReadiness(deps.env);
  if (!ready.ok) return { ok: false, status: 503, code: "live_unavailable", error: `Local live mode isn't available: ${ready.reasons.join(" ")}` };
  const local = localRequestProblem(req, "write");
  if (local) return { ok: false, status: 403, code: "not_local", error: local };
  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return { ok: false, status: 415, code: "bad_content_type", error: "Send JSON." };
  const cookie = cookieOf(req, pairCookieName(deps.env));
  if (!cookie || !(await isPaired(deps.pairingFile, deps.now(), cookie)))
    return { ok: false, status: 401, code: "not_paired", error: "This browser isn't paired with Atlas on this machine. Open Atlas from the launcher (npm run local), or run npm run local:pair and open its link." };
  if (!csrfMatches(cookie, req.headers.get(CSRF_HEADER))) return { ok: false, status: 403, code: "bad_csrf", error: "This request didn't carry the page's security token. Reload the page and try again." };
  return { ok: true, provider: ready.provider };
}

/** Ends the session in use, if any, because the key changed: no further request runs under it. Its counters and open reservations are kept. */
async function endSessionFor(deps: LiveDeps, reason: string) {
  cancelRunningRuns();
  await sessions.stopSession(deps.sessionFile, deps.now(), reason);
}

const LEFT_BEHIND = `An earlier entry couldn't be removed from the operating system's credential store, so one may still be there. Atlas will remove it the next time the store is available, or you can remove the "${KEYCHAIN_SERVICE}" entries there yourself.`;

const storeOf = (deps: LiveDeps, store: EntryStore) => (store === "session" ? deps.secrets.session : deps.secrets.keychain);

/**
 * Every change to the credential — choosing a slot, the native write, the
 * metadata commit and the cleanup — runs as one operation per installation,
 * across processes. Overlapping changes are serialized rather than
 * interleaved, so one can't delete another's key or pick the same free slot.
 * Stop is deliberately not behind this: halting spending must never wait on a
 * credential store.
 */
function credentialTransaction<T>(deps: LiveDeps, fn: () => Promise<T>): Promise<T> {
  return withAsyncLock(deps.connectionFile, fn);
}

const BUSY = "Another change to the Claude connection is still in progress on this machine. Try again in a moment.";
const busy = (): Refusal => ({ ok: false, status: 409, code: "connection_busy", error: BUSY });

/**
 * Removes every entry Atlas stored except `keep`, in the store each one
 * belongs to: the previous live entry and anything left pending by an earlier
 * failure or an interrupted write. Entries whose removal can't be confirmed
 * stay pending, and are reported rather than forgotten.
 */
async function forgetStored(deps: LiveDeps, conn: ConnectionState, keep: StoredEntry | null): Promise<{ warning: string | null; stuck: StoredEntry[] }> {
  const stuck: StoredEntry[] = [];
  const gone: StoredEntry[] = [];
  const seen = new Set<string>();
  for (const entry of [...(conn.live ? [conn.live] : []), ...conn.pending]) {
    if (keep && sameEntry(entry, keep)) continue;
    if (seen.has(entryKey(entry))) continue;
    seen.add(entryKey(entry));
    const r = await storeOf(deps, entry.store).delete(accountFor(conn.salt, entry.slot));
    (r.ok ? gone : stuck).push(entry);
  }
  if (gone.length) await clearPending(deps.connectionFile, gone);
  if (stuck.length) await addPending(deps.connectionFile, stuck);
  return { warning: stuck.some((e) => e.store === "keychain") ? LEFT_BEHIND : null, stuck };
}

type Changed = { ok: true; connection: ConnectionView; warning: string | null } | Refusal;

const KEEP_PREVIOUS = "Your previous connection is unchanged.";
const TRY_SESSION = "You can keep the key for this server session only instead.";

/**
 * Saves a pasted key where the user chose, in two steps: it is written to the
 * free slot and committed only once it reads back. The live entry is never
 * overwritten, so a failure leaves the previous key, its revision and its
 * session exactly as they were. Makes no provider request, and never echoes
 * the key.
 */
export async function saveKey(deps: LiveDeps, provider: LiveProvider, body: { key?: unknown; storage?: unknown }): Promise<Changed> {
  const problem = keyShapeProblem(body.key);
  if (problem) return { ok: false, status: 400, code: "bad_key", error: problem };
  const storage = body.storage;
  if (storage !== "session" && storage !== "keychain") return { ok: false, status: 400, code: "bad_storage", error: "Choose where to keep the key: this server session only, or the operating system's credential store." };
  const key = normalizeKey(body.key);
  if (storage === "keychain") {
    const usable = await deps.secrets.keychain.available();
    // Never a plaintext fallback: if the OS store can't hold it, nothing is saved and the earlier connection stands.
    if (!usable.ok) return { ok: false, status: 503, code: "remember_unavailable", error: `${usable.reason} Nothing was saved. ${TRY_SESSION}` };
  }
  return credentialTransaction(deps, async () => {
    // Inside the transaction, so the free slot can't be chosen twice.
    const prev = await ensureConnection(deps.connectionFile);
    const target: StoredEntry = { store: storage, slot: freeSlot(prev.live) };
    const account = accountFor(prev.salt, target.slot);
    const store = storeOf(deps, storage);
    // The intent is recorded BEFORE the write: an interrupted write is then still discoverable.
    await addPending(deps.connectionFile, [target]);
    const written = await store.set(account, key);
    if (!written.ok) {
      if (!written.maybeStored) {
        await clearPending(deps.connectionFile, [target]);
        return { ok: false, status: 503, code: "remember_unavailable", error: `${written.reason} Nothing was saved. ${KEEP_PREVIOUS} ${TRY_SESSION}` } as const;
      }
      // The write may have landed: remove it, and if that can't be confirmed, leave it pending and say so.
      const removed = await store.delete(account);
      if (removed.ok) await clearPending(deps.connectionFile, [target]);
      const left = removed.ok ? "The entry it had started to write was removed." : LEFT_BEHIND;
      return { ok: false, status: 503, code: "remember_unavailable", error: `${written.reason} The new key was not connected. ${KEEP_PREVIOUS} ${left} ${TRY_SESSION}` } as const;
    }
    // Confirmed: commit, then clear out what the previous key and any earlier failure left, in each one's own store.
    const conn = await recordConnection(deps.connectionFile, deps.now(), storage, key, target);
    const { warning } = await forgetStored(deps, { ...prev, live: prev.live, pending: conn.pending }, target);
    await endSessionFor(deps, "the API key was replaced");
    return { ok: true, connection: await connectionView(deps, provider, await readConnection(deps.connectionFile)), warning } as const;
  }).catch((err) => (isBusy(err) ? busy() : Promise.reject(err)));
}

const isBusy = (err: unknown) => err instanceof Error && /still in progress/.test(err.message);

/** Selects the key in the server's environment, explicitly. Atlas doesn't manage it and can't remove it. */
export async function useEnvironmentKey(deps: LiveDeps, provider: LiveProvider): Promise<Changed> {
  // Normalized and checked exactly like a pasted key, and never echoed in the reason.
  const key = normalizeKey(deps.env.ANTHROPIC_API_KEY);
  if (!key) return { ok: false, status: 400, code: "no_environment_key", error: "ANTHROPIC_API_KEY isn't set in the server's environment." };
  const problem = keyShapeProblem(key);
  if (problem) return { ok: false, status: 400, code: "bad_key", error: `The key in the server's environment can't be used. ${problem}` };
  return credentialTransaction(deps, async () => {
    const prev = await ensureConnection(deps.connectionFile);
    await recordConnection(deps.connectionFile, deps.now(), "environment", key, null);
    const { warning } = await forgetStored(deps, prev, null);
    await endSessionFor(deps, "the API key was replaced");
    return { ok: true, connection: await connectionView(deps, provider, await readConnection(deps.connectionFile)), warning } as const;
  }).catch((err) => (isBusy(err) ? busy() : Promise.reject(err)));
}

/** Removes the key Atlas stored and records that none is in use. */
export async function disconnect(deps: LiveDeps, provider: LiveProvider): Promise<Changed> {
  return credentialTransaction(deps, async () => {
    // Everything Atlas stored goes, in whichever store it is in, including an entry
    // left behind by a failed first save or an interrupted write.
    const prev = await ensureConnection(deps.connectionFile);
    const { warning: stored, stuck } = await forgetStored(deps, prev, null);
    const conn = await clearConnection(deps.connectionFile, stuck);
    await endSessionFor(deps, "the API key was disconnected");
    const env = prev.source === "environment" ? "The key in the server's environment is managed outside Atlas and is still set there; Atlas no longer uses it." : null;
    return { ok: true, connection: await connectionView(deps, provider, conn), warning: [stored, env].filter(Boolean).join(" ") || null } as const;
  }).catch((err) => (isBusy(err) ? busy() : Promise.reject(err)));
}

/**
 * Starts a session for this browser, after the user confirmed the allowance
 * shown. The confirmation must state every limit; each may be at or below its
 * ceiling, never above. Nothing is sent to the provider. One atomic step: of
 * several concurrent starts, one succeeds.
 */
export async function startSession(deps: LiveDeps, provider: LiveProvider, body: { allowance?: unknown }): Promise<{ ok: true; cookie: string; expiresAt: Date; session: sessions.SessionView } | Refusal> {
  const a = body.allowance as Partial<sessions.AllowanceChoice> | null | undefined;
  if (!a || typeof a !== "object" || !(["minutes", "runs", "requests", "usd"] as const).every((k) => typeof a[k] === "number"))
    return { ok: false, status: 400, code: "bad_allowance", error: "Confirm the session's allowance: its minutes, runs, requests and USD guard." };
  const allowance = sessions.allowanceFrom({ minutes: a.minutes, runs: a.runs, requests: a.requests, usd: a.usd });
  if (!allowance.ok) return { ok: false, status: 400, code: "bad_allowance", error: allowance.error };
  if (allowance.allowance.usd < FIRST_REQUEST_USD)
    return { ok: false, status: 400, code: "bad_allowance", error: `A USD ${allowance.allowance.usd} guard couldn't admit one request: each is reserved at its worst case first, about USD ${minimumUsd().toFixed(2)}. Choose at least that.` };
  const conn = await readConnection(deps.connectionFile);
  // With Anthropic the key must be readable now; the fake provider needs none and reads none.
  if (provider === "anthropic") {
    const cred = await resolveCredential(deps, conn);
    if (!cred.ok) return { ok: false, status: 409, code: cred.code, error: cred.error };
  }
  const now = deps.now();
  const armed = await sessions.armSession(deps.sessionFile, now, provider, { allowance: allowance.allowance, credentialRevision: conn.revision, claim: true });
  if (!armed.ok) return { ok: false, status: armed.code === "already_armed" ? 409 : 400, code: armed.code, error: armed.error };
  const cookie = armed.cookie!;
  return { ok: true, cookie, expiresAt: sessions.expiresAt(armed.state), session: await sessions.readView(deps.sessionFile, now, cookie, FIRST_REQUEST_USD, provider, conn.revision) };
}

export { PAIR_DAYS };
