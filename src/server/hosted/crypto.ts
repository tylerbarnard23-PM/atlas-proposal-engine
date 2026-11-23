import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { credentialKeysProblem } from "./config";

// #113: encryption of saved API keys. AES-256-GCM with a random 96-bit IV per
// save; the additional authenticated data binds a ciphertext to one user and
// one credential revision, so a row copied to another user, or an older
// revision, doesn't decrypt. The encryption keys come from the environment
// (STRATOVELL_CREDENTIAL_KEYS), managed separately from the database: the
// first key encrypts, every listed key can decrypt (rotation).

export interface Sealed {
  keyId: string;
  iv: string;
  tag: string;
  ciphertext: string;
}

export interface KeyRing {
  current: { id: string; key: Buffer };
  byId: Map<string, Buffer>;
}

export function keyRingFrom(raw: string | undefined): KeyRing {
  const problem = credentialKeysProblem(raw);
  if (problem) throw new Error(problem);
  const byId = new Map<string, Buffer>();
  let current: KeyRing["current"] | null = null;
  for (const e of raw!.split(",").map((s) => s.trim()).filter(Boolean)) {
    const i = e.indexOf(":");
    const id = e.slice(0, i);
    const key = Buffer.from(e.slice(i + 1), "base64");
    byId.set(id, key);
    current ??= { id, key };
  }
  return { current: current!, byId };
}

const aadFor = (userId: string, revision: string) => Buffer.from(`stratovell-credential:v1:${userId}:${revision}`, "utf8");

export function seal(ring: KeyRing, plaintext: string, userId: string, revision: string): Sealed {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", ring.current.key, iv);
  cipher.setAAD(aadFor(userId, revision));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return { keyId: ring.current.id, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ciphertext: ciphertext.toString("base64") };
}

/** The plaintext, or null when it can't be decrypted (unknown key id, wrong user or revision, or tampering). Never throws the secret. */
export function open(ring: KeyRing, s: Sealed, userId: string, revision: string): string | null {
  const key = ring.byId.get(s.keyId);
  if (!key) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(s.iv, "base64"));
    decipher.setAAD(aadFor(userId, revision));
    decipher.setAuthTag(Buffer.from(s.tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(s.ciphertext, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** A keyed fingerprint of a key under a per-user salt: tells whether two keys are the same without revealing either. */
export const fingerprint = (salt: string, key: string) => createHmac("sha256", salt).update(key, "utf8").digest("hex").slice(0, 32);

export const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
export const randomToken = () => randomBytes(32).toString("base64url");
export const sameHex = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
