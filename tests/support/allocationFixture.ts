import type { Recommendation } from "@/domain/types";

// #119 — the design brief's fictional one-account portfolio and two reviewed
// briefs, shared by the allocation-proposal tests. Fictional data only. Each
// test file mocks zustand (tests/support/liveStore) before loading these.

export const NOW = new Date("2026-11-27T12:00:00Z");
export const ACC = "acc_alloc_taxable";
export const EQUITY = "h_alloc_equity_fund";
export const BONDS = "h_alloc_core_bond_fund";
export const CASH = "h_alloc_cash";
const CREATED = "2026-10-01T12:00:00Z";

export async function load() {
  return {
    ...(await import("react-dom/server")),
    ...(await import("@/store/useStore")),
    ...(await import("@/domain/disclosureLibrary")),
    ...(await import("@/engines/normalizationEngine")),
    ...(await import("@/engines/allocationDesk")),
    ...(await import("@/engines/allocationProposal")),
    ...(await import("@/engines/workspaceBackup")),
    ...(await import("@/engines/approvedSnapshot")),
    ...(await import("@/engines/importCompleteness")),
    ...(await import("@/copilot/agent")),
    ...(await import("@/copilot/context")),
    ...(await import("@/copilot/testProvider")),
    ...(await import("@/copilot/routeHandler")),
    ...(await import("@/copilot/tools")),
    ...(await import("@/pdf/templates/ProposalPdfTemplate")),
  };
}
export type M = Awaited<ReturnType<typeof load>>;
export const store = (m: M) => m.useAtlasStore.getState();
type S = ReturnType<typeof store>;

export const holding = (id: string, assetName: string, assetClass: "equity" | "fixed_income" | "cash" | "real_estate", value: number, extra: Record<string, unknown> = {}, accountId = ACC) => ({
  id,
  accountId,
  assetName,
  assetClass,
  assetType: assetClass === "cash" ? "cash" : "etf",
  currency: "USD",
  country: "US",
  nativeMarketValue: value,
  valuationDate: "2026-10-31",
  valuationSource: { kind: "statement", asOf: "2026-10-31", confidence: "high", note: "Fictional allocation-proposal fixture" },
  quoteType: "manual",
  priceFreshness: "manual",
  advisorVerification: "advisor_reviewed",
  liquidity: assetClass === "cash" ? "cash" : "daily",
  dataQuality: [],
  createdAt: CREATED,
  updatedAt: CREATED,
  ...extra,
});
export const account = (id: string, name: string) => ({ id, name, type: "brokerage", baseCurrency: "USD", country: "US", asOf: "2026-10-31", createdAt: CREATED, updatedAt: CREATED });

export type Brief = "cash_and_caution" | "growth";

/** USD 500,000 in one taxable account: equity fund 350,000 (70%), core bond fund 125,000 (25%), cash 25,000 (5%). */
export function portfolio(m: M, brief: Brief, edit?: (s: S) => void, opts: { values?: [number, number, number]; scope?: "chosen" | "all" } = {}) {
  const [e, b, c] = opts.values ?? [350_000, 125_000, 25_000];
  store(m).startNewClient();
  m.useAtlasStore.setState({
    client: { ...store(m).client, fullName: "Fictional Allocation Client", proposalOutputCurrency: "USD" },
    accounts: [account(ACC, "Fictional Taxable Account")] as never,
    holdings: [holding(EQUITY, "Fictional Equity Fund", "equity", e), holding(BONDS, "Fictional Core Bond Fund", "fixed_income", b), holding(CASH, "Cash", "cash", c)] as never,
    recommendations: [],
    fxRates: [],
  });
  store(m).setDraftScope(opts.scope === "all" ? null : [ACC]);
  const s = store(m);
  if (brief === "cash_and_caution") {
    s.setDiscoveryAnswer("objectives", { primary: "preserve_wealth", secondary: [] });
    s.setDiscoveryAnswer("timeHorizon", { years: 10 });
    s.setDiscoveryAnswer("liquidity", { need: "planned", amount: 50_000, currency: "USD", timing: "within_1_year" });
    s.setDiscoveryAnswer("lossWillingness", { level: "moderate" });
    s.setDiscoveryAnswer("lossAbility", { level: "moderate" });
  } else {
    s.setDiscoveryAnswer("objectives", { primary: "grow_wealth", secondary: [] });
    s.setDiscoveryAnswer("timeHorizon", { years: 20 });
    s.setDiscoveryAnswer("liquidity", { need: "none" });
    s.setDiscoveryAnswer("lossWillingness", { level: "high" });
    s.setDiscoveryAnswer("lossAbility", { level: "high" });
  }
  s.setDiscoveryAnswer("income", { need: "none" });
  s.setDiscoveryAnswer("taxSensitivity", { level: "moderate" });
  s.setDiscoveryAnswer("securitiesToRetain", { securities: [] });
  s.setDiscoveryAnswer("restrictedInvestments", { securities: [] });
  s.setDiscoveryAnswer("otherConstraints", { text: "" });
  edit?.(store(m));
  store(m).recordDiscoveryReview();
}

export const snapshotOf = (m: M) => {
  const s = store(m);
  return { ...s, sourceDocuments: s.sourceDocuments.map(m.forReadiness) };
};
export const request = (m: M) => {
  const snapshot = snapshotOf(m);
  return { question: "Prepare allocation proposal", runAs: "test_provider", task: "allocation_proposal", snapshot, context: m.agentContextOf(snapshot) };
};
export type Prepared = import("@/copilot/agent").CopilotResult & { allocation: import("@/copilot/tools").AllocationRunView };
/** Prepare allocation proposal through the real route handler, agent loop and tools, with the labelled test provider. */
export async function prepare(m: M): Promise<Prepared> {
  const res = await m.handleCopilotPost(new Request("http://127.0.0.1:3000/api/copilot", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request(m)) }), { ...m.defaultDeps(), env: { COPILOT_MODE: "test" } } as never);
  const body = await res.json();
  if (res.status !== 200) throw new Error(`${res.status}: ${body.error}`);
  return body as Prepared;
}

/** A controlled stand-in for Claude: it returns the given turns in order through the real agent loop (no provider call). */
export function scripted(m: M, turns: ((prev: unknown) => { tools?: { name: string; input: object }[]; text?: string; stop?: string })[]) {
  let i = 0;
  let n = 0;
  const calls: { tools: { name: string }[] }[] = [];
  return {
    calls,
    beta: {
      messages: {
        async create(params: { tools: { name: string }[]; messages: unknown[] }) {
          calls.push({ tools: params.tools });
          const t = turns[Math.min(i++, turns.length - 1)](params.messages);
          const content = [
            ...(t.text ? [{ type: "text", text: t.text, citations: null }] : []),
            ...(t.tools ?? []).map((x) => ({ type: "tool_use", id: `toolu_scripted_${++n}`, name: x.name, input: x.input })),
          ];
          return { id: `msg_scripted_${n}`, type: "message", role: "assistant", model: m.COPILOT_MODEL, content, stop_reason: t.stop ?? (t.tools?.length ? "tool_use" : "end_turn"), stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } };
        },
      },
    },
  };
}
/** Runs the allocation task through the real agent loop with a scripted client, reported as a live Anthropic run. */
export async function runScripted(m: M, client: ReturnType<typeof scripted>, task: "allocation_proposal" | null = "allocation_proposal") {
  return (await m.runAgent(snapshotOf(m) as never, "Prepare allocation proposal", { client: client as never, mode: "live", provider: "anthropic", now: NOW, ...(task ? { task } : {}) })) as Prepared;
}

export const inputs = (m: M) => {
  const s = store(m);
  return { holdings: m.normalizeHoldings(s.holdings, s.fxRates, "USD"), accounts: s.accounts, recommendations: s.recommendations, draft: s.workingDraft, fx: { reportingCurrency: "USD", rates: s.fxRates }, client: s.client };
};
export const legsOf = (r: { drafts: Recommendation[]; allocation: import("@/copilot/tools").AllocationRunView }, gi: number) => r.drafts.filter((d) => r.allocation.groups[gi].legIds.includes(d.id));
export const row = (rows: import("@/engines/allocationProposal").MixRow[], c: string) => rows.find((x) => x.assetClass === c)!;
export const textOf = (html: string) =>
  html.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ");
