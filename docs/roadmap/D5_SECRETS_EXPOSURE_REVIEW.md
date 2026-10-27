# D5 — Secrets and exposure review

Accepted by Tyler on 27 October 2026. **Status: planned; not performed.**
Part of D5 / [R25](R25-advisor-usability-and-accessibility.md) / [#57](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/57), linked to [PII protection / #59](PII_PROTECTION.md). No new R-number or delivery package.

## Placement and boundary

D3 remains the next implementation after released D2a; D4 follows, then D5. Run this bounded review before LinkedIn publication in D5, alongside the existing golden-path, accessibility and branding evidence. An exposed usable credential found at any stage requires immediate owner notification and prioritized remediation rather than waiting for D5. Do not treat this planning document as a scan result.

This is a secrets/exposure assessment of the supported synthetic demo, not a comprehensive security audit, penetration test, certification or permission to process real client data. #59's authentication, per-client authorization/isolation, encryption/key management, AI/vendor, retention and incident-response gate remains mandatory before a real-client pilot.

## Review scope

| Surface | What to inspect | Evidence and limits |
|---|---|---|
| Repository and history | Tracked code/config/docs/fixtures, relevant historical commits, accidentally committed credentials/private data | Redacted paths and commit IDs; distinguish examples and intentional public identifiers from secrets. Do not print private fixture contents. |
| Build and CI | Build settings, workflow permissions/secret handling, relevant accessible logs/artifacts and environment-variable configuration | Record what was accessible. Never dump environment values or unrestricted logs; unavailable host settings are not presumed safe. |
| Next.js client boundary | NEXT_PUBLIC_ values, next.config env/build defines, client imports and emitted browser bundles | Prefix conventions alone are insufficient; inspect the actual production build. Private credentials must not reach client artifacts. |
| Production assets and source maps | Public bundles/maps and serialized page/API output on the owned deployment | Record commit, build/deployment association and date. Source-map availability alone is not a vulnerability. An unidentified deployed build is an explicit evidence gap. |
| Public API and agent boundary | Secret disclosure, unnecessary PII transmission, authorization/limits for sensitive or billable operations, live/demo enforcement | Prefer source tracing and synthetic offline tests. Do not trigger paid/live calls or test discovered credentials. A server-side key does not make an unprotected billable endpoint safe. |
| Regression protection | Existing CI and available secret-scanning/push-protection capabilities | Recommend the smallest useful guard, test with synthetic canaries and record coverage. No new scanner/framework/service is enabled by this plan. |

Preserve browser data, private-file exclusions, current local processing and the shared financial/state engines. Credentials belong server-side; confidential client data should be transmitted only where a reviewed function needs it. Do not move PDF extraction or every sensitive operation to a server automatically.

## Handling findings

- Classify verified exposure separately from suspected findings and intentional public configuration. Do not use real client data or discovered credentials to prove impact.
- Never place secret values, private URLs containing tokens, full logs, client details or exploit-ready sensitive evidence in chat, public issues, commits or artifacts. Reports use redacted locations and synthetic examples.
- For an exposed usable credential, notify the owner immediately. Revocation/rotation is the first remediation priority; deleting current text or rewriting history alone does not revoke access. Coordinate service impact and obtain the appropriate operational authorization before changing credentials.
- Recommend a bounded fix per finding. Any history cleanup, key rotation, authentication addition, scanner installation or hosting change is separately authorized work; preserve unrelated changes and do not perform a broad rewrite.
- Fix and retest verified publication-blocking exposures before D5 sign-off. Examples include private credentials in public artifacts, sensitive data disclosure and an uncontrolled public paid-operation path. Record remaining nonblocking risks, owners and coverage gaps; no unexplained blocked or unverified critical surface may be represented as cleared.
- A clean scan means no findings within the recorded checks, not proof that no secrets exist. Never claim comprehensive security, institutional compliance or that #59 is complete.

## Exit evidence

- [ ] Commit, build/deployment identity, review date, scope and scanner/tool versions (if used) recorded.
- [ ] Coverage matrix separates inspected, unavailable and not applicable surfaces with reasons.
- [ ] Verified findings have severity, redacted location, exposure path, impact, owner, bounded remediation and retest evidence.
- [ ] Confirmed blocking exposures are resolved and retested before publication; unavailable critical checks are escalated as unresolved coverage, not silently passed.
- [ ] Safe synthetic canary/regression checks cover any implemented guard, without logging actual secrets or making paid calls.
- [ ] Public summaries are sanitized; sensitive evidence is retained only in an approved private location.
- [ ] Report distinguishes this D5 check from the remaining #59 real-client controls and states that the public demo remains synthetic and scripted.

These are engineering release evidence requirements, not a tamper-proof audit record or guarantee.

## Saved Claude command — report only

Use **Opus 5.5 / High effort** for this security assessment. Reading this template is not authority to execute it ahead of the selected package.

```text
Run the D5 secrets and exposure review for Atlas — report only.
Use Claude Code Desktop / Opus 5.5 / High effort.

Read CLAUDE.md, the short handoff and
docs/roadmap/D5_SECRETS_EXPOSURE_REVIEW.md. Verify the target commit and
deployment/build association. Keep D3 next if D5 is not yet the selected task;
this saved template does not start the review automatically.

Inspect tracked code and relevant Git history, build/CI configuration,
accessible relevant logs and environment configuration, a clean production
build, emitted browser bundles, publicly accessible source maps and public
API boundaries. Never dump environment values or unredacted logs.
Check NEXT_PUBLIC_ variables, next.config env/defines and client imports.
Distinguish intentional public identifiers from private credentials.

Trace whether public routes can disclose secrets, receive unnecessary client
data or trigger uncontrolled paid AI/provider use. Do not invoke paid/live
routes, use discovered credentials, probe third-party systems or bypass access
controls. Record inaccessible configuration/logs/artifacts as coverage gaps.

Keep credentials server-side, but do not move local PDF processing or other
client data to the server merely because it is sensitive. Recommend the
minimum necessary data flow and endpoint authorization/abuse controls.

For each verified finding, report severity, a redacted location, exposure path,
impact, bounded fix and verification. If a usable secret is exposed, notify
the owner immediately without reproducing it; prioritize revocation/rotation.
Do not rotate keys, rewrite history, modify code/configuration, install tools,
enable hooks/scanning, change providers or deploy during this assessment.

Return a concise redacted coverage matrix and findings, tied to the commit and
build, with false positives and unverified areas identified. Keep sensitive
evidence private; public PRs/issues get sanitized summaries only.
Recommend proportionate existing-CI/secret-scanning protection for a separately
authorized fix. Do not claim a clean scan proves absence of secrets, a full
security audit, compliance or completion of #59.

Stop with the report. The later D5 publication gate requires verified blocking
exposures fixed and retested; it does not authorize a security-platform rewrite.
```

## Primary guidance

Recheck current guidance when executing:
- [Next.js environment variables](https://nextjs.org/docs/app/guides/environment-variables)
- [Next.js env configuration](https://nextjs.org/docs/app/api-reference/config/next-config-js/env)
- [GitHub sensitive-data removal and credential rotation](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)

No application code, CI configuration, credentials, scanner settings, provider or deployment changes are authorized by saving this plan.
