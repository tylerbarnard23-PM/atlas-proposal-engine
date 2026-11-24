import { randomUUID, createHash } from "node:crypto";
import { cookieOf } from "@/copilot/liveGate";
import type { HostedConfig } from "./config";
import type { Sql } from "./db";
import { randomToken, sameHex, sha256 } from "./crypto";

// #113: who is signed in to the hosted path. GitHub OAuth (authorization code
// with `state` and PKCE): the GitHub token is used once, to read the account's
// stable id and login, and is never stored. The app's own sign-in is a random
// 256-bit token in an HttpOnly cookie; the database keeps only its SHA-256
// hash and expiry. Every write must come from this site (Origin check), and
// every credential, session and analysis operation looks the user up again.

export const SIGN_IN_HOURS = 12;
const STATE_COOKIE = "stratovell_oauth";
const GITHUB_AUTHORIZE = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN = "https://github.com/login/oauth/access_token";
const GITHUB_USER = "https://api.github.com/user";

export interface HostedUser {
  id: string;
  login: string;
  provider: "github" | "dev";
}

export interface AuthDeps {
  now: () => Date;
  sql: () => Promise<Sql>;
  /** Network access for the OAuth exchange (tests pass a fake). */
  fetch: typeof fetch;
}

export const authCookieName = (cfg: Pick<HostedConfig, "secure">) => (cfg.secure ? "__Host-stratovell_auth" : "stratovell_auth");
const secureAttr = (cfg: Pick<HostedConfig, "secure">) => (cfg.secure ? "; Secure" : "");
const authCookie = (cfg: HostedConfig, value: string, maxAge: number) => `${authCookieName(cfg)}=${value}; Path=/; HttpOnly; SameSite=Lax${secureAttr(cfg)}; Max-Age=${maxAge}`;
const stateCookie = (cfg: HostedConfig, value: string, maxAge: number) => `${STATE_COOKIE}=${value}; Path=/api/auth; HttpOnly; SameSite=Lax${secureAttr(cfg)}; Max-Age=${maxAge}`;
const NO_STORE = { "cache-control": "no-store", "referrer-policy": "no-referrer" };

/** The signed-in user for this request, or null. Expired or unknown sign-ins are null. */
export async function currentUser(req: Request, cfg: HostedConfig, deps: AuthDeps): Promise<HostedUser | null> {
  const token = cookieOf(req, authCookieName(cfg));
  if (!token || token.length > 200) return null;
  const sql = await deps.sql();
  const rows = (
    await sql.query<HostedUser>(
      "select u.id, u.login, u.provider from stratovell_auth_sessions s join stratovell_users u on u.id = s.user_id where s.token_hash = $1 and s.expires_at > $2",
      [sha256(token), deps.now().toISOString()]
    )
  ).rows;
  const row = rows[0];
  if (!row || !signInPermitted(row, cfg)) return null;
  return { id: String(row.id), login: row.login, provider: row.provider };
}

/**
 * Whether the current, validated configuration permits this identity's sign-in provider, checked on every request:
 * a sign-in issued under an earlier configuration authenticates only while its provider is still allowed. Dev
 * identities need dev sign-in enabled now (a local *.localhost check off Vercel); GitHub identities need GitHub
 * sign-in configured and, when there is an allow-list, a login on it (removing a login ends its sign-ins at once).
 * Nothing is deleted: a refused identity's keys, sessions and counters stay as they were.
 */
function signInPermitted(row: Pick<HostedUser, "login" | "provider">, cfg: HostedConfig): boolean {
  if (row.provider === "dev") return cfg.devSignIn;
  if (row.provider === "github") return cfg.github != null && (cfg.allowedLogins == null || cfg.allowedLogins.has(row.login.toLowerCase()));
  return false;
}

/**
 * Why a write (a POST that changes anything) isn't from this site, or null.
 * Cookies are SameSite=Lax already; this also refuses any cross-origin or
 * cross-site write, and (for JSON endpoints) anything that isn't JSON.
 */
export function writeProblem(req: Request, cfg: HostedConfig, json = true): string | null {
  const origin = req.headers.get("origin");
  if (!origin || origin !== cfg.origin) return "This action must come from the Stratovell site itself.";
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return "Cross-site requests are refused.";
  if (json && !(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return "Send JSON.";
  return null;
}

const text = (status: number, body: string, headers: Record<string, string> = {}) =>
  new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8", ...NO_STORE, ...headers } });

async function createSignIn(sql: Sql, now: Date, user: { provider: HostedUser["provider"]; subject: string; login: string }): Promise<{ user: HostedUser; token: string }> {
  const row = (
    await sql.query<HostedUser>(
      "insert into stratovell_users (id, provider, subject, login) values ($1, $2, $3, $4) on conflict (provider, subject) do update set login = excluded.login returning id, login, provider",
      [randomUUID(), user.provider, user.subject, user.login]
    )
  ).rows[0];
  const token = randomToken();
  const expires = new Date(now.getTime() + SIGN_IN_HOURS * 3_600_000);
  await sql.query("delete from stratovell_auth_sessions where user_id = $1 and expires_at <= $2", [row.id, now.toISOString()]);
  await sql.query("insert into stratovell_auth_sessions (token_hash, user_id, created_at, expires_at) values ($1, $2, $3, $4)", [sha256(token), row.id, now.toISOString(), expires.toISOString()]);
  return { user: { id: String(row.id), login: row.login, provider: row.provider }, token };
}

const base64url = (b: Buffer) => b.toString("base64url");
const redirectUri = (cfg: HostedConfig) => `${cfg.origin}/api/auth/github/callback`;

/** GET /api/auth/github/start: to GitHub, with a fresh state and PKCE verifier held in a short-lived cookie. */
export function startGitHubSignIn(cfg: HostedConfig): Response {
  if (!cfg.github) return text(404, "GitHub sign-in isn't configured on this server.");
  const state = randomToken();
  const verifier = randomToken();
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  const u = new URL(GITHUB_AUTHORIZE);
  u.searchParams.set("client_id", cfg.github.clientId);
  u.searchParams.set("redirect_uri", redirectUri(cfg));
  u.searchParams.set("state", state);
  u.searchParams.set("code_challenge", challenge);
  u.searchParams.set("code_challenge_method", "S256");
  // No scope: the public profile (id and login) is all Stratovell reads.
  u.searchParams.set("scope", "");
  return new Response(null, { status: 303, headers: { location: u.toString(), "set-cookie": stateCookie(cfg, `${state}.${verifier}`, 600), ...NO_STORE } });
}

/** GET /api/auth/github/callback?code&state: checks the state, exchanges the code once, signs the user in. */
export async function finishGitHubSignIn(req: Request, cfg: HostedConfig, deps: AuthDeps): Promise<Response> {
  if (!cfg.github) return text(404, "GitHub sign-in isn't configured on this server.");
  const url = new URL(req.url);
  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";
  const held = cookieOf(req, STATE_COOKIE) ?? "";
  const [heldState, verifier] = held.split(".");
  const clear = stateCookie(cfg, "", 0);
  if (!code || !state || !heldState || !verifier || !sameHex(sha256(state), sha256(heldState)))
    return text(403, "Sign-in wasn't completed: the sign-in link expired or didn't start here. Start again from Stratovell.", { "set-cookie": clear });
  let login: string;
  let subject: string;
  try {
    const tokenRes = await deps.fetch(GITHUB_TOKEN, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: cfg.github.clientId, client_secret: cfg.github.clientSecret, code, redirect_uri: redirectUri(cfg), code_verifier: verifier }).toString(),
    });
    const tokenBody = (await tokenRes.json()) as { access_token?: unknown };
    if (!tokenRes.ok || typeof tokenBody.access_token !== "string") throw new Error("no token");
    const userRes = await deps.fetch(GITHUB_USER, { headers: { accept: "application/vnd.github+json", authorization: `Bearer ${tokenBody.access_token}`, "user-agent": "Stratovell" } });
    const gh = (await userRes.json()) as { id?: unknown; login?: unknown };
    if (!userRes.ok || typeof gh.id !== "number" || typeof gh.login !== "string") throw new Error("no user");
    subject = String(gh.id);
    login = gh.login;
  } catch {
    // Neither GitHub's response nor any token is echoed or logged.
    return text(502, "Sign-in wasn't completed: GitHub didn't confirm the account. Try again.", { "set-cookie": clear });
  }
  if (cfg.allowedLogins && !cfg.allowedLogins.has(login.toLowerCase())) return text(403, "This GitHub account isn't on this Stratovell site's sign-in list.", { "set-cookie": clear });
  const sql = await deps.sql();
  const { token } = await createSignIn(sql, deps.now(), { provider: "github", subject, login });
  const headers = new Headers({ location: "/copilot", ...NO_STORE });
  headers.append("set-cookie", clear);
  headers.append("set-cookie", authCookie(cfg, token, SIGN_IN_HOURS * 3600));
  return new Response(null, { status: 303, headers });
}

/** POST /api/auth/dev-signin {"login"}: local *.localhost checks only (hostedReadiness refuses it anywhere else). */
export async function devSignIn(cfg: HostedConfig, deps: AuthDeps, body: Record<string, unknown>): Promise<Response> {
  if (!cfg.devSignIn) return Response.json({ error: "Dev sign-in is off.", code: "dev_signin_off" }, { status: 404, headers: NO_STORE });
  const login = typeof body.login === "string" ? body.login.trim().toLowerCase() : "";
  if (!/^[a-z0-9][a-z0-9-]{0,38}$/.test(login)) return Response.json({ error: "Use a short test name (letters, digits, hyphens).", code: "bad_login" }, { status: 400, headers: NO_STORE });
  const sql = await deps.sql();
  const { user, token } = await createSignIn(sql, deps.now(), { provider: "dev", subject: login, login });
  return Response.json({ user: { login: user.login, provider: user.provider } }, { headers: { "set-cookie": authCookie(cfg, token, SIGN_IN_HOURS * 3600), ...NO_STORE } });
}

/** POST /api/auth/signout: ends this sign-in (other devices' sign-ins stay). */
export async function signOut(req: Request, cfg: HostedConfig, deps: AuthDeps): Promise<Response> {
  const token = cookieOf(req, authCookieName(cfg));
  if (token && token.length <= 200) await (await deps.sql()).query("delete from stratovell_auth_sessions where token_hash = $1", [sha256(token)]);
  return Response.json({ signedIn: false }, { headers: { "set-cookie": authCookie(cfg, "", 0), ...NO_STORE } });
}
