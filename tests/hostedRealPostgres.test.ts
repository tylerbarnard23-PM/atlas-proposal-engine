import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { FIRST_REQUEST_USD } from "@/copilot/liveGate";
import * as sessions from "@/copilot/liveSessionStore";
import { migrate, pgSql, pgliteSql, type Sql } from "@/server/hosted/db";
import { userSessionBackend } from "@/server/hosted/sessionBackend";

// #113 review hardening: competing hosted-session operations through TWO INDEPENDENT database connections.
//
// - Real Postgres (opt-in): set STRATOVELL_PG_TEST_URL to a DISPOSABLE database's direct (non-pooled) URL. The test
//   opens two separate `pg` pools (independent connections), works only inside a new schema of its own
//   (stratovell_test_<random>) and drops that schema afterwards. Fake users and the fake provider only: no key, no
//   provider, no network beyond that database. This is what shows Postgres row locks (`select … for update`) serializing
//   admission and reservations across connections.
// - PGlite (always): the same scenarios on one in-process connection. That checks the scenarios themselves, NOT
//   cross-connection locking (PGlite has a single connection, so nothing ever contends).

const PG_URL = process.env.STRATOVELL_PG_TEST_URL;
const ALLOWANCE = { minutes: 30, runs: 3, requests: 10, usd: 5 };
const T0 = new Date("2026-11-24T12:00:00Z");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Pair {
  a: Sql;
  b: Sql;
  end: () => Promise<void>;
}

async function pglitePair(): Promise<Pair> {
  const db = new PGlite();
  const sql = pgliteSql(db as never);
  await migrate(sql);
  // One connection: both "sides" share it (two wrappers over one PGlite would interleave transactions).
  return { a: sql, b: sql, end: () => db.close() };
}

async function postgresPair(url: string): Promise<Pair> {
  const schema = `stratovell_test_${randomBytes(6).toString("hex")}`;
  const admin = await pgSql(url);
  await admin.query(`create schema ${schema}`);
  const scoped = new URL(url);
  scoped.searchParams.set("options", `-c search_path=${schema}`);
  const a = await pgSql(scoped.toString());
  const b = await pgSql(scoped.toString());
  try {
    await migrate(a);
    const where = (await a.query<{ s: string }>("select current_schema() as s")).rows[0]?.s;
    if (where !== schema) throw new Error("The test schema isn't the connection's search path; refusing to touch anything else.");
  } catch (err) {
    await Promise.allSettled([a.end(), b.end()]);
    await admin.query(`drop schema if exists ${schema} cascade`).catch(() => {});
    await admin.end();
    throw err;
  }
  return {
    a,
    b,
    end: async () => {
      await Promise.allSettled([a.end(), b.end()]);
      await admin.query(`drop schema if exists ${schema} cascade`);
      await admin.end();
    },
  };
}

async function newUser(sql: Sql): Promise<string> {
  const id = randomUUID();
  await sql.query("insert into stratovell_users (id, provider, subject, login) values ($1, 'dev', $2, $3)", [id, id, `synthetic-${id.slice(0, 8)}`]);
  return id;
}

function scenarios(name: string, make: () => Promise<Pair>, skip: boolean) {
  describe.skipIf(skip)(`competing session operations: ${name}`, () => {
    let pair: Pair;
    beforeAll(async () => {
      pair = await make();
    }, 30_000);
    afterAll(async () => {
      await pair?.end();
    }, 30_000);

    async function armed() {
      const user = await newUser(pair.a);
      const a = userSessionBackend(pair.a, user);
      const b = userSessionBackend(pair.b, user);
      const r = await sessions.armSession(a, T0, "fake", { allowance: ALLOWANCE, credentialRevision: null, claim: true });
      if (!r.ok || !r.cookie) throw new Error("arm failed");
      return { user, a, b, cookie: r.cookie };
    }

    it("a brand-new user's first operations from both connections at once create one record and arm one session", async () => {
      const user = await newUser(pair.a);
      const sides = [userSessionBackend(pair.a, user), userSessionBackend(pair.b, user)];
      const results = await Promise.all(Array.from({ length: 6 }, (_, i) => sessions.armSession(sides[i % 2], T0, "fake", { allowance: ALLOWANCE, credentialRevision: null, claim: true })));
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(results.filter((r) => !r.ok).every((r) => !r.ok && r.code === "already_armed")).toBe(true);
      expect((await pair.b.query("select user_id from stratovell_live_sessions where user_id = $1", [user])).rows).toHaveLength(1);
      expect((await pair.b.query("select id from stratovell_live_session_archive where user_id = $1", [user])).rows).toHaveLength(0);
    }, 30_000);

    it("concurrent admissions from both connections: exactly one run is admitted", async () => {
      const { a, b, cookie } = await armed();
      const results = await Promise.all(Array.from({ length: 10 }, (_, i) => sessions.admitRun(i % 2 ? b : a, T0, cookie, FIRST_REQUEST_USD, "fake", null)));
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(results.filter((r) => !r.ok).every((r) => !r.ok && r.code === "run_in_progress")).toBe(true);
      const view = await sessions.readView(b, T0, cookie, FIRST_REQUEST_USD, "fake", null);
      expect(view.used.runs).toBe(1);
    }, 30_000);

    it("concurrent reservations from both connections never exceed the request limit, and every one is counted once", async () => {
      const { a, b, cookie } = await armed();
      const admitted = await sessions.admitRun(a, T0, cookie, FIRST_REQUEST_USD, "fake", null);
      if (!admitted.ok) throw new Error("admit failed");
      const results = await Promise.all(Array.from({ length: 24 }, (_, i) => sessions.reserveRequest(i % 2 ? b : a, T0, admitted.runId, "fake", () => 0.01, null)));
      const ok = results.filter((r) => r.ok);
      expect(ok).toHaveLength(ALLOWANCE.requests);
      expect(new Set(ok.map((r) => r.ok && r.reservationId)).size).toBe(ALLOWANCE.requests);
      const view = await sessions.readView(a, T0, cookie, FIRST_REQUEST_USD, "fake", null);
      expect(view.used.requests).toBe(ALLOWANCE.requests);
    }, 30_000);

    it("a row lock held on one connection makes the other connection's admission wait for it", async () => {
      const { user, b, cookie } = await armed();
      let released = 0;
      const holder = pair.a.transaction(async (tx) => {
        await tx.query("select state from stratovell_live_sessions where user_id = $1 for update", [user]);
        await sleep(400);
        released = Date.now();
      });
      await sleep(50);
      const admitted = await sessions.admitRun(b, T0, cookie, FIRST_REQUEST_USD, "fake", null);
      const doneAt = Date.now();
      await holder;
      expect(admitted.ok).toBe(true);
      expect(released).toBeGreaterThan(0);
      expect(doneAt).toBeGreaterThanOrEqual(released);
    }, 30_000);

    it("Stop on one connection refuses the next reservation on the other; the run's reservations stay counted", async () => {
      const { a, b, cookie } = await armed();
      const admitted = await sessions.admitRun(a, T0, cookie, FIRST_REQUEST_USD, "fake", null);
      if (!admitted.ok) throw new Error("admit failed");
      const first = await sessions.reserveRequest(a, T0, admitted.runId, "fake", () => 0.5, null);
      expect(first.ok).toBe(true);
      expect((await sessions.stopSession(b, T0, "stopped from another instance")).ok).toBe(true);
      const next = await sessions.reserveRequest(a, T0, admitted.runId, "fake", () => 0.5, null);
      expect(next.ok).toBe(false);
      await sessions.finishRun(a, T0, admitted.runId, "stopped");
      const view = await sessions.readView(b, T0, cookie, FIRST_REQUEST_USD, "fake", null);
      expect(view.status).toBe("stopped");
      expect(view.used.requests).toBe(1);
      expect(view.used.committedUsd).toBeGreaterThanOrEqual(0.5);
    }, 30_000);
  });
}

scenarios("PGlite, one connection (checks the scenarios, not cross-connection locking)", pglitePair, false);
scenarios("real Postgres, two independent connections (opt-in: STRATOVELL_PG_TEST_URL)", () => postgresPair(PG_URL!), !PG_URL);
