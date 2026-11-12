// Terminal controls for the local live session: an alternative to starting
// one in Atlas (Connect Claude on the Copilot page). A session armed here is
// claimed by a browser with the one-time link printed below. It is bound to
// the provider named and to the key connection in use when it is armed, so
// connect the key in Atlas first.
//
//   npm run live-session -- arm --provider anthropic|fake [--origin http://localhost:3000]
//   npm run live-session -- status
//   npm run live-session -- stop
//
// --provider is required and binds the session: a session armed for the fake
// provider (no API calls) can never be used once the server runs Anthropic,
// nor the reverse. Replacing or removing the key ends the session too.
// Records armed before these bindings must be armed afresh.
//
// The session file is .atlas-local/live-session.json (or
// ATLAS_LIVE_SESSION_FILE). It holds counters, timestamps and hashes only.
// Arming makes no provider call and spends nothing; it starts a 30-minute
// allowance of 3 runs, 10 HTTP requests and a USD 5 estimate-based guard
// (not a billing ceiling). Each arming is a new allowance: arm only with the
// owner's approval for that session.

import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SUPPORTED_NODE = 24;
const major = Number(process.versions.node.split(".")[0]);
// Checked before the TypeScript modules below are loaded: those imports are what an older Node fails on first.
if (!(Number.isFinite(major) && major >= SUPPORTED_NODE)) {
  console.error(`Atlas needs Node ${SUPPORTED_NODE} or newer (this is ${process.versions.node}). Install it from nodejs.org, then run: npm install`);
  process.exit(1);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Loaded together: three sequential awaits would noticeably slow a command that is already paying Node's start-up.
const [files, sessions, connection] = await Promise.all([import("../src/copilot/localFiles.ts"), import("../src/copilot/liveSessionStore.ts"), import("../src/copilot/localConnection.ts")]);
const { connectionFilePath } = files;
const { LIVE_SESSION_LIMITS, SESSION_PROVIDERS, armSession, providerName, readView, sessionFilePath, stopSession } = sessions;
const { readConnection } = connection;
// One state directory for the scripts and the server, even when this script is run by absolute path from another
// folder, and even when the override is relative: a relative value would otherwise follow the caller's working
// directory while the server resolves it from the repository root. Set before any of the paths above are called.
const anchor = (p) => (isAbsolute(p) ? p : resolve(root, p));
process.env.ATLAS_LOCAL_DIR = anchor(process.env.ATLAS_LOCAL_DIR || files.DEFAULT_LOCAL_DIR);
if (process.env.ATLAS_LIVE_SESSION_FILE) process.env.ATLAS_LIVE_SESSION_FILE = anchor(process.env.ATLAS_LIVE_SESSION_FILE);

const [command, ...rest] = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = rest.indexOf(name);
  return i >= 0 && rest[i + 1] ? rest[i + 1] : fallback;
};
const file = sessionFilePath(process.env);
const now = new Date();

function printView(v) {
  console.log(`Session: ${v.status}. ${v.message}`);
  if (!v.id) return;
  console.log(`Provider: ${v.provider} (${providerName(v.provider)})`);
  console.log(`Expires: ${v.expiresAt}`);
  console.log(`Runs: ${v.used.runs} of ${v.limits.runs}. HTTP requests: ${v.used.requests} of ${v.limits.requests} (retries included). Model attempts: ${v.used.attempts}.`);
  console.log(`Estimated USD: ${v.used.spentUsd.toFixed(4)} priced from usage + ${v.used.retainedUsd.toFixed(4)} kept for requests with unknown usage = ${v.used.committedUsd.toFixed(4)} of the ${v.limits.usd} guard (an estimate, not billing).`);
  for (const h of v.history) console.log(`  run ${h.startedAt}: ${h.status}, ${h.requests} requests, ${h.attempts} attempts, USD ${h.usd.toFixed(4)} (+${h.retainedUsd.toFixed(4)} kept)`);
}

if (command === "arm") {
  const provider = flag("--provider", null);
  if (!SESSION_PROVIDERS.includes(provider)) {
    console.error(`Name the provider this session is for: --provider anthropic (paid) or --provider fake (no API calls). It must match the server's configuration.`);
    process.exit(1);
  }
  let origin;
  try {
    origin = new URL(flag("--origin", "http://localhost:3000"));
  } catch {
    console.error("--origin must be a URL such as http://localhost:3000");
    process.exit(1);
  }
  if (!(origin.hostname === "localhost" || origin.hostname === "127.0.0.1" || origin.hostname === "[::1]" || origin.hostname.endsWith(".localhost"))) {
    console.error("--origin must be a local address (localhost, 127.0.0.1, [::1] or *.localhost).");
    process.exit(1);
  }
  // The key connection in use now (never the key): the session is bound to it.
  const connection = await readConnection(connectionFilePath(process.env));
  if (provider === "anthropic" && connection.source === "none") {
    console.error("No API key is connected yet. Open Atlas (npm run local), connect a key under Connect Claude, then arm the session, or start it there.");
    process.exit(1);
  }
  const r = await armSession(file, now, provider, { credentialRevision: connection.revision });
  if (!r.ok) {
    console.error(r.error);
    process.exit(1);
  }
  const expires = new Date(now.getTime() + LIVE_SESSION_LIMITS.minutes * 60_000);
  console.log(`Armed a live test session for ${providerName(provider)} until ${expires.toISOString()} (${LIVE_SESSION_LIMITS.minutes} minutes).`);
  console.log(`It works only while the server runs ${provider === "fake" ? "COPILOT_LIVE_PROVIDER=fake" : "Anthropic (COPILOT_LIVE_PROVIDER unset)"}; any other configuration refuses it.`);
  console.log(`Allowance: ${LIVE_SESSION_LIMITS.runs} agent runs, ${LIVE_SESSION_LIMITS.requests} HTTP requests (retries included), one run at a time, a USD ${LIVE_SESSION_LIMITS.usd} estimate-based guard (not a billing ceiling).`);
  console.log("");
  console.log("Claim it in the browser on this machine (one use; keep this link private until it is used):");
  console.log(`${origin.origin}/api/copilot/live-session/claim?token=${r.token}`);
  console.log("");
  console.log("Stop it at any time with the Stop control in Copilot, or: npm run live-session -- stop");
} else if (command === "status") {
  printView(await readView(file, now, null));
} else if (command === "stop") {
  const r = await stopSession(file, now, "stopped from the terminal");
  if (!r.ok) {
    console.error(r.error);
    process.exit(1);
  }
  printView(await readView(file, new Date(), null));
} else {
  console.error("Usage: npm run live-session -- arm --provider anthropic|fake [--origin http://localhost:3000] | status | stop");
  process.exit(1);
}
