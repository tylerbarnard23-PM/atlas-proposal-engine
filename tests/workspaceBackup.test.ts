import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FxRate, Holding, PdfGenerationJob, Recommendation, SourceDocument } from "@/domain/types";

// R23a (#55): a versioned, browser-local backup of the current workspace, and
// a restore that validates the whole file and previews it before replacing
// anything, all or nothing. The store runs against an in-memory localStorage
// so saving, a failed save and a reload are exercised for real.

const storage = vi.hoisted(() => {
  const data = new Map<string, string>();
  const s = {
    failWrites: false,
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => {
      if (s.failWrites) throw Object.assign(new Error("The quota has been exceeded."), { name: "QuotaExceededError" });
      data.set(k, String(v));
    },
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

const KEY = "atlas-proposal-engine";
const NOW = new Date("2026-10-22T12:00:00Z");
const OLD = "2026-04-30T00:00:00Z";

async function load() {
  const store = await import("@/store/useStore");
  const backup = await import("@/engines/workspaceBackup");
  const { normalizeHoldings } = await import("@/engines/normalizationEngine");
  const { valuationSummary } = await import("@/engines/valuationTotals");
  const { applyRecommendationsToProposed } = await import("@/engines/proposalEngine");
  const { evaluateWorkspaceReadiness } = await import("@/engines/complianceEngine");
  const { fxFreshness, confirmStaleRates } = await import("@/engines/fxPolicy");
  const { DISCLOSURE_LIBRARY } = await import("@/domain/disclosureLibrary");
  return { ...store, ...backup, normalizeHoldings, valuationSummary, applyRecommendationsToProposed, evaluateWorkspaceReadiness, fxFreshness, confirmStaleRates, DISCLOSURE_LIBRARY };
}
type Mods = Awaited<ReturnType<typeof load>>;

// A workspace exercising every supported part: the sample engagement, plus an
// imported statement whose import was incomplete (recorded only in its
// extraction, as before #29 stored the flag), a recommendation with an open
// currency review, an FX confirmation and refresh record, dismissed insights,
// PDF history and a firm logo.
function richWorkspace(m: Mods) {
  const s = m.useAtlasStore.getState();
  const doc: SourceDocument = {
    id: "sd_legacy",
    fileName: "statement-2026-04.pdf",
    sourceType: "pdf_text",
    sizeBytes: 48_213,
    uploadedAt: "2026-05-01T14:03:00.000Z",
    statementDate: "2026-04-30",
    extractionStatus: "extracted",
    extractionMethod: "pdf-table",
    extractionConfidence: "medium",
    pageCount: 3,
    rawTextSample: "ACCOUNT 1234 … private statement text",
    extraction: {
      ok: true,
      accounts: [
        {
          id: "ea1",
          accountName: "Imported brokerage",
          holdings: [
            {
              id: "eh1",
              assetName: "Imported Fund",
              marketValue: 1_000,
              fields: {},
              warnings: [],
              confidence: "high",
              sourceTrace: { sourceType: "pdf_text", rawText: "IMPORTED FUND 1,000.00" },
              status: "extracted",
            },
          ],
          fields: {},
          warnings: [],
          confidence: "high",
        },
      ],
      warnings: [],
      extractionMethod: "pdf-table",
      extractionMs: 120,
      documentKind: "statement_table",
      clientNameDetected: "Private Name",
      asOfDate: "2026-04-30",
      pageCount: 3,
      reconciliation: { status: "mismatch", assetsStated: 1_500, assetsExtracted: 1_000, liabilitiesExtracted: 0, netWorthStated: 1_500, netWorthExtracted: 1_000, tolerance: 1, currency: "USD" },
    },
  };
  const imported: Holding = {
    ...s.holdings[0],
    id: "h_imported",
    assetName: "Imported Fund",
    identifier: undefined,
    nativeMarketValue: 1_000,
    valuationDate: OLD, // a legacy calendar date stored as UTC midnight
    sourceTrace: { sourceType: "pdf_text", sourceDocumentId: "sd_legacy", rawText: "IMPORTED FUND 1,000.00" },
  };
  const review: Recommendation = {
    ...s.recommendations[0],
    id: "rec_review",
    approvedByAdvisor: true,
    includeInPdf: true,
    status: "approved",
    currencyReview: { legacyLabel: "EUR", calculatedIn: "USD", status: "open", migratedAt: "2026-10-20T00:00:00.000Z" },
  };
  const jobs: PdfGenerationJob[] = [
    { id: "pdf_done", proposalId: s.proposal.id, variant: "draft", startedAt: "2026-10-21T10:00:00.000Z", completedAt: "2026-10-21T10:00:05.000Z", status: "succeeded", filename: "SAMPLE_Draft.pdf" },
    { id: "pdf_orphan", proposalId: s.proposal.id, variant: "final", startedAt: "2026-10-21T11:00:00.000Z", status: "running" },
  ];
  const workspace = {
    holdings: [...s.holdings, imported],
    recommendations: [...s.recommendations.map((r) => ({ ...r, approvedByAdvisor: true, includeInPdf: true, status: "approved" as const })), review],
    sourceDocuments: [doc],
    dismissedInsights: [{ key: "concentration:h_aapl", title: "Apple Inc. is 20% of investible assets", reason: "Client intends to hold", dismissedAt: "2026-10-20T15:00:00.000Z" }],
    pdfHistory: jobs,
    fxRefresh: { at: "2026-10-21T09:00:00.000Z", ok: false, provider: "Frankfurter (ECB reference rates)", error: "HTTP 503", requested: ["EUR"], updated: [], retained: [], manualKept: [] },
    advisor: { ...s.advisor, accentColor: "#1F3F6E", logoDataUrl: undefined },
  };
  m.useAtlasStore.setState(workspace);
  const confirmation = m.confirmStaleRates({ ...stateInputs(m), now: NOW });
  m.useAtlasStore.setState({ fxConfirmation: confirmation });
  return m.useAtlasStore.getState();
}

const stateInputs = (m: Mods) => {
  const s = m.useAtlasStore.getState();
  return { holdings: s.holdings, accounts: s.accounts, recommendations: s.recommendations, fxRates: s.fxRates, reportingCurrency: s.client.proposalOutputCurrency };
};

// Everything the app shows or gates on, at a fixed time.
function outcomes(m: Mods, s: ReturnType<Mods["useAtlasStore"]["getState"]>, now = NOW) {
  const holdings = m.normalizeHoldings(s.holdings, s.fxRates, s.client.proposalOutputCurrency);
  const fx = { reportingCurrency: s.client.proposalOutputCurrency, rates: s.fxRates, now };
  const approved = s.recommendations.filter((r) => r.approvedByAdvisor);
  return {
    valuation: m.valuationSummary(holdings),
    reporting: holdings.map((h) => [h.id, h.reportingMarketValue]),
    proposed: m.applyRecommendationsToProposed(holdings, approved, s.accounts, fx).holdings.map((h) => [h.id, h.reportingMarketValue]),
    readiness: m.evaluateWorkspaceReadiness({ client: s.client, advisor: s.advisor, accounts: s.accounts, holdings, recommendations: s.recommendations, disclosures: s.disclosures, fxRates: s.fxRates, sourceDocuments: s.sourceDocuments, fxConfirmation: s.fxConfirmation, now }),
    fx: m.fxFreshness({ ...stateInputs(m), confirmation: s.fxConfirmation, now }).confirmation.state,
  };
}

const exportText = (m: Mods) => m.serializeBackup(m.createBackup(m.useAtlasStore.getState(), NOW));

beforeEach(() => {
  vi.resetModules();
  storage.clear();
  storage.failWrites = false;
});
afterEach(() => {
  storage.failWrites = false;
});

describe("export", () => {
  it("writes a versioned envelope with an explicit allowlist and lists what it leaves out", async () => {
    const m = await load();
    richWorkspace(m);
    const b = JSON.parse(exportText(m));
    expect(Object.keys(b).sort()).toEqual(["engagement", "exportedAt", "firm", "format", "notice", "omitted", "schemaVersion", "workspaceVersion"]);
    expect(b).toMatchObject({ format: "atlas-workspace-backup", schemaVersion: 1, workspaceVersion: 6, exportedAt: NOW.toISOString() });
    expect(Object.keys(b.engagement).sort()).toEqual(
      ["accounts", "client", "dismissedInsights", "fxConfirmation", "fxRates", "fxRefresh", "holdings", "pdfHistory", "proposal", "proposalSections", "recommendations", "sourceDocuments"].sort()
    );
    expect(Object.keys(b.firm)).toEqual(["advisor"]);
    expect(b.notice).toMatch(/not encrypted/i);
    expect(b.notice).not.toMatch(/\bsecure\b(?! for)/i);
    expect(b.omitted.join(" ")).toMatch(/original source files/i);
    // Source documents: metadata, the frozen completeness and an extraction summary; never rows or raw text.
    const [doc] = b.engagement.sourceDocuments;
    expect(doc.importCompleteness).toMatchObject({ status: "incomplete", reason: "total_mismatch", stated: 1_500, extracted: 1_000 });
    expect(doc.extraction).toEqual({ ok: true, extractionMethod: "pdf-table", extractionMs: 120, documentKind: "statement_table", asOfDate: "2026-04-30", pageCount: 3, reconciliation: expect.objectContaining({ status: "mismatch" }) });
    expect(doc.rawTextSample).toBeUndefined();
    const text = exportText(m);
    for (const secret of ["private statement text", "Private Name", "ANTHROPIC", "apiKey"]) expect(text).not.toContain(secret);
    // Derived and runtime state stay out.
    expect(b.engagement.holdings.some((h: Holding) => "reportingMarketValue" in h)).toBe(false);
    expect(b.engagement.pdfHistory.map((j: PdfGenerationJob) => j.id)).toEqual(["pdf_done"]);
    expect(text).not.toMatch(/"(hasHydrated|insights|marketDataByIdentifier|disclosures)":/); // as keys (a section is named "disclosures")
  });

  it("uses a generic filename without client identity", async () => {
    const m = await load();
    const name = m.backupFileName(new Date(2026, 9, 22, 9, 0)); // local date
    expect(name).toBe("atlas-workspace-backup-2026-10-22.json");
    expect(name).not.toMatch(/blackwell/i);
  });
});

describe("round trip", () => {
  it("restores every supported record, ID and link, with the same financial results and safeguards", async () => {
    const m = await load();
    const before = richWorkspace(m);
    const expected = outcomes(m, before);
    const text = exportText(m);

    m.useAtlasStore.getState().startNewClient(); // the work is lost…
    expect(m.useAtlasStore.getState().holdings).toEqual([]);
    const firm = m.useAtlasStore.getState().advisor;

    const parsed = m.parseBackup(text, { disclosureIds: m.DISCLOSURE_LIBRARY.map((d) => d.id) });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = m.useAtlasStore.getState().restoreWorkspace(m.restoredState(parsed.backup, { advisor: firm, disclosures: m.DISCLOSURE_LIBRARY }, { replaceFirm: false }));
    expect(result).toEqual({ ok: true });

    const after = m.useAtlasStore.getState();
    const strip = (hs: Holding[]) => hs.map(({ reportingMarketValue: _r, ...h }) => (void _r, h));
    expect(strip(after.holdings)).toEqual(strip(before.holdings));
    expect(after.accounts).toEqual(before.accounts);
    expect(after.recommendations).toEqual(before.recommendations);
    expect(after.client).toEqual(before.client);
    expect(after.fxRates).toEqual(before.fxRates);
    expect(after.fxRefresh).toEqual(before.fxRefresh);
    expect(after.fxConfirmation).toEqual(before.fxConfirmation); // the record as given; never renewed
    expect(after.dismissedInsights).toEqual(before.dismissedInsights);
    expect(after.proposal).toEqual({ ...before.proposal, advisorId: firm.id });
    expect(after.pdfHistory.map((j) => j.id)).toEqual(["pdf_done"]);
    expect(after.sourceDocuments[0]).toMatchObject({ id: "sd_legacy", fileName: "statement-2026-04.pdf", importCompleteness: { status: "incomplete" } });
    expect(after.sourceDocuments[0].extraction?.accounts).toEqual([]);
    expect(after.holdings.find((h) => h.id === "h_imported")!.valuationDate).toBe(OLD); // stored value unchanged
    // Firm settings are shared: kept unless the advisor chooses the backup's.
    expect(after.advisor).toEqual(firm);
    expect(after.disclosures).toEqual(m.DISCLOSURE_LIBRARY);

    // Same values, proposal and gates: the incomplete import and the open
    // currency review still block; the confirmation is still valid now…
    const got = outcomes(m, after);
    expect(got.valuation).toEqual(expected.valuation);
    expect(got.reporting).toEqual(expected.reporting);
    expect(got.proposed).toEqual(expected.proposed);
    expect(got.readiness.filter((c) => c.code !== "advisor_profile").map((c) => [c.code, c.passed, c.detail])).toEqual(
      expected.readiness.filter((c) => c.code !== "advisor_profile").map((c) => [c.code, c.passed, c.detail])
    );
    expect(got.readiness.find((c) => c.code === "imports_complete")!.passed).toBe(false);
    expect(got.readiness.find((c) => c.code === "recommendation_currency")!.passed).toBe(false);
    expect(got.fx).toBe("valid");
    // …and lapses on its own schedule: restoring doesn't renew it.
    expect(outcomes(m, after, new Date(NOW.getTime() + 8 * 86_400_000)).fx).toBe("expired");
  });

  it("a workspace loaded through the real import paths (statement and holdings report) round-trips", async () => {
    const m = await load();
    const { readPdfInNode } = await import("@/ingestion/pdf/readPdfNode");
    const { parseStatementPdf } = await import("@/ingestion/documents/parseStatementPdf");
    const { extractionToWorkspace } = await import("@/ingestion/documents/toWorkspace");
    const { ISSUE_29_LINES, textPdf } = await import("./fixtures/syntheticStatementPdf");
    const { syntheticReportPdf } = await import("./fixtures/syntheticHoldingsReport");
    const statement = extractionToWorkspace(parseStatementPdf(await readPdfInNode(textPdf(ISSUE_29_LINES)), "QA"), { fileName: "statement.pdf", reportingCurrency: "USD" });
    const report = extractionToWorkspace(parseStatementPdf(await readPdfInNode(syntheticReportPdf()), "R"), { fileName: "report.pdf", reportingCurrency: "USD" });
    m.useAtlasStore.getState().loadImportedEngagement(statement);
    m.useAtlasStore.getState().addImportedToEngagement(report);
    const before = m.useAtlasStore.getState();
    expect(before.sourceDocuments).toHaveLength(2);
    const parsed = m.parseBackup(exportText(m), { disclosureIds: m.DISCLOSURE_LIBRARY.map((d) => d.id) });
    if (!parsed.ok) throw new Error(parsed.errors.join("; "));
    const restored = m.restoredState(parsed.backup, { advisor: before.advisor, disclosures: m.DISCLOSURE_LIBRARY }, { replaceFirm: false });
    expect(restored.holdings).toEqual(before.holdings);
    expect(restored.accounts).toEqual(before.accounts);
    expect(restored.sourceDocuments.map((d) => [d.id, d.fileName, d.importCompleteness])).toEqual(before.sourceDocuments.map((d) => [d.id, d.fileName, d.importCompleteness]));
    expect(restored.sourceDocuments.map((d) => d.extraction?.reconciliation)).toEqual(before.sourceDocuments.map((d) => d.extraction?.reconciliation));
  });

  it("the backup's firm settings apply only when chosen", async () => {
    const m = await load();
    const before = richWorkspace(m);
    const text = exportText(m);
    const current = { ...before.advisor, id: "adv_other", firmName: "Other Firm" };
    const parsed = m.parseBackup(text, { disclosureIds: m.DISCLOSURE_LIBRARY.map((d) => d.id) });
    if (!parsed.ok) throw new Error(parsed.errors.join("; "));
    const kept = m.restoredState(parsed.backup, { advisor: current, disclosures: m.DISCLOSURE_LIBRARY }, { replaceFirm: false });
    expect(kept.advisor).toEqual(current);
    expect(kept.proposal.advisorId).toBe("adv_other");
    const replaced = m.restoredState(parsed.backup, { advisor: current, disclosures: m.DISCLOSURE_LIBRARY }, { replaceFirm: true });
    expect(replaced.advisor).toEqual(before.advisor);
    expect(replaced.proposal.advisorId).toBe(before.advisor.id);
  });

  it("survives a reload: the restored workspace is what the saved key holds", async () => {
    const m = await load();
    const before = richWorkspace(m);
    const text = exportText(m);
    m.useAtlasStore.getState().startNewClient();
    const parsed = m.parseBackup(text, { disclosureIds: m.DISCLOSURE_LIBRARY.map((d) => d.id) });
    if (!parsed.ok) throw new Error(parsed.errors.join("; "));
    m.useAtlasStore.getState().restoreWorkspace(m.restoredState(parsed.backup, { advisor: m.useAtlasStore.getState().advisor, disclosures: m.DISCLOSURE_LIBRARY }, { replaceFirm: false }));
    const saved = JSON.parse(storage.getItem(KEY)!);
    expect(saved.version).toBe(6); // the existing key and store version
    // A fresh page: a new store module hydrates from the same key.
    vi.resetModules();
    const fresh = await load();
    await fresh.useAtlasStore.persist.rehydrate();
    const s = fresh.useAtlasStore.getState();
    expect(s.holdings.map((h) => h.id)).toEqual(before.holdings.map((h) => h.id));
    expect(s.fxConfirmation).toEqual(before.fxConfirmation);
    expect(s.sourceDocuments.map((d) => d.id)).toEqual(["sd_legacy"]);
  });
});

describe("restore is validated in full before anything is written", () => {
  const ids = (m: Mods) => ({ disclosureIds: m.DISCLOSURE_LIBRARY.map((d) => d.id) });
  async function setup() {
    const m = await load();
    richWorkspace(m);
    const good = JSON.parse(exportText(m));
    return { m, good };
  }
  const reject = (m: Mods, text: string, pattern: RegExp) => {
    const r = m.parseBackup(text, ids(m));
    expect(r.ok, text.slice(0, 80)).toBe(false);
    if (!r.ok) expect(r.errors.join(" | ")).toMatch(pattern);
  };
  const mutate = (good: Record<string, unknown>, fn: (b: any) => void) => {
    const b = structuredClone(good);
    fn(b);
    return JSON.stringify(b);
  };

  it("corrupt, foreign, oversized and future files", async () => {
    const { m, good } = await setup();
    reject(m, "{ not json", /isn't valid JSON/);
    reject(m, JSON.stringify({ hello: "world" }), /not an Atlas workspace backup/);
    reject(m, mutate(good, (b) => (b.schemaVersion = 2)), /newer version of Atlas/);
    reject(m, mutate(good, (b) => (b.workspaceVersion = 7)), /newer version of Atlas/);
    reject(m, mutate(good, (b) => (b.workspaceVersion = 5)), /not supported/);
    reject(m, mutate(good, (b) => (b.schemaVersion = "1")), /not supported/);
    reject(m, " ".repeat(m.BACKUP_MAX_BYTES + 1), /larger than/);
  });

  it("field types, enums and financial values", async () => {
    const { m, good } = await setup();
    reject(m, mutate(good, (b) => (b.engagement.holdings[0].assetClass = "stonks")), /holdings\.0\.assetClass/);
    reject(m, mutate(good, (b) => (b.engagement.holdings[0].nativeMarketValue = "1000")), /holdings\.0\.nativeMarketValue/);
    reject(m, mutate(good, (b) => (b.engagement.fxRates[0].rate = -1.1)), /fxRates\.0\.rate/);
    reject(m, mutate(good, (b) => (b.engagement.fxRates[0].asOf = "yesterday")), /fxRates\.0\.asOf/);
    reject(m, mutate(good, (b) => (b.engagement.recommendations[0].status = "done")), /recommendations\.0\.status/);
    reject(m, mutate(good, (b) => (b.engagement.holdings[0].currency = "dollars")), /holdings\.0\.currency/);
    reject(m, mutate(good, (b) => (b.engagement.holdings[0].surprise = true)), /holdings\.0.*surprise|Unrecognized key/);
    reject(m, mutate(good, (b) => (b.engagement.holdings[0].reportingMarketValue = 5)), /reportingMarketValue|Unrecognized key/);
    // JSON can't hold Infinity, but 1e400 parses to it.
    reject(m, JSON.stringify(good).replace(/"nativeMarketValue":[0-9.]+/, '"nativeMarketValue":1e400'), /nativeMarketValue/);
    reject(m, mutate(good, (b) => (b.firm.advisor.logoDataUrl = "https://example.com/logo.png")), /logo/i);
  });

  it("unique IDs and reference integrity", async () => {
    const { m, good } = await setup();
    reject(m, mutate(good, (b) => b.engagement.holdings.push(b.engagement.holdings[0])), /Duplicate holding ID/);
    reject(m, mutate(good, (b) => b.engagement.accounts.push(b.engagement.accounts[0])), /Duplicate account ID/);
    reject(m, mutate(good, (b) => (b.engagement.holdings[0].accountId = "acc_missing")), /account acc_missing/);
    reject(m, mutate(good, (b) => (b.engagement.holdings.at(-1).sourceTrace.sourceDocumentId = "sd_missing")), /source document sd_missing/);
    reject(m, mutate(good, (b) => (b.engagement.recommendations[0].relatedHoldingId = "h_missing")), /holding h_missing/);
    reject(m, mutate(good, (b) => (b.engagement.proposal.clientId = "cli_other")), /proposal.*client/i);
    reject(m, mutate(good, (b) => b.engagement.proposal.disclosureIds.push("disc_unknown")), /disclosure disc_unknown/);
    reject(m, mutate(good, (b) => (b.engagement.pdfHistory[0].proposalId = "prop_other")), /PDF job .* proposal/);
  });

  it("a rejected file or a cancelled preview changes nothing", async () => {
    const { m, good } = await setup();
    const memory = JSON.stringify(m.useAtlasStore.getState());
    const saved = storage.getItem(KEY);
    // Rejected:
    expect(m.parseBackup(mutate(good, (b) => (b.engagement.holdings[0].accountId = "x")), ids(m)).ok).toBe(false);
    // Previewed, then cancelled (restoreWorkspace never called):
    const parsed = m.parseBackup(JSON.stringify(good), ids(m));
    if (!parsed.ok) throw new Error(parsed.errors.join("; "));
    const preview = m.backupPreview(parsed.backup, m.useAtlasStore.getState(), NOW);
    expect(preview.incoming.holdings).toBeGreaterThan(0);
    expect(JSON.stringify(m.useAtlasStore.getState())).toBe(memory);
    expect(storage.getItem(KEY)).toBe(saved);
  });

  it("if the browser can't save it, the current workspace stays exactly as it was", async () => {
    const { m, good } = await setup();
    m.useAtlasStore.getState().startNewClient();
    m.useAtlasStore.getState().setClient({ fullName: "Current Work" });
    const memory = JSON.stringify(m.useAtlasStore.getState());
    const saved = storage.getItem(KEY);
    const parsed = m.parseBackup(JSON.stringify(good), ids(m));
    if (!parsed.ok) throw new Error(parsed.errors.join("; "));
    storage.failWrites = true;
    const r = m.useAtlasStore.getState().restoreWorkspace(m.restoredState(parsed.backup, { advisor: m.useAtlasStore.getState().advisor, disclosures: m.DISCLOSURE_LIBRARY }, { replaceFirm: false }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/couldn't save.*nothing was changed/i);
    expect(JSON.stringify(m.useAtlasStore.getState())).toBe(memory);
    expect(storage.getItem(KEY)).toBe(saved);
  });
});

describe("preview", () => {
  it("describes the incoming workspace and exactly what it replaces", async () => {
    const m = await load();
    richWorkspace(m);
    const text = exportText(m);
    m.useAtlasStore.getState().startNewClient();
    m.useAtlasStore.getState().setClient({ fullName: "Current Work" });
    const parsed = m.parseBackup(text, { disclosureIds: m.DISCLOSURE_LIBRARY.map((d) => d.id) });
    if (!parsed.ok) throw new Error(parsed.errors.join("; "));
    const p = m.backupPreview(parsed.backup, m.useAtlasStore.getState(), new Date(NOW.getTime() + 8 * 86_400_000));
    expect(p.incoming).toMatchObject({
      clientName: "Jonathan & Helena Blackwell",
      reportingCurrency: "USD",
      exportedAt: NOW.toISOString(),
      accounts: parsed.backup.engagement.accounts.length,
      holdings: parsed.backup.engagement.holdings.length,
      recommendations: parsed.backup.engagement.recommendations.length,
      sourceFilesNotIncluded: ["statement-2026-04.pdf"],
      fxConfirmation: "expired", // as evaluated now, not as recorded
    });
    expect(p.incoming.valuation.complete).toBe(true);
    expect(p.current).toMatchObject({ clientName: "Current Work", holdings: 0, accounts: 0 });
    expect(p.firm).toMatchObject({ keptFirmName: m.useAtlasStore.getState().advisor.firmName });
    expect(p.omitted.length).toBeGreaterThan(3);
  });
});

// Keep the FxRate import used (type-only in some paths).
export type _Rate = FxRate;
