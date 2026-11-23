// #113: the hosted Claude path's configuration. Hosted mode (COPILOT_MODE=hosted)
// is a separate path from the local launcher: signed-in users, their own
// Anthropic key encrypted in a database, per-user sessions and spending
// records. It fails closed: when anything below is missing or invalid, live
// analysis is refused and only the labelled scripted example runs.

export type Env = Record<string, string | undefined>;
export type HostedProvider = "anthropic" | "fake";

export interface HostedConfig {
  provider: HostedProvider;
  /** The site's public origin (scheme, host and port): OAuth redirects and same-origin checks use it. */
  origin: string;
  /** Whether cookies are marked Secure (an https origin). */
  secure: boolean;
  databaseUrl: string;
  /** Sign-in: GitHub OAuth, and/or (local development only) dev sign-in. */
  github: { clientId: string; clientSecret: string } | null;
  devSignIn: boolean;
  /** GitHub logins allowed to sign in (lowercase); null allows any GitHub account. */
  allowedLogins: Set<string> | null;
}

const isLocalHostname = (h: string) => h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h.endsWith(".localhost");
/** A deployment on Vercel (any environment). */
export const onVercel = (env: Env) => !!(env.VERCEL || env.VERCEL_ENV);

/**
 * Whether this server may run hosted Claude analysis, and how; or every reason
 * it can't. Never reads a secret's value beyond checking that it is present.
 */
export function hostedReadiness(env: Env): { ok: true; config: HostedConfig } | { ok: false; reasons: string[] } {
  const reasons: string[] = [];
  if (env.COPILOT_MODE !== "hosted") reasons.push("COPILOT_MODE isn't hosted.");

  let origin = "";
  let secure = true;
  let localOrigin = false;
  try {
    const u = new URL(env.STRATOVELL_PUBLIC_ORIGIN ?? "");
    localOrigin = isLocalHostname(u.hostname);
    if (u.protocol === "https:") secure = true;
    else if (u.protocol === "http:" && localOrigin && !onVercel(env)) secure = false;
    else throw new Error("insecure");
    origin = u.origin;
  } catch {
    reasons.push("STRATOVELL_PUBLIC_ORIGIN must be the site's https origin (http only for a local *.localhost check).");
  }

  const db = env.DATABASE_URL ?? "";
  if (!/^postgres(ql)?:\/\//.test(db) && !(db.startsWith("pglite:") && !onVercel(env))) reasons.push("DATABASE_URL must be a Postgres connection string.");

  const keys = credentialKeysProblem(env.STRATOVELL_CREDENTIAL_KEYS);
  if (keys) reasons.push(keys);

  const github = env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET ? { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET } : null;
  // Dev sign-in exists for local checks only: never on Vercel, never on a non-local origin.
  const devSignIn = env.STRATOVELL_DEV_SIGNIN === "1" && !onVercel(env) && localOrigin;
  if (env.STRATOVELL_DEV_SIGNIN === "1" && !devSignIn) reasons.push("STRATOVELL_DEV_SIGNIN is for local *.localhost checks only; remove it from this deployment.");
  if (!github && !devSignIn) reasons.push("Sign-in isn't configured: set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.");

  if (env.ANTHROPIC_BASE_URL) reasons.push("ANTHROPIC_BASE_URL is set; hosted analysis only calls the default Anthropic endpoint.");
  const provider = env.COPILOT_LIVE_PROVIDER ?? "anthropic";
  if (provider !== "anthropic" && provider !== "fake") reasons.push('COPILOT_LIVE_PROVIDER must be "anthropic" or "fake".');

  const allowed = (env.STRATOVELL_ALLOWED_GITHUB_LOGINS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (reasons.length) return { ok: false, reasons };
  return {
    ok: true,
    config: { provider: provider as HostedProvider, origin, secure, databaseUrl: db, github, devSignIn, allowedLogins: allowed.length ? new Set(allowed) : null },
  };
}

/** Why STRATOVELL_CREDENTIAL_KEYS can't be used, or null. Format: "id:base64key[,id:base64key…]"; the first encrypts, every one decrypts. */
export function credentialKeysProblem(raw: string | undefined): string | null {
  if (!raw) return "STRATOVELL_CREDENTIAL_KEYS isn't set (the encryption key for saved API keys).";
  const entries = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const ids = new Set<string>();
  for (const e of entries) {
    const i = e.indexOf(":");
    const id = i > 0 ? e.slice(0, i) : "";
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(id) || ids.has(id)) return "STRATOVELL_CREDENTIAL_KEYS: each entry is a unique id, a colon and a base64 key.";
    ids.add(id);
    if (Buffer.from(e.slice(i + 1), "base64").length !== 32) return "STRATOVELL_CREDENTIAL_KEYS: each key must be 32 random bytes, base64-encoded.";
  }
  return entries.length ? null : "STRATOVELL_CREDENTIAL_KEYS is empty.";
}
