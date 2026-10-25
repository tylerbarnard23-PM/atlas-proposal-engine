# Claude Code Desktop command playbook

Approved workflow: 24 October 2026. Use with [DEMO_DELIVERY_PLAN.md](DEMO_DELIVERY_PLAN.md). This file is guidance/templates, not evidence that a command ran. Claude Code Desktop is the developer tool; Atlas's live API configuration remains separate and unchanged.

## Model and effort

Tyler's available development model is **Opus 5.5**; only effort can change. Do not recommend a Sonnet switch or assume a terminal client is required.

| Work | Effort | Guidance |
|---|---|---|
| Domain/financial contracts, migrations, complete snapshot/agent boundary design, difficult defect review | **High** | Use for the first D1 contracts and D2–D4 semantic work. Carry implementation through the same coherent task; do not ask the owner to change effort repeatedly mid-command. |
| Bounded implementation after contracts are established, ordinary UI/integration fixes, approved release verification | **Medium** | Default for subsequent scoped work; raise to High only when the task changes financial meaning or recovery/authority boundaries. |
| Save/checkpoint, status reads, documentation/PR metadata housekeeping | **Low** | One status read, preserve work and stop. No new feature or Auto-fix. |

Effort is a workflow choice, not a promise of token savings or a new app model selection. Keep one writer per branch. A pending CI job is not a reason to start a second unrelated task or poll repeatedly.

## Implementation command contract

Every future implementation prompt names the package/subslice, effort, expected base (verify it), outcome and exclusions. It authorizes routine implementation/UX choices already within the approved plan, but does not authorize merge/deploy, paid evaluation, new vendors, real client data or a new project name unless explicitly stated. Read only the short active handoff, selected package/shared contracts and relevant code; do not load the historical handoff archive unless a specific regression needs it; do not reload every detailed plan or repeat broad competitor research.

Inspect → make a short design/contract note in the issue/implementation PR → implement → focused regression tests → self-review/fix blocking findings together → final typecheck/full tests/eval/build/browser/PDF as applicable → include docs/checkpoint → open/update one PR → report exact evidence. Do not split off design-only or release-checkpoint PRs. A justified domain/migration split is allowed within a package; explain the dependency and keep it the same task, not 25 new prerequisites.

## Next implementation: D1

**Status:** released (PR #72, `0381db1`). D2 is implemented in PR #75, awaiting Codex review; after its owner-authorized release, D3 is next. Kept for reference.

**Opus 5.5 · High effort.** Use after the approved planning change is available in the implementation base; do not implement from the old stand-alone R11-first prompt. If a planning PR is still unmerged, verify it and obtain/execute only an explicitly owner-authorized pinned merge first. Do not silently merge it merely because this template exists.

```text
Build D1 — Working allocation desk from the approved demo-first delivery plan.

Verify actual local/GitHub heads, working tree, stash and existing work. PR #70 already delivered the small R11 cleanup (reviewed at 6449889bfbf9a07ff3a45c8446301e87693a8c4b, merged as 8b06b6a842d8b11adc1b96967c78aee9c0e12a6c); build on it and do not repeat or expand that cleanup in D1. The last verified release was main 8b06b6a842d8b11adc1b96967c78aee9c0e12a6c, PR #70 merged; it is a checkpoint, not permission to overwrite newer commits.

Read the latest handoff, docs/roadmap/DEMO_DELIVERY_PLAN.md (D1 and shared acceptance story), IMPLEMENTATION_GUIDE.md and the minimum relevant R02/R03/R05/R07/R19a contracts. Read other plans only for a touched contract. Do not spend another PR solely on the R11 text/identifier cleanup.

Deliver one usable portfolio-design workspace: selected-account investment scope and context/exclusions; current/proposed/target asset-class grid and drift; one working draft with explicit action membership and intent; contextual edits through the existing shared evaluator/preview; visible actual cash; save/reload and valid backup/restore. Targets alone create no trades. Separate draft preview, approval and prose inclusion. Preserve current holdings and all existing financial gates.

Capture the minimum accepted-value/source-date/FX input-basis record for the draft. Reuse stable IDs/order and preserve legacy effects/evidence. If persisted schema changes, implement a versioned/idempotent migration and supported old-backup upgrade together. Do not build a generic future platform.


Write a short concrete contract/UX note on the implementation issue/PR and proceed within approved scope. One coherent PR is the default; if needed, justify the D1 contracts/backup → workspace split from the plan. Do not stop for another routine design approval or delete existing work.

Use the committed synthetic acceptance story and negative cases. Test financial/state behavior through real engines/store/backup paths, self-review all touched flows and fix blocking findings together. Run the required final typecheck, full tests, eval, build and focused browser check; inspect PDF if output changes. Preserve/restore browser data and stop task servers.

Include the handoff/roadmap progress update in this feature branch. Link the PR to #36 and the relevant R-plan issues as partial scope; close none whose full acceptance is not delivered. Preserve all 25 IDs, PII gates and truthful capability labels.

Stop for Codex review with exact head, checks, preview association, remaining limitations and next command. Do not merge/deploy, add new investments/alternative duplication before D2, retire providers, enable live AI, implement remote sharing or process real client data.
```

## Subsequent package prompts

- **D2 — Opus 5.5 High:** use D1's delivered contracts; implement supported new destination/atomic replacement, explicit eligible funding/reserve enforcement and two independent named alternatives. Avoid a broad catalog, optimizer and unsupported transfer workflows. Stop at one reviewed package/justified split.
- **D3 — Opus 5.5 High:** capture the whole reviewed economic package and use it for local presentation/PDF. Preserve new-final-request server gates and old-version isolation. One template; known/unknown coverage, no remote sharing or financial forecast detour.
- **D4 — Opus 5.5 High:** contextual engine-backed draft agent, real offline orchestration tests and a prepared capped synthetic live runner. No spend without explicit budget, no second provider, no public live key. Report offline/fake/browser/live evidence separately.
- **D5 — Opus 5.5 Medium:** run the complete supported story, critical keyboard/error checks, README/demo narrative and owner-selected screened branding. Preserve links/keys; no fabricated study or production-ready claim. Real advisor recruitment and final name choice are explicit owner activities.

These summaries are expanded into one concrete command when that package becomes next. Do not execute all five from this file or invent evidence for later packages.

## Review-fix command template

Use **Medium** for bounded established behavior, **High** for money, migration or authority findings. Recheck the reviewed head, reproduce each blocking finding first, batch the fixes on the same PR, preserve unrelated work, run changed-path tests while iterating and the full final checks after runtime code settles. Record exact heads and any missing evidence. Stop for review; no unrelated cosmetic expansion or merge.

## Release command template

**Opus 5.5 · Medium.** Only when the owner's command explicitly authorizes that release: verify exact reviewed head, clean state and passing checks; merge pinned; verify main CI and deployment association; smoke the changed flow on synthetic data and preserve browser state. Record actual results on the PR/issue. No feature issue closes for a partial slice, no automatic next package and no separate release-only docs PR. If a connector cannot read a deployment ID, use available GitHub deployment association and live evidence with the limitation stated; don't bypass access controls or invent a preview/build association.

## Save command template

**Opus 5.5 · Low.** When remaining session budget cannot safely cover the next coherent work step, save instead of starting a tiny unrelated task:

```text
Save and stop. Verify branch/tree/stash and actual remote head. Read CI/deployment status once; record pending honestly. Update the current handoff only if needed with package/subslice, exact code/tested/docs heads, actual checks, unresolved findings, server/browser restoration state and the next precise command. Commit/push only owned changes; mark incomplete work WIP or a draft PR, never ready. Preserve unrelated files and the stash; stop task-owned servers. No reset/clean, Auto-fix, new implementation, merge, deployment or model/provider change. Do not rerun the whole app suite solely for checkpoint docs or create a new checkpoint PR.
```

This approved cadence supersedes earlier prompts that made every small cleanup or repeated planning/release note a new prerequisite. Financial correctness, safe migrations, privacy, meaningful checks and owner merge authority remain unchanged.
