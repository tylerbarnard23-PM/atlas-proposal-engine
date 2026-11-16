# R22 — Embed contextual Copilot with clear demo/live mode

Accepted for planning: 22 October 2026. **Status: Planned; not implemented by this document.** **D4 minimum in review (PR #82):** context-bound Copilot (client, alternative, scope, input revision), scoped simulation through the shared desk evaluator, preview-then-explicit-acceptance of unapproved drafts, labelled demo/test/live modes, bounded orchestration with offline tests and a prepared, unperformed capped live evaluation. Full contextual entry points, additional providers and live evidence remain outstanding.
Tracking issue: #54. Parent roadmap: #36. Original review recommendation: **22 of 25**.
Phase: P4. Relative scope: M; no calendar estimate is committed.
Canonical plan: [R22-contextual-copilot.md](R22-contextual-copilot.md).

## Delivery routing — 24 October 2026

**D4 — minimum slices only.** Follow [DEMO_DELIVERY_PLAN.md](DEMO_DELIVERY_PLAN.md) and [CLAUDE_COMMANDS.md](CLAUDE_COMMANDS.md); their package order supersedes the original phase queue. Minimum scope: One contextual draft-only agent path, offline orchestration tests and opt-in budgeted live evidence. Later scope: Additional providers/models, broad orchestration framework and autonomous workflows. This does not implement or complete the full R-plan. Dependencies below mean the minimum required contract, not every advanced feature of the referenced plan. Preserve all financial, backup and privacy safeguards.


## Advisor problem
Separate chat loses the advisor's selected scope/scenario and initial wording can blur scripted demo versus live model.

## Outcome
Assistance explains or drafts a bounded change using the current context and deterministic engine evidence.

## Advisor workflow
1. Ask from a holding, insight, funding gap or scenario.
2. See the active demo/live mode and the context being used.
3. Review tool-derived values and a structured draft preview, then explicitly save/review it.

## Data and calculation contracts
- Context passes explicit engagement/scope/scenario/revision IDs; stale context is rejected or refreshed visibly.
- Demo mode does not claim a live model response.
- Models may plan/write; engines calculate and tools enforce draft-only authority.
- Untrusted statement text cannot supply instructions, and numerical prose needs evidence or validation rather than prompt-only promises.

## Implementation slices
1. Add a mode indicator before first use and contextual entry points.
2. Extend tools to the shared scoped scenario evaluator and full preview.
3. Return structured proposals, evidence references and unresolved-data notices.
4. Add an explicit review/accept-draft step and preserve rate/turn/draft bounds.

## Acceptance criteria
- [ ] Users can tell scripted versus live mode without inspecting README.
- [ ] A contextual query does not mix another scenario/client's data.
- [ ] Incomplete import, missing valuation or unresolved intent cannot be bypassed to size trades.
- [ ] Copilot cannot approve, finalize, share or execute financial actions.
- [ ] Editing the underlying scenario invalidates a stale draft preview.

## Focused validation
- Tool-contract tests for context/revision mismatch and numerical provenance.
- Demo planner fixtures for partial/unknown data and contextual prompts.
- Browser: mode indicator, draft preview and cancel/save without unintended writes.
For implementation, also follow repository-required typecheck, full tests, extraction eval, production build and a relevant browser check. Do not claim these passed from this planning work.

## Provider support and agent evaluation addition — 22 October 2026

Follow [AGENT_EVALUATION.md](AGENT_EVALUATION.md) as part of R22 / #54. Keep Claude as the first supported live provider behind a small typed adapter; do not require Claude Desktop/Code to install Atlas. Demo mode requires no key. Additional providers are optional, experimental until evaluated, and subject to #59; no paid service or default model change is selected here.

Add offline live-loop tests to normal CI, opt-in bounded paid live-model evaluations, and browser acceptance coverage. Tool/demo/parser tests alone do not establish live-agent quality. Foundation tests can be delivered before the later contextual UI work.

Additional acceptance:
- [ ] Current Anthropic behavior survives the adapter; unsupported provider/model/effort combinations fail clearly, with no silent vendor failover.
- [ ] Requested/actual model, mode, evidence and bounded execution outcomes are visible with privacy-safe observability.
- [ ] Offline tests cover multi-turn tool execution, errors/refusals/truncation, retries/limits, no duplicate drafts and enforced authority.
- [ ] A versioned synthetic live suite measures supported numerical claims, tool selection, task outcomes, injection handling, costs and latency against predefined gates.
- [ ] Browser tests cover evidence → simulation → review/save → advisor approval → matching proposal, cancellation/reload and stale context.
- [ ] Every supported model/provider has its own recorded evaluation evidence; no production-grade claim follows from agent presence alone.

## Approved valuation scope adjustment — 22 October 2026

Follow [VALUATION_SCOPE.md](VALUATION_SCOPE.md) without changing provider/agent authority. Tools consume the accepted source-value/FX revision and explain its dates and gaps. The model cannot invent a price, select a fallback as verified, silently refresh/reprice the baseline or bypass incomplete inputs. Core simulations and supported dollar drafts work without security-quote keys. Add no-quote/quote-failure/mixed-date cases to the existing offline and opt-in synthetic live evaluation plans, preserving draft-only authority and #59.

## Dependencies and sequencing
- **D4 demo slice:** use delivered D1–D3 scope/scenario/snapshot/evaluator contracts and current insight context. A completed R13 personalized-insights system is not required. Full contextual extensions retain the broader dependencies below.
- [R03](R03-allocation-workspace.md)
- [R08](R08-contextual-holding-preview.md)
- [R13](R13-personalized-insights-and-tasks.md)
- [R19](R19-approved-proposal-snapshots.md)
R23a means the export/restore slice of recommendation 23; R23b means its multi-engagement isolation slice. A dependency on another plan means its required contract/slice must exist, not that all later extensions must ship first.

## Likely touchpoints
- `src/app/copilot/page.tsx`
- `src/copilot/tools.ts`
- `src/copilot/demo.ts`
- `src/copilot`
- `src/components/recommendations`
Paths labelled proposed do not exist yet; confirm exact locations against the implementation branch.

## Migration and rollout
Mode and contextual explanation first; live-model numeric validation follows as an explicitly tested capability. Public deployment remains demo-only.

## Success evidence
Mode comprehension, useful accepted drafts and numerical-evidence correctness.
Capture actual evidence in the issue/PR; no usability results are assumed.

## Out of scope / boundary
No public live API key, autonomous approvals or prompt-only numeric safety claim.

All work follows the shared implementation rules in [IMPLEMENTATION_GUIDE.md](IMPLEMENTATION_GUIDE.md). PR #34 stays a separate review checkpoint; no feature is closed by saving this plan.

## Client-data privacy prerequisite

Follow [PII_PROTECTION.md](PII_PROTECTION.md), issue #59, for typed minimum-data projections, source/identity handling, authorization, encrypted persistence/exports, logging and retention. Complete the controls relevant to this slice before real client information is processed; the public demo remains synthetic-only. UI masking or pseudonymous IDs alone do not satisfy the gate. Keep the existing acceptance criteria and shared calculation safeguards.
