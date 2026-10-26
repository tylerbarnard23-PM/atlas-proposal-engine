# Atlas Proposal Engine: Claude entry point

Atlas is a synthetic-data wealth-proposal demo (Next.js, TypeScript, Zustand, Vitest). This file is the short start page; the linked documents are the maintained instructions. Do not copy their policies here.

## Start here
- Read [docs/CLAUDE_HANDOFF.md](docs/CLAUDE_HANDOFF.md) first: it holds the current checkpoint, open follow-ups and the next task.
- Then read only the selected delivery package in [docs/roadmap/DEMO_DELIVERY_PLAN.md](docs/roadmap/DEMO_DELIVERY_PLAN.md), the matching command in [docs/roadmap/CLAUDE_COMMANDS.md](docs/roadmap/CLAUDE_COMMANDS.md), and the contracts the task touches.
- Do not load the history archive (`docs/CLAUDE_HANDOFF_HISTORY_*.md`) or all 25 plans. [ROADMAP.md](ROADMAP.md) links them for lookup when a contract needs it.
- Verify the actual local and GitHub heads, working tree and stash before acting. Command packages marked historical are not to be rerun.

## Where things are
- `src/engines/`: calculations and shared rules (`proposalEngine` applies actions, `allocationDesk` the desk and drafts, `complianceEngine` readiness, `workspaceBackup` backups, `recommendationLinks` unresolved references).
- `src/store/useStore.ts`: persisted Zustand state, its version and migrations. `src/domain/types.ts`: shared types.
- `src/app/`: pages and API routes (the final-PDF route is under `api/proposals`). `src/copilot/`: Copilot snapshot, tools and demo mode. `src/pdf/`: PDF templates.
- `tests/`: Vitest suites by area. `tests/fixtures/private/` is git-ignored.

## Financial and state integrity
- Use the one shared evaluator and engines in `src/engines/`. Do not add a second calculation path in a page, hook, route or the Copilot.
- Current holdings are observed data. Drafts, approvals and PDF prose are separate. Preserve source, currency and date integrity, FX handling and every readiness gate, in the browser and in the final-PDF route.
- Before changing a financial or persisted contract, follow [docs/CONTRACT_IMPACT_CHECKLIST.md](docs/CONTRACT_IMPACT_CHECKLIST.md): write the impact note first and cover each consumer.
- Public mode is scripted and synthetic. No real client data, live AI key, provider or model change, or paid call without an explicit owner instruction. See [docs/roadmap/PII_PROTECTION.md](docs/roadmap/PII_PROTECTION.md) and [docs/roadmap/AGENT_EVALUATION.md](docs/roadmap/AGENT_EVALUATION.md).
- Licensing: see [LICENSING.md](LICENSING.md). Make no ownership or legal-clearance claim.

## Working rules
- One writer per branch. Preserve unrelated work, the stash and the user's browser data. Never reset, clean or delete branches. Third-party and private files stay out of Git.
- Iterate with focused checks. Self-review every consumer, batch the blockers, then run the required final checks once the runtime code has settled (see below).
- Merge and deploy only when the owner explicitly authorizes it, pinned to the reviewed head (`gh pr merge N --merge --match-head-commit SHA`). Record releases on the PR and issue, not in a release-only docs PR.
- Keep the handoff current but short; move superseded notes to a history file.

## Commands
- Typecheck: `npm run typecheck`
- Tests: `TZ=UTC npx vitest run` (focused: `TZ=UTC npx vitest run tests/<file>`)
- Extraction eval: `TZ=UTC npm run eval`
- Build: `npm run build`
- Required before review: typecheck, full tests, eval and build, plus browser or PDF checks only where the change is visible. CI repeats them on every push; do not poll it.

## Local gotchas
- `.claude/` is excluded from Git (machine-local `launch.json`). Use isolated `*.localhost` origins for browser mutation tests so saved workspaces are never touched.
- Some files use CRLF. Edit with tools that preserve line endings, and prefer a script file over shell heredocs when text contains apostrophes.
- The two private-PDF tests skip in CI. Report passed and skipped counts separately, and local versus CI.
