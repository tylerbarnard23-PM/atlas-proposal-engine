// #113: the hosted path's database schema, applied in order by `migrate`
// (npm run hosted:migrate, or the tests). A migration is never edited once
// released: add a new one. No table holds a prompt, an answer, a workspace or
// an API key in clear text.

export interface Migration {
  id: string;
  statements: string[];
}

export const MIGRATIONS: Migration[] = [
  {
    id: "0001_hosted_claude",
    statements: [
      // A signed-in person: the sign-in provider ("github", or "dev" for local checks) and its stable subject id.
      `create table stratovell_users (
        id uuid primary key,
        provider text not null check (provider in ('github', 'dev')),
        subject text not null,
        login text not null,
        created_at timestamptz not null default now(),
        unique (provider, subject)
      )`,
      // A sign-in: only the SHA-256 hash of the cookie's random token is stored.
      `create table stratovell_auth_sessions (
        token_hash text primary key,
        user_id uuid not null references stratovell_users (id) on delete cascade,
        created_at timestamptz not null,
        expires_at timestamptz not null
      )`,
      "create index stratovell_auth_sessions_user on stratovell_auth_sessions (user_id)",
      // One API key per user: AES-256-GCM ciphertext bound to the user and the revision, plus a keyed fingerprint
      // (to tell whether a key changed). The key itself is never stored in clear and never returned.
      `create table stratovell_credentials (
        user_id uuid primary key references stratovell_users (id) on delete cascade,
        revision text not null,
        salt text not null,
        fingerprint text not null,
        key_id text not null,
        iv text not null,
        tag text not null,
        ciphertext text not null,
        saved_at timestamptz not null,
        verified_at timestamptz,
        rejected_at timestamptz
      )`,
      // The user's live session: the same version-3 record the local file holds (liveSessionStore.ts), one row per user,
      // locked for every operation. A null state means none was ever started.
      `create table stratovell_live_sessions (
        user_id uuid primary key references stratovell_users (id) on delete cascade,
        state jsonb,
        updated_at timestamptz not null default now()
      )`,
      // Sessions replaced by a new one, kept with their counters and run history.
      `create table stratovell_live_session_archive (
        id bigserial primary key,
        user_id uuid not null references stratovell_users (id) on delete cascade,
        session_id text,
        state jsonb not null,
        archived_at timestamptz not null default now()
      )`,
      "create index stratovell_live_session_archive_user on stratovell_live_session_archive (user_id)",
    ],
  },
];
