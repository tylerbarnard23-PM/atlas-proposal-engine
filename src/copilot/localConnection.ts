import { randomBytes, randomUUID } from "node:crypto";
import { hash, readJson, saveJson, withLock } from "./localFiles.ts";

// The connection record: WHERE the user's Anthropic API key is kept and which
// revision of it is in use. It never holds the key. Each save, selection or
// disconnect creates a new revision; a live session is bound to the revision
// it started under, so changing the key ends the old session. The salted
// fingerprint exists only to notice a key that changed outside Atlas (an
// edited OS entry, a different environment value); it can't be reversed.
//
// A stored key lives in one of two account slots, and a replacement is always
// written to the FREE one. Only once the new entry is confirmed does the
// record point at it, so a write that fails — or lands without being
// confirmable — leaves the previous key, its revision and its session exactly
// as they were.
//
// An entry is identified by the store it is in AND its slot, never by the slot
// alone: the two stores use the same slot names, so a live memory entry must
// not be able to hide, protect or displace an abandoned OS entry called the
// same thing. `pending` lists entries that may exist and are not the live one,
// so they can be removed later — store names and slot letters, never secrets.
// The intent to write one is recorded BEFORE the write is attempted, so a
// process interrupted mid-write still leaves the entry discoverable.
// Node built-ins only (through localFiles.ts), so the scripts can load it.

/** Where the key is kept: nowhere; this server process's memory; the OS credential store; or the server's environment (managed outside Atlas). */
export type CredentialSource = "none" | "session" | "keychain" | "environment";

/** An account slot in a store. "legacy" is the un-slotted name records used before slots existed. */
export type Slot = "a" | "b" | "legacy";
const SLOTS: readonly Slot[] = ["a", "b", "legacy"];

/** Where Atlas itself can put a key. The environment is managed outside Atlas, so it is never an entry. */
export type EntryStore = "session" | "keychain";

/** One entry Atlas wrote, identified by its store and its slot. Never a secret. */
export interface StoredEntry {
  store: EntryStore;
  slot: Slot;
}

/** Whether two entries are the same account in the same store. */
export const sameEntry = (a: StoredEntry, b: StoredEntry) => a.store === b.store && a.slot === b.slot;
export const entryKey = (e: StoredEntry) => `${e.store}:${e.slot}`;
const isEntry = (v: unknown): v is StoredEntry => {
  const e = v as StoredEntry;
  return !!e && typeof e === "object" && (e.store === "session" || e.store === "keychain") && isSlot(e.slot);
};
const dedupe = (entries: StoredEntry[]) => [...new Map(entries.map((e) => [entryKey(e), e])).values()];

export interface ConnectionState {
  version: 3;
  /** Random per installation: salts the fingerprint and names this installation's credential entries. */
  salt: string;
  source: CredentialSource;
  /** The entry holding the live credential (null when nothing of ours is stored). */
  live: StoredEntry | null;
  /** Entries that may exist and are not the live one, to be removed when the store allows it. */
  pending: StoredEntry[];
  revision: string | null;
  fingerprint: string | null;
  savedAt: string | null;
  /** Set only by a real provider request under this revision; saving a key never sets it. */
  verifiedAt: string | null;
  rejectedAt: string | null;
}

const SOURCES: readonly CredentialSource[] = ["none", "session", "keychain", "environment"];
const strOrNull = (v: unknown) => v === null || (typeof v === "string" && v.length > 0);
const isSlot = (v: unknown): v is Slot => typeof v === "string" && (SLOTS as readonly string[]).includes(v);

const fresh = (): ConnectionState => ({ version: 3, salt: randomBytes(16).toString("hex"), source: "none", live: null, pending: [], revision: null, fingerprint: null, savedAt: null, verifiedAt: null, rejectedAt: null });

type AnyRecord = { version: number; salt: string; source: CredentialSource; slot?: unknown; live?: unknown; pending?: unknown; revision: string | null; fingerprint: string | null; savedAt: string | null; verifiedAt: string | null; rejectedAt: string | null };

/**
 * The record, with versions 1 and 2 migrated in place. A v1 record kept its
 * key under the un-slotted account name; a v2 record named slots by letter
 * and its pending list was always OS-store entries.
 */
function load(file: string): ConnectionState {
  const raw = readJson(file) as AnyRecord | null | undefined;
  // A missing or unreadable record means no connection: nothing is ever guessed.
  if (!raw || typeof raw !== "object" || typeof raw.salt !== "string" || raw.salt.length < 16 || !SOURCES.includes(raw.source)) return fresh();
  if (![1, 2, 3].includes(raw.version)) return { ...fresh(), salt: raw.salt };
  if (![raw.revision, raw.fingerprint, raw.savedAt, raw.verifiedAt, raw.rejectedAt].every(strOrNull)) return { ...fresh(), salt: raw.salt };
  if (raw.source !== "none" && (!raw.revision || !raw.fingerprint)) return { ...fresh(), salt: raw.salt };
  const stored = raw.source === "session" || raw.source === "keychain" ? (raw.source as EntryStore) : null;
  const base = { salt: raw.salt, source: raw.source, revision: raw.revision, fingerprint: raw.fingerprint, savedAt: raw.savedAt, verifiedAt: raw.verifiedAt, rejectedAt: raw.rejectedAt };
  if (raw.version === 1) return { ...base, version: 3, live: stored ? { store: stored, slot: "legacy" } : null, pending: [] };
  if (raw.version === 2) {
    const slot = isSlot(raw.slot) ? raw.slot : null;
    const pending = (Array.isArray(raw.pending) ? raw.pending.filter(isSlot) : []).map((s): StoredEntry => ({ store: "keychain", slot: s }));
    // A stored source with no usable slot can't be read, so it is no connection at all; its entries stay pending.
    if (stored && !slot) return { ...fresh(), salt: raw.salt, pending };
    const live = stored && slot ? { store: stored, slot } : null;
    return { ...base, version: 3, live, pending: dedupe(pending).filter((e) => !(live && sameEntry(e, live))) };
  }
  const pending = dedupe(Array.isArray(raw.pending) ? raw.pending.filter(isEntry) : []);
  const live = isEntry(raw.live) ? raw.live : null;
  if (stored && !live) return { ...fresh(), salt: raw.salt, pending };
  if (!stored && live) return { ...fresh(), salt: raw.salt, pending: dedupe([...pending, live]) };
  return { ...base, version: 3, live, pending: pending.filter((e) => !(live && sameEntry(e, live))) };
}

/** The slot a replacement is written to: never the live one, so the live entry is never overwritten. */
export const freeSlot = (live: StoredEntry | null): Slot => (live?.slot === "a" ? "b" : "a");

export const fingerprintOf = (salt: string, key: string) => hash(`${salt}:${key}`).slice(0, 32);
/** This installation's base account name; `accountFor` adds the slot. */
export const keychainAccount = (salt: string) => `anthropic-api-key-${hash(`account:${salt}`).slice(0, 12)}`;
/** The account name one slot uses. The legacy slot keeps the name records used before slots existed. */
export const accountFor = (salt: string, slot: Slot) => (slot === "legacy" ? keychainAccount(salt) : `${keychainAccount(salt)}-${slot}`);

export async function readConnection(file: string): Promise<ConnectionState> {
  return withLock(file, () => load(file), true);
}

/** The record, created (with this installation's salt) if it doesn't exist yet. For changes; plain reads never write. */
export async function ensureConnection(file: string): Promise<ConnectionState> {
  return withLock(file, () => {
    const s = load(file);
    if (readJson(file) === undefined) saveJson(file, s);
    return s;
  });
}

/**
 * Commits a confirmed key: a new revision in `slot`, not yet verified. The
 * slot the previous key used stays pending until it is removed, so a stored
 * entry is never forgotten about.
 */
export async function recordConnection(file: string, now: Date, source: Exclude<CredentialSource, "none">, key: string, live: StoredEntry | null): Promise<ConnectionState> {
  return withLock(file, () => {
    const prev = load(file);
    // Everything that was stored before stays pending until its removal is confirmed — in either store.
    const stale = [...prev.pending, ...(prev.live ? [prev.live] : [])];
    const next: ConnectionState = {
      version: 3,
      salt: prev.salt,
      source,
      live,
      pending: dedupe(stale).filter((e) => !(live && sameEntry(e, live))),
      revision: randomUUID(),
      fingerprint: fingerprintOf(prev.salt, key),
      savedAt: now.toISOString(),
      verifiedAt: null,
      rejectedAt: null,
    };
    saveJson(file, next);
    return next;
  });
}

/** Records that no key is in use. Entries that may still exist stay pending for cleanup. */
export async function clearConnection(file: string, pending: StoredEntry[] = []): Promise<ConnectionState> {
  return withLock(file, () => {
    const prev = load(file);
    const next: ConnectionState = { ...fresh(), salt: prev.salt, pending: dedupe(pending) };
    saveJson(file, next);
    return next;
  });
}

/**
 * Notes that an entry may exist that isn't the live credential — the intent to
 * write one, recorded before the write is attempted, or one left behind by a
 * failure. Stores the store name and slot, never a secret.
 */
export async function addPending(file: string, entries: StoredEntry[]): Promise<ConnectionState> {
  return withLock(file, () => {
    const prev = load(file);
    const next: ConnectionState = { ...prev, pending: dedupe([...prev.pending, ...entries]).filter((e) => !(prev.live && sameEntry(e, prev.live))) };
    saveJson(file, next);
    return next;
  });
}

/** Drops entries from `pending` once they are known to be gone, or have become the live credential. */
export async function clearPending(file: string, entries: StoredEntry[]): Promise<void> {
  await withLock(file, () => {
    const prev = load(file);
    const pending = prev.pending.filter((e) => !entries.some((x) => sameEntry(x, e)));
    if (pending.length !== prev.pending.length) saveJson(file, { ...prev, pending });
  });
}

/** Records the outcome of a real provider request under one revision (ignored if the revision has changed since). */
export async function markOutcome(file: string, now: Date, revision: string, outcome: "verified" | "rejected"): Promise<void> {
  await withLock(file, () => {
    const s = load(file);
    if (s.revision !== revision) return;
    if (outcome === "verified") saveJson(file, { ...s, verifiedAt: s.verifiedAt ?? now.toISOString(), rejectedAt: null });
    else saveJson(file, { ...s, rejectedAt: now.toISOString() });
  });
}

/** Normalizes a credential the same way wherever it comes from (pasted, or the server's environment). */
export const normalizeKey = (key: unknown) => (typeof key === "string" ? key.trim() : "");

/**
 * Why this credential must not be used here, or null. Checked locally; no
 * request is made, and the value is never echoed in the reason.
 *
 * Atlas refuses what it can positively identify as the wrong credential and
 * accepts the rest. Anthropic's documentation states a format for **Admin API
 * keys only** (`sk-ant-admin…`); it states none for ordinary API keys, so a
 * prefix is not evidence that a value is one, and requiring a familiar shape
 * would reject a valid key. The subscription-token shapes below are
 * community-sourced, so this list is a best-effort guard, not an exhaustive
 * format: whether a credential really works is settled by the first request.
 */
export function keyShapeProblem(key: unknown): string | null {
  if (typeof key !== "string" || !key.trim()) return "Paste an API key.";
  const k = normalizeKey(key);
  if (/[\s\u0000-\u001f\u007f]/.test(k)) return "That doesn't look like an API key: it contains a space, a line break or a control character.";
  if (k.length < 20) return "That doesn't look like an API key: it is too short.";
  if (k.length > 512) return "That doesn't look like an API key: it is too long.";
  if (/^sk-ant-admin/i.test(k)) return "That is an Admin API key, which manages a whole organization. Don't use it here: create a key for a single workspace instead.";
  // `claude setup-token` tokens belong to a Claude subscription, not to the API: using one here isn't a supported way to authenticate an application.
  if (/^sk-ant-o(at|rt)/i.test(k)) return "That looks like a Claude subscription token from Claude Code, not an API key. Atlas uses an API key from the Claude Console, billed to your Console account.";
  return null;
}
