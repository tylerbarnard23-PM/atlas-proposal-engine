# R25 — Measure advisor usability and verify accessible workflows

Accepted for planning: 22 October 2026. **Status: Planned; not implemented by this document.**
Tracking issue: #57. Parent roadmap: #36. Original review recommendation: **25 of 25**.
Phase: P0 baseline; repeat at each milestone. Relative scope: M; no calendar estimate is committed.
Canonical plan: [R25-advisor-usability-and-accessibility.md](R25-advisor-usability-and-accessibility.md).

## Delivery routing — 24 October 2026

**D1/D5 — minimum slices only.** Follow [DEMO_DELIVERY_PLAN.md](DEMO_DELIVERY_PLAN.md) and [CLAUDE_COMMANDS.md](CLAUDE_COMMANDS.md); their package order supersedes the original phase queue. Minimum scope: Repeatable synthetic tasks, keyboard checks and honest launch evidence. Later scope: Consented 3–5-advisor study and measured competitor usability comparisons; run earlier if participants exist. This does not implement or complete the full R-plan. Dependencies below mean the minimum required contract, not every advanced feature of the referenced plan. Preserve all financial, backup and privacy safeguards.


## D5 publication check — secrets and exposure

Also follow [D5_SECRETS_EXPOSURE_REVIEW.md](D5_SECRETS_EXPOSURE_REVIEW.md), linked to #59. Before LinkedIn publication, retain a redacted assessment tied to the commit/build covering code/history, CI/build/environment settings, client bundles/maps and public API/agent exposure, with access gaps and verified blocker remediation/retests. Keep this evidence separate from advisor usability observations: neither replaces the other, and neither is a full security certification. Exposed usable credentials are escalated immediately at any stage, not deferred to publication. This is planned scope only; D3 remains next and #59 remains required before real-client use.

## Advisor problem
Expert inspection cannot establish ease-of-use parity or reveal all advisor comprehension/accessibility failures.

## Outcome
Product decisions and release claims are grounded in observed task performance and usable controls.

## Advisor workflow
1. Recruit 3–5 advisors, including one unfamiliar with Atlas, using synthetic examples.
2. Run consistent tasks: reconcile import, preserve reserve, replace a fund, compare alternatives and present an approved version.
3. Record assistance/errors/comprehension, prioritize findings and repeat on the improved workflow.

## Data and calculation contracts
- Keep task scripts, measurement definitions and anonymized observations separate from product analytics.
- Do not publish participant identities, recordings or financial data without permission; record only necessary consented information.
- Baseline dates, app commit and test conditions identify each study.
- Standards referenced in a later accessibility audit must be verified from current primary documentation; this plan does not claim certification.

## Implementation slices
1. Write recruitment/screener, consent and moderator/task scripts; no messages are sent by this task.
2. Capture the current baseline and existing known gaps without invented timings or participant results.
3. Audit keyboard/focus, control names, errors, contrast/status cues, precision and responsive layout in the core journey.
4. File actionable findings and rerun the same tasks after P2 and P4.

## Acceptance criteria
- [ ] A repeatable protocol and empty scorecard exist before any usability claim.
- [ ] Scope, approval, unknown inputs and funding comprehension are explicitly measured.
- [ ] Critical controls work without color-only cues or a mouse; failures become tracked issues.
- [ ] Targets are set from measured baseline and product needs, not fabricated competitor completion times.
- [ ] All 25 items retain Planned status until their own acceptance evidence exists.

## Focused validation
- Walk the protocol with synthetic data to catch ambiguous instructions.
- Browser keyboard/focus checks and representative viewport/zoom review.
- Compare observed results consistently; retain failures and assistance, not only successful attempts.
For implementation, also follow repository-required typecheck, full tests, extraction eval, production build and a relevant browser check. Do not claim these passed from this planning work.

## Approved valuation scope adjustment — 22 October 2026

Follow [VALUATION_SCOPE.md](VALUATION_SCOPE.md). Test import/reconcile → accept source values/dates and scope → set a target → replace/fund → review/approve → present with **no security-quote keys or provider setup**. Use documented synthetic values and explicit FX; record the source-date range and whether the advisor understands dated/mixed-date limits. A separate case makes quote services unavailable while usable accepted inputs remain; compare actual completion/errors, not an assumed improvement.

Keep missing FX, incomplete import and shortfall cases so simplification cannot hide real blockers. Record commit, conditions, assistance, time and comprehension. Automated smoke tests are not a study with advisors; results stay empty until observations exist.

## Dependencies and sequencing
- No feature dependency; it can be the first bounded task after the current checkpoint.
R23a means the export/restore slice of recommendation 23; R23b means its multi-engagement isolation slice. A dependency on another plan means its required contract/slice must exist, not that all later extensions must ship first.

## Likely touchpoints
- `docs/research`
- `docs/roadmap`
- `src/components/ui`
- `src/components/layout`
- `core advisor routes`
Paths labelled proposed do not exist yet; confirm exact locations against the implementation branch.

## Migration and rollout
Prepare the protocol now; actual participant recruitment and studies occur as separate authorized activities when available.

## Success evidence
Unassisted completion, critical errors, help requests, time and correct mental model for each task.
Capture actual evidence in the issue/PR; no usability results are assumed.

## Out of scope / boundary
No invented advisor feedback, automatic outreach, accessibility certification or unmeasured parity claim.

All work follows the shared implementation rules in [IMPLEMENTATION_GUIDE.md](IMPLEMENTATION_GUIDE.md). PR #34 stays a separate review checkpoint; no feature is closed by saving this plan.
