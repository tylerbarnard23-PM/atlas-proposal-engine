import { describe, expect, it } from "vitest";
import type { Holding, SourceDocument } from "@/domain/types";
import { readPdfInNode } from "@/ingestion/pdf/readPdfNode";
import { parseStatementPdf } from "@/ingestion/documents/parseStatementPdf";
import { extractionToWorkspace } from "@/ingestion/documents/toWorkspace";
import { importIssues, holdingsFromIncompleteImports } from "@/engines/importCompleteness";
import { evaluateWorkspaceReadiness } from "@/engines/complianceEngine";
import { CopilotContext, executeTool } from "@/copilot/tools";
import { ISSUE_29_LINES, textPdf } from "./fixtures/syntheticStatementPdf";
import { syntheticReportPdf } from "./fixtures/syntheticHoldingsReport";
import { SEED_HOLDINGS } from "@/data/seedHoldings";
import { SEED_FX_RATES } from "@/data/seedFxRates";
import { SEED_ACCOUNTS } from "@/data/seedAccounts";
import { SEED_ADVISOR, SEED_CLIENT } from "@/data/seedClient";
import { DISCLOSURE_LIBRARY } from "@/domain/disclosureLibrary";

// An import whose rows don't account for the document's stated total (or
// that skipped unreadable rows) is incomplete. That condition is stored with
// the source document, blocks the final PDF, isn't cleared by confirming the
// rows that did import, and stops trade-sizing drafts.

const load = async (lines: string[]) => {
  const r = parseStatementPdf(await readPdfInNode(textPdf(lines)), "QA");
  return extractionToWorkspace(r, { fileName: "qa.pdf", reportingCurrency: "USD" });
};
const MISMATCH = [...ISSUE_29_LINES.slice(0, 9), "Total Account Value                                           USD 9,000,000.00"];
const AMBIGUOUS = [...ISSUE_29_LINES.slice(0, 9), "Mystery Fund QA Import          MYST        500       USD 20.00"];

const workspace = (holdings: Holding[], docs: SourceDocument[], accounts = SEED_ACCOUNTS) => ({
  client: SEED_CLIENT,
  advisor: SEED_ADVISOR,
  accounts,
  holdings,
  recommendations: [],
  disclosures: DISCLOSURE_LIBRARY,
  fxRates: SEED_FX_RATES,
  sourceDocuments: docs,
});

describe("import completeness", () => {
  it("a total mismatch is an import issue stored with the source document", async () => {
    const ws = await load(MISMATCH);
    const issues = importIssues([ws.sourceDocument], ws.holdings);
    expect(issues).toEqual([expect.objectContaining({ kind: "total_mismatch", fileName: "qa.pdf", stated: 9_000_000, extracted: 8_300_000, currency: "USD" })]);
  });

  it("unreadable rows are an import issue even without a stated total", async () => {
    const ws = await load(AMBIGUOUS);
    expect(importIssues([ws.sourceDocument], ws.holdings)).toEqual([expect.objectContaining({ kind: "unreadable_rows", rows: 1 })]);
  });

  it("a reconciled import has no issues; neither does an import whose holdings were all removed", async () => {
    const ok = parseStatementPdf(await readPdfInNode(syntheticReportPdf()), "R");
    const ws = extractionToWorkspace(ok, { fileName: "report.pdf", reportingCurrency: "USD" });
    expect(importIssues([ws.sourceDocument], ws.holdings)).toEqual([]);
    const bad = await load(MISMATCH);
    expect(importIssues([bad.sourceDocument], [])).toEqual([]);
  });

  it("blocks the final PDF, and confirming the imported rows doesn't clear it", async () => {
    const ws = await load(MISMATCH);
    const accounts = [...SEED_ACCOUNTS, ...ws.accounts];
    const confirmed = [...SEED_HOLDINGS, ...ws.holdings].map((h) => ({ ...h, advisorVerification: "advisor_approved" as const }));
    const checks = evaluateWorkspaceReadiness(workspace(confirmed, [ws.sourceDocument], accounts));
    const check = checks.find((c) => c.code === "imports_complete")!;
    expect(check.passed).toBe(false);
    expect(check.detail).toMatch(/qa\.pdf/);
    expect(checks.find((c) => c.code === "unverified_holdings")?.passed).toBe(true);
  });

  it("identifies holdings that came from an incomplete import", async () => {
    const ws = await load(MISMATCH);
    expect([...holdingsFromIncompleteImports([ws.sourceDocument], ws.holdings)].sort()).toEqual(ws.holdings.map((h) => h.id).sort());
  });

  it("the Copilot reports completeness unknown and refuses trade-sizing drafts", async () => {
    const ws = await load(MISMATCH);
    const snapshot = workspace([...SEED_HOLDINGS, ...ws.holdings], [ws.sourceDocument], [...SEED_ACCOUNTS, ...ws.accounts]);
    const ctx = new CopilotContext(snapshot as never);
    const o = JSON.parse(executeTool(ctx, "get_portfolio_overview", {}).content);
    expect(o.completeness).toMatchObject({ valuation_complete: true, imports_complete: false });
    const nvda = ws.holdings[0];
    const trade = executeTool(ctx, "draft_recommendation", { holding_id: nvda.id, type: "sell", action_amount: 100_000, title: "Trim", priority: "medium", rationale: "Testing a trade draft." });
    expect(trade.isError).toBe(true);
    expect(trade.content).toMatch(/incomplete/i);
  });
});

describe("import completeness across the server boundary", () => {
  it("the final-PDF route blocks an incomplete import from the slim documents the browser sends", async () => {
    const { forReadiness } = await import("@/engines/importCompleteness");
    const { SEED_RECOMMENDATIONS } = await import("@/data/seedRecommendations");
    const { POST } = await import("@/app/api/proposals/[id]/generate-pdf/route");
    const ws = await load(MISMATCH);
    const holdings = [...SEED_HOLDINGS, ...ws.holdings].map((h) => ({ ...h, advisorVerification: "advisor_approved" as const }));
    const recommendations = SEED_RECOMMENDATIONS.map((r) => ({ ...r, approvedByAdvisor: true, includeInPdf: true }));
    // Through JSON, as the browser sends it: no full extraction, just the stored condition.
    const sourceDocuments = JSON.parse(JSON.stringify([ws.sourceDocument].map(forReadiness)));
    expect(sourceDocuments[0].extraction).toBeUndefined();
    const state = { ...workspace(holdings, sourceDocuments, [...SEED_ACCOUNTS, ...ws.accounts]), recommendations, sections: [], proposal: { id: "p1" } };
    const res = await POST(new Request("http://localhost/api/proposals/p1/generate-pdf?variant=final", { method: "POST", body: JSON.stringify({ state }) }), {
      params: Promise.resolve({ id: "p1" }),
    });
    expect(res.status).toBe(422);
    expect((await res.json()).failing).toContain("Imported documents fully accounted for");
  });

  it("the Copilot request accepts source documents, and still accepts clients that don't send them", async () => {
    const { parseCopilotRequest } = await import("@/copilot/snapshot");
    const { copilotRequest } = await import("./support/copilotRequest");
    const ws = await load(MISMATCH);
    const snap = workspace(ws.holdings, [ws.sourceDocument], ws.accounts);
    expect(parseCopilotRequest(copilotRequest("hi", snap)).ok).toBe(true);
    const { sourceDocuments: _omit, ...older } = snap;
    expect(parseCopilotRequest(copilotRequest("hi", older)).ok).toBe(true);
  });

  it("advisory drafts (no value change) are still allowed while an import is incomplete", async () => {
    const ws = await load(MISMATCH);
    const ctx = new CopilotContext(workspace([...SEED_HOLDINGS, ...ws.holdings], [ws.sourceDocument], [...SEED_ACCOUNTS, ...ws.accounts]) as never);
    const advisory = executeTool(ctx, "draft_recommendation", { type: "request_updated_statement", title: "Get a complete statement", priority: "high", rationale: "The imported rows don't reach the statement's total." });
    expect(advisory.isError).toBe(false);
  });

  it("a holdings report stating two different portfolio totals is a mismatch that needs review", async () => {
    const { placedTextPdf } = await import("./fixtures/syntheticStatementPdf");
    const { SYNTHETIC_REPORT_PAGES } = await import("./fixtures/syntheticHoldingsReport");
    const pages = structuredClone(SYNTHETIC_REPORT_PAGES);
    // The closing "Total Portfolio" (page 5) states a different amount.
    for (const it of pages[4].items) if (it.text === "$739,501.06") it.text = "$739,601.06";
    const r = parseStatementPdf(await readPdfInNode(placedTextPdf(pages)), "R");
    expect(r.reconciliation?.status).toBe("mismatch");
    expect(r.warnings.some((w) => w.severity === "critical" && /conflicting totals/i.test(w.message))).toBe(true);
    const ws = extractionToWorkspace(r, { fileName: "report.pdf", reportingCurrency: "USD" });
    expect(importIssues([ws.sourceDocument], ws.holdings).map((i) => i.kind)).toEqual(["total_mismatch"]);
  });
});

describe("demo Copilot", () => {
  // Trade-sizing refusal itself is enforced (and tested) in draft_recommendation above.
  it("leads with the incomplete import instead of presenting the totals as the whole portfolio", async () => {
    const { runDemoCopilot } = await import("@/copilot/demo");
    const ws = await load(MISMATCH);
    const snap = workspace([...SEED_HOLDINGS, ...ws.holdings], [ws.sourceDocument], [...SEED_ACCOUNTS, ...ws.accounts]);
    const out = runDemoCopilot(snap as never, "Draft recommendations for the top findings");
    expect(out.answer.split("\n")[0]).toMatch(/Import incomplete:.*qa\.pdf/);
  });
});
