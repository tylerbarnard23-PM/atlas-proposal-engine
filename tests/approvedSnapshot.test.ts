import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Account, ApprovedSnapshot, FxRate, Holding } from "@/domain/types";

vi.mock("puppeteer-core", async () => (await import("./support/fakeChromium")).puppeteerModule);
vi.mock("@/pdf/chromiumPath", async () => (await import("./support/fakeChromium")).chromiumPathModule);

// D3 — review once, present consistently. Approved versions through the real
// store, shared evaluator and readiness, template, final-PDF route and backup
// paths, on the committed synthetic managed-account story plus a EUR fund so
// an exchange rate is in use. Synthetic data only.

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

const NOW = new Date("2026-10-26T12:00:00Z");
const ACC = "acc_uma_story";
const C = "sleeve_acc_uma_story_str_etf_c_r1";

const EUR_ACCOUNT: Account = { id: "acc_eur_story", name: "Euro Account (synthetic)", type: "brokerage", baseCurrency: "EUR", country: "DE", createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z" };
const EUR_FUND: Holding = {
  id: "h_eur_fund",
  accountId: EUR_ACCOUNT.id,
  assetName: "Euro Equity Fund (synthetic)",
  assetType: "mutual_fund",
  assetClass: "equity",
  country: "DE",
  currency: "EUR",
  nativeMarketValue: 10_000,
  expenseRatioPct: 0.2,
  valuationDate: "2026-09-30",
  valuationSource: { kind: "statement", asOf: "2026-09-30", confidence: "high" },
  quoteType: "manual",
  priceFreshness: "manual",
  dataQuality: [],
  advisorVerification: "advisor_reviewed",
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
};
const EURUSD: FxRate = { base: "EUR", quote: "USD", rate: 1.1, asOf: "2026-10-25T00:00:00.000Z", source: "ECB" };

async function load() {
  return {
    ...(await import("@/store/useStore")),
    ...(await import("@/engines/allocationDesk")),
    ...(await import("@/engines/strategyProposals")),
    ...(await import("@/engines/workspaceBackup")),
    ...(await import("@/engines/normalizationEngine")),
    ...(await import("@/engines/approvedSnapshot")),
    ...(await import("@/engines/snapshotRecord")),
    ...(await import("@/engines/costIncome")),
    ...(await import("@/pdf/templates/ProposalPdfTemplate")),
    ...(await import("@/data/umaStory")),
    ...(await import("@/domain/disclosureLibrary")),
    // The route loads the faked browser after each module reset; read that instance.
    fake: (await import("./support/fakeChromium")).chromium,
  };
}
type M = Awaited<ReturnType<typeof load>>;

beforeEach(() => {
  vi.resetModules();
  storage.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
beforeEach(async () => (await import("./support/fakeChromium")).chromium.reset());
afterEach(() => {
  vi.useRealTimers();
});

const store = (m: M) => m.useAtlasStore.getState();
const json = (v: unknown) => JSON.parse(JSON.stringify(v));

/** The managed-account story, pinned to the 40/35/20/5 model, funded, reviewed and approved: every readiness check passes. */
function approvedStory(m: M) {
  store(m).startNewClient();
  m.useAtlasStore.setState({
    client: { ...store(m).client, fullName: "Managed Story Household", proposalOutputCurrency: "USD" },
    accounts: [m.UMA_ACCOUNT, EUR_ACCOUNT],
    holdings: [m.UMA_CASH, EUR_FUND],
    recommendations: [],
    fxRates: [EURUSD],
  });
  store(m).setDraftScope([ACC]);
  store(m).setAccountFunding(ACC, { cashHoldingId: "h_uma_cash", reserve: 5_000, reserveCurrency: "USD" });
  store(m).addSyntheticLibrary();
  store(m).pinModel({ id: "mdl_uma_core", revision: 1 });
  const s = store(m);
  const plan = m.sleevePlan({
    model: m.UMA_STRATEGY_MODEL,
    strategies: s.strategies,
    basis: m.accountBasis({ account: s.accounts.find((a) => a.id === ACC), holdings: m.normalizeHoldings(s.holdings, s.fxRates, "USD"), fx: { reportingCurrency: "USD", rates: s.fxRates } }),
  });
  store(m).addDraftEdit(m.sleevePurchases({ plan, accountId: ACC, ids: { group: "grp_story", rec: (sid) => `rec_story_${sid}` }, now: NOW.toISOString() }));
  for (const id of store(m).workingDraft.memberIds) {
    const r = store(m).recommendations.find((x) => x.id === id)!;
    store(m).upsertRecommendation({ ...r, approvedByAdvisor: true, status: "approved", includeInPdf: true });
  }
  const cRec = store(m).recommendations.find((r) => r.destination?.id === C)!;
  store(m).recordSleeveReview(cRec.id, "No published minimum; reviewed with the sponsor's terms (synthetic).");
}

function approve(m: M, note?: string): ApprovedSnapshot {
  const r = store(m).approveVersion(note);
  if (!r.ok) throw new Error(r.failing.join("; "));
  return r.snapshot;
}

const render = async (m: M, s: ApprovedSnapshot, presentation: "meeting" | "issued" | "draft_copy" = "meeting", issuedAt?: string) => {
  const React = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  return renderToStaticMarkup(React.createElement(m.ProposalPdfTemplate, m.snapshotTemplateProps(s, { variant: presentation === "draft_copy" ? "draft" : "final", presentation, issuedAt, timeZone: "UTC" })));
};
const text = (html: string) =>
  html.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ");

async function post(body: object, variant: "draft" | "final" = "final") {
  const { POST } = await import("@/app/api/proposals/[id]/generate-pdf/route");
  const res = await POST(new Request(`http://localhost/api/proposals/p1/generate-pdf?variant=${variant}`, { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ id: "p1" }) });
  const out = { status: res.status, filename: res.headers.get("X-Filename"), error: "" as string, failing: [] as string[] };
  if (res.status !== 200) {
    const j = await res.json();
    out.error = j.error;
    out.failing = j.failing ?? [];
  }
  return out;
}

describe("approving a version", () => {
  it("is refused while readiness fails, and creates or changes nothing", async () => {
    const m = await load();
    approvedStory(m);
    const cRec = store(m).recommendations.find((r) => r.destination?.id === C)!;
    // An unreviewed minimum: strategy_terms fails.
    m.useAtlasStore.setState({ recommendations: store(m).recommendations.map((r) => (r.id === cRec.id ? { ...r, destination: { ...r.destination!, strategy: { ...r.destination!.strategy!, review: undefined } } } : r)) });
    const before = json({ recs: store(m).recommendations, draft: store(m).workingDraft, holdings: store(m).holdings });
    const r = store(m).approveVersion("try");
    expect(r).toEqual({ ok: false, failing: ["Strategy minimums supplied or reviewed"] });
    expect(store(m).snapshots).toEqual([]);
    expect(json({ recs: store(m).recommendations, draft: store(m).workingDraft, holdings: store(m).holdings })).toEqual(before);
  });

  it("freezes scope, values, rates, ordered actions, funding, library revisions, results and identity, and changes nothing else", async () => {
    const m = await load();
    approvedStory(m);
    const before = json({ recs: store(m).recommendations, draft: store(m).workingDraft, alternatives: store(m).alternatives, holdings: store(m).holdings, accounts: store(m).accounts });
    const s = approve(m, "Reviewed with the household (synthetic).");
    expect(json({ recs: store(m).recommendations, draft: store(m).workingDraft, alternatives: store(m).alternatives, holdings: store(m).holdings, accounts: store(m).accounts })).toEqual(before);
    expect(s).toMatchObject({
      version: 1,
      approvedAt: NOW.toISOString(),
      approvedBy: { advisorId: store(m).advisor.id, name: store(m).advisor.name },
      note: "Reviewed with the household (synthetic).",
      alternative: { id: store(m).workingDraft.id, name: "Working draft", scopeAccountIds: [ACC], model: { id: "mdl_uma_core", revision: 1 } },
    });
    // Approved actions in saved order, the pinned model and every strategy revision they use.
    expect(s.inputs.recommendations.map((r) => [r.destination?.strategy?.id, r.actionAmount])).toEqual([["str_equity_a", 40_000], ["str_fixed_b", 35_000], ["str_etf_c", 20_000]]);
    expect(s.inputs.models.map((x) => `${x.id}@${x.revision}`)).toEqual(["mdl_uma_core@1"]);
    expect(s.inputs.strategies.map((x) => `${x.id}@${x.revision}`).sort()).toEqual(["str_equity_a@1", "str_etf_c@1", "str_fixed_b@1"]);
    expect(s.inputs.accounts.find((a) => a.id === ACC)!.funding).toEqual({ cashHoldingId: "h_uma_cash", reserve: 5_000, reserveCurrency: "USD" });
    // Exact FX inputs: the rate in use, with its own date and source.
    expect(s.inputs.fxRates).toEqual([EURUSD]);
    expect(s.alternative.inputBasis.rates).toEqual([{ base: "EUR", quote: "USD", rate: 1.1, asOf: EURUSD.asOf, source: "ECB" }]);
    expect(s.alternative.inputBasis.values.map((v) => [v.holdingId, v.amount, v.currency, v.date])).toEqual([["h_eur_fund", 10_000, "EUR", "2026-09-30"], ["h_uma_cash", 100_000, "USD", "2026-09-30"]]);
    // Disclosures frozen with their text.
    expect(s.inputs.disclosures.length).toBeGreaterThan(0);
    expect(s.inputs.disclosures.every((d) => d.body.length > 0)).toBe(true);
    // Results from the shared evaluator over the scope: 100,000 → 40/35/20 sleeves (custom) + 5,000 cash.
    expect(s.results).toEqual({
      reportingCurrency: "USD",
      current: { total: 100_000, byClass: [{ assetClass: "cash", value: 100_000 }] },
      proposed: { total: 100_000, byClass: [{ assetClass: "cash", value: 5_000 }, { assetClass: "custom", value: 95_000 }] },
      blocked: 0,
      unresolved: 0,
    });
    expect(m.snapshotResults(s)).toEqual(s.results);
    expect(m.snapshotIntegrity(s)).toBeNull();
    expect(m.snapshotStatus(s, store(m), NOW)).toEqual({ kind: "matches" });
  });

  it("is distinct from action approvals: removing an approval later keeps the version; a new version needs readiness again", async () => {
    const m = await load();
    approvedStory(m);
    const v1 = json(approve(m));
    for (const r of store(m).recommendations) store(m).upsertRecommendation({ ...r, approvedByAdvisor: false, status: "draft" });
    expect(json(store(m).snapshots[0])).toEqual(v1);
    expect(m.snapshotStatus(store(m).snapshots[0], store(m), NOW)).toMatchObject({ kind: "changed", parts: expect.arrayContaining(["approved actions"]) });
    expect(store(m).approveVersion()).toMatchObject({ ok: false, failing: expect.arrayContaining(["At least one approved recommendation included in PDF"]) });
    expect(store(m).snapshots).toHaveLength(1);
  });
});

describe("later edits never rewrite an approved version", () => {
  it("holding values, exchange rates, library revisions, model pins, action text and deletions leave v1 and its outputs as approved", async () => {
    const m = await load();
    approvedStory(m);
    const v1 = approve(m);
    const frozen = json(v1);
    const meetingBefore = await render(m, v1);

    // Library: a new revision of a strategy in use (the pin still names revision 1): the package is unchanged.
    const eq = m.UMA_STRATEGIES[0];
    expect(store(m).saveStrategy({ id: eq.id, manager: eq.manager, name: eq.name, strategyType: eq.strategyType, currency: eq.currency, minimum: 30_000, fees: eq.fees, mix: eq.mix, provenance: "synthetic" })).toEqual([]);
    expect(m.snapshotStatus(store(m).snapshots[0], store(m), NOW)).toEqual({ kind: "matches" });

    // Values and rates.
    store(m).patchHolding("h_uma_cash", { nativeMarketValue: 120_000 });
    store(m).setFxRates([{ ...EURUSD, rate: 1.25, asOf: "2026-10-26T00:00:00.000Z" }]);
    // An action's text, and the model pin.
    const first = store(m).recommendations[0];
    store(m).upsertRecommendation({ ...first, rationale: "Edited after approval." });
    store(m).pinModel(null);
    // A deleted holding.
    store(m).removeHolding("h_eur_fund");

    const v1After = store(m).snapshots[0];
    expect(json(v1After)).toEqual(frozen);
    expect(m.snapshotIntegrity(v1After)).toBeNull();
    expect(await render(m, v1After)).toBe(meetingBefore);
    const status = m.snapshotStatus(v1After, store(m), NOW);
    expect(status.kind).toBe("changed");
    expect(status.kind === "changed" && status.parts).toEqual(expect.arrayContaining(["holdings", "exchange rates", "approved actions", "model revision", "alternative, scope or targets"]));
    // The meeting view still shows the approved values, not the edited ones.
    const t = text(meetingBefore);
    expect(t).not.toMatch(/Edited after approval/);
    expect(t).toMatch(/EUR\/USD 1\.1 \(ECB, 2026-10-25\)/);
  });

  it("approving again creates v2 and keeps v1", async () => {
    const m = await load();
    approvedStory(m);
    const v1 = json(approve(m));
    vi.setSystemTime(new Date(NOW.getTime() + 60_000));
    store(m).patchHolding("h_eur_fund", { nativeMarketValue: 12_000 });
    // Each change is reported once: a value edit is "holdings", not also the alternative.
    expect(m.snapshotStatus(store(m).snapshots[0], store(m), NOW)).toEqual({ kind: "changed", parts: ["holdings"] });
    const v2 = approve(m);
    expect(store(m).snapshots.map((x) => x.version)).toEqual([1, 2]);
    expect(json(store(m).snapshots[0])).toEqual(v1);
    expect(v2.fingerprint).not.toBe(v1.fingerprint);
    expect(v2.inputs.holdings.find((h) => h.id === "h_eur_fund")!.nativeMarketValue).toBe(12_000);
  });
});

describe("one template: meeting view, issued PDF and draft copy agree", () => {
  it("the meeting view and the final PDF from v1 render the same document, apart from the line saying how it is shown", async () => {
    const m = await load();
    approvedStory(m);
    const v1 = approve(m);
    const meeting = await render(m, v1, "meeting");
    vi.setSystemTime(new Date(NOW.getTime() + 3_600_000));
    // The workspace changes after approval; the document is from the version only.
    store(m).patchHolding("h_uma_cash", { nativeMarketValue: 1 });
    const res = await post({ snapshot: store(m).snapshots[0], timeZone: "UTC" });
    expect(res).toMatchObject({ status: 200, filename: "SAMPLE_Managed_Story_Household_Wealth_Proposal_v1_2026-10-26.pdf" });
    expect(m.fake.launches).toBe(1);
    const pdfBody = m.fake.html[0].slice(m.fake.html[0].indexOf("<body>") + 6, m.fake.html[0].lastIndexOf("</body>"));
    const meta = m.snapshotTemplateProps(v1, { variant: "final", presentation: "meeting", timeZone: "UTC" }).snapshot!;
    const issuedLine = m.snapshotMarker({ ...meta, presentation: "issued", issuedAt: new Date(NOW.getTime() + 3_600_000).toISOString() }, "UTC");
    const meetingLine = m.snapshotMarker(meta, "UTC");
    expect(pdfBody).toContain(issuedLine.replace(/'/g, "&#x27;"));
    expect(meeting).toContain(meetingLine);
    const neutral = (html: string, line: string) => html.split(line.replace(/'/g, "&#x27;")).join("[marker]").split(line).join("[marker]");
    expect(neutral(pdfBody, issuedLine)).toBe(neutral(meeting, meetingLine));
    // What the version states.
    const t = text(meeting);
    expect(t).toMatch(/Viewing approved version 1 \(approved .* by .*\)\. Read-only meeting view: not an issued document\./);
    expect(t).toMatch(/Reviewed Package/);
    expect(t).toMatch(/Approved actions, in order/);
    expect(t).toMatch(/1 Fund sleeve: buy USD 40,000 of Equity Manager A — Core Equity \(rev 1\)/);
    expect(t).toMatch(/Managed Account Story \(synthetic\): eligible cash Cash awaiting allocation, reserve \$5,000(\.00)?; after the approved actions \$5,000(\.00)?\./);
    expect(t).toMatch(/Readiness at approval: (\d+) of \1 checks passed\./);
    expect(t).toContain(v1.fingerprint);
    expect(t).not.toMatch(/NaN|undefined/);
  });

  it("shows the D2a package: pinned model, target versus funded, minimums and reviews, supplied fees, exposure with coverage", async () => {
    const m = await load();
    approvedStory(m);
    const t = text(await render(m, approve(m)));
    expect(t).toMatch(/Manager and Strategy Sleeves/);
    expect(t).toMatch(/Pinned model: Core managed allocation \(synthetic\) \(rev 1\)/);
    expect(t).toMatch(/Equity Manager A — Core Equity \(rev 1\) Managed Account Story \(synthetic\) \$40,000(\.00)? \(40\.0%\) \$40,000(\.00)? Met \(\$25,000(\.00)?\) manager 0\.45% of assets in the sleeve/);
    expect(t).toMatch(/ETF Model C — Balanced ETF Model \(rev 1\).*Not supplied; advisor review recorded: No published minimum/);
    expect(t).toMatch(/platform 0\.10% of assets in the sleeve; instrument 0\.08% of underlying ETF assets/);
    expect(t).toMatch(/Look-through exposure of the proposed assets/);
    expect(t).toMatch(/Coverage: 100\.0% of the proposed value has a known asset class/);
    expect(t).toMatch(/look-through exposure, where a mix was supplied, and its target, funding, minimum and fees are under Manager and Strategy Sleeves/);
  });

  it("a sleeve with no supplied mix is Unknown, not spread over the known classes", async () => {
    const m = await load();
    approvedStory(m);
    // A strategy revision without a mix, pinned through a new model revision.
    m.useAtlasStore.setState({ recommendations: [], workingDraft: { ...store(m).workingDraft, memberIds: [] } });
    const c = m.UMA_STRATEGIES[2];
    store(m).saveStrategy({ id: c.id, manager: c.manager, name: c.name, strategyType: c.strategyType, currency: c.currency, minimum: 10_000, fees: c.fees, mix: null, provenance: "synthetic" });
    const model = m.UMA_STRATEGY_MODEL;
    store(m).saveModel({ id: model.id, name: model.name, kind: "strategy", strategyWeights: model.strategyWeights!.map((w) => (w.strategyId === c.id ? { ...w, strategyRevision: 2 } : w)), cashWeight: model.cashWeight, provenance: "synthetic" });
    store(m).pinModel({ id: model.id, revision: 2 });
    const s = store(m);
    const m2 = m.findRevision(s.models, model.id, 2)!;
    const plan = m.sleevePlan({ model: m2, strategies: s.strategies, basis: m.accountBasis({ account: s.accounts.find((a) => a.id === ACC), holdings: m.normalizeHoldings(s.holdings, s.fxRates, "USD"), fx: { reportingCurrency: "USD", rates: s.fxRates } }) });
    store(m).addDraftEdit(m.sleevePurchases({ plan, accountId: ACC, ids: { group: "grp_two", rec: (sid) => `rec_two_${sid}` }, now: NOW.toISOString() }));
    for (const id of store(m).workingDraft.memberIds) {
      const r = store(m).recommendations.find((x) => x.id === id)!;
      store(m).upsertRecommendation({ ...r, approvedByAdvisor: true, status: "approved", includeInPdf: true });
    }
    const v = approve(m);
    expect(v.inputs.strategies.find((x) => x.id === c.id)).toMatchObject({ revision: 2, mix: null });
    const t = text(await render(m, v));
    // 20,000 of 111,000 household proposed assets (100,000 + EUR 10,000 at 1.1).
    expect(t).toMatch(/Unknown \(1 sleeve with no supplied mix\) 18\.0%/);
    expect(t).toMatch(/Coverage: 82\.0% of the proposed value has a known asset class/);
  });
});

describe("issuing a final PDF from a version", () => {
  it("verifies the version: a changed input or result is refused before rendering", async () => {
    const m = await load();
    approvedStory(m);
    const v1 = json(approve(m));
    const tamperedInput = structuredClone(v1);
    tamperedInput.inputs.holdings[0].nativeMarketValue = 999_999;
    expect(await post({ snapshot: tamperedInput })).toMatchObject({ status: 422, error: expect.stringMatching(/don't match its fingerprint/) });
    const tamperedResult = structuredClone(v1);
    tamperedResult.results.proposed.total = 1;
    expect(await post({ snapshot: tamperedResult })).toMatchObject({ status: 422, error: expect.stringMatching(/results don't match its inputs/) });
    const extraField = { ...structuredClone(v1), extra: true };
    expect(await post({ snapshot: extraField })).toMatchObject({ status: 422, error: expect.stringMatching(/Not a valid approved version/) });
    expect(m.fake.launches).toBe(0);
  });

  it("re-gates with the server clock: rates that went stale since approval block a final document, never refreshed; a draft copy is still allowed", async () => {
    const m = await load();
    approvedStory(m);
    const v1 = approve(m);
    vi.setSystemTime(new Date("2026-11-05T12:00:00Z")); // the EUR/USD rate is now 11 days old
    const res = await post({ snapshot: v1 });
    expect(res).toMatchObject({ status: 422, failing: ["Exchange rates current"], error: expect.stringMatching(/approve a new version/) });
    expect(m.fake.launches).toBe(0);
    const draft = await post({ snapshot: v1, timeZone: "UTC" }, "draft");
    expect(draft).toMatchObject({ status: 200, filename: "SAMPLE_Managed_Story_Household_Draft_Wealth_Proposal_v1_2026-11-05.pdf" });
    const t = text(m.fake.html[0]);
    expect(t).toMatch(/Draft copy of approved version 1 .* Not a final document\./);
    // Figures and rate ages are as approved.
    expect(t).toMatch(/EUR\/USD 1\.1000 2026-10-25 ECB 1 day current/);
  });

  it("the live final-PDF path is unchanged", async () => {
    const m = await load();
    approvedStory(m);
    const s = store(m);
    const state = { client: s.client, advisor: s.advisor, accounts: s.accounts, holdings: s.holdings, recommendations: s.recommendations, sections: s.proposal.sections, disclosures: s.disclosures.filter((d) => s.proposal.disclosureIds.includes(d.id)), proposal: s.proposal, fxRates: s.fxRates, sourceDocuments: [], fxConfirmation: null, workingDraft: s.workingDraft, alternatives: s.alternatives };
    expect(await post({ state })).toMatchObject({ status: 200, filename: "SAMPLE_Managed_Story_Household_Wealth_Proposal_2026-10-26.pdf" });
    expect(text(m.fake.html[0])).not.toMatch(/approved version/i);
  });
});

describe("costs and income use supplied data with coverage, never invented zeros", () => {
  const h = (id: string, value: number, extra: Partial<Holding> = {}) => ({ id, assetClass: "equity", reportingMarketValue: value, ...extra }) as Holding & { reportingMarketValue: number };

  it("reports unavailable, partial or full coverage", async () => {
    const m = await load();
    const none = m.costIncomeCoverage([h("a", 100), h("b", 300)]);
    expect(none.expense).toEqual({ value: null, coveredValue: 0, totalValue: 400, coveredCount: 0, totalCount: 2 });
    expect(m.describeCoverage(none.expense, (v) => `${v}%`)).toBe("Unavailable: not supplied for any of the 2 valued non-cash holdings");
    const partial = m.costIncomeCoverage([h("a", 100, { expenseRatioPct: 0.5, incomeYieldPct: 2 }), h("b", 300), h("cash", 50, { assetClass: "cash" }), h("debt", 80, { isLiability: true, expenseRatioPct: 9 })]);
    expect(partial.expense).toMatchObject({ value: 0.5, coveredValue: 100, totalValue: 400, coveredCount: 1, totalCount: 2 });
    expect(partial.income.value).toBeCloseTo(2);
    expect(m.describeCoverage(partial.expense, (v) => `${v.toFixed(2)}%`)).toBe("0.50% across 25% of non-cash value (1 of 2 holdings); not supplied for the rest");
    const full = m.costIncomeCoverage([h("a", 100, { expenseRatioPct: 0.5 }), h("b", 300, { expenseRatioPct: 0.1 }), h("s", 50, { proposedOnly: true } as never)]);
    expect(full.expense.value).toBeCloseTo(0.2);
    expect(full.sleevesExcluded).toBe(1);
    expect(m.describeCoverage(full.expense, (v) => `${v.toFixed(2)}%`)).toBe("0.20% across all non-cash value (2 of 2 holdings)");
  });

  it("the document states coverage, keeps sleeve fees separate and says no tax analysis is included", async () => {
    const m = await load();
    approvedStory(m);
    const t = text(await render(m, approve(m)));
    // Current: the EUR fund supplies 0.20%; nothing supplies a yield.
    expect(t).toMatch(/Weighted expense ratio, current 0\.20% across all non-cash value \(1 of 1 holding\)/);
    expect(t).toMatch(/Estimated annual income, current Unavailable: not supplied for any of the 1 valued non-cash holding/);
    expect(t).toMatch(/The 3 proposed manager\/strategy sleeves are excluded/);
    expect(t).toMatch(/No tax analysis is included in this proposal/);
    expect(t).not.toMatch(/Estimated weighted expense ratio 0\.00%/);
  });
});

describe("persistence", () => {
  it("reload, v10 export/restore/reload keep versions byte-identical; corrupt versions are rejected", async () => {
    let m = await load();
    approvedStory(m);
    const v1 = approve(m, "Synthetic note");
    store(m).recordPdfJob({ id: "pdf_v1", proposalId: store(m).proposal.id, variant: "final", startedAt: NOW.toISOString(), completedAt: NOW.toISOString(), status: "succeeded", filename: "x.pdf", snapshotId: v1.id, snapshotVersion: 1 });
    const before = JSON.stringify(store(m).snapshots);
    expect(JSON.parse(storage.getItem("atlas-proposal-engine")!).version).toBe(10);
    vi.resetModules();
    m = await load();
    await m.useAtlasStore.persist.rehydrate();
    expect(JSON.stringify(store(m).snapshots)).toBe(before);

    const ids = { disclosureIds: m.DISCLOSURE_LIBRARY.map((d) => d.id) };
    const exported = m.exportBackup(store(m), NOW, ids);
    if (!exported.ok) throw new Error(exported.errors.join("; "));
    const file = JSON.parse(exported.text);
    expect(file.workspaceVersion).toBe(10);
    const parsed = m.parseBackup(exported.text, ids);
    if (!parsed.ok) throw new Error(parsed.errors.join("; "));
    store(m).startNewClient();
    expect(store(m).snapshots).toEqual([]); // versions belong to the engagement
    expect(store(m).restoreWorkspace(m.restoredState(parsed.backup, store(m), { replaceFirm: false }))).toEqual({ ok: true });
    vi.resetModules();
    m = await load();
    await m.useAtlasStore.persist.rehydrate();
    expect(JSON.stringify(store(m).snapshots)).toBe(before);
    expect(store(m).pdfHistory[0]).toMatchObject({ snapshotId: v1.id, snapshotVersion: 1 });
    expect(m.snapshotIntegrity(store(m).snapshots[0])).toBeNull();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mutate = (fn: (x: any) => void) => {
      const c = structuredClone(file);
      fn(c);
      const r = m.parseBackup(JSON.stringify(c), ids);
      return r.ok ? "ok" : r.errors.join("; ");
    };
    expect(mutate((x) => (x.engagement.snapshots[0].inputs.holdings[0].nativeMarketValue = 1))).toMatch(/don't match its fingerprint/);
    expect(mutate((x) => (x.engagement.snapshots[0].results.blocked = 2))).toMatch(/results don't match its inputs/);
    expect(mutate((x) => x.engagement.snapshots.push(structuredClone(x.engagement.snapshots[0])))).toMatch(/Duplicate approved version ID/);
    expect(mutate((x) => (x.engagement.pdfHistory[0].snapshotId = "ver_missing"))).toMatch(/approved version ver_missing, which isn't in the backup/);
    expect(mutate((x) => (x.engagement.snapshots[0].inputs.client.id = "cli_other"))).toMatch(/belongs to client cli_other/);
    expect(mutate((x) => (x.engagement.snapshots[0].unexpected = 1))).toMatch(/Unrecognized key/);
  });

  it("a v9 backup upgrades with no versions and can't carry them; store v9 upgrades to v10", async () => {
    const m = await load();
    approvedStory(m);
    const ids = { disclosureIds: m.DISCLOSURE_LIBRARY.map((d) => d.id) };
    const exported = m.exportBackup(store(m), NOW, ids);
    if (!exported.ok) throw new Error(exported.errors.join("; "));
    const file = JSON.parse(exported.text);
    const { snapshots: _s, ...e9 } = file.engagement;
    void _s;
    const v9 = { ...file, workspaceVersion: 9, engagement: e9 };
    const p9 = m.parseBackup(JSON.stringify(v9), ids);
    if (!p9.ok) throw new Error(p9.errors.join("; "));
    expect(p9.backup.workspaceVersion).toBe(10);
    expect(p9.backup.engagement.snapshots).toEqual([]);
    expect(m.parseBackup(JSON.stringify({ ...v9, engagement: { ...e9, snapshots: [] } }), ids).ok).toBe(false);
    expect(m.parseBackup(JSON.stringify({ ...v9, engagement: { ...e9, pdfHistory: [{ id: "j", proposalId: e9.proposal.id, variant: "final", startedAt: NOW.toISOString(), status: "succeeded", snapshotId: "ver_x" }] } }), ids).ok).toBe(false);
    expect(m.parseBackup(JSON.stringify({ ...file, workspaceVersion: 9 }), ids).ok).toBe(false);
    // Store v9 → v10, idempotent.
    const persisted = json(store(m));
    delete persisted.snapshots;
    expect(m.migrateAtlasState(persisted, 9).snapshots).toEqual([]);
    expect(m.migrateAtlasState({ ...persisted, snapshots: [{ id: "keep" }] }, 9).snapshots).toEqual([{ id: "keep" }]);
  });
});
