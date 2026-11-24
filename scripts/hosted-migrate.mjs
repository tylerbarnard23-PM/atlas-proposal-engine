// #113: applies the hosted Claude schema (src/server/hosted/migrations.ts) to the database in DATABASE_URL.
// Run once per database, and again after a release that adds a migration:
//   DATABASE_URL=postgres://… npm run hosted:migrate
// It prints which migrations it applied, never the connection string or any data.
import { migrate, pgSql } from "../src/server/hosted/db.ts";

const url = process.env.DATABASE_URL ?? "";
if (!/^postgres(ql)?:\/\//.test(url)) {
  console.error("Set DATABASE_URL to the Postgres connection string (postgres://…).");
  process.exit(1);
}
const sql = await pgSql(url);
try {
  const applied = await migrate(sql);
  console.log(applied.length ? `Applied: ${applied.join(", ")}` : "The schema is already up to date.");
} catch (err) {
  console.error(`Migration failed: ${err instanceof Error ? err.message.split("\n")[0] : "unknown error"}`);
  process.exitCode = 1;
} finally {
  await sql.end();
}
