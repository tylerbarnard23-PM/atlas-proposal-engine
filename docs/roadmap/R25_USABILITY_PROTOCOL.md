# R25 — Advisor usability protocol (prepared; no study has been run)

Prepared 17 November 2026 under [R25](R25-advisor-usability-and-accessibility.md) and the [D5 package](DEMO_DELIVERY_PLAN.md). **Status: protocol only.** No participant has been recruited, no session has been held, and no message has been sent. The scorecard ([R25_SCORECARD.md](R25_SCORECARD.md)) is empty and stays empty until sessions happen. Until then Stratovell makes **no claim** about advisor usability, completion rates, time savings or parity with any other product. The walkthrough rehearsal ([D5_DEMO_WALKTHROUGH.md](D5_DEMO_WALKTHROUGH.md)) is an engineering check by the builder, not evidence from advisors.

## Purpose

Find where advisors misunderstand scope, approval, unknown inputs, funding and the approved-version step, and whether the core journey works without a mouse. Findings become tracked issues; the same tasks are repeated after fixes.

## Participants (when available; this document sends nothing)

- 3–5 practising advisors or paraplanners; at least one who has never seen Stratovell.
- Recruited by the owner through their own channels, with consent. No automatic outreach, no purchased lists.
- **Screener (record only what is needed, anonymised):** role; years advising; typical client size band; tools used for proposals (free text); keyboard-only or assistive-technology use (optional); familiarity with Stratovell (none / seen / used).
- **Consent (must be obtained before a session):** purpose; that the data is synthetic and fictional; what is recorded (task outcomes, assistance, errors, comments); whether screen or audio recording is made (default: **no recording**; notes only); that results are anonymised, participation is voluntary and can stop at any time; no participant name, employer, recording or quote is published without separate written permission.

## Conditions for every session

- Build: record the app commit and deployment (for example `b2eb2de`) and whether it is the live demo or a local build.
- Data: the synthetic Blackwell sample workspace, restored fresh; the scripted demo Copilot only (no model, no key, no paid call); no real client data, ever.
- Environment: device, browser and version, viewport, input method (mouse, keyboard-only, touch), assistive technology if any.
- Moderator script: read the task, then stay silent. Allowed prompts: "What are you thinking?" and "What would you do next?". Help is given only after the participant asks or is stuck for 3 minutes, and every help event is logged. The moderator never explains a screen before the participant has tried.
- Time-boxed: 45 minutes, tasks in order, no task repeated within a session.

## Tasks

Each task states the goal and what counts as success. Success is judged against the product's actual behaviour, not the moderator's preference.

| # | Task (given to the participant) | Success means |
| --- | --- | --- |
| T1 | "Find out whether this proposal could be sent to a client today, and say why or why not." | Names at least the blocking readiness items and where each is fixed. |
| T2 | "This proposal is about the two brokerage accounts only (Taxable Brokerage and Traditional IRA). Set that up." | Scope is set to those two accounts; the participant can say what the weights now cover and that the other accounts are context. |
| T3 | "Propose selling USD 200,000 of Apple in the taxable account, and keep it unapproved until you decide." | The action has an explicit amount and is not approved; the participant can say where cash goes. |
| T4 | "Approve that change." | Approval is explicit; the participant can say what approval did and did not change (holdings unchanged). |
| T5 | "Get the proposal to a state where you could issue a final PDF." | Readiness clears through the app's own controls (confirm rates and flagged values); the participant understands why each was needed. |
| T6 | "Freeze what you approved, show it to the client on screen, and issue the PDF." | Approves a version, opens the meeting view, issues the final PDF; can explain that later edits will not change that version. |
| T7 | "What does the 'Scripted demo · no model' label mean? Did a model write that answer?" | Understands the answer came from a fixed script and the engines, not a model. |
| T8 | "Does this PDF look like a real client proposal? How do you know?" | Notices the SAMPLE markings and the sample notice. |
| K | **Keyboard-only variant:** repeat T1–T6 without a mouse (a separate session or participant). | Each control reachable and operable; focus always visible; no step needs a pointer. |

## Measures per task

Record exactly these, per participant, per task; leave a field blank if not observed. Do not average across too few participants or turn them into percentages in the write-up.

- **Completion:** unassisted / assisted / not completed.
- **Help events:** count and what was asked.
- **Critical errors:** an action that would mislead a client or change something unintended (for example approving the wrong action, reading context assets as in-scope).
- **Wrong mental model:** a statement that contradicts what the product did (for example "the target already made the trades").
- **Time:** minutes to finish, only for completed tasks; not a target.
- **Comprehension probe (one question, asked after T4, T6 and T7):** a plain-language question with the correct answer written in advance.
- **Comments:** verbatim where consented; otherwise paraphrased.

Accessibility observations (K and any participant using assistive technology): focus visibility, reachability, control names, error and status announcements, colour-only cues, zoom behaviour. Any failure becomes an issue; no conformance level is claimed from a small study.

## Analysis

1. List every critical error, help event and wrong model by task, with the participant's code (P1, P2…), not their identity.
2. Prioritise by severity (blocks the task / misleads / annoys) and by how many participants hit it.
3. File each finding as a GitHub issue with the app commit; fix; re-run the same tasks after the fix.
4. Publish only what the consent allows, labelled with the participant count, the build and its date. Never state or imply a claim the numbers can't carry.

## Known gaps to retest first (from the rehearsal, not participant data)

- Navigation below 768 px ([#92](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/92)): a menu drawer was added after the rehearsal; retest it with participants.
- Skip link and many Tab stops before page content ([#93](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/93)): a skip link was added after the rehearsal; pages still have many Tab stops of their own; retest it.
- The sample notice is absent from PDF continuation pages ([#94](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/issues/94)).

## Out of scope

Invented feedback, automatic outreach, accessibility certification, competitor comparisons or parity claims, recording without consent, any real client data.
