import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import type { Recommendation } from "@/domain/types";
import { runScripted, scripted } from "./support/allocationFixture";

// #119 — Prepare allocation proposal. Through the real store, route handler,
// agent loop (the labelled test provider, not a model), tools, engines, backup
// and template. Fictional data only; no key, no provider call. A scripted
// plan proves the workflow and the math, not the quality of Claude's analysis.

vi.mock("zustand", async (orig) => ({ ...(await orig<typeof import("zustand")>()), create: (await import("./support/liveStore")).liveCreate }));

const storage = vi.hoisted(() => {
  const data = new Map<string, string>();
  const s = {
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() {
      return data.size;
    },
  };
  (globalThis as { window?: unknown }).window = { localStorage: s, location: { search: "" } };
  return s;
});

const NOW = new Date("2026-11-27T12:00:00Z");
const ACC = "acc_alloc_taxable";
const EQUITY = "h_alloc_equity_fund";
const BONDS = "h_alloc_core_bond_fund";
const CASH = "h_alloc_cash";

async function load() {
  return {
    ...(await import("react-dom/server")),
    ...(await import("@/store/useStore")),
    ...(await import("@/domain/disclosureLibrary")),
    ...(await import("@/engines/normalizationEngine")),
    ...(await import("@/engines/allocationProposal")),
    ...(await import("@/engines/workspaceBackup")),
    ...(await import("@/engines/approvedSnapshot")),
    ...(await import("@/engines/importCompleteness")),
    ...(await import("@/copilot/agent")),
    ...(await import("@/copilot/context")),
    ...(await import("@/copilot/testProvider")),
    ...(await import("@/copilot/routeHandler")),
    ...(await import("@/copilot/tools")),
    ...(await import("@/pdf/templates/ProposalPdfTemplate")),
  };
}
type M = Awaited<ReturnType<typeof load>>;
const store = (m: M) => m.useAtlasStore.getState();

beforeEach(() => {
  vi.resetModules();
  storage.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

const CREATED = "2026-10-01T12:00:00Z";
const holding = (id: string, assetName: string, assetClass: "equity" | "fixed_income" | "cash", value: number) => ({
  id,
  accountId: ACC,
  assetName,
  assetClass,
  assetType: assetClass === "cash" ? "cash" : "etf",
  currency: "USD",
  country: "US",
  nativeMarketValue: value,
  valuationDate: "2026-10-31",
  valuationSource: { kind: "statement", asOf: "2026-10-31", confidence: "high", note: "Fictional allocation-proposal fixture" },
  quoteType: "manual",
  priceFreshness: "manual",
  advisorVerification: "advisor_reviewed",
  liquidity: assetClass === "cash" ? "cash" : "daily",
  dataQuality: [],
  createdAt: CREATED,
  updatedAt: CREATED,
});

type Brief = "cash_and_caution" | "growth";

/** The design brief's fictional taxable account: USD 500,000 (equity fund 70%, core bond fund 25%, cash 5%), in scope. */
function portfolio(m: M, brief: Brief, edit?: (s: ReturnType<typeof store>) => void) {
  store(m).startNewClient();
  m.useAtlasStore.setState({
    client: { ...store(m).client, fullName: "Fictional Allocation Client", proposalOutputCurrency: "USD" },
    accounts: [{ id: ACC, name: "Fictional Taxable Account", type: "brokerage", baseCurrency: "USD", country: "US", asOf: "2026-10-31", createdAt: CREATED, updatedAt: CREATED }],
    holdings: [holding(EQUITY, "Fictional Equity Fund", "equity", 350_000), holding(BONDS, "Fictional Core Bond Fund", "fixed_income", 125_000), holding(CASH, "Cash", "cash", 25_000)] as never,
    recommendations: [],
    fxRates: [],
  });
  store(m).setDraftScope([ACC]);
  const s = store(m);
  if (brief === "cash_and_caution") {
    s.setDiscoveryAnswer("objectives", { primary: "preserve_wealth", secondary: [] });
    s.setDiscoveryAnswer("timeHorizon", { years: 10 });
    s.setDiscoveryAnswer("liquidity", { need: "planned", amount: 50_000, currency: "USD", timing: "within_1_year" });
    s.setDiscoveryAnswer("lossWillingness", { level: "moderate" });
    s.setDiscoveryAnswer("lossAbility", { level: "moderate" });
  } else {
    s.setDiscoveryAnswer("objectives", { primary: "grow_wealth", secondary: [] });
    s.setDiscoveryAnswer("timeHorizon", { years: 20 });
    s.setDiscoveryAnswer("liquidity", { need: "none" });
    s.setDiscoveryAnswer("lossWillingness", { level: "high" });
    s.setDiscoveryAnswer("lossAbility", { level: "high" });
  }
  s.setDiscoveryAnswer("income", { need: "none" });
  s.setDiscoveryAnswer("taxSensitivity", { level: "moderate" });
  s.setDiscoveryAnswer("securitiesToRetain", { securities: [] });
  s.setDiscoveryAnswer("restrictedInvestments", { securities: [] });
  s.setDiscoveryAnswer("otherConstraints", { text: "" });
  edit?.(store(m));
  store(m).recordDiscoveryReview();
}

const request = (m: M) => {
  const s = store(m);
  const snapshot = { ...s, sourceDocuments: s.sourceDocuments.map(m.forReadiness) };
  return { question: "Prepare allocation proposal", runAs: "test_provider", task: "allocation_proposal", snapshot, context: m.agentContextOf(snapshot) };
};
async function prepare(m: M) {
  const res = await m.handleCopilotPost(new Request("http://127.0.0.1:3000/api/copilot", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request(m)) }), { ...m.defaultDeps(), env: { COPILOT_MODE: "test" } } as never);
  const body = await res.json();
  if (res.status !== 200) throw new Error(`${res.status}: ${body.error}`);
  return body as import("@/copilot/agent").CopilotResult & { allocation: import("@/copilot/tools").AllocationRunView };
}

const inputs = (m: M) => {
  const s = store(m);
  return { holdings: m.normalizeHoldings(s.holdings, s.fxRates, "USD"), accounts: s.accounts, recommendations: s.recommendations, draft: s.workingDraft, fx: { reportingCurrency: "USD", rates: s.fxRates }, client: s.client };
};
const legsOf = (r: { drafts: Recommendation[]; allocation: import("@/copilot/tools").AllocationRunView }, gi: number) => r.drafts.filter((d) => r.allocation.groups[gi].legIds.includes(d.id));
const row = (rows: import("@/engines/allocationProposal").MixRow[], c: string) => rows.find((x) => x.assetClass === c)!;

describe("#119 the same positions, two briefs", () => {
  it("a cash need and a cautious brief: raise cash to 10% and lower equities to 60%, with two funded groups (the brief's page 1)", async () => {
    const m = await load();
    portfolio(m, "cash_and_caution");
    const r = await prepare(m);
    expect(r.mode).toBe("test");
    expect(r.task).toBe("allocation_proposal");
    expect(r.provider?.promptVersion).toBe("claude-led-2026-11-21+allocation-task-2026-11-27"); // the system prompt is unchanged; the task's instruction is recorded
    const a = r.allocation;
    expect(a.outcome).toBe("propose");
    expect(a.headline).toBe("Raise cash to 10% and lower equities to 60%");
    expect(a.scopeTotal).toBe(500_000);
    expect(a.currentWeights).toEqual([{ assetClass: "equity", pct: 70 }, { assetClass: "fixed_income", pct: 25 }, { assetClass: "cash", pct: 5 }]);
    expect(a.proposedWeights).toEqual([{ assetClass: "equity", pct: 60 }, { assetClass: "fixed_income", pct: 30 }, { assetClass: "cash", pct: 10 }]);
    expect(a.objectiveRefs).toEqual(["liquidity", "lossWillingness", "objectives"]);
    expect(a.alternative?.weights).toEqual([{ assetClass: "equity", pct: 65 }, { assetClass: "fixed_income", pct: 25 }, { assetClass: "cash", pct: 10 }]);
    expect(a.groups.map((g) => [g.title, g.problem])).toEqual([
      ["Raise cash from the existing equity fund", null],
      ["Shift from equities into the existing bond fund", null],
    ]);
    // Group 2's sale and purchase are one funded unit.
    const g2 = legsOf(r, 1);
    expect(g2.map((l) => [l.type, l.relatedHoldingId, l.actionAmount])).toEqual([["reduce", EQUITY, 25_000], ["increase", BONDS, 25_000]]);
    expect(new Set(g2.map((l) => l.linked?.groupId)).size).toBe(1);
    // The strategy record: advisory, the AI's weights labelled as its judgment, never written to the desk targets.
    const strategy = r.drafts.find((d) => d.id === a.strategyDraftId)!;
    expect(strategy.type).toBe("rebalance");
    expect(strategy.relatedHoldingId).toBeUndefined();
    expect(strategy.allocationStrategy?.proposedWeights).toEqual(a.proposedWeights);
    expect(store(m).workingDraft.targets).toEqual({});
    // A preview: nothing was saved, nothing is approved.
    expect(store(m).recommendations).toEqual([]);
    for (const d of r.drafts) expect([d.approvedByAdvisor, d.includeInPdf, d.origin]).toEqual([false, false, { kind: "example", source: "test_provider" }]);
  });

  it("the engine's result for what the advisor selects: both groups give 60/30/10; the cash group alone gives 65/25/10 and shows bonds 5 points short (the brief's page 2)", async () => {
    const m = await load();
    portfolio(m, "cash_and_caution");
    const r = await prepare(m);
    const proposed = r.allocation.proposedWeights;
    const both = m.evaluateSelection(inputs(m), [...legsOf(r, 0), ...legsOf(r, 1)], proposed);
    expect(both.problems).toEqual([]);
    expect([row(both.rows, "equity").resultPct, row(both.rows, "fixed_income").resultPct, row(both.rows, "cash").resultPct]).toEqual([60, 30, 10]);
    expect(both.rows.every((x) => x.gapPts === 0)).toBe(true);
    const cashOnly = m.evaluateSelection(inputs(m), legsOf(r, 0), proposed);
    expect([row(cashOnly.rows, "equity").resultPct, row(cashOnly.rows, "fixed_income").resultPct, row(cashOnly.rows, "cash").resultPct]).toEqual([65, 25, 10]);
    expect([row(cashOnly.rows, "fixed_income").gapPts, row(cashOnly.rows, "fixed_income").gapAmount]).toEqual([5, 25_000]);
    expect(row(cashOnly.rows, "fixed_income").noEligibleCandidate).toBe(false); // the existing bond fund could take it
    const nothing = m.evaluateSelection(inputs(m), [], proposed);
    expect([row(nothing.rows, "cash").resultPct, row(nothing.rows, "cash").gapAmount]).toEqual([5, 25_000]);
    expect(nothing.totals).toEqual({ current: 500_000, result: 500_000 });
  });

  it("a growth brief that accepts the current risk and needs no cash: a justified hold, no trade", async () => {
    const m = await load();
    portfolio(m, "growth");
    const r = await prepare(m);
    expect(r.allocation.outcome).toBe("maintain");
    expect(r.allocation.headline).toBe("Keep the current mix");
    expect(r.allocation.groups).toEqual([]);
    expect(r.allocation.proposedWeights).toEqual(r.allocation.currentWeights);
    expect(r.drafts).toHaveLength(1);
    const hold = r.drafts[0];
    expect([hold.type, hold.relatedHoldingId, hold.actionAmount, hold.allocationStrategy?.outcome]).toEqual(["hold", undefined, undefined, "maintain"]);
    expect(hold.rationale).toMatch(/No trade is proposed/);
  });
});

describe("#119 who answers", () => {
  it("the scripted demo never stands in for the allocation task: refused before anything runs", async () => {
    const m = await load();
    portfolio(m, "cash_and_caution");
    const body = { ...request(m), runAs: "scripted_example" };
    const res = await m.handleCopilotPost(new Request("http://127.0.0.1:3000/api/copilot", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), { ...m.defaultDeps(), env: { COPILOT_MODE: "demo" } } as never);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("task_unavailable");
  });
});

describe("#119 material information missing", () => {
  it("an ability to absorb losses that wasn't discussed leads to a specific question: no weights, no drafts", async () => {
    const m = await load();
    portfolio(m, "cash_and_caution", (s) => s.setDiscoveryNotDiscussed("lossAbility"));
    const r = await prepare(m);
    expect(r.allocation.outcome).toBe("ask");
    expect(r.allocation.question?.text).toMatch(/Ability to absorb losses/);
    expect(r.allocation.question?.decides).toBeTruthy();
    expect(r.allocation.proposedWeights).toBeNull();
    expect(r.drafts).toEqual([]);
    expect(r.allocation.briefIssues).toContain("Ability to absorb losses: not discussed.");
  });

  it("conflicting risk instructions lead to a question; the engine refuses a mix even if one is offered", async () => {
    const m = await load();
    portfolio(m, "growth", (s) => s.setDiscoveryAnswer("lossAbility", { level: "low" }));
    const r = await prepare(m);
    expect(r.allocation.outcome).toBe("ask");
    expect(r.allocation.question?.text).toMatch(/ability to absorb losses is recorded as low/);
    // The engine-level guard, whatever a model would return (the inputs read first, the decision on a later turn).
    const offered = { outcome: "maintain_current_mix", headline: "Keep the mix", rationale: "The client accepts the current risk.", client_basis: [{ question: "lossWillingness", supports: "The client accepts large losses, which the current mix carries." }] };
    const g = await runScripted(m as never, scripted(m as never, [() => READ, () => ({ tools: [{ name: "propose_allocation", input: offered }] }), () => ({ text: "Done." })]));
    expect(g.trace[2]).toMatchObject({ name: "propose_allocation", ok: false });
    expect(g.trace[2].summary).toMatch(/doesn't support a personalized decision yet/); // the trace keeps the first 200 characters
    expect(g.drafts).toEqual([]);
  });
});

const READ = { tools: [{ name: "get_portfolio_overview", input: {} }, { name: "get_scope_overview", input: {} }] };
const decideWith = (m: M, decision: object) => runScripted(m as never, scripted(m as never, [() => READ, () => ({ tools: [{ name: "propose_allocation", input: decision }] }), () => ({ text: "Decision returned." })]));
const BASIS = [{ question: "liquidity", supports: "Fictional check of the engine's rules: the planned withdrawal is the basis." }];

describe("#119 funding and eligibility", () => {
  it("a restricted bond fund: the bond group is refused with its reason, the cash group still works, and bonds show the gap with no eligible candidate", async () => {
    const m = await load();
    portfolio(m, "cash_and_caution", (s) => s.setDiscoveryAnswer("restrictedInvestments", { securities: ["Fictional Core Bond Fund"] }));
    const r = await prepare(m);
    const [cash, bonds] = r.allocation.groups;
    expect(cash.problem).toBeNull();
    expect(bonds.problem).toBe("Fictional Core Bond Fund is a restricted investment for this client, so it can't be bought.");
    expect(bonds.legIds).toEqual([]);
    expect(r.drafts.some((d) => d.relatedHoldingId === BONDS)).toBe(false);
    const sel = m.evaluateSelection(inputs(m), legsOf(r, 0), r.allocation.proposedWeights);
    const b = row(sel.rows, "fixed_income");
    expect([b.resultPct, b.gapPts, b.noEligibleCandidate]).toEqual([25, 5, true]);
  });

  it("two purchases that would spend the same cash: each works alone, together they are refused (no double counting)", async () => {
    const m = await load();
    portfolio(m, "cash_and_caution");
    const r = (await decideWith(m, {
      outcome: "propose_changes",
      headline: "Spend the cash on both funds",
      rationale: "Fictional check of funding: both purchases draw on the same cash.",
      client_basis: BASIS,
      proposed_weights: [{ asset_class: "equity", pct: 74 }, { asset_class: "fixed_income", pct: 26 }, { asset_class: "cash", pct: 0 }],
      alternative: { summary: "Buy only one fund." },
      groups: [
        { title: "Buy more of the equity fund from cash", rationale: "From existing cash.", legs: [{ holding_id: EQUITY, change: "increase", amount: 20_000 }] },
        { title: "Buy more of the bond fund from cash", rationale: "From existing cash.", legs: [{ holding_id: BONDS, change: "increase", amount: 20_000 }] },
      ],
    })) as unknown as Awaited<ReturnType<typeof prepare>>;
    expect(r.allocation.groups.map((g) => g.problem)).toEqual([null, null]);
    expect(m.evaluateSelection(inputs(m), [...legsOf(r, 0), ...legsOf(r, 1)], r.allocation.proposedWeights).problems.join(" ")).toMatch(/cash shortfall in Fictional Taxable Account/);
    // The store refuses the pair together; either one alone is accepted.
    expect(store(m).acceptAgentDrafts([...legsOf(r, 0), ...legsOf(r, 1)], r.context).ok).toBe(false);
    expect(store(m).recommendations).toEqual([]);
    expect(store(m).acceptAgentDrafts(legsOf(r, 0), r.context)).toMatchObject({ ok: true });
  });

  it("no invented security, and weights must be a whole mix: an unknown holding, a sale of a retained security, a mix not totalling 100 or missing a held class are refused", async () => {
    const m = await load();
    portfolio(m, "cash_and_caution", (s) => s.setDiscoveryAnswer("securitiesToRetain", { securities: ["Fictional Equity Fund"] }));
    const base = { outcome: "propose_changes", headline: "A mix", rationale: "Fictional checks of the engine's rules.", client_basis: BASIS, alternative: { summary: "Keep today's mix." } };
    const w = [{ asset_class: "equity", pct: 60 }, { asset_class: "fixed_income", pct: 30 }, { asset_class: "cash", pct: 10 }];
    expect((await decideWith(m, { ...base, proposed_weights: w.slice(0, 2) })).trace[2].summary).toMatch(/total 90%.*missing Cash & Equivalents/);
    expect((await decideWith(m, { ...base, proposed_weights: [{ asset_class: "equity", pct: 70 }, { asset_class: "cash", pct: 30 }] })).trace[2].summary).toMatch(/missing Fixed Income/);
    const ok = await decideWith(m, {
      ...base,
      proposed_weights: w,
      groups: [
        { title: "Buy a new fund", rationale: "Not owned.", legs: [{ holding_id: "h_new_global_fund", change: "increase", amount: 10_000 }] },
        { title: "Sell the retained fund", rationale: "Retained.", legs: [{ holding_id: EQUITY, change: "reduce", amount: 10_000 }] },
      ],
    });
    expect(ok.allocation.groups.map((g) => g.problem)).toEqual([
      "No holding h_new_global_fund: this version implements with holdings already owned; a new security isn't proposed.",
      "Fictional Equity Fund is a security the client wants to retain, so it can't fund a sale.",
    ]);
  });
});

describe("#119 approval and evidence", () => {
  it("Add stays unapproved; a partial implementation is frozen with the AI's mix beside the actual result and the gap; a later version leaves the first one unchanged", async () => {
    const m = await load();
    portfolio(m, "cash_and_caution");
    const r = await prepare(m);
    const strategy = r.drafts.find((d) => d.id === r.allocation.strategyDraftId)!;
    const added = store(m).acceptAgentDrafts([strategy, ...legsOf(r, 0)], r.context);
    expect(added).toMatchObject({ ok: true });
    expect(store(m).recommendations.every((x) => !x.approvedByAdvisor && !x.includeInPdf)).toBe(true);

    store(m).approveAllRecommendations(store(m).recommendations.map((x) => x.id));
    const v = store(m).approveVersion("Fictional approval: cash group only.");
    if (!v.ok) throw new Error(v.failing.join("; "));
    const frozen = v.snapshot.inputs.recommendations.find((x) => x.id === strategy.id)!;
    expect(frozen.allocationStrategy?.proposedWeights).toEqual(r.allocation.proposedWeights);
    expect(m.checkSnapshot(JSON.parse(JSON.stringify(v.snapshot))).ok).toBe(true);
    const html = m.renderToStaticMarkup(React.createElement(m.ProposalPdfTemplate, m.snapshotTemplateProps(v.snapshot, { variant: "final", presentation: "issued", timeZone: "UTC" }) as never));
    const text = html.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
    expect(text).toMatch(/Proposed mix \(a strategy judgment approved by the advisor\)/);
    expect(text).toMatch(/Equity 70\.0% 60\.0% 65\.0% 5\.0 pts over the proposal/);
    expect(text).toMatch(/Fixed Income 25\.0% 30\.0% 25\.0% 5\.0 pts short of the proposal/);
    expect(text).toMatch(/Cash & Equivalents 5\.0% 10\.0% 10\.0% —/);
    expect(text).not.toMatch(/Claude/);

    // The old preview is stale now (the workspace changed since it was prepared), and a later version leaves the first as approved.
    const first = JSON.stringify(store(m).snapshots.find((x) => x.id === v.snapshot.id));
    expect(store(m).acceptAgentDrafts(legsOf(r, 1), r.context).ok).toBe(false);
    store(m).setDiscoveryAnswer("timeHorizon", { years: 12 });
    store(m).recordDiscoveryReview();
    // #119 review (intended): a reviewed brief changed after approval blocks a new version until the advisor re-reviews the strategy.
    expect(store(m).approveVersion("Before re-review.").ok).toBe(false);
    store(m).reviewAllocationStrategy(strategy.id, "Fictional re-review: a twelve-year horizon does not change the mix.");
    const v2 = store(m).approveVersion("Fictional second version.");
    if (!v2.ok) throw new Error(v2.failing.join("; "));
    expect(v2.snapshot.fingerprint).not.toBe(v.snapshot.fingerprint);
    expect(JSON.stringify(store(m).snapshots.find((x) => x.id === v.snapshot.id))).toBe(first);
  });

  it("changing the brief after the preview makes it stale: Add is refused", async () => {
    const m = await load();
    portfolio(m, "cash_and_caution");
    const r = await prepare(m);
    store(m).setDiscoveryAnswer("timeHorizon", { years: 12 });
    const out = store(m).acceptAgentDrafts(r.drafts, r.context);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toMatch(/workspace changed after this answer/);
    expect(store(m).recommendations).toEqual([]);
  });

  it("a hold can be added and approved as a no-trade recommendation; the result equals the recorded mix", async () => {
    const m = await load();
    portfolio(m, "growth");
    const r = await prepare(m);
    expect(store(m).acceptAgentDrafts(r.drafts, r.context)).toMatchObject({ ok: true });
    store(m).approveAllRecommendations();
    const v = store(m).approveVersion("Fictional approval of a hold.");
    if (!v.ok) throw new Error(v.failing.join("; "));
    const html = m.renderToStaticMarkup(React.createElement(m.ProposalPdfTemplate, m.snapshotTemplateProps(v.snapshot, { variant: "final", presentation: "issued", timeZone: "UTC" }) as never));
    const text = html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
    expect(text).toMatch(/Maintain the current mix \(a strategy judgment approved by the advisor\)/);
    expect(text).toMatch(/Equity 70\.0% 70\.0% 70\.0% —/);
  });

  it("backups carry the strategy record through export and restore; a malformed one is refused", async () => {
    const m = await load();
    portfolio(m, "cash_and_caution");
    const r = await prepare(m);
    store(m).acceptAgentDrafts(r.drafts, r.context);
    const ids = m.DISCLOSURE_LIBRARY.map((d) => d.id);
    const text = m.serializeBackup(m.createBackup(store(m), NOW));
    const parsed = m.parseBackup(text, { disclosureIds: ids });
    if (!parsed.ok) throw new Error(parsed.errors.join("; "));
    const back = parsed.backup.engagement.recommendations.find((x) => x.id === r.allocation.strategyDraftId)!;
    expect(back.allocationStrategy).toEqual(r.drafts.find((d) => d.id === r.allocation.strategyDraftId)!.allocationStrategy);
    const bad = JSON.parse(text);
    bad.engagement.recommendations.find((x: Recommendation) => x.allocationStrategy).allocationStrategy.proposedWeights[0].pct = 140;
    expect(m.parseBackup(JSON.stringify(bad), { disclosureIds: ids }).ok).toBe(false);
  });
});

describe("#119 the advisor's screen", () => {
  const render = async (m: M, r: Awaited<ReturnType<typeof prepare>>) => {
    const { AllocationProposal } = await import("@/components/copilot/AllocationProposal");
    const html = m.renderToStaticMarkup(React.createElement(AllocationProposal, { result: r, stale: false, existing: new Set<string>(), addedHere: new Set<string>(), onAdd: () => {}, onDiscard: () => {}, note: null }));
    return html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ");
  };

  it("a proposed mix: the AI's weights labelled as judgment beside the recorded mix, the groups, and what the selection produces", async () => {
    const m = await load();
    portfolio(m, "cash_and_caution");
    const text = await render(m, await prepare(m));
    expect(text).toMatch(/Raise cash to 10% and lower equities to 60%/);
    expect(text).toMatch(/Equity 70\.0% 60\.0% -10\.0 pp -\$50,000\.00/);
    expect(text).toMatch(/Cash & Equivalents 5\.0% 10\.0% \+5\.0 pp \+\$25,000\.00/);
    expect(text).toMatch(/Proposed weights: the test provider's scripted example \(not a model\), not your desk targets and not a calculated result/);
    expect(text).toMatch(/Alternative considered: Raise cash only/);
    expect(text).toMatch(/The sale and the purchase form one funded group/);
    expect(text).toMatch(/What your selection produces/);
    expect(text).toMatch(/Preview only — nothing added\./);
    expect(text).toMatch(/Add the strategy and 2 selected groups/);
  });

  it("a restricted security: the group says why it isn't available and the gap names no eligible candidate", async () => {
    const m = await load();
    portfolio(m, "cash_and_caution", (s) => s.setDiscoveryAnswer("restrictedInvestments", { securities: ["Fictional Core Bond Fund"] }));
    const text = await render(m, await prepare(m));
    expect(text).toMatch(/Not available: Fictional Core Bond Fund is a restricted investment/);
    expect(text).toMatch(/Fixed Income 25\.0% 30\.0% 25\.0% \+5\.0 pp \(\$25,000\.00\) No eligible candidate/);
  });

  it("a question: no mix, nothing to add", async () => {
    const m = await load();
    portfolio(m, "cash_and_caution", (s) => s.setDiscoveryNotDiscussed("lossAbility"));
    const text = await render(m, await prepare(m));
    expect(text).toMatch(/Question first/);
    expect(text).toMatch(/Please discuss "Ability to absorb losses" with the client/);
    expect(text).toMatch(/No mix is proposed and nothing is ready to approve/);
    expect(text).not.toMatch(/Add the strategy/);
  });
});
