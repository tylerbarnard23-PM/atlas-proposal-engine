import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { MessagesClient } from "@/copilot/agent";
import type { SecretStore } from "@/copilot/credentialStore";
import { memoryStore } from "@/copilot/credentialStore";
import type { LiveDeps } from "@/copilot/liveGate";
import { fingerprintOf, type ConnectionState } from "@/copilot/localConnection";
import { readJson, saveJson } from "@/copilot/localFiles";

// Test-only: the live gate's dependencies over a temporary directory, with
// fake secret stores and a fake provider client. No real credential store and
// no provider is ever touched.

/** A fake OS credential store: in memory, optionally unsupported or locked. */
export function fakeKeychain(state: { unsupported?: boolean; locked?: boolean } = {}) {
  const map = new Map<string, string>();
  const calls = { get: 0, set: 0, delete: 0 };
  const guard = () => {
    if (state.unsupported) throw new Error("Secure remembering isn't available on this computer (fake).");
    if (state.locked) throw new Error("The operating system's credential store couldn't be read (fake: locked).");
  };
  const store: SecretStore = {
    available: async () => (state.unsupported ? { ok: false, reason: "Secure remembering isn't available on this computer (fake)." } : { ok: true }),
    get: async (a) => (calls.get++, guard(), map.get(a) ?? null),
    // A locked fake refuses before writing, so nothing of ours is stored (the write-then-fail case is in tests/localConnect.test.ts).
    set: async (a, secret) => {
      calls.set++;
      try {
        guard();
      } catch (err) {
        return { ok: false, reason: (err as Error).message, maybeStored: false };
      }
      map.set(a, secret);
      return { ok: true };
    },
    delete: async (a) => {
      calls.delete++;
      try {
        guard();
      } catch (err) {
        return { ok: false, reason: (err as Error).message };
      }
      map.delete(a);
      return { ok: true };
    },
  };
  return { store, map, calls, state };
}

export interface TestDeps {
  d: LiveDeps;
  /** How many provider clients were constructed, and with which keys. */
  made: { count: number; keys: string[] };
  session: Map<string, string>;
  keychain: ReturnType<typeof fakeKeychain>;
}

export function localDeps(opts: { dir: string; sessionFile?: string; client: MessagesClient; env: Record<string, string | undefined>; now: () => Date; keychain?: ReturnType<typeof fakeKeychain>; session?: Map<string, string> }): TestDeps {
  const made = { count: 0, keys: [] as string[] };
  const session = opts.session ?? new Map<string, string>();
  const keychain = opts.keychain ?? fakeKeychain();
  return {
    made,
    session,
    keychain,
    d: {
      // The state directory travels with the environment, so cookie names and every file path agree.
      env: { ...opts.env, ATLAS_LOCAL_DIR: opts.dir },
      now: opts.now,
      sessionFile: opts.sessionFile ?? join(opts.dir, "live-session.json"),
      pairingFile: join(opts.dir, "pairing.json"),
      connectionFile: join(opts.dir, "connection.json"),
      secrets: { session: memoryStore(session), keychain: keychain.store },
      makeClient: (key: string) => {
        made.count++;
        made.keys.push(key);
        return opts.client;
      },
    },
  };
}

/** The connection record as the user's explicit "use the environment key" leaves it (written directly, for set-up). */
export function selectEnvironmentKey(d: LiveDeps, at: Date) {
  const key = d.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const salt = "0123456789abcdef0123456789abcdef";
  const state: ConnectionState = { version: 2, salt, source: "environment", slot: null, pending: [], revision: randomUUID(), fingerprint: fingerprintOf(salt, key), savedAt: at.toISOString(), verifiedAt: null, rejectedAt: null };
  saveJson(d.connectionFile, state);
  return state.revision;
}

/** The credential revision in use now (null when no key is connected). */
export const currentRevision = (d: LiveDeps) => (readJson(d.connectionFile) as ConnectionState | undefined)?.revision ?? null;
