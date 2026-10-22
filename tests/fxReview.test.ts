import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Account, FxConfirmation, FxRate, Holding, SourceDocument } from "@/domain/types";
import { CLOCK_SKEW_MS, FX_CONFIRMATION_DAYS, confirmStaleRates, fxFreshness, mergeFxRefresh, nextFxBoundary } from "@/engines/fxPolicy";
import { createFxClock } from "@/engines/fxClock";
import { normalizeHoldings } from "@/engines/normalizationEngine";
import { evaluateWorkspaceReadiness } from "@/engines/complianceEngine";
import { DEFAULT_PROPOSAL_SECTIONS } from "@/engines/proposalEngine";
import { ProposalPdfTemplate } from "@/pdf/templates/ProposalPdfTemplate";
import { SEED_ADVISOR, SEED_CLIENT } from "@/data/seedClient";
import { DISCLOSURE_LIBRARY } from "@/domain/disclosureLibrary";
import { chromium } from "./support/fakeChromium";

// The final-PDF route's browser stage is faked (see support/fakeChromium): its
// readiness tests passed through a real Chromium launch and PDF print, which
// stalled on CI.
vi.mock("puppeteer-core", async () => (await import("./support/fakeChromium")).puppeteerModule);
vi.mock("@/pdf/chromiumPath", async () => (await import("./support/fakeChromium")).chromiumPathModule);

// Review of PR #60 (2026-10-22): a confirmation is bound to every rate the
// calculations use, browser status follows the clock without workspace
// edits, and confirmation times are validated against the shared policy.

const NOW = new Date("2026-10-22T12:00:00Z");
const DAY = 86_400_000;
const OLD = "2026-04-30T00:00:00Z";
const FRESH = "2026-10-21T00:00:00Z";
const rate = (base: string, quote: string, value: number, asOf = OLD, source: FxRate["source"] = "ECB"): FxRate => ({ base, quote, rate: value, asOf, source });
const holding = (id: string, currency: string, value: number): Holding =>
  ({
    id,
    accountId: "a1",
    assetName: id,
    assetClass: "equity",
    currency,
    nativeMarketValue: value,
    valuationDate: "2026-10-20",
    valuationSource: { kind: "statement", asOf: "2026-10-20", confidence: "high" },
    quoteType: "manual",
    priceFreshness: "manual",
    dataQuality: [],
    advisorVerification: "advisor_approved",
    sourceTrace: { sourceType: "manual" },
    createdAt: OLD,
    updatedAt: OLD,
  }) as unknown as Holding;
const ACCOUNTS = [{ id: "a1", name: "A1", type: "brokerage", baseCurrency: "USD", createdAt: OLD, updatedAt: OLD } as Account];
const ws = (holdings: Holding[], fxRates: FxRate[], reportingCurrency = "USD") => ({ holdings, accounts: ACCOUNTS, recommendations: [], fxRates, reportingCurrency });
const state = (input: ReturnType<typeof ws>, c: FxConfirmation | null, now: Date) => fxFreshness({ ...input, confirmation: c, now }).confirmation.state;

afterEach(() => vi.useRealTimers());

describe("a confirmation covers the whole rates-in-use context", () => {
  it("the cross-rate reproduction: changing the current USD/EUR leg invalidates it", () => {
    const before = ws([holding("chf", "CHF", 1_000)], [rate("CHF", "USD", 1.2, OLD), rate("USD", "EUR", 0.9, FRESH)], "EUR");
    const c = confirmStaleRates({ ...before, now: NOW })!;
    expect(c.pairs).toEqual(["CHF/USD"]); // only the stale leg needs confirming…
    expect(normalizeHoldings(before.holdings, before.fxRates, "EUR")[0].reportingMarketValue).toBeCloseTo(1_080, 9);
    const after = ws(before.holdings, [rate("CHF", "USD", 1.2, OLD), rate("USD", "EUR", 0.8, "2026-10-22T00:00:00Z")], "EUR");
    expect(normalizeHoldings(after.holdings, after.fxRates, "EUR")[0].reportingMarketValue).toBeCloseTo(960, 9);
    // …but it was given for the whole calculation, which has changed.
    expect(state(before, c, NOW)).toBe("valid");
    expect(state(after, c, NOW)).toBe("changed");
  });

  it("a current direct leg used alongside a stale one", () => {
    const before = ws([holding("eur", "EUR", 1_000), holding("gbp", "GBP", 1_000)], [rate("EUR", "USD", 1.1, OLD), rate("GBP", "USD", 1.3, FRESH)]);
    const c = confirmStaleRates({ ...before, now: NOW })!;
    expect(state(ws(before.holdings, [rate("EUR", "USD", 1.1, OLD), rate("GBP", "USD", 1.31, FRESH)]), c, NOW)).toBe("changed");
  });

  it("a current inverse leg used alongside a stale one", () => {
    const before = ws([holding("eur", "EUR", 1_000), holding("gbp", "GBP", 1_000)], [rate("EUR", "USD", 1.1, OLD), rate("USD", "GBP", 0.77, FRESH)]);
    const c = confirmStaleRates({ ...before, now: NOW })!;
    expect(state(ws(before.holdings, [rate("EUR", "USD", 1.1, OLD), rate("USD", "GBP", 0.78, FRESH)]), c, NOW)).toBe("changed");
  });

  it("a current leg turning stale later isn't covered by the earlier confirmation", () => {
    // GBP/USD is 7 days old at NOW (current) and 8 days old a day later.
    const input = ws([holding("eur", "EUR", 1_000), holding("gbp", "GBP", 1_000)], [rate("EUR", "USD", 1.1, OLD), rate("GBP", "USD", 1.3, "2026-10-15T00:00:00Z")]);
    const c = confirmStaleRates({ ...input, now: NOW })!;
    expect(c.pairs).toEqual(["EUR/USD"]);
    expect(state(input, c, NOW)).toBe("valid");
    expect(state(input, c, new Date(NOW.getTime() + DAY))).toBe("changed");
  });

  it("a new use of a current leg invalidates it; an unused rate changing doesn't", () => {
    const rates = [rate("EUR", "USD", 1.1, OLD), rate("GBP", "USD", 1.3, FRESH), rate("JPY", "USD", 0.0064, OLD)];
    const before = ws([holding("eur", "EUR", 1_000), holding("gbp", "GBP", 1_000)], rates);
    const c = confirmStaleRates({ ...before, now: NOW })!;
    expect(state(ws([...before.holdings, holding("gbp2", "GBP", 5)], rates), c, NOW)).toBe("changed");
    expect(state(ws(before.holdings, [rates[0], rates[1], rate("JPY", "USD", 0.007, FRESH)]), c, NOW)).toBe("valid");
  });
});

describe("browser status follows the clock", () => {
  it("the next boundary is the next UTC midnight or an earlier deadline", () => {
    const t = Date.parse("2026-10-22T15:30:00Z");
    expect(nextFxBoundary(t, [])).toBe(Date.parse("2026-10-23T00:00:00Z"));
    expect(nextFxBoundary(t, [Date.parse("2026-10-22T18:00:00Z"), t - 1])).toBe(Date.parse("2026-10-22T18:00:00Z"));
  });

  // A clock with an injected environment, as the browser hooks use it.
  const fakeEnv = (start: number) => {
    let now = start;
    let pending: { at: number; fn: () => void; id: number } | null = null;
    let ids = 0;
    return {
      env: {
        now: () => now,
        setTimeout: (fn: () => void, ms: number) => ((pending = { at: now + ms, fn, id: ++ids }), ids),
        clearTimeout: (id: number) => {
          if (pending?.id === id) pending = null;
        },
      },
      advanceTo(t: number) {
        now = t;
        while (pending && pending.at <= now) {
          const p = pending;
          pending = null;
          p.fn();
        }
      },
      pending: () => pending,
    };
  };

  it("a confirmation expires on screen without any workspace change", () => {
    const input = ws([holding("eur", "EUR", 1_000)], [rate("EUR", "USD", 1.1, OLD)]);
    const c = confirmStaleRates({ ...input, now: NOW })!;
    const f = fakeEnv(NOW.getTime() + 6 * DAY);
    const clock = createFxClock(f.env);
    const seen: number[] = [];
    const unsubscribe = clock.subscribe(() => seen.push(clock.getSnapshot()));
    clock.setDeadline("confirmation", Date.parse(c.expiresAt));
    expect(state(input, c, new Date(clock.getSnapshot()))).toBe("valid");
    f.advanceTo(Date.parse(c.expiresAt) - 1);
    expect(state(input, c, new Date(clock.getSnapshot()))).toBe("valid");
    f.advanceTo(Date.parse(c.expiresAt) + 5);
    expect(seen.length).toBeGreaterThan(0);
    expect(state(input, c, new Date(clock.getSnapshot()))).toBe("expired");
    // The server, asked at the same instant, agrees.
    const server = evaluateWorkspaceReadiness({ client: SEED_CLIENT, advisor: SEED_ADVISOR, ...input, disclosures: DISCLOSURE_LIBRARY, sourceDocuments: [], fxConfirmation: c, now: new Date(clock.getSnapshot()) });
    expect(server.find((x) => x.code === "fx_current")!.passed).toBe(false);
    unsubscribe();
    expect(f.pending()).toBeNull(); // no timer left behind
  });

  it("a rate turns stale at the day-7/day-8 UTC midnight", () => {
    const input = ws([holding("eur", "EUR", 1_000)], [rate("EUR", "USD", 1.1, "2026-10-15T00:00:00Z")]);
    const f = fakeEnv(Date.parse("2026-10-22T23:59:59Z"));
    const clock = createFxClock(f.env);
    const unsubscribe = clock.subscribe(() => undefined);
    expect(fxFreshness({ ...input, now: new Date(clock.getSnapshot()) })).toMatchObject({ current: true });
    f.advanceTo(Date.parse("2026-10-23T00:00:00.500Z"));
    expect(fxFreshness({ ...input, now: new Date(clock.getSnapshot()) })).toMatchObject({ current: false });
    unsubscribe();
  });

  it("returning to the page refreshes the time at once", () => {
    const f = fakeEnv(NOW.getTime());
    const clock = createFxClock(f.env);
    let calls = 0;
    const unsubscribe = clock.subscribe(() => calls++);
    f.advanceTo(NOW.getTime() + 3 * 3_600_000); // no boundary crossed
    expect(clock.getSnapshot()).toBe(NOW.getTime());
    clock.refresh();
    expect(clock.getSnapshot()).toBe(NOW.getTime() + 3 * 3_600_000);
    expect(calls).toBe(1);
    unsubscribe();
  });

  it("a deadline already passed in real time, but not by the snapshot, ticks at once", () => {
    const f = fakeEnv(NOW.getTime());
    const clock = createFxClock(f.env);
    const unsubscribe = clock.subscribe(() => undefined);
    f.advanceTo(NOW.getTime() + 10 * 60_000); // 12:10, no boundary crossed
    clock.setDeadline("d", NOW.getTime() + 5 * 60_000); // 12:05: behind real time, ahead of the snapshot
    f.advanceTo(NOW.getTime() + 10 * 60_000 + 1);
    expect(clock.getSnapshot()).toBe(NOW.getTime() + 10 * 60_000 + 1);
    unsubscribe();
    expect(f.pending()).toBeNull();
  });
});

describe("confirming on a page that has been open a while (shared clock)", () => {
  afterEach(() => vi.useRealTimers());

  it("the panel's confirm action is valid at once in the panel, notices and readiness", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    vi.setSystemTime(NOW); // 12:00
    const { useAtlasStore } = await import("@/store/useStore");
    const { fxClock } = await import("@/engines/fxClock");
    const { fxDeadline } = await import("@/engines/fxPolicy");
    const input = ws([holding("eur", "EUR", 1_000)], [rate("EUR", "USD", 1.1, OLD)]);
    const saved = useAtlasStore.getState();
    onTestFinished(() => {
      useAtlasStore.setState(saved, true); // restore the store for other tests
    });
    useAtlasStore.setState({
      holdings: input.holdings,
      accounts: ACCOUNTS,
      recommendations: [],
      fxRates: input.fxRates,
      fxConfirmation: null,
      client: { ...useAtlasStore.getState().client, proposalOutputCurrency: "USD" },
    });
    // What useFxFreshness / FxNotice / useWorkspaceReadiness compute, at the shared clock.
    const view = () => {
      const s = useAtlasStore.getState();
      const now = new Date(fxClock.getSnapshot());
      const f = fxFreshness({ holdings: s.holdings, accounts: s.accounts, recommendations: s.recommendations, fxRates: s.fxRates, reportingCurrency: s.client.proposalOutputCurrency, confirmation: s.fxConfirmation, now });
      const readiness = evaluateWorkspaceReadiness({ client: s.client, advisor: s.advisor, accounts: s.accounts, holdings: s.holdings, recommendations: s.recommendations, disclosures: s.disclosures, fxRates: s.fxRates, sourceDocuments: s.sourceDocuments, fxConfirmation: s.fxConfirmation, now });
      return { f, panel: f.confirmation.state, notice: !f.current, ready: readiness.find((c) => c.code === "fx_current")!.passed };
    };
    let notified = 0;
    const unsubscribe = fxClock.subscribe(() => notified++); // the page mounts at 12:00
    onTestFinished(() => {
      // Even if an assertion fails: no subscription or deadline outlives the test.
      fxClock.setDeadline("test", null);
      unsubscribe();
    });
    expect(view()).toMatchObject({ panel: "none", notice: true, ready: false });

    vi.setSystemTime(new Date(NOW.getTime() + 10 * 60_000)); // 12:10: no boundary, event or edit
    useAtlasStore.getState().confirmFxRates();
    expect(view()).toMatchObject({ panel: "valid", notice: false, ready: true });
    expect(useAtlasStore.getState().fxConfirmation!.confirmedAt).toBe("2026-10-22T12:10:00.000Z");
    expect(notified).toBe(1); // the clock caught up once; no loop

    // Withdraw, and confirm again later.
    useAtlasStore.getState().setFxConfirmation(null);
    expect(view()).toMatchObject({ panel: "none", notice: true, ready: false });
    vi.setSystemTime(new Date(NOW.getTime() + 25 * 60_000));
    useAtlasStore.getState().confirmFxRates();
    expect(view()).toMatchObject({ panel: "valid", notice: false, ready: true });

    // It still expires exactly on time with no workspace change (the hook registers this deadline).
    const deadline = fxDeadline(view().f)!;
    expect(deadline).toBe(Date.parse("2026-10-29T12:25:00.000Z"));
    fxClock.setDeadline("test", deadline);
    vi.advanceTimersByTime(deadline - Date.now() - 1);
    expect(view().panel).toBe("valid");
    vi.advanceTimersByTime(2);
    expect(view()).toMatchObject({ panel: "expired", notice: true, ready: false });

    fxClock.setDeadline("test", null);
    unsubscribe();
    expect(vi.getTimerCount()).toBe(0); // no timer left behind
  });
});

describe("confirmation time semantics", () => {
  const input = ws([holding("eur", "EUR", 1_000)], [rate("EUR", "USD", 1.1, OLD)]);
  const c = () => confirmStaleRates({ ...input, now: NOW })!;
  const after = (days: number) => new Date(NOW.getTime() + days * DAY);

  it("an invalid or far-future expiresAt doesn't extend the policy lifetime", () => {
    expect(state(input, { ...c(), expiresAt: "not a date" }, after(8))).not.toBe("valid");
    expect(state(input, { ...c(), expiresAt: "2099-01-01T00:00:00.000Z" }, after(8))).not.toBe("valid");
    // Inconsistent with confirmedAt + 7 days, so not valid even before then.
    expect(state(input, { ...c(), expiresAt: "2099-01-01T00:00:00.000Z" }, after(1))).toBe("invalid");
  });

  it("rejects non-finite and future confirmation times; allows small clock skew", () => {
    expect(state(input, { ...c(), confirmedAt: "garbage" }, NOW)).toBe("invalid");
    const future = confirmStaleRates({ ...input, now: after(1) })!;
    expect(state(input, future, NOW)).toBe("invalid");
    const slightlyAhead = confirmStaleRates({ ...input, now: new Date(NOW.getTime() + CLOCK_SKEW_MS - 1) })!;
    expect(state(input, slightlyAhead, NOW)).toBe("valid");
    const tooFarAhead = confirmStaleRates({ ...input, now: new Date(NOW.getTime() + CLOCK_SKEW_MS + 1) })!;
    expect(state(input, tooFarAhead, NOW)).toBe("invalid");
  });

  it(`keeps the exact ${FX_CONFIRMATION_DAYS}-day boundary`, () => {
    expect(state(input, c(), new Date(NOW.getTime() + FX_CONFIRMATION_DAYS * DAY - 1))).toBe("valid");
    expect(state(input, c(), new Date(NOW.getTime() + FX_CONFIRMATION_DAYS * DAY))).toBe("expired");
  });

  it("the final-PDF route rejects them, and the missing-data gates still apply", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    chromium.reset();
    const { POST } = await import("@/app/api/proposals/[id]/generate-pdf/route");
    const post = async (fxConfirmation: FxConfirmation, holdings = input.holdings, sourceDocuments: SourceDocument[] = []) => {
      const body = { state: { client: SEED_CLIENT, advisor: SEED_ADVISOR, accounts: ACCOUNTS, holdings, recommendations: [], disclosures: DISCLOSURE_LIBRARY, fxRates: input.fxRates, sourceDocuments, sections: [], proposal: { id: "p1" }, fxConfirmation } };
      const res = await POST(new Request("http://localhost/api/proposals/p1/generate-pdf?variant=final", { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ id: "p1" }) });
      expect(res.status).toBe(422);
      return (await res.json()).failing as string[];
    };
    vi.setSystemTime(after(8));
    expect(await post({ ...c(), expiresAt: "not a date" })).toContain("Exchange rates current");
    expect(await post({ ...c(), expiresAt: "2099-01-01T00:00:00.000Z" })).toContain("Exchange rates current");
    vi.setSystemTime(NOW);
    expect(await post(confirmStaleRates({ ...input, now: after(1) })!)).toContain("Exchange rates current");
    // A valid confirmation clears only this check: an unvalued holding still blocks.
    const unvalued = await post(c(), [...input.holdings, holding("aud", "AUD", 1)]);
    expect(unvalued).toContain("All holdings valued in the reporting currency");
    expect(unvalued).not.toContain("Exchange rates current");
    expect(chromium.launches).toBe(0);
  });
});

describe("refresh summary", () => {
  // Found running the real route against the sample's rates.
  it("a stored identity rate (USD/USD) isn't reported as not returned", () => {
    const { rates, record } = mergeFxRefresh(
      [rate("USD", "USD", 1, OLD), rate("EUR", "USD", 1.1, OLD), rate("CHF", "USD", 1.2, OLD)],
      { ok: true, provider: "P", base: "USD", requested: ["EUR", "CHF"], rates: [rate("USD", "EUR", 0.9, FRESH)] },
      NOW
    );
    expect(record.retained).toEqual(["CHF/USD"]);
    expect(rates.find((r) => r.base === "USD" && r.quote === "USD")).toEqual(rate("USD", "USD", 1, OLD));
  });
});

describe("rate sources are described as they are", () => {
  const render = (fxRates: FxRate[], holdings: Holding[]) =>
    renderToStaticMarkup(
      React.createElement(ProposalPdfTemplate, {
        client: SEED_CLIENT,
        advisor: SEED_ADVISOR,
        accounts: ACCOUNTS,
        holdings,
        recommendations: [],
        sections: DEFAULT_PROPOSAL_SECTIONS,
        disclosures: DISCLOSURE_LIBRARY,
        fxRates,
        proposal: { id: "p" } as never,
        variant: "draft",
        now: NOW.toISOString(),
      })
    )
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ");

  it("mixed sources are named; no blanket ECB claim", () => {
    const text = render([rate("EUR", "USD", 1.1, FRESH, "ECB"), rate("GBP", "USD", 1.3, FRESH, "Manual")], [holding("eur", "EUR", 1), holding("gbp", "GBP", 1)]);
    expect(text).not.toContain("FX rates are ECB reference rates (sourced via Frankfurter where applicable)");
    expect(text).toContain("Reporting currency: USD . Exchange rates used: ECB reference rates and advisor-entered (manual) rates, each listed with its date below.");
    expect(text).toContain("FX conversion uses ECB reference rates and advisor-entered (manual) rates.");
    expect(text).toContain("converted to USD using ECB reference rates and advisor-entered (manual) rates.");
  });

  it("no conversion at all is said plainly", () => {
    const text = render([rate("EUR", "USD", 1.1, FRESH)], [holding("usd", "USD", 1)]);
    expect(text).toContain("Reporting currency: USD . No currency conversion was needed.");
    expect(text).toContain("no currency conversion was needed.");
  });
});
