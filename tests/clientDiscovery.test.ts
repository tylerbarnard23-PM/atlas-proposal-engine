import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// #109 — client discovery through the real store, persistence and backup
// paths. Synthetic data only. (The model-bound brief and stale previews:
// clientBriefContext.test.ts.)

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

const NOW = new Date("2026-11-20T12:00:00Z");
const KEY = "atlas-proposal-engine";
const NAME = "Managed Story Household";

async function load() {
  return {
    ...(await import("@/store/useStore")),
    ...(await import("@/engines/clientDiscovery")),
    ...(await import("@/engines/workspaceBackup")),
    ...(await import("@/data/seedClient")),
    ...(await import("@/domain/disclosureLibrary")),
  };
}
type M = Awaited<ReturnType<typeof load>>;
const store = (m: M) => m.useAtlasStore.getState();
const json = (v: unknown) => JSON.parse(JSON.stringify(v));
const ids = (m: M) => ({ disclosureIds: m.DISCLOSURE_LIBRARY.map((d) => d.id) });

beforeEach(() => {
  vi.resetModules();
  storage.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

/** A complete synthetic brief, entered through the store's actions as the questionnaire does. */
function answerAll(m: M) {
  const s = store(m);
  s.setDiscoveryAnswer("objectives", { primary: "reduce_concentration", secondary: ["preserve_wealth", "fund_spending"] });
  s.setDiscoveryClarification("objectives", "Diversify away from the largest position.");
  s.setDiscoveryAnswer("timeHorizon", { years: 12 });
  s.setDiscoveryAnswer("liquidity", { need: "planned", amount: 250_000, currency: "USD", timing: "within_1_year" });
  s.setDiscoveryAnswer("income", { need: "none" });
  s.setDiscoveryAnswer("lossWillingness", { level: "moderate" });
  s.setDiscoveryAnswer("lossAbility", { level: "moderate" });
  s.setDiscoveryAnswer("taxSensitivity", { level: "high" });
  s.setDiscoveryAnswer("securitiesToRetain", { securities: [] });
  s.setDiscoveryAnswer("restrictedInvestments", { securities: ["Tobacco producers"] });
  s.setDiscoveryAnswer("otherConstraints", { text: "" });
  s.setDiscoveryClarification("liquidity", `Home purchase for ${NAME}; date not fixed.`);
}

describe("#109 client discovery: no invented answers", () => {
  it("a new client, the sample and a migrated v10 workspace have every question Not discussed; legacy levels and defaults are not answers", async () => {
    const m = await load();
    store(m).startNewClient();
    const fresh = m.clientBrief(store(m).client);
    expect(fresh.counts).toEqual({ answered: 0, reviewed: 0, stale: 0, total: 10 });
    expect(fresh.notDiscussed.map((q) => q.label)).toEqual(m.QUESTIONS.map((q) => q.label));
    // the new-client defaults (moderate, 10 years, modest income) are not reported as answers
    const sent = JSON.stringify(m.modelBoundClientBrief(store(m).client));
    expect(sent).not.toMatch(/moderate|10 years|modest/i);

    // The sample's older profile keeps its levels for the PDF; only its restrictions are carried, as unconfirmed.
    const sample = m.clientBrief(m.SEED_CLIENT);
    expect(sample.answers).toEqual([]);
    expect(sample.restrictionsOnFile).toEqual(["BAYN.DE"]);

    // A workspace saved at v10 is upgraded without adding a discovery record.
    const v10 = { client: { ...m.SEED_CLIENT }, snapshots: [], alternatives: [], strategies: [], models: [], workingDraft: { id: "wd", name: "Working draft", scopeAccountIds: null, memberIds: [], targets: {}, inputBasis: null, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() } };
    const migrated = m.migrateAtlasState(json(v10), 10);
    expect("discovery" in migrated.client).toBe(false);
    expect(m.migrateAtlasState(json(migrated), 10)).toEqual(migrated); // idempotent
  });

  it("answering never adopts an older profile text: the sample's objective text and special instructions stay profile fields", async () => {
    const m = await load();
    m.useAtlasStore.setState({ client: { ...m.SEED_CLIENT } });
    store(m).setDiscoveryAnswer("objectives", { primary: "grow_wealth", secondary: [] });
    store(m).setDiscoveryAnswer("otherConstraints", { text: "" });
    const b = m.clientBrief(store(m).client);
    expect(b.answers.find((a) => a.question === "objectives")).toEqual({ question: "objectives", label: "Objectives", status: "recorded", answer: "Primary: Grow wealth" });
    expect(b.answers.find((a) => a.question === "otherConstraints")!.answer).toBe("None");
    expect(store(m).client.investmentObjective).toBe(m.SEED_CLIENT.investmentObjective);
    expect(store(m).client.specialInstructions).toBe(m.SEED_CLIENT.specialInstructions);
    const sent = JSON.stringify(m.modelBoundClientBrief(store(m).client));
    expect(sent).not.toContain(m.SEED_CLIENT.investmentObjective);
    expect(sent).not.toContain(m.SEED_CLIENT.specialInstructions!);
    // the restriction on file is still carried, flagged as unconfirmed, until the advisor records the answer
    expect(m.modelBoundClientBrief(store(m).client).restricted_investments_on_file_not_confirmed).toEqual(["BAYN.DE"]);
  });
});

describe("#109 recording, reviewing and editing answers", () => {
  it("answers are explicit; a review is dated; editing one answer makes only its review stale; Not discussed removes it", async () => {
    const m = await load();
    store(m).startNewClient();
    answerAll(m);
    let b = m.clientBrief(store(m).client);
    expect(b.counts).toMatchObject({ answered: 10, reviewed: 0 });
    expect(b.answers.every((a) => a.status === "recorded")).toBe(true);
    // Existing fields hold the values whose meaning is the same (one source of truth).
    expect(store(m).client).toMatchObject({ timeHorizonYears: 12, taxSensitivity: "high", restrictedSecurities: ["Tobacco producers"] });
    // The older objective text and special instructions are profile fields, never adopted as answers.
    expect(store(m).client.investmentObjective).toBe("");
    expect(store(m).client.specialInstructions).toBeUndefined();
    expect(store(m).client.discovery).toMatchObject({ otherConstraints: "", answers: { objectives: { note: "Diversify away from the largest position." } } });

    store(m).recordDiscoveryReview();
    b = m.clientBrief(store(m).client);
    expect(b.counts).toMatchObject({ answered: 10, reviewed: 10, stale: 0 });
    expect(b.lastReviewedAt).toBe(NOW.toISOString());

    vi.setSystemTime(new Date("2026-11-21T09:00:00Z"));
    store(m).setDiscoveryAnswer("liquidity", { need: "planned", amount: 300_000, currency: "USD", timing: "within_1_year" });
    b = m.clientBrief(store(m).client);
    expect(b.answers.find((a) => a.question === "liquidity")!.status).toBe("review_stale");
    expect(b.counts).toMatchObject({ reviewed: 9, stale: 1 });
    // editing the clarification also changes what was reviewed
    store(m).recordDiscoveryReview();
    store(m).setDiscoveryClarification("liquidity", "Home purchase; date now fixed for June.");
    expect(m.questionStatus(store(m).client, "liquidity")).toBe("review_stale");

    // Not discussed: unknown again, no review; the profile's own field keeps its value for the PDF.
    store(m).setDiscoveryNotDiscussed("timeHorizon");
    expect(m.questionStatus(store(m).client, "timeHorizon")).toBe("not_discussed");
    expect(store(m).client.discovery!.answers.timeHorizon).toMatchObject({ status: "not_discussed" });
    expect(store(m).client.discovery!.answers.timeHorizon!.review).toBeUndefined();
    expect(store(m).client.timeHorizonYears).toBe(12);
    expect(m.modelBoundClientBrief(store(m).client).not_discussed).toContain("Time horizon");
    // a questionnaire-only value is cleared, not hidden
    store(m).setDiscoveryNotDiscussed("liquidity");
    expect(store(m).client.discovery!.liquidity).toBeUndefined();
  });

  it("monetary goals keep their own currency and period; missing parts are reported, never defaulted; nothing becomes a reserve", async () => {
    const m = await load();
    store(m).startNewClient();
    store(m).upsertAccount({ id: "acc_x", name: "Synthetic", type: "brokerage", baseCurrency: "USD", createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() });
    const accountsBefore = json(store(m).accounts);
    store(m).setDiscoveryAnswer("objectives", { primary: "fund_spending", secondary: ["grow_wealth"] });
    store(m).setDiscoveryAnswer("liquidity", { need: "planned", amount: 120_000 });
    store(m).setDiscoveryAnswer("income", { need: "needed", amount: 4_000, currency: "CHF", frequency: "monthly" });
    store(m).setDiscoveryAnswer("lossAbility", { level: "low" });
    const b = m.clientBrief(store(m).client);
    expect(b.answers.find((a) => a.question === "liquidity")!.answer).toBe("Planned withdrawal: [currency not recorded] 120,000, timing not recorded");
    expect(b.answers.find((a) => a.question === "income")!.answer).toBe("Income needed: CHF 4,000 per month");
    expect(b.missingDetails).toEqual(["Planned withdrawal: currency not recorded.", "Planned withdrawal: timing not recorded."]);
    expect(b.conflicts).toEqual(["Growing wealth is a stated priority, but the client's ability to absorb losses is recorded as low."]);
    expect(store(m).client.discovery!.liquidity).toEqual({ need: "planned", amount: 120_000 });
    expect(json(store(m).accounts)).toEqual(accountsBefore); // no funding rule or reserve is created
    expect(m.modelBoundClientBrief(store(m).client).how_to_use).toMatch(/not reserves the engines enforce/);
    // "no need" carries no amount
    store(m).setDiscoveryAnswer("income", { need: "none", amount: 9, currency: "USD" });
    expect(store(m).client.discovery!.income).toEqual({ need: "none" });
  });
});

describe("#109 persistence and backups", () => {
  it("survives a reload; a v11 backup round trip restores it exactly; a v10 file restores without it and can't carry it", async () => {
    let m = await load();
    store(m).startNewClient();
    m.useAtlasStore.setState({ client: { ...store(m).client, fullName: NAME } });
    answerAll(m);
    store(m).recordDiscoveryReview();
    store(m).setAnalysisNote("Focus on the concentration and the home purchase.");
    const before = json(store(m).client);
    expect(JSON.parse(storage.getItem(KEY)!).version).toBe(11);

    vi.resetModules();
    m = await load();
    await m.useAtlasStore.persist.rehydrate();
    expect(json(store(m).client)).toEqual(before);

    const exported = m.exportBackup(store(m), NOW, ids(m));
    if (!exported.ok) throw new Error(exported.errors.join("; "));
    const file = JSON.parse(exported.text);
    expect(file.workspaceVersion).toBe(11);
    expect(file.engagement.client.discovery).toEqual(before.discovery);
    store(m).startNewClient();
    const parsed = m.parseBackup(exported.text, ids(m));
    if (!parsed.ok) throw new Error(parsed.errors.join("; "));
    expect(store(m).restoreWorkspace(m.restoredState(parsed.backup, store(m), { replaceFirm: false }))).toEqual({ ok: true });
    vi.resetModules();
    m = await load();
    await m.useAtlasStore.persist.rehydrate();
    expect(json(store(m).client)).toEqual(before);
    expect(m.clientBrief(store(m).client).counts).toMatchObject({ answered: 10, reviewed: 10 });

    // A v10 file is validated as v10: it can't carry discovery, and restores with every question Not discussed.
    const v10 = { ...file, workspaceVersion: 10, engagement: { ...file.engagement, client: { ...file.engagement.client } } };
    expect(m.parseBackup(JSON.stringify(v10), ids(m))).toMatchObject({ ok: false });
    delete v10.engagement.client.discovery;
    const p10 = m.parseBackup(JSON.stringify(v10), ids(m));
    if (!p10.ok) throw new Error(p10.errors.join("; "));
    expect(p10.backup.workspaceVersion).toBe(11);
    expect(m.clientBrief(p10.backup.engagement.client as never).counts.answered).toBe(0);

    // The export allow-list keeps only known discovery fields, and restore rejects unknown ones.
    const extra = JSON.parse(exported.text);
    extra.engagement.client.discovery.answers.liquidity.inferred = true;
    expect(m.parseBackup(JSON.stringify(extra), ids(m))).toMatchObject({ ok: false });
    store(m).setClient({ discovery: { ...store(m).client.discovery!, unknownField: 1 } as never });
    const again = m.exportBackup(store(m), NOW, ids(m));
    expect(again.ok && JSON.parse(again.text).engagement.client.discovery.unknownField).toBeUndefined();
  });
});
