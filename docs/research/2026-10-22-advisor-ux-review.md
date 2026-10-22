> Research snapshot: completed before the owner accepted all 25 recommendations. The original observations below are retained as dated evidence. Current planning/status is in [ROADMAP.md](../../ROADMAP.md); planning acceptance does not mean implementation.

# Atlas: competitor and advisor workflow review
Research checked: 22 October 2026 (UTC). Prepared for Tyler Barnard to select enhancements. No GitHub issues, comments, code, approvals, merges or deployments were changed for this review.

## Product judgment

Continue building Atlas on the existing calculation and data-review foundation. The next investment should make portfolio construction a coherent advisor workflow.

Atlas already demonstrates useful judgment: source reconciliation, explicit missing valuations, currency-aware recommendations, advisor approval and server-side final-document gates. PR #34 adds an important shared-engine recommendation preview. These are foundations worth keeping.

My assessment is that Atlas is not yet as easy to use for an end-to-end reallocation as the strongest workflows documented by CapIntel, Orion, Kwanti, Koyfin, Envestnet and BlackRock. This is an expert assessment of workflow structure, not a measured finding from a comparative advisor usability study. I inspected Atlas directly; competitor evidence is public vendor documentation, training material, product pages and issuer announcements, with different levels of detail.

The central gap is the missing portfolio-construction workspace. Atlas asks an advisor to assemble a portfolio outcome through individual recommendation forms, then find the overall comparison in the document preview. A stronger journey starts with the client's purpose and investable scope, lets the advisor set a target and create funded changes, then carries that same scenario through review and presentation.

PDF remains a useful output. It should be one representation of an approved proposal, alongside a clear on-screen comparison and presentation experience. CapIntel explicitly supports live presentation, links and PDFs; VRGL documents PDF and PowerPoint; eMoney offers interactive plan presentation. There is no evidence here that PDF has become obsolete.

Recommended positioning: an advisor workspace that turns messy, multi-account client data into a funded, explainable proposal with visible sources and human approval. A complete, understandable workflow is more valuable for the portfolio demonstration than attempting the full feature breadth of an institutional platform.

## Scope and evidence

### Atlas inspected

- Current main: `1d6f0c0a67dac79c2a6a3bbe498fba79793a452c`.
- Open PR #34: `b95f6ce30be0ebfe290dea6f687e0fc54b352580`, unmerged at the time of this review. (Later status, 22 October 2026: reviewed, fixed at `c632b13` and merged as `4e6da18`. The rest of this document records the review as it was.)
- All 14 navigation destinations were inspected on the public sample: Dashboard, Client Profile, Import Center, Statement Workbench, Accounts & Assets, Market Data, Insights, Recommendations, Proposal Copilot, Proposal Builder, PDF Preview, Assumptions & Disclosures, Firm & Branding, and Settings.
- The rendered proposal template was inspected directly, including its current/proposed allocation, headline estimates, source tables and implementation text.
- Relevant source was checked for proposal calculations, recommendation forms, imports, store behavior, data-quality checks, insight rules, PDF output and PR #34 preview logic.
- The sample workspace was not reset, imported into, edited, saved or approved. An empty recommendation editor was opened and closed without saving.
- PR #34's deployment requires Vercel sign-in in this browser. Its behavior was assessed from code, PR description and the previously reported validation; its preview UI was not independently exercised in this review.
- This review did not repeat the earlier UBS/LifeView import smoke tests or the automated suite. Prior validation is context, not new test evidence.

### Competitor coverage

This is a broad scan of 17 relevant product families, not a claim to cover every product or private institutional implementation. Proposal and portfolio tools are the main comparators; financial-planning and enterprise-data tools are adjacent benchmarks. Public capability claims do not establish execution quality or ease of use, and were not treated as independently verified performance results. Access, licensing, integrations and firm configuration can change the experience.

| Product family | Publicly documented workflow relevant to Atlas | Design implication |
|---|---|---|
| CapIntel | Interactive portfolio comparisons, product search and model templates; presentations from the comparison workflow; presentation mode, links and PDF. [Sources C1–C2] | Keep portfolio editing, comparison and explanation connected. |
| VRGL | Statement extraction; individual/household current-versus-recommended comparisons; configurable proposal templates and PDF/PowerPoint output. [C3–C4] | Reconciliation should lead into construction and a reusable client story. |
| Investipal | A connected statement → client/risk context → allocation → comparison → proposal/IPS → onboarding journey. [C5] | Organize around the advisor's task, with clear handoffs and context retained. |
| Orion Compare | Integrated portfolio what-ifs, allocation/cash/risk/tax context and saved scenario comparisons. [C6] | Make alternatives visible before approval and maintain a shared workspace. |
| Envestnet / Tamarac | Guided client risk, investment-product selection, account restrictions, fees, proposal generation and signatures; Tamarac integration supports UMA model selection. Full help pages were not accessible, so those details are grounded in indexed official documentation. [C7–C8] | Scope, constraints and implementation belong in the proposal journey. |
| Morningstar Direct Advisory Suite | Connected proposal creation, research and investment planning; the current suite is the next phase of Advisor Workstation. [C9] | Provide research and comparison in the advisor's working context. |
| Nitrogen | Risk assessments, portfolio risk, security discovery, reports and stress/scenario tools. [C10] | Connect client preferences to portfolio choices and distinguish analytical evidence from recommendation prose. |
| YCharts | Model portfolios and analysis; the October 7, 2026 issuer announcement adds connected risk profiles, questionnaires, client management and proposal workflow. [C11–C12] | Keep client context, targets and portfolio comparison together. |
| Kwanti | Portfolio/model comparisons persisted with the portfolio; allocation, expenses and income comparisons use a consistent paired view. [C13] | Comparison should be a working view with stable selections, not only a report page. |
| Koyfin | Connected client portfolios, comparison reports, one-page summaries, configurable proposal inputs and reusable report templates. [C14] | Offer concise outputs and templates; reduce repeated setup. |
| StratiFi | Risk analysis, client profiling, proposal/IPS templates and integrations. [C15] | Explain the reason for a change and connect it to client constraints. |
| BlackRock Aladdin Wealth | Guided/bespoke construction, household/client/account/sleeve scope, real-time policy checks and downstream implementation. [C16] | Explicit scope and constraints are core design concepts, even in a smaller product. |
| InvestCloud Advisor Workspace | Unified client/advisor context, tasks, product discovery, reporting, collaboration and governed journeys. [C17] | Surface work in context rather than adding isolated modules. |
| Addepar Navigator — adjacent | Private-market cash-flow, capital-call, distribution and liquidity scenario modeling. [C18] | Illiquid holdings need different assumptions from readily tradable positions. This is a later benchmark, not immediate feature parity. |
| RightCapital — adjacent | Current versus target allocation for household/account groups, investment holdings filters, concentration and tax allocation views. Its target-allocation comparison is explicitly visual. [C19] | Separate target comparison from calculated security trades; make the scope visible. |
| eMoney Decision Center — adjacent | Interactive scenarios, multiple reports in one workspace and Presentation View for digital plan delivery. [C20–C21] | Let advisors explain changes in one meeting workspace and tailor the presentation. |
| FactSet wealth solutions — adjacent | Broad multi-asset research/data/analytics positioning. Public sources did not establish a detailed proposal-builder click path in this review. [C22] | Useful for data/research context; no claim of verified proposal UX parity. |

The most actionable direct design benchmarks are CapIntel, Orion, Kwanti, Koyfin and Investipal. Aladdin and Envestnet are useful for scope and approval concepts. Addepar and full planning platforms should inform later requirements without pulling Atlas into an unbounded rebuild.

## Concrete findings in Atlas

| Area | Observation | Advisor consequence |
|---|---|---|
| Navigation | Fourteen destinations. Readiness banners explicitly send the advisor to other pages for each fix. | The advisor must learn the application structure to finish one proposal. |
| Portfolio scope | Current “investible” totals include the primary residence and business interest. The sample shows $19.24M against $17.75M net worth. | The denominator for an investment reallocation is not explicit. Whole wealth and investable scope need separate meanings. |
| Construction | Recommendation editing selects an existing holding. The engine applies changes to current holdings; an unlinked recommendation is advisory only. | Buying a new security needs a genuine proposed destination rather than a real holding created to simulate ownership. |
| Fund replacements | The sample recommends replacing Maritime with VOO; the calculation treats this action as allocation-neutral and leaves the original holding unchanged. | A vehicle change needs explicit sell/buy legs, fees and identity changes even if asset-class weights do not move. |
| Action defaults | Without an amount, sell exits a position; reduce and debt paydown can halve it. | A blank field can imply an economic decision the advisor did not specify. |
| Editor | PR #34 already implements precise position/cash preview through the full engine. Its combined-result display is triggered by other approved actions on the same position/account. | Keep and review this work. Extend its placement and cross-account context; do not commission a duplicate preview feature. |
| Holdings page | Fifteen account cards precede value review; a separate all-holdings table follows it. | Repeated information and scrolling compete with the task of comparing or changing positions. |
| Imports | Existing targets and balance-placeholder replacement exist. The store append operation adds incoming accounts/holdings; it is not a statement-version reconciliation flow. | Repeat statements and plans followed by detailed statements need explicit matching and update choices. |
| Workbench | The page promises field mapping/staging, but its source panel largely lists rows/raw text with document-level Verify/Exclude actions. | Advisors cannot repair many extraction exceptions where they encounter them. |
| Data checks | The sample flags three bonds for quantity × price mismatch; the generic validator multiplies without the per-$100 face-value convention. The aggregate quality score is 0 despite 21 of 25 values confirmed. | False alarms and an opaque score compete with actionable issues. |
| Client profile | Risk tolerance, horizon and tax sensitivity are editable. Liquidity/income needs appear in the PDF but are not exposed in the inspected profile form; blank workspaces assign defaults. | Proposal output can look more explicitly discovered than the available form supports. |
| Insights | Fixed thresholds label large private holdings critical; many manual valuations become follow-up items. | Task urgency, investability and client-specific limits need differentiation. |
| Analytics | Holdings have one asset class; currency/country fields are not full underlying-fund economic exposures. The PDF partly discloses this limitation. | The chart should distinguish classification from look-through exposure and show coverage. |
| Fees/income | PDF headline estimates use available expense/yield fields, with a general qualification; they do not provide a full proposed-versus-current cost comparison. | Unknown inputs can be mistaken for a complete economic comparison. |
| Approvals | Approval controls calculation; PDF inclusion controls prose. Status is also editable. | A final review needs to reveal every numerical change and its approval/explanation, even if long prose is omitted. |
| Proposal | Many sections are selected by default. The “Proposed Portfolio” and implementation pages include generic text; overall before/after appears inside the output. | It takes effort to assemble a concise decision narrative and inspect it before rendering a document. |
| Copilot | It has a separate page; initial copy says Claude answers. README distinguishes scripted public demo from live model mode. | Mode should be obvious before the advisor uses it, and help should be contextual to the selected task. |
| Continuity | Browser persistence protects reloads. Starting a new client clears the current engagement; the UI has no client list/backup workflow. | A second-client task creates continuity friction and possible loss of work. |
| Firm setup | Branding is implemented and persists across new clients. Some product copy explains server or image-security implementation details. | Keep branding; simplify the advisor-facing instructions and move technical detail to documentation. |

## Numbered recommendations for selection

Numbers below are stable and match the review list in chat. Priority describes product value, not authorization to implement. Scope estimates are relative: Small, Medium or Large; they are not delivery commitments.

### 1. Add a guided proposal journey
**Priority: high. Scope: Medium. New enhancement.**

Provide Prepare data → Set scope & goals → Design portfolio → Review & approve → Present. Each stage should show its next meaningful action, unresolved blockers and a way back to the working context. Retain direct navigation for experienced users. Move firm setup and provider configuration away from the primary daily path.

Acceptance: an advisor can complete the sample journey without knowing which technical module contains each fix. Returning from an exception restores the portfolio, filters and scenario.

### 2. Make proposal scope explicit
**Priority: highest. Scope: Medium–Large. New enhancement; dependency for #17 model work.**

Let the advisor choose household, selected accounts or a portfolio subset. Distinguish managed, held-away, context-only and restricted assets. Keep net worth separate from assets available for reallocation; label the denominator on each allocation/concentration view. A primary residence can remain in whole-wealth context without silently becoming part of the liquid investment target.

Acceptance: every before/after and target percentage uses the same named scope; excluded holdings and reasons remain visible. A consolidated UBS report must not imply verified account ownership.

### 3. Build a current / proposed / target allocation workspace
**Priority: highest. Scope: Large. Expand existing issue #17.**

Create one main working screen with asset class or holding, current dollars/weight, target, calculated proposed dollars/weight and remaining drift. Provide percent and amount input, clear cash/reserve treatment and a target-total check. Selecting a model supplies targets; it does not claim trades were generated until actual security changes exist.

Acceptance: an illustrative 60/35/5 target can be entered for a selected portfolio, with explicit restrictions and cash. Targets total 100% or explain a deliberate remainder. Draft calculations leave actual holdings untouched.

### 4. Support new investments and linked sell / buy replacements
**Priority: highest. Scope: Large. New enhancement; related to #17 and #14.**

Add proposed-only securities selected from a small, well-defined catalog or explicitly entered as custom investments. A replacement should identify the source, destination, account and funding legs. Do not require the advisor to insert a fake current holding. Differentiate an allocation-neutral vehicle replacement from an advisory suggestion awaiting product selection.

Acceptance: replacing the sample high-fee fund updates the proposed holdings' identities and cash flows, while current holdings remain unchanged. No unexplained source-only “replacement.”

### 5. Let advisors compare draft scenarios before approval
**Priority: high. Scope: Medium–Large. New enhancement; later uses #18 version history.**

Offer Current, Draft A and Draft B with duplicate, rename and undo. Advisors should be able to explore an unapproved scenario as a whole. Approval selects and signs off a reviewed scenario; it should not be necessary merely to inspect its combined allocation.

Acceptance: a lower-turnover and a model-aligned alternative can be compared using the same scope, values and rates, with their assumptions visible.

### 6. Give the advisor control of cash and funding
**Priority: highest for realistic proposals. Scope: Large. New enhancement.**

Show available cash, minimum reserve, source account/currency, required conversions, proposed transfers and unresolved funding. Do not automatically treat every household cash-like slice as freely withdrawable. Respect account ownership and tax/transfer constraints; distinguish an economic cash offset from a feasible transfer or trade instruction.

Acceptance: a debt paydown shows a selectable funding plan and warns when money would leave a retirement, custodial, restricted or unrelated-owner account. No implicit household transfer is presented as ready to execute.

### 7. Simplify recommendation types and require explicit amounts
**Priority: high. Scope: Medium. New enhancement.**

Separate investment changes from service/data tasks. Start with the selected holding and plain actions such as Buy, Sell, Set target or Pay down. Require an amount, target or explicit “Sell all” before a financial action can be approved; remove silent halve-position/halve-debt defaults. Show only fields that matter for that action.

Acceptance: a blank reduce/debt amount cannot become an approved 50% reduction. Unsupported numeric actions are clearly advisory, not disguised as calculated trades.

### 8. Bring PR #34's preview into the holdings workspace
**Priority: high. Scope: Medium after PR #34. Extend existing #33; no duplicate issue.**

Add “Propose a change” directly on a holding. Keep current/proposed/delta, actual cash movement, warnings and scope visible while editing. Preserve the precise shared-engine preview in #34. Surface combined household effects even when the relevant interaction is across accounts rather than another action on the same account.

Acceptance: selecting a position carries it and its account into the editor; a cross-account funding change is visible without opening a PDF.

### 9. Turn imports into a matched update flow
**Priority: high. Scope: Large. New enhancement; complements existing import safeguards.**

Use one Import & review entry point with detected format, client/account matching and explicit Create, Append or Update choices. Show new, changed, unchanged and potentially duplicate positions before committing. Distinguish summary balances from detailed positions and offer to replace the matching placeholder using the existing targeted replacement capability.

Acceptance: importing the same statement twice does not silently double assets. A LifeView balance followed by its brokerage positions does not count both; uncertain matches require a choice.

### 10. Make the Workbench a genuine source-repair tool
**Priority: high. Scope: Medium–Large. New enhancement.**

Show a retained/re-attached source page or precise source excerpt beside editable extracted fields, page references, row classification and reconciliation. Offer a deliberate route to resolve a skipped row or account mapping and re-run the total check. Until implemented, make copy accurately describe the available review actions.

Acceptance: an advisor can repair an ambiguous market-value row and see whether reconciliation clears without manually recreating disconnected holdings. Confirming values alone cannot dismiss an unresolved missing-row discrepancy.

### 11. Replace noisy quality scoring with an actionable exception queue
**Priority: high. Scope: Medium. New enhancement; reuse #19 for bulk date acceptance.**

Lead with reconciled documents, values confirmed, valuation coverage, unresolved blockers and material warnings. Group by issue and show affected accounts/amounts. Explain “confirmed,” “fresh” and “complete” separately. Correct bond price-per-100 validation; avoid an unnormalized aggregate score that collapses to 0 as holdings/flags increase. Preserve safe bulk confirmation rules and Undo where supported.

Acceptance: the three correctly valued sample bonds are not flagged merely for their quoting convention. Adding clean holdings cannot make an otherwise equivalent workspace appear worse solely through count-based penalties.

### 12. Capture goals, liquidity and restrictions where the advisor works
**Priority: high. Scope: Medium. Expand the IPS part of #18.**

Add structured near-term cash needs, reserve, income objective, horizon, tax context, restrictions and assets not to sell. Expose liquidity/income fields already printed in the PDF. Distinguish unassessed answers from confirmed preferences. Separate advisor-private notes from client-visible explanations.

Acceptance: proposal claims about liquidity/income can be traced to explicit advisor input or are labelled unassessed. Constraints feed construction rather than living only in prose.

### 13. Prioritize insights against the client's actual objectives
**Priority: Medium. Scope: Medium. New enhancement.**

Rank actionable items by the selected portfolio, materiality and client limits. A private operating business may need a planning/valuation task rather than a ready-to-trade concentration trim. Provide evidence, threshold and the action's expected contribution. Track dismissed, snoozed, converted and completed items so the same work is not repeatedly proposed.

Acceptance: “Refresh sponsor valuation” is a task with ownership/status; an investment recommendation identifies a concrete change or a missing decision.

### 14. Make classification and look-through coverage explicit
**Priority: high for credible allocation. Scope: Medium initially; Large with external data. New enhancement; related to #11.**

Distinguish holding classification, underlying asset exposure, issuer country and trading denomination. Label mixed funds and unknown balances honestly; permit documented estimates separately from verified detail. Add underlying-fund exposure only where supported by data, with date and coverage.

Acceptance: a target-date fund is not confidently represented as all equity just because the holding has one equity label. A USD-priced international fund is not automatically described as wholly US economic exposure.

### 15. Connect client risk preferences to a transparent portfolio review
**Priority: Medium. Scope: Large. Refine #12; related to #13 and #15.**

Start with documented client preferences, risk capacity, liquidity and simple concentration/asset-mix comparisons. Add quantitative portfolio-risk or scenario measures only with defensible data, methodology, coverage and assumptions. Do not invent a proprietary-looking number from asset weights or imply that a target allocation proves suitability.

Acceptance: the advisor can explain what a measure means, what it excludes and why the proposed portfolio better fits the recorded objective. Fixed shocks are labelled illustrative; they are not described as historical backtests.

### 16. Show current versus proposed costs and income, with coverage
**Priority: high. Scope: Medium–Large. Expand #14.**

Compare fund expenses and advisory fees in annual dollars and rates, with transaction/FX costs where known. Show which portion has known inputs, and distinguish unknown from zero. Explain one-off transition costs separately from recurring savings. Apply equivalent coverage to income estimates.

Acceptance: a high-fee-fund replacement has a reproducible cost comparison; unavailable fees or yields cannot produce an unqualified full-portfolio figure. Benefits are not inferred solely from an action label.

### 17. Add a tax-aware transition review
**Priority: Medium, after construction. Scope: Large. Split the tax part of #18.**

Show account tax category, supplied cost basis, estimated realized gains/losses and unknown inputs. Allow a gain budget and “do not sell” restrictions. Identify dependencies and adviser follow-up; do not describe a market-value-only calculation as tax optimization. Lot selection, wash-sale logic and asset-location optimization are separate, substantial capabilities.

Acceptance: a taxable sale exposes known gain information or explicitly states that cost basis/tax impact is unassessed. A retirement-to-bank funding assumption is never hidden.

### 18. Make valuation and FX refresh a reviewable workflow
**Priority: existing near-term work. Scope: Medium. Continue #26 and #28.**

Finish the already planned FX merge/staleness policy and correct date-only display. Add a review of changed values/rates with source and as-of dates, and explain whether the proposal's economics changed. Preserve manual/fallback provenance. Do not turn demo data into apparently freshly verified provider data.

Acceptance: a partial refresh cannot silently remove a required rate. A stale-rate confirmation expires under the agreed policy and when relevant rates change. Date-only values do not shift with time zone.

### 19. Freeze approved proposal versions and make approvals unambiguous
**Priority: high. Scope: Large. Expand the version-history part of #18.**

A final review should list every economic change, funding leg, unresolved item and its approval. Separate draft saving, advisor approval and client acknowledgement. Capture the input holdings, classifications, rates, assumptions, recommendations and disclosures used for an approved version. Refreshing market data must not rewrite that version silently.

Acceptance: the PDF, on-screen comparison and any later share link identify the same version. Every action included in the numbers has an explanation, even if its long recommendation prose is excluded.

### 20. Offer concise proposal templates and contextual disclosures
**Priority: high for the demonstration. Scope: Medium. New enhancement.**

Offer a short decision brief, a standard investment proposal and a detailed wealth review. Lead with objective, current issue, proposed change, benefits, trade-offs and next steps; keep source detail in accessible appendices. Reuse firm branding and saved section preferences. Suggest applicable disclosure modules based on actual contents while retaining required items and advisor review.

Acceptance: an advisor can prepare a clear short proposal without managing more than twenty section switches. Boilerplate does not imply tax, risk or implementation analysis the system has not performed.

### 21. Add a client presentation view, then versioned sharing
**Priority: Medium. Scope: Medium for local presentation; Large for secure sharing. Expand #16.**

Start with a clean, read-only meeting view of the same scenario: goals, current/proposed, what changes, why, costs, trade-offs and next steps. Preserve PDF export. Later add authenticated or appropriately protected, revocable sharing and acknowledgement tied to a specific approved snapshot. Acknowledgement is not automatically trade authorization.

Acceptance: live presentation and PDF agree on all figures; no client link exposes a changing browser workspace or advisor-private notes.

### 22. Put Copilot in context and identify its mode
**Priority: Medium. Scope: Medium. New enhancement.**

Allow assistance from the selected holding, insight or scenario instead of making chat a separate starting point. Offer focused actions such as “Explain this change” or “Find the funding gap.” Identify scripted demo versus live model before use. Show structured draft changes, tool-derived evidence and the existing numerical preview; keep approval explicit.

Acceptance: no user mistakes a scripted demonstration for live model analysis. Drafts cannot bypass incomplete-import, missing-valuation or approval safeguards.

### 23. Preserve clients and provide backup / restore
**Priority: high for continuity; staged scope. Scope: Small–Medium for export/restore, Large for a client workspace system. New enhancement.**

Add validated engagement export/import with a versioned schema and a visible last-saved indication first. Then provide a client/proposal list with safe switching and archived engagements. Preserve existing browser keys and data during any transition. Keep sample mode easy to identify. For real deployment, secure identity, storage and access are separate prerequisites.

Acceptance: starting a second client does not require losing the first; a saved engagement restores with holdings, links, source metadata and recommendations intact.

### 24. Produce a practical implementation handoff
**Priority: later. Scope: Medium–Large. New enhancement; complements #18.**

Generate an account-level list of proposed trades/transfers, prerequisites, owner and status from approved structured actions. Export a human-reviewable file and distinguish Proposed, Client acknowledged and Completed. Replace generic implementation boilerplate with the actual selected plan where possible.

Acceptance: the handoff reconciles to the approved scenario, identifies unknown settlement/transfer details and cannot be confused with executed trades. Custodian execution is not part of the initial scope.

### 25. Validate usability and accessibility with advisors
**Priority: begin now, repeat after construction changes. Scope: Medium. New validation task, with findings split into fixes.**

Test representative tasks with 3–5 advisors, including an unfamiliar user: import and resolve a mismatch; change allocation while preserving a reserve; compare two scenarios; explain a linked fund replacement; generate a reviewed proposal. Measure time, errors, assistance and comprehension of scope, approval and missing data. Check keyboard operation, focus, field labels, readable precision and status cues beyond color.

Acceptance: establish a baseline before claiming ease-of-use parity. An initial target can be successful unassisted completion of the core task, then set time/error goals from the measured baseline rather than invented competitor timings.

## Recommended sequence

Keep the existing checkpoint intact: review PR #34 first. Preserve the planned #26 FX and #28 date work. The separate naming task #35 remains before LinkedIn publication and must preserve saved data and working links.

For the next coherent product increment, prioritize recommendations **2, 3, 4, 6 and 7**, use **8** to place the preview in the work, and give the journey a simple shell from **1**. The key result is a real funded reallocation, not a larger menu. Recommendations **9–11** harden intake and review; **19–20** make the result reviewable and presentable. These can be staged as small PRs rather than one large refactor.

A focused demonstration: import a synthetic statement, confirm the values, choose an investment-only scope, preserve a cash reserve, select an illustrative target, construct a real sell/buy replacement, compare the funded result, approve a snapshot and present the concise proposal. No investment target in that example is a recommendation for a real client.

Defer a full optimizer, comprehensive tax engine, Monte Carlo planning suite, custodian trading and multiple deep integrations until the core workflow is validated. Choose the data sources and assumptions first if any of those capabilities become a selected priority.

## Existing backlog mapping

| Existing item | Use it for | Related recommendations |
|---|---|---|
| #33 / open PR #34 | Precise live recommendation preview, shared engine | 8; dependency for 3–7 |
| #26 | Partial FX refresh, provenance and stale-rate confirmation | 18 |
| #28 | Date-only rendering | 18 |
| #19 | Safe bulk “Use this date” with Undo | 11 |
| #17 | Model portfolios as target | 2–4 |
| #18 | Currently mixes IPS, tax note and version history; split the selected work for reviewability | 12, 17, 19, 24 |
| #14 | Cost comparison | 16 |
| #12 | Client/portfolio risk | 15 |
| #13 | Stress scenarios; distinguish illustrative shocks from historical modeling | 15 |
| #15 | Projection ranges; only after methodology/data are agreed | 15, later |
| #16 | Client delivery and approved version | 21, dependency on 19 |
| #11 | Estimated balance-only mix, clearly distinguished from detailed positions | 9, 14 |
| #35 | Distinctive naming and staged visible-branding transition | Existing release preparation; not a duplicate enhancement |

## Evidence links

### Atlas
- [Live application](https://atlas-proposal-engine.vercel.app)
- [PR #34](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/pull/34)
- [Current proposal engine](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/blob/1d6f0c0a67dac79c2a6a3bbe498fba79793a452c/src/engines/proposalEngine.ts)
- [Current recommendation form](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/blob/1d6f0c0a67dac79c2a6a3bbe498fba79793a452c/src/app/recommendations/page.tsx)
- [Current statement workbench](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/blob/1d6f0c0a67dac79c2a6a3bbe498fba79793a452c/src/app/statement-workbench/page.tsx)
- [Current PDF import component](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/blob/1d6f0c0a67dac79c2a6a3bbe498fba79793a452c/src/components/import/PdfImport.tsx)
- [Current data-quality checks](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/blob/1d6f0c0a67dac79c2a6a3bbe498fba79793a452c/src/engines/dataQualityEngine.ts)
- [Current insight rules](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/blob/1d6f0c0a67dac79c2a6a3bbe498fba79793a452c/src/engines/insightEngine.ts)
- [Current store and import append](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/blob/1d6f0c0a67dac79c2a6a3bbe498fba79793a452c/src/store/useStore.ts)
- [Current PDF template](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/blob/1d6f0c0a67dac79c2a6a3bbe498fba79793a452c/src/pdf/templates/ProposalPdfTemplate.tsx)
- [PR #34 shared preview engine](https://github.com/tylerbarnard23-PM/atlas-proposal-engine/blob/b95f6ce30be0ebfe290dea6f687e0fc54b352580/src/engines/recommendationPreview.ts)

### Competitors: primary sources
- C1. [CapIntel Comparisons](https://capintel.com/comparisons)
- C2. [CapIntel Presentations](https://www.capintel.com/presentations)
- C3. [VRGL statement extraction](https://www.vrglwealth.com/platform-statement-extraction)
- C4. [VRGL proposal management](https://www.vrglwealth.com/proposal-management)
- C5. [Investipal connected workflow](https://www.investipal.co/how-it-works/)
- C6. [Orion Compare](https://orion.com/lp/no-comparison)
- C7. [Envestnet Proposal tool](https://www.envestnet.com/wealth-management/proposal-tool) — official indexed content; full page unavailable in this research environment.
- C8. [Tamarac UMA proposal settings](https://help.tamaracinc.com/help/content/tamarac_reporting/integrations/envestnet_integrations/proposal_settings_for_tamarac_unified_managed_account__tuma_.htm) — official indexed help; full page unavailable.
- C9. [Morningstar Direct Advisory Suite](https://www.morningstar.com/business/products/direct-advisory-suite)
- C10. [Nitrogen features](https://nitrogenwealth.com/features/)
- C11. [YCharts model portfolios](https://get.ycharts.com/platform/tools/model-portfolios/)
- C12. [YCharts issuer announcement: Risk & Proposal Manager, October 7, 2026](https://www.businesswire.com/news/home/20261007225433/en/YCharts-Launches-Risk-Proposal-Manager-for-Financial-Advisors)
- C13. [Kwanti comparison workflow](https://support.kwanti.com/hc/en-us/articles/31902060249623-Comparisons)
- C14. [Koyfin client proposals](https://www.koyfin.com/features/proposals/)
- C15. [StratiFi proposal and investment-policy tools](https://go.stratifi.com/proposal-investment-policy-software)
- C16. [BlackRock Aladdin Wealth proposal generation](https://www.blackrock.com/aladdin/platforms/solutions/aladdin-wealth/proposal-generation)
- C17. [InvestCloud advisor workspace](https://www.investcloud.com/what-we-do/advisor-client-engagement/advisor-solutions/)
- C18. [Addepar Navigator](https://addepar.com/product-overview/navigator)
- C19. [RightCapital investment module](https://help.rightcapital.com/module-overview/client-portal/investment/investment-module)
- C20. [eMoney Decision Center workspace updates, July 31, 2024](https://emoneyadvisor.com/resources/news/emoney-advisor-enhances-advisor-planning-experience-with-decision-center-updates/)
- C21. [eMoney Presentation View announcement](https://emoneyadvisor.com/resources/news/emoney-advisor-advances-digital-plan-delivery-with-launch-of-presentation-view-in-decision-center/)
- C22. [FactSet wealth solutions](https://www.factset.com/wealth-management-solutions) — indexed product positioning only; detailed proposal interaction not verified.

Product recommendations in this report are design inferences from the evidence and observed Atlas behavior. They are not claims that every competitor has each recommended capability.
