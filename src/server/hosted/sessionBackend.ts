import { loadedFrom, type SessionBackend, type SessionState } from "@/copilot/liveSessionStore";
import type { Sql } from "./db";

/**
 * #113: one user's live session record in Postgres, behind the same backend
 * interface as the local file. Every operation runs in a transaction that
 * first makes sure the user's row exists and then locks it (`for update`), so
 * admission, reservations, settlement, Stop and a new session's start are
 * serialized across every server instance: two concurrent requests can't both
 * pass a limit. A session replaced by a new one is archived with its counters
 * and history, never discarded.
 */
export function userSessionBackend(sql: Sql, userId: string): SessionBackend {
  return {
    transact<T>(fn: (loaded: ReturnType<typeof loadedFrom>, save: (state: SessionState) => void) => T, readOnly = false): Promise<T> {
      return sql.transaction(async (tx) => {
        if (!readOnly) await tx.query("insert into stratovell_live_sessions (user_id, state) values ($1, null) on conflict (user_id) do nothing", [userId]);
        const row = (await tx.query<{ state: unknown }>(`select state from stratovell_live_sessions where user_id = $1${readOnly ? "" : " for update"}`, [userId])).rows[0];
        const raw = row?.state == null ? undefined : typeof row.state === "string" ? safeJson(row.state) : row.state;
        const loaded = loadedFrom(raw);
        let next: SessionState | null = null;
        const out = fn(loaded, (s) => {
          next = structuredClone(s);
        });
        if (next && !readOnly) {
          const n = next as SessionState;
          // A new session replaces the record: the previous one (in whatever state) is kept in the archive.
          if (raw !== undefined && !(loaded.kind === "ok" && loaded.state.id === n.id)) {
            await tx.query("insert into stratovell_live_session_archive (user_id, session_id, state) values ($1, $2, $3::jsonb)", [userId, loaded.kind === "ok" ? loaded.state.id : null, JSON.stringify(raw)]);
          }
          await tx.query("update stratovell_live_sessions set state = $2::jsonb, updated_at = now() where user_id = $1", [userId, JSON.stringify(n)]);
        }
        return out;
      });
    },
  };
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
