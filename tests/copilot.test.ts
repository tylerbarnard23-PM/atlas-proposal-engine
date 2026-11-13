import { describe, expect, it } from "vitest";
import { CopilotContext, MAX_DRAFTS_PER_RUN, executeTool } from "@/copilot/tools";
import { classifyIntent, runDemoCopilot } from "@/copilot/demo";
import { parseCopilotRequest, type CopilotSnapshot } from "@/copilot/snapshot";
import { SEED_HOLDINGS } from "@/data/seedHoldings";
import { SEED_FX_RATES } from "@/data/seedFxRates";
import { SEED_ACCOUNTS } from "@/data/seedAccounts";
import { SEED_ADVISOR, SEED_CLIENT } from "@/data/seedClient";
import { SEED_RECOMMENDATIONS } from "@/data/seedRecommendations";
import { DISCLOSURE_LIBRARY } from "@/domain/disclosureLibrary";
import { newWorkingDraft } from "@/engines/allocationDesk";
import { copilotRequest } from "./support/copilotRequest";

const snapshot = (): CopilotSnapshot => ({
  client: SEED_CLIENT,
  advisor: SEED_ADVISOR,
  accounts: SEED_ACCOUNTS,
  holdings: SEED_HOLDINGS,
  fxRates: SEED_FX_RATES,
  recommendations: SEED_RECOMMENDATIONS,
  disclosures: DISCLOSURE_LIBRARY,
  workingDraft: newWorkingDraft("2026-10-01T00:00:00.000Z"),
});

const firstHoldingId = SEED_HOLDINGS.find((h) => !h.isLiability && h.assetClass !== "cash")!.id;

describe("copilot tools", () => {
  it("answers the overview from the engines", () => {
    const ctx = new CopilotContext(snapshot());
    const { content, isError } = executeTool(ctx, "get_portfolio_overview", {});
    expect(isError).toBe(false);
    const out = JSON.parse(content);
    expect(out.counts.holdings).toBe(SEED_HOLDINGS.length);
    expect(out.top_holdings.length).toBeGreaterThan(0);
  });

  it("returns a tool error, not an exception, for an unknown holding", () => {
    const ctx = new CopilotContext(snapshot());
    const res = executeTool(ctx, "get_holding", { holding_id: "nope" });
    expect(res.isError).toBe(true);
    expect(res.content).toMatch(/No holding/);
  });

  it("rejects invalid enum values with a readable error", () => {
    const ctx = new CopilotContext(snapshot());
    const res = executeTool(ctx, "simulate_recommendation", { holding_id: firstHoldingId, type: "yolo" });
    expect(res.isError).toBe(true);
    expect(res.content).toMatch(/Invalid input/);
  });

  it("simulates without changing anything", () => {
    const snap = snapshot();
    const ctx = new CopilotContext(snap);
    const before = JSON.stringify(snap.holdings);
    const out = JSON.parse(
      executeTool(ctx, "simulate_recommendation", { holding_id: firstHoldingId, type: "sell", action_amount: 50, action_amount_unit: "percent" }).content
    );
    expect(out.after).toBeCloseTo(out.before / 2, -1);
    expect(JSON.stringify(snap.holdings)).toBe(before);
    expect(ctx.drafts).toHaveLength(0);
  });

  it("never lets the model approve a draft or put it in the PDF", () => {
    const ctx = new CopilotContext(snapshot());
    // D4: a position-changing draft is the exact action a scope simulation evaluated.
    const sim = JSON.parse(executeTool(ctx, "simulate_scope_change", { holding_id: firstHoldingId, change: "reduce", amount: 1_000 }).content);
    expect(sim.draftable).toBe(true);
    const res = executeTool(ctx, "draft_recommendation", {
      simulation_id: sim.simulation_id,
      type: "reduce",
      title: "Trim position",
      priority: "high",
      rationale: "Concentration above the firm threshold.",
      // Fields a prompt-injected model might try to set:
      approvedByAdvisor: true,
      includeInPdf: true,
      status: "approved",
    });
    expect(res.isError).toBe(false);
    expect(ctx.drafts).toHaveLength(1);
    expect(ctx.drafts[0]).toMatchObject({ approvedByAdvisor: false, includeInPdf: false, status: "needs_review" });
  });

  it(`caps drafts at ${MAX_DRAFTS_PER_RUN} per request`, () => {
    const ctx = new CopilotContext(snapshot());
    const draft = (i: number) => ({ type: "custom", title: `Advisory note ${i}`, priority: "low", rationale: "Discuss estate plan at next review." });
    for (let i = 0; i < MAX_DRAFTS_PER_RUN; i++) expect(executeTool(ctx, "draft_recommendation", draft(i)).isError).toBe(false);
    expect(executeTool(ctx, "draft_recommendation", draft(99)).isError).toBe(true);
    expect(ctx.drafts).toHaveLength(MAX_DRAFTS_PER_RUN);
  });
});

describe("demo copilot", () => {
  it("states only figures its engine results support, including figures in insight and readiness wording (D4)", () => {
    for (const question of ["Summarize this client", "Draft recommendations for the top risks", "Is this proposal ready?"]) {
      for (const recommendations of [SEED_RECOMMENDATIONS, []]) {
        const r = runDemoCopilot({ ...snapshot(), recommendations }, question);
        expect(r.figures.claims, question).toBeGreaterThan(0);
        expect(r.figures.unsupported, question).toEqual([]);
        expect(r.figures.unchecked, question).toEqual([]);
        expect(r).toMatchObject({ mode: "demo", status: "completed" });
      }
    }
  });

  it("routes questions by intent", () => {
    expect(classifyIntent("Is this ready to send?")).toBe("readiness");
    expect(classifyIntent("Draft recommendations for the top risks")).toBe("draft");
    expect(classifyIntent("Give me a summary")).toBe("summary");
  });

  it("drafts unapproved recommendations through the real tools", () => {
    const out = runDemoCopilot({ ...snapshot(), recommendations: [] }, "Draft recommendations for the top risks");
    expect(out.mode).toBe("demo");
    expect(out.trace[0].name).toBe("get_portfolio_overview");
    expect(out.trace.every((t) => t.ok)).toBe(true);
    expect(out.drafts.length).toBeGreaterThan(0);
    for (const d of out.drafts) {
      expect(d.approvedByAdvisor).toBe(false);
      expect(d.includeInPdf).toBe(false);
    }
  });

  it("skips holdings that already have a recommendation on file", () => {
    const snap = snapshot();
    const covered = new Set(snap.recommendations.map((r) => r.relatedHoldingId).filter(Boolean));
    const out = runDemoCopilot(snap, "Draft recommendations");
    for (const d of out.drafts) expect(covered.has(d.relatedHoldingId)).toBe(false);
  });

  it("does not draft sales of illiquid positions", () => {
    const out = runDemoCopilot({ ...snapshot(), recommendations: [] }, "Draft recommendations");
    const byId = new Map(SEED_HOLDINGS.map((h) => [h.id, h]));
    for (const d of out.drafts.filter((d) => d.type === "reduce_concentration")) {
      expect(["cash", "daily", "weekly"]).toContain(byId.get(d.relatedHoldingId!)?.liquidity);
    }
    expect(out.answer).toMatch(/not tradeable/);
  });

  it("explains an empty workspace instead of failing", () => {
    const out = runDemoCopilot({ ...snapshot(), holdings: [] }, "summary");
    expect(out.answer).toMatch(/no holdings/i);
    expect(out.drafts).toHaveLength(0);
  });
});

describe("request validation", () => {
  it("rejects an empty question", () => {
    expect(parseCopilotRequest(copilotRequest("  ", snapshot())).ok).toBe(false);
  });
  it("accepts the seed workspace with its context", () => {
    expect(parseCopilotRequest(copilotRequest("hi", snapshot())).ok).toBe(true);
  });
  it("requires the context and the active alternative (D4)", () => {
    const { context: _c, ...noContext } = copilotRequest("hi", snapshot());
    void _c;
    expect(parseCopilotRequest(noContext).ok).toBe(false);
    const { workingDraft: _w, ...noDraft } = snapshot();
    void _w;
    expect(parseCopilotRequest({ question: "hi", snapshot: noDraft, context: copilotRequest("hi", snapshot()).context }).ok).toBe(false);
  });
});
