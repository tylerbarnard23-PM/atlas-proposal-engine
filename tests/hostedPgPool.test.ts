import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";

// #113 review hardening: the production Postgres adapter (pgSql) with node-postgres replaced by a fake pool, so no
// network is used. node-postgres emits "error" on the pool when an idle pooled connection drops (a network reset,
// the database closing it); an EventEmitter with no listener throws on that event, which would crash the server
// instance and every run in flight on it.

const pools: FakePool[] = [];
class FakeClient {
  released: unknown[] = [];
  failRollback = false;
  queries: string[] = [];
  async query(text: string) {
    this.queries.push(text);
    if (text === "rollback" && this.failRollback) throw new Error("Connection terminated unexpectedly");
    if (text === "select fail") throw new Error("synthetic statement failure");
    return { rows: [] };
  }
  release(err?: unknown) {
    this.released.push(err);
  }
}
class FakePool extends EventEmitter {
  client = new FakeClient();
  constructor(readonly options: Record<string, unknown>) {
    super();
    pools.push(this);
  }
  async query() {
    return { rows: [] };
  }
  async connect() {
    return this.client;
  }
  async end() {}
}
vi.mock("pg", () => ({ Pool: FakePool, default: { Pool: FakePool } }));

afterEach(() => {
  pools.length = 0;
  vi.restoreAllMocks();
});

describe("pgSql: the production Postgres adapter", () => {
  it("an idle connection's error is handled and logged without values, never thrown", async () => {
    const logs: string[] = [];
    vi.spyOn(console, "warn").mockImplementation((...a: unknown[]) => void logs.push(a.map(String).join(" ")));
    const { pgSql } = await import("@/server/hosted/db");
    await pgSql("postgres://synthetic:synthetic-password@db.invalid/stratovell");
    const pool = pools[0];
    expect(() => pool.emit("error", new Error("read ECONNRESET postgres://synthetic:synthetic-password@db.invalid"))).not.toThrow();
    expect(logs.join("\n")).toMatch(/idle database connection/);
    expect(logs.join("\n")).not.toContain("synthetic-password");
  });

  it("a client whose rollback fails is destroyed, not returned to the pool; a healthy one is reused", async () => {
    const { pgSql } = await import("@/server/hosted/db");
    const sql = await pgSql("postgres://synthetic@db.invalid/stratovell");
    const client = pools[0].client;
    await expect(sql.transaction(async (tx) => tx.query("select fail"))).rejects.toThrow("synthetic statement failure");
    // The rollback worked: the connection is healthy and goes back to the pool.
    expect(client.released.at(-1)).toBeUndefined();
    client.failRollback = true;
    await expect(sql.transaction(async (tx) => tx.query("select fail"))).rejects.toThrow("synthetic statement failure");
    // The rollback failed: the connection's state is unknown, so it is destroyed (release with a truthy argument).
    expect(client.released.at(-1)).toBeTruthy();
  });
});
