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

/**
 * Checks a pasted key's shape locally; no request is made. A standard
 * Anthropic API key only: Admin keys (sk-ant-admin…) manage an organization
 * and must never be used here.
 */
export function keyShapeProblem(key: unknown): string | null {
  if (typeof key !== "string" || !key.trim()) return "Paste an API key.";
  const k = key.trim();
  if (/\s/.test(k)) return "That doesn't look like an API key: it contains a space or a line break.";
  if (k.length > 512) return "That doesn't look like an API key: it is too long.";
  if (/^sk-ant-admin/i.test(k)) return "That is an Admin API key, which manages a whole organization. Don't use it here: create a standard API key in a dedicated workspace instead.";
  if (!k.startsWith("sk-ant-") || k.length < 20) return "That doesn't look like an Anthropic API key (they start with sk-ant-). Copy the key again from the Claude Console.";
  return null;
}
