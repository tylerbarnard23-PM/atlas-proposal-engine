import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Account, ApprovedSnapshot, FxRate, Holding, Recommendation } from "@/domain/types";

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
    ...(await import("@/engines/proposalEngine")),
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
    expect(t).toMatch(/Look-through exposure of the proposed assets \(investment scope\)/);
    expect(t).toMatch(/Coverage: 100\.0% of the proposed investment-scope value has a known asset class/);
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
    // 20,000 of the scope's 100,000 proposed (the EUR account is context, outside the denominator).
    expect(t).toMatch(/Unknown \(1 sleeve with no supplied mix\) 20\.0%/);
    expect(t).toMatch(/Coverage: 80\.0% of the proposed investment-scope value has a known asset class/);
  });
});

describe("scope: the desk, the version, the meeting view and the PDF agree", () => {
  // In scope: the managed account, USD 100,000. Outside it: the EUR fund (EUR 10,000 at 1.10 = USD 11,000) and a USD 50,000 mortgage.
  const LOAN_ACCOUNT: Account = { id: "acc_loan_story", name: "Mortgage (synthetic)", type: "individual", baseCurrency: "USD", country: "US", isLiabilityAccount: true, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z" };
  const MORTGAGE: Holding = { ...EUR_FUND, id: "h_mortgage", accountId: LOAN_ACCOUNT.id, assetName: "Home mortgage (synthetic)", assetType: "mortgage_liability", assetClass: "liability", isLiability: true, country: "US", currency: "USD", nativeMarketValue: -50_000, expenseRatioPct: undefined };
  const withContext = (m: M) => {
    approvedStory(m);
    m.useAtlasStore.setState({ accounts: [...store(m).accounts, LOAN_ACCOUNT], holdings: [...store(m).holdings, MORTGAGE] });
  };
  const liveDesk = (m: M) => {
    const s = store(m);
    return m.evaluateDesk({ holdings: m.normalizeHoldings(s.holdings, s.fxRates, "USD"), accounts: s.accounts, recommendations: s.recommendations, draft: s.workingDraft, fx: { reportingCurrency: "USD", rates: s.fxRates }, view: "approved" });
  };

  it("uses the USD 100,000 investment scope for amounts, weights and exposure, with the EUR 10,000 account and the mortgage as labelled context", async () => {
    const m = await load();
    withContext(m);
    const desk = liveDesk(m);
    expect(desk.totals).toEqual({ current: 100_000, proposed: 100_000 });
    expect(desk.context.total).toBeCloseTo(11_000);
    const v1 = approve(m);
    expect(v1.results.current.total).toBe(100_000);
    expect(v1.results.proposed.total).toBe(100_000);
    // The version's evaluator rows are the desk's rows.
    expect(v1.results.proposed.byClass).toEqual(desk.rows.filter((r) => Math.abs(r.proposed) > 1e-9).map((r) => ({ assetClass: r.assetClass, value: r.proposed })).sort((a, b) => a.assetClass.localeCompare(b.assetClass)));

    const meeting = text(await render(m, v1));
    const res = await post({ snapshot: v1, timeZone: "UTC" });
    expect(res).toMatchObject({ status: 200, error: "" });
    const pdf = text(m.fake.html[0]);
    for (const t of [meeting, pdf]) {
      // Before and after: the scope's 100,000, not the household's 111,000.
      expect(t).toMatch(/Before Current portfolio \(investment scope\) \$100(\.0)?K/);
      expect(t).toMatch(/After Proposed portfolio \(investment scope\) \$100(\.0)?K/);
      expect(t).not.toMatch(/\$111(\.0)?K/);
      // Weights over the scope: all cash today; 95% sleeves and 5% cash after.
      expect(t).toMatch(/Allocation by Asset Class \(investment scope\) Cash & Equivalents 100\.0% \$100(\.0)?K/);
      expect(t).toMatch(/Allocation by Currency \(investment scope\) USD 100\.0% \$100(\.0)?K/);
      expect(t).not.toMatch(/EUR 9\.9%/);
      // Look-through exposure is the desk's, over the scope.
      const e = m.exposureView({ positions: desk.positions, recommendations: store(m).recommendations.filter((r) => r.approvedByAdvisor), strategies: store(m).strategies });
      expect(e.total).toBeCloseTo(100_000);
      expect(t).toMatch(/Look-through exposure of the proposed assets \(investment scope\)/);
      for (const r of e.rows) expect(t).toContain(`${r.pct.toFixed(1)}%`);
      expect(t).toMatch(/Coverage: 100\.0% of the proposed investment-scope value has a known asset class/);
      // Costs and income are labelled with the scope: the EUR fund's 0.20% is context, not the scope's ratio.
      expect(t).toMatch(/Weighted expense ratio, current \(investment scope\) Not applicable/);
      // Household context: visible, labelled, outside every allocation denominator.
      expect(t).toMatch(/Household context outside the investment scope/);
      expect(t).toMatch(/Euro Account \(synthetic\) \$11(\.0)?K/);
      expect(t).toMatch(/Home mortgage \(synthetic\) -?\$50(\.0)?K/);
      expect(t).toMatch(/not included in any allocation weight/);
      // Household totals stay available as context.
      expect(t).toMatch(/Household net worth \$61(\.0)?K/);
    }
  });

  it("a later scope change leaves v1 and its document as approved", async () => {
    const m = await load();
    withContext(m);
    const v1 = approve(m);
    const before = await render(m, v1);
    store(m).setDraftScope([ACC, EUR_ACCOUNT.id]);
    expect(m.snapshotStatus(store(m).snapshots[0], store(m), NOW)).toEqual({ kind: "changed", parts: ["alternative, scope or targets"] });
    expect(await render(m, store(m).snapshots[0])).toBe(before);
    // A version with the wider scope counts the EUR fund in its weights.
    const v2 = approve(m);
    expect(v2.results.current.total).toBeCloseTo(111_000);
    expect(text(await render(m, v2))).toMatch(/Allocation by Currency \(investment scope\) USD 90\.1% \$100(\.0)?K EUR 9\.9% \$11(\.0)?K/);
  });

  it("an approved action on an account outside the scope is labelled as household context, and the scoped figures don't move", async () => {
    const m = await load();
    withContext(m);
    store(m).addDraftEdit(m.positionEditRecommendation({ holding: EUR_FUND, kind: "reduce", amount: 1_100, reportingCurrency: "USD", id: "rec_eur_trim", now: NOW.toISOString() }));
    const r = store(m).recommendations.find((x) => x.id === "rec_eur_trim")!;
    store(m).upsertRecommendation({ ...r, approvedByAdvisor: true, status: "approved", includeInPdf: true });
    const v1 = approve(m);
    expect(v1.results.current.total).toBe(100_000);
    expect(v1.results.proposed.total).toBe(100_000);
    const t = text(await render(m, v1));
    expect(t).toMatch(/Reduce Euro Equity Fund \(synthetic\) by USD 1,100 .*Applied outside the investment scope \(household context; not in the scoped figures\)/);
    expect(t).toMatch(/After Proposed portfolio \(investment scope\) \$100(\.0)?K/);
  });

  it("narrowing the scope hides no readiness problem outside it: an unvalued context holding still blocks approval", async () => {
    const m = await load();
    withContext(m);
    // The EUR account is outside the scope; its rate goes missing.
    store(m).setFxRates([]);
    const r = store(m).approveVersion();
    expect(r.ok === false && r.failing.join("; ")).toMatch(/exchange rate|valu/i);
    expect(store(m).snapshots).toEqual([]);
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
    const none = m.costIncomeCoverage([h("a", 100), h("b", 300)], new Set());
    expect(none.expense).toEqual({ value: null, coveredValue: 0, totalValue: 400, coveredCount: 0, totalCount: 2 });
    expect(m.describeCoverage(none.expense, (v) => `${v}%`)).toBe("Unavailable: not supplied for any of the 2 valued non-cash holdings");
    const partial = m.costIncomeCoverage([h("a", 100, { expenseRatioPct: 0.5, incomeYieldPct: 2 }), h("b", 300), h("cash", 50, { assetClass: "cash" }), h("debt", 80, { isLiability: true, expenseRatioPct: 9 })], new Set());
    expect(partial.expense).toMatchObject({ value: 0.5, coveredValue: 100, totalValue: 400, coveredCount: 1, totalCount: 2 });
    expect(partial.income.value).toBeCloseTo(2);
    expect(m.describeCoverage(partial.expense, (v) => `${v.toFixed(2)}%`)).toBe("0.50% across 25% of non-cash value (1 of 2 holdings); not supplied for the rest");
    // Only a holding named as a manager/strategy sleeve is excluded; being proposed alone doesn't make one.
    const full = m.costIncomeCoverage([h("a", 100, { expenseRatioPct: 0.5 }), h("b", 300, { expenseRatioPct: 0.1 }), h("s", 50, { proposedOnly: true } as never)], new Set(["s"]));
    expect(full.expense.value).toBeCloseTo(0.2);
    expect(full.sleevesExcluded).toBe(1);
    expect(m.describeCoverage(full.expense, (v) => `${v.toFixed(2)}%`)).toBe("0.20% across all non-cash value (2 of 2 holdings)");
    // An explicit zero is a supplied value, not a gap.
    const zero = m.costIncomeCoverage([h("z", 100, { expenseRatioPct: 0, incomeYieldPct: 0 })], new Set());
    expect(zero.expense).toMatchObject({ value: 0, coveredCount: 1, totalCount: 1 });
    expect(zero.income).toMatchObject({ value: 0, coveredCount: 1, totalCount: 1 });
  });

  // Through the real proposal engine: an existing ETF with supplied terms, and ordinary new investments (D2 destinations, no strategy).
  const BROKERAGE: Account = { id: "acc_etf_story", name: "Brokerage (synthetic)", type: "brokerage", baseCurrency: "USD", country: "US", createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z" };
  const ETF_OLD: Holding = { ...EUR_FUND, id: "h_etf_old", accountId: BROKERAGE.id, assetName: "Core Bond ETF (synthetic)", assetType: "etf", assetClass: "fixed_income", country: "US", currency: "USD", nativeMarketValue: 100_000, expenseRatioPct: 0.1, incomeYieldPct: 2 };
  const ETF_CASH: Holding = { ...EUR_FUND, id: "h_etf_cash", accountId: BROKERAGE.id, assetName: "Brokerage cash (synthetic)", assetType: "cash", assetClass: "cash", country: "US", currency: "USD", nativeMarketValue: 10_000, expenseRatioPct: undefined };
  const replace = (m: M, sell: number, buy: number) =>
    m.replacementRecommendations({ holding: ETF_OLD, sellAmount: sell, buyAmount: buy, destination: { id: "dest_new_etf", name: "New Equity ETF (synthetic)", assetClass: "equity" }, currency: "USD", ids: { sell: "rec_sell_old", buy: "rec_buy_new", group: "grp_new" }, now: NOW.toISOString() });
  const approved = (recs: Recommendation[]) => recs.map((r) => ({ ...r, approvedByAdvisor: true, status: "approved" as const, includeInPdf: true }));
  const coverageAfter = (m: M, recs: Recommendation[]) => {
    const accounts = [{ ...BROKERAGE, funding: { cashHoldingId: ETF_CASH.id, reserve: 0, reserveCurrency: "USD" } }];
    const p = m.applyRecommendationsToProposed(m.normalizeHoldings([ETF_OLD, ETF_CASH], [], "USD"), recs, accounts, { reportingCurrency: "USD", rates: [] });
    expect(p.blocked).toEqual([]);
    return m.costIncomeCoverage(p.holdings, new Set(m.sleeveRefs(recs).keys()));
  };

  it("an ordinary new investment without supplied terms stays in the denominator: 50% coverage, one of two holdings", async () => {
    const m = await load();
    const c = coverageAfter(m, approved(replace(m, 50_000, 50_000)));
    expect(c.expense).toMatchObject({ coveredValue: 50_000, totalValue: 100_000, coveredCount: 1, totalCount: 2 });
    expect(c.expense.value).toBeCloseTo(0.1);
    expect(c.income).toMatchObject({ coveredValue: 50_000, totalValue: 100_000, coveredCount: 1, totalCount: 2 });
    expect(c.income.value).toBeCloseTo(1_000);
    expect(c.sleevesExcluded).toBe(0);
    expect(m.describeCoverage(c.expense, (v) => `${v.toFixed(2)}%`)).toBe("0.10% across 50% of non-cash value (1 of 2 holdings); not supplied for the rest");
  });

  it("only an ordinary new investment with unknown terms: Unavailable, not Not applicable", async () => {
    const m = await load();
    const c = coverageAfter(m, approved(replace(m, 100_000, 100_000)));
    expect(c.expense).toEqual({ value: null, coveredValue: 0, totalValue: 100_000, coveredCount: 0, totalCount: 1 });
    expect(c.income.value).toBeNull();
    expect(c.sleevesExcluded).toBe(0);
    expect(m.describeCoverage(c.expense, (v) => `${v}%`)).toBe("Unavailable: not supplied for any of the 1 valued non-cash holding");
  });

  it("an actual manager sleeve keeps its separate supplied-fee treatment and is never counted twice", async () => {
    const m = await load();
    const [sell, buy] = approved(replace(m, 50_000, 25_000));
    const sleeve: Recommendation = {
      ...buy,
      id: "rec_sleeve_x",
      linked: undefined,
      title: "Fund sleeve: buy USD 20,000 of Manager X — Core (rev 1)",
      actionAmount: 20_000,
      destination: { id: "sleeve_x", name: "Manager X — Core (rev 1)", assetClass: "custom", accountId: BROKERAGE.id, currency: "USD", strategy: { id: "str_x", revision: 1, manager: "Manager X", name: "Core", minimum: null } },
    };
    const c = coverageAfter(m, [sell, buy, sleeve]);
    // ETF 50,000 (supplied) + new ETF 25,000 (not supplied); the 20,000 sleeve is outside both.
    expect(c.expense).toMatchObject({ coveredValue: 50_000, totalValue: 75_000, coveredCount: 1, totalCount: 2 });
    expect(c.sleevesExcluded).toBe(1);
  });

  it("the meeting view and the PDF of a scoped version show the ordinary new investment as uncovered, with no sleeve wording", async () => {
    const m = await load();
    store(m).startNewClient();
    m.useAtlasStore.setState({
      client: { ...store(m).client, fullName: "Brokerage Story Household", proposalOutputCurrency: "USD" },
      accounts: [BROKERAGE, EUR_ACCOUNT],
      holdings: [ETF_OLD, ETF_CASH, EUR_FUND],
      recommendations: [],
      fxRates: [EURUSD],
    });
    store(m).setDraftScope([BROKERAGE.id]);
    store(m).setAccountFunding(BROKERAGE.id, { cashHoldingId: ETF_CASH.id, reserve: 0, reserveCurrency: "USD" });
    store(m).addDraftEdit(replace(m, 50_000, 50_000));
    for (const r of store(m).recommendations) store(m).upsertRecommendation({ ...r, approvedByAdvisor: true, status: "approved", includeInPdf: true });
    const v1 = approve(m);
    const meeting = text(await render(m, v1));
    expect(await post({ snapshot: v1, timeZone: "UTC" })).toMatchObject({ status: 200 });
    const pdf = text(m.fake.html[0]);
    for (const t of [meeting, pdf]) {
      expect(t).toMatch(/Weighted expense ratio, current \(investment scope\) 0\.10% across all non-cash value \(1 of 1 holding\)/);
      expect(t).toMatch(/Weighted expense ratio, proposed \(investment scope\) 0\.10% across 50% of non-cash value \(1 of 2 holdings\); not supplied for the rest/);
      expect(t).toMatch(/Estimated annual income, proposed \(investment scope\) \$1,000(\.0)? across 50% of non-cash value \(1 of 2 holdings\); not supplied for the rest/);
      expect(t).not.toMatch(/manager\/strategy sleeves? (is|are) excluded/);
      // The EUR fund (0.20%) is household context, outside the scope's figures.
      expect(t).not.toMatch(/0\.20% across/);
    }
  });

  it("the document states coverage, keeps sleeve fees separate and says no tax analysis is included", async () => {
    const m = await load();
    approvedStory(m);
    // Outside the scope the EUR fund is context: the scope's figures have no non-cash holding.
    const scoped = text(await render(m, approve(m)));
    expect(scoped).toMatch(/Weighted expense ratio, current \(investment scope\) Not applicable \(no valued non-cash holdings\)/);
    expect(scoped).not.toMatch(/0\.20% across/);
    // With the EUR account in the scope, its fund supplies 0.20%; nothing supplies a yield.
    store(m).setDraftScope([ACC, EUR_ACCOUNT.id]);
    const t = text(await render(m, approve(m)));
    expect(t).toMatch(/Weighted expense ratio, current \(investment scope\) 0\.20% across all non-cash value \(1 of 1 holding\)/);
    expect(t).toMatch(/Estimated annual income, current \(investment scope\) Unavailable: not supplied for any of the 1 valued non-cash holding/);
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
