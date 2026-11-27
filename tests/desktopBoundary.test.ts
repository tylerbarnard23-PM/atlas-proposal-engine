import { afterEach, describe, expect, it, vi } from "vitest";

// The desktop build never reaches for an installed browser: loading puppeteer at all is a failure here.
vi.mock("puppeteer-core", () => {
  throw new Error("puppeteer-core must not be loaded by the desktop application's PDF route");
});
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { childEnvironment, isAppUrl, parseFlags, safeNextPath } from "../desktop/shared/policy";
import { copilotMode, handleCopilotGet, handleCopilotPost, handleLocalPair } from "@/copilot/routeHandler";
import { issuePairingToken } from "@/copilot/localPairing";
import { desktopPdfRenderer } from "@/pdf/desktopRenderer";
import { localDeps } from "./support/localDeps";
import { copilotRequest } from "./support/copilotRequest";
import { newWorkingDraft } from "@/engines/allocationDesk";
import { STORY_ACCOUNTS, STORY_HOLDINGS } from "@/data/allocationStory";
import { SEED_ADVISOR, SEED_CLIENT } from "@/data/seedClient";
import { DISCLOSURE_LIBRARY } from "@/domain/disclosureLibrary";

const snap = () => ({
  client: { ...SEED_CLIENT, id: "cli_desktop", fullName: "Desktop Test Household", proposalOutputCurrency: "USD" },
  advisor: SEED_ADVISOR,
  accounts: STORY_ACCOUNTS,
  holdings: STORY_HOLDINGS,
  fxRates: [],
  recommendations: [],
  disclosures: DISCLOSURE_LIBRARY,
  sourceDocuments: [],
  fxConfirmation: null,
  workingDraft: { ...newWorkingDraft("2026-11-24T12:00:00.000Z"), scopeAccountIds: ["acc_story_invest"] },
  alternatives: [],
});

// #116: the desktop application's boundary. The local service gets only an
// allow-listed environment; pages may reach only the app's own origin; pairing
// redirects only to a plain in-app path; and the retired hosted mode is gone.

const root = join(__dirname, "..");

describe("launch flags and the local service's environment", () => {
  it("reads only the Stratovell flags, and only absolute data folders and usable ports", () => {
    expect(parseFlags(["Stratovell.exe", "--stratovell-data-dir=C:\\data\\s", "--stratovell-test-provider", "--stratovell-port=3999"])).toEqual({ dataDir: "C:\\data\\s", testProvider: true, port: 3999 });
    expect(parseFlags(["x", "--stratovell-data-dir=relative\\dir", "--stratovell-port=80"])).toEqual({ dataDir: null, testProvider: false, port: null });
  });

  it("inherits nothing from the launching environment but what the OS needs: no keys, base URLs, hosting or database settings", () => {
    const env = childEnvironment(
      {
        PATH: "C:\\Windows",
        SystemRoot: "C:\\Windows",
        APPDATA: "C:\\Users\\a\\AppData\\Roaming",
        ANTHROPIC_API_KEY: "sk-ant-api03-made-up",
        ANTHROPIC_BASE_URL: "http://127.0.0.1:9/elsewhere",
        COPILOT_MODE: "hosted",
        COPILOT_LIVE_PROVIDER: "fake",
        VERCEL: "1",
        VERCEL_ENV: "production",
        DATABASE_URL: "postgres://x",
        GITHUB_CLIENT_SECRET: "made-up",
        STRATOVELL_CREDENTIAL_KEYS: "k1:made-up",
        NODE_OPTIONS: "--require evil.js",
      },
      { port: 47613, host: "127.0.0.1", localStateDir: "C:\\state", testProvider: false }
    );
    expect(env).toEqual({
      PATH: "C:\\Windows",
      SystemRoot: "C:\\Windows",
      APPDATA: "C:\\Users\\a\\AppData\\Roaming",
      NODE_ENV: "production",
      PORT: "47613",
      HOSTNAME: "127.0.0.1",
      NEXT_TELEMETRY_DISABLED: "1",
      COPILOT_MODE: "live",
      ATLAS_LOCAL_DIR: "C:\\state",
      STRATOVELL_DESKTOP: "1",
    });
    // The labelled test provider only when the app was started with its flag.
    expect(childEnvironment({}, { port: 1, host: "127.0.0.1", localStateDir: "s", testProvider: true }).COPILOT_LIVE_PROVIDER).toBe("fake");
  });
});

describe("what counts as the app's own pages", () => {
  it("same scheme, host and port only", () => {
    const o = "http://127.0.0.1:47613";
    expect(isAppUrl("http://127.0.0.1:47613/settings#backup", o)).toBe(true);
    expect(isAppUrl("http://127.0.0.1:47614/settings", o)).toBe(false);
    expect(isAppUrl("http://localhost:47613/", o)).toBe(false);
    expect(isAppUrl("https://127.0.0.1:47613/", o)).toBe(false);
    expect(isAppUrl("https://evil.example/", o)).toBe(false);
    expect(isAppUrl("not a url", o)).toBe(false);
  });
});

describe("pairing redirects only within the app", () => {
  let dir: string;
  afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

  it("accepts a plain in-app path and sends anything else to Stratovell AI", () => {
    expect(safeNextPath("/welcome")).toBe("/welcome");
    expect(safeNextPath("/")).toBe("/");
    for (const bad of ["//evil.example", "https://evil.example", "/welcome?x=1", "/a/b", "/../x", "/%2F%2Fevil", "", null, undefined]) expect(safeNextPath(bad as string)).toBe("/copilot");
  });

  it("the pair link honours the allowed path and still pairs exactly as before", async () => {
    dir = mkdtempSync(join(tmpdir(), "stratovell-pair-"));
    const t = localDeps({ dir, client: null as never, env: { COPILOT_MODE: "live" }, now: () => new Date("2026-11-24T12:00:00Z") });
    const open = async (next: string) => {
      const { token } = await issuePairingToken(t.d.pairingFile, new Date("2026-11-24T12:00:00Z"));
      return handleLocalPair(new Request(`http://127.0.0.1:47613/api/copilot/local/pair?token=${token}&next=${encodeURIComponent(next)}`, { headers: { host: "127.0.0.1:47613", "sec-fetch-site": "none" } }), t.d);
    };
    const ok = await open("/welcome");
    expect(ok.status).toBe(303);
    expect(ok.headers.get("location")).toBe("/welcome");
    expect(ok.headers.get("set-cookie")).toMatch(/HttpOnly/);
    expect((await open("https://evil.example/")).headers.get("location")).toBe("/copilot");
  });
});

describe("hosted mode is retired", () => {
  it("COPILOT_MODE=hosted now runs the scripted demo, and Claude is refused there without any provider call", async () => {
    expect(copilotMode({ COPILOT_MODE: "hosted" })).toBe("demo");
    const env = { COPILOT_MODE: "hosted", DATABASE_URL: "postgres://x", GITHUB_CLIENT_ID: "x", GITHUB_CLIENT_SECRET: "x", STRATOVELL_CREDENTIAL_KEYS: "k1:x" };
    const deps = { env, now: () => new Date(), sessionFile: "x", pairingFile: "x", connectionFile: "x", secrets: {} as never, makeClient: () => { throw new Error("no provider may be created"); } } as never;
    const get = await handleCopilotGet(new Request("http://site.example/api/copilot", { headers: { cookie: "__Host-stratovell_auth=made-up" } }), deps);
    const body = await get.json();
    expect(body).toEqual({ mode: "demo", model: null });
    const post = await handleCopilotPost(new Request("http://site.example/api/copilot", { method: "POST", headers: { "content-type": "application/json", cookie: "__Host-stratovell_auth=made-up" }, body: JSON.stringify({ ...copilotRequest("Which position is largest? (synthetic)", snap()), runAs: "claude" }) }), deps);
    expect(post.status).toBe(409);
    expect((await post.json()).code).toBe("run_mode_mismatch");
  });

  it("its sign-in, key and session routes and server modules no longer exist", () => {
    for (const p of ["src/app/api/auth", "src/app/api/copilot/hosted", "src/server/hosted", "src/components/copilot/HostedConnection.tsx", "scripts/hosted-migrate.mjs"]) expect(existsSync(join(root, p))).toBe(false);
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    expect(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })).not.toEqual(expect.arrayContaining(["pg"]));
  });
});

describe("the desktop PDF printer", () => {
  afterEach(() => {
    delete (globalThis as { __stratovellRenderPdf?: unknown }).__stratovellRenderPdf;
    vi.resetModules();
  });

  it("exists only in the desktop application's local service", () => {
    const f = async () => new Uint8Array([37, 80, 68, 70]);
    (globalThis as { __stratovellRenderPdf?: unknown }).__stratovellRenderPdf = f;
    expect(desktopPdfRenderer({})).toBeNull();
    expect(desktopPdfRenderer({ STRATOVELL_DESKTOP: "1" })).toBe(f);
    delete (globalThis as { __stratovellRenderPdf?: unknown }).__stratovellRenderPdf;
    expect(desktopPdfRenderer({ STRATOVELL_DESKTOP: "1" })).toBeNull();
  });
});

describe("the final-PDF route in the desktop application", () => {
  const post = async () => {
    const { SEED_ACCOUNTS } = await import("@/data/seedAccounts");
    const { SEED_HOLDINGS } = await import("@/data/seedHoldings");
    const { SEED_FX_RATES } = await import("@/data/seedFxRates");
    const { POST } = await import("@/app/api/proposals/[id]/generate-pdf/route");
    const state = { client: SEED_CLIENT, advisor: SEED_ADVISOR, accounts: SEED_ACCOUNTS, holdings: SEED_HOLDINGS, recommendations: [], disclosures: DISCLOSURE_LIBRARY, fxRates: SEED_FX_RATES, sourceDocuments: [], sections: [], proposal: { id: "p1" } };
    return POST(new Request("http://127.0.0.1:47613/api/proposals/p1/generate-pdf?variant=draft", { method: "POST", body: JSON.stringify({ state }) }), { params: Promise.resolve({ id: "p1" }) });
  };
  afterEach(() => {
    delete process.env.STRATOVELL_DESKTOP;
    delete (globalThis as { __stratovellRenderPdf?: unknown }).__stratovellRenderPdf;
  });

  it("prints the same gated HTML with the application's own printer", async () => {
    process.env.STRATOVELL_DESKTOP = "1";
    const printed: string[] = [];
    (globalThis as { __stratovellRenderPdf?: unknown }).__stratovellRenderPdf = async (html: string) => (printed.push(html), new Uint8Array([37, 80, 68, 70, 45]));
    const res = await post();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([37, 80, 68, 70, 45]));
    expect(printed).toHaveLength(1);
    expect(printed[0]).toContain("SAMPLE generated by Stratovell");
  });

  it("says so plainly when the printer isn't there, and never falls back to an installed browser", async () => {
    process.env.STRATOVELL_DESKTOP = "1";
    const res = await post();
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/PDF printer isn't available/);
  });
});
