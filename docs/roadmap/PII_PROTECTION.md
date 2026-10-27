# Client PII protection prerequisite

> Delivery routing (24 October 2026): the [demo-first milestone](DEMO_DELIVERY_PLAN.md) stays synthetic/sample-only. Real-client infrastructure remains later but **this prerequisite is unchanged** before any real-client pilot. Apply relevant minimum-data, secret, payload, logging and authority checks to each touched path now; do not describe postponement as completed protection.


Tracking issue: [#59](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/59). Parent roadmap: #36.

_Status: Planned. Recorded 22 October 2026 after the owner asked how to secure client data. This is an addition to the accepted 25-item roadmap, not a renumbering or an implemented security control._

## D5 publication exposure review — 27 October 2026

The [bounded secrets and exposure review](D5_SECRETS_EXPOSURE_REVIEW.md) is a planned D5 publication check linked to this issue and R25/#57. It checks repository/history, build/CI/environment configuration, emitted browser bundles/maps and public API/agent boundaries, including uncontrolled paid-operation paths. Record redacted commit/build-bound evidence, access gaps and blocker retests. Exposed usable credentials require immediate owner notification and prioritized revocation/rotation; never publish their values. Preserve client-side processing when it avoids unnecessary data transmission. The report-only assessment authorizes no new services, key rotation, history rewrite or broad authentication/storage rebuild. It does not complete this issue or authorize real-client data. D3 remains next; this document records requirements, not a scan result.

## Product decision

Keep the public application a synthetic/sample-data demonstration. Before real client information is processed, require a reviewed privacy/security design and evidence that the controls below work across every data path. Masking the UI, adding a login or encrypting a database alone does not meet this gate.

Collect only data needed for the advisor task. Portfolio values, ownership and private-asset names can be sensitive and identifying even after names are replaced. Treat pseudonymized financial data as confidential, not anonymous.

## What was inspected

Read-only source review of main at `1d6f0c0a67dac79c2a6a3bbe498fba79793a452c`: browser persistence, PDF import, other import formats, Copilot request/tool paths, PDF generation, source traces and framework configuration. This is a design/code assessment, not a penetration test, an audit of deployed infrastructure/logs or a compliance certification.

| Data path | Current source behavior | Required protection |
|---|---|---|
| Supported PDF import tab | PDF bytes are read in the browser; extracted holdings, names, filenames and row/source traces become workspace data | Minimize persisted identity/raw traces; source access and lifecycle explicit |
| CSV, Excel, pasted text, images and OFX intake | The UI posts text or file content to /api/ingest | Tell the user what leaves the browser; minimize payloads and authenticate/authorize real-data processing |
| Browser workspace | Zustand persist stores client/advisor, accounts, holdings, recommendations and source-document state under the existing browser key | No plaintext sensitive workspace in persistent browser storage for a real-client deployment; migration and recovery plan |
| Copilot in demo or live mode | Browser posts client, advisor, accounts, holdings and recommendations to Atlas's API; completeness metadata is reduced through forReadiness | An explicit allowlisted task projection instead of the entire workspace; server and browser data-flow controls |
| Copilot in live mode | The question and selected engine tool results are sent to Anthropic; overview/holding tools include names, account labels and sensitive portfolio information | Pseudonymous handles, minimized fields, free-text review and approved vendor/feature retention settings |
| PDF generation | Client/portfolio state is posted to the server for rendering; client name enters the download filename; successful response already uses no-store | Minimal render projection, authentication/authorization, generic/alias filenames, controlled output and renderer isolation |
| Errors/logging | PDF route logs caught exceptions; ingestion/PDF routes can return exception messages | Bound and sanitize errors/log fields; inspect host telemetry configuration without assuming a leak occurred |
| Future snapshots/backups/share links | Planned in R19/R21/R23 | Privacy controls are prerequisites, not additions after these features hold real client data |

The inspected API handlers do not enforce application authentication/tenant authorization. Deployment-level controls were not audited. The reviewed code does not establish a secure multi-client backend. No claim is made that existing browser workspaces are publicly readable by other visitors; the concern is their storage/exposure paths and missing production controls.

## Sensitive data inventory and boundaries

Define field classes and a purpose before collecting them:
- Direct identifiers: names, email, postal address, phone, birth date, tax/government IDs and full account numbers.
- Indirect identifiers: client/account labels, filename, source row text, private company/property names and free-form notes.
- Confidential financial data: positions, balances, cost basis, account ownership, liabilities, restrictions and proposed actions.
- Operational secrets: provider keys, sessions and encryption keys; these are never workspace/export fields.

Tax/government IDs and full account numbers are not necessary for the proposal demo. Prefer stable internal client/account IDs and a masked display suffix only where useful. Do not infer that an internal ID authorizes access. Keep advisor-private notes distinct from the client-visible report projection.

## Implementation slices

### A. Inventory, threat model and sample-data boundary
1. Document the flows above, trust boundaries, purposes, recipients and intended retention. Include previews and non-production deployments.
2. Model cross-advisor/firm access, malicious same-origin script, stolen session, lost backup/PDF, raw error/telemetry exposure and unnecessary AI transmission.
3. Preserve the public synthetic-data rule. Offer sanitized/synthetic examples and a private demo display mode for screen sharing.
4. If redacted documents are used for development, remove underlying text/OCR/metadata rather than overlaying black boxes. Detection is an aid, not a guarantee that a file has no PII.

### B. Minimize persistent data and API payloads
1. Create typed allowlist projections for ingestion, Copilot, PDF, export and client presentation. Omit private discovery notes, raw rows, full identifiers and arbitrary unknown fields unless a specific function requires them.
2. Separate identity/contact information from analytical account/position IDs. Keep any reidentification mapping inside the authorized application.
3. Inspect and limit source filenames, rawText, rawTextSample, sourceTrace and embedded field evidence at every serializer. Keep enough trace for reconciliation without indiscriminate duplication.
4. For the demo, add explicit transient-session behavior and a clear erase/lock action without silently deleting existing saved work. For real-client use, move sensitive persistent state to an authorized encrypted server store; leave only necessary non-sensitive preferences in localStorage.
5. If an offline encrypted vault becomes a selected requirement, design user unlock, key derivation, lock timeout, recovery and key lifecycle separately. A key stored beside ciphertext or an encrypted browser store unlocked by the same compromised JavaScript does not solve XSS.

### C. Protect AI requests and vendor use
1. Replace names/account labels with context-specific aliases, and send only the data needed for the selected tool/task. Holdings and exact values may still be sensitive.
2. Apply minimization to initial questions, every tool result, retries/fallbacks, error traces and responses—not just the first prompt. Reject unexpected fields and review free text for identifiers.
3. Preserve financial semantics and stable action/holding references when tokenizing; never modify prices/values to make a privacy filter pass.
4. Show the advisor a useful description of the data shared and the active demo/live mode. Do not claim data stays on-device when the API receives a snapshot.
5. Approve the vendor, region/features, processing agreement, retention and any zero-retention eligibility before real-data live mode. Commercial no-training defaults are not the same as zero retention.
6. Uploads made directly to Claude Desktop/Claude Code are a separate channel governed by the account/organization settings. Atlas cannot redact a document before it is attached directly to another app.
7. Public live Copilot stays disabled while the endpoint has no application authentication. Do not enable it as part of this planning work.

### D. Authentication, authorization and secure storage
1. Define firm/advisor/client ownership and permission rules. Use a maintained identity provider, MFA for privileged/advisor access, scoped roles and secure session handling.
2. Enforce deny-by-default authorization on every request and every client/document/snapshot/export. Test guessed IDs and cross-tenant access; hiding a link is not access control.
3. Real-data APIs must derive authorized records from server-owned data, not trust an asserted client/firm ID or a whole browser-supplied workspace.
4. Require HTTPS; encrypt database/object storage/backups and selectively sensitive fields using managed key services and least-privilege access. Keep keys separate from data, with rotation/recovery procedures and no shared secrets in browser bundles.
5. Define upload/parser limits, renderer network restrictions, dependency maintenance, output encoding and a tested Content Security Policy. No claim is made here that a specific XSS vulnerability exists.
6. Use private source-file storage and short-lived authorized retrieval. A publicly deployed demo or preview must not receive production credentials or data.

### E. Logs, output, exports and lifecycle
1. Use allowlisted structured logging with event IDs, actor/action/time and resource IDs, not client payloads or notes. Preserve useful security audit events without logging sensitive contents.
2. Sanitize exception logging and user-facing errors; verify observability, analytics, request capture and session replay settings. Do not assume app code's lack of a database means the hosting/monitoring stack retains nothing.
3. Apply no-store to sensitive responses as appropriate; keep PII out of URLs, analytics tags, filenames and PDF metadata. The PDF route's existing no-store header is a useful partial control, not complete privacy protection.
4. Offer redacted/screen-share output and explicit authorized full-identity exports. Backups carrying PII need encryption and a deliberate key/unlock design before real use.
5. Links need authentication/authorization, expiry/revocation and snapshot identity. Acknowledgement does not authorize a trade.
6. Define retention, deletion, backup expiration, approved-record handling and incident response before real-client deployment. The app cannot revoke an already downloaded PDF or erase an unrelated copy on a user's device; explain those limits.

## Acceptance and verification

Use synthetic PII canaries and a documented data-flow test harness; never real client data in fixtures, screenshots, PRs or logs.

- [ ] Inventory every identity/financial field and purpose, recipient, serializer and retention location, including browser storage and downloads.
- [ ] Capture outgoing ingestion/Copilot/PDF requests. Fields omitted by policy are absent from payloads, model messages/tool outputs, retries and error traces—not merely masked on screen.
- [ ] Scan browser persistence, generated filenames/metadata, backups, telemetry and safe error responses for synthetic canaries. Approved full-identity output is an explicit, tested exception.
- [ ] No real-client sensitive state or identity-bearing authentication token is kept in plaintext localStorage by the real-data architecture.
- [ ] Anonymous and unauthorized/cross-firm requests to client data, source documents, snapshot rendering, exports and sharing fail. Authorized operations still work.
- [ ] Session expiry/logout, permissions changes and revoked/expired links prevent future access; already downloaded files are documented as outside revocation.
- [ ] Encryption keys are not bundled client-side, committed, exported or stored alongside protected data; rotation/recovery and encrypted-backup restore are exercised.
- [ ] Known identifiers in free text are minimized/flagged; unknown/private-asset text has a review path. No detector is claimed to make a portfolio anonymous.
- [ ] Redaction and tokenization do not corrupt IDs, reconciliation, currency math, missing-data gates or approvals.
- [ ] Existing saved data is migrated deliberately and recoverably, with the supported retention/deletion behavior tested.
- [ ] Vendor/account/feature data handling and deployment telemetry settings are recorded as evidence, not assumed from a product name.
- [ ] A focused threat-model review, relevant dependency/security checks and end-to-end tests pass before any real-client pilot. Record owner review of the residual risks and operating responsibilities.

Implementation PRs follow the normal typecheck/tests/eval/build and focused browser checks. This plan does not claim those security controls or tests already pass.

## Roadmap integration

This is a cross-cutting prerequisite supporting R09/R10 source intake, R12 discovery, R19 snapshots, R21 presentation/sharing, R22 Copilot and R23 backup/client isolation. Preserve R01–R25 numbering and their existing implementation dependencies.

- **P0:** inventory/threat model, sample boundary and typed data-projection design.
- **P1/P2:** implement minimization, safer browser persistence, logging/errors and export handling while keeping the public app synthetic.
- **Before any real-client pilot:** server identity/authorization, encrypted persistent storage/key management, approved AI/vendor policy, retention and verified end-to-end boundaries.
- **Before remote sharing:** additionally prove tenant isolation, private serialization and expiry/revocation from R21.

Keep the existing #26/#28 sequencing intact (PR #34 is merged); privacy planning can proceed alongside them. No auth vendor/database/key service is chosen and no real-client processing is enabled by this document.

## Evidence and primary guidance

Source observations are pinned to the main commit above:
- `src/store/useStore.ts`
- `src/components/import/PdfImport.tsx`
- `src/app/import-center/page.tsx` and `src/app/api/ingest/route.ts`
- `src/ingestion/documents/toWorkspace.ts`
- `src/app/copilot/page.tsx`, `src/copilot/snapshot.ts`, `src/copilot/tools.ts`, `src/copilot/agent.ts`
- `src/app/api/copilot/route.ts`
- `src/app/api/proposals/[id]/generate-pdf/route.ts`
- `next.config.ts`

Guidance checked 22 October 2026:
- [OWASP HTML5 storage security](https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html)
- [OWASP authorization](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
- [OWASP cryptographic storage](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)
- [OWASP logging](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
- [Anthropic commercial training policy](https://privacy.claude.com/en/articles/7996868-is-my-data-used-for-model-training)
- [Anthropic API retention and ZDR scope](https://platform.claude.com/docs/en/manage-claude/api-and-data-retention)
- [Claude consumer/Code training policy](https://privacy.claude.com/en/articles/10023580-is-my-data-used-for-model-training)

Policies and supported vendor features must be rechecked at implementation. This plan is not a claim of GLBA, SEC, GDPR, SOC 2 or other legal/regulatory/certification compliance.

## Agent-provider evaluation integration

R22 / #54's [AGENT_EVALUATION.md](AGENT_EVALUATION.md) uses synthetic fixtures and sanitized reports. Provider adapters, model-bound tool results, retries and any explicitly configured fallback inherit this privacy gate. No silent cross-vendor fallback; behavioral evaluation does not approve a vendor's processing/retention/region policy. Observability must not retain unrestricted prompts, raw tool payloads, reasoning text or client identifiers. Test allowed/forbidden fields using synthetic canaries in every provider path, including errors and retries. No real-data provider or live deployment is enabled by this plan.
