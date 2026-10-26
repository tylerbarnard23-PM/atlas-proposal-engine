# Contract impact checklist

Use this for any change to financial calculation, persisted state, backups, readiness, approval or the Copilot snapshot. It is a review aid, not a test quota: record only what the change actually touches, and justify each "not applicable".

## Before editing: the impact note
Put a short note in the implementation PR or issue before the first edit. For each row below, write **affected** (with the paths), **evidence** (the behavior you will show), or **N/A** (with a one-line reason). A row left blank is a finding.

## Consumers to check
| Area | What to confirm | Existing tests to extend |
|---|---|---|
| Engine and ordering | Calculations, action order, atomic units, no silent fallback, no invented proceeds | `engines`, `proposalCurrency`, `fundedAlternatives` |
| Desk and previews | Desk, contextual preview and Recommendations preview agree with the saved result; a blocked action is reported as such | `allocationDesk`, `recommendationPreview` |
| Store paths | Save, approve, reject, reopen, undo, delete; cancelling leaves no change; current holdings never mutate | `allocationDesk`, `fundedAlternatives`, `backupConsistency` |
| Readiness | Browser hooks, dashboard, PDF preview, builder and the **final-PDF route** share one evaluation and receive the same inputs | `valuationFx`, `fxPolicy`, `fundedAlternatives` |
| Copilot | Snapshot schema, tool inputs and outputs carry the new fields; demo mode needs no key | `copilot` |
| Backups | Schema (strict and export allow-list), every supported older version's upgrade, restore, reload; export refuses data restore would reject | `workspaceBackup`, `backupConsistency` |
| Transitions | Delete, reclassify or change currency of a referenced holding or account: the reference is kept, declared as unresolved, blocks readiness and is recoverable; nothing is erased, redirected or re-approved | `backupConsistency` |
| Alternatives | Isolation between alternatives, cloned IDs, mixed approvals blocked | `fundedAlternatives` |
| Money semantics | Currency basis, valuation dates, explicit unknowns, funding and reserve behavior, no conversion by relabelling | `fundedAlternatives`, `valuationFx` |
| Privacy and authority | Synthetic data only, no new service, key or provider, advisor authority unchanged | see CLAUDE.md |

## Evidence rules
- Prefer behavior through real engines, store actions and backup paths over tests that mirror the implementation.
- When a persisted shape changes, ship the migration and every supported backup upgrade together, and test export, restore and reload through the real paths.
- A version, key-list or test-count assertion that changes because of the contract is an intended update; say so in the PR.

## Cadence
1. **While iterating:** run focused, meaningful checks for the paths you changed.
2. **Self-review:** walk the table above for every consumer you found, and fix the blockers together instead of one at a time.
3. **After the runtime code settles:** run the required final typecheck, full tests, extraction eval and build (see [CLAUDE.md](../CLAUDE.md)).
4. **Browser or PDF checks:** only where the change is visible. Use an isolated origin and synthetic data, and restore any saved workspace.
5. **CI** stays automatic on every push. There is no full-suite hook and no new test framework.
