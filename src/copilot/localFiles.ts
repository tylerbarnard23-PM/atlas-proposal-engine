import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
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
