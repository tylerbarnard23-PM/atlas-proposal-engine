import { afterEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Account, Holding, Recommendation } from "@/domain/types";
import { calendarDay, formatCalendarDate, formatDateTime, formatTimestampDate, localCalendarDay } from "@/utils/formatting";
import { fxAgeDays, utcDate } from "@/engines/fxAge";
import { ValuationSourceLine } from "@/components/ui/SourceTag";
import { ProposalPdfTemplate } from "@/pdf/templates/ProposalPdfTemplate";
import { DEFAULT_PROPOSAL_SECTIONS } from "@/engines/proposalEngine";
import { SEED_ADVISOR, SEED_CLIENT } from "@/data/seedClient";
import { DISCLOSURE_LIBRARY } from "@/domain/disclosureLibrary";
import { chromium } from "./support/fakeChromium";

// Issue #28: calendar dates (valuation, statement and rate dates) name a day,
// not an instant, so they show the same day in every time zone, in the app
// and in the server-rendered PDF. Real timestamps keep their instant and are
// shown in the viewer's (or the stated) time zone.

vi.mock("puppeteer-core", async () => (await import("./support/fakeChromium")).puppeteerModule);
vi.mock("@/pdf/chromiumPath", async () => (await import("./support/fakeChromium")).chromiumPathModule);

const WEST = "America/New_York";
const ZONES = ["UTC", WEST, "America/Los_Angeles", "Asia/Tokyo", "Pacific/Auckland"];
const ORIGINAL_TZ = process.env.TZ;
function inZone<T>(tz: string, fn: () => T): T {
  process.env.TZ = tz;
  try {
    return fn();
  } finally {
    process.env.TZ = ORIGINAL_TZ;
  }
}
afterEach(() => {
  process.env.TZ = ORIGINAL_TZ;
  vi.useRealTimers();
});

describe("calendar dates show the same day everywhere", () => {
  const cases: [string, string][] = [
    ["2026-04-30", "Apr 30, 2026"],
    ["2026-04-30T00:00:00Z", "Apr 30, 2026"], // legacy calendar date stored as UTC midnight
    ["2026-04-30T00:00:00.000Z", "Apr 30, 2026"],
    ["2026-03-08", "Mar 8, 2026"], // US daylight saving starts
    ["2026-11-01T00:00:00Z", "Nov 1, 2026"], // US daylight saving ends
    ["2026-03-29", "Mar 29, 2026"], // European summer time starts
    ["2026-01-01", "Jan 1, 2026"], // year boundary
    ["2026-01-01T00:00:00Z", "Jan 1, 2026"],
    ["2025-12-31", "Dec 31, 2025"],
  ];
  for (const tz of ZONES) {
    it(`in ${tz}`, () => {
      inZone(tz, () => {
        for (const [value, shown] of cases) expect(formatCalendarDate(value), `${value} in ${tz}`).toBe(shown);
      });
    });
  }

  it("the calendar day of a stored value, and what isn't a date", () => {
    expect(calendarDay("2026-04-30")).toBe("2026-04-30");
    expect(calendarDay("2026-04-30T00:00:00Z")).toBe("2026-04-30");
    expect(calendarDay("2026-02-30")).toBeNull();
    expect(calendarDay("not a date")).toBeNull();
    expect(formatCalendarDate(undefined)).toBe("—");
    expect(formatCalendarDate("not a date")).toBe("not a date");
    expect(formatCalendarDate("2026-04-30", { month: "long" })).toBe("April 30, 2026");
  });

  it("the valuation source line in the app", () => {
    for (const tz of ZONES) {
      const html = inZone(tz, () => renderToStaticMarkup(React.createElement(ValuationSourceLine, { source: { kind: "statement", asOf: "2026-04-30T00:00:00Z" } })));
      expect(html, tz).toContain("Statement · Apr 30, 2026");
    }
  });
});

describe("timestamps keep their instant", () => {
  const instant = "2026-04-30T02:30:00Z"; // 22:30 on Apr 29 in New York

  it("are shown in the viewer's zone", () => {
    expect(inZone("UTC", () => formatTimestampDate(instant))).toBe("Apr 30, 2026");
    expect(inZone(WEST, () => formatTimestampDate(instant))).toBe("Apr 29, 2026");
    expect(inZone("Asia/Tokyo", () => formatTimestampDate(instant))).toBe("Apr 30, 2026");
    expect(inZone(WEST, () => formatDateTime(instant))).toBe("Apr 29, 2026, 10:30 PM");
    expect(inZone("UTC", () => formatDateTime(instant))).toBe("Apr 30, 2026, 2:30 AM");
  });

  it("or in a stated zone, whatever the runtime's", () => {
    for (const tz of ZONES) {
      expect(inZone(tz, () => formatTimestampDate(instant, { timeZone: WEST }))).toBe("Apr 29, 2026");
      expect(inZone(tz, () => formatDateTime(instant, { timeZone: "UTC" }))).toBe("Apr 30, 2026, 2:30 AM");
    }
  });

  it("today, as a calendar day for date inputs, is the viewer's day", () => {
    const evening = new Date("2026-04-30T02:30:00Z"); // still Apr 29 in New York
    const morning = new Date("2026-04-29T20:00:00Z"); // already Apr 30 in Tokyo
    expect(inZone(WEST, () => localCalendarDay(evening))).toBe("2026-04-29");
    expect(inZone("Asia/Tokyo", () => localCalendarDay(morning))).toBe("2026-04-30");
    expect(inZone("UTC", () => localCalendarDay(morning))).toBe("2026-04-29");
  });

  it("FX ages and rate dates are unchanged (UTC calendar days, #26)", () => {
    const now = new Date("2026-10-22T12:00:00Z");
    for (const tz of ZONES) {
      inZone(tz, () => {
        expect(fxAgeDays("2026-04-30T00:00:00Z", now)).toBe(175);
        expect(utcDate("2026-04-30T00:00:00Z")).toBe("2026-04-30");
      });
    }
  });
});

describe("the app preview and the server-rendered PDF agree", () => {
  const OLD = "2026-04-30T00:00:00Z";
  const ACCOUNTS = [{ id: "a1", name: "A1", type: "brokerage", baseCurrency: "USD", createdAt: OLD, updatedAt: OLD } as Account];
  const holding = (id: string, valuationDate: string, asOf?: string): Holding =>
    ({
      id,
      accountId: "a1",
      assetName: id,
      assetClass: "equity",
      currency: "USD",
      nativeMarketValue: 1_000,
      valuationDate,
      valuationSource: { kind: "statement", asOf, confidence: "high" },
      quoteType: "manual",
      priceFreshness: "manual",
      dataQuality: [],
      advisorVerification: "advisor_approved",
      sourceTrace: { sourceType: "manual" },
      createdAt: OLD,
      updatedAt: OLD,
    }) as unknown as Holding;
  const holdings = [holding("legacy", "2026-04-30", "2026-04-30T00:00:00Z"), holding("year_start", "2026-01-01")];
  const NOW = "2026-10-23T02:00:00Z"; // Oct 22, 10 PM in New York
  const rec: Recommendation = {
    id: "r1",
    title: "Trim",
    type: "sell",
    currency: "USD",
    rationale: "",
    priority: "medium",
    status: "approved",
    includeInPdf: true,
    approvedByAdvisor: true,
    relatedHoldingId: "legacy",
    actionAmount: 1,
    actionAmountUnit: "amount",
    createdAt: OLD,
    updatedAt: NOW,
  };
  const text = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const render = (timeZone?: string) =>
    text(
      renderToStaticMarkup(
        React.createElement(ProposalPdfTemplate, {
          client: SEED_CLIENT,
          advisor: SEED_ADVISOR,
          accounts: ACCOUNTS,
          holdings,
          recommendations: [rec],
          sections: DEFAULT_PROPOSAL_SECTIONS,
          disclosures: DISCLOSURE_LIBRARY,
          fxRates: [],
          proposal: { id: "p" } as never,
          variant: "draft",
          now: NOW,
          timeZone,
        })
      )
    );

  it("calendar dates match in a browser west of UTC and a UTC server", () => {
    const browser = inZone(WEST, () => render(WEST));
    const server = inZone("UTC", () => render(WEST));
    for (const out of [browser, server]) {
      expect(out).toContain("legacy statement — Apr 30, 2026");
      expect(out).toContain("year_start statement — Jan 1, 2026");
      expect(out).not.toContain("Apr 29, 2026");
      expect(out).not.toContain("Dec 31, 2025");
    }
  });

  it("timestamps are shown in the advisor's zone, on the server too", () => {
    const browser = inZone(WEST, () => render(WEST));
    const server = inZone("UTC", () => render(WEST));
    for (const out of [browser, server]) {
      expect(out).toContain("Prepared October 22, 2026");
      expect(out).toContain("Approved by advisor on 10/22/2026");
    }
    // Without a stated zone the runtime's applies, as before.
    expect(inZone("UTC", () => render())).toContain("Prepared October 23, 2026");
  });

  it("the whole sample proposal reads the same in New York as in UTC", async () => {
    const { SEED_HOLDINGS } = await import("@/data/seedHoldings");
    const { SEED_ACCOUNTS } = await import("@/data/seedAccounts");
    const { SEED_RECOMMENDATIONS } = await import("@/data/seedRecommendations");
    const { SEED_FX_RATES } = await import("@/data/seedFxRates");
    const approved = SEED_RECOMMENDATIONS.map((r) => ({ ...r, approvedByAdvisor: true, includeInPdf: true, status: "approved" as const }));
    // Timestamps in one stated zone, so only calendar dates could differ.
    const sample = () =>
      text(
        renderToStaticMarkup(
          React.createElement(ProposalPdfTemplate, {
            client: SEED_CLIENT, advisor: SEED_ADVISOR, accounts: SEED_ACCOUNTS, holdings: SEED_HOLDINGS, recommendations: approved,
            sections: DEFAULT_PROPOSAL_SECTIONS, disclosures: DISCLOSURE_LIBRARY, fxRates: SEED_FX_RATES,
            proposal: { id: "p" } as never, variant: "draft", now: "2026-10-21T12:00:00Z", timeZone: "UTC",
          })
        )
      );
    const utc = inZone("UTC", sample);
    expect(utc).toContain("Apr 30, 2026"); // the sample's valuation dates are in the document
    expect(inZone(WEST, sample)).toBe(utc);
    expect(inZone("Asia/Tokyo", sample)).toBe(utc);
  });

  it("the PDF route renders in the advisor's zone; an unusable zone falls back", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(NOW));
    chromium.reset();
    const { POST } = await import("@/app/api/proposals/[id]/generate-pdf/route");
    const post = async (timeZone?: unknown) => {
      const state = { client: SEED_CLIENT, advisor: SEED_ADVISOR, accounts: ACCOUNTS, holdings, recommendations: [rec], disclosures: DISCLOSURE_LIBRARY, fxRates: [], sourceDocuments: [], sections: [], proposal: { id: "p1" } };
      const res = await POST(new Request("http://localhost/api/proposals/p1/generate-pdf?variant=draft", { method: "POST", body: JSON.stringify({ state, timeZone }) }), { params: Promise.resolve({ id: "p1" }) });
      expect(res.status).toBe(200);
      return text(chromium.html[chromium.html.length - 1]);
    };
    const advisor = await inZone("UTC", () => post(WEST));
    expect(advisor).toContain("Prepared October 22, 2026");
    expect(advisor).toContain("legacy statement — Apr 30, 2026");
    expect(await inZone("UTC", () => post("Not/AZone"))).toContain("Prepared October 23, 2026");
    expect(await inZone("UTC", () => post(42))).toContain("Prepared October 23, 2026");
  });
});
