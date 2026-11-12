import { randomBytes, randomUUID } from "node:crypto";
import { hash, readJson, saveJson, withLock } from "./localFiles.ts";

// The connection record: WHERE the user's Anthropic API key is kept and which
// revision of it is in use. It never holds the key. Each save, selection or
// disconnect creates a new revision; a live session is bound to the revision
// it started under, so changing the key ends the old session. The salted
// fingerprint exists only to notice a key that changed outside Atlas (an
// edited OS entry, a different environment value); it can't be reversed.
// Node built-ins only (through localFiles.ts), so the scripts can load it.

/** Where the key is kept: nowhere; this server process's memory; the OS credential store; or the server's environment (managed outside Atlas). */
export type CredentialSource = "none" | "session" | "keychain" | "environment";

export interface ConnectionState {
  version: 1;
  /** Random per installation: salts the fingerprint and names this installation's OS credential entry. */
  salt: string;
  source: CredentialSource;
  revision: string | null;
  fingerprint: string | null;
  savedAt: string | null;
  /** Set only by a real provider request under this revision; saving a key never sets it. */
  verifiedAt: string | null;
  rejectedAt: string | null;
}

const SOURCES: readonly CredentialSource[] = ["none", "session", "keychain", "environment"];
const strOrNull = (v: unknown) => v === null || (typeof v === "string" && v.length > 0);

const fresh = (): ConnectionState => ({ version: 1, salt: randomBytes(16).toString("hex"), source: "none", revision: null, fingerprint: null, savedAt: null, verifiedAt: null, rejectedAt: null });

function load(file: string): ConnectionState {
  const raw = readJson(file) as ConnectionState | null | undefined;
  // A missing or unreadable record means no connection: nothing is ever guessed.
  if (!raw || raw.version !== 1 || typeof raw.salt !== "string" || raw.salt.length < 16 || !SOURCES.includes(raw.source)) return fresh();
  if (![raw.revision, raw.fingerprint, raw.savedAt, raw.verifiedAt, raw.rejectedAt].every(strOrNull)) return { ...fresh(), salt: raw.salt };
  if (raw.source !== "none" && (!raw.revision || !raw.fingerprint)) return { ...fresh(), salt: raw.salt };
  return raw;
}

export const fingerprintOf = (salt: string, key: string) => hash(`${salt}:${key}`).slice(0, 32);
/** This installation's account name in the OS credential store. */
export const keychainAccount = (salt: string) => `anthropic-api-key-${hash(`account:${salt}`).slice(0, 12)}`;

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

/** Records a newly saved or selected key: a new revision, not yet verified. */
export async function recordConnection(file: string, now: Date, source: Exclude<CredentialSource, "none">, key: string): Promise<ConnectionState> {
  return withLock(file, () => {
    const prev = load(file);
    const next: ConnectionState = { version: 1, salt: prev.salt, source, revision: randomUUID(), fingerprint: fingerprintOf(prev.salt, key), savedAt: now.toISOString(), verifiedAt: null, rejectedAt: null };
    saveJson(file, next);
    return next;
  });
}

/** Records that no key is in use. */
export async function clearConnection(file: string): Promise<ConnectionState> {
  return withLock(file, () => {
    const next: ConnectionState = { ...fresh(), salt: load(file).salt };
    saveJson(file, next);
    return next;
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
