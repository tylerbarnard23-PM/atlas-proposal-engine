import { randomBytes, randomUUID } from "node:crypto";
import { keyShapeProblem, normalizeKey } from "@/copilot/localConnection";
import type { Sql } from "./db";
import { fingerprint, open, seal, type KeyRing } from "./crypto";
import type { HostedProvider } from "./config";

// #113: each user's own Anthropic API key on the hosted path. Saved encrypted
// (crypto.ts) under a new revision; never returned to the browser, logged,
// put in a URL, backed up or sent to a model. Saving makes no provider
// request: the status is "Saved · not yet verified" until an analysis the user
// asked for gets an answer from Anthropic.

export type HostedConnectionStatus = "none" | "saved" | "verified" | "rejected" | "unreadable";

/** What the browser may know about the saved key. Never the key, nor any part of it. */
export interface HostedConnectionView {
  status: HostedConnectionStatus;
  label: string;
  message: string;
  savedAt: string | null;
  verifiedAt: string | null;
}

interface Row {
  revision: string;
  salt: string;
  fingerprint: string;
  key_id: string;
  iv: string;
  tag: string;
  ciphertext: string;
  saved_at: string | Date;
  verified_at: string | Date | null;
  rejected_at: string | Date | null;
}

const iso = (v: string | Date | null) => (v == null ? null : new Date(v).toISOString());

async function rowOf(sql: Pick<Sql, "query">, userId: string): Promise<Row | null> {
  return (await sql.query<Row>("select revision, salt, fingerprint, key_id, iv, tag, ciphertext, saved_at, verified_at, rejected_at from stratovell_credentials where user_id = $1", [userId])).rows[0] ?? null;
}

/** The connection as the user may see it. Checks that the key can be decrypted by this server's key ring without decrypting it. */
export async function connectionView(sql: Sql, ring: KeyRing, userId: string, provider: HostedProvider): Promise<HostedConnectionView> {
  const r = await rowOf(sql, userId);
  if (!r) return { status: "none", label: "Not connected", message: "No API key is connected. Connect your own Anthropic API key to run Claude analysis.", savedAt: null, verifiedAt: null };
  const base = { savedAt: iso(r.saved_at), verifiedAt: iso(r.verified_at) };
  if (!ring.byId.has(r.key_id)) return { ...base, status: "unreadable", label: "Can't be used", message: "The saved key can't be decrypted with this server's encryption keys. Replace it to continue." };
  if (provider === "fake") return { ...base, status: "saved", label: "Saved", message: "Key saved. The test provider is running here, so the key isn't used and can't be verified." };
  const verified = iso(r.verified_at);
  const rejected = iso(r.rejected_at);
  if (rejected && (!verified || rejected > verified)) return { ...base, status: "rejected", label: "Rejected", message: "Anthropic rejected this key on the last request. Check it in the Claude Console, then replace it." };
  if (verified) return { ...base, status: "verified", label: "Verified", message: "Anthropic accepted this key on an analysis you ran." };
  return { ...base, status: "saved", label: "Saved · not yet verified", message: "Saved encrypted. Stratovell hasn't contacted Anthropic: your first analysis is the first request." };
}

/** The revision of the key in use now, or null when none is saved (re-read before every provider request). */
export async function currentRevision(sql: Pick<Sql, "query">, userId: string): Promise<string | null> {
  return (await sql.query<{ revision: string }>("select revision from stratovell_credentials where user_id = $1", [userId])).rows[0]?.revision ?? null;
}

export type SaveResult = { ok: true; revision: string } | { ok: false; status: number; code: string; error: string };

/** Saves or replaces the user's key (a new revision every time). No provider request. */
export async function saveCredential(sql: Sql, ring: KeyRing, userId: string, rawKey: unknown, now: Date): Promise<SaveResult> {
  const problem = keyShapeProblem(rawKey);
  if (problem) return { ok: false, status: 400, code: "bad_key", error: problem };
  const key = normalizeKey(rawKey);
  const revision = randomUUID();
  const salt = randomBytes(16).toString("base64");
  const s = seal(ring, key, userId, revision);
  await sql.query(
    `insert into stratovell_credentials (user_id, revision, salt, fingerprint, key_id, iv, tag, ciphertext, saved_at, verified_at, rejected_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, null, null)
     on conflict (user_id) do update set revision = excluded.revision, salt = excluded.salt, fingerprint = excluded.fingerprint, key_id = excluded.key_id,
       iv = excluded.iv, tag = excluded.tag, ciphertext = excluded.ciphertext, saved_at = excluded.saved_at, verified_at = null, rejected_at = null`,
    [userId, revision, salt, fingerprint(salt, key), s.keyId, s.iv, s.tag, s.ciphertext, now.toISOString()]
  );
  return { ok: true, revision };
}

/** Removes the user's key. Returns whether one was saved. */
export async function deleteCredential(sql: Sql, userId: string): Promise<boolean> {
  return (await sql.query<{ user_id: string }>("delete from stratovell_credentials where user_id = $1 returning user_id", [userId])).rows.length > 0;
}

export type KeyRead = { ok: true; key: string; revision: string } | { ok: false; code: "no_credential" | "credential_unreadable" | "credential_changed"; error: string };

/** Decrypts the user's key for an admitted run or a session start. Only these call it; nothing returns it. */
export async function readKey(sql: Sql, ring: KeyRing, userId: string): Promise<KeyRead> {
  const r = await rowOf(sql, userId);
  if (!r) return { ok: false, code: "no_credential", error: "No API key is connected. Connect your Anthropic API key first." };
  const key = open(ring, { keyId: r.key_id, iv: r.iv, tag: r.tag, ciphertext: r.ciphertext }, userId, r.revision);
  if (key == null) return { ok: false, code: "credential_unreadable", error: "The saved key can't be decrypted with this server's encryption keys. Replace it to continue." };
  if (fingerprint(r.salt, key) !== r.fingerprint) return { ok: false, code: "credential_changed", error: "The saved key doesn't match its fingerprint. Replace it to continue." };
  return { ok: true, key, revision: r.revision };
}

/** Records Anthropic's answer to a request under one revision (ignored if the key was replaced since). */
export async function markOutcome(sql: Pick<Sql, "query">, userId: string, revision: string, outcome: "verified" | "rejected", now: Date): Promise<void> {
  const column = outcome === "verified" ? "verified_at" : "rejected_at";
  await sql.query(`update stratovell_credentials set ${column} = $3 where user_id = $1 and revision = $2`, [userId, revision, now.toISOString()]);
}
