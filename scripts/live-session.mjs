// The owner's controls for the local live-testing session. Arming happens
// here, in a terminal on the machine running Atlas, and nowhere else; the
// browser can only claim an armed session (with the one-time link printed
// below), use its allowance and stop it.
//
//   npm run live-session -- arm --provider anthropic|fake [--origin http://localhost:3000]
//   npm run live-session -- status
//   npm run live-session -- stop
//
// --provider is required and binds the session: a session armed for the fake
// provider (no API calls) can never be used once the server runs Anthropic,
// nor the reverse. Records armed before this binding must be armed afresh.
//
// The session file is .atlas-local/live-session.json (or
// ATLAS_LIVE_SESSION_FILE). It holds counters, timestamps and hashes only.
// Arming makes no provider call and spends nothing; it starts a 30-minute
// allowance of 3 runs, 10 HTTP requests and a USD 5 estimate-based guard
// (not a billing ceiling). Each arming is a new allowance: arm only with the
// owner's approval for that session.

import { LIVE_SESSION_LIMITS, SESSION_PROVIDERS, armSession, providerName, readView, sessionFilePath, stopSession } from "../src/copilot/liveSessionStore.ts";

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
  const r = await armSession(file, now, provider);
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
