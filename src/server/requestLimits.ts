// Resource limits for Atlas's public JSON routes: the final-PDF route and the
// Copilot (#86). Oversized input is refused here, before any schema
// validation, financial evaluation, Chromium or provider call, with one short
// reason. A refused request therefore never generates an issue per element;
// truncating an error after the fact would not have prevented that work.
//
// The limits were chosen from the largest supported workspace that can be
// built from the repository's fixtures (16 November 2026): the sample
// workspace plus every import fixture and the largest logo branding allows —
// 31 accounts, 122 holdings, a 415 KB PDF body (273 KB of it the logo), 8,871
// values and depth 11. Every limit is at least about five times that, and the
// list limits are the envelope the Copilot already enforced. A request inside
// them takes exactly the path it took before.
//
// Node built-ins only, so the scripts and any route can use it.

/** Lists refused above these lengths wherever the key appears; any other list uses `maxListLength`. */
export const LIST_LIMITS: Readonly<Record<string, number>> = {
  accounts: 200,
  holdings: 1_000,
  recommendations: 200,
  fxRates: 500,
  disclosures: 200,
  sourceDocuments: 500,
  alternatives: 50,
  memberIds: 200,
  scopeAccountIds: 200,
  strategies: 200,
  models: 200,
  sections: 100,
};

export interface ShapeLimits {
  maxDepth: number;
  /** Every JSON value counted once: objects, lists, strings, numbers, booleans and nulls. */
  maxValues: number;
  maxListLength: number;
  maxStringLength: number;
  maxKeys: number;
  listLimits: Readonly<Record<string, number>>;
}

/** Shared by both routes; only the body limits differ. */
export const SHAPE_LIMITS: ShapeLimits = {
  maxDepth: 32,
  maxValues: 200_000,
  maxListLength: 1_000,
  // The largest logo is a 273,090-character data URL.
  maxStringLength: 300_000,
  maxKeys: 500,
  listLimits: LIST_LIMITS,
};

/** The final-PDF body: a workspace or an approved version, including a logo of up to 200 KB. */
export const PDF_MAX_BODY_BYTES = 2_000_000;
/** The Copilot body (unchanged): the snapshot carries no logo. */
export const COPILOT_MAX_BODY_BYTES = 1_000_000;

export type BodyRead = { ok: true; text: string } | { ok: false; tooLarge: boolean };

/**
 * Collects a body's bytes into one contiguous store that grows by doubling,
 * never past `maxBytes`. Each fragment is copied in as it arrives and not kept,
 * so memory follows the number of bytes, not the number of fragments: a body
 * delivered one byte at a time costs the same as one delivered whole. Copying
 * at once also means a source that reuses its buffers can't change bytes
 * already received.
 */
export class ByteAccumulator {
  private store = new Uint8Array(0);
  private size = 0;
  // A plain field, not a parameter property: Node's type stripping (used by the scripts) can't load those.
  private readonly maxBytes: number;
  constructor(maxBytes: number) {
    this.maxBytes = maxBytes;
  }

  get length() {
    return this.size;
  }
  get capacity() {
    return this.store.byteLength;
  }

  /** Adds a fragment; false (and nothing stored) if it would pass `maxBytes`. */
  append(fragment: Uint8Array): boolean {
    const needed = this.size + fragment.byteLength;
    if (needed > this.maxBytes) return false;
    if (needed > this.store.byteLength) {
      const grown = new Uint8Array(Math.min(this.maxBytes, Math.max(needed, this.store.byteLength * 2, 1024)));
      grown.set(this.store.subarray(0, this.size));
      this.store = grown;
    }
    this.store.set(fragment, this.size);
    this.size = needed;
    return true;
  }

  /** The bytes as UTF-8, decoded once over the whole body so a character split across fragments is intact. */
  text(): string {
    return Buffer.from(this.store.buffer, this.store.byteOffset, this.size).toString("utf8");
  }
}

/**
 * Reads a request body, refusing it once it passes `maxBytes`. A declared
 * Content-Length over the limit is refused without reading; otherwise the
 * stream is counted as it arrives and abandoned once the limit is passed, so
 * neither a missing nor a misleading Content-Length can make the server
 * buffer more than that. Fragments are copied into a `ByteAccumulator` and
 * released as they arrive. The text is never logged: it may carry a key.
 */
export async function readBodyLimited(req: Request, maxBytes: number): Promise<BodyRead> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await req.body?.cancel().catch(() => {});
    return { ok: false, tooLarge: true };
  }
  const stream = req.body;
  if (!stream) {
    try {
      const text = await req.text();
      return Buffer.byteLength(text, "utf8") > maxBytes ? { ok: false, tooLarge: true } : { ok: true, text };
    } catch {
      return { ok: false, tooLarge: false };
    }
  }
  const reader = stream.getReader();
  const body = new ByteAccumulator(maxBytes);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!body.append(value)) {
        await reader.cancel().catch(() => {});
        return { ok: false, tooLarge: true };
      }
    }
  } catch {
    return { ok: false, tooLarge: false };
  }
  return { ok: true, text: body.text() };
}

const n = (x: number) => x.toLocaleString("en-US");
/** A key as it may appear in a message: bounded, and quoted so it can't pass for prose. */
const named = (key: string | null) => (key === null ? "the request" : JSON.stringify(key.length > 60 ? `${key.slice(0, 60)}…` : key));

/**
 * The first way `value` exceeds `limits`, as one short sentence, or null.
 * One iterative pass with early exit: its cost is bounded by the limits, not
 * by the size of the input, and it never recurses.
 */
export function shapeProblem(value: unknown, limits: ShapeLimits = SHAPE_LIMITS): string | null {
  const stack: [unknown, number, string | null][] = [[value, 0, null]];
  let values = 0;
  while (stack.length) {
    const [v, depth, key] = stack.pop()!;
    if (++values > limits.maxValues) return `The request has more than ${n(limits.maxValues)} values; that is more than Atlas accepts.`;
    if (depth > limits.maxDepth) return `The request is nested more than ${n(limits.maxDepth)} levels deep.`;
    if (typeof v === "string") {
      if (v.length > limits.maxStringLength) return `A text value in ${named(key)} is longer than ${n(limits.maxStringLength)} characters.`;
      continue;
    }
    if (Array.isArray(v)) {
      const max = (key !== null && Object.prototype.hasOwnProperty.call(limits.listLimits, key) ? limits.listLimits[key] : undefined) ?? limits.maxListLength;
      if (v.length > max) return `${named(key)} has ${n(v.length)} items; at most ${n(max)} are accepted.`;
      for (let i = v.length - 1; i >= 0; i--) stack.push([v[i], depth + 1, key]);
      continue;
    }
    if (v !== null && typeof v === "object") {
      const keys = Object.keys(v);
      if (keys.length > limits.maxKeys) return `An object in ${named(key)} has ${n(keys.length)} fields; at most ${n(limits.maxKeys)} are accepted.`;
      for (let i = keys.length - 1; i >= 0; i--) stack.push([(v as Record<string, unknown>)[keys[i]], depth + 1, keys[i]]);
    }
  }
  return null;
}

/** At most this many validation issues are described, and an error never exceeds `MAX_ERROR_CHARS`. */
export const MAX_REPORTED_ISSUES = 5;
export const MAX_ERROR_CHARS = 1_000;

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

/** A validation error people can read: the first few issues, each bounded, never the whole list. */
export function describeIssues(issues: readonly { path: readonly PropertyKey[]; message: string }[], fallbackPath = "request"): string {
  const shown = issues.slice(0, MAX_REPORTED_ISSUES).map((i) => `${clip(i.path.map(String).join("."), 120) || fallbackPath}: ${clip(i.message, 160)}`);
  const more = issues.length > MAX_REPORTED_ISSUES ? `; and ${n(issues.length - MAX_REPORTED_ISSUES)} more` : "";
  // The count of what was left out always survives the cap.
  return clip(shown.join("; "), MAX_ERROR_CHARS - more.length) + more;
}
