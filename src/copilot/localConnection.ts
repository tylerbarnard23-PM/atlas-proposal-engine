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
// as they were. Slots whose entry may still exist are listed in `pending` so
// they can be removed later; those are names, never secrets.
// Node built-ins only (through localFiles.ts), so the scripts can load it.

/** Where the key is kept: nowhere; this server process's memory; the OS credential store; or the server's environment (managed outside Atlas). */
export type CredentialSource = "none" | "session" | "keychain" | "environment";

/** An account slot in a store. "legacy" is the un-slotted name records used before slots existed. */
export type Slot = "a" | "b" | "legacy";
const SLOTS: readonly Slot[] = ["a", "b", "legacy"];

export interface ConnectionState {
  version: 2;
  /** Random per installation: salts the fingerprint and names this installation's credential entries. */
  salt: string;
  source: CredentialSource;
  /** Which slot holds the live credential (null when nothing of ours is stored). */
  slot: Slot | null;
  /** Slots whose entry may still exist and should be removed: names only, never secrets. Always OS-store slots. */
  pending: Slot[];
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

const fresh = (): ConnectionState => ({ version: 2, salt: randomBytes(16).toString("hex"), source: "none", slot: null, pending: [], revision: null, fingerprint: null, savedAt: null, verifiedAt: null, rejectedAt: null });

function load(file: string): ConnectionState {
  const raw = readJson(file) as (Omit<ConnectionState, "version"> & { version: number }) | null | undefined;
  // A missing or unreadable record means no connection: nothing is ever guessed.
  if (!raw || typeof raw !== "object" || typeof raw.salt !== "string" || raw.salt.length < 16 || !SOURCES.includes(raw.source)) return fresh();
  if (raw.version !== 1 && raw.version !== 2) return { ...fresh(), salt: raw.salt };
  if (![raw.revision, raw.fingerprint, raw.savedAt, raw.verifiedAt, raw.rejectedAt].every(strOrNull)) return { ...fresh(), salt: raw.salt };
  if (raw.source !== "none" && (!raw.revision || !raw.fingerprint)) return { ...fresh(), salt: raw.salt };
  // A record written before slots existed keeps its key under the un-slotted name.
  if (raw.version === 1) return { ...raw, version: 2, slot: raw.source === "session" || raw.source === "keychain" ? "legacy" : null, pending: [] };
  const pending = Array.isArray(raw.pending) ? raw.pending.filter(isSlot) : [];
  const slot = isSlot(raw.slot) ? raw.slot : null;
  // A stored source with no usable slot can't be read, so it is no connection at all; its slots stay pending for cleanup.
  if ((raw.source === "session" || raw.source === "keychain") && !slot) return { ...fresh(), salt: raw.salt, pending };
  return { ...raw, version: 2, slot, pending: pending.filter((p) => p !== slot) };
}

/** The slot a replacement is written to: never the live one, so the live entry is never overwritten. */
export const freeSlot = (c: Pick<ConnectionState, "slot">): Slot => (c.slot === "a" ? "b" : "a");

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
export async function recordConnection(file: string, now: Date, source: Exclude<CredentialSource, "none">, key: string, slot: Slot | null): Promise<ConnectionState> {
  return withLock(file, () => {
    const prev = load(file);
    const stale = [...prev.pending, ...(prev.slot && prev.source === "keychain" ? [prev.slot] : [])];
    const next: ConnectionState = {
      version: 2,
      salt: prev.salt,
      source,
      slot,
      pending: [...new Set(stale)].filter((p) => p !== slot),
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

/** Records that no key is in use. Slots that may still hold an entry stay pending for cleanup. */
export async function clearConnection(file: string, pending: Slot[] = []): Promise<ConnectionState> {
  return withLock(file, () => {
    const prev = load(file);
    const next: ConnectionState = { ...fresh(), salt: prev.salt, pending: [...new Set(pending)] };
    saveJson(file, next);
    return next;
  });
}

/** Notes that a slot may hold an entry Atlas no longer uses, so it can be removed later. Stores no secret. */
export async function addPending(file: string, slots: Slot[]): Promise<ConnectionState> {
  return withLock(file, () => {
    const prev = load(file);
    const next: ConnectionState = { ...prev, pending: [...new Set([...prev.pending, ...slots])].filter((p) => p !== prev.slot) };
    if (readJson(file) === undefined || next.pending.length !== prev.pending.length) saveJson(file, next);
    return next;
  });
}

/** Drops slots from `pending` once their entry is known to be gone. */
export async function clearPending(file: string, slots: Slot[]): Promise<void> {
  await withLock(file, () => {
    const prev = load(file);
    const pending = prev.pending.filter((p) => !slots.includes(p));
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
