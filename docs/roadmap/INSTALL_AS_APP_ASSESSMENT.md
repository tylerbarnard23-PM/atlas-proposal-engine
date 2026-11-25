# Anthropic's "Install as app": feasibility for Stratovell (#116)

**25 November 2026, revised after Codex's re-review. A documentation and source assessment only.** Nothing was built, ported, installed or run. No artifact was installed, Claude Desktop was not updated, and no model request was made.

**Sources** (read on 25 November 2026; the feature launched in beta on 24 November):
- [Install as app](https://claude.com/resources/articles/install-as-app) (announcement, 24 November 2026);
- [Install an artifact as an app](https://support.claude.com/en/articles/18516354-install-an-artifact-as-an-app);
- the pages it links to:
  - [What are artifacts](https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them);
  - [Share artifacts](https://support.claude.com/en/articles/9547008-share-artifacts);
  - [Artifacts admin guide](https://support.claude.com/en/articles/16994751-artifacts-admin-guide-for-team-and-enterprise-plans).

Each point below is marked:
- **Documented:** stated on those pages.
- **Not stated:** the pages are silent.
- **Assumption:** my inference, not verified.
- **Unverified:** no evidence either way, and nothing was tried.

**Product direction (unchanged by any route).** The advisor records and reviews the client's objectives, and those reviewed objectives guide Claude's analysis and recommendations. Stratovell's existing deterministic engines calculate the portfolio effects. The advisor approves every recommendation and every version. Claude's output stays a draft until the advisor adds and approves it.

## What the feature is (documented)

- **What installing does:** it gives an existing artifact its own icon and window in **Claude for Mac or Windows** (version 6.28899.0 or later). It is still the same artifact: edits update the installed copy, and the user re-grants permissions after every update.
- **Availability:** in beta on all plans, but not on Linux, the web or mobile.
- **No offline use:** it opens only while the user is **online and signed in to Claude Desktop**.
- **Permission levels:**
  - by default, browser-level capabilities only;
  - optional "app permissions": notifications, shortcuts, a tray item and floating windows;
  - "full access" to run programs and read or change files. Full access is available only for apps you made, or apps made in your organization.
- **No review:** Anthropic doesn't review apps before install.
- **Organization controls:**
  - Team has it on by default; Enterprise has it off until an owner turns it on.
  - **Organizations with CMEK or org-wide zero data retention start with all three settings off.** The pages don't say they are prohibited from turning them on. Separately, installed apps **aren't covered by zero data retention**.
  - **HIPAA-ready organizations and hybrid deployments can't use the feature.** That is a different restriction from the CMEK and zero-data-retention defaults.
- **Claude calls:** an app can call Claude, and connectors, with the user's own Claude account. Requests count toward that user's **plan usage limits**, with no API key.

## Stratovell's requirements, one by one

| Requirement | What the pages say | Assessment |
|---|---|---|
| **Statement PDF import** | **Documented:** an artifact can include a file-upload control (PDFs listed; 20 MB per file). Only the owner or editors in the organization may upload; outside invitees with edit rights may upload only images and videos. **Not stated:** whether installed apps get the control; PDF parsing. | **Assumption:** Stratovell already has a browser PDF reader (`src/ingestion/pdf/readPdfBrowser.ts`), so in-page parsing is plausible if the library can be bundled. **Unverified.** The documented upload rule for outside invitees would limit statement import for advisors outside the author's organization. |
| **Reuse of the deterministic engines** | **Not stated:** supported technologies, app size or bundling rules. | **Assumption:** the pure TypeScript engines in `src/engines/` could be bundled. The Next.js application can't become an artifact unchanged: its API routes (`copilot`, `ingest`, `market-data`, `proposals`), the server re-gating of the final PDF, the credential store and the file-based local state all run on a server. **The porting effort is unverified:** it would need an artifact-shaped UI, and its size is not estimated here. |
| **Reviewed objectives, scoped analysis, draft-only authority** | **Documented:** apps call Claude through the user's account. **Not stated:** model choice, per-request limits, token or spend caps, or tool-use controls. | **Assumption:** draft-only authority (previews, explicit Add, explicit approval) is enforced in Stratovell's own code, so it could be kept. The objectives, scope and analysis inputs are app data and could be kept. How Claude is called would change (below). |
| **Durable workspaces, backup and restore, frozen versions** | **Documented:** artifacts can store data between sessions (personal or shared), up to 100 MB and 25,000 documents, on Pro and above. Unpublishing a published artifact deletes its storage. Enterprise retention can delete an artifact nobody opens. **Not stated:** whether installed apps use that storage; where it is kept; whether it survives updates; export. | **Unverified.** The sample workspace is about 1 MB, so the documented limits would fit. The desktop app's durability (atomic file, previous copy, daily backups, recovery, the load-problem guard) has no documented equivalent. Frozen versions would be app records, as they are today: not tamper-proof. |
| **Faithful proposal PDF** | **Not stated:** file generation, downloads from installed apps, printing. | **Unverified.** Today the final PDF is printed by Chromium after the server re-runs every gate (`src/app/api/proposals`). Whether an installed app can produce the same document, and where the re-gating would run, is unknown. |
| **Distribution to unrelated advisors** | **Documented (shared links):** sharing by link or email invitation, with up to 50 outside people per artifact. Connected apps and Claude features **don't work for people who open the link from outside your organization** or without signing in. Every update asks for permissions again. **Not stated:** whether an outside recipient can install a shared app, or whether Claude features work in that installed copy. | **The documented limit applies to opening a shared link; installed recipients are unverified.** It may block advisors outside the author's organization, and it needs confirmation before any decision. |
| **Permissions, plan eligibility, data handling** | **Documented:** browser-level capabilities by default. Storage and connectors are Pro and above; installing is on all plans in beta. Apps aren't covered by zero data retention, and opening one is logged as an artifact view. **Not stated:** training use and retention specific to apps; the content security policy and external network rules. | **Assumption:** client data in artifact storage would sit with Anthropic's service under the user's plan terms, not on the advisor's computer. That needs its own #59 privacy decision, and the current local-first design doesn't cover it. |

## Controls that would need redesign

- **Billing basis.**
  - Today: Stratovell uses the advisor's own **Anthropic API key**, billed to their Console organization. A session has confirmed limits on runs, requests and estimated USD, with reservations and `meteredRun` (`src/copilot/`).
  - In an app: requests count toward the user's **Claude plan usage**. There is no API key and no documented per-request cost, so the USD estimate and spending limits have no documented counterpart. On Enterprise usage-based billing, organization spend limits apply.
- **Model and request settings:** model pinning, `max_tokens` and request caps are not documented for app calls.
- **Live session lifecycle:** start, stop on close, kept counters and the labelled test provider would need equivalents.
- **Server re-gating:** the final-PDF route re-runs readiness on the server today. Without a server it would run in the page, unless an adapter provides it.
- **Credential store:** not needed, because there is no key.

## The three routes compared

| | **Current Electron application** | **Installed artifact** | **Artifact plus a small MCP or service adapter to the existing engines** |
|---|---|---|---|
| Engines and gates | The same code, unchanged | A rebundled copy; server gates move into the page (unverified) | The adapter calls the same engines and gates |
| UI | The existing app | An artifact-shaped UI (effort unverified) | An artifact-shaped UI (effort unverified) |
| Statement import | Works (browser and Node readers) | Plausible, unverified; outside invitees can't upload PDFs (documented) | Plausible, unverified |
| Faithful PDF | Electron's Chromium after the server gates | Unverified | The adapter could print. **A local adapter (an MCP server on the advisor's computer) is an architectural possibility.** Whether an installed artifact can reach one is not stated, and a hosted adapter would reintroduce a hosted service. |
| Data location | The advisor's computer (`%APPDATA%\Stratovell`) | Artifact storage: location not stated; not covered by zero data retention | Artifact storage, and wherever the adapter runs (it could be local) |
| Claude billing and controls | The advisor's API key, with confirmed USD and request limits | Plan usage; no documented caps | Plan usage for the app; the adapter's own limits |
| Unrelated advisors | Download and install (needs signing and a published installer) | Shared-link limits documented; installed recipients unverified | The same, plus connector set-up by each advisor |
| Platforms | Windows today (macOS possible later) | Mac and Windows Claude Desktop, online only | The same |
| Maturity | Built; the reliability fixes await Codex re-review | Beta, launched 24 November 2026 | Beta, plus an adapter to build |

## Recommendation

**Keep the Electron application as the delivery route.** The reason is not that Install as app is proven unsuitable: Electron is already implemented, and a migration still carries the uncertainty below.

- **What Electron already has:**
  - it runs the existing engines, gates and advisor-approval workflow unchanged;
  - it keeps client data on the advisor's computer;
  - it keeps the metered API-key controls.
- **What Electron still needs:** the reliability fixes now in review, code signing, and a published installer.
- **What remains uncertain for Install as app:**
  - installed-app storage and its durability;
  - PDF fidelity and file downloads;
  - Claude features for advisors outside the author's organization;
  - spend and model controls;
  - the porting effort.

No port, second UI or MCP implementation is proposed now.

**Revisit it** as a companion or an alternative only after both of these:
- the open questions below are answered, by documentation or by an owner-approved, bounded spike with synthetic data on a computer where installing is safe;
- the porting effort is estimated.

A local MCP adapter to the existing engines stays a design option to evaluate then.

## Open questions (none answered by the pages)

1. Where is an installed app's storage kept? Does it survive updates? Can it be exported?
2. Can an installed app offer a file download (a PDF or a backup), or print, and how faithful would the proposal PDF be?
3. Which external network requests and libraries may an app load? (The pages say code loaded from another site can change without a new permission request.) Can it reach a local MCP server?
4. Can a shared app be installed by a recipient outside the author's organization, and do Claude features work in that installed copy?
5. Can an app's Claude calls set a model, token caps or spending limits?
6. How do Anthropic's training and retention terms apply to installed-app data, as distinct from chats?
7. How large is the work to reshape Stratovell's pages for an artifact?
