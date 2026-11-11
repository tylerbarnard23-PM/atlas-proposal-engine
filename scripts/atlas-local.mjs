// Atlas on this machine, with Proposal Copilot ready to connect to Claude.
//
//   npm run local                 start Atlas on 127.0.0.1 and open it, paired with your browser
//   npm run local -- --dev        the same with the development server (no build needed)
//   npm run local -- --port 3100  prefer another port (the next free one is used if it is taken)
//   npm run local -- --fake       rehearse with the fake provider: no key, no API calls
//   npm run local -- --no-open    print the pairing link instead of opening a browser
//   npm run local:pair -- --origin http://127.0.0.1:3000   pair a browser with a server that is already running
//   npm run local:doctor          check this machine's set-up
//
// Nothing here contacts Anthropic, and no key is read or printed. The server
// is bound to 127.0.0.1 only. A busy port is never freed by stopping another
// program: the next free port is used instead. The pairing link is one-time:
// it lets your browser manage the Claude connection in Atlas, and starts no
// session.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { connectionFilePath, localDir, pairingFilePath } from "../src/copilot/localFiles.ts";
import { PAIR_TOKEN_MINUTES, issuePairingToken } from "../src/copilot/localPairing.ts";
import { readConnection } from "../src/copilot/localConnection.ts";
import { LIVE_SESSION_LIMITS, readView, sessionFilePath } from "../src/copilot/liveSessionStore.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HOST = "127.0.0.1";
const [first, ...restArgs] = process.argv.slice(2);
const command = first && !first.startsWith("--") ? first : "start";
const args = command === "start" && first ? [first, ...restArgs] : restArgs;
const has = (name) => args.includes(name);
const value = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);
const isLocalHostname = (h) => LOOPBACK.has(h) || h.endsWith(".localhost");

/** Whether a port is free on 127.0.0.1 (checked by binding it briefly; nothing is stopped). */
export const portFree = (port) =>
  new Promise((done) => {
    const probe = createServer();
    probe.once("error", () => done(false));
    probe.once("listening", () => probe.close(() => done(true)));
    probe.listen(port, HOST);
  });

/** The first free port from `preferred`, trying the next ones; null if none of them is free. */
export async function choosePort(preferred, tries = 20, free = portFree) {
  for (let p = preferred; p < preferred + tries && p < 65_536; p++) if (await free(p)) return p;
  return null;
}

/** The server's environment: live mode, no base-URL override, and nothing else added. The key, if set, is passed through untouched and unread. */
export function serverEnv(env, { fake }) {
  const out = { ...env, COPILOT_MODE: "live" };
  delete out.ANTHROPIC_BASE_URL;
  if (fake) out.COPILOT_LIVE_PROVIDER = "fake";
  else delete out.COPILOT_LIVE_PROVIDER;
  return out;
}

export const pairingLink = (origin, token) => `${origin}/api/copilot/local/pair?token=${token}`;

function openBrowser(url) {
  const [cmd, cmdArgs] = process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  try {
    const child = spawn(cmd, cmdArgs, { stdio: "ignore", detached: true, windowsVerbatimArguments: false });
    child.on("error", () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}

/** Waits until the local server answers (a request to this machine only). */
async function waitForServer(origin, child, timeoutMs = 90_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (child.exitCode !== null) return false;
    try {
      const res = await fetch(`${origin}/api/copilot`, { signal: AbortSignal.timeout(2_000) });
      if (res.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

// --- Doctor ---------------------------------------------------------------------

/** Local checks only. Returns lines to print; `problems` counts the ones that block starting. */
export async function doctor(env = process.env, cwd = root) {
  const lines = [];
  let problems = 0;
  const ok = (text) => lines.push(`  ok       ${text}`);
  const note = (text) => lines.push(`  note     ${text}`);
  const bad = (text) => (problems++, lines.push(`  PROBLEM  ${text}`));

  const major = Number(process.versions.node.split(".")[0]);
  if (major >= 24) ok(`Node ${process.versions.node}.`);
  else bad(`Node ${process.versions.node}: Atlas needs Node 24 or newer. Install it from nodejs.org, then run npm install.`);

  if (existsSync(join(cwd, "node_modules", "next", "package.json"))) ok("Dependencies are installed.");
  else bad("Dependencies aren't installed. Run: npm install");

  if (existsSync(join(cwd, ".next", "BUILD_ID"))) ok("A production build exists.");
  else note("No production build yet. Run: npm run build (or start with: npm run local -- --dev).");

  const dir = localDir(env);
  try {
    mkdirSync(dir, { recursive: true });
    const probe = join(dir, `.doctor-${process.pid}`);
    writeFileSync(probe, "");
    rmSync(probe, { force: true });
    ok(`Local state folder is writable (${dir}). It never holds a key.`);
  } catch {
    bad(`Can't write to the local state folder (${dir}).`);
  }

  if (env.VERCEL || env.VERCEL_ENV) bad("This looks like a hosted deployment. Live mode is local only and stays off there.");
  if (env.ANTHROPIC_BASE_URL) note("ANTHROPIC_BASE_URL is set in this terminal. The launcher removes it for the Atlas server, which only calls the default Anthropic endpoint.");
  note(env.ANTHROPIC_API_KEY ? "ANTHROPIC_API_KEY is set in this terminal (not read or shown). Atlas uses it only if you select the environment key under Connect Claude." : "ANTHROPIC_API_KEY isn't set in this terminal. That's fine: paste a key under Connect Claude in Atlas.");

  try {
    await import("@napi-rs/keyring");
    ok("The OS credential-store component is installed, so Atlas can offer to remember a key securely. (Whether the store is unlocked is checked when you save a key.)");
  } catch {
    note("The OS credential-store component isn't installed for this platform. A key can still be kept for one server session.");
  }

  const connection = await readConnection(connectionFilePath(env));
  note(connection.source === "none" ? "No API key is connected yet." : `A key is connected (kept in: ${connection.source}; ${connection.verifiedAt ? "verified by a request" : "not yet verified"}).`);
  const session = await readView(sessionFilePath(env), new Date(), null);
  note(`Live session: ${session.status}. Limits per session: ${LIVE_SESSION_LIMITS.minutes} minutes, ${LIVE_SESSION_LIMITS.runs} runs, ${LIVE_SESSION_LIMITS.requests} requests, a USD ${LIVE_SESSION_LIMITS.usd} estimate-based guard.`);

  const port = Number(value("--port", "3000"));
  if (await portFree(port)) ok(`Port ${port} is free on ${HOST}.`);
  else note(`Port ${port} is in use on ${HOST}. The launcher will use the next free port; it never stops another program.`);

  lines.push("", "These checks are local. Nothing contacted Anthropic, and no key was read.");
  return { lines, problems };
}

// --- Commands ---------------------------------------------------------------------

async function start() {
  const dev = has("--dev");
  const fake = has("--fake");
  if (Number(process.versions.node.split(".")[0]) < 24) {
    console.error(`Atlas needs Node 24 or newer (this is ${process.versions.node}).`);
    process.exit(1);
  }
  const nextBin = join(root, "node_modules", "next", "dist", "bin", "next");
  if (!existsSync(nextBin)) {
    console.error("Dependencies aren't installed. Run: npm install");
    process.exit(1);
  }
  if (!dev && !existsSync(join(root, ".next", "BUILD_ID"))) {
    console.error("Atlas hasn't been built yet. Run: npm run build\nThen: npm run local\n(Or use the development server: npm run local -- --dev)");
    process.exit(1);
  }
  const preferred = Number(value("--port", "3000"));
  if (!Number.isInteger(preferred) || preferred < 1024 || preferred > 65_535) {
    console.error("--port must be a whole number from 1024 to 65535.");
    process.exit(1);
  }
  const port = await choosePort(preferred);
  if (port === null) {
    console.error(`No free port from ${preferred} to ${preferred + 19} on ${HOST}. Choose another with --port. Nothing was stopped.`);
    process.exit(1);
  }
  if (port !== preferred) console.log(`Port ${preferred} is in use, so Atlas will use ${port}. The other program was left running.`);
  if (process.env.ANTHROPIC_BASE_URL) console.log("Note: ANTHROPIC_BASE_URL is set in this terminal. It isn't passed to Atlas, which only calls the default Anthropic endpoint.");

  const origin = `http://${HOST}:${port}`;
  const child = spawn(process.execPath, [nextBin, dev ? "dev" : "start", "-H", HOST, "-p", String(port)], { cwd: root, env: serverEnv(process.env, { fake }), stdio: "inherit" });
  const stop = () => child.kill();
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  child.on("exit", (code) => process.exit(code ?? 0));

  if (!(await waitForServer(origin, child))) {
    console.error("Atlas didn't start in time. See the messages above.");
    child.kill();
    process.exit(1);
  }
  const { token } = await issuePairingToken(pairingFilePath(process.env), new Date());
  const link = pairingLink(origin, token);
  console.log("");
  console.log(`Atlas is running on this machine only: ${origin}${fake ? " (fake provider: no key, no API calls)" : ""}`);
  if (has("--no-open") || !openBrowser(link)) {
    console.log(`Open this one-time link in your browser within ${PAIR_TOKEN_MINUTES} minutes to pair it with Atlas (keep it private until it is used):`);
    console.log(link);
  } else {
    console.log("Your browser is opening Atlas, paired with this machine. Pairing lets it manage the Claude connection; it starts no session and spends nothing.");
    console.log("If no window opened, run: npm run local:pair -- --origin " + origin);
  }
  console.log("Stop Atlas with Ctrl+C.");
}

async function pair() {
  let origin;
  try {
    origin = new URL(value("--origin", "http://127.0.0.1:3000"));
  } catch {
    console.error("--origin must be a URL such as http://127.0.0.1:3000");
    process.exit(1);
  }
  if (!isLocalHostname(origin.hostname)) {
    console.error("--origin must be a local address (localhost, 127.0.0.1, [::1] or *.localhost).");
    process.exit(1);
  }
  const { token, expiresAt } = await issuePairingToken(pairingFilePath(process.env), new Date());
  console.log(`Open this one-time link in the browser on this machine before ${expiresAt.toISOString()} (keep it private until it is used):`);
  console.log(pairingLink(origin.origin, token));
  console.log("It pairs that browser with Atlas so it can manage the Claude connection. It starts no session and spends nothing.");
}

// Run only when invoked directly (tests import the helpers above).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (command === "start") await start();
  else if (command === "pair") await pair();
  else if (command === "doctor") {
    const r = await doctor();
    console.log("Atlas local set-up check");
    for (const line of r.lines) console.log(line);
    process.exit(r.problems ? 1 : 0);
  } else {
    console.error("Usage: npm run local [-- --dev --fake --port N --no-open] | npm run local:pair -- --origin URL | npm run local:doctor");
    process.exit(1);
  }
}
