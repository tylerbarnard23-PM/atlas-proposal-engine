// Where a user's Anthropic API key is kept on this machine. Two stores, and
// the user chooses which: this server process's memory (gone when the server
// stops), or the operating system's credential store (Windows Credential
// Manager, macOS Keychain, Linux Secret Service) through @napi-rs/keyring.
// There is deliberately no file store: if the OS store can't be used, saving
// there fails with the reason and nothing is written anywhere.
//
// Writing and removing report an outcome rather than throwing, because the
// caller has to know something an exception can't say: whether a write that
// failed may nonetheless have left an entry behind. The OS store is confirmed
// by reading the value back, and that read can fail after the write has
// landed, so "it threw" and "nothing was stored" are different facts.
//
// Every native call is bounded. A locked store can sit on a prompt nobody
// answers, and waiting on it would hold the credential transaction — and every
// change queued behind it, Disconnect included — open until the server is
// restarted. A call that is given up on is reported like one that threw: it may
// still land, so the entry may exist.

export type StoreWrite = { ok: true } | { ok: false; reason: string; maybeStored: boolean };
export type StoreDelete = { ok: true } | { ok: false; reason: string };

export interface SecretStore {
  /** Whether the store can be used at all here, and if not, why (shown to the user). */
  available(): Promise<{ ok: true } | { ok: false; reason: string }>;
  /** The secret under this account, or null. Rejects if the store can't be read (for example, locked). */
  get(account: string): Promise<string | null>;
  /**
   * Writes and confirms it by reading back. On failure, `maybeStored` says
   * whether an entry may exist under this account; it is false only when the
   * write was never attempted, because a native call that throws may still
   * have stored the value.
   */
  set(account: string, secret: string): Promise<StoreWrite>;
  /** Removes the account's entry. A failure means removal could not be confirmed. */
  delete(account: string): Promise<StoreDelete>;
}

// --- This server process's memory ---------------------------------------------

const g = globalThis as typeof globalThis & { __atlasSessionSecrets?: Map<string, string> };

/** Session-only storage: shared by every route bundle in this process, and gone when it stops. A write here can't half-happen. */
export function memoryStore(map: Map<string, string> = (g.__atlasSessionSecrets ??= new Map())): SecretStore {
  return {
    available: async () => ({ ok: true }),
    get: async (account) => map.get(account) ?? null,
    set: async (account, secret) => (map.set(account, secret), { ok: true }),
    delete: async (account) => (map.delete(account), { ok: true }),
  };
}

// --- The OS credential store -----------------------------------------------------

export const KEYCHAIN_SERVICE = "Atlas Proposal Engine";

type KeyringEntry = { setPassword(p: string): Promise<void>; getPassword(): Promise<string | null>; deletePassword(): Promise<boolean> };
type KeyringModule = { AsyncEntry: new (service: string, account: string) => KeyringEntry };

let keyring: Promise<KeyringModule | null> | undefined;
/** The native module, or null where it isn't installed for this platform. Loaded on first use, never on a hosted deployment. */
const loadKeyring = () =>
  (keyring ??= import("@napi-rs/keyring").then(
    (m) => m as unknown as KeyringModule,
    () => null
  ));

const UNSUPPORTED = "Secure remembering isn't available on this computer: the OS credential-store component isn't installed for this platform.";
/** A reason safe to show: never the secret, never a raw native message. */
const cannot = (action: string) => `The operating system's credential store couldn't ${action}. It may be locked or unavailable (on Linux it needs a running Secret Service, such as GNOME Keyring).`;

/** How long a native credential call is waited on: generous, because the store may be asking the user to unlock it. */
export const NATIVE_CALL_MS = 60_000;

type Settled<T> = { state: "ok"; value: T } | { state: "failed" } | { state: "timeout" };

/** Awaits a native call, giving up after `ms`. It may still finish afterwards, which is why giving up still reports `maybeStored`. */
async function settle<T>(work: Promise<T>, ms: number): Promise<Settled<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<Settled<T>>((r) => {
    timer = setTimeout(() => r({ state: "timeout" }), ms);
    (timer as { unref?: () => void }).unref?.();
  });
  try {
    return await Promise.race([
      work.then(
        (value): Settled<T> => ({ state: "ok", value }),
        (): Settled<T> => ({ state: "failed" })
      ),
      expired,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** A reason safe to show when the store never answered. */
const silent = (action: string) => `The operating system's credential store didn't answer, so Atlas stopped waiting for it to ${action}. It may be locked, or waiting on a prompt that was never answered.`;

export function keychainStore(service: string = KEYCHAIN_SERVICE, load: () => Promise<KeyringModule | null> = loadKeyring, callMs: number = NATIVE_CALL_MS): SecretStore {
  const entry = async (account: string) => {
    const m = await load();
    if (!m) throw new Error(UNSUPPORTED);
    return new m.AsyncEntry(service, account);
  };
  return {
    async available() {
      return (await load()) ? { ok: true } : { ok: false, reason: UNSUPPORTED };
    },
    async get(account) {
      const e = await entry(account);
      const read = await settle(e.getPassword(), callMs);
      if (read.state === "ok") return read.value;
      throw new Error(read.state === "timeout" ? silent("be read") : cannot("be read"));
    },
    async set(account, secret) {
      let e: KeyringEntry;
      try {
        e = await entry(account);
      } catch (err) {
        return { ok: false, reason: err instanceof Error ? err.message : UNSUPPORTED, maybeStored: false };
      }
      // A native write that throws — or never answers — may still have stored something;
      // nothing here can tell. Saying "nothing was saved" would be a guess, so the caller
      // is told an entry may exist.
      const written = await settle(e.setPassword(secret), callMs);
      if (written.state !== "ok") return { ok: false, reason: written.state === "timeout" ? silent("save the key") : cannot("save the key"), maybeStored: true };
      // The write returned, so an entry exists whatever happens next.
      const back = await settle(e.getPassword(), callMs);
      if (back.state !== "ok") return { ok: false, reason: back.state === "timeout" ? silent("confirm the key it had just saved") : cannot("confirm the key it had just saved"), maybeStored: true };
      if (back.value !== secret) return { ok: false, reason: cannot("keep the key"), maybeStored: true };
      return { ok: true };
    },
    async delete(account) {
      let e: KeyringEntry;
      try {
        e = await entry(account);
      } catch (err) {
        return { ok: false, reason: err instanceof Error ? err.message : UNSUPPORTED };
      }
      const removed = await settle(e.deletePassword(), callMs);
      if (removed.state === "ok") return { ok: true };
      return { ok: false, reason: removed.state === "timeout" ? silent("remove the key") : cannot("remove the key") };
    },
  };
}
