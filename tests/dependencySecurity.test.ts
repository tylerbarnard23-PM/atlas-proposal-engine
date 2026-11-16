import { beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { CopilotRequestSchema, parseCopilotRequest } from "@/copilot/snapshot";

// D5 security and dependency gate (16 November 2026): GHSA-mrhx-c7xc-m3w5.
// Zod before 4.6.6 parsed every element of a collection that was already over
// its size limit, collecting an issue per failing element before reporting the
// limit, so an oversized request could exhaust the server's memory. Fixed
// releases refuse an over-limit collection at once. These checks pin that
// behaviour at Atlas's own public entry point, and the resolved versions.
// Synthetic, structural inputs only; nothing is sent anywhere.

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

const validRequest = () => ({
  question: "Which position is most concentrated in this scope? (synthetic)",
  snapshot: {
    client: {},
    advisor: {},
    accounts: [],
    holdings: [],
    fxRates: [],
    recommendations: [],
    disclosures: [],
    workingDraft: { id: "draft_working", name: "Working draft", memberIds: [], scopeAccountIds: null },
  },
  context: { clientId: "cli_x", alternativeId: "draft_working", alternativeName: "Working draft", scopeAccountIds: null, inputRevision: "0000000000000000" },
});

describe("an oversized collection in a Copilot request is refused at once (GHSA-mrhx-c7xc-m3w5)", () => {
  it("the request shape itself is accepted, so the refusals below are about size alone", () => {
    expect(CopilotRequestSchema.safeParse(validRequest()).success).toBe(true);
  });

  it("50,000 invalid holdings against a 1,000 limit give one size issue, not one per element", () => {
    const body = validRequest();
    (body.snapshot as Record<string, unknown>).holdings = Array.from({ length: 50_000 }, () => 0);
    const parsed = CopilotRequestSchema.safeParse(body);
    expect(parsed.success).toBe(false);
    const issues = parsed.success ? [] : parsed.error.issues;
    // Before the fix this was 50,001 issues: every element, then the limit.
    expect(issues.length).toBeLessThanOrEqual(3);
    expect(issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "too_big", path: ["snapshot", "holdings"] })]));
    // The route's own parser refuses it with a readable reason.
    expect(parseCopilotRequest(body)).toMatchObject({ ok: false });
  });

  it("an oversized context scope list is refused the same way", () => {
    const body = validRequest();
    body.context.scopeAccountIds = Array.from({ length: 20_000 }, () => 7) as unknown as null;
    const parsed = CopilotRequestSchema.safeParse(body);
    expect(parsed.success).toBe(false);
    expect(parsed.success ? 0 : parsed.error.issues.length).toBeLessThanOrEqual(3);
  });
});

describe("the resolved Zod is a patched release", () => {
  // Every installed copy, so a nested older copy can't hide behind a patched top-level one.
  const copies = (dir: string, depth = 0): { at: string; version: string }[] => {
    if (depth > 6 || !existsSync(dir)) return [];
    const found: { at: string; version: string }[] = [];
    for (const name of readdirSync(dir)) {
      if (name.startsWith(".")) continue;
      const pkgDir = join(dir, name);
      if (name.startsWith("@")) {
        for (const sub of readdirSync(pkgDir)) found.push(...copies(join(pkgDir, sub, "node_modules"), depth + 1));
        continue;
      }
      if (name === "zod" && existsSync(join(pkgDir, "package.json"))) found.push({ at: pkgDir, version: JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8")).version });
      found.push(...copies(join(pkgDir, "node_modules"), depth + 1));
    }
    return found;
  };
  const atLeast = (v: string, min: number[]) => {
    const parts = v.split(/[.-]/).slice(0, 3).map(Number);
    for (let i = 0; i < 3; i++) if (parts[i] !== min[i]) return parts[i] > min[i];
    return true;
  };

  it("every installed copy of zod is 4.6.6 or later", () => {
    const all = copies(join(process.cwd(), "node_modules"));
    expect(all.length).toBeGreaterThan(0);
    expect(all.filter((c) => !atLeast(c.version, [4, 6, 6]))).toEqual([]);
  });
});

// Zod 4 changed two things the backup relies on. These pin Atlas's behaviour,
// not Zod's: a target map names only some asset classes, and the export
// allowlist keeps only the fields a schema names, through refinements too.
describe("the backup keeps its contracts on Zod 4", () => {
  const NOW = new Date("2026-11-16T12:00:00Z");
  beforeEach(() => {
    vi.resetModules();
    storage.clear();
  });

  async function storyBackup() {
    const { useAtlasStore } = await import("@/store/useStore");
    const { STORY_ACCOUNTS, STORY_HOLDINGS } = await import("@/data/allocationStory");
    const { DISCLOSURE_LIBRARY } = await import("@/domain/disclosureLibrary");
    const backup = await import("@/engines/workspaceBackup");
    const st = () => useAtlasStore.getState();
    st().startNewClient();
    useAtlasStore.setState({ client: { ...st().client, fullName: "Zod Pin Household (synthetic)", proposalOutputCurrency: "USD" }, accounts: STORY_ACCOUNTS, holdings: STORY_HOLDINGS, recommendations: [] });
    st().setDraftScope(["acc_story_invest"]);
    // Targets for two of the many asset classes: a partial map, as the desk writes it.
    st().setDraftTarget("equity", 50);
    st().setDraftTarget("fixed_income", 40);
    const opts = { disclosureIds: DISCLOSURE_LIBRARY.map((d) => d.id) };
    return { backup, opts, state: st() };
  }

  it("a target map naming only some asset classes exports and restores unchanged", async () => {
    const { backup, opts, state } = await storyBackup();
    // Zod 4's z.record(enum, …) requires every key; Atlas means any subset.
    const out = backup.exportBackup(state as never, NOW, opts);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.backup.engagement.workingDraft.targets).toEqual({ equity: 50, fixed_income: 40 });
    const back = backup.parseBackup(out.text, opts);
    expect(back.ok && back.backup.engagement.workingDraft.targets).toEqual({ equity: 50, fixed_income: 40 });
  });

  it("a target for an asset class Atlas doesn't know is still refused", async () => {
    const { backup, opts, state } = await storyBackup();
    const out = backup.exportBackup(state as never, NOW, opts);
    if (!out.ok) throw new Error(out.errors.join("; "));
    const raw = JSON.parse(out.text);
    raw.engagement.workingDraft.targets = { equity: 50, not_an_asset_class: 10 };
    const back = backup.parseBackup(JSON.stringify(raw), opts);
    expect(back.ok).toBe(false);
  });

  it("the export allowlist drops fields no schema names, inside arrays, objects and refined fields", async () => {
    const { backup, opts, state } = await storyBackup();
    const holdings = (state.holdings as unknown as Record<string, unknown>[]).map((h, i) => ({ ...h, injectedSecret: "drop-me", valuationSource: { ...(h.valuationSource as object), nestedExtra: i } }));
    const client = { ...(state.client as unknown as Record<string, unknown>), injectedSecret: "drop-me" };
    const out = backup.exportBackup({ ...state, holdings, client } as never, NOW, opts);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.text).not.toContain("injectedSecret");
    expect(out.text).not.toContain("nestedExtra");
    // Named fields survive, including refined ones such as dates.
    expect(out.backup.engagement.holdings[0].valuationDate).toBe("2026-09-30");
    expect(out.backup.engagement.holdings.map((h) => h.nativeMarketValue)).toEqual([60_000, 30_000, 10_000, 400_000]);
  });
});
