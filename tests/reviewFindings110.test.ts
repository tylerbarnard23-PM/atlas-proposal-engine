import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import type { Account, ClientProfile, Holding, WorkingDraft } from "@/domain/types";
import { COPILOT_MODEL, runAgent, type MessagesClient } from "@/copilot/agent";
import type { CopilotSnapshot } from "@/copilot/snapshot";
import { newWorkingDraft } from "@/engines/allocationDesk";
import { STORY_ACCOUNTS, STORY_HOLDINGS } from "@/data/allocationStory";
import { SEED_ADVISOR, SEED_CLIENT } from "@/data/seedClient";
import { DISCLOSURE_LIBRARY } from "@/domain/disclosureLibrary";
import { clientBrief, questionStatus, recordAnswer, recordReview } from "@/engines/clientDiscovery";
import { evaluateHoldingQuality } from "@/engines/dataQualityEngine";
import { normalizeHoldings } from "@/engines/normalizationEngine";
import { generateInsights } from "@/engines/insightEngine";
import { numberFieldEdit } from "@/components/profile/DiscoveryQuestionnaire";

// PR #110 review findings (Codex, at c9a4ac6), reproduced through the real
// agent loop, figure checker, quality engine and the questionnaire's own
// number-field handler. Synthetic data only; no provider call.

type Params = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
const NOW = new Date("2026-11-21T12:00:00Z");
const T = NOW.toISOString();

function snapshot(client: ClientProfile): CopilotSnapshot & { workingDraft: WorkingDraft } {
  const accounts: Account[] = STORY_ACCOUNTS;
  return {
    client,
    advisor: SEED_ADVISOR,
    accounts,
    holdings: STORY_HOLDINGS,
    fxRates: [],
    recommendations: [],
    disclosures: DISCLOSURE_LIBRARY,
    sourceDocuments: [],
    fxConfirmation: null,
    workingDraft: { ...newWorkingDraft(T), scopeAccountIds: ["acc_story_invest"] },
    alternatives: [],
  } as CopilotSnapshot & { workingDraft: WorkingDraft };
}

/** One overview call, then the answer `write` builds from that tool result. */
async function ask(client: ClientProfile, write: (overview: Record<string, unknown>) => string) {
  let n = 0;
  const msg = (content: unknown[], stop: string) => ({ id: `m${++n}`, type: "message", role: "assistant", model: COPILOT_MODEL, content, stop_reason: stop, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } });
  const fake: MessagesClient = {
    beta: {
      messages: {
        async create(params: Params) {
          if (n === 0) return msg([{ type: "tool_use", id: "t1", name: "get_portfolio_overview", input: {} }], "tool_use") as never;
          const last = params.messages[params.messages.length - 1];
          const block = (last.content as { type: string; content?: string }[]).find((b) => b.type === "tool_result")!;
          return msg([{ type: "text", text: write(JSON.parse(block.content as string)), citations: null }], "end_turn") as never;
        },
      },
    },
  };
  return runAgent(snapshot(client), "Review this portfolio.", { client: fake, mode: "live", provider: "anthropic", now: NOW, sleep: async () => {} });
}

const base: ClientProfile = { ...SEED_CLIENT, id: "cli_review", proposalOutputCurrency: "USD", restrictedSecurities: [] };

describe("finding 1: discovery text is never calculation evidence", () => {
  const typed = recordAnswer(base, "otherConstraints", { text: "Keep USD 987,654,321.23 aside for the family trust." }, T);
  for (const [label, client] of [
    ["unreviewed", typed],
    ["reviewed", recordReview(typed, T)],
  ] as const) {
    it(`a figure typed in Other constraints (${label}) doesn't support an answer calling it calculated cash`, async () => {
      expect(questionStatus(client, "otherConstraints")).toBe(label === "reviewed" ? "reviewed" : "recorded");
      const r = await ask(client, () => "Calculated cash is USD 987,654,321.23.");
      expect(r.figures.matched).toBe(0);
      expect(r.figures.unsupported).toContain("USD 987,654,321.23");
    });
  }

  it("a client-stated amount in the brief is reported as restating the brief, never as matched engine evidence", async () => {
    const client = recordReview(recordAnswer(base, "liquidity", { need: "planned", amount: 150_000, currency: "USD", timing: "within_1_year" }, T), T);
    const r = await ask(client, () => "Calculated cash is USD 150,000.");
    expect(r.figures.matched).toBe(0);
    expect(r.figures.clientStated).toEqual(["USD 150,000"]);
    expect(r.figures.unsupported).toEqual([]);
  });

  it("engine figures in the same tool result still match", async () => {
    const client = recordAnswer(base, "liquidity", { need: "planned", amount: 150_000, currency: "USD", timing: "within_1_year" }, T);
    const r = await ask(client, (o) => {
      const gross = (o.net_worth as { gross_assets: number }).gross_assets;
      return `Gross assets are USD ${gross.toLocaleString("en-US")}.`;
    });
    expect(r.figures.claims).toBe(1);
    expect(r.figures.matched).toBe(1);
    expect(r.figures.clientStated).toEqual([]);
  });
});

const fund = (over: Partial<Holding>): Holding => ({
  id: "h_fi_fund",
  accountId: "acc",
  assetName: "Synthetic Aggregate Bond Fund",
  assetClass: "fixed_income",
  currency: "USD",
  quantity: 100,
  price: 100,
  nativeMarketValue: 100,
  valuationDate: T.slice(0, 10),
  valuationSource: { kind: "statement", asOf: T.slice(0, 10), confidence: "high" },
  identifier: { type: "ticker", value: "SYNB" },
  liquidity: "daily",
  costBasis: 1,
  dataQuality: [],
  advisorVerification: "advisor_approved",
  createdAt: T,
  updatedAt: T,
  ...over,
});
const mismatch = (h: Holding) => evaluateHoldingQuality(h).some((i) => i.code === "QUANTITY_VALUE_MISMATCH");

describe("finding 2: per-100 pricing needs bond evidence, not the fixed-income class alone", () => {
  it("a fixed-income ETF or mutual fund is priced per unit: quantity 100 × price 100 against a value of 100 warns", () => {
    expect(mismatch(fund({ assetType: "etf" }))).toBe(true);
    expect(mismatch(fund({ assetType: "mutual_fund" }))).toBe(true);
    // with no instrument type, a ticker means per unit too
    expect(mismatch(fund({ assetType: undefined }))).toBe(true);
    const ins = generateInsights({ holdings: normalizeHoldings([fund({ assetType: "etf" })], [], "USD"), reportingCurrency: "USD" }).filter((i) => /Quantity × price/.test(i.title));
    expect(ins).toHaveLength(1);
  });

  it("bonds priced per 100 stay accepted: a bond type, or imported fixed income identified by a CUSIP or ISIN", () => {
    const bond = fund({ assetName: "Synthetic Muni 4% 2031", quantity: 250_000, price: 100.42, nativeMarketValue: 251_050 });
    expect(mismatch({ ...bond, assetType: "municipal_bond" })).toBe(false);
    expect(mismatch({ ...bond, assetType: undefined, identifier: { type: "cusip", value: "000000AA0" } })).toBe(false); // as the import records it
    expect(mismatch({ ...bond, assetType: undefined, identifier: { type: "isin", value: "US0000000AA0" } })).toBe(false);
    // a fund type with a CUSIP is still a fund
    expect(mismatch({ ...bond, assetType: "mutual_fund", identifier: { type: "cusip", value: "000000AA0" } })).toBe(true);
    // genuine mismatches on bonds still warn
    expect(mismatch({ ...bond, assetType: "municipal_bond", nativeMarketValue: 200_000 })).toBe(true);
  });
});

describe("finding 3: an invalid number edit never leaves an older answer standing", () => {
  it("the field's handler: valid, empty, invalid text and negative values", () => {
    expect(numberFieldEdit("150,000")).toEqual({ kind: "valid", value: 150000 });
    expect(numberFieldEdit("12.5")).toEqual({ kind: "valid", value: 12.5 });
    expect(numberFieldEdit("12.")).toEqual({ kind: "valid", value: 12 });
    expect(numberFieldEdit("")).toEqual({ kind: "empty" });
    expect(numberFieldEdit("  ")).toEqual({ kind: "empty" });
    expect(numberFieldEdit("-100000")).toMatchObject({ kind: "invalid", error: expect.stringMatching(/0 or more/) });
    expect(numberFieldEdit("abc")).toMatchObject({ kind: "invalid", error: expect.stringMatching(/number/) });
    expect(numberFieldEdit("1e9")).toMatchObject({ kind: "invalid" });
  });

  it("an invalid amount over a reviewed 100,000 removes the stored amount, so the brief and the review can't show it as current", () => {
    let c = recordReview(recordAnswer(base, "liquidity", { need: "planned", amount: 100_000, currency: "USD", timing: "within_1_year" }, T), T);
    expect(questionStatus(c, "liquidity")).toBe("reviewed");
    // what the amount field records for each edit (the component calls this with the field's value)
    const edit = (text: string) => {
      const e = numberFieldEdit(text);
      const amount = e.kind === "valid" ? e.value : undefined;
      c = recordAnswer(c, "liquidity", { ...c.discovery!.liquidity!, amount }, T);
      return e;
    };
    expect(edit("-100000").kind).toBe("invalid");
    expect(c.discovery!.liquidity!.amount).toBeUndefined();
    expect(questionStatus(c, "liquidity")).toBe("review_stale");
    expect(clientBrief(c).missingDetails).toContain("Planned withdrawal: amount not recorded.");
    expect(edit("abc").kind).toBe("invalid");
    expect(c.discovery!.liquidity!.amount).toBeUndefined();
    expect(edit("120000").kind).toBe("valid");
    expect(c.discovery!.liquidity!.amount).toBe(120000);
    expect(questionStatus(c, "liquidity")).toBe("review_stale"); // a corrected value needs a new review
  });
});
