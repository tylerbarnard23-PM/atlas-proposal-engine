import { MIGRATIONS } from "./migrations.ts";

// #113: the hosted path's database access. One narrow interface, two engines:
// Postgres through `pg` (production) and PGlite, Postgres compiled to WASM
// (tests and local checks only; refused on Vercel by hostedReadiness). Every
// statement is parameterized.

export interface SqlTx {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}
export interface Sql extends SqlTx {
  /** Runs `fn` in one transaction: committed if it resolves, rolled back if it throws. */
  transaction<T>(fn: (tx: SqlTx) => Promise<T>): Promise<T>;
  end(): Promise<void>;
}

/** Postgres through node-postgres, for one connection string. Small pool: serverless instances are many and short-lived. */
export async function pgSql(connectionString: string): Promise<Sql> {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString, max: 3, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 8_000 });
  return {
    query: async (text, params) => ({ rows: (await pool.query(text, params as unknown[])).rows }),
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query("begin");
        const out = await fn({ query: async (text, params) => ({ rows: (await client.query(text, params as unknown[])).rows }) });
        await client.query("commit");
        return out;
      } catch (err) {
        await client.query("rollback").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
    end: () => pool.end(),
  };
}

/** Minimal shape of a PGlite instance (the package is a dev dependency; loaded only for tests and local checks). */
export interface PGliteLike {
  query<T>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
  exec(text: string): Promise<unknown>;
  close(): Promise<void>;
}

/**
 * Wraps a PGlite instance. PGlite has one connection, so transactions are
 * serialized here: a statement outside a transaction also waits its turn, and
 * no two transactions interleave.
 */
export function pgliteSql(db: PGliteLike): Sql {
  let chain: Promise<unknown> = Promise.resolve();
  const exclusive = <T>(work: () => Promise<T>): Promise<T> => {
    const next = chain.then(work, work);
    chain = next.catch(() => {});
    return next;
  };
  return {
    query: (text, params) => exclusive(() => db.query(text, params)),
    transaction: (fn) =>
      exclusive(async () => {
        await db.exec("begin");
        try {
          const out = await fn({ query: (text, params) => db.query(text, params) });
          await db.exec("commit");
          return out;
        } catch (err) {
          await db.exec("rollback").catch(() => {});
          throw err;
        }
      }),
    end: () => db.close(),
  };
}

async function openPglite(dataDir: string): Promise<Sql> {
  // A variable specifier, so the server bundle doesn't include the dev-only package.
  const name = "@electric-sql/pglite";
  const { PGlite } = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ name)) as { PGlite: new (dir?: string) => PGliteLike };
  return pgliteSql(new PGlite(dataDir || undefined));
}

// One database handle per process, shared by every route bundle.
const g = globalThis as typeof globalThis & { __stratovellSql?: { url: string; sql: Promise<Sql> } };

/** The database for this server's DATABASE_URL (opened once per process). */
export function sqlFor(databaseUrl: string): Promise<Sql> {
  if (g.__stratovellSql?.url === databaseUrl) return g.__stratovellSql.sql;
  const sql = databaseUrl.startsWith("pglite:") ? openPglite(databaseUrl.slice("pglite:".length)) : pgSql(databaseUrl);
  g.__stratovellSql = { url: databaseUrl, sql };
  sql.catch(() => {
    if (g.__stratovellSql?.sql === sql) g.__stratovellSql = undefined;
  });
  return sql;
}

/** Applies every migration not yet recorded, in order, each in its own transaction. Returns the ids applied. */
export async function migrate(sql: Sql): Promise<string[]> {
  await sql.query("create table if not exists stratovell_schema_migrations (id text primary key, applied_at timestamptz not null default now())");
  const done = new Set((await sql.query<{ id: string }>("select id from stratovell_schema_migrations")).rows.map((r) => r.id));
  const applied: string[] = [];
  for (const m of MIGRATIONS) {
    if (done.has(m.id)) continue;
    await sql.transaction(async (tx) => {
      for (const statement of m.statements) await tx.query(statement);
      await tx.query("insert into stratovell_schema_migrations (id) values ($1)", [m.id]);
    });
    applied.push(m.id);
  }
  return applied;
}

/** Whether every migration this code needs has been applied (checked before any hosted operation; never applies one). */
export async function schemaReady(sql: Sql): Promise<boolean> {
  try {
    const rows = (await sql.query<{ id: string }>("select id from stratovell_schema_migrations")).rows;
    const have = new Set(rows.map((r) => r.id));
    return MIGRATIONS.every((m) => have.has(m.id));
  } catch {
    return false;
  }
}
