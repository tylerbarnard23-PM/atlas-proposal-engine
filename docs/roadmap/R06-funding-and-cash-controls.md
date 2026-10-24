# R06 — Make cash reserves, funding sources and transfers explicit

Accepted for planning: 22 October 2026. **Status: Planned; not implemented by this document.**
Tracking issue: #41. Parent roadmap: #36. Original review recommendation: **6 of 25**.
Phase: P2. Relative scope: L; no calendar estimate is committed.
Canonical plan: [R06-funding-and-cash-controls.md](R06-funding-and-cash-controls.md).

## Delivery routing — 24 October 2026

**D1/D2 — minimum slices only.** Follow [DEMO_DELIVERY_PLAN.md](DEMO_DELIVERY_PLAN.md) and [CLAUDE_COMMANDS.md](CLAUDE_COMMANDS.md); their package order supersedes the original phase queue. Minimum scope: Visible account cash first; explicit eligible cash source and enforced reserve for supported replacements. Later scope: New cross-account/owner/currency transfer workflows and arbitrary external flows. This does not implement or complete the full R-plan. Dependencies below mean the minimum required contract, not every advanced feature of the referenced plan. Preserve all financial, backup and privacy safeguards.


## Advisor problem
The existing engine draws household cash largest-first and posts to the first cash line, without advisor-selected ownership or transfer constraints.

## Outcome
Every proposed purchase/paydown has a visible, feasible funding explanation.

## Advisor workflow
1. Set reserve by account/currency and identify which cash lines are actually available.
2. Choose proceeds, account cash, explicit transfer or an unconfirmed external contribution as funding.
3. Review a funding ledger and shortfalls before including actions in a final scenario.

## Data and calculation contracts
- Funding ledger records source/destination account, owner, currency, amount, conversion and prerequisite.
- Cash-like fund slices and balance-only reports are not automatically withdrawable cash.
- Do not net unrelated owners/accounts as if a transfer occurred; restricted/unknown transfers remain unresolved.
- An external contribution is an explicit flow affecting totals, never an automatic balancing entry.

## Implementation slices
1. Add account availability, reserve and transfer eligibility metadata with conservative unknown states.
2. Refactor cash selection to accept explicit instructions while retaining tested FX/valuation rules.
3. Evaluate action groups and the full scenario together, avoiding isolated false shortfalls when an included sale funds a buy.
4. Show ledger, source choice, residual reserve and required transfer/FX steps.

## Acceptance criteria
- [ ] A retirement/custodial/unknown-owner account cannot silently fund an unrelated mortgage.
- [ ] A reserve remains after proposed debits or a specific shortfall blocks the relevant final output.
- [ ] Multiple cash lines debit the selected available source, not arbitrary first-row order.
- [ ] Every sale/buy/paydown and explicit contribution reconciles in reporting and native currency.
- [ ] All shared previews and PDF use the same ledger.

## Focused validation
- Engine integration: linked sale/buy, multi-cash accounts, ownership mismatch, reserve, shortfall, FX and approved cash valuations.
- Property checks for conservation excluding declared external flows.
- Browser: choose source, change reserve, inspect infeasible transfer.
For implementation, also follow repository-required typecheck, full tests, extraction eval, production build and a relevant browser check. Do not claim these passed from this planning work.

## Dependencies and sequencing
- [R02](R02-proposal-scope.md)
- [R05](R05-draft-scenarios.md)
- [R12](R12-client-objectives-and-constraints.md)
R23a means the export/restore slice of recommendation 23; R23b means its multi-engagement isolation slice. A dependency on another plan means its required contract/slice must exist, not that all later extensions must ship first.

## Likely touchpoints
- `src/domain/types.ts`
- `src/engines/proposalEngine.ts`
- `src/engines/recommendationPreview.ts (PR #34)`
- `src/engines/complianceEngine.ts`
- `src/app/recommendations/page.tsx`
Paths labelled proposed do not exist yet; confirm exact locations against the implementation branch.

## Migration and rollout
Migrate legacy automatic funding to a visible plan requiring review before new final approvals; preserve historical values as historical.

## Success evidence
Advisors identify where money comes from and which actions cannot yet be funded.
Capture actual evidence in the issue/PR; no usability results are assumed.

## Out of scope / boundary
No claim that a transfer is legal, tax-free, settled or executed.

All work follows the shared implementation rules in [IMPLEMENTATION_GUIDE.md](IMPLEMENTATION_GUIDE.md). PR #34 stays a separate review checkpoint; no feature is closed by saving this plan.
