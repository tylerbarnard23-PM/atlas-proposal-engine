import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { closeSync, existsSync, futimesSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, writeFileSync, writeSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

// Small files Atlas keeps on this machine for the local Claude connection
// (git-ignored, under .atlas-local/): the pairing record, the connection
// record and the live session. Every change happens under one lock (in this
// process and across processes) and is written atomically. None of them ever
// holds a key, a token or a cookie: only hashes, counters and timestamps.
// Node built-ins only, so the terminal scripts can load these modules directly.

export const DEFAULT_LOCAL_DIR = ".atlas-local";

type Env = Record<string, string | undefined>;

// Resolved at run time only; the ignore comments stop the bundler tracing the whole project into the server output.
export const localDir = (env: Env) => resolve(/*turbopackIgnore: true*/ env.ATLAS_LOCAL_DIR || DEFAULT_LOCAL_DIR);
export const pairingFilePath = (env: Env) => join(/*turbopackIgnore: true*/ localDir(env), "pairing.json");
export const connectionFilePath = (env: Env) => join(/*turbopackIgnore: true*/ localDir(env), "connection.json");

/**
 * A short, stable marker for this installation's state directory. Cookie names
 * carry it so two Atlas instances on one host keep their own pairing and
 * session: browsers scope cookies by host, not by port, so without it the
 * second instance would overwrite the first one's cookies. It separates
 * instances and nothing more — it gives no confidentiality from other software
 * running on this machine, which can read these files anyway.
 */
export const instanceId = (env: Env) => hash(`atlas-instance:${localDir(env)}`).slice(0, 8);

export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export const sameHash = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
export const randomToken = () => randomBytes(32).toString("base64url");

/** The parsed file, undefined when it is missing, or null when it can't be read as JSON. */
export function readJson(file: string): unknown | undefined | null {
  if (!existsSync(file)) return undefined;
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

/** Writes the file atomically (a temporary file, then a rename), readable by this user only where the OS supports it. */
export function saveJson(file: string, value: unknown) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2), { encoding: "utf8", mode: 0o600 });
  for (let i = 0; ; i++) {
    try {
      renameSync(tmp, file);
      return;
    } catch (err) {
      // Windows can briefly refuse to replace a file another process has open.
      if (i >= 20) {
        rmSync(tmp, { force: true });
        throw err;
      }
      const until = Date.now() + 10;
      while (Date.now() < until) {
        /* brief spin before retrying the rename */
      }
    }
  }
}

// One queue per process (shared by every route bundle through globalThis),
// plus an exclusive lock file for other processes such as the terminal scripts.
const g = globalThis as typeof globalThis & { __atlasLiveSessionQueue?: Promise<unknown> };

/** Runs `fn` alone. `readOnly` callers never create the folder: with no folder there is no record to race over. */
export async function withLock<T>(file: string, fn: () => T, readOnly = false): Promise<T> {
  const prior = g.__atlasLiveSessionQueue ?? Promise.resolve();
  const run = prior.then(() => (readOnly && !existsSync(dirname(file)) ? fn() : crossProcess(file, fn)));
  g.__atlasLiveSessionQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

/**
 * Runs an asynchronous transaction alone: one at a time in this process, and
 * one at a time per installation across processes. Deliberately a
 * separate mechanism from `withLock`: it has its own queue and its own lock
 * file, so the short synchronous record writes a transaction performs inside
 * it cannot wait on the transaction itself. Nesting one of these inside
 * another would deadlock, so each caller takes exactly one.
 *
 * Both waits are bounded. A transaction wedged on a credential store that
 * never answers must refuse the changes queued behind it, not leave them
 * waiting with no reply at all: a refusal can be retried, and Disconnect still
 * has to be able to clean up afterwards.
 */
export async function withAsyncLock<T>(file: string, fn: () => Promise<T>): Promise<T> {
  const deadline = Date.now() + TXN_WAIT_MS;
  const prior = ga.__atlasCredentialQueue ?? Promise.resolve();
  const run = (async () => {
    await queued(prior, deadline);
    const release = await takeLock(`${file}.txn.lock`, deadline, TXN_STALE_MS);
    try {
      return await fn();
    } finally {
      release();
    }
  })();
  ga.__atlasCredentialQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

const ga = globalThis as typeof globalThis & { __atlasCredentialQueue?: Promise<unknown> };
const BUSY = "Another change to the Claude connection is still in progress on this machine.";
/**
 * How long a caller waits for the lock; when a lock nobody is refreshing is
 * treated as abandoned by a crashed process; and how often a holder refreshes
 * its own. Credential writes are not interactive, so a few seconds of waiting
 * is generous: waiting longer would only leave someone who clicked twice
 * staring at a spinner before being told to try again.
 */
export const TXN_WAIT_MS = 5_000;
export const TXN_STALE_MS = 30_000;
export const TXN_BEAT_MS = 1_000;

/** Waits for the transaction ahead of this one, giving up at `deadline`. */
async function queued(prior: Promise<unknown>, deadline: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<"expired">((r) => {
    timer = setTimeout(() => r("expired"), Math.max(0, deadline - Date.now()));
    (timer as { unref?: () => void }).unref?.();
  });
  try {
    const first = await Promise.race([prior.then(() => "done" as const, () => "done" as const), expired]);
    if (first === "expired") throw new Error(BUSY);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Takes an exclusive lock file until `deadline`, and returns how to release it.
 *
 * While it is held, its timestamp is refreshed, so "nobody has touched this for
 * `staleMs`" means the holder is gone rather than merely slow — a native
 * credential call can sit for a long time behind an OS prompt, and reaping a
 * live holder's lock would let a second change run beside it.
 *
 * The file carries a token of this holder's, and release removes it only while
 * it still holds that token: a lock that WAS reaped may already belong to
 * someone else by then, and deleting theirs would let a third caller in beside
 * them.
 */
async function takeLock(lock: string, deadline: number, staleMs: number): Promise<() => void> {
  mkdirSync(dirname(lock), { recursive: true });
  const token = randomBytes(16).toString("hex");
  for (;;) {
    let fd: number;
    try {
      fd = openSync(lock, "wx");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      try {
        if (Date.now() - statSync(lock).mtimeMs > staleMs) rmSync(lock, { force: true });
      } catch {
        /* the lock was released meanwhile */
      }
      if (Date.now() > deadline) throw new Error(BUSY);
      await new Promise((r) => setTimeout(r, 15));
      continue;
    }
    writeSync(fd, token);
    const beat = setInterval(() => {
      try {
        const now = new Date();
        futimesSync(fd, now, now);
      } catch {
        /* released, or the file is already gone */
      }
    }, TXN_BEAT_MS);
    (beat as { unref?: () => void }).unref?.();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      clearInterval(beat);
      try {
        closeSync(fd);
      } catch {
        /* already closed */
      }
      try {
        if (readFileSync(lock, "utf8") === token) rmSync(lock, { force: true });
      } catch {
        /* someone else's lock by now, or none */
      }
    };
  }
}

async function crossProcess<T>(file: string, fn: () => T): Promise<T> {
  mkdirSync(dirname(file), { recursive: true });
  const lock = `${file}.lock`;
  const deadline = Date.now() + 5_000;
  let fd: number | null = null;
  while (fd === null) {
    try {
      fd = openSync(lock, "wx");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      try {
        // A lock left by a crashed process: every holder finishes in milliseconds.
        if (Date.now() - statSync(lock).mtimeMs > 10_000) rmSync(lock, { force: true });
      } catch {
        /* the lock was released meanwhile */
      }
      if (Date.now() > deadline) throw new Error("The local Atlas record is busy.");
      await new Promise((r) => setTimeout(r, 15));
    }
  }
  try {
    return fn();
  } finally {
    closeSync(fd);
    rmSync(lock, { force: true });
  }
}
