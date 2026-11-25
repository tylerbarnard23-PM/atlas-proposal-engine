# Hosted Claude connectivity (#113): retired

> **Retired on 24 November 2026 by [#116](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/116).** Stratovell became a desktop application ([DESKTOP_APP.md](DESKTOP_APP.md)): real Claude analysis runs in the local application with the user's own key, and the website is the download entry with a labelled scripted preview. The hosted sign-in, cloud key storage, Postgres sessions and their routes are removed from the code; `COPILOT_MODE=hosted` (or any unknown value) now runs the scripted demo.
>
> **Retained infrastructure (nothing deleted; still serving production's hosted pilot until the rollback is verified):** the Neon Free database `stratovell-hosted` and its Vercel Marketplace integration, its rows, `STRATOVELL_CREDENTIAL_KEYS`, the GitHub OAuth application and its single active secret, and the Production variables. Deleting or rotating any of them is a separate owner decision. The production rollback (`COPILOT_MODE=demo`, redeploy) is recorded in the handoff.
>
> The pending two-account hosted tests are superseded. The text below is the historical design record.

This is how the shared website runs real Claude analysis for a signed-in user, with that user's own Anthropic API key. It is a separate path from the local launcher ([LOCAL_CLAUDE_SETUP.md](LOCAL_CLAUDE_SETUP.md)), which is unchanged.

**Status:** implementation-ready, not deployed. It was exercised with fake keys, a fake GitHub and a fake Anthropic client, through the real handlers and real Postgres semantics. Production stays the scripted demonstration until the owner completes the setup below. No real key, provider call or deployment setting was used to build it.

## What a visitor sees
- **Public preview (anyone):** "Scripted demonstration · Claude is not connected." The scripted example is a separate, labelled action and is never presented as Claude. There is an obvious "Sign in with GitHub to use Claude" entry.
- **Connected workspace (signed in):** Settings · AI connection, and the connection card on Stratovell AI, together provide:
  - **Connect Claude:** a masked key field, used to save, replace or disconnect the key. Status reads "Saved · not yet verified", then "Verified" once an analysis the user ran is accepted by Anthropic, or "Rejected".
  - **Session:** the session limits (Start, after the user confirms the allowance), the model, usage, Stop and sign out.
  - **Analysis inputs:** shown before every run. They cover the brief counts and unknowns, the scope and holdings, and the advisor-set targets (labelled as the advisor's own, not Claude's). Private discovery notes are never sent.

Nothing runs or is billed on page load, questionnaire or target edits, key save or session start. Only the user's explicit run does.

## Architecture
| Piece | Where | Notes |
|---|---|---|
| Mode and readiness | `src/server/hosted/config.ts` | `COPILOT_MODE=hosted`. Fails closed on a missing or unsafe setting, then shows the scripted demonstration only. Test-only infrastructure (PGlite, the test provider, dev sign-in) is accepted only for a local `*.localhost` origin off Vercel; any public deployment refuses it. Problems are logged by setting name, never by value. |
| Sign-in | `src/server/hosted/auth.ts`, `/api/auth/*` | GitHub OAuth authorization code flow with `state` and PKCE. The GitHub token is used once and never stored. The app session is a random 256-bit token in an HttpOnly, Secure, SameSite=Lax `__Host-` cookie, lasting 12 hours; only its SHA-256 hash is stored. Every write requires the site's own `Origin`. Optional login allow-list. On every request, a sign-in's provider must be allowed by the current configuration: dev identities only while dev sign-in is enabled for a local check, GitHub identities only while GitHub sign-in is configured and the login is on the allow-list. Removing a login, or turning dev sign-in off, ends those sign-ins at once; nothing is deleted. |
| Storage | `src/server/hosted/db.ts`, `migrations.ts` | Postgres through `pg` (pool of 3). Every statement is parameterized. A dropped idle connection is discarded and logged without values (never an unhandled error); a connection whose rollback fails is destroyed. Five tables: users, auth sessions, credentials, live sessions and the session archive. |
| Credentials | `src/server/hosted/credentials.ts`, `crypto.ts` | One key per user. AES-256-GCM with a random IV, bound by AAD to the user and the credential revision. Keys come from `STRATOVELL_CREDENTIAL_KEYS` (the first encrypts; every listed key decrypts, for rotation). An HMAC fingerprint detects a changed key. The key is never returned, logged, put in a URL, written to a backup or sent in a model message. Saving makes no provider request. |
| Sessions and spending | `liveSessionStore.ts` (unchanged state machine) with `src/server/hosted/sessionBackend.ts` | The same version-3 session record and limits as local: 30 minutes, 3 runs, 10 requests, one run at a time, and a USD 5 estimate-based guard. It lives in one row per user, locked `for update` in a transaction for every operation, so admission and reservations are atomic across serverless instances. A replaced session is archived with its counters. |
| Metering | `liveGate.meteredRun` (shared with local) | Each request is reserved at its worst case before it is sent, then settled to its priced usage only when that accounting is complete. Errors, timeouts and cancellations keep the reservation as spend. The key is re-checked before every request. USD figures are estimates, not billing caps. |
| Gate and routes | `src/server/hosted/hosted.ts`, `/api/copilot`, `/api/copilot/hosted/{connection,session}` | Every credential, session and analysis operation re-reads the signed-in user. Claude runs only for that user's key and session. The scripted example and the test provider never answer a Claude request (`run_mode_mismatch`). |
| Analysis | `runAgent` (unchanged) | The same model (`claude-opus-5-5`), fallback policy, prompt and tools. The client brief reaches Claude through `get_portfolio_overview`, and targets through `get_scope_overview`; `target_pct` is labelled as the advisor's own target. |

**Not used by the hosted path:** local pairing, the OS credential store, local session files, loopback checks and `ANTHROPIC_API_KEY`.

**Stop across instances:** Stop marks the session stopped in the database, so the next request on any instance is refused. A request already in flight on another instance completes, and its reservation is counted. Cancellation is immediate only on the instance running the request.

## Owner setup (required before the public site can connect Claude)
None of this has been done, and each step is the owner's decision.
1. **Database:** create a Postgres database (for example Neon through the Vercel Marketplace). Use its pooled `postgres://…?sslmode=require` URL as `DATABASE_URL`.
2. **Schema:** from a trusted machine, run `DATABASE_URL=<url> npm run hosted:migrate` once. The site refuses live analysis (503) until the schema is present.
3. **Encryption key:** generate one and keep it only in the deployment's secret settings, never in the repository:

   ```
   node -e "console.log('k1:'+require('crypto').randomBytes(32).toString('base64'))"
   ```

   It is required to decrypt saved keys; losing it means users re-enter theirs. To rotate, put the new key first and keep the old one after it.
4. **GitHub OAuth app:** set the homepage to the site's origin and the callback to `<origin>/api/auth/github/callback`. Set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`. Consider `STRATOVELL_ALLOWED_GITHUB_LOGINS` to limit who can sign in.
5. **Deployment environment:**
   - Set `COPILOT_MODE=hosted` and `STRATOVELL_PUBLIC_ORIGIN=https://<the production origin>`, plus the variables above.
   - Make sure `ANTHROPIC_BASE_URL`, `STRATOVELL_DEV_SIGNIN` and `COPILOT_LIVE_PROVIDER` are **not** set in production.
   - Redeploy.
6. **Verify on production with a throwaway account:**
   - the public preview;
   - sign-in and sign-out;
   - saving a key (status "Saved · not yet verified", with no provider request);
   - starting and stopping a session;
   - another account isolated.

   Before or alongside this step, run the opt-in real-Postgres test against a disposable database or branch, never the production one (see Limits).

   A real Claude run spends the signed-in user's own money and needs that user's explicit choice. The owner's USD 5 live-take allowance is a separate approval and remains unapproved.

## Local check (no services, no provider)
- Build with `npm run build`.
- Create a PGlite folder and apply the schema. The evidence scripts include a `prepare-db.mjs`.
- Serve the build:

  ```
  COPILOT_MODE=hosted STRATOVELL_PUBLIC_ORIGIN=http://hosted.localhost:3975 DATABASE_URL=pglite:<folder> STRATOVELL_CREDENTIAL_KEYS=k1:<random> STRATOVELL_DEV_SIGNIN=1 COPILOT_LIVE_PROVIDER=fake npx next start -p 3975
  ```

- Unset `ANTHROPIC_BASE_URL` in that shell if it is set, because hosted mode refuses any endpoint override.
- With `COPILOT_LIVE_PROVIDER=fake`, the deterministic test provider answers through the whole hosted gate (no model, no API calls), and its drafts are labelled as test examples.

## Limits
- GitHub is the only production sign-in. There is no email sign-in and no organization or team model.
- One saved key and one session per user. Signing out ends that browser's sign-in only.
- **Cross-connection locking: independent evidence only.** Codex ran the opt-in test below on a disposable PostgreSQL 17.12 at `780c099`, and all five cases passed. It hasn't been run on this machine, which has no database, or on any later head. PGlite has a single connection, so the regular tests show the atomic state transitions but can't show two database connections racing for a row lock; that relies on Postgres `select … for update` semantics.
  - `tests/hostedRealPostgres.test.ts` runs the competing operations through two independent `pg` pools when `STRATOVELL_PG_TEST_URL` names a **disposable** database. The operations are first use, admission, reservations, a held row lock, and Stop from another connection.
  - It works only inside a new schema of its own and drops it afterwards. It uses fake users and the test provider only.
  - Use a direct (non-pooled) URL, because the schema is chosen with a connection startup option. For example: `STRATOVELL_PG_TEST_URL=postgres://…/disposable TZ=UTC npx vitest run tests/hostedRealPostgres.test.ts`.
  - Without that URL, its real-Postgres half is skipped. Its PGlite half checks the scenarios themselves, not locking.
- The R25 study, the 27-trial paid agent evaluation and real-model browser checks remain unperformed.
