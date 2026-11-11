# Local Claude setup: connection assessment

Saved 11 November 2026 on PR #82 from an assessment made on 10 November 2026. **This is a plan, not an implementation.** Nothing described under "Proposed" exists in the code.

## Goal

A user installs Atlas locally, connects their own Claude access, and uses Proposal Copilot **inside Atlas** to investigate, simulate and prepare proposal suggestions. Keeping the conversation inside Atlas is the preferred experience.

## Status

- **Route 1 is recommended. It is NOT owner-approved.**
- **Browser-based session arming is proposed.** It is NOT implemented and NOT security-reviewed.
- **No Anthropic permission or legal clearance has been obtained** for any route.
- **No real-Claude verification has occurred.** Every test and browser check so far used fake providers.
- **The previous paid-pilot approval was withdrawn. No paid testing is currently authorized.**
- **API cost estimates are unmeasured.**
- **Subscriber-credit eligibility is distinct from subscription login permission.** A plan that includes API credits funds an API key; it does not permit signing in to Atlas with a Claude plan.

## What exists today

- `COPILOT_MODE=live` runs the real agent loop (`src/copilot/agent.ts`) against `claude-opus-5-5` through `/api/copilot`.
- Every live request passes the local session gate (`src/copilot/liveGate.ts`, `liveSessionStore.ts`): armed in a terminal, claimed by one browser, bound to its provider, and limited to 30 minutes, 3 runs, 10 HTTP requests and a USD 5 estimate-based guard.
- Setup is the owner's 16-step PowerShell procedure in [AGENT_EVALUATION.md](AGENT_EVALUATION.md#local-live-testing-session-interactive--not-armed-paid-use-not-approved). It is a supervised test path, not a user setup.

## Verified facts

From Anthropic's official documentation, read 10 November 2026 (URLs under "Sources").

- **Subscriber API credits**
  - Max includes USD 100 a month, Ultra USD 200, and Team a pooled amount capped at USD 500. Free, Pro and Enterprise include none.
  - The subscriber claims them by linking a Console organization in claude.ai billing settings, after 7 days on an eligible plan.
  - They are spent through an ordinary Console API key. When they run out, requests stop unless the organization has purchased credits or auto-reload. The Claude plan is never charged. Unused credits expire each billing cycle.
- **Plan sign-in in products**
  - Unless previously approved, third-party developers may not offer claude.ai login or plan rate limits in their products, including agents built on the Agent SDK.
  - Developers building products should use API-key authentication. They may not route requests through users' plan credentials, or collect, store or intermediate Claude.ai credentials or session tokens.
  - A user supplying their own API key, billed to the key owner and not resold, is explicitly allowed.
  - The page directs questions about permitted authentication to Anthropic sales. It describes no approval process.
- **Agent SDK capability**
  - The TypeScript package bundles the Claude Code binary.
  - It supports in-process custom tools, removing all built-in tools, a custom system prompt, model choice, a turn limit and an estimate-based spend limit. Its result reports usage and an estimated cost.
  - Under a plan sign-in, Agent SDK usage draws on subscription limits. A support note dated 15 June 2026 says previously announced changes to that are paused.
- **Claude Desktop**
  - A local MCP server installs as a `.mcpb` bundle (double-click, drag, or the extension settings) and runs over stdio on the user's machine.
  - Node is built into Claude Desktop on macOS and Windows.
  - A bundle can be distributed as a file; such installs are updated by hand.

## Route 1: user-owned Console API key in Atlas (recommended, not approved)

- **Install and authenticate:** install Atlas; create a Console key in a dedicated workspace with a spend limit; supply it to the local server only. A Max, Ultra or Team subscriber links their plan first, so the key spends the included credits.
- **Where chat happens:** in Atlas.
- **Billing and limits:** API usage on the key. Included credits first, where eligible; otherwise prepaid Console credits. Pro, Free and Enterprise users pay for API usage separately.
- **Workspace state:** unchanged. The browser sends the question, the snapshot and the input revision with each request, and a stale revision is refused (409).
- **Reused:** the agent loop, tools, evidence checks, session gate, accounting and the session bar.
- **Proposed new work:** see "Proposed setup experience" below.
- **Unresolved:** owner approval; the security design and review of browser-based arming; real-Claude verification.

## Route 2: Claude Code / Agent SDK with the user's plan sign-in (not recommended now)

- **Feasibility:** technically possible. The SDK would replace the reviewed loop, with Atlas tools wrapped as in-process tools and built-in tools removed.
- **The constraint is authorization, not technology.** Atlas is a product other people install. The documentation reserves plan sign-in for Anthropic's own applications unless approved, and tells product developers to use API keys. The support note that third-party app usage still draws on plan limits describes billing, not permission.
- **If it were approved:** the user would sign in through Anthropic's own flow and Atlas would never see a token. Figure checks and draft acceptance could be kept. The per-request reservation accounting could not, because the SDK makes its own HTTP requests.
- **With an API key instead:** permitted, but it adds a native dependency and discards the reviewed loop for no gain over Route 1.
- **Unresolved:** written confirmation from Anthropic. None has been sought or obtained.

## Route 3: Claude Desktop with an Atlas MCP bundle (fallback, later)

- **Conversation location changes:** the user asks questions in Claude Desktop, not in Atlas. Atlas would show the resulting drafts as previews to accept or discard.
- **Authentication:** the user signs in to Anthropic's own application. Atlas touches no credential.
- **Workspace bridge:** workspace state lives in the browser. The page would have to publish the current snapshot and revision to the local Atlas server, and the bundle would read it over localhost. This is a new copy of workspace data.
- **Preserved:** engines, simulations, context binding and explicit acceptance, because the tools still run in Atlas code.
- **Limits on answer checking:** Atlas can't see Claude's answer, so the figure check would cover draft rationales only. Atlas would not control the system prompt.
- **Unresolved:** a privacy review of the bridge ([PII_PROTECTION.md](PII_PROTECTION.md)); plan eligibility, usage accounting and per-call approval prompts, which the pages read don't state; and platform support, which the bundle documentation lists as macOS and Windows.

## Proposed setup experience (Route 1; none of this exists)

- **Setup command:** one command that starts the server bound to 127.0.0.1 with live mode on, on Windows, macOS and Linux, with no new dependency.
- **Doctor command:** reports what is missing (Node version, key presence, a base-URL override, a hosted environment) by reusing `liveReadiness`. It never prints the key.
- **Status panel:** a "Connect Claude" panel on the Copilot page showing the same checklist and what is sent to Anthropic. The browser never accepts or stores a key.
- **User-controlled session allowance:** the user chooses budget, runs and duration under ceilings fixed in code. Provider binding, per-request reservations, one run at a time and Stop stay.
- **Arming:** terminal arming is not assumed to be the permanent experience. An in-app "Start session" control with a confirmation is proposed; the terminal command would remain as an alternative.
- **Installation guide:** one guide covering the Console workspace and spend limit, linking a plan for credits, the commands, cost expectations and a troubleshooting table keyed to the refusal codes.

## Must be preserved

- The one shared evaluator and the engines in `src/engines/`; no second calculation path.
- Context binding: the input revision, the `stale_context` refusal, and the re-check on acceptance.
- Simulations before any sized draft, failing closed on scope, cash, missing values or FX, incomplete imports, reserve breaches and duplicates.
- Figure checks against engine evidence.
- Explicit draft acceptance: drafts are unapproved previews, excluded from the PDF, until the advisor accepts them.
- Identity redaction before anything reaches the model, the keyless scripted public demo, and live mode refusing on hosted deployments.
- Runtime model, effort, prompt, tools and fallback; store/backup v10.

## Assumptions (not verified)

- Same-origin and loopback checks are sufficient for browser-based arming. This needs a design and a security review.
- A typical question costs about USD 0.30–0.45 on Opus 5.5. This is the repository's estimate and has never been measured.
- Subscriber credits can be spent by a self-hosted application such as Atlas. The documentation names the Claude API and the user's own apps without restricting application type, but doesn't address this case.
- Claude Desktop usage with a local MCP server counts against the user's plan limits.

## Unresolved decisions (owner)

1. Approve Route 1 as the in-Atlas connection, with Pro, Free and Enterprise users paying for API usage separately.
2. Session controls: in-app arming with a confirmation, or terminal-only; and the allowance ceilings.
3. Whether to draft a question to Anthropic about plan sign-in for Route 2. Nobody has been contacted.
4. Where the key is supplied (a git-ignored `.env.local`, or the server process's environment only).
5. Data scope: sample and synthetic data only for the first version, per [PII_PROTECTION.md](PII_PROTECTION.md).
6. Fresh approval for any real-Claude verification of the selected connection.

## Sources (official; checked 10 November 2026)

- https://platform.claude.com/docs/en/about-claude/api-credits-for-subscribers
- https://support.claude.com/en/articles/17154008-monthly-api-credits-for-max-ultra-and-team-plans
- https://support.claude.com/en/articles/9876003-i-have-a-paid-claude-subscription-pro-max-team-or-enterprise-plans-why-is-claude-api-usage-billed-separately-from-my-paid-claude-plan
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

Two source conflicts were seen: whether the extension directory still accepts bundle submissions, and when a Team plan's seat count is fixed for credits. Neither changes the assessment.
