import { beforeEach, describe, expect, it, vi } from "vitest";

// #86 (16 November 2026): resource limits on the two public JSON routes, the
// final-PDF route and the Copilot, driven through their real handlers.
// Oversized input must be refused before any schema validation, financial
// evaluation, Chromium or provider call, with a short reason, so it never
// generates an issue per element. Synthetic data only; Chromium is replaced
// by a fake that records whether it was launched, and the Copilot runs in
// demo mode (no provider, no key).

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

const chromium = vi.hoisted(() => ({ launches: 0 }));
vi.mock("puppeteer-core", () => ({
  default: {
    launch: vi.fn(async () => {
      chromium.launches++;
      return {
        newPage: async () => ({ emulateMediaType: async () => {}, setContent: async () => {}, pdf: async () => new TextEncoder().encode("%PDF-1.4 synthetic test document") }),
        close: async () => {},
      };
    }),
  },
}));
vi.mock("@/pdf/chromiumPath", () => ({ resolveChromiumExecutable: () => "/synthetic/chrome", ChromiumNotFoundError: class extends Error {} }));

const MAX_ERROR_CHARS = 1_000;
const PDF_URL = "http://127.0.0.1:3000/api/proposals/prop_test/generate-pdf";
const params = { params: Promise.resolve({ id: "prop_test" }) };

beforeEach(() => {
  vi.resetModules();
  storage.clear();
  chromium.launches = 0;
});

/** A request whose body arrives as a stream, with an optional (possibly false) Content-Length. */
function streamed(url: string, text: string, contentLength?: number) {
  const bytes = new TextEncoder().encode(text);
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (let i = 0; i < bytes.length; i += 64 * 1024) c.enqueue(bytes.slice(i, i + 64 * 1024));
      c.close();
    },
  });
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (contentLength !== undefined) headers["content-length"] = String(contentLength);
  return new Request(url, { method: "POST", headers, body, duplex: "half" } as RequestInit);
}
const json = (url: string, body: unknown) => new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

const pdfRoute = () => import("@/app/api/proposals/[id]/generate-pdf/route");
const copilot = () => import("@/copilot/routeHandler");

/** The sample workspace, as the PDF Preview page sends it (legacy path). */
async function legacyBody(over: Record<string, unknown> = {}) {
  const { useAtlasStore } = await import("@/store/useStore");
  const { forReadiness } = await import("@/engines/importCompleteness");
  const s = useAtlasStore.getState();
  // The largest logo branding allows (200 KB), with a real PNG signature.
  const png = Buffer.alloc(200 * 1024, 7);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return {
    state: {
      client: s.client,
      advisor: { ...s.advisor, logoDataUrl: `data:image/png;base64,${png.toString("base64")}` },
      accounts: s.accounts,
      holdings: s.holdings,
      recommendations: s.recommendations,
      sections: s.proposal.sections,
      disclosures: s.disclosures.filter((d) => s.proposal.disclosureIds.includes(d.id)),
      proposal: s.proposal,
      fxRates: s.fxRates,
      sourceDocuments: s.sourceDocuments.map(forReadiness),
      fxConfirmation: s.fxConfirmation,
      workingDraft: s.workingDraft,
      alternatives: s.alternatives,
      strategies: s.strategies,
      models: s.models,
      modelPin: null,
      ...over,
    },
    timeZone: "America/New_York",
  };
}

/** A real approved version: the synthetic story with one approved action, as Review & present sends it. */
async function snapshotBody() {
  const { useAtlasStore } = await import("@/store/useStore");
  const { STORY_ACCOUNTS, STORY_HOLDINGS } = await import("@/data/allocationStory");
  const st = () => useAtlasStore.getState();
  st().startNewClient();
  useAtlasStore.setState({ client: { ...st().client, fullName: "Limits Household (synthetic)", proposalOutputCurrency: "USD" }, accounts: STORY_ACCOUNTS, holdings: STORY_HOLDINGS, recommendations: [] });
  st().setAccountFunding("acc_story_invest", { cashHoldingId: "h_story_cash", reserve: 5_000, reserveCurrency: "USD" });
  st().setDraftScope(["acc_story_invest"]);
  const now = new Date().toISOString();
  st().addDraftEdit({ id: "rec_limits_bond", title: "Reduce Bond ETF A by USD 5,000", type: "reduce", relatedAccountId: "acc_story_invest", relatedHoldingId: "h_story_bond", actionAmount: 5_000, actionAmountUnit: "amount", currency: "USD", rationale: "", priority: "medium", status: "needs_review", includeInPdf: false, approvedByAdvisor: false, createdAt: now, updatedAt: now } as never);
  const rec = st().recommendations.find((r) => r.id === "rec_limits_bond")!;
  st().upsertRecommendation({ ...rec, approvedByAdvisor: true, status: "approved", includeInPdf: true });
  const v = st().approveVersion();
  if (!v.ok) throw new Error(`fixture version not approvable: ${v.failing.join("; ")}`);
  return { snapshot: v.snapshot, timeZone: "America/New_York" };
}

/** The sample workspace as the Copilot page sends it, with a context that matches. */
async function copilotBody() {
  const { useAtlasStore } = await import("@/store/useStore");
  const { copilotRequest } = await import("./support/copilotRequest");
  const s = useAtlasStore.getState();
  return copilotRequest("Summarize this client's portfolio (synthetic)", {
    client: s.client,
    advisor: s.advisor,
    accounts: s.accounts,
    holdings: s.holdings,
    fxRates: s.fxRates,
    recommendations: s.recommendations,
    disclosures: s.disclosures,
    sourceDocuments: s.sourceDocuments,
    fxConfirmation: s.fxConfirmation,
    workingDraft: s.workingDraft,
    alternatives: s.alternatives,
  });
}
const DEMO = { env: { COPILOT_MODE: "demo" } } as never;
const errorOf = async (r: Response) => String(((await r.json()) as { error?: unknown }).error ?? "");

describe("final-PDF route: the body is limited while it is read", () => {
  it("a body over the limit is refused with 413 even with no Content-Length", async () => {
    const { POST } = await pdfRoute();
    const big = JSON.stringify({ state: { client: { fullName: "x" }, pad: "a".repeat(3_000_000) } });
    const r = await POST(streamed(`${PDF_URL}?variant=draft`, big), params);
    expect(r.status).toBe(413);
    expect(chromium.launches).toBe(0);
  });

  it("a misleadingly small Content-Length doesn't let a large body through", async () => {
    const { POST } = await pdfRoute();
    const big = JSON.stringify({ state: { client: { fullName: "x" }, pad: "a".repeat(3_000_000) } });
    const r = await POST(streamed(`${PDF_URL}?variant=draft`, big, 20), params);
    expect(r.status).toBe(413);
    expect(chromium.launches).toBe(0);
  });

  it("a declared Content-Length over the limit is refused without reading", async () => {
    const { POST } = await pdfRoute();
    const r = await POST(streamed(`${PDF_URL}?variant=draft`, "{}", 50_000_000), params);
    expect(r.status).toBe(413);
  });

  it("malformed JSON is a 400, not a server error", async () => {
    const { POST } = await pdfRoute();
    const r = await POST(streamed(`${PDF_URL}?variant=draft`, "{not json"), params);
    expect(r.status).toBe(400);
  });
});

describe("final-PDF route: oversized collections are refused before validation, readiness or Chromium", () => {
  it("approved-version path: ~40 KB of holdings is refused with one short reason", async () => {
    const { POST } = await pdfRoute();
    const { snapshot } = await snapshotBody();
    const body = { snapshot: { ...snapshot, inputs: { ...snapshot.inputs, holdings: Array.from({ length: 20_000 }, () => 0) } } };
    expect(JSON.stringify(body).length).toBeLessThan(60_000);
    const r = await POST(json(`${PDF_URL}?variant=final`, body), params);
    expect(r.status).toBe(400);
    const error = await errorOf(r);
    // The guard's reason, not a schema issue list.
    expect(error).toMatch(/holdings/);
    expect(error).toMatch(/1,000/);
    expect(error.length).toBeLessThanOrEqual(300);
    expect(chromium.launches).toBe(0);
  });

  it("legacy state path: 20,000 holdings never reach readiness or rendering", async () => {
    const { POST } = await pdfRoute();
    const body = await legacyBody({ holdings: Array.from({ length: 20_000 }, (_, i) => ({ id: `h${i}` })) });
    for (const variant of ["final", "draft"]) {
      const r = await POST(json(`${PDF_URL}?variant=${variant}`, body), params);
      expect(r.status).toBe(400);
      expect(await errorOf(r)).toMatch(/holdings/);
    }
    expect(chromium.launches).toBe(0);
  });

  it("legacy state path: a deeply nested or very wide body is refused the same way", async () => {
    const { POST } = await pdfRoute();
    let deep: unknown = 0;
    for (let i = 0; i < 200; i++) deep = [deep];
    const r1 = await POST(json(`${PDF_URL}?variant=draft`, await legacyBody({ client: { fullName: "x", nest: deep } })), params);
    expect(r1.status).toBe(400);
    const wide = Object.fromEntries(Array.from({ length: 5_000 }, (_, i) => [`k${i}`, 0]));
    const r2 = await POST(json(`${PDF_URL}?variant=draft`, await legacyBody({ client: { fullName: "x", ...wide } })), params);
    expect(r2.status).toBe(400);
    expect(chromium.launches).toBe(0);
  });
});

describe("final-PDF route: supported requests are unchanged", () => {
  it("the sample workspace with the largest allowed logo renders through the legacy path", async () => {
    const { POST } = await pdfRoute();
    const body = await legacyBody();
    expect(JSON.stringify(body).length).toBeGreaterThan(270_000);
    const r = await POST(json(`${PDF_URL}?variant=draft`, body), params);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/pdf");
    expect(chromium.launches).toBe(1);
  });

  it("a real approved version issues a final PDF", async () => {
    const { POST } = await pdfRoute();
    const r = await POST(json(`${PDF_URL}?variant=final`, await snapshotBody()), params);
    expect(r.status).toBe(200);
    expect(chromium.launches).toBe(1);
  });

  it("an altered version is still refused by its fingerprint, with a short reason", async () => {
    const { POST } = await pdfRoute();
    const { snapshot } = await snapshotBody();
    const altered = { ...snapshot, inputs: { ...snapshot.inputs, holdings: snapshot.inputs.holdings.map((h) => (h.id === "h_story_bond" ? { ...h, nativeMarketValue: 31_000 } : h)) } };
    const r = await POST(json(`${PDF_URL}?variant=final`, { snapshot: altered }), params);
    expect(r.status).toBe(422);
    expect((await errorOf(r)).length).toBeLessThanOrEqual(MAX_ERROR_CHARS);
    expect(chromium.launches).toBe(0);
  });
});

describe("Copilot: nested lists are limited and errors stay short", () => {
  const cases: [string, (b: Awaited<ReturnType<typeof copilotBody>>) => void][] = [
    ["workingDraft.memberIds", (b) => void ((b.snapshot.workingDraft as { memberIds: unknown }).memberIds = Array.from({ length: 20_000 }, () => 0))],
    ["workingDraft.scopeAccountIds", (b) => void ((b.snapshot.workingDraft as { scopeAccountIds: unknown }).scopeAccountIds = Array.from({ length: 20_000 }, () => 0))],
    ["alternatives[].memberIds", (b) => void ((b.snapshot as { alternatives: unknown }).alternatives = [{ name: "Alt", memberIds: Array.from({ length: 20_000 }, () => 0) }])],
  ];
  for (const [label, mutate] of cases) {
    it(`~40 KB in ${label} gets a short refusal, not an issue per element`, async () => {
      const { handleCopilotPost } = await copilot();
      const body = await copilotBody();
      mutate(body);
      const r = await handleCopilotPost(json("http://127.0.0.1:3000/api/copilot", body), DEMO);
      expect(r.status).toBe(400);
      // Codex measured ~1.8 MB here before the fix.
      expect((await errorOf(r)).length).toBeLessThanOrEqual(MAX_ERROR_CHARS);
    });
  }

  it("many invalid items within the limits still give a bounded error", async () => {
    const { handleCopilotPost } = await copilot();
    const body = await copilotBody();
    (body.snapshot as { holdings: unknown }).holdings = Array.from({ length: 1_000 }, () => ({}));
    const r = await handleCopilotPost(json("http://127.0.0.1:3000/api/copilot", body), DEMO);
    expect(r.status).toBe(400);
    expect((await errorOf(r)).length).toBeLessThanOrEqual(MAX_ERROR_CHARS);
  });

  it("a body over the Copilot limit with no Content-Length is refused with 413", async () => {
    const { handleCopilotPost } = await copilot();
    const r = await handleCopilotPost(streamed("http://127.0.0.1:3000/api/copilot", JSON.stringify({ pad: "a".repeat(1_500_000) })), DEMO);
    expect(r.status).toBe(413);
  });

  it("the sample workspace's request is still answered", async () => {
    const { handleCopilotPost } = await copilot();
    const r = await handleCopilotPost(json("http://127.0.0.1:3000/api/copilot", await copilotBody()), DEMO);
    expect(r.status).toBe(200);
  });
});

describe("the limits themselves", () => {
  it("the largest workspace the repository's fixtures build fits every limit with room to spare", async () => {
    const { useAtlasStore } = await import("@/store/useStore");
    const { readPdfInNode } = await import("@/ingestion/pdf/readPdfNode");
    const { parseStatementPdf } = await import("@/ingestion/documents/parseStatementPdf");
    const { extractionToWorkspace } = await import("@/ingestion/documents/toWorkspace");
    const { parseCsvText } = await import("@/ingestion/parsers/parseCsv");
    const { syntheticReportPdf } = await import("./fixtures/syntheticHoldingsReport");
    const { ISSUE_29_LINES, textPdf } = await import("./fixtures/syntheticStatementPdf");
    const { PLAN_PDF } = await import("./fixtures/financialPlanSample");
    const { SCHWAB_STYLE, SWISS_SEMICOLON } = await import("./fixtures/custodianExports");
    const { shapeProblem, SHAPE_LIMITS, PDF_MAX_BODY_BYTES, COPILOT_MAX_BODY_BYTES } = await import("@/server/requestLimits");
    const add = (x: Parameters<ReturnType<typeof useAtlasStore.getState>["addImportedToEngagement"]>[0]) => useAtlasStore.getState().addImportedToEngagement(x);
    add(extractionToWorkspace(parseStatementPdf(await readPdfInNode(textPdf(ISSUE_29_LINES)), "QA"), { fileName: "statement.pdf", reportingCurrency: "USD" }));
    add(extractionToWorkspace(parseStatementPdf(await readPdfInNode(syntheticReportPdf()), "R"), { fileName: "report.pdf", reportingCurrency: "USD" }));
    add(extractionToWorkspace(parseStatementPdf(PLAN_PDF, "plan"), { fileName: "plan.pdf", reportingCurrency: "USD" }));
    for (const [text, name] of [[SCHWAB_STYLE, "schwab.csv"], [SWISS_SEMICOLON, "swiss.csv"]] as const) {
      add(extractionToWorkspace({ ok: true, accounts: [parseCsvText(text, name).account], warnings: [], extractionMethod: "papaparse", extractionMs: 1 } as never, { fileName: name, reportingCurrency: "USD", sourceType: "csv" }));
    }
    const legacy = await legacyBody();
    const copilotReq = await copilotBody();
    for (const body of [legacy, copilotReq]) expect(shapeProblem(body, SHAPE_LIMITS)).toBeNull();
    // At least five times the measured size, on every dimension that is binding.
    expect(Buffer.byteLength(JSON.stringify(legacy)) * 4).toBeLessThan(PDF_MAX_BODY_BYTES);
    expect(Buffer.byteLength(JSON.stringify(copilotReq)) * 4).toBeLessThan(COPILOT_MAX_BODY_BYTES);
    expect(useAtlasStore.getState().holdings.length * 5).toBeLessThan(SHAPE_LIMITS.listLimits.holdings);
    expect(useAtlasStore.getState().accounts.length * 5).toBeLessThan(SHAPE_LIMITS.listLimits.accounts);
  }, 60_000);

  it("a refusal never repeats a hostile key or value at length", async () => {
    const { shapeProblem, describeIssues, MAX_ERROR_CHARS } = await import("@/server/requestLimits");
    const key = "k".repeat(100_000);
    const msg = shapeProblem({ [key]: Array.from({ length: 2_000 }, () => 0) })!;
    expect(msg).toMatch(/2,000 items/);
    expect(msg.length).toBeLessThan(200);
    const issues = Array.from({ length: 50_000 }, (_, i) => ({ path: ["snapshot", "x".repeat(10_000), i], message: "m".repeat(10_000) }));
    const text = describeIssues(issues);
    expect(text.length).toBeLessThanOrEqual(MAX_ERROR_CHARS);
    expect(text).toMatch(/more/);
  });
});
