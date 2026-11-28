import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import type { Recommendation } from "@/domain/types";
import { ACC, BONDS, CASH, EQUITY, NOW, account, holding, inputs, legsOf, load, portfolio, prepare, runScripted, scripted, snapshotOf, store, textOf, type M, type Prepared } from "./support/allocationFixture";

// #119, the independent review of PR #120 at d004791: regressions for findings
// 1–6 and the product decisions, through the real agent loop (a scripted
// stand-in for Claude, or the labelled test provider), store, restore parser,
// proposal screen and version paths. Fictional data only; no provider call.

vi.mock("zustand", async (orig) => ({ ...(await orig<typeof import("zustand")>()), create: (await import("./support/liveStore")).liveCreate }));
vi.hoisted(() => {
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
});

beforeEach(() => {
  vi.resetModules();
  (globalThis as { window: { localStorage: Storage } }).window.localStorage.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

const READ = { tools: [{ name: "get_portfolio_overview", input: {} }, { name: "get_scope_overview", input: {} }] };
const HOLD = { outcome: "maintain_current_mix", headline: "Keep the current mix", rationale: "The client wants growth and accepts the current risk; nothing calls for cash.", client_basis: [{ question: "objectives", supports: "Growth over twenty years is the stated aim, which the current equity share serves." }] };
const W = (e: number, b: number, c: number, extra: Record<string, number> = {}) => [
  { asset_class: "equity", pct: e },
  { asset_class: "fixed_income", pct: b },
  { asset_class: "cash", pct: c },
  ...Object.entries(extra).map(([asset_class, pct]) => ({ asset_class, pct })),
];
const PROPOSE = (groups: object[], weights = W(60, 30, 10), extra: object = {}) => ({
  outcome: "propose_changes",
  headline: "Raise cash and lower equities",
  rationale: "The client plans a withdrawal within a year and accepts only moderate losses.",
  client_basis: [{ question: "liquidity", supports: "The withdrawal falls within a year, so it is held in cash rather than in equities that could fall first." }],
  proposed_weights: weights,
  alternative: { summary: "Raise cash only, with less selling." },
  groups,
  ...extra,
});
const reduce = (holding_id: string, amount: number) => ({ holding_id, change: "reduce", amount });
const increase = (holding_id: string, amount: number) => ({ holding_id, change: "increase", amount });
const group = (title: string, legs: object[]) => ({ title, rationale: "Funded within the same account.", legs });
/** Inputs read on one turn, the decision on the next, then an answer. */
const decide = (m: M, decision: object, answer = "Decision returned.") => scripted(m, [() => READ, () => ({ tools: [{ name: "propose_allocation", input: decision }] }), () => ({ text: answer })]);
const card = async (m: M, r: Prepared) => {
  const { AllocationProposal } = await import("@/components/copilot/AllocationProposal");
  return textOf(m.renderToStaticMarkup(React.createElement(AllocationProposal, { result: r, stale: false, existing: new Set<string>(), addedHere: new Set<string>(), onAdd: () => {}, onDiscard: () => {}, note: null })));
};
const cardHtml = async (m: M, r: Prepared) => {
  const { AllocationProposal } = await import("@/components/copilot/AllocationProposal");
  return m.renderToStaticMarkup(React.createElement(AllocationProposal, { result: r, stale: false, existing: new Set<string>(), addedHere: new Set<string>(), onAdd: () => {}, onDiscard: () => {}, note: null }));
};
const pdfText = (m: M, snapshot: import("@/domain/types").ApprovedSnapshot) =>
  textOf(m.renderToStaticMarkup(React.createElement(m.ProposalPdfTemplate, m.snapshotTemplateProps(snapshot, { variant: "final", presentation: "issued", timeZone: "UTC" }) as never)));
const approveAll = (m: M) => store(m).approveAllRecommendations(store(m).recommendations.map((r) => r.id));

describe("finding 1: a decision only after the model received the brief and the scope; only a completed, valid decision is addable", () => {
  it("a decision made without reading the inputs is refused and leaves nothing to add", async () => {
    const m = await load();
    portfolio(m, "growth");
    const r = await runScripted(m, scripted(m, [() => ({ tools: [{ name: "propose_allocation", input: HOLD }] }), () => ({ text: "Done." })]));
    expect(r.trace[0]).toMatchObject({ name: "propose_allocation", ok: false });
    expect(r.trace[0].summary).toMatch(/must reach you before you decide/);
    expect(r.allocation).toBeUndefined();
    expect(r.drafts).toEqual([]);
  });

  it("asking for the inputs and deciding in the same response doesn't count: the results must reach the model first", async () => {
    const m = await load();
    portfolio(m, "growth");
    const r = await runScripted(m, scripted(m, [() => ({ tools: [...READ.tools, { name: "propose_allocation", input: HOLD }] }), () => ({ text: "Done." })]));
    expect(r.trace.map((t) => [t.name, t.ok])).toEqual([["get_portfolio_overview", true], ["get_scope_overview", true], ["propose_allocation", false]]);
    expect(r.trace[2].summary).toMatch(/must reach you before you decide/);
    expect(r.allocation).toBeUndefined();
    expect(r.drafts).toEqual([]);
  });

  it("with the inputs read on an earlier turn, a valid hold is accepted as the one addable decision", async () => {
    const m = await load();
    portfolio(m, "growth");
    const r = await runScripted(m, decide(m, HOLD));
    expect(r.status).toBe("completed");
    expect(r.allocation.outcome).toBe("maintain");
    expect(r.allocation.addable).toBe(true);
    expect(r.drafts).toHaveLength(1);
  });

  it("the allocation task offers no generic draft tool, and ordinary questions don't see the decision tool", async () => {
    const m = await load();
    portfolio(m, "cash_and_caution", (s) => s.setDiscoveryNotDiscussed("lossAbility"));
    const task = scripted(m, [() => READ, () => ({ tools: [{ name: "draft_recommendation", input: { type: "custom", title: "Review risk", priority: "medium", rationale: "Advisory draft without a valid decision." } }] }), () => ({ text: "Done." })]);
    const r = await runScripted(m, task);
    expect(task.calls[0].tools.map((t) => t.name)).toContain("propose_allocation");
    expect(task.calls[0].tools.map((t) => t.name)).not.toContain("draft_recommendation");
    expect(r.trace[2]).toMatchObject({ name: "draft_recommendation", ok: false });
    expect(r.drafts).toEqual([]);
    expect(r.allocation).toBeUndefined();

    const ordinary = scripted(m, [() => READ, () => ({ tools: [{ name: "propose_allocation", input: HOLD }] }), () => ({ text: "Done." })]);
    const q = await runScripted(m, ordinary, null);
    expect(ordinary.calls[0].tools.map((t) => t.name)).not.toContain("propose_allocation");
    expect(ordinary.calls[0].tools.map((t) => t.name)).toContain("draft_recommendation");
    expect(q.trace[2]).toMatchObject({ name: "propose_allocation", ok: false });
    expect(q.allocation).toBeUndefined();
  });

  it("a valid decision followed by a truncated answer leaves no Add path", async () => {
    const m = await load();
    portfolio(m, "growth");
    const r = await runScripted(m, scripted(m, [() => READ, () => ({ tools: [{ name: "propose_allocation", input: HOLD }] }), () => ({ text: "The decision is", stop: "max_tokens" })]));
    expect(r.status).toBe("truncated");
    expect(r.drafts).toEqual([]);
    expect(r.allocation.addable).toBe(false);
    const html = await cardHtml(m, r);
    expect(html).not.toContain('data-testid="allocation-add"');
    expect(textOf(html)).toMatch(/didn't complete/);
  });

  it("the five-record limit covers the strategy and every leg: three two-leg groups plus a strategy are refused whole, never trimmed", async () => {
    const m = await load();
    portfolio(m, "cash_and_caution");
    const g = (n: number) => group(`Shift ${n}`, [reduce(EQUITY, 5_000), increase(BONDS, 5_000)]);
    const r = await runScripted(m, decide(m, PROPOSE([g(1), g(2), g(3)], W(67, 28, 5))));
    expect(r.trace[2]).toMatchObject({ name: "propose_allocation", ok: false });
    expect(r.trace[2].summary).toMatch(/at most 5 records/);
    expect(r.drafts).toEqual([]);
    expect(r.allocation).toBeUndefined();
  });
});

describe("finding 2: only instructions the engine can carry out", () => {
  it("a USD 400,000 sale against a USD 350,000 holding is refused in preview and at Add", async () => {
    const m = await load();
    portfolio(m, "cash_and_caution");
    const r = await runScripted(m, decide(m, PROPOSE([group("Sell more than is held", [reduce(EQUITY, 400_000)])], W(0, 25, 75))));
    expect(r.allocation.groups[0].problem).toMatch(/400,000.*more than the USD 350,000/);
    expect(r.drafts.filter((d) => d.relatedHoldingId)).toEqual([]);
    const oversized = m.positionEditRecommendation({ holding: store(m).holdings.find((h) => h.id === EQUITY)!, kind: "reduce", amount: 400_000, reportingCurrency: "USD", id: "rec_oversized", now: NOW.toISOString() });
    const added = store(m).acceptAgentDrafts([oversized], m.agentContextOf(snapshotOf(m)));
    expect(added.ok).toBe(false);
    expect(store(m).recommendations).toEqual([]);
  });

  it("two USD 200,000 sales of the same holding pass alone but not together, in preview and at Add", async () => {
    const m = await load();
    portfolio(m, "cash_and_caution");
    const r = await runScripted(m, decide(m, PROPOSE([group("Sale A", [reduce(EQUITY, 200_000)]), group("Sale B", [reduce(EQUITY, 200_000)])], W(0, 25, 75))));
    expect(r.allocation.groups.map((g) => g.problem)).toEqual([null, null]);
    const both = m.evaluateSelection(inputs(m), [...legsOf(r, 0), ...legsOf(r, 1)], r.allocation.proposedWeights);
    expect(both.problems.join(" ")).toMatch(/more than the USD 350,000/);
    expect(store(m).acceptAgentDrafts([...legsOf(r, 0), ...legsOf(r, 1)], r.context).ok).toBe(false);
    expect(store(m).acceptAgentDrafts(legsOf(r, 0), r.context)).toMatchObject({ ok: true });
  });

  it("actions already in the alternative count, in the order they run", async () => {
    const m = await load();
    portfolio(m, "cash_and_caution");
    store(m).addDraftEdit(m.positionEditRecommendation({ holding: store(m).holdings.find((h) => h.id === EQUITY)!, kind: "reduce", amount: 300_000, reportingCurrency: "USD", id: "rec_existing_sale", now: NOW.toISOString() }));
    const r = await runScripted(m, decide(m, PROPOSE([group("Sell a further 100,000", [reduce(EQUITY, 100_000)])], W(0, 25, 75))));
    expect(r.allocation.groups[0].problem).toMatch(/more than the USD 50,000/);
  });

  it("a lock-up with 'No sales before 2030' can't fund a sale; a restriction blocks a purchase; unclear cases say what to confirm", async () => {
    const m = await load();
    portfolio(m, "cash_and_caution", () => {
      m.useAtlasStore.setState({
        holdings: store(m).holdings.map((h) => (h.id === EQUITY ? { ...h, liquidity: "lockup", restrictions: "No sales before 2030" } : h.id === BONDS ? { ...h, restrictions: "Closed to new investment" } : h)),
      });
    });
    const r = await runScripted(m, decide(m, PROPOSE([group("Raise cash", [reduce(EQUITY, 25_000)]), group("Buy bonds from cash", [increase(BONDS, 10_000)])], W(68, 27, 5))));
    expect(r.allocation.groups[0].problem).toMatch(/Fictional Equity Fund is recorded as a lock-up.*can't fund a sale/);
    expect(r.allocation.groups[1].problem).toMatch(/Fictional Core Bond Fund has recorded restrictions \("Closed to new investment"\).*confirm it can be bought/);
    expect(r.drafts.filter((d) => d.relatedHoldingId)).toEqual([]);
  });
});

describe("finding 3: Claude's own output is never evidence for itself", () => {
  it("a proposed 61.37% and a model-written 'tax saving USD 77,777' are not verified; a genuine current figure still is", async () => {
    const m = await load();
    portfolio(m, "cash_and_caution");
    const r = await runScripted(
      m,
      decide(m, PROPOSE([group("Estimated tax saving USD 77,777", [reduce(EQUITY, 25_000)])], W(61.37, 28.63, 10)), "The portfolio currently holds 61.37% equity. Equity is 70% today.")
    );
    expect(r.allocation.outcome).toBe("propose");
    expect(r.figures.unsupported).toContain("USD 77,777"); // from the card's group title, not the chat answer
    expect(r.figures.proposal).toContain("61.37%");
    expect(r.figures.unsupported).not.toContain("70%");
    expect(r.figures.matched).toBeGreaterThan(0);
    const text = await card(m, r);
    expect(text).toMatch(/not supported by Stratovell's engine results: USD 77,777/);
  });

  it("coincident values: a genuine current 25% still verifies when the proposal also says 25%", async () => {
    const m = await load();
    portfolio(m, "cash_and_caution");
    const r = await runScripted(m, decide(m, PROPOSE([], W(61.37, 25, 13.63)), "Bonds are 25% today. The proposal would take equity to 61.37%."));
    expect(r.figures.unsupported).toEqual([]);
    expect(r.figures.proposal).toEqual(["61.37%"]);
  });
});

describe("finding 4: an approved strategy is compared on its own scope and facts", () => {
  async function approvedHold(m: M, scope: "chosen" | "all") {
    portfolio(m, "growth", undefined, { scope });
    const r = await runScripted(m, decide(m, HOLD));
    expect(store(m).acceptAgentDrafts(r.drafts, r.context)).toMatchObject({ ok: true });
    approveAll(m);
    const v1 = store(m).approveVersion("Fictional first version.");
    if (!v1.ok) throw new Error(v1.failing.join("; "));
    return { r, v1: v1.snapshot, strategyId: r.allocation.strategyDraftId! };
  }

  it("a new USD 500,000 cash account under 'all accounts': no new version until re-review; then the strategy still compares its own scope", async () => {
    const m = await load();
    const { v1, strategyId } = await approvedHold(m, "all");
    const frozen = JSON.stringify(v1);
    expect(store(m).recommendations.find((x) => x.id === strategyId)!.allocationStrategy!.basis.scopeAccountIds).toEqual([ACC]);
    store(m).upsertAccount(account("acc_alloc_cash2", "Fictional Cash Account") as never);
    store(m).upsertHolding(holding("h_alloc_cash2", "Cash", "cash", 500_000, {}, "acc_alloc_cash2") as never);
    const blocked = store(m).approveVersion("After the new account.");
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.failing.join(" ")).toMatch(/Allocation strategies reviewed against current facts/);
    expect(JSON.stringify(store(m).snapshots.find((s) => s.id === v1.id))).toBe(frozen);
    expect(pdfText(m, v1)).toMatch(/Equity 70\.0% 70\.0% 70\.0% —/);

    store(m).reviewAllocationStrategy(strategyId, "Reviewed: the hold covers the taxable account only; the new cash account is outside it.");
    const v2 = store(m).approveVersion("After re-review.");
    if (!v2.ok) throw new Error(v2.failing.join("; "));
    const text = pdfText(m, v2.snapshot);
    expect(text).toMatch(/Equity 70\.0% 70\.0% 70\.0% —/);
    // The strategy row never compares 70% with a result over a different scope (the version's own Before/After may show 35%).
    expect(text).not.toMatch(/Equity 70\.0% 70\.0% 35\.0%/);
    expect(text).toMatch(/Scope of this strategy: Fictional Taxable Account/);
    expect(JSON.stringify(store(m).snapshots.find((s) => s.id === v1.id))).toBe(frozen);
  });

  it("a reviewed brief changed to a USD 200,000 near-term withdrawal blocks a new version until re-review; the earlier version stays", async () => {
    const m = await load();
    const { v1, strategyId } = await approvedHold(m, "chosen");
    const frozen = JSON.stringify(v1);
    store(m).setDiscoveryAnswer("liquidity", { need: "planned", amount: 200_000, currency: "USD", timing: "within_1_year" });
    store(m).recordDiscoveryReview();
    const blocked = store(m).approveVersion("After the brief changed.");
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.failing.join(" ")).toMatch(/Allocation strategies reviewed against current facts/);
    const check = m.workspaceReadiness(store(m) as never, NOW).find((c) => c.code === "allocation_current")!;
    expect(check.detail).toMatch(/client brief/);
    expect(JSON.stringify(store(m).snapshots.find((s) => s.id === v1.id))).toBe(frozen);
    store(m).reviewAllocationStrategy(strategyId, "Discussed: the withdrawal is funded outside this account.");
    expect(store(m).approveVersion("After re-review.").ok).toBe(true);
  });

  it("a re-review needs a note; adding and approving the strategy's own trades doesn't invalidate it", async () => {
    const m = await load();
    portfolio(m, "cash_and_caution");
    const r = await prepare(m);
    const strategy = r.drafts.find((d) => d.id === r.allocation.strategyDraftId)!;
    expect(store(m).acceptAgentDrafts([strategy, ...legsOf(r, 0), ...legsOf(r, 1)], r.context)).toMatchObject({ ok: true });
    approveAll(m);
    expect(m.workspaceReadiness(store(m) as never, NOW).find((c) => c.code === "allocation_current")!.passed).toBe(true);
    expect(store(m).approveVersion("Fictional approval.").ok).toBe(true);
    expect(() => store(m).reviewAllocationStrategy(strategy.id, "  ")).toThrow(/note/);
  });

  it("after an objective changes and the advisor re-reviews, the version's PDF shows the quote as of the proposal, the brief's answer now, and the re-review", async () => {
    const m = await load();
    portfolio(m, "cash_and_caution");
    const r = await prepare(m);
    const strategy = r.drafts.find((d) => d.id === r.allocation.strategyDraftId)!;
    store(m).acceptAgentDrafts([strategy, ...legsOf(r, 0)], r.context);
    approveAll(m);
    const v1 = store(m).approveVersion("Fictional first version.");
    if (!v1.ok) throw new Error(v1.failing.join(" "));
    const frozen = JSON.stringify(v1.snapshot);
    store(m).setDiscoveryAnswer("objectives", { primary: "grow_wealth", secondary: [] });
    store(m).recordDiscoveryReview();
    expect(store(m).approveVersion("Blocked.").ok).toBe(false);
    store(m).reviewAllocationStrategy(strategy.id, "Fictional re-review: the dated withdrawal still needs the cash.");
    const v2 = store(m).approveVersion("After re-review.");
    if (!v2.ok) throw new Error(v2.failing.join(" "));
    const text = pdfText(m, v2.snapshot);
    expect(text).toMatch(/Objectives: “Primary: Preserve wealth” \(when proposed; the client brief now records “Primary: Grow wealth”\)/);
    expect(text).toMatch(/Re-reviewed by the advisor on .* after facts it was decided on changed: Fictional re-review: the dated withdrawal still needs the cash\./);
    // The earlier version is unchanged and still quotes the answer it was approved with, without a "now" note.
    expect(JSON.stringify(store(m).snapshots.find((s) => s.id === v1.snapshot.id))).toBe(frozen);
    const old = pdfText(m, v1.snapshot);
    expect(old).toMatch(/Objectives: “Primary: Preserve wealth” —/);
    expect(old).not.toMatch(/now records|Re-reviewed by the advisor/);
  });
});

describe("finding 5: the screen says what the advisor can do", () => {
  it("no eligible holding and no groups: the achievable mix, the USD 50,000 shortfall and its reason are shown; the strategy-only Add is explicit", async () => {
    const m = await load();
    portfolio(m, "cash_and_caution");
    const r = await runScripted(m, decide(m, PROPOSE([], W(60, 25, 5, { real_estate: 10 }))));
    const text = await card(m, r);
    expect(text).toMatch(/What your selection produces/);
    expect(text).toMatch(/Real Estate 0\.0% 10\.0% 0\.0% \+10\.0 pp \(\$50,000\.00\) No eligible candidate/);
    expect(text).toMatch(/Add the strategy only \(no trades\)/);
  });

  it("a hold on USD 350,123 / 124,877 / 25,000 proposes no action: exact weights, $0 change", async () => {
    const m = await load();
    portfolio(m, "growth", undefined, { values: [350_123, 124_877, 25_000] });
    const r = await prepare(m);
    expect(r.allocation.outcome).toBe("maintain");
    const strategy = r.drafts[0].allocationStrategy!;
    expect(strategy.proposedWeights).toEqual(strategy.currentWeights);
    expect(strategy.currentWeights.find((w) => w.assetClass === "equity")!.pct).toBeCloseTo(70.0246, 4);
    const text = await card(m, r);
    expect(text).toMatch(/Equity 70\.0% 70\.0% 0\.0 pp \$0\.00/);
    expect(text).toMatch(/Fixed Income 25\.0% 25\.0% 0\.0 pp \$0\.00/);
    expect(text).not.toMatch(/\$123/);
  });

  it("a hold shows actions already in the alternative separately from what the hold itself does", async () => {
    const m = await load();
    portfolio(m, "growth");
    store(m).addDraftEdit(m.positionEditRecommendation({ holding: store(m).holdings.find((h) => h.id === EQUITY)!, kind: "reduce", amount: 10_000, reportingCurrency: "USD", id: "rec_existing_trim", now: NOW.toISOString() }));
    const r = await prepare(m);
    const text = await card(m, r);
    expect(text).toMatch(/This hold adds no action/);
    expect(text).toMatch(/1 action already in this alternative \(not part of this hold\)/);
  });
});

describe("finding 6: restore validates a strategy as a whole", () => {
  async function backupWithStrategy(m: M) {
    portfolio(m, "cash_and_caution");
    const r = await prepare(m);
    store(m).acceptAgentDrafts(r.drafts, r.context);
    const ids = m.DISCLOSURE_LIBRARY.map((d) => d.id);
    return { text: m.serializeBackup(m.createBackup(store(m), NOW)), ids };
  }
  const strategyIn = (b: { engagement: { recommendations: Recommendation[] } }) => b.engagement.recommendations.find((x) => x.allocationStrategy)!.allocationStrategy!;

  it("95% + 60% + 5% = 160% is refused with its reason, before anything changes", async () => {
    const m = await load();
    const { text, ids } = await backupWithStrategy(m);
    const bad = JSON.parse(text);
    strategyIn(bad).proposedWeights = [{ assetClass: "equity", pct: 95 }, { assetClass: "fixed_income", pct: 60 }, { assetClass: "cash", pct: 5 }];
    const parsed = m.parseBackup(JSON.stringify(bad), { disclosureIds: ids });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.errors.join(" ")).toMatch(/total 160%/);
  });

  it("a hold whose weights differ from the mix when proposed, a duplicate class, a missing held class, or an alternative not totalling 100 are refused", async () => {
    const m = await load();
    const { text, ids } = await backupWithStrategy(m);
    const variants: ((s: import("@/domain/types").AllocationStrategy) => void)[] = [
      (s) => ((s.outcome = "maintain"), (s.proposedWeights = [{ assetClass: "equity", pct: 60 }, { assetClass: "fixed_income", pct: 30 }, { assetClass: "cash", pct: 10 }])),
      (s) => (s.proposedWeights = [{ assetClass: "equity", pct: 50 }, { assetClass: "equity", pct: 10 }, { assetClass: "fixed_income", pct: 30 }, { assetClass: "cash", pct: 10 }]),
      (s) => (s.proposedWeights = [{ assetClass: "equity", pct: 70 }, { assetClass: "cash", pct: 30 }]),
      (s) => (s.alternative = { summary: "Raise cash only.", weights: [{ assetClass: "equity", pct: 65 }, { assetClass: "fixed_income", pct: 25 }] }),
    ];
    for (const change of variants) {
      const bad = JSON.parse(text);
      change(strategyIn(bad));
      expect(m.parseBackup(JSON.stringify(bad), { disclosureIds: ids }).ok).toBe(false);
    }
  });

  it("a record in the earlier shape (display-rounded weights, no basis or client basis) still restores", async () => {
    const m = await load();
    const { text, ids } = await backupWithStrategy(m);
    const older = JSON.parse(text);
    const s = strategyIn(older) as unknown as Record<string, unknown>;
    delete s.clientBasis;
    delete s.reviews;
    s.currentWeights = [{ assetClass: "equity", pct: 33.4 }, { assetClass: "fixed_income", pct: 33.3 }, { assetClass: "cash", pct: 33.3 }];
    s.basis = { inputRevision: "r", scopeAccountIds: null, reportingCurrency: "USD", scopeTotal: 500_000 };
    s.proposedWeights = [{ assetClass: "equity", pct: 60 }, { assetClass: "fixed_income", pct: 30 }, { assetClass: "cash", pct: 10 }];
    expect(m.parseBackup(JSON.stringify(older), { disclosureIds: ids }).ok).toBe(true);
  });
});

describe("product decisions", () => {
  it("materiality: an unknown tax sensitivity stays visibly unknown and doesn't stop a mix; unknown liquidity does", async () => {
    const m = await load();
    portfolio(m, "cash_and_caution", (s) => s.setDiscoveryNotDiscussed("taxSensitivity"));
    const r = await prepare(m);
    expect(r.allocation.outcome).toBe("propose");
    expect(r.allocation.unknowns).toContain("Tax sensitivity: not discussed.");
    expect(await card(m, r)).toMatch(/Still unknown: Tax sensitivity: not discussed\./);

    const m2 = await load();
    portfolio(m2, "cash_and_caution", (s) => s.setDiscoveryNotDiscussed("liquidity"));
    const q = await prepare(m2);
    expect(q.allocation.outcome).toBe("ask");
    expect(q.allocation.question?.text).toMatch(/Liquidity needs/);
  });

  it("the client basis quotes what the client said (from the brief), with how it supports the decision", async () => {
    const m = await load();
    portfolio(m, "cash_and_caution");
    const r = await prepare(m);
    const basis = r.drafts.find((d) => d.allocationStrategy)!.allocationStrategy!.clientBasis!;
    expect(basis[0]).toMatchObject({ question: "liquidity", said: "Planned withdrawal: USD 50,000, within 1 year" });
    expect(basis[0].supports.length).toBeGreaterThan(20);
    expect(await card(m, r)).toMatch(/Liquidity needs: “Planned withdrawal: USD 50,000, within 1 year”/);
    // A basis must quote a recorded answer: an unanswered question can't be cited.
    const m2 = await load();
    portfolio(m2, "growth", (s) => s.setDiscoveryNotDiscussed("income"));
    const bad = await runScripted(m2, decide(m2, { ...HOLD, client_basis: [{ question: "income", supports: "No income is needed." }] }));
    expect(bad.trace[2]).toMatchObject({ name: "propose_allocation", ok: false });
  });

  it("restrictions not reviewed: a purchase says what the advisor must confirm; a sale is unaffected", async () => {
    const m = await load();
    portfolio(m, "cash_and_caution", (s) => s.setDiscoveryNotDiscussed("restrictedInvestments"));
    const r = await runScripted(m, decide(m, PROPOSE([group("Raise cash", [reduce(EQUITY, 25_000)]), group("Buy bonds from cash", [increase(BONDS, 10_000)])], W(68, 27, 5))));
    expect(r.allocation.groups[0].problem).toBeNull();
    expect(r.allocation.groups[1].problem).toMatch(/Restricted investments weren't reviewed.*confirm Fictional Core Bond Fund may be bought/);
    void CASH;
  });

  it("the test provider names refused groups by number and classes by label (the tool result carries no model title)", async () => {
    const m = await load();
    portfolio(m, "cash_and_caution", (s) => s.setDiscoveryAnswer("securitiesToRetain", { securities: ["Fictional Equity Fund"] }));
    const r = await prepare(m);
    expect(r.answer).not.toMatch(/undefined/);
    expect(r.answer).toMatch(/- Group 1: not feasible \(Fictional Equity Fund is a security the client wants to retain, so it can't fund a sale\)\.\n/);
    expect(r.answer).toMatch(/- Fixed Income: 5 percentage points short/);
  });
});
