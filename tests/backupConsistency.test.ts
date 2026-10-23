import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExtractionResult, Recommendation } from "@/domain/types";

// PR #66 review: one export/restore contract. Every export the app produces
// from its normal workflows must pass the same validation restore applies,
// and recommendations whose holding or account was removed are kept, flagged
// for the advisor's review and carried through a backup explicitly.

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
  (globalThis as { window?: unknown }).window = { localStorage: s };
  return s;
});

const NOW = new Date("2026-10-22T12:00:00Z");

async function load() {
  const store = await import("@/store/useStore");
  const backup = await import("@/engines/workspaceBackup");
  const links = await import("@/engines/recommendationLinks");
  const { normalizeHoldings } = await import("@/engines/normalizationEngine");
  const { valuationSummary } = await import("@/engines/valuationTotals");
  const { applyRecommendationsToProposed } = await import("@/engines/proposalEngine");
  const { evaluateWorkspaceReadiness } = await import("@/engines/complianceEngine");
  const { DISCLOSURE_LIBRARY } = await import("@/domain/disclosureLibrary");
  return { ...store, ...backup, ...links, normalizeHoldings, valuationSummary, applyRecommendationsToProposed, evaluateWorkspaceReadiness, DISCLOSURE_LIBRARY };
}
type Mods = Awaited<ReturnType<typeof load>>;
type State = ReturnType<Mods["useAtlasStore"]["getState"]>;

const ids = (m: Mods) => ({ disclosureIds: m.DISCLOSURE_LIBRARY.map((d) => d.id) });

function outcomes(m: Mods, s: State) {
  const holdings = m.normalizeHoldings(s.holdings, s.fxRates, s.client.proposalOutputCurrency);
  const fx = { reportingCurrency: s.client.proposalOutputCurrency, rates: s.fxRates, now: NOW };
  return {
    valuation: m.valuationSummary(holdings),
    proposed: m.applyRecommendationsToProposed(holdings, s.recommendations.filter((r) => r.approvedByAdvisor), s.accounts, fx).holdings.map((h) => [h.id, h.reportingMarketValue]),
    readiness: m
      .evaluateWorkspaceReadiness({ client: s.client, advisor: s.advisor, accounts: s.accounts, holdings, recommendations: s.recommendations, disclosures: s.disclosures, fxRates: s.fxRates, sourceDocuments: s.sourceDocuments, fxConfirmation: s.fxConfirmation, now: NOW })
      .map((c) => [c.code, c.passed, c.detail ?? null]),
  };
}

/** Export through the shared contract, restore it into a fresh workspace, and return both sides. */
function roundTrip(m: Mods) {
  const before = m.useAtlasStore.getState();
  const exported = m.exportBackup(before, NOW, ids(m));
  if (!exported.ok) throw new Error(`export failed: ${exported.errors.join("; ")}`);
  const parsed = m.parseBackup(exported.text, ids(m));
  if (!parsed.ok) throw new Error(`restore rejected the export: ${parsed.errors.join("; ")}`);
  m.useAtlasStore.getState().startNewClient();
  const r = m.useAtlasStore.getState().restoreWorkspace(m.restoredState(parsed.backup, { advisor: before.advisor, disclosures: m.DISCLOSURE_LIBRARY }, { replaceFirm: false }));
  expect(r).toEqual({ ok: true });
  return { before, after: m.useAtlasStore.getState(), exported };
}

beforeEach(() => {
  vi.resetModules();
  storage.clear();
});

describe("a removed holding or account leaves its recommendations for review", () => {
  it("deleting a recommended holding keeps the recommendation, clears its approval and blocks the final PDF until reviewed", async () => {
    const m = await load();
    const s = m.useAtlasStore.getState();
    const rec = s.recommendations.find((r) => r.relatedHoldingId === "h_aapl")!;
    m.useAtlasStore.getState().upsertRecommendation({ ...rec, approvedByAdvisor: true, includeInPdf: true, status: "approved" });
    m.useAtlasStore.getState().removeHolding("h_aapl");

    const kept = m.useAtlasStore.getState().recommendations.find((r) => r.id === rec.id)!;
    // Content and evidence unchanged: same text, amounts and the link it was given.
    expect({ ...kept, approvedByAdvisor: undefined, status: undefined, updatedAt: undefined }).toEqual({ ...rec, includeInPdf: true, approvedByAdvisor: undefined, status: undefined, updatedAt: undefined });
    expect(kept.relatedHoldingId).toBe("h_aapl");
    // The action no longer exists as approved: not re-approved, not redirected.
    expect(kept).toMatchObject({ approvedByAdvisor: false, status: "needs_review" });
    expect(m.unresolvedRecommendationLinks(m.useAtlasStore.getState())).toEqual([{ recommendationId: rec.id, holdingId: "h_aapl" }]);
    const check = outcomes(m, m.useAtlasStore.getState()).readiness.find(([code]) => code === "recommendation_links")!;
    expect(check[1]).toBe(false);
    expect(check[2]).toContain(rec.title);

    const { before, after } = roundTrip(m);
    expect(after.recommendations).toEqual(before.recommendations);
    expect(outcomes(m, after)).toEqual(outcomes(m, before));
  });

  it("deleting an account removes its holdings; recommendations linked to them or to the account are kept for review", async () => {
    const m = await load();
    const s = m.useAtlasStore.getState();
    const nestle = s.holdings.find((h) => h.id === "h_chf_nestle")!;
    const accountRec: Recommendation = { ...s.recommendations[0], id: "rec_account", title: "Consolidate this account", type: "consolidate_accounts", relatedHoldingId: undefined, relatedAccountId: nestle.accountId, actionAmount: undefined, proposedValue: undefined };
    m.useAtlasStore.getState().upsertRecommendation(accountRec);
    const linked = m.useAtlasStore.getState().recommendations.filter((r) => r.relatedAccountId === nestle.accountId || s.holdings.some((h) => h.accountId === nestle.accountId && h.id === r.relatedHoldingId));
    expect(linked.length).toBeGreaterThanOrEqual(2);
    m.useAtlasStore.getState().removeAccount(nestle.accountId);

    const after = m.useAtlasStore.getState();
    for (const r of linked) {
      const k = after.recommendations.find((x) => x.id === r.id)!;
      expect(k.title).toBe(r.title);
      expect(k.relatedHoldingId).toBe(r.relatedHoldingId);
      expect(k.relatedAccountId).toBe(r.relatedAccountId);
      expect(k.approvedByAdvisor).toBe(false);
    }
    expect(m.unresolvedRecommendationLinks(after)).toContainEqual({ recommendationId: "rec_account", accountId: nestle.accountId });
    const { before, after: restored } = roundTrip(m);
    expect(restored.recommendations).toEqual(before.recommendations);
    expect(outcomes(m, restored)).toEqual(outcomes(m, before));
  });

  it("a rejected recommendation stays rejected and doesn't block when its holding goes", async () => {
    const m = await load();
    const rec = m.useAtlasStore.getState().recommendations.find((r) => r.relatedHoldingId === "h_aapl")!;
    m.useAtlasStore.getState().rejectRecommendation(rec.id, "Client declined");
    m.useAtlasStore.getState().removeHolding("h_aapl");
    const k = m.useAtlasStore.getState().recommendations.find((r) => r.id === rec.id)!;
    expect(k).toMatchObject({ status: "excluded", rejectionReason: "Client declined", relatedHoldingId: "h_aapl" });
    expect(outcomes(m, m.useAtlasStore.getState()).readiness.find(([c]) => c === "recommendation_links")![1]).toBe(true);
    roundTrip(m);
  });

  it("deleting a recommendation leaves no proposal reference behind", async () => {
    const m = await load();
    const rec = m.useAtlasStore.getState().recommendations[0];
    m.useAtlasStore.getState().removeRecommendation(rec.id);
    expect(m.useAtlasStore.getState().proposal.recommendationIds).not.toContain(rec.id);
    roundTrip(m);
  });

  it("a backup records its unresolved links; any other broken reference is still rejected", async () => {
    const m = await load();
    m.useAtlasStore.getState().removeHolding("h_aapl");
    const exported = m.exportBackup(m.useAtlasStore.getState(), NOW, ids(m));
    if (!exported.ok) throw new Error(exported.errors.join("; "));
    const b = JSON.parse(exported.text);
    expect(b.engagement.unresolvedLinks).toEqual([expect.objectContaining({ holdingId: "h_aapl" })]);
    const mutate = (fn: (x: any) => void) => {
      const c = structuredClone(b);
      fn(c);
      return JSON.stringify(c);
    };
    // A link that wasn't recorded as unresolved is a corrupt reference.
    const unrecorded = m.parseBackup(mutate((x) => (x.engagement.unresolvedLinks = [])), ids(m));
    expect(unrecorded.ok).toBe(false);
    if (!unrecorded.ok) expect(unrecorded.errors.join(" ")).toMatch(/holding h_aapl/);
    // A recorded link that does resolve is inconsistent.
    const stale = m.parseBackup(mutate((x) => x.engagement.unresolvedLinks.push({ recommendationId: x.engagement.recommendations[1].id, holdingId: x.engagement.recommendations[1].relatedHoldingId })), ids(m));
    expect(stale.ok).toBe(false);
    // The preview says what needs review.
    const parsed = m.parseBackup(exported.text, ids(m));
    if (!parsed.ok) throw new Error(parsed.errors.join("; "));
    expect(m.backupPreview(parsed.backup, m.useAtlasStore.getState(), NOW).incoming.recommendationsNeedingReview).toBe(1);
  });
});

describe("export validates exactly what it writes", () => {
  it("over the size limit: a clear error, nothing truncated, the workspace unchanged", async () => {
    const m = await load();
    const big = "x".repeat(m.BACKUP_MAX_BYTES);
    m.useAtlasStore.getState().setClient({ advisorDiscoveryNotes: big });
    const before = JSON.stringify(m.useAtlasStore.getState());
    const r = m.exportBackup(m.useAtlasStore.getState(), NOW, ids(m));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toMatch(/would be [\d.]+ MB.*limit is 20 MB/i);
    expect(JSON.stringify(m.useAtlasStore.getState())).toBe(before);
    expect(m.useAtlasStore.getState().client.advisorDiscoveryNotes).toHaveLength(big.length);
  });

  it("the byte limit counts UTF-8 bytes, not characters", async () => {
    const m = await load();
    // 7.5 M characters of a 3-byte character: under 20 M characters, over 20 MB.
    m.useAtlasStore.getState().setClient({ advisorDiscoveryNotes: "€".repeat(7_500_000) });
    const r = m.exportBackup(m.useAtlasStore.getState(), NOW, ids(m));
    expect(r.ok).toBe(false);
  });

  it("long text the app permits is exported and restored in full", async () => {
    const m = await load();
    const notes = "Discovery notes. ".repeat(10_000); // 170,000 characters
    m.useAtlasStore.getState().setClient({ advisorDiscoveryNotes: notes });
    const rec = m.useAtlasStore.getState().recommendations[0];
    m.useAtlasStore.getState().upsertRecommendation({ ...rec, rationale: "Because ".repeat(5_000) });
    const { after } = roundTrip(m);
    expect(after.client.advisorDiscoveryNotes).toBe(notes);
    expect(after.recommendations[0].rationale).toBe("Because ".repeat(5_000));
  });

  it("a value restore can't accept (a non-finite amount) stops the export with the field named", async () => {
    const m = await load();
    const h = m.useAtlasStore.getState().holdings[0];
    m.useAtlasStore.getState().upsertHolding({ ...h, nativeMarketValue: Number.NaN });
    const before = JSON.stringify(m.useAtlasStore.getState());
    const r = m.exportBackup(m.useAtlasStore.getState(), NOW, ids(m));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toMatch(new RegExp(`holdings\\.0\\.nativeMarketValue|${h.assetName}`));
    expect(JSON.stringify(m.useAtlasStore.getState())).toBe(before);
  });

  it("a file that can't be read is reported, not thrown", async () => {
    const m = await load();
    const unreadable = { size: 10, name: "x.json", text: () => Promise.reject(new Error("NotReadableError")) } as unknown as File;
    await expect(m.readBackupFile(unreadable, ids(m))).resolves.toEqual({ ok: false, errors: [expect.stringMatching(/couldn't be read/i)] });
    const huge = { size: m.BACKUP_MAX_BYTES + 1, name: "big.json", text: () => Promise.resolve("") } as unknown as File;
    await expect(m.readBackupFile(huge, ids(m))).resolves.toMatchObject({ ok: false });
  });
});

describe("every export from the supported workflows restores with the same results", () => {
  const extraction = (accounts: ExtractionResult["accounts"], method = "papaparse"): ExtractionResult => ({ ok: true, accounts, warnings: [], extractionMethod: method, extractionMs: 1 });
  const workflows: [string, (m: Mods) => Promise<void> | void][] = [
    ["the sample workspace", () => undefined],
    ["a new client", (m) => m.useAtlasStore.getState().startNewClient()],
    ["after Reset everything", (m) => m.useAtlasStore.getState().clearAll()],
    [
      "an imported statement (PDF)",
      async (m) => {
        const { readPdfInNode } = await import("@/ingestion/pdf/readPdfNode");
        const { parseStatementPdf } = await import("@/ingestion/documents/parseStatementPdf");
        const { extractionToWorkspace } = await import("@/ingestion/documents/toWorkspace");
        const { ISSUE_29_LINES, textPdf } = await import("./fixtures/syntheticStatementPdf");
        m.useAtlasStore.getState().loadImportedEngagement(extractionToWorkspace(parseStatementPdf(await readPdfInNode(textPdf(ISSUE_29_LINES)), "QA"), { fileName: "statement.pdf", reportingCurrency: "USD" }));
      },
    ],
    [
      "an incomplete holdings report added to the sample",
      async (m) => {
        const { readPdfInNode } = await import("@/ingestion/pdf/readPdfNode");
        const { parseStatementPdf } = await import("@/ingestion/documents/parseStatementPdf");
        const { extractionToWorkspace } = await import("@/ingestion/documents/toWorkspace");
        const { syntheticReportPdf } = await import("./fixtures/syntheticHoldingsReport");
        m.useAtlasStore.getState().addImportedToEngagement(extractionToWorkspace(parseStatementPdf(await readPdfInNode(syntheticReportPdf()), "R"), { fileName: "report.pdf", reportingCurrency: "USD" }));
      },
    ],
    [
      "a financial plan",
      async (m) => {
        const { parseStatementPdf } = await import("@/ingestion/documents/parseStatementPdf");
        const { extractionToWorkspace } = await import("@/ingestion/documents/toWorkspace");
        const { PLAN_PDF } = await import("./fixtures/financialPlanSample");
        m.useAtlasStore.getState().loadImportedEngagement(extractionToWorkspace(parseStatementPdf(PLAN_PDF, "plan"), { fileName: "plan.pdf", reportingCurrency: "USD" }));
      },
    ],
    [
      "custodian CSV exports",
      async (m) => {
        const { parseCsvText } = await import("@/ingestion/parsers/parseCsv");
        const { extractionToWorkspace } = await import("@/ingestion/documents/toWorkspace");
        const { SCHWAB_STYLE, SWISS_SEMICOLON } = await import("./fixtures/custodianExports");
        for (const [text, name] of [[SCHWAB_STYLE, "schwab.csv"], [SWISS_SEMICOLON, "swiss.csv"]] as const) {
          m.useAtlasStore.getState().addImportedToEngagement(extractionToWorkspace(extraction([parseCsvText(text, name).account]), { fileName: name, reportingCurrency: "USD", sourceType: "csv" }));
        }
      },
    ],
    ["stale rates confirmed", (m) => m.useAtlasStore.getState().confirmFxRates()],
    [
      "recommendations approved, rejected, reopened and deleted",
      (m) => {
        const st = m.useAtlasStore.getState();
        st.approveAllRecommendations();
        st.rejectRecommendation(st.recommendations[1].id, "Not now");
        st.reopenRecommendation(st.recommendations[1].id);
        st.rejectRecommendation(st.recommendations[2].id);
        st.removeRecommendation(st.recommendations[3].id);
      },
    ],
    [
      "holdings and accounts deleted under approved recommendations",
      (m) => {
        const st = m.useAtlasStore.getState();
        st.approveAllRecommendations();
        st.removeHolding("h_aapl");
        st.removeAccount(st.holdings.find((h) => h.id === "h_chf_nestle")!.accountId);
      },
    ],
    [
      "a value confirmed, overridden and an insight dismissed",
      (m) => {
        const st = m.useAtlasStore.getState();
        st.setHoldingsVerification([st.holdings[0].id], "advisor_approved");
        st.patchHolding(st.holdings[1].id, { nativeMarketValue: 12_345.67, valuationSource: { kind: "advisor_override", asOf: NOW.toISOString(), confidence: "high" } });
        st.dismissInsight({ key: "k1", title: "Concentration", reason: "Known", dismissedAt: NOW.toISOString() });
        st.recordPdfJob({ id: "pdf1", proposalId: st.proposal.id, variant: "draft", startedAt: NOW.toISOString(), completedAt: NOW.toISOString(), status: "succeeded", filename: "SAMPLE_Draft.pdf" });
      },
    ],
  ];

  for (const [name, setup] of workflows) {
    it(name, async () => {
      const m = await load();
      await setup(m);
      const { before, after } = roundTrip(m);
      expect(outcomes(m, after)).toEqual(outcomes(m, before));
      expect(after.recommendations).toEqual(before.recommendations);
      expect(after.accounts).toEqual(before.accounts);
      expect(after.sourceDocuments.map((d) => [d.id, d.importCompleteness])).toEqual(before.sourceDocuments.map((d) => [d.id, d.importCompleteness ?? m.importCompletenessOf(d)]));
    });
  }
});
