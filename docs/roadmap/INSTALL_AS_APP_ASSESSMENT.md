# Anthropic's "Install as app": feasibility for Stratovell (#116)

**25 November 2026. A documentation and source assessment only.** Nothing was built, ported, installed or run. No artifact was installed, Claude Desktop was not updated, and no model request was made.

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
- **Untested:** nothing here was tried.

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
  - Organizations with CMEK or org-wide zero data retention start with all three settings off.
  - It is unavailable to HIPAA-ready organizations, and apps **aren't covered by zero data retention**.
- **Claude calls:** an app can call Claude, and connectors, with the user's own Claude account. Requests count toward that user's **plan usage limits**, with no API key.

## Stratovell's requirements, one by one

| Requirement | What the pages say | What it would take |
|---|---|---|
| **Statement PDF import** | **Documented:** an artifact can include a file-upload control (PDFs listed; 20 MB per file). Only the owner or editors in the organization may upload; outside invitees may upload only images and videos. **Not stated:** whether installed apps get the control; PDF parsing. | **Assumption:** Stratovell already has a browser PDF reader (`src/ingestion/pdf/readPdfBrowser.ts`), so in-page parsing is plausible if the library can be bundled. **Untested.** The upload rule for invitees would block outside advisors from importing statements. |
| **Reuse of the deterministic engines** | **Not stated:** supported technologies, app size or bundling rules. | **Assumption:** the pure TypeScript engines in `src/engines/` could be bundled into an artifact. The Next.js application itself cannot become an artifact unchanged: its API routes (`copilot`, `ingest`, `market-data`, `proposals`), the server re-gating of the final PDF, the credential store and the file-based local state all run on a server. Every page would need a second, artifact-shaped UI, which is the rewrite this assessment rules out. |
| **Reviewed objectives, scoped analysis, draft-only authority** | **Documented:** apps call Claude through the user's account. **Not stated:** model choice, per-request limits, token or spend caps, or tool-use controls. | **Assumption:** draft-only authority (previews, explicit Add, explicit approval) is enforced in Stratovell's own code, so it could be kept. The analysis inputs, objectives and scope are app data and could be kept. The way Claude is called would change (below). |
| **Durable workspaces, backup and restore, frozen versions** | **Documented:** artifacts can store data between sessions (personal or shared), up to 100 MB and 25,000 documents, on Pro and above. Unpublishing a published artifact deletes its storage. Enterprise retention can delete an artifact nobody opens. **Not stated:** whether installed apps use that storage; where it is kept; whether it survives updates; data export. | Stratovell's workspace is one string, about 1 MB for the sample, so it would fit. Durability and backup are unknown: the atomic file, previous copy, daily backups and recovery (findings A and C) have no documented equivalent. Frozen versions would be app records, as they are today: not tamper-proof. |
| **Faithful proposal PDF** | **Not stated:** file generation, downloads from installed apps, printing. | The final PDF is printed by Chromium after the server re-runs every gate (`src/app/api/proposals`). An artifact has no documented server or print path. A client-side PDF library would not reproduce the current template, and the server re-gating would move into the page. **Untested.** |
| **Distribution to unrelated advisors** | **Documented:** artifacts can be shared by link or email invitation (up to 50 outside people each). Claude features and connected apps **don't work for people who open the link from outside your organization** or without signing in. Every update asks for permissions again. **Not stated:** whether recipients can install a shared app. | This is the main blocker. Unrelated advisors are outside the author's organization, and the documented rule says Claude features don't work for them. A firm with zero data retention, CMEK or HIPAA settings can't use apps at all. |
| **Permissions, plan eligibility, data handling** | **Documented:** browser-level capabilities by default. Storage and connectors are Pro and above; installing is on all plans in beta. Apps aren't covered by zero data retention. Opening an app is logged as an artifact view. **Not stated:** training use and retention specific to apps; the content security policy and external network rules. | Real client data in artifact storage would sit with Anthropic's service under the user's plan terms, not on the advisor's computer. That needs its own #59 privacy decision and is not covered by the current local-first design. |

## Controls that would need redesign

- **Billing basis.**
  - Today: Stratovell uses the advisor's own **Anthropic API key**, billed to their Console organization. A session has confirmed limits on runs, requests and estimated USD, with reservations and `meteredRun` (`src/copilot/`).
  - In an app: requests count toward the user's **Claude plan usage**. There is no API key and no documented per-request cost, so the USD estimate and spending limits have no counterpart. On Enterprise usage-based billing, organization spend limits apply.
- **Model and request settings:** model pinning, `max_tokens` and request caps are not documented for app calls.
- **Live session lifecycle:** start, stop on close, kept counters and the labelled test provider would need equivalents in an environment the app doesn't control.
- **Server re-gating:** the final-PDF route re-runs readiness on the server today. In an artifact it would run in the page that also renders the proposal.
- **Credential store:** not needed, because there is no key. The Windows Credential Manager path would be removed.

## The three routes compared

| | **Current Electron application** | **Installed artifact** | **Artifact plus a small MCP or service adapter to the existing engines** |
|---|---|---|---|
| Engines and gates | The same code, unchanged | A rebundled copy; server gates move into the page | The adapter calls the same engines |
| UI | The existing app | **A second UI** (rewrite) | **A second UI** (rewrite) |
| Statement import | Works (browser and Node readers) | Plausible, untested; invitees can't upload PDFs | Plausible, untested |
| Faithful PDF | Electron's Chromium after the server gates | Not documented | The adapter could print, but it would have to run somewhere: a hosted service again (retired in #116), or a local service the app would need a documented way to reach (not stated) |
| Data location | The advisor's computer (`%APPDATA%\Stratovell`) | Artifact storage (location not stated; not covered by zero data retention) | Artifact storage plus the adapter's host |
| Claude billing and controls | The advisor's API key, with confirmed USD and request limits | Plan usage; no documented caps | Plan usage for the app; the adapter's own limits |
| Unrelated advisors | Download and install (needs signing and a published installer) | **Claude features don't work outside the author's organization** | The same sharing limit, plus connector set-up by each advisor |
| Platforms | Windows today (macOS possible later) | Mac and Windows Claude Desktop, online only | The same |
| Maturity | Built; Codex re-review pending | Beta, launched 24 November 2026 | Beta, plus a new service |

## Recommendation

**Keep the Electron application as the delivery route.**
- It is the smallest viable route: it is built, it reuses every engine and gate unchanged, it keeps client data on the advisor's computer, and it keeps the metered API-key controls.
- What remains is the reliability fixes now in review, code signing, and a published installer.

**Don't port to Install as app now.** Three documented limits block Stratovell's core requirements:
- Claude features don't work for people outside the author's organization, which is exactly the unrelated advisors Stratovell serves.
- Apps aren't covered by zero data retention and are unavailable to some regulated configurations.
- No faithful PDF path or storage-location statement exists.

It would also need a second UI.

**Revisit it later** as a possible lightweight companion, for example a scripted preview or a read-only viewer of an approved version, only if all of these hold:
- the documentation settles where installed-app storage lives, file downloads and printing, network rules, and Claude features for outside users;
- the owner approves a bounded spike with synthetic data, on a computer where installing is safe.

## Open questions (none answered by the pages)

1. Where is an installed app's storage kept? Does it survive updates? Can it be exported?
2. Can an installed app offer a file download (a PDF or a backup), or print?
3. Which external network requests and libraries may an app load? (The pages say code loaded from another site can change without a new permission request.)
4. Can a shared app be installed by a recipient on another plan or organization? Do Claude features work for them once signed in?
5. Can an app's Claude calls set a model, token caps or spending limits?
6. How do Anthropic's training and retention terms apply to installed-app data, as distinct from chats?
