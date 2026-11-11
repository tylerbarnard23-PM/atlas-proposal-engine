// Where a user's Anthropic API key is kept on this machine. Two stores, and
// the user chooses which: this server process's memory (gone when the server
// stops), or the operating system's credential store (Windows Credential
// Manager, macOS Keychain, Linux Secret Service) through @napi-rs/keyring.
// There is deliberately no file store: if the OS store can't be used, saving
// there fails with the reason and nothing is written anywhere.

export interface SecretStore {
  /** Whether the store can be used at all here, and if not, why (shown to the user). */
  available(): Promise<{ ok: true } | { ok: false; reason: string }>;
  /** The secret under this account, or null. Rejects if the store can't be read (for example, locked). */
  get(account: string): Promise<string | null>;
  set(account: string, secret: string): Promise<void>;
  delete(account: string): Promise<void>;
}

// --- This server process's memory ---------------------------------------------

const g = globalThis as typeof globalThis & { __atlasSessionSecrets?: Map<string, string> };

/** Session-only storage: shared by every route bundle in this process, and gone when it stops. */
export function memoryStore(map: Map<string, string> = (g.__atlasSessionSecrets ??= new Map())): SecretStore {
  return {
    available: async () => ({ ok: true }),
    get: async (account) => map.get(account) ?? null,
    set: async (account, secret) => void map.set(account, secret),
    delete: async (account) => void map.delete(account),
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
const failure = (action: string) => new Error(`The operating system's credential store couldn't ${action}. It may be locked or unavailable (on Linux it needs a running Secret Service, such as GNOME Keyring).`);

export function keychainStore(service: string = KEYCHAIN_SERVICE, load: () => Promise<KeyringModule | null> = loadKeyring): SecretStore {
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
      try {
        return await e.getPassword();
      } catch {
        throw failure("be read");
      }
    },
    async set(account, secret) {
      const e = await entry(account);
      try {
        await e.setPassword(secret);
      } catch {
        throw failure("save the key");
      }
      // Confirm it can be read back, so "remembered" is never claimed for a write that didn't take.
      let back: string | null = null;
      try {
        back = await e.getPassword();
      } catch {
        throw failure("be read after saving");
      }
      if (back !== secret) throw failure("keep the key");
    },
    async delete(account) {
      const e = await entry(account);
      try {
        await e.deletePassword();
      } catch {
        throw failure("remove the key");
      }
    },
  };
}
