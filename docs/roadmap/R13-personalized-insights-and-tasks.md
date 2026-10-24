# R13 — Prioritize insights and track advisory follow-up tasks

Accepted for planning: 22 October 2026. **Status: Planned; not implemented by this document.**
Tracking issue: #48. Parent roadmap: #36. Original review recommendation: **13 of 25**.
Phase: P3. Relative scope: M; no calendar estimate is committed.
Canonical plan: [R13-personalized-insights-and-tasks.md](R13-personalized-insights-and-tasks.md).

## Delivery routing — 24 October 2026

**After the demo milestone.** Follow [DEMO_DELIVERY_PLAN.md](DEMO_DELIVERY_PLAN.md) and [CLAUDE_COMMANDS.md](CLAUDE_COMMANDS.md); their package order supersedes the original phase queue. Minimum scope: Reuse current insights as context without claiming personalized prioritization. Later scope: Personalized ranking, dismissal logic and advisory follow-up/task lifecycle. This does not implement or complete the full R-plan. Dependencies below mean the minimum required contract, not every advanced feature of the referenced plan. Preserve all financial, backup and privacy safeguards.


## Advisor problem
Fixed thresholds and repeated manual-valuation notices mix investment opportunities with service/data work.

## Outcome
Advisors can identify the next useful action for this client's scope and avoid duplicate follow-ups.

## Advisor workflow
1. View insights ranked by materiality, scope, client constraint and actionability.
2. Inspect the calculation, threshold and relevant source before creating a draft or task.
3. Assign, snooze, dismiss with reason or complete the work; revisit when evidence changes.

## Data and calculation contracts
- Stable insight identity separates the underlying rule/subject from changing title or percentage.
- Task owner/status/due date are distinct from recommendation approval.
- Thresholds have explicit policy defaults and client overrides; severity is not a trading instruction.
- Previously resolved items resurface only under defined evidence-change rules.

## Implementation slices
1. Separate data tasks, planning follow-ups and investment findings in the shared insight service.
2. Use scoped denominators and client limits; expose rationale and thresholds.
3. Persist lifecycle and link a converted recommendation/task to its originating finding.
4. Add an ordered work queue with materiality and dependency context.

## Acceptance criteria
- [ ] A private business can produce a planning/valuation task without an automatic trim.
- [ ] A dismissed unchanged insight does not generate duplicate work on every refresh.
- [ ] Unvalued relevant holdings pause unsupported portfolio conclusions.
- [ ] An advisor can trace a draft to the rule and data that produced it.
- [ ] Completing a task cannot mark a financial action implemented or approved.

## Focused validation
- Rules: scoped concentration, unknown inputs and policy overrides.
- Lifecycle: snooze expiry, changed evidence and duplicate conversion.
- Browser: convert/edit/return and task completion.
For implementation, also follow repository-required typecheck, full tests, extraction eval, production build and a relevant browser check. Do not claim these passed from this planning work.

## Dependencies and sequencing
- [R02](R02-proposal-scope.md)
- [R07](R07-explicit-recommendation-intent.md)
- [R11](R11-data-quality-exception-queue.md)
- [R12](R12-client-objectives-and-constraints.md)
R23a means the export/restore slice of recommendation 23; R23b means its multi-engagement isolation slice. A dependency on another plan means its required contract/slice must exist, not that all later extensions must ship first.

## Likely touchpoints
- `src/engines/insightEngine.ts`
- `src/engines/dataTasks.ts`
- `src/app/insights/page.tsx`
- `src/store/useStore.ts`
- `src/copilot/demo.ts`
Paths labelled proposed do not exist yet; confirm exact locations against the implementation branch.

## Migration and rollout
Retain current thresholds as labelled defaults, then introduce client overrides and lifecycle without silently dismissing prior items.

## Success evidence
Useful-action selection, duplicate follow-ups and advisor dismissal reasons.
Capture actual evidence in the issue/PR; no usability results are assumed.

## Out of scope / boundary
No autonomous advice or unsourced ranking claims.

All work follows the shared implementation rules in [IMPLEMENTATION_GUIDE.md](IMPLEMENTATION_GUIDE.md). PR #34 stays a separate review checkpoint; no feature is closed by saving this plan.
