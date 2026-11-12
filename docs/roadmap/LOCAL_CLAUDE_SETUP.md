# Local Claude setup

How a user runs Atlas on their own machine and connects their own Claude access, with Proposal Copilot staying inside Atlas. Updated 11 November 2026 on PR #82.

## Status

- **Route 1 is chosen by the owner and implemented:** the existing Claude API integration with a user-owned Console API key, guided key entry in Atlas, optional remembering in the operating system's credential store, and sessions started inside Atlas.
- **Reviewed at `03128df` (11 November 2026); the confirmed findings fixed (12 November), and two defects found while reviewing those fixes closed the same day.** Finding 3 is a design decision with a recommendation below. Awaiting Codex review.
- **No real-Claude verification has occurred.** Everything was built and checked with fake providers, made-up keys and synthetic data. No request has been sent to Anthropic, and no real key has been validated.
- **No paid testing is authorized.** The earlier paid-pilot approval was withdrawn.
- **No Anthropic permission or legal clearance has been sought or obtained.** Route 1 uses a customer-owned API key, which Anthropic's documentation allows; the other routes are not part of this work.
- **API cost estimates are unmeasured.**
- **Subscriber-credit eligibility is distinct from subscription login.** A Max, Ultra or Team plan's API credits fund an API key. They do not make it possible to sign in to Atlas with a Claude plan.

## Set up Atlas with Claude

**Requirements:** Node 24 or newer, and this repository with `npm install` run once. Check a machine with `npm run local:doctor`; it only looks at this machine and never contacts Anthropic or reads a key.

1. **Build once** (again after updating Atlas):

   ```bash
   npm run build
   ```

2. **Start Atlas:**

   ```bash
   npm run local
   ```

   - Atlas listens on `127.0.0.1` only. If port 3000 is busy it uses the next free port and says so; it never stops another program. `--port N` chooses another starting port.
   - Your browser opens through a one-time pairing link. Pairing lets that browser manage the Claude connection. It starts no session and spends nothing.
   - `--dev` uses the development server (no build needed). `--no-open` prints the link instead. `--fake` rehearses everything with the fake provider: no key, no API calls.
   - If Atlas is already running, `npm run local:pair -- --origin http://127.0.0.1:3000` prints a new pairing link.

3. **In the Claude Console** (platform.claude.com):
   - Create a workspace just for Atlas (**Workspaces**). The Default Workspace can't have a spend limit.
   - Set that workspace's monthly **spend limit**. This is what actually caps charges; Atlas's own guard is an estimate.
   - Create an **API key in that workspace**. Never use an Admin key (`sk-ant-admin…`) or a Claude subscription token from `claude setup-token`; Atlas refuses both. Anthropic documents no format for ordinary API keys, so Atlas can't confirm a key by looking at it: your first question settles whether it works.

4. **In Atlas, open Proposal Copilot → Connect Claude:**
   - Paste the key into the masked field.
   - Choose where Atlas keeps it: **for this server session only** (memory; pasted again after a restart) or **remembered securely** in the operating system's credential store.
   - The status reads "Key saved; connection not yet verified". Atlas has not contacted Anthropic.

5. **Start a limited session.** Review the allowance, lower it if you want, and confirm. Then ask a question. The first question is the first request to Anthropic; a successful answer changes the status to "Connected".

**Billing:** API usage is billed to your Console organization, separately from a Claude subscription. Max, Ultra and Team plans include monthly API credits, claimed by linking the plan to a Console organization in claude.ai billing settings (after 7 days on the plan). Free, Pro and Enterprise plans include none. When credits run out, requests stop unless the organization has bought credits or enabled auto-reload.

**Use sample or synthetic data.** Real client data needs the privacy design in [PII_PROTECTION.md](PII_PROTECTION.md) first.

### Session limits

| Limit | Ceiling (can be lowered, never raised) |
|---|---|
| Duration | 30 minutes |
| Copilot runs | 3 |
| Requests to the provider | 10, retries and failed requests included |
| USD guard | 5, an estimate from list prices, **not a billing limit** |
| Runs at a time | 1 |

- Each request is reserved at its worst case first (about USD 2.71), so the guard stops requests well before USD 5 is spent.
- A request whose charge is unknown (an error, a timeout, a cancellation, or missing usage) keeps its reservation.
- Counters are never reset by a refresh, a restart, re-pairing or a key change. A new allowance always needs an explicit start.
- **Stop live session** ends a session at once.

### Managing the key

- **Replace key** and **Disconnect** stop the current session and cancel a run in progress. The stopped session keeps its counters.
- **A replacement is staged.** A new key is written to a second entry and only becomes the live one once it reads back, so a failed save leaves the previous key, its revision and its session exactly as they were. If an unconfirmed entry can't be cleaned up, Atlas says so and removes it the next time the credential store is available.
- **Session-only keys** are lost when Atlas stops. The page then says the key is needed again.
- **Environment key (advanced):** if `ANTHROPIC_API_KEY` is set where Atlas starts, Connect Claude offers "Use the server's environment key". It is managed outside Atlas, used only after you choose it, and Atlas can't remove it.
- **Terminal alternative:** `npm run live-session -- arm --provider anthropic` still arms a session for a browser to claim. It is bound to the key connected at that moment.

### Troubleshooting

| What you see | What to do |
|---|---|
| "This browser isn't paired" | Start with `npm run local`, or run `npm run local:pair` and open its link. A link works once and for 10 minutes. |
| "Local live mode isn't available" | The server isn't in live mode, looks hosted, or has `ANTHROPIC_BASE_URL` set. Use `npm run local`, which sets this up. |
| "Secure remembering isn't available" or the credential store "may be locked" | Nothing was saved. Unlock the store, or keep the key for this server session only. On Linux a Secret Service (such as GNOME Keyring) must be running. |
| "Key needed again" | A session-only key was lost at restart. Paste it again. |
| "Key changed" | The stored or environment key was changed outside Atlas. Replace or reselect it. |
| "Key rejected" | Anthropic refused the key. Check it in the Console and replace it. |
| "The session can't be used" after a key change | Stop it and start a new one. |
| "Another `next dev` server is already running" | Next.js allows one development server per checkout. Run the second instance without `--dev` (it uses the production build), or start it from a separate copy of the repository. |
| "The new key was not connected… your previous connection is unchanged" | The credential store refused or couldn't confirm the write. The earlier key still works. Try again, or keep the key for this server session only. |
| "An earlier entry couldn't be removed… one may still be there" | Atlas couldn't confirm removing a superseded entry. It retries on the next save or Disconnect; you can also remove the "Atlas Proposal Engine" entries yourself. |

## What reaches Anthropic

- Only when you ask a question: the question, the system prompt, the tool definitions, and the results the Atlas engines return to Claude's tool calls.
- The client's and household's names, the advisor's name and email, and import file names are replaced where Atlas recognizes them. **This is minimization, not anonymization:** holdings, values, account details and anything else typed into a question still reach the model.
- Nothing is sent when the page opens, a key is saved or a session starts.

## Security design

Recorded before coding on [PR #82](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/pull/82#issuecomment-6799730283), with the contract-impact note.

- **Pairing** (`src/copilot/localPairing.ts`): a one-time token, issued only from a terminal on this machine, is exchanged for an HttpOnly, SameSite=Strict cookie. The token is deleted on use. Only hashes are stored. Pairing is permission to manage the connection; it is separate from a session's allowance.
- **Every credential change and session start** (`src/copilot/localConnect.ts`) needs all of: a server in local live mode (never hosted); a loopback Host, a same-origin Origin and no cross-site fetch; the pairing cookie; and a CSRF token in a header, which only the paired, same-origin status read hands out. A local address or an Origin header alone authorizes nothing.
- **The key** is posted once to the local server and kept where the user chose (`src/copilot/credentialStore.ts`): server memory, or the OS credential store through `@napi-rs/keyring` (Windows Credential Manager, macOS Keychain, Linux Secret Service). There is no file store and no plaintext fallback. The key is never returned, logged, or put in the browser, the Atlas store, a backup or a URL.
- **The connection record** (`src/copilot/localConnection.ts`, version 2) holds where the key is kept, which of two account **slots** holds it, slots whose entry may still need removing, a revision, timestamps and a salted fingerprint — never the key. Each save, selection or disconnect is a new revision. A save writes to the free slot and commits only once the entry reads back, so the live entry is never overwritten; a record from before slots existed is migrated in place and its key keeps working.
- **Sessions** (`src/copilot/liveSessionStore.ts`, record version 3) are bound to their provider and to the credential revision they started under, checked at admission and before every request. Reservations, unknown-usage handling, restart persistence and Stop are the paths reviewed at `538a8fc`.
- **State paths.** The terminal scripts resolve `ATLAS_LOCAL_DIR` and `ATLAS_LIVE_SESSION_FILE` against the repository they belong to, including relative overrides, and pass the resolved values to the server, so both always use the same files.
- **Hosted deployments** refuse every local endpoint. The public demo stays scripted and keyless.

**Known limits**
- Cookies belong to a host, not a port. Other software served from the same loopback host in the same browser receives them, though it can't read Atlas's responses or pass the Origin check from a page.
- Other software running as the same user can read the same files and credential store. That is outside this design.
- A development server prints request addresses in its terminal, including a pairing link. The link is dead once used.
- Only Windows Credential Manager was exercised: a real save, a staged replacement (the new entry in the free slot, the old one removed) and a Disconnect, with dummy keys since removed. The failure paths — a write that lands but can't be confirmed, a refused write, and a removal that can't be confirmed — are covered by tests against a fake native backend, not against a real store on any platform.
- The fake provider's session can be rehearsed with or without a key; a saved key is never used or verified there.

## Preserved

- The one shared evaluator and the engines in `src/engines/`.
- Context binding: the input revision, the `stale_context` refusal, and the re-check on acceptance.
- Simulations before any sized draft, failing closed.
- Figure checks against engine evidence, and duplicate prevention.
- Explicit acceptance: an answer is a preview; **Add to working draft** creates unapproved draft actions only. It never approves an action, changes current holdings or puts anything in the final PDF.
- Runtime model, effort, prompt, tools and fallback; store/backup v10.

## Route assessment (10 November 2026)

Three routes were assessed against Anthropic's official documentation before the owner chose Route 1.

**Verified facts** (read 10–11 November 2026; URLs under "Sources")
- **Subscriber API credits:** Max USD 100 a month, Ultra USD 200, Team a pooled amount capped at USD 500; none on Free, Pro or Enterprise. They are claimed by linking a Console organization and spent through an ordinary Console API key. When they run out, requests stop unless the organization has purchased credits or auto-reload; the plan is never charged.
- **Plan sign-in in products:** unless previously approved, third-party developers may not offer claude.ai login or plan rate limits in their products, including agents built on the Agent SDK. Product developers should use API keys and may not collect, store or intermediate Claude.ai credentials. A user supplying their own API key, billed to the key owner and not resold, is explicitly allowed.
- **Workspaces:** an API key can be scoped to one workspace; a workspace can have a monthly spend limit; the Default Workspace can't. Admin API keys start with `sk-ant-admin`.
- **Agent SDK and Claude Desktop:** both are technically capable of the alternatives below.

**Route 2: Claude Code / Agent SDK with the user's plan sign-in.** Not pursued. The constraint is authorization, not technology: Atlas is a product other people install, and the documentation reserves plan sign-in for Anthropic's own applications unless approved. No question has been put to Anthropic.

**Route 3: Claude Desktop with an Atlas MCP bundle.** Not pursued. The conversation would move to Claude Desktop, the browser-held workspace would need a bridge to a local server, and Atlas could not check the figures in an answer it never sees.

## Assumptions (not verified)

- A typical question costs about USD 0.30–0.45 on Opus 5.5: the repository's estimate, never measured.
- Subscriber credits can be spent by a self-hosted application such as Atlas. The documentation names the Claude API and the user's own apps without restricting application type.
- The Console's menu names are as documented on 11 November 2026; they can change.

## Review findings (11 November 2026, reviewed head `03128df`) and their fixes (12 November 2026)

A read-only review of the onboarding package against the security design above. **Nothing is fixed yet.** No way was found to spend or expose a key without pairing. CI "Typecheck, test, build" ([run 43051645777](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/actions/runs/43051645777)) and Vercel were reported passing on `03128df`; the CI test counts were not extracted.

**Outcome:** findings 1, 2 and 4–8 are fixed, each with a regression that failed first. Finding 3 is an owner design decision; the recommendation is below. No session limit was raised.

| # | Finding | Evidence | How confirmed | Fix |
|---|---|---|---|---|
| 1 | **Key validation accepts subscription-token-shaped strings.** `keyShapeProblem` refuses only `sk-ant-admin…` and accepts anything else starting `sk-ant-`, so a Claude subscription OAuth token could be pasted and stored. | `src/copilot/localConnection.ts:98-99`. `sk-ant-oat01-…` and `sk-ant-ort01-…` were both accepted. | Run. The prefix evidence is community-sourced (GitHub issues and articles), not an officially verified format. The guide and UI also state the standard-key prefix as fact, which the official pages read did not state. | **Fixed.** `keyShapeProblem` now refuses the Admin prefix Anthropic documents and the `sk-ant-oat…`/`sk-ant-ort…` subscription-token shapes, and no longer requires `sk-ant-`: the documentation establishes no format for ordinary API keys, so a familiar prefix was never proof and an unfamiliar one must not block a valid key. The guide and the panel no longer state a standard-key prefix as fact. |
| 2 | **Credentials are resolved before session admission.** The key is read from its store before the session is checked, so a local same-origin request with no session, or a used-up one, opens the OS credential store. The file's header says the key is read only for an admitted run. | `src/copilot/liveGate.ts:238` (resolve) before `:242` (admit); header at `:18`. | Code read. Nothing leaks. | **Fixed.** A missing, unreadable, stopped, expired or exhausted session, another browser's, and a run already in progress are all refused before any credential store is opened. Atomic admission still follows, with the credential revision, so binding and accounting are unchanged. An abandoned run is finalized by a session-only step (`reapAbandonedRun`) that touches no credential. |
| 3 | **Pairing lasts seven days with no revocation, and there is no cumulative allowance.** A paired browser can stop and start sessions back to back; each new record replaces the old counters. The only total cap is the Console workspace spend limit. | `src/copilot/localPairing.ts:18`; no unpair function, command or control; `armSession` in `liveSessionStore.ts`. | Code read. **An owner design decision, not a demonstrated authorization bypass:** every start is an explicit, authorized request. | **Not changed: an owner decision.** See the recommendation below. |
| 4 | **Fixed cookie names can collide between instances on the same host.** Cookies aren't isolated by port, so pairing or starting a session in one Atlas instance on 127.0.0.1 overwrites another's cookies. | `src/copilot/localConnect.ts:21`, `src/copilot/liveGate.ts:114`. | Reasoned from the code. **Not reproduced.** | **Fixed.** Cookie names carry a marker derived from the instance's state directory. Reproduced and verified with two instances on one host sharing one cookie jar. It separates instances only, and gives no confidentiality from other software on this machine. |
| 5 | **The terminal scripts and the server resolve the state folder differently.** The launcher starts the server in the repository root but resolves its own state folder from the current directory. Run by path from elsewhere, the pairing link would be refused. `npm run` always sets the right directory. | `scripts/atlas-local.mjs:182, 193, 219`. | **Reproduced:** the doctor run from another folder created `.atlas-local` there. | **Fixed.** The terminal scripts anchor the state directory to the repository they belong to, and the session file now follows that directory. Verified by running the doctor by absolute path from another folder. |
| 6 | **The Node version check runs after the TypeScript imports.** On an older Node the script fails on its `.ts` imports before the friendly message can print. | `scripts/atlas-local.mjs:22-25`. | Code read; not run on an older Node. | **Fixed.** The supported-Node check runs before any TypeScript module is loaded, in both scripts, which now load their modules dynamically (in parallel, so start-up isn't slower). |
| 7 | **Request bodies are buffered before authorization and size enforcement.** `smallJson` reads the whole body and then tests its length, and the handlers call it before `authorize`. | `src/copilot/routeHandler.ts:140-141, 160, 171`. | Code read. | **Fixed.** `handleLocalConnection` authorizes from headers and cookies before the body is read; every local body is read under its limit as it arrives, so a missing or misleading `Content-Length` can't make the server hold more. Stop stays open to any request from this machine by design, so its body is read under the same limit rather than behind pairing. |
| 8 | **Environment credentials are not trimmed like pasted credentials.** A pasted key is trimmed before it is stored; the environment key is used as is. | `saveKey` and `useEnvironmentKey` in `src/copilot/localConnect.ts`. | Code read. Impact not measured. | **Fixed.** The environment key is trimmed and checked exactly like a pasted one, with no logging, no silent switch and no provider request. |

**Evidence gaps, and what the 12 November rehearsal closed** (two instances from one checkout, fake provider, made-up keys, isolated state directories)
- **Closed — `npm run local:pair`:** used to pair both instances.
- **Closed — `--dev`:** instance A ran the development server throughout.
- **Closed — two-instance isolation:** one cookie jar on host `localhost`, ports 3107 and 3108; both stayed paired with their own cookies, each ran its own session, and instance A's run left instance B's counters at zero.
- **Closed — narrow layout and keyboard:** at 375px the whole journey ran from the keyboard (start, confirm, type, Ctrl+Enter), with no horizontal overflow and no console errors.
- **Closed — terminal arming without a connected key:** refused for Anthropic with a message and exit code 1; still allowed for the fake provider.
- **Partly closed — the launcher's browser opening:** the command each platform uses is now a pure function with a test for Windows, macOS and Linux. The spawn itself is still unexercised: running it would open the owner's real browser and pair it, leaving state there.
- **Still open — macOS Keychain and Linux Secret Service:** not exercised. Only Windows Credential Manager has been, with dummy values since removed.
- **Still open — hosted refusal:** covered by tests, not probed on the deployed preview.
- **Still open — real-Claude verification:** no real key, and no request has been sent to Anthropic.

### Two defects found while reviewing those fixes (12 November 2026), both fixed

| Defect | Evidence | Fix |
|---|---|---|
| **A credential write that landed but couldn't be confirmed was reported as "Nothing was saved".** One installation used a single fixed account name, so the write had already overwritten the live key. A failed replacement left the record on the old revision while the store held the new key (every later request failed `credential_changed`), and a failed first save left `source: "none"`, so even Disconnect never removed the entry. | Reproduced through the real adapter with a fake native backend whose write lands and whose read-back then fails. | **Fixed.** A key is written to the free one of two account slots and committed only once it reads back, so the live entry is never overwritten. The adapter returns an outcome instead of throwing, and reports whether an entry may exist — a native write that throws may still have stored, so only the "store unavailable" path claims nothing was saved. Unconfirmed or superseded slots are recorded by name (never a secret) and removed on the next save or Disconnect; when removal can't be confirmed, the message says an entry may remain. Disconnect clears slots whatever `source` says. |
| **A relative `ATLAS_LOCAL_DIR` still split the scripts from the server.** The earlier fix anchored only the default. With an explicit relative override, a script run by absolute path from another folder wrote under the caller's directory while the server it spawned looked under the repository root. | Reproduced by running both scripts from another directory with `ATLAS_LOCAL_DIR=relative-state`. | **Fixed.** Both scripts resolve relative `ATLAS_LOCAL_DIR` and `ATLAS_LIVE_SESSION_FILE` against the repository, write the absolute values back into the environment and pass them to the server. Absolute overrides and ordinary `npm run` use are unchanged. |


**What held up:** single-use, hash-only pairing tokens; cookie, header token and strict origin on every change (a same-host page on another port is refused); no plaintext credential path; a failed OS-store save changing nothing; no silent switch to the environment key; provider and credential binding at admission and before every request; limits that can only be lowered; local endpoints checking server readiness first; and the native module building on Linux CI and Vercel.


## Finding 3: pairing lifetime, revocation and a cumulative allowance — recommendation (not implemented)

Today a paired browser stays paired for 7 days, nothing revokes it, and a session can be stopped and started again at once: each new session is a fresh allowance, so the only cumulative cap is the Console workspace's monthly spend limit. Every start is still an explicit, authorized action — this is a policy gap, not a bypass. **Nothing here is built, and no existing limit may be raised by it.**

**1. Revocation (recommended, small).** Add `npm run local:unpair` and, in Connect Claude, "Unpair this browser" and "Unpair every browser". Unpairing stops any session that browser holds.
- *Experience:* the way back from a shared or borrowed machine, and the honest answer to "how do I undo this?". Re-pairing is one command.
- *Security:* turns a 7-day grant into something the owner can end at will. Without it the only remedy today is deleting the state file by hand.

**2. Lifetime (recommended).** Keep a 7-day absolute cap and add idle expiry: a pairing unused for 24 hours lapses, and each use renews it.
- *Experience:* someone working across a few days stays paired; a browser left alone over a weekend asks to pair again.
- *Security:* shrinks the window in which a forgotten pairing on a shared machine still works, without making daily use annoying.

**3. Cumulative allowance (recommended, the substantive one).** Record a rolling 24-hour total across sessions in the connection record, and refuse to **start** a new session once starting it could pass it. Suggested opening values: 3 sessions, 9 runs and a USD 15 estimated guard per 24 hours, each lowerable by the user and never above the per-session ceilings multiplied out.
- *Experience:* the panel shows "today: USD x of y, n sessions left", and the owner learns the cap when they start a session, not from a bill. Someone who legitimately needs more waits, or raises their Console limit deliberately.
- *Security:* bounds the stop-start chain, which is the only way today to spend without end. It is still an estimate, so the Console workspace spend limit stays the real ceiling, and the panel must keep saying so.
- *Cost:* the 24-hour window has to survive restarts, so it lives in the connection record next to the credential revision, and must be reset deliberately rather than by replacing a key — otherwise replacing the key would clear the cap.

**Not recommended:** lowering the per-session ceilings (they are already small), or tying pairing to the credential (replacing a key would then force re-pairing, for no security gain).


## Open before real use

1. Codex review of these fixes.
2. The owner's decision on finding 3's recommendation above.
3. The owner's explicit approval of a real-Claude verification: one key, one session, synthetic data.
3. Exercising the macOS and Linux credential stores.
4. Data scope beyond sample data, which needs [PII_PROTECTION.md](PII_PROTECTION.md).

## Sources (official; checked 10–11 November 2026)

- https://platform.claude.com/docs/en/about-claude/api-credits-for-subscribers
- https://support.claude.com/en/articles/17154008-monthly-api-credits-for-max-ultra-and-team-plans
- https://support.claude.com/en/articles/9876003-i-have-a-paid-claude-subscription-pro-max-team-or-enterprise-plans-why-is-claude-api-usage-billed-separately-from-my-paid-claude-plan
- https://platform.claude.com/docs/en/manage-claude/workspaces
- https://platform.claude.com/docs/en/manage-claude/admin-api
- https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan
- https://code.claude.com/docs/en/legal-and-compliance
- https://code.claude.com/docs/en/agent-sdk/overview
- https://code.claude.com/docs/en/agent-sdk/quickstart
- https://code.claude.com/docs/en/agent-sdk/typescript
- https://code.claude.com/docs/en/agent-sdk/custom-tools
- https://code.claude.com/docs/en/authentication
- https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop
- https://claude.com/docs/connectors/building/mcpb
- https://support.claude.com/en/articles/11725091-when-to-use-desktop-and-web-connectors
