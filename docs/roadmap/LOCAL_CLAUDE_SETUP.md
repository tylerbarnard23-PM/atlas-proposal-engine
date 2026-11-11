# Local Claude setup

How a user runs Atlas on their own machine and connects their own Claude access, with Proposal Copilot staying inside Atlas. Updated 11 November 2026 on PR #82.

## Status

- **Route 1 is chosen by the owner and implemented:** the existing Claude API integration with a user-owned Console API key, guided key entry in Atlas, optional remembering in the operating system's credential store, and sessions started inside Atlas.
- **Awaiting independent Codex review.** Not merged, not deployed.
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
   - Create an **API key in that workspace**. Use a standard key (it starts with `sk-ant-`). Never use an Admin key (`sk-ant-admin…`); Atlas refuses them.

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

## What reaches Anthropic

- Only when you ask a question: the question, the system prompt, the tool definitions, and the results the Atlas engines return to Claude's tool calls.
- The client's and household's names, the advisor's name and email, and import file names are replaced where Atlas recognizes them. **This is minimization, not anonymization:** holdings, values, account details and anything else typed into a question still reach the model.
- Nothing is sent when the page opens, a key is saved or a session starts.

## Security design

Recorded before coding on [PR #82](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/pull/82#issuecomment-6799730283), with the contract-impact note.

- **Pairing** (`src/copilot/localPairing.ts`): a one-time token, issued only from a terminal on this machine, is exchanged for an HttpOnly, SameSite=Strict cookie. The token is deleted on use. Only hashes are stored. Pairing is permission to manage the connection; it is separate from a session's allowance.
- **Every credential change and session start** (`src/copilot/localConnect.ts`) needs all of: a server in local live mode (never hosted); a loopback Host, a same-origin Origin and no cross-site fetch; the pairing cookie; and a CSRF token in a header, which only the paired, same-origin status read hands out. A local address or an Origin header alone authorizes nothing.
- **The key** is posted once to the local server and kept where the user chose (`src/copilot/credentialStore.ts`): server memory, or the OS credential store through `@napi-rs/keyring` (Windows Credential Manager, macOS Keychain, Linux Secret Service). There is no file store and no plaintext fallback. The key is never returned, logged, or put in the browser, the Atlas store, a backup or a URL.
- **The connection record** (`src/copilot/localConnection.ts`) holds where the key is kept, a revision, timestamps and a salted fingerprint, never the key. Each save, selection or disconnect is a new revision.
- **Sessions** (`src/copilot/liveSessionStore.ts`, record version 3) are bound to their provider and to the credential revision they started under, checked at admission and before every request. Reservations, unknown-usage handling, restart persistence and Stop are the paths reviewed at `538a8fc`.
- **Hosted deployments** refuse every local endpoint. The public demo stays scripted and keyless.

**Known limits**
- Cookies belong to a host, not a port. Other software served from the same loopback host in the same browser receives them, though it can't read Atlas's responses or pass the Origin check from a page.
- Other software running as the same user can read the same files and credential store. That is outside this design.
- A development server prints request addresses in its terminal, including a pairing link. The link is dead once used.
- Only Windows Credential Manager was exercised (with a dummy value, then removed). macOS Keychain and Linux Secret Service were not.
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

## Open before real use

1. Codex review of this package.
2. The owner's explicit approval of a real-Claude verification: one key, one session, synthetic data.
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
